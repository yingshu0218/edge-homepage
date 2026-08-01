import type { AppSnapshot } from '../domain/models';
import type { WeatherForecast } from '../features/weather/types';

export type ChromeStorageArea = {
  get(keys?: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove?(keys: string | string[]): Promise<void>;
};

export interface SnapshotStorage {
  load(): Promise<AppSnapshot>;
  save(snapshot: AppSnapshot): Promise<void>;
}

export interface WeatherCacheStore {
  load(): Promise<WeatherForecast | undefined>;
  save(forecast: WeatherForecast): Promise<void>;
  clear(): Promise<void>;
}

export type AssetDatabase = {
  objectStoreNames?: { contains(name: string): boolean };
  createObjectStore?(name: string): unknown;
  put(storeName: string, value: unknown, key: string): Promise<unknown>;
  get(storeName: string, key: string): Promise<unknown>;
  getAll?(storeName: string): Promise<unknown[]>;
  getAllKeys?(storeName: string): Promise<unknown[]>;
  delete(storeName: string, key: string): Promise<unknown>;
  clear(storeName: string): Promise<unknown>;
};

export type OpenAssetDatabase = () => Promise<AssetDatabase>;
export type BackgroundDatabase = AssetDatabase;
export type OpenBackgroundDatabase = OpenAssetDatabase;
