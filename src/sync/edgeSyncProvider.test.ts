import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import { EdgeSyncProvider, mergeSnapshots } from './edgeSyncProvider';

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
      meta: { schemaVersion: 1 }, settings: snapshot.settings,
      'group:development': snapshot.groups[0], 'bookmark:github': snapshot.bookmarks[0],
    });
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await expect(provider.pull()).resolves.toMatchObject({ bookmarks: [{ id: 'github' }], groups: [{ id: 'development' }] });
  });

  it('rejects one corrupted chunk instead of returning a partial snapshot', async () => {
    const snapshot = createDefaultSnapshot();
    const sync = fakeSync({
      meta: { schemaVersion: 1 }, settings: snapshot.settings,
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
    const initial: Record<string, unknown> = { meta: { schemaVersion: 1 }, settings: old.settings };
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
    const local = createDefaultSnapshot();
    local.bookmarks[0] = { ...local.bookmarks[0]!, order: 2, updatedAt: 20 };
    const remote = createDefaultSnapshot();
    remote.bookmarks[0] = { ...remote.bookmarks[0]!, order: 0, updatedAt: 10 };
    expect(mergeSnapshots(local, remote).bookmarks.find(({ id }) => id === 'github')).toMatchObject({ order: 2, updatedAt: 20 });
  });
});
