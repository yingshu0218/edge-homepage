import type { Bookmark, BookmarkUsage } from './models';

// Reconcile overlapping views of the same device's counters. This is deliberately
// not used to merge statistics from different devices.
export function mergeLocalUsage(bookmarks: Bookmark[], saved: Record<string, BookmarkUsage>, pending: Record<string, BookmarkUsage>): Record<string, BookmarkUsage> {
  return Object.fromEntries(bookmarks.flatMap(({ id }) => {
    const left = Object.hasOwn(saved, id) ? saved[id] : undefined;
    const right = Object.hasOwn(pending, id) ? pending[id] : undefined;
    const usage = !left || right && right.totalOpenCount > left.totalOpenCount ? right : left;
    return usage ? [[id, usage]] : [];
  }));
}
