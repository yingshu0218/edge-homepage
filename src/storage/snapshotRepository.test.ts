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

  it('rejects snapshots with an unsupported schema version', async () => {
    const storage = fakeChromeStorage();
    await storage.set({ 'app:snapshot': { ...createDefaultSnapshot(), schemaVersion: 2 } });
    const repository = new SnapshotRepository(storage);

    await expect(repository.load()).rejects.toThrow('Unsupported snapshot schema version: 2');
  });
});
