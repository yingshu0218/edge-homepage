import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../../domain/defaults';
import { BookmarkSortDrawer, reorderFromDrawer } from './BookmarkSortDrawer';

afterEach(cleanup);

describe('BookmarkSortDrawer', () => {
  it('shows only the current group with handle-only sorting controls', () => {
    const snapshot = createDefaultSnapshot();
    render(<BookmarkSortDrawer snapshot={snapshot} groupId={snapshot.groups[0]!.id} onChange={vi.fn()} />);

    expect(screen.getByText('开发')).toBeInTheDocument();
    expect(screen.getByText('github.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '排序 GitHub' })).toHaveAttribute('aria-roledescription', 'sortable');
    expect(screen.getByRole('listitem', { name: 'GitHub' })).not.toHaveAttribute('aria-roledescription');
  });

  it('shows an empty state for a group without bookmarks', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.groups.push({ id: 'empty', name: '空分组', order: 1, updatedAt: 1 });
    render(<BookmarkSortDrawer snapshot={snapshot} groupId="empty" onChange={vi.fn()} />);
    expect(screen.getByText('当前分组暂无书签')).toBeInTheDocument();
  });

  it('creates a reordered snapshot only for a real position change', () => {
    const snapshot = createDefaultSnapshot();
    expect(reorderFromDrawer(snapshot, 'github', 'github', 10)).toBeUndefined();
    const next = reorderFromDrawer(snapshot, 'github', 'mdn', 10);
    expect(next).toBeDefined();
    expect(next?.bookmarks.find(({ id }) => id === 'github')?.updatedAt).toBe(10);
  });
});
