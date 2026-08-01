import { describe, expect, it, vi } from 'vitest';

import type { FaviconCache, FaviconCacheEntry } from './faviconCache';
import {
  browserFaviconUrl,
  faviconKey,
  loadBookmarkIcon,
} from './bookmarkIconLoader';

class MemoryFaviconCache implements FaviconCache {
  entries = new Map<string, FaviconCacheEntry>();
  successes = 0;
  failures = 0;

  async load(key: string) { return this.entries.get(key); }
  async saveSuccess(key: string, blob: Blob, fetchedAt: number) {
    this.successes += 1;
    this.entries.set(key, { blob, fetchedAt });
  }
  async saveFailure(key: string, retryAfter: number) {
    this.failures += 1;
    const current = this.entries.get(key);
    this.entries.set(key, { blob: current?.blob, fetchedAt: current?.fetchedAt ?? 0, retryAfter });
  }
  async clear() { this.entries.clear(); }
}

describe('bookmark icon loader', () => {
  it('keys icons by origin so bookmarks on the same site share a cache entry', () => {
    expect(faviconKey('https://github.com/org/repo')).toBe('https://github.com');
    expect(faviconKey('not a url')).toBeUndefined();
  });

  it('constructs the extension favicon URL without website host permissions', () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://test/${path}` } });
    expect(browserFaviconUrl('https://github.com/org/repo')).toBe(
      'chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fgithub.com%2Forg%2Frepo&size=32',
    );
    vi.unstubAllGlobals();
  });

  it('returns a fresh local cache entry without fetching', async () => {
    const now = 1_000_000;
    const cache = new MemoryFaviconCache();
    const blob = new Blob(['cached'], { type: 'image/png' });
    cache.entries.set('https://github.com', { blob, fetchedAt: now });
    const fetchIcon = vi.fn();

    await expect(loadBookmarkIcon('https://github.com/org/repo', { cache, fetchIcon, now: () => now }))
      .resolves.toEqual({ blob, updated: false });
    expect(fetchIcon).not.toHaveBeenCalled();
  });

  it('refreshes stale data once and stores the new icon', async () => {
    const now = 700_000_000;
    const cache = new MemoryFaviconCache();
    const fresh = new Blob(['fresh'], { type: 'image/png' });
    const fetchIcon = vi.fn(async () => fresh);

    const results = await Promise.all([
      loadBookmarkIcon('https://github.com/a', { cache, fetchIcon, now: () => now }),
      loadBookmarkIcon('https://github.com/b', { cache, fetchIcon, now: () => now }),
    ]);

    expect(results).toEqual([{ blob: fresh, updated: true }, { blob: fresh, updated: true }]);
    expect(fetchIcon).toHaveBeenCalledTimes(1);
    expect(cache.successes).toBe(1);
  });

  it('exposes a stale icon immediately while refreshing it', async () => {
    const now = 700_000_000;
    const cache = new MemoryFaviconCache();
    const stale = new Blob(['stale'], { type: 'image/png' });
    const fresh = new Blob(['fresh'], { type: 'image/png' });
    cache.entries.set('https://github.com', { blob: stale, fetchedAt: 1 });
    let resolveFetch!: (blob: Blob) => void;
    const fetchIcon = () => new Promise<Blob>((resolve) => { resolveFetch = resolve; });
    const onCached = vi.fn();

    const result = loadBookmarkIcon('https://github.com/', { cache, fetchIcon, now: () => now, onCached });
    await vi.waitFor(() => expect(onCached).toHaveBeenCalledWith(stale));
    resolveFetch(fresh);

    await expect(result).resolves.toEqual({ blob: fresh, updated: true });
  });

  it('keeps a stale icon and delays retries after a refresh failure', async () => {
    const now = 700_000_000;
    const cache = new MemoryFaviconCache();
    const stale = new Blob(['stale'], { type: 'image/png' });
    cache.entries.set('https://github.com', { blob: stale, fetchedAt: 1 });
    const fetchIcon = vi.fn(async () => { throw new Error('offline'); });

    await expect(loadBookmarkIcon('https://github.com/', { cache, fetchIcon, now: () => now }))
      .resolves.toEqual({ blob: stale, updated: false });
    await loadBookmarkIcon('https://github.com/', { cache, fetchIcon, now: () => now + 1 });

    expect(fetchIcon).toHaveBeenCalledTimes(1);
    expect(cache.failures).toBe(1);
  });
});
