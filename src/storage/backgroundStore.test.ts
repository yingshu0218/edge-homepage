import { describe, expect, it } from 'vitest';

import type { BackgroundDatabase } from './types';
import { BackgroundStore } from './backgroundStore';

function fakeBackgroundDatabase(): BackgroundDatabase {
  const values = new Map<string, Blob>();

  return {
    async put(_storeName, value, key) {
      const blob = value as Blob;
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
      values.set(key, new Blob([bytes], { type: blob.type }));
    },
    async get(_storeName, key) {
      return values.get(key);
    },
    async delete(_storeName, key) {
      values.delete(key);
    },
    async clear() {
      values.clear();
    },
  };
}

describe('BackgroundStore', () => {
  it('round-trips a custom background blob', async () => {
    const database = fakeBackgroundDatabase();
    const store = new BackgroundStore(async () => database);
    const background = new Blob(['image bytes'], { type: 'image/png' });

    await store.put(background);

    const loaded = await store.get();
    expect(loaded).toBeInstanceOf(Blob);
    expect(loaded?.type).toBe('image/png');
    expect(loaded?.size).toBe(background.size);
    const read = (blob: Blob) => new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(reader.error); reader.readAsArrayBuffer(blob); });
    expect(new Uint8Array(await read(loaded!))).toEqual(new Uint8Array(await read(background)));
    expect(loaded).not.toBe(background);
  });

  it('returns undefined when no custom background exists', async () => {
    const database = fakeBackgroundDatabase();
    const store = new BackgroundStore(async () => database);

    expect(await store.get()).toBeUndefined();
  });

  it('clears the custom background', async () => {
    const database = fakeBackgroundDatabase();
    const store = new BackgroundStore(async () => database);
    await store.put(new Blob(['image bytes']));

    await store.clear();

    expect(await store.get()).toBeUndefined();
  });
});
