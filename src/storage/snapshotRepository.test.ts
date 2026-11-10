import { describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../domain/defaults';
import type { ChromeStorageArea } from './types';
import { SnapshotRepository } from './snapshotRepository';

function fakeChromeStorage(): ChromeStorageArea {
  const values: Record<string, unknown> = {};

  return {
    async get(keys) {
      if (typeof keys === 'string') {
        return keys in values ? { [keys]: values[keys] } : {};
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(
          keys.filter((key) => key in values).map((key) => [key, values[key]]),
        );
      }

      return { ...values };
    },
    async set(items) {
      Object.assign(values, items);
    },
  };
}

describe('SnapshotRepository', () => {
  it('returns defaults when local storage is empty', async () => {
    const repository = new SnapshotRepository(fakeChromeStorage());

    expect(await repository.load()).toEqual(createDefaultSnapshot());
  });

  it('round-trips a snapshot through local storage', async () => {
    const storage = fakeChromeStorage();
    const repository = new SnapshotRepository(storage);
    const snapshot = createDefaultSnapshot();
    snapshot.groups[0].name = '工作';

    await repository.save(snapshot);

    expect((await repository.load()).groups[0].name).toBe('工作');
  });

  it('writes clicks only to the usage key and preserves a content edit from another tab', async () => {
    const storage = fakeChromeStorage();
    const repository = new SnapshotRepository(storage);
    const edited = createDefaultSnapshot();
    edited.bookmarks[0] = { ...edited.bookmarks[0]!, title: 'Edited in another tab', updatedAt: 20 };
    await repository.save(edited);
    const writes = vi.spyOn(storage, 'set');
    const recorded = await new SnapshotRepository(storage).recordOpen('github', 100);
    expect(writes).toHaveBeenCalledExactlyOnceWith({ 'app:bookmark-usage:v1': { github: { totalOpenCount: 1, recentOpenTimestamps: [100] } } });
    expect(recorded.bookmarks[0]).toMatchObject({ title: 'Edited in another tab', updatedAt: 20 });
    expect((await repository.load()).bookmarks).toEqual(edited.bookmarks);
  });

  it('serializes concurrent local opens and keeps their counters when older content is saved', async () => {
    const storage = fakeChromeStorage();
    const first = new SnapshotRepository(storage);
    const second = new SnapshotRepository(storage);
    const stale = createDefaultSnapshot();
    await first.save(stale);
    await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? first : second).recordOpen('github', 100 + index)));
    stale.bookmarks[0]!.title = 'A content edit based on an older view';
    await second.save(stale);
    const loaded = await first.load();
    expect(loaded.bookmarkUsage.github).toEqual({ totalOpenCount: 20, recentOpenTimestamps: Array.from({ length: 20 }, (_, index) => 100 + index) });
    expect(loaded.bookmarks[0]!.title).toBe(stale.bookmarks[0]!.title);
  });

  it('restores exact backup statistics on replacement and clears them on reset', async () => {
    const repository = new SnapshotRepository(fakeChromeStorage());
    await repository.recordOpen('github', 100);
    const backup = createDefaultSnapshot();
    backup.bookmarkUsage.github = { totalOpenCount: 7, recentOpenTimestamps: [10, 20] };
    await repository.replace(backup);
    expect(await repository.load()).toEqual(backup);
    await repository.replace(createDefaultSnapshot());
    expect((await repository.load()).bookmarkUsage).toEqual({});
  });

  it('preserves imported IDs that also exist on Object.prototype', async () => {
    const repository = new SnapshotRepository(fakeChromeStorage());
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks = [{ ...snapshot.bookmarks[0]!, id: 'constructor' }];
    await repository.save(snapshot);
    expect((await repository.load()).bookmarkUsage).toEqual({});
    await repository.recordOpen('constructor', 100);
    expect((await repository.load()).bookmarkUsage.constructor).toEqual({ totalOpenCount: 1, recentOpenTimestamps: [100] });
  });

  it('migrates schema-2 content and detailed usage to separate local fields without losing bookmarks', async () => {
    const storage = fakeChromeStorage();
    const { bookmarkUsage: _usage, ...content } = createDefaultSnapshot();
    const old = { ...content, schemaVersion: 2, bookmarks: content.bookmarks.map((bookmark) => ({ ...bookmark, totalOpenCount: 900, recentOpenTimestamps: Array(600).fill(100) })) };
    await storage.set({ 'app:snapshot': old });
    const repository = new SnapshotRepository(storage);
    const migrated = await repository.load();
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.bookmarks).toEqual(content.bookmarks);
    expect(migrated.bookmarkUsage.github).toEqual({ totalOpenCount: 900, recentOpenTimestamps: Array(600).fill(100) });
    await repository.save(migrated);
    expect(await repository.load()).toEqual(migrated);
  });

  it('migrates an existing schema-1 local snapshot', async () => {
    const storage = fakeChromeStorage();
    const snapshot = createDefaultSnapshot() as unknown as Record<string, unknown>;
    snapshot.schemaVersion = 1;
    delete snapshot.bookmarkUsage;
    const settings = { ...(snapshot.settings as Record<string, unknown>) };
    delete settings.bookmarkDisplayLimit;
    delete settings.clockHour12;
    delete settings.clockShowSeconds;
    delete settings.clockShowFullDate;
    delete settings.temperatureUnit;
    delete settings.weatherLocation;
    snapshot.settings = settings;
    await storage.set({ 'app:snapshot': snapshot });
    const repository = new SnapshotRepository(storage);

    await expect(repository.load()).resolves.toMatchObject({
      schemaVersion: 3,
      settings: {
        bookmarkDisplayLimit: 8,
        clockHour12: false,
        clockShowSeconds: false,
        clockShowFullDate: true,
        temperatureUnit: 'celsius',
      },
    });
  });

  it('rejects snapshots with an unsupported schema version', async () => {
    const storage = fakeChromeStorage();
    await storage.set({ 'app:snapshot': { ...createDefaultSnapshot(), schemaVersion: 99 } });
    const repository = new SnapshotRepository(storage);

    await expect(repository.load()).rejects.toThrow('unsupported schema 99');
  });

  it('fails closed when a supported snapshot contains unsafe nested data', async () => {
    const storage = fakeChromeStorage();
    const damaged = createDefaultSnapshot();
    damaged.bookmarks[0]!.url = 'javascript:alert(1)';
    await storage.set({ 'app:snapshot': damaged });
    await expect(new SnapshotRepository(storage).load()).rejects.toThrow('Corrupted local snapshot');
  });

  it('rejects an invalid save without overwriting the last valid snapshot', async () => {
    const storage = fakeChromeStorage();
    const repository = new SnapshotRepository(storage);
    const valid = createDefaultSnapshot();
    valid.settings.themeId = 'kept';
    await repository.save(valid);
    const invalid = structuredClone(valid);
    invalid.settings.searchTemplate = 'not a URL';
    await expect(repository.save(invalid)).rejects.toThrow('Corrupted local snapshot');
    expect((await repository.load()).settings.themeId).toBe('kept');
    expect((await repository.load()).settings.searchTemplate).toBe(valid.settings.searchTemplate);
  });
});
