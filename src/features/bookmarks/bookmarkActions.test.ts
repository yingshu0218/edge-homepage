import { createDefaultSnapshot } from '../../domain/defaults';
import { describe, expect, it } from 'vitest';
import {
  addBookmark,
  deleteBookmark,
  deleteGroup,
  editBookmark,
  filterBookmarksByGroup,
  reorderBookmarks,
} from './bookmarkActions';

describe('bookmark actions', () => {
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
    const reordered = reorderBookmarks(source, 'npm', 'mdn');

    expect(reordered.bookmarks.map(({ id, order }) => [id, order])).toEqual([
      ['github', 0], ['mdn', 2], ['stackoverflow', 3], ['npm', 1],
    ]);
    expect(source.bookmarks.map(({ order }) => order)).toEqual([0, 1, 2, 3]);
  });

  it('moves active bookmarks before deleting their group', () => {
    const source = createDefaultSnapshot();
    source.groups.push({ id: 'other', name: 'Other', order: 1, updatedAt: 0 });

    const next = deleteGroup(source, 'development', 'other', 50);

    expect(next.groups.find(({ id }) => id === 'development')?.deletedAt).toBe(50);
    expect(next.bookmarks.every(({ groupId }) => groupId === 'other')).toBe(true);
    expect(next.bookmarks.map(({ order }) => order)).toEqual([0, 1, 2, 3]);
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
});
