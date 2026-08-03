import type { ChromeStorageArea } from './types';
import type { EdgeSyncStorage, StorageChanges } from '../sync/edgeSyncProvider';

type ChromeApi = {
  storage: {
    local: ChromeStorageArea;
    sync: EdgeSyncStorage;
    onChanged: StorageChanges;
  };
};

const chromeApi = (globalThis as typeof globalThis & { chrome: ChromeApi }).chrome;

export const chromeLocalStorage: ChromeStorageArea = {
  get(keys) {
    return chromeApi.storage.local.get(keys);
  },
  set(items) {
    return chromeApi.storage.local.set(items);
  },
  remove(keys) {
    return chromeApi.storage.local.remove(keys);
  },
};

export const chromeSyncStorage: EdgeSyncStorage = {
  get(keys) {
    return chromeApi.storage.sync.get(keys);
  },
  set(items) {
    return chromeApi.storage.sync.set(items);
  },
  remove(keys) {
    return chromeApi.storage.sync.remove(keys);
  },
  getBytesInUse(keys) {
    return chromeApi.storage.sync.getBytesInUse(keys);
  },
};

export const chromeStorageChanges: StorageChanges = chromeApi.storage.onChanged;
