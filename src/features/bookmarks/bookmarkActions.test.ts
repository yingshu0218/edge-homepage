import { createDefaultSnapshot } from '../../domain/defaults';
import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  deleteBookmark,
  deleteBookmarks,
  deleteGroup,
  editBookmark,
  filterBookmarksByGroup,
  moveBookmarks,
  bookmarkOpenStats,
  recordBookmarkOpen,
  reorderBookmarks,
  searchBookmarks,
} from './bookmarkActions';

describe('bookmark actions', () => {
  it('records startup-page opens and calculates rolling counters', () => {
    const day = 24 * 60 * 60 * 1_000;
    const now = 40 * day;
    let snapshot = createDefaultSnapshot();
    const events = [now - 31 * day, now - 8 * day, now - 2 * day, now - 12 * 60 * 60 * 1_000, now];
    for (const timestamp of events) snapshot = recordBookmarkOpen(snapshot, 'github', timestamp);

    const bookmark = snapshot.bookmarks.find(({ id }) => id === 'github')!;
    expect(bookmarkOpenStats(bookmark, now)).toEqual({ day: 2, week: 3, month: 4, total: 5 });
    expect(bookmark.recentOpenTimestamps).toEqual(events.slice(1));
    expect(bookmark.updatedAt).toBe(now);
  });

  it('does not count missing or deleted bookmarks', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks[0]!.deletedAt = 1;
    expect(recordBookmarkOpen(snapshot, 'github', 10)).toEqual(snapshot);
    expect(recordBookmarkOpen(snapshot, 'missing', 10)).toEqual(snapshot);
  });

  it('adds, edits, and soft deletes a bookmark without mutating the snapshot', () => {
    const source = createDefaultSnapshot();
    const added = addBookmark(source, {
      id: 'react', title: 'React', url: 'https://react.dev/', groupId: 'development', now: 10,
    });
    const edited = editBookmark(added, 'react', { title: 'React docs', url: 'https://react.dev/learn' }, 20);
    const deleted = deleteBookmark(edited, 'react', 30);

    expect(source.bookmarks).toHaveLength(4);
    expect(added.bookmarks.at(-1)).toMatchObject({ id: 'react', order: 4, createdAt: 10, updatedAt: 10 });
    expect(edited.bookmarks.at(-1)).toMatchObject({ title: 'React docs', url: 'https://react.dev/learn', updatedAt: 20 });
    expect(deleted.bookmarks.at(-1)?.deletedAt).toBe(30);
  });

  it('filters active bookmarks by group in stable order', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks[1]!.deletedAt = 1;
    snapshot.bookmarks[2]!.order = 0;

    expect(filterBookmarksByGroup(snapshot, 'development').map(({ id }) => id)).toEqual([
      'github', 'stackoverflow', 'npm',
    ]);
  });

  it('assigns stable contiguous order values after dragging', () => {
    const source = createDefaultSnapshot();
    const reordered = reorderBookmarks(source, 'npm', 'mdn', 42);

    expect(reordered.bookmarks.map(({ id, order }) => [id, order])).toEqual([
      ['github', 0], ['mdn', 2], ['stackoverflow', 3], ['npm', 1],
    ]);
    expect(source.bookmarks.map(({ order }) => order)).toEqual([0, 1, 2, 3]);
    expect(reordered.bookmarks.filter((bookmark, index) => bookmark.order !== source.bookmarks[index]!.order).every(({ updatedAt }) => updatedAt === 42)).toBe(true);
  });

  it('reorders groups and timestamps every changed order', async () => {
    const { reorderGroups } = await import('./bookmarkActions');
    const source = createDefaultSnapshot();
    source.groups.push({ id: 'other', name: 'Other', order: 1, updatedAt: 0 });
    const next = reorderGroups(source, 'other', 'development', 77);
    expect(next.groups.map(({ id, order, updatedAt }) => [id, order, updatedAt])).toEqual([
      ['development', 1, 77], ['other', 0, 77],
    ]);
  });

  it('moves active bookmarks before deleting their group', () => {
    const source = createDefaultSnapshot();
    source.groups.push({ id: 'other', name: 'Other', order: 1, updatedAt: 0 });

    const next = deleteGroup(source, 'development', 'other', 50);

    expect(next.groups.find(({ id }) => id === 'development')?.deletedAt).toBe(50);
    expect(next.bookmarks.every(({ groupId }) => groupId === 'other')).toBe(true);
    expect(next.bookmarks.map(({ order }) => order)).toEqual([0, 1, 2, 3]);
  });

  it('normalizes surviving group order and timestamps changed records after deletion', () => {
    const source = createDefaultSnapshot();
    source.groups.unshift({ id: 'first', name: 'First', order: 0, updatedAt: 0 });
    source.groups[1]!.order = 1;
    source.groups.push({ id: 'last', name: 'Last', order: 2, updatedAt: 0 });
    const next = deleteGroup(source, 'first', 'development', 88);
    expect(next.groups.find(({ id }) => id === 'development')).toMatchObject({ order: 0, updatedAt: 88 });
    expect(next.groups.find(({ id }) => id === 'last')).toMatchObject({ order: 1, updatedAt: 88 });
  });

  it('appends a bookmark after sparse order values and normalizes the group', () => {
    const source = createDefaultSnapshot();
    source.bookmarks[0]!.order = 10;
    source.bookmarks[1]!.order = 30;

    const next = addBookmark(source, {
      id: 'react', title: 'React', url: 'https://react.dev/', groupId: 'development', now: 10,
    });

    expect(filterBookmarksByGroup(next, 'development').map(({ id, order }) => [id, order])).toEqual([
      ['stackoverflow', 0], ['npm', 1], ['github', 2], ['mdn', 3], ['react', 4],
    ]);
  });

  it('reorders both groups when editing a bookmark into another group', () => {
    const source = createDefaultSnapshot();
    source.groups.push({ id: 'other', name: 'Other', order: 1, updatedAt: 0 });
    source.bookmarks.push({ id: 'news', title: 'News', url: 'https://news.test/', groupId: 'other', order: 8, createdAt: 0, updatedAt: 0 });

    const next = editBookmark(source, 'mdn', { groupId: 'other' }, 20);

    expect(filterBookmarksByGroup(next, 'development').map(({ id, order }) => [id, order])).toEqual([
      ['github', 0], ['stackoverflow', 1], ['npm', 2],
    ]);
    expect(filterBookmarksByGroup(next, 'other').map(({ id, order }) => [id, order])).toEqual([
      ['news', 0], ['mdn', 1],
    ]);
  });

  it('rejects moving a bookmark to a missing group without changing the snapshot', () => {
    const source = createDefaultSnapshot();
    const before = structuredClone(source);

    expect(() => editBookmark(source, 'mdn', { groupId: 'missing' }, 20)).toThrow(RangeError);
    expect(source).toEqual(before);
  });

  it('rejects moving a bookmark to a soft-deleted group without changing the snapshot', () => {
    const source = createDefaultSnapshot();
    source.groups.push({ id: 'deleted', name: 'Deleted', order: 1, updatedAt: 0, deletedAt: 1 });
    const before = structuredClone(source);

    expect(() => editBookmark(source, 'mdn', { groupId: 'deleted' }, 20)).toThrow(RangeError);
    expect(source).toEqual(before);
  });

  it('validates a group deletion destination', () => {
    const source = createDefaultSnapshot();
    source.groups.push({ id: 'deleted', name: 'Deleted', order: 1, updatedAt: 0, deletedAt: 1 });

    expect(() => deleteGroup(source, 'development', 'missing')).toThrow(RangeError);
    expect(() => deleteGroup(source, 'development', 'deleted')).toThrow(RangeError);
    expect(() => deleteGroup(source, 'development', 'development')).toThrow(RangeError);
  });

  it('merges groups into one contiguous stable order', () => {
    const source = createDefaultSnapshot();
    source.groups.push({ id: 'other', name: 'Other', order: 1, updatedAt: 0 });
    source.bookmarks[0]!.order = 20;
    source.bookmarks.push({ id: 'news', title: 'News', url: 'https://news.test/', groupId: 'other', order: 50, createdAt: 0, updatedAt: 0 });

    const next = deleteGroup(source, 'development', 'other', 50);

    expect(filterBookmarksByGroup(next, 'other').map(({ id, order }) => [id, order])).toEqual([
      ['news', 0], ['mdn', 1], ['stackoverflow', 2], ['npm', 3], ['github', 4],
    ]);
  });

  it('searches active bookmark titles and URLs case-insensitively after trimming the query', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks[1]!.deletedAt = 1;

    expect(searchBookmarks(snapshot, 'development', ' GITHUB ').map(({ id }) => id)).toEqual(['github']);
    expect(searchBookmarks(snapshot, 'development', 'NPMJS.COM').map(({ id }) => id)).toEqual(['npm']);
  });

  it('moves deduplicated active bookmarks in source display order and normalizes affected groups', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.groups.push({ id: 'personal', name: 'Personal', order: 1, updatedAt: 0 });
    snapshot.bookmarks.push({ id: 'news', title: 'News', url: 'https://news.test/', groupId: 'personal', order: 5, createdAt: 0, updatedAt: 0 });
    snapshot.bookmarks[2]!.order = 8;

    const moved = moveBookmarks(snapshot, ['mdn', 'github', 'mdn'], 'personal', 100);

    expect(filterBookmarksByGroup(moved, 'personal').map(({ id, order }) => [id, order])).toEqual([
      ['news', 0], ['github', 1], ['mdn', 2],
    ]);
    expect(filterBookmarksByGroup(moved, 'development').map(({ id, order }) => [id, order])).toEqual([
      ['npm', 0], ['stackoverflow', 1],
    ]);
    expect(moved.bookmarks.find(({ id }) => id === 'github')).toMatchObject({ groupId: 'personal', updatedAt: 100 });
  });

  it('rejects a missing or soft-deleted batch move destination without changing the snapshot', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.groups.push({ id: 'deleted', name: 'Deleted', order: 1, updatedAt: 0, deletedAt: 1 });
    const before = structuredClone(snapshot);

    expect(() => moveBookmarks(snapshot, ['github'], 'missing', 100)).toThrow(RangeError);
    expect(() => moveBookmarks(snapshot, ['github'], 'deleted', 100)).toThrow(RangeError);
    expect(snapshot).toEqual(before);
  });

  it('soft deletes each selected active bookmark once and normalizes source order', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks[3]!.order = 9;

    const deleted = deleteBookmarks(snapshot, ['github', 'mdn', 'github'], 100);

    expect(deleted.bookmarks.filter(({ id }) => ['github', 'mdn'].includes(id)).every(({ deletedAt, updatedAt }) => deletedAt === 100 && updatedAt === 100)).toBe(true);
    expect(filterBookmarksByGroup(deleted, 'development').map(({ id, order }) => [id, order])).toEqual([
      ['stackoverflow', 0], ['npm', 1],
    ]);
  });
});
