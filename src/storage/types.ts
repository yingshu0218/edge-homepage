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

export type BackgroundDatabase = {
  put(storeName: string, value: Blob, key: string): Promise<unknown>;
  get(storeName: string, key: string): Promise<Blob | undefined>;
  delete(storeName: string, key: string): Promise<unknown>;
};

export type OpenBackgroundDatabase = () => Promise<BackgroundDatabase>;
