import { FAVICON_STORE_NAME, openAssetDatabase } from '../../storage/assetDatabase';
import type { OpenAssetDatabase } from '../../storage/types';

export const FAVICON_MAX_AGE = 7 * 24 * 60 * 60 * 1_000;
export const FAVICON_RETRY_DELAY = 24 * 60 * 60 * 1_000;
export const FAVICON_CACHE_LIMIT = 256;

export type FaviconCacheEntry = {
  blob?: Blob;
  fetchedAt: number;
  retryAfter?: number;
};

export interface FaviconCache {
  load(key: string): Promise<FaviconCacheEntry | undefined>;
  saveSuccess(key: string, blob: Blob, fetchedAt: number): Promise<void>;
  saveFailure(key: string, retryAfter: number): Promise<void>;
  clear(): Promise<void>;
}

function parseEntry(value: unknown): FaviconCacheEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const entry = value as Partial<FaviconCacheEntry>;
  if (!Number.isFinite(entry.fetchedAt)
    || (entry.blob !== undefined && !(entry.blob instanceof Blob))
    || (entry.retryAfter !== undefined && !Number.isFinite(entry.retryAfter))) return undefined;
  return entry as FaviconCacheEntry;
}

export class IndexedDbFaviconCache implements FaviconCache {
  constructor(private readonly openDatabase: OpenAssetDatabase = openAssetDatabase) {}

  async load(key: string): Promise<FaviconCacheEntry | undefined> {
    return parseEntry(await (await this.openDatabase()).get(FAVICON_STORE_NAME, key));
  }

  async saveSuccess(key: string, blob: Blob, fetchedAt: number): Promise<void> {
    const database = await this.openDatabase();
    await database.put(FAVICON_STORE_NAME, { blob, fetchedAt }, key);
    if (!database.getAll || !database.getAllKeys) return;
    const [keys, values] = await Promise.all([
      database.getAllKeys(FAVICON_STORE_NAME),
      database.getAll(FAVICON_STORE_NAME),
    ]);
    if (keys.length <= FAVICON_CACHE_LIMIT || keys.length !== values.length) return;
    const entries = keys
      .map((entryKey, index) => ({ key: entryKey, entry: parseEntry(values[index]) }))
      .filter((item): item is { key: string; entry: FaviconCacheEntry } =>
        typeof item.key === 'string' && item.entry !== undefined)
      .sort((left, right) => left.entry.fetchedAt - right.entry.fetchedAt);
    await Promise.all(entries
      .slice(0, Math.max(0, entries.length - FAVICON_CACHE_LIMIT))
      .map((entry) => database.delete(FAVICON_STORE_NAME, entry.key)));
  }

  async saveFailure(key: string, retryAfter: number): Promise<void> {
    const database = await this.openDatabase();
    const current = parseEntry(await database.get(FAVICON_STORE_NAME, key));
    await database.put(FAVICON_STORE_NAME, {
      blob: current?.blob,
      fetchedAt: current?.fetchedAt ?? 0,
      retryAfter,
    } satisfies FaviconCacheEntry, key);
  }

  async clear(): Promise<void> {
    await (await this.openDatabase()).clear(FAVICON_STORE_NAME);
  }
}

export function isFreshFavicon(entry: FaviconCacheEntry, now: number): boolean {
  const age = now - entry.fetchedAt;
  return Boolean(entry.blob) && age >= 0 && age <= FAVICON_MAX_AGE;
}
