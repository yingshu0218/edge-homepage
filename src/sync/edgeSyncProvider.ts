import type { AppSnapshot, Bookmark, BookmarkGroup } from '../domain/models';
import { SnapshotCorruptionError, validateSnapshot } from '../domain/snapshotValidator';
import type { SyncProvider, SyncResult } from './types';

const ITEM_LIMIT = 8192;
const WARNING_THRESHOLD = 90 * 1024;
const TOTAL_LIMIT = 100 * 1024;
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

function serializedBytes(items: Record<string, unknown>): number {
  const encoder = new TextEncoder();
  return Object.entries(items).reduce((total, [key, value]) => total + encoder.encode(JSON.stringify({ [key]: value })).byteLength, 0);
}

export class EdgeSyncProvider implements SyncProvider {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingSnapshot: AppSnapshot | undefined;
  private waiters: Array<{ resolve: (result: SyncResult) => void; reject: (error: unknown) => void }> = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly debounceMs: number;
  private readonly now: () => number;
  private writesInProgress = 0;
  private readonly deferredListeners = new Set<() => void>();

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
    this.timer = setTimeout(() => { this.enqueuePending(); }, this.debounceMs);
    return promise;
  }

  private enqueuePending(): void {
    this.timer = undefined;
    const snapshot = this.pendingSnapshot!;
    this.pendingSnapshot = undefined;
    const waiters = this.waiters;
    this.waiters = [];
    this.writeQueue = this.writeQueue.then(() => this.flush(snapshot, waiters));
  }

  private async flush(
    snapshot: AppSnapshot,
    waiters: Array<{ resolve: (result: SyncResult) => void; reject: (error: unknown) => void }>,
  ): Promise<void> {
    let completed = false;
    this.writesInProgress += 1;
    try {
      const items = chunks(snapshot);
      validateItems(items);
      const existing = await this.storage.get(null);
      const obsolete = Object.keys(existing).filter((key) => isManagedKey(key) && !(key in items));
      const existingManaged = Object.keys(existing).filter(isManagedKey);
      const [currentBytes, managedBytes] = await Promise.all([
        this.storage.getBytesInUse(null),
        this.storage.getBytesInUse(existingManaged),
      ]);
      const projectedBytes = currentBytes - managedBytes + serializedBytes(items);
      if (projectedBytes > TOTAL_LIMIT) throw new Error(`QUOTA_BYTES: projected ${projectedBytes} bytes exceeds 100 KiB`);
      await this.storage.set(items);
      if (obsolete.length > 0) await this.storage.remove(obsolete);
      completed = true;
      const bytes = await this.storage.getBytesInUse(null);
      const reportedBytes = Math.max(bytes, projectedBytes);
      const result: SyncResult = projectedBytes > WARNING_THRESHOLD || bytes > WARNING_THRESHOLD
        ? { kind: 'warning', bytes: reportedBytes }
        : { kind: 'synced', at: this.now() };
      waiters.forEach(({ resolve }) => resolve(result));
    } catch (error) {
      waiters.forEach(({ reject }) => reject(error));
    } finally {
      this.writesInProgress -= 1;
      if (this.writesInProgress === 0) {
        const listeners = [...this.deferredListeners];
        this.deferredListeners.clear();
        if (completed) listeners.forEach((listener) => listener());
      }
    }
  }

  async pull(): Promise<AppSnapshot | null> {
    const data = await this.storage.get(null);
    const meta = data.meta as { schemaVersion?: number } | undefined;
    const settings = data.settings as AppSnapshot['settings'] | undefined;
    if (!meta && !settings && !Object.keys(data).some(isManagedKey)) return null;
    if (meta?.schemaVersion !== 2 || !settings || typeof meta !== 'object' || meta === null || Object.keys(meta).length !== 1) {
      throw new SnapshotCorruptionError('Edge sync data', 'metadata or settings is missing or invalid');
    }
    const snapshot = {
      schemaVersion: 2,
      settings,
      groups: Object.entries(data).filter(([key]) => key.startsWith('group:')).map(([, value]) => value as BookmarkGroup),
      bookmarks: Object.entries(data).filter(([key]) => key.startsWith('bookmark:')).map(([, value]) => value as Bookmark),
    } as const;
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('group:') && (value as { id?: unknown })?.id !== key.slice(6)) throw new SnapshotCorruptionError('Edge sync data', `record id does not match ${key}`);
      if (key.startsWith('bookmark:') && (value as { id?: unknown })?.id !== key.slice(9)) throw new SnapshotCorruptionError('Edge sync data', `record id does not match ${key}`);
    }
    return validateSnapshot(snapshot, 'Edge sync data');
  }

  subscribe(listener: () => void): () => void {
    const onChanged = (_changes: Record<string, unknown>, areaName: string) => {
      if (areaName !== 'sync') return;
      if (this.writesInProgress > 0) this.deferredListeners.add(listener);
      else listener();
    };
    this.changes.addListener(onChanged);
    return () => {
      this.changes.removeListener(onChanged);
      this.deferredListeners.delete(listener);
    };
  }
}

