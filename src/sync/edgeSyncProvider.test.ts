import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import { EdgeSyncProvider, mergeSnapshots } from './edgeSyncProvider';
import { migrateSnapshot, validateSnapshot } from '../domain/snapshotValidator';
import { SnapshotRepository } from '../storage/snapshotRepository';
import { bookmarkOpenStats, recordBookmarkOpen, reorderBookmarks } from '../features/bookmarks/bookmarkActions';

type ChangeListener = (changes: Record<string, unknown>, areaName: string) => void;

function fakeSync(initial: Record<string, unknown> = {}, notifyWrites = false) {
  const data = { ...initial };
  const listeners = new Set<ChangeListener>();
  return {
    data,
    area: {
      async get() { return { ...data }; },
      async set(items: Record<string, unknown>) {
        Object.assign(data, items);
        if (notifyWrites) listeners.forEach((listener) => listener({}, 'sync'));
      },
      async remove(keys: string[]) {
        keys.forEach((key) => delete data[key]);
        if (notifyWrites) listeners.forEach((listener) => listener({}, 'sync'));
      },
      async getBytesInUse(_keys?: null | string | string[]) { return 0; },
    },
    changes: {
      addListener(listener: ChangeListener) { listeners.add(listener); },
      removeListener(listener: ChangeListener) { listeners.delete(listener); },
    },
    emit(areaName = 'sync') { listeners.forEach((listener) => listener({}, areaName)); },
  };
}

