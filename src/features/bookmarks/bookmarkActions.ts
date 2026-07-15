import type { AppSnapshot, Bookmark, BookmarkGroup } from '../../domain/models';

type NewBookmark = Pick<Bookmark, 'id' | 'title' | 'url' | 'groupId'> & { now?: number };

export function filterBookmarksByGroup(snapshot: AppSnapshot, groupId: string): Bookmark[] {
  return snapshot.bookmarks
    .filter((bookmark) => bookmark.groupId === groupId && bookmark.deletedAt === undefined)
    .sort((left, right) => left.order - right.order);
}

export function addBookmark(snapshot: AppSnapshot, input: NewBookmark): AppSnapshot {
  const { now = Date.now(), ...bookmark } = input;
  const order = filterBookmarksByGroup(snapshot, bookmark.groupId).length;
  return { ...snapshot, bookmarks: [...snapshot.bookmarks, { ...bookmark, order, createdAt: now, updatedAt: now }] };
}

export function editBookmark(snapshot: AppSnapshot, id: string, changes: Partial<Pick<Bookmark, 'title' | 'url' | 'groupId'>>, now = Date.now()): AppSnapshot {
  return { ...snapshot, bookmarks: snapshot.bookmarks.map((bookmark) => bookmark.id === id ? { ...bookmark, ...changes, updatedAt: now } : bookmark) };
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
  const destination = filterBookmarksByGroup(snapshot, destinationGroupId);
  let order = destination.length;
  return {
    ...snapshot,
    groups: snapshot.groups.map((group) => group.id === id ? { ...group, deletedAt: now, updatedAt: now } : group),
    bookmarks: snapshot.bookmarks.map((bookmark) => bookmark.groupId === id && bookmark.deletedAt === undefined
      ? { ...bookmark, groupId: destinationGroupId, order: order++, updatedAt: now }
      : bookmark),
  };
}

export function reorderBookmarks(snapshot: AppSnapshot, activeId: string, overId: string): AppSnapshot {
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
    bookmarks: snapshot.bookmarks.map((bookmark) => orders.has(bookmark.id) ? { ...bookmark, order: orders.get(bookmark.id)! } : bookmark),
  };
}
