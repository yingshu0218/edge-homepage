import { openDB } from 'idb';

import type { AssetDatabase, OpenAssetDatabase } from './types';

export const ASSET_DATABASE_NAME = 'day-start-assets';
export const ASSET_DATABASE_VERSION = 2;
export const BACKGROUND_STORE_NAME = 'assets';
export const FAVICON_STORE_NAME = 'favicons';

export const openAssetDatabase: OpenAssetDatabase = async () =>
  openDB(ASSET_DATABASE_NAME, ASSET_DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(BACKGROUND_STORE_NAME)) {
        database.createObjectStore(BACKGROUND_STORE_NAME);
      }
      if (!database.objectStoreNames.contains(FAVICON_STORE_NAME)) {
        database.createObjectStore(FAVICON_STORE_NAME);
      }
    },
  }) as Promise<AssetDatabase>;
