import { openDB } from 'idb';

import type { BackgroundDatabase, OpenBackgroundDatabase } from './types';

const DATABASE_NAME = 'day-start-assets';
const DATABASE_VERSION = 1;
const STORE_NAME = 'assets';
const BACKGROUND_KEY = 'custom-background';

const openBackgroundDatabase: OpenBackgroundDatabase = async () =>
  openDB(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    },
  }) as Promise<BackgroundDatabase>;

export class BackgroundStore {
  constructor(private readonly openDatabase = openBackgroundDatabase) {}

  async put(blob: Blob): Promise<void> {
    const database = await this.openDatabase();
    await database.put(STORE_NAME, blob, BACKGROUND_KEY);
  }

  async get(): Promise<Blob | undefined> {
    const database = await this.openDatabase();
    return database.get(STORE_NAME, BACKGROUND_KEY);
  }

  async clear(): Promise<void> {
    const database = await this.openDatabase();
    await database.delete(STORE_NAME, BACKGROUND_KEY);
  }
}