function mergeRecords<T extends { id: string; updatedAt: number; deletedAt?: number }>(local: T[], remote: T[], now: number): T[] {
  const records = new Map<string, T>();
  for (const record of [...local, ...remote]) {
    const current = records.get(record.id);
    const sameRevisionWinner = record.updatedAt === current?.updatedAt && (record.deletedAt ?? 0) === (current?.deletedAt ?? 0)
      && stableRecord(record) > stableRecord(current);
    if (!current || record.updatedAt > current.updatedAt || (record.updatedAt === current.updatedAt && (record.deletedAt ?? 0) > (current.deletedAt ?? 0)) || sameRevisionWinner) {
      records.set(record.id, record);
    }
  }
  return [...records.values()].filter((record) => !record.deletedAt || now - record.deletedAt <= TOMBSTONE_TTL).sort((a, b) => a.id.localeCompare(b.id));
}

function stableRecord(value: object): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function normalizeActiveOrder<T extends { id: string; order: number; updatedAt: number; deletedAt?: number }>(records: T[]): T[] {
  const active = records.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const orders = new Map(active.map(({ id }, index) => [id, index]));
  const revision = Math.max(0, ...records.map(({ updatedAt }) => updatedAt)) + 1;
  return records.map((record) => orders.has(record.id) && record.order !== orders.get(record.id)
    ? { ...record, order: orders.get(record.id)!, updatedAt: revision } : record).sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeMergedSnapshot(snapshot: AppSnapshot): AppSnapshot {
  const groups = normalizeActiveOrder(snapshot.groups);
  const deletedGroups = new Map(groups.filter(({ deletedAt }) => deletedAt !== undefined).map((group) => [group.id, group]));
  const orphanRevision = Math.max(0, ...snapshot.bookmarks.map(({ updatedAt }) => updatedAt), ...groups.map(({ updatedAt }) => updatedAt)) + 1;
  let bookmarks = snapshot.bookmarks.map((bookmark) => bookmark.deletedAt === undefined && deletedGroups.has(bookmark.groupId)
    ? { ...bookmark, deletedAt: orphanRevision, updatedAt: orphanRevision } : bookmark);
  for (const group of groups) {
    const inGroup = bookmarks.filter(({ groupId }) => groupId === group.id);
    const normalized = new Map(normalizeActiveOrder(inGroup).map((bookmark) => [bookmark.id, bookmark]));
    bookmarks = bookmarks.map((bookmark) => normalized.get(bookmark.id) ?? bookmark);
  }
  return { ...snapshot, groups, bookmarks: bookmarks.sort((a, b) => a.id.localeCompare(b.id)) };
}

export function mergeSnapshots(local: AppSnapshot, remote: AppSnapshot, now = Date.now()): AppSnapshot {
  const settings = remote.settings.updatedAt > local.settings.updatedAt
    || (remote.settings.updatedAt === local.settings.updatedAt && stableRecord(remote.settings) > stableRecord(local.settings))
    ? remote.settings : local.settings;
  const merged = normalizeMergedSnapshot({
    schemaVersion: 2,
    bookmarks: mergeRecords(local.bookmarks, remote.bookmarks, now),
    groups: mergeRecords(local.groups, remote.groups, now),
    settings,
  });
  return validateSnapshot(merged, 'merged snapshot');
}
