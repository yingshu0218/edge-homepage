import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import type { ChromeStorageArea, SnapshotStorage } from './types';

const SNAPSHOT_KEY = 'app:snapshot';

export class SnapshotRepository implements SnapshotStorage {
  constructor(private readonly storage: ChromeStorageArea) {}

  async load(): Promise<AppSnapshot> {
    const stored = (await this.storage.get(SNAPSHOT_KEY))[SNAPSHOT_KEY];
    if (stored === undefined) {
      return createDefaultSnapshot();
    }

    const schemaVersion = (stored as { schemaVersion?: unknown }).schemaVersion;
    if (schemaVersion !== 1) {
      throw new Error(`Unsupported snapshot schema version: ${String(schemaVersion)}`);
    }

    return stored as AppSnapshot;
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    await this.storage.set({ [SNAPSHOT_KEY]: snapshot });
  }
}
