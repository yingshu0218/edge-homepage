import type { ChromeStorageArea } from './types';

type ChromeApi = {
  storage: {
    local: ChromeStorageArea;
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
};
