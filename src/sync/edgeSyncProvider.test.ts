import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import { EdgeSyncProvider, mergeSnapshots } from './edgeSyncProvider';

type ChangeListener = (changes: Record<string, unknown>, areaName: string) => void;

function fakeSync(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  const listeners = new Set<ChangeListener>();
  return {
    data,
    area: {
      async get() { return { ...data }; },
      async set(items: Record<string, unknown>) { Object.assign(data, items); },
      async remove(keys: string[]) { keys.forEach((key) => delete data[key]); },
      async getBytesInUse() { return 0; },
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

  it('pulls chunked records into a snapshot', async () => {
    const snapshot = createDefaultSnapshot();
    const sync = fakeSync({
      meta: { schemaVersion: 1 }, settings: snapshot.settings,
      'group:development': snapshot.groups[0], 'bookmark:github': snapshot.bookmarks[0],
    });
    const provider = new EdgeSyncProvider(sync.area, sync.changes, { debounceMs: 0 });
    await expect(provider.pull()).resolves.toMatchObject({ bookmarks: [{ id: 'github' }], groups: [{ id: 'development' }] });
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
});
