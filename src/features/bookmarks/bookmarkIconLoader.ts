import {
  FAVICON_RETRY_DELAY,
  IndexedDbFaviconCache,
  isFreshFavicon,
  type FaviconCache,
} from './faviconCache';

export type BookmarkIconResult = { blob?: Blob; updated: boolean };
export type FetchBookmarkIcon = (pageUrl: string) => Promise<Blob>;

const inflight = new Map<string, Promise<BookmarkIconResult>>();
export const faviconCache = new IndexedDbFaviconCache();

export function faviconKey(url: string): string | undefined {
  try { return new URL(url).origin; }
  catch { return undefined; }
}

export function browserFaviconUrl(pageUrl: string, size = 32): string | undefined {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL) return undefined;
  const url = new URL(runtime.getURL('_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', String(size));
  return url.toString();
}

export const fetchBrowserFavicon: FetchBookmarkIcon = async (pageUrl) => {
  const source = browserFaviconUrl(pageUrl);
  if (!source) throw new Error('Browser favicon API is unavailable');
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Favicon request failed: ${response.status}`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/') || blob.size === 0) throw new Error('Invalid favicon response');
  return blob;
};

export async function loadBookmarkIcon(
  pageUrl: string,
  options: {
    cache?: FaviconCache;
    fetchIcon?: FetchBookmarkIcon;
    now?: () => number;
    onCached?: (blob: Blob) => void;
  } = {},
): Promise<BookmarkIconResult> {
  const key = faviconKey(pageUrl);
  if (!key) return { updated: false };
  if (!options.cache && typeof globalThis.indexedDB === 'undefined') return { updated: false };
  const cache = options.cache ?? faviconCache;
  const fetchIcon = options.fetchIcon ?? fetchBrowserFavicon;
  const now = options.now ?? Date.now;
  let cached;
  try { cached = await cache.load(key); }
  catch { return { updated: false }; }
  const currentTime = now();
  if (cached && isFreshFavicon(cached, currentTime)) return { blob: cached.blob, updated: false };
  if (cached?.blob) options.onCached?.(cached.blob);
  if (cached?.retryAfter !== undefined && cached.retryAfter > currentTime) {
    return { blob: cached.blob, updated: false };
  }

  const existing = inflight.get(key);
  if (existing) return existing;
  const request = (async () => {
    try {
      const blob = await fetchIcon(pageUrl);
      await cache.saveSuccess(key, blob, now());
      return { blob, updated: true };
    } catch {
      await cache.saveFailure(key, now() + FAVICON_RETRY_DELAY);
      return { blob: cached?.blob, updated: false };
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  return request;
}
