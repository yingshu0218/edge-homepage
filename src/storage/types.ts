import type { AppSnapshot } from '../domain/models';

export type ChromeStorageArea = {
  get(keys?: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export interface SnapshotStorage {
  load(): Promise<AppSnapshot>;
  save(snapshot: AppSnapshot): Promise<void>;
}

export type BackgroundDatabase = {
  put(storeName: string, value: Blob, key: string): Promise<unknown>;
  get(storeName: string, key: string): Promise<Blob | undefined>;
  delete(storeName: string, key: string): Promise<unknown>;
};

export type OpenBackgroundDatabase = () => Promise<BackgroundDatabase>;
