import { BACKGROUND_STORE_NAME, openAssetDatabase } from './assetDatabase';
import type { OpenAssetDatabase } from './types';

const BACKGROUND_KEY = 'custom-background';

export class BackgroundStore {
  constructor(private readonly openDatabase: OpenAssetDatabase = openAssetDatabase) {}

  async put(blob: Blob): Promise<void> {
    const database = await this.openDatabase();
    await database.put(BACKGROUND_STORE_NAME, blob, BACKGROUND_KEY);
  }

  async get(): Promise<Blob | undefined> {
    const database = await this.openDatabase();
    return database.get(BACKGROUND_STORE_NAME, BACKGROUND_KEY) as Promise<Blob | undefined>;
  }

  async clear(): Promise<void> {
    const database = await this.openDatabase();
    await database.delete(BACKGROUND_STORE_NAME, BACKGROUND_KEY);
  }
}
