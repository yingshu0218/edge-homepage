import type { AppSnapshot, Bookmark, BookmarkGroup, BookmarkUsage } from '../../domain/models';

type NewBookmark = Pick<Bookmark, 'id' | 'title' | 'url' | 'groupId'> & { now?: number };
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1_000;

function withGroupOrder(bookmarks: Bookmark[], groupId: string, orderedIds: string[], now?: number): Bookmark[] {
  const orders = new Map(orderedIds.map((id, order) => [id, order]));
  return bookmarks.map((bookmark) => bookmark.groupId === groupId && orders.has(bookmark.id)
    ? { ...bookmark, order: orders.get(bookmark.id)!, ...(bookmark.order !== orders.get(bookmark.id) && now !== undefined ? { updatedAt: now } : {}) }
    : bookmark);
}

function normalizeGroupOrder(groups: BookmarkGroup[], now: number): BookmarkGroup[] {
  const orders = new Map(groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order).map(({ id }, index) => [id, index]));
  return groups.map((group) => orders.has(group.id) && group.order !== orders.get(group.id)
    ? { ...group, order: orders.get(group.id)!, updatedAt: now } : group);
}

export const RECENT_BOOKMARKS = 'view:recent';
export const ALL_BOOKMARKS = 'view:all';
export const BUILTIN_BOOKMARK_TABS = [
  { id: RECENT_BOOKMARKS, name: '最近常用' },
  { id: ALL_BOOKMARKS, name: '全部' },
];

export function selectBookmarks(snapshot: AppSnapshot, groupId: string, now = Date.now()): Bookmark[] {
  if (groupId !== RECENT_BOOKMARKS && groupId !== ALL_BOOKMARKS) return filterBookmarksByGroup(snapshot, groupId);
  const groups = snapshot.groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order);
  const bookmarks = groups.flatMap(({ id }) => filterBookmarksByGroup(snapshot, id));
  if (groupId === ALL_BOOKMARKS) return bookmarks;
  return bookmarks.map((bookmark) => {
    const timestamps = (snapshot.bookmarkUsage[bookmark.id]?.recentOpenTimestamps ?? []).filter((time) => time >= now - THIRTY_DAYS && time <= now);
    return { bookmark, count: timestamps.length, last: timestamps.reduce((last, time) => Math.max(last, time), 0) };
  }).filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .map(({ bookmark }) => bookmark);
}

export function filterBookmarksByGroup(snapshot: AppSnapshot, groupId: string): Bookmark[] {
  return snapshot.bookmarks
    .filter((bookmark) => bookmark.groupId === groupId && bookmark.deletedAt === undefined)
    .sort((left, right) => left.order - right.order);
}

export function searchBookmarks(snapshot: AppSnapshot, groupId: string, query: string): Bookmark[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return selectBookmarks(snapshot, groupId).filter(({ title, url }) => (
    title.toLocaleLowerCase().includes(normalizedQuery) || url.toLocaleLowerCase().includes(normalizedQuery)
  ));
}

function normalizeBookmarkGroups(bookmarks: Bookmark[], groupIds: Iterable<string>, now: number): Bookmark[] {
  let normalized = bookmarks;
  for (const groupId of new Set(groupIds)) {
    const orderedIds = normalized
      .filter((bookmark) => bookmark.groupId === groupId && bookmark.deletedAt === undefined)
      .sort((left, right) => left.order - right.order)
      .map(({ id }) => id);
    normalized = withGroupOrder(normalized, groupId, orderedIds, now);
  }
  return normalized;
}

export function moveBookmarks(snapshot: AppSnapshot, ids: string[], destinationGroupId: string, now = Date.now()): AppSnapshot {
  const destinationGroup = snapshot.groups.find(({ id, deletedAt }) => id === destinationGroupId && deletedAt === undefined);
  if (!destinationGroup) throw new RangeError('An active destination group is required.');

  const selectedIds = new Set(ids);
  const selected = snapshot.groups
    .filter(({ deletedAt }) => deletedAt === undefined)
    .sort((left, right) => left.order - right.order)
    .flatMap(({ id }) => filterBookmarksByGroup(snapshot, id))
    .filter((bookmark) => selectedIds.has(bookmark.id) && bookmark.groupId !== destinationGroupId);
  const sourceGroupIds = selected.map(({ groupId }) => groupId);
  const movedIds = new Set(selected.map(({ id }) => id));
  const destinationIds = filterBookmarksByGroup(snapshot, destinationGroupId).map(({ id }) => id);
  const moved = snapshot.bookmarks.map((bookmark) => movedIds.has(bookmark.id)
    ? { ...bookmark, groupId: destinationGroupId, updatedAt: now }
    : bookmark);
  const normalizedSources = normalizeBookmarkGroups(moved, sourceGroupIds, now);

  return {
    ...snapshot,
    bookmarks: withGroupOrder(normalizedSources, destinationGroupId, [...destinationIds, ...selected.map(({ id }) => id)], now),
  };
}

