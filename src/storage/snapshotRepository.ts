import { createDefaultSnapshot } from '../domain/defaults';
import { mergeLocalUsage } from '../domain/bookmarkUsage';
import type { AppSnapshot } from '../domain/models';
import { migrateSnapshot, validateSnapshot } from '../domain/snapshotValidator';
import type { ChromeStorageArea, SnapshotStorage } from './types';
import { recordBookmarkOpen } from '../features/bookmarks/bookmarkActions';

const SNAPSHOT_KEY = 'app:snapshot';
const USAGE_KEY = 'app:bookmark-usage:v1';
const storageQueues = new WeakMap<ChromeStorageArea, Promise<unknown>>();

export class SnapshotRepository implements SnapshotStorage {
  constructor(private readonly storage: ChromeStorageArea) {}

  async load(): Promise<AppSnapshot> {
    const data = await this.storage.get([SNAPSHOT_KEY, USAGE_KEY]);
    const stored = data[SNAPSHOT_KEY];
    const content = stored === undefined ? createDefaultSnapshot() : migrateSnapshot(stored, 'local snapshot');
    return data[USAGE_KEY] === undefined ? content : validateSnapshot({ ...content, bookmarkUsage: data[USAGE_KEY] }, 'local bookmark usage');
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    const valid = validateSnapshot(snapshot, 'local snapshot');
    await this.exclusive(async () => {
      const current = await this.load();
      await this.write({ ...valid, bookmarkUsage: mergeLocalUsage(valid.bookmarks, current.bookmarkUsage, valid.bookmarkUsage) });
    });
  }

  async replace(snapshot: AppSnapshot): Promise<void> {
    const valid = validateSnapshot(snapshot, 'local snapshot');
    await this.exclusive(() => this.write(valid));
  }

  async recordOpen(id: string, now: number): Promise<AppSnapshot> {
    return this.exclusive(async () => {
      const current = await this.load();
      const next = recordBookmarkOpen(current, id, now);
      // A click cannot write stale bookmark content, even from another open tab.
      if (next !== current) await this.storage.set({ [USAGE_KEY]: next.bookmarkUsage });
      return next;
    });
  }

  private async write(snapshot: AppSnapshot): Promise<void> {
    await this.storage.set({ [SNAPSHOT_KEY]: { ...snapshot, bookmarkUsage: {} }, [USAGE_KEY]: snapshot.bookmarkUsage });
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    // Web Locks serialize extension pages / preview tabs sharing this origin.
    // The queue also works in test environments without the browser lock API.
    const locks = globalThis.navigator?.locks;
    if (locks) return await locks.request('day-start:local-snapshot', operation);
    const next = (storageQueues.get(this.storage) ?? Promise.resolve()).catch(() => undefined).then(operation);
    storageQueues.set(this.storage, next.catch(() => undefined));
    return next;
  }
}
