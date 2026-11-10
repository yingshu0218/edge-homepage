import type { AppSnapshot } from '../../domain/models';
import { ALL_BOOKMARKS, RECENT_BOOKMARKS, selectBookmarks } from './bookmarkActions';

const VIEW_KEY = 'day-start:bookmark-view';

export function readBookmarkView(): string {
  try { return localStorage.getItem(VIEW_KEY) ?? ''; } catch { return ''; }
}

export function saveBookmarkView(id: string): void {
  try { localStorage.setItem(VIEW_KEY, id); } catch { /* View preference is optional. */ }
}

export function resolveBookmarkView(snapshot: AppSnapshot, preferred: string, now: number): string {
  if (preferred === ALL_BOOKMARKS || preferred === RECENT_BOOKMARKS
    || snapshot.groups.some(({ id, deletedAt }) => id === preferred && deletedAt === undefined)) return preferred;
  return selectBookmarks(snapshot, RECENT_BOOKMARKS, now).length > 0 ? RECENT_BOOKMARKS : ALL_BOOKMARKS;
}