export function deleteBookmarks(snapshot: AppSnapshot, ids: string[], now = Date.now()): AppSnapshot {
  const selectedIds = new Set(ids);
  const selected = snapshot.bookmarks.filter(({ id, deletedAt }) => selectedIds.has(id) && deletedAt === undefined);
  const deletedIds = new Set(selected.map(({ id }) => id));
  const deleted = snapshot.bookmarks.map((bookmark) => deletedIds.has(bookmark.id)
    ? { ...bookmark, deletedAt: now, updatedAt: now }
    : bookmark);

  return {
    ...snapshot,
    bookmarks: normalizeBookmarkGroups(deleted, selected.map(({ groupId }) => groupId), now),
  };
}

export function addBookmark(snapshot: AppSnapshot, input: NewBookmark): AppSnapshot {
  const { now = Date.now(), ...bookmark } = input;
  const existingIds = filterBookmarksByGroup(snapshot, bookmark.groupId).map(({ id }) => id);
  const added = { ...bookmark, order: existingIds.length, createdAt: now, updatedAt: now };
  return { ...snapshot, bookmarks: withGroupOrder([...snapshot.bookmarks, added], bookmark.groupId, [...existingIds, bookmark.id], now) };
}

export function recordBookmarkOpen(snapshot: AppSnapshot, id: string, now = Date.now()): AppSnapshot {
  if (!snapshot.bookmarks.some((bookmark) => bookmark.id === id && bookmark.deletedAt === undefined)) return snapshot;
  const usage = snapshot.bookmarkUsage[id];
  const recentOpenTimestamps = [...(usage?.recentOpenTimestamps ?? []), now]
    .filter((timestamp) => timestamp >= now - THIRTY_DAYS && timestamp <= now)
    .sort((left, right) => left - right);
  return {
    ...snapshot,
    bookmarkUsage: { ...snapshot.bookmarkUsage, [id]: { totalOpenCount: (usage?.totalOpenCount ?? 0) + 1, recentOpenTimestamps } },
  };
}

export function bookmarkOpenStats(usage: BookmarkUsage | undefined, now = Date.now()) {
  const timestamps = usage?.recentOpenTimestamps ?? [];
  const countSince = (duration: number) => timestamps.filter((timestamp) => timestamp >= now - duration && timestamp <= now).length;
  return {
    day: countSince(24 * 60 * 60 * 1_000),
    week: countSince(7 * 24 * 60 * 60 * 1_000),
    month: countSince(THIRTY_DAYS),
    total: usage?.totalOpenCount ?? 0,
  };
}

export function editBookmark(snapshot: AppSnapshot, id: string, changes: Partial<Pick<Bookmark, 'title' | 'url' | 'groupId'>>, now = Date.now()): AppSnapshot {
  const current = snapshot.bookmarks.find((bookmark) => bookmark.id === id && bookmark.deletedAt === undefined);
  if (!current || !changes.groupId || changes.groupId === current.groupId) {
    return { ...snapshot, bookmarks: snapshot.bookmarks.map((bookmark) => bookmark.id === id ? { ...bookmark, ...changes, updatedAt: now } : bookmark) };
  }
  const destinationGroup = snapshot.groups.find((group) => group.id === changes.groupId && group.deletedAt === undefined);
  if (!destinationGroup) throw new RangeError('An active destination group is required.');
  const sourceIds = filterBookmarksByGroup(snapshot, current.groupId).filter((bookmark) => bookmark.id !== id).map(({ id }) => id);
  const targetIds = filterBookmarksByGroup(snapshot, changes.groupId).map(({ id }) => id);
  let bookmarks = snapshot.bookmarks.map((bookmark) => bookmark.id === id ? { ...bookmark, ...changes, order: targetIds.length, updatedAt: now } : bookmark);
  bookmarks = withGroupOrder(bookmarks, current.groupId, sourceIds, now);
  bookmarks = withGroupOrder(bookmarks, changes.groupId, [...targetIds, id], now);
  return { ...snapshot, bookmarks };
}

export function deleteBookmark(snapshot: AppSnapshot, id: string, now = Date.now()): AppSnapshot {
  return { ...snapshot, bookmarks: snapshot.bookmarks.map((bookmark) => bookmark.id === id ? { ...bookmark, deletedAt: now, updatedAt: now } : bookmark) };
}

