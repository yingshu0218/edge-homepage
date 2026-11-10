import type { ChromeStorageArea } from './types';
import type { EdgeSyncStorage, StorageChanges } from '../sync/edgeSyncProvider';

type ChromeApi = {
  storage?: {
    local: ChromeStorageArea;
    sync: EdgeSyncStorage;
    onChanged: StorageChanges;
  };
};

const PREVIEW_STORAGE_KEY = 'day-start:web-preview-storage';
const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;
let previewMemory: Record<string, unknown> = {};

function readPreviewStorage(): Record<string, unknown> {
  try {
    const stored = globalThis.localStorage?.getItem(PREVIEW_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        previewMemory = parsed as Record<string, unknown>;
      }
    }
  } catch {
    // Some preview environments disable localStorage; memory still keeps the page usable.
  }
  return { ...previewMemory };
}

function writePreviewStorage(values: Record<string, unknown>): void {
  previewMemory = values;
  try { globalThis.localStorage?.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(values)); }
  catch { /* Keep the in-memory preview when localStorage is unavailable. */ }
}

const previewLocalStorage: ChromeStorageArea = {
  async get(keys) {
    const values = readPreviewStorage();
    if (typeof keys === 'string') return keys in values ? { [keys]: values[keys] } : {};
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]));
    return values;
  },
  async set(items) {
    writePreviewStorage({ ...readPreviewStorage(), ...items });
  },
  async remove(keys) {
    const values = readPreviewStorage();
    for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    writePreviewStorage(values);
  },
};

export const isEdgeSyncAvailable = Boolean(chromeApi?.storage?.sync && chromeApi.storage.onChanged);

export const chromeLocalStorage: ChromeStorageArea = chromeApi?.storage?.local ?? previewLocalStorage;

function edgeSyncStorage(): EdgeSyncStorage {
  if (!chromeApi?.storage?.sync) throw new Error('Edge sync storage is unavailable outside the extension.');
  return chromeApi.storage.sync;
}

function edgeStorageChanges(): StorageChanges {
  if (!chromeApi?.storage?.onChanged) throw new Error('Edge storage change events are unavailable outside the extension.');
  return chromeApi.storage.onChanged;
}

export const chromeSyncStorage: EdgeSyncStorage = {
  get(keys) {
    return edgeSyncStorage().get(keys);
  },
  set(items) {
    return edgeSyncStorage().set(items);
  },
  remove(keys) {
    return edgeSyncStorage().remove(keys);
  },
  getBytesInUse(keys) {
    return edgeSyncStorage().getBytesInUse(keys);
  },
};

export const chromeStorageChanges: StorageChanges = {
  addListener(listener) { edgeStorageChanges().addListener(listener); },
  removeListener(listener) { edgeStorageChanges().removeListener(listener); },
};
