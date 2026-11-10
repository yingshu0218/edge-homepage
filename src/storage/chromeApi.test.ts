import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Chrome storage adapters', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a persistent local preview adapter without pretending Edge sync is available', async () => {
    vi.stubGlobal('chrome', undefined);
    const { chromeLocalStorage, isEdgeSyncAvailable } = await import('./chromeApi');

    await chromeLocalStorage.set({ greeting: 'hello', count: 2 });
    expect(await chromeLocalStorage.get('greeting')).toEqual({ greeting: 'hello' });
    await chromeLocalStorage.remove?.('greeting');

    expect(await chromeLocalStorage.get()).toEqual({ count: 2 });
    expect(isEdgeSyncAvailable).toBe(false);
    vi.resetModules();
    const reloaded = await import('./chromeApi');
    expect(await reloaded.chromeLocalStorage.get()).toEqual({ count: 2 });
  });

  it('falls back to memory if browser storage is blocked', async () => {
    vi.stubGlobal('chrome', undefined);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
    const { chromeLocalStorage } = await import('./chromeApi');
    await chromeLocalStorage.set({ kept: true });
    expect(await chromeLocalStorage.get()).toEqual({ kept: true });
  });

  it('uses the real extension storage areas when Edge APIs are present', async () => {
    const local = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
    const sync = {
      get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined),
      getBytesInUse: vi.fn().mockResolvedValue(0),
    };
    const onChanged = { addListener: vi.fn(), removeListener: vi.fn() };
    vi.stubGlobal('chrome', { storage: { local, sync, onChanged } });
    const { chromeLocalStorage, chromeSyncStorage, chromeStorageChanges, isEdgeSyncAvailable } = await import('./chromeApi');
    const listener = vi.fn();

    await chromeLocalStorage.set({ local: true });
    await chromeSyncStorage.set({ remote: true });
    chromeStorageChanges.addListener(listener);

    expect(local.set).toHaveBeenCalledWith({ local: true });
    expect(sync.set).toHaveBeenCalledWith({ remote: true });
    expect(onChanged.addListener).toHaveBeenCalledWith(listener);
    expect(isEdgeSyncAvailable).toBe(true);
  });
});