export function addGroup(snapshot: AppSnapshot, group: Pick<BookmarkGroup, 'id' | 'name'>, now = Date.now()): AppSnapshot {
  const order = snapshot.groups.filter(({ deletedAt }) => deletedAt === undefined).length;
  return { ...snapshot, groups: [...snapshot.groups, { ...group, order, updatedAt: now }] };
}

export function editGroup(snapshot: AppSnapshot, id: string, name: string, now = Date.now()): AppSnapshot {
  return { ...snapshot, groups: snapshot.groups.map((group) => group.id === id ? { ...group, name, updatedAt: now } : group) };
}

export function deleteGroup(snapshot: AppSnapshot, id: string, destinationGroupId: string, now = Date.now()): AppSnapshot {
  const destinationGroup = snapshot.groups.find((group) => group.id === destinationGroupId && group.deletedAt === undefined);
  const sourceGroup = snapshot.groups.find((group) => group.id === id && group.deletedAt === undefined);
  if (!sourceGroup || !destinationGroup || id === destinationGroupId) throw new RangeError('A different active destination group is required.');
  const destinationIds = filterBookmarksByGroup(snapshot, destinationGroupId).map(({ id }) => id);
  const sourceIds = filterBookmarksByGroup(snapshot, id).map(({ id }) => id);
  const mergedIds = [...destinationIds, ...sourceIds];
  const moved = snapshot.bookmarks.map((bookmark) => bookmark.groupId === id && bookmark.deletedAt === undefined
    ? { ...bookmark, groupId: destinationGroupId, updatedAt: now }
    : bookmark);
  return {
    ...snapshot,
    groups: normalizeGroupOrder(snapshot.groups.map((group) => group.id === id ? { ...group, deletedAt: now, updatedAt: now } : group), now),
    bookmarks: withGroupOrder(moved, destinationGroupId, mergedIds, now),
  };
}

export function deleteGroupAndBookmarks(snapshot: AppSnapshot, id: string, now = Date.now()): AppSnapshot {
  const source = snapshot.groups.find((group) => group.id === id && group.deletedAt === undefined);
  if (!source) throw new RangeError('An active source group is required.');
  return {
    ...snapshot,
    groups: normalizeGroupOrder(snapshot.groups.map((group) => group.id === id ? { ...group, deletedAt: now, updatedAt: now } : group), now),
    bookmarks: snapshot.bookmarks.map((bookmark) => bookmark.groupId === id && bookmark.deletedAt === undefined
      ? { ...bookmark, deletedAt: now, updatedAt: now } : bookmark),
  };
}

export function reorderBookmarks(snapshot: AppSnapshot, activeId: string, overId: string, now = Date.now()): AppSnapshot {
  if (activeId === overId) return snapshot;
  const active = snapshot.bookmarks.find(({ id, deletedAt }) => id === activeId && deletedAt === undefined);
  const over = snapshot.bookmarks.find(({ id, deletedAt }) => id === overId && deletedAt === undefined);
  if (!active || !over || active.groupId !== over.groupId) return snapshot;
  const ordered = filterBookmarksByGroup(snapshot, active.groupId);
  const from = ordered.findIndex(({ id }) => id === activeId);
  const to = ordered.findIndex(({ id }) => id === overId);
  ordered.splice(to, 0, ...ordered.splice(from, 1));
  const orders = new Map(ordered.map(({ id }, order) => [id, order]));
  return {
    ...snapshot,
    bookmarks: snapshot.bookmarks.map((bookmark) => orders.has(bookmark.id) && bookmark.order !== orders.get(bookmark.id)
      ? { ...bookmark, order: orders.get(bookmark.id)!, updatedAt: now } : bookmark),
  };
}

export function reorderGroups(snapshot: AppSnapshot, activeId: string, overId: string, now = Date.now()): AppSnapshot {
  if (activeId === overId) return snapshot;
  const ordered = snapshot.groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order);
  const from = ordered.findIndex(({ id }) => id === activeId);
  const to = ordered.findIndex(({ id }) => id === overId);
  if (from < 0 || to < 0) return snapshot;
  ordered.splice(to, 0, ...ordered.splice(from, 1));
  const orders = new Map(ordered.map(({ id }, index) => [id, index]));
  return { ...snapshot, groups: snapshot.groups.map((group) => orders.has(group.id) && group.order !== orders.get(group.id)
    ? { ...group, order: orders.get(group.id)!, updatedAt: now } : group) };
}
