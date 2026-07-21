import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import { migrateSnapshot, validateSnapshot } from '../domain/snapshotValidator';
import type { ChromeStorageArea, SnapshotStorage } from './types';

const SNAPSHOT_KEY = 'app:snapshot';

export class SnapshotRepository implements SnapshotStorage {
  constructor(private readonly storage: ChromeStorageArea) {}

  async load(): Promise<AppSnapshot> {
    const stored = (await this.storage.get(SNAPSHOT_KEY))[SNAPSHOT_KEY];
    if (stored === undefined) {
      return createDefaultSnapshot();
    }

    return migrateSnapshot(stored, 'local snapshot');
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    await this.storage.set({ [SNAPSHOT_KEY]: validateSnapshot(snapshot, 'local snapshot') });
  }
}