describe('EdgeSyncProvider', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps sync bytes and writes constant after thousands of local opens', async () => {
    const sync = fakeSync();
    const set = vi.spyOn(sync.area, 'set');
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    let snapshot = createDefaultSnapshot();
    await provider.push(snapshot);
    const before = JSON.stringify(sync.data);
    for (let index = 0; index < 2_000; index += 1) snapshot = recordBookmarkOpen(snapshot, 'github', 1_700_000_000_000 + index);
    await provider.push(snapshot);
    expect(snapshot.bookmarkUsage.github.totalOpenCount).toBe(2_000);
    expect(snapshot.bookmarkUsage.github.recentOpenTimestamps).toHaveLength(2_000);
    expect(JSON.stringify(sync.data)).toBe(before);
    expect(set).toHaveBeenCalledTimes(1);
    expect(new TextEncoder().encode(JSON.stringify(sync.data['bookmark:github'])).byteLength).toBeLessThan(512);
    expect(JSON.stringify(sync.data)).not.toMatch(/recentOpenTimestamps|totalOpenCount|bookmarkUsage/);
  });

  it('reads existing Edge statistics once as a local migration seed and writes content only', async () => {
    const original = createDefaultSnapshot();
    const sync = fakeSync({ meta: { schemaVersion: 2 }, settings: original.settings,
      'group:development': original.groups[0],
      'bookmark:github': { ...original.bookmarks[0], totalOpenCount: 12, recentOpenTimestamps: [10, 20] },
    });
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    const remote = (await provider.pull())!;
    const migrated = mergeSnapshots(original, remote, 30);
    expect(migrated.bookmarkUsage.github).toEqual({ totalOpenCount: 12, recentOpenTimestamps: [10, 20] });
    const opened = recordBookmarkOpen(migrated, 'github', 30);
    expect(mergeSnapshots(opened, remote, 30).bookmarkUsage.github.totalOpenCount).toBe(13);
    await provider.push(opened);
    expect(sync.data['bookmark:github']).toEqual(original.bookmarks[0]);
    expect((await provider.pull())!.bookmarkUsage).toEqual({});
  });
  it('chunks snapshots into metadata, settings, groups, and bookmarks', async () => {
    const sync = fakeSync();
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await provider.push(createDefaultSnapshot());
    expect(Object.keys(sync.data).sort()).toEqual([
      'bookmark:github', 'bookmark:mdn', 'bookmark:npm', 'bookmark:stackoverflow',
      'group:development', 'meta', 'settings',
    ]);
  });

  it('rejects a serialized key/value pair larger than 8192 bytes', async () => {
    const sync = fakeSync();
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks[0]!.title = 'x'.repeat(9_000);
    await expect(provider.push(snapshot)).rejects.toThrow('QUOTA_BYTES_PER_ITEM');
  });

  it('warns when total sync usage exceeds 90 KiB', async () => {
    const sync = fakeSync();
    sync.area.getBytesInUse = async () => 91 * 1024;
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await expect(provider.push(createDefaultSnapshot())).resolves.toEqual({ kind: 'warning', bytes: 91 * 1024 });
  });

  it('debounces concurrent pushes and persists only the latest snapshot', async () => {
    vi.useFakeTimers();
    const sync = fakeSync();
    const set = vi.spyOn(sync.area, 'set');
    const provider = new EdgeSyncProvider(sync.area, sync.changes);
    const first = createDefaultSnapshot();
    const latest = structuredClone(first);
    latest.settings.themeId = 'latest';
    const pushes = [provider.push(first), provider.push(latest)];
    await vi.advanceTimersByTimeAsync(750);
    await Promise.all(pushes);
    expect(set).toHaveBeenCalledTimes(1);
    expect((sync.data.settings as AppSnapshot['settings']).themeId).toBe('latest');
  });

  it('serializes slow writes across debounce windows so the latest snapshot wins', async () => {
    vi.useFakeTimers();
    const sync = fakeSync();
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstStarted!: () => void;
    const firstSetStarted = new Promise<void>((resolve) => { firstStarted = resolve; });
    let setCount = 0;
    sync.area.set = async (items: Record<string, unknown>) => {
      setCount += 1;
      if (setCount === 1) {
        firstStarted();
        await firstBlocked;
      }
      Object.assign(sync.data, items);
    };
    const provider = new EdgeSyncProvider(sync.area, sync.changes);
    const first = createDefaultSnapshot();
    first.settings.themeId = 'first';
    const latest = structuredClone(first);
    latest.settings.themeId = 'latest';

    const firstPush = provider.push(first);
    await vi.advanceTimersByTimeAsync(750);
    await firstSetStarted;
    const latestPush = provider.push(latest);
    await vi.advanceTimersByTimeAsync(750);
    releaseFirst();
    await Promise.all([firstPush, latestPush]);

    expect(setCount).toBe(2);
    expect((sync.data.settings as AppSnapshot['settings']).themeId).toBe('latest');
  });

  it('does not delete obsolete remote keys when writing the replacement fails', async () => {
    const oldBookmark = createDefaultSnapshot().bookmarks[0]!;
    const sync = fakeSync({ 'bookmark:old': { ...oldBookmark, id: 'old' } });
    sync.area.set = async () => { throw new Error('write failed'); };
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });

    await expect(provider.push(createDefaultSnapshot())).rejects.toThrow('write failed');

    expect(sync.data['bookmark:old']).toBeDefined();
  });

  it('pulls chunked records into a snapshot', async () => {
    const snapshot = createDefaultSnapshot();
    const sync = fakeSync({
      meta: { schemaVersion: 2 }, settings: snapshot.settings,
      'group:development': snapshot.groups[0], 'bookmark:github': snapshot.bookmarks[0],
    });
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await expect(provider.pull()).resolves.toMatchObject({
      schemaVersion: 3,
      bookmarks: [{ id: 'github' }],
      groups: [{ id: 'development' }],
    });
  });

  it('rejects one corrupted chunk instead of returning a partial snapshot', async () => {
    const snapshot = createDefaultSnapshot();
    const sync = fakeSync({
      meta: { schemaVersion: 2 }, settings: snapshot.settings,
      'group:development': snapshot.groups[0],
      'bookmark:github': { ...snapshot.bookmarks[0], url: 'javascript:alert(1)' },
    });
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await expect(provider.pull()).rejects.toThrow('Corrupted Edge sync data');
  });

  it('rejects a projected replacement over 100 KiB before writing', async () => {
    const sync = fakeSync({ unrelated: 'x'.repeat(10_000) });
    sync.area.getBytesInUse = async (keys) => keys === null ? 110 * 1024 : 10 * 1024;
    const set = vi.spyOn(sync.area, 'set');
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await expect(provider.push(createDefaultSnapshot())).rejects.toThrow('QUOTA_BYTES');
    expect(set).not.toHaveBeenCalled();
  });

  it('rejects a projected replacement over 512 items before writing', async () => {
    const unrelated = Object.fromEntries(Array.from({ length: 510 }, (_, index) => [`unrelated:${index}`, index]));
    const sync = fakeSync(unrelated);
    const set = vi.spyOn(sync.area, 'set');
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });

    await expect(provider.push(createDefaultSnapshot())).rejects.toThrow('MAX_ITEMS');

    expect(set).not.toHaveBeenCalled();
  });

  it('warns from projected usage before writing when replacement crosses 90 KiB', async () => {
    const sync = fakeSync({ unrelated: 'x'.repeat(10_000) });
    sync.area.getBytesInUse = async (keys) => keys === null ? 92 * 1024 : 2 * 1024;
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await expect(provider.push(createDefaultSnapshot())).resolves.toMatchObject({ kind: 'warning' });
  });

  it('subscribes only to sync storage changes', () => {
    const sync = fakeSync();
    const provider = new EdgeSyncProvider(sync.area, sync.changes);
    const listener = vi.fn();
    const unsubscribe = provider.subscribe(listener);
    sync.emit('local');
    sync.emit('sync');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    sync.emit();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies subscribers only after a replacement push has removed obsolete records', async () => {
    const old = createDefaultSnapshot();
    old.bookmarks.push({ ...old.bookmarks[0]!, id: 'obsolete', title: 'Obsolete', order: 4 });
    const initial: Record<string, unknown> = { meta: { schemaVersion: 2 }, settings: old.settings };
    old.groups.forEach((group) => { initial[`group:${group.id}`] = group; });
    old.bookmarks.forEach((bookmark) => { initial[`bookmark:${bookmark.id}`] = bookmark; });
    const sync = fakeSync(initial, true);
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    const observed: string[][] = [];
    provider.subscribe(() => { void provider.pull().then((snapshot) => observed.push(snapshot?.bookmarks.map(({ id }) => id) ?? [])); });

    const replacement = createDefaultSnapshot();
    replacement.bookmarks = [replacement.bookmarks[0]!];
    await provider.push(replacement);
    await vi.waitFor(() => expect(observed).toHaveLength(1));

    expect(observed[0]).toEqual(['github']);
  });

  it('does not deliver a deferred self-notification after unsubscribe', async () => {
    const sync = fakeSync({}, true);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const originalSet = sync.area.set;
    sync.area.set = async (items) => { await originalSet(items); await blocked; };
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    const listener = vi.fn();
    const unsubscribe = provider.subscribe(listener);

    const pushing = provider.push(createDefaultSnapshot());
    await vi.waitFor(() => expect(Object.keys(sync.data).length).toBeGreaterThan(0));
    unsubscribe();
    release();
    await pushing;

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('mergeSnapshots', () => {
  it('preserves newer content edits and local statistics when another device opens a stale bookmark', () => {
    const local = recordBookmarkOpen(createDefaultSnapshot(), 'github', 100);
    const remote = createDefaultSnapshot();
    remote.bookmarks[0] = { ...remote.bookmarks[0]!, title: 'Edited on another device', url: 'https://github.com/new', updatedAt: 20 };
    remote.bookmarkUsage.github = { totalOpenCount: 99, recentOpenTimestamps: [90] };
    const merged = mergeSnapshots(local, remote, 100);
    expect(merged.bookmarks.find(({ id }) => id === 'github')).toMatchObject({ title: 'Edited on another device', updatedAt: 20 });
    expect(bookmarkOpenStats(merged.bookmarkUsage.github, 100)).toEqual({ day: 1, week: 1, month: 1, total: 1 });
  });

  it('keeps legacy local statistics when newer legacy content is merged', () => {
    const { bookmarkUsage: _usage, ...content } = createDefaultSnapshot();
    const legacy = { ...content, schemaVersion: 2, bookmarks: content.bookmarks.map((bookmark) => ({ ...bookmark, totalOpenCount: 7, recentOpenTimestamps: [10] })) };
    const local = migrateSnapshot(legacy, 'local');
    const remote = createDefaultSnapshot();
    remote.bookmarks[0] = { ...remote.bookmarks[0]!, title: 'New content', updatedAt: 20 };
    const merged = mergeSnapshots(local, remote, 30);
    expect(merged.bookmarks.find(({ id }) => id === 'github')!.title).toBe('New content');
    expect(merged.bookmarkUsage.github.totalOpenCount).toBe(7);
  });
  it('merges records by updatedAt and settings by newest timestamp', () => {
    const local = createDefaultSnapshot();
    const remote = structuredClone(local);
    local.bookmarks[0]!.title = 'local'; local.bookmarks[0]!.updatedAt = 5;
    remote.bookmarks[0]!.title = 'remote'; remote.bookmarks[0]!.updatedAt = 4;
    remote.settings.themeId = 'remote'; remote.settings.updatedAt = 6;
    expect(mergeSnapshots(local, remote, 10).bookmarks[0]!.title).toBe('local');
    expect(mergeSnapshots(local, remote, 10).settings.themeId).toBe('remote');
  });

  it('retains recent tombstones and discards tombstones older than 30 days', () => {
    const now = 40 * 86_400_000;
    const local = createDefaultSnapshot();
    local.bookmarks = [
      { ...local.bookmarks[0]!, id: 'recent', deletedAt: now - 29 * 86_400_000 },
      { ...local.bookmarks[0]!, id: 'old', deletedAt: now - 31 * 86_400_000 },
    ];
    const merged = mergeSnapshots(local, { ...createDefaultSnapshot(), bookmarks: [] }, now);
    expect(merged.bookmarks.map(({ id }) => id)).toEqual(['recent']);
  });

  it('keeps a newer local drag order when merging an older remote record', () => {
    const local = reorderBookmarks(createDefaultSnapshot(), 'github', 'stackoverflow', 20);
    const remote = createDefaultSnapshot();
    expect(mergeSnapshots(local, remote).bookmarks.find(({ id }) => id === 'github')).toMatchObject({ order: 2, updatedAt: 20 });
  });

  it('normalizes concurrent same-tail bookmark additions into a valid stable merge', async () => {
    const left = createDefaultSnapshot();
    const right = createDefaultSnapshot();
    left.bookmarks.push({ id: 'zeta', title: 'Zeta', url: 'https://zeta.test/', groupId: 'development', order: 4, createdAt: 10, updatedAt: 10 });
    right.bookmarks.push({ id: 'alpha', title: 'Alpha', url: 'https://alpha.test/', groupId: 'development', order: 4, createdAt: 10, updatedAt: 10 });

    const merged = mergeSnapshots(left, right, 20);
    expect(() => validateSnapshot(merged, 'merged test')).not.toThrow();
    expect(merged.bookmarks.filter(({ deletedAt }) => !deletedAt).sort((a, b) => a.order - b.order).slice(-2).map(({ id }) => id)).toEqual(['alpha', 'zeta']);
    expect(mergeSnapshots(merged, right, 20)).toEqual(merged);
    expect(mergeSnapshots(right, merged, 20)).toEqual(merged);

    const values: Record<string, unknown> = {};
    const repository = new SnapshotRepository({
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key): key is string => typeof key === 'string' && key in values).map((key) => [key, values[key]])); },
      async set(items) { Object.assign(values, items); },
    });
    await repository.save(merged);
    expect(await repository.load()).toEqual(merged);
  });

  it('normalizes concurrent group additions and moves deterministically', () => {
    const left = createDefaultSnapshot();
    left.groups.push({ id: 'zeta-group', name: 'Zeta', order: 1, updatedAt: 10 });
    left.bookmarks = left.bookmarks.map((bookmark) => bookmark.id === 'mdn'
      ? { ...bookmark, groupId: 'zeta-group', order: 0, updatedAt: 10 }
      : bookmark.id === 'stackoverflow' ? { ...bookmark, order: 1 } : bookmark.id === 'npm' ? { ...bookmark, order: 2 } : bookmark);
    const right = createDefaultSnapshot();
    right.groups.push({ id: 'alpha-group', name: 'Alpha', order: 1, updatedAt: 10 });
    right.bookmarks = right.bookmarks.map((bookmark) => bookmark.id === 'npm'
      ? { ...bookmark, groupId: 'alpha-group', order: 0, updatedAt: 10 }
      : bookmark);

    const forward = mergeSnapshots(left, right, 20);
    const reverse = mergeSnapshots(right, left, 20);
    expect(() => validateSnapshot(forward, 'merged test')).not.toThrow();
    expect(reverse).toEqual(forward);
    expect(forward.groups.filter(({ deletedAt }) => !deletedAt).sort((a, b) => a.order - b.order).map(({ id }) => id)).toEqual(['development', 'alpha-group', 'zeta-group']);
    expect(mergeSnapshots(forward, reverse, 20)).toEqual(forward);
  });
});
