import { describe, expect, it } from 'vitest';

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

  it('migrates an existing schema-1 local snapshot', async () => {
    const storage = fakeChromeStorage();
    const snapshot = createDefaultSnapshot() as unknown as Record<string, unknown>;
    snapshot.schemaVersion = 1;
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
      schemaVersion: 2,
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
