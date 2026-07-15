import type { AppSnapshot, Bookmark, BookmarkGroup } from '../domain/models';
import type { SyncProvider, SyncResult } from './types';

const ITEM_LIMIT = 8192;
const WARNING_THRESHOLD = 90 * 1024;
const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000;

export type EdgeSyncStorage = {
  get(keys?: null | string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  getBytesInUse(keys?: null | string | string[]): Promise<number>;
};

export type StorageChanges = {
  addListener(listener: (changes: Record<string, unknown>, areaName: string) => void): void;
  removeListener(listener: (changes: Record<string, unknown>, areaName: string) => void): void;
};

type Options = { debounceMs?: number; now?: () => number };

function isManagedKey(key: string): boolean {
  return key === 'meta' || key === 'settings' || key.startsWith('group:') || key.startsWith('bookmark:');
}

function chunks(snapshot: AppSnapshot): Record<string, unknown> {
  const result: Record<string, unknown> = {
    meta: { schemaVersion: snapshot.schemaVersion },
    settings: snapshot.settings,
  };
  snapshot.groups.forEach((group) => { result[`group:${group.id}`] = group; });
  snapshot.bookmarks.forEach((bookmark) => { result[`bookmark:${bookmark.id}`] = bookmark; });
  return result;
}

function validateItems(items: Record<string, unknown>): void {
  const encoder = new TextEncoder();
  for (const [key, value] of Object.entries(items)) {
    if (encoder.encode(JSON.stringify({ [key]: value })).byteLength > ITEM_LIMIT) {
      throw new Error(`QUOTA_BYTES_PER_ITEM: ${key}`);
    }
  }
}

export class EdgeSyncProvider implements SyncProvider {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingSnapshot: AppSnapshot | undefined;
  private waiters: Array<{ resolve: (result: SyncResult) => void; reject: (error: unknown) => void }> = [];
  private readonly debounceMs: number;
  private readonly now: () => number;

  constructor(
    private readonly storage: EdgeSyncStorage,
    private readonly changes: StorageChanges,
    options: Options = {},
  ) {
    this.debounceMs = options.debounceMs ?? 750;
    this.now = options.now ?? Date.now;
  }

  push(snapshot: AppSnapshot): Promise<SyncResult> {
    this.pendingSnapshot = snapshot;
    if (this.timer !== undefined) clearTimeout(this.timer);
    const promise = new Promise<SyncResult>((resolve, reject) => this.waiters.push({ resolve, reject }));
    this.timer = setTimeout(() => { void this.flush(); }, this.debounceMs);
    return promise;
  }

  private async flush(): Promise<void> {
    this.timer = undefined;
    const snapshot = this.pendingSnapshot!;
    this.pendingSnapshot = undefined;
    const waiters = this.waiters;
    this.waiters = [];
    try {
      const items = chunks(snapshot);
      validateItems(items);
      const existing = await this.storage.get(null);
      const obsolete = Object.keys(existing).filter((key) => isManagedKey(key) && !(key in items));
      if (obsolete.length > 0) await this.storage.remove(obsolete);
      await this.storage.set(items);
      const bytes = await this.storage.getBytesInUse(null);
      const result: SyncResult = bytes > WARNING_THRESHOLD
        ? { kind: 'warning', bytes }
        : { kind: 'synced', at: this.now() };
      waiters.forEach(({ resolve }) => resolve(result));
    } catch (error) {
      waiters.forEach(({ reject }) => reject(error));
    }
  }

  async pull(): Promise<AppSnapshot | null> {
    const data = await this.storage.get(null);
    const meta = data.meta as { schemaVersion?: number } | undefined;
    const settings = data.settings as AppSnapshot['settings'] | undefined;
    if (meta?.schemaVersion !== 1 || !settings) return null;
    return {
      schemaVersion: 1,
      settings,
      groups: Object.entries(data).filter(([key]) => key.startsWith('group:')).map(([, value]) => value as BookmarkGroup),
      bookmarks: Object.entries(data).filter(([key]) => key.startsWith('bookmark:')).map(([, value]) => value as Bookmark),
    };
  }

  subscribe(listener: () => void): () => void {
    const onChanged = (_changes: Record<string, unknown>, areaName: string) => {
      if (areaName === 'sync') listener();
    };
    this.changes.addListener(onChanged);
    return () => this.changes.removeListener(onChanged);
  }
}

function mergeRecords<T extends { id: string; updatedAt: number; deletedAt?: number }>(local: T[], remote: T[], now: number): T[] {
  const records = new Map<string, T>();
  for (const record of [...local, ...remote]) {
    const current = records.get(record.id);
    if (!current || record.updatedAt > current.updatedAt || (record.updatedAt === current.updatedAt && (record.deletedAt ?? 0) > (current.deletedAt ?? 0))) {
      records.set(record.id, record);
    }
  }
  return [...records.values()].filter((record) => !record.deletedAt || now - record.deletedAt <= TOMBSTONE_TTL);
}

export function mergeSnapshots(local: AppSnapshot, remote: AppSnapshot, now = Date.now()): AppSnapshot {
  return {
    schemaVersion: 1,
    bookmarks: mergeRecords(local.bookmarks, remote.bookmarks, now),
    groups: mergeRecords(local.groups, remote.groups, now),
    settings: remote.settings.updatedAt > local.settings.updatedAt ? remote.settings : local.settings,
  };
}
