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
});
