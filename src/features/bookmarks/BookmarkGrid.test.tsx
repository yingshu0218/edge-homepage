import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../../domain/defaults';
import { BookmarkGrid } from './BookmarkGrid';

afterEach(cleanup);

describe('BookmarkGrid', () => {
  it('renders plain cards without sorting behavior', () => {
    const snapshot = createDefaultSnapshot();
    render(<BookmarkGrid snapshot={snapshot} groupId={snapshot.groups[0].id} />);
    const card = screen.getByRole('article', { name: 'GitHub' });
    expect(card).not.toHaveAttribute('aria-roledescription');
    expect(card).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('button', { name: 'Drag GitHub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '排序 GitHub' })).not.toBeInTheDocument();
  });

  it('does not reorder when opening or using card actions', () => {
    const snapshot = createDefaultSnapshot();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<BookmarkGrid snapshot={snapshot} groupId={snapshot.groups[0].id} onEdit={onEdit} onDelete={onDelete} />);
    const link = screen.getByRole('link', { name: /GitHub/ });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    fireEvent.click(screen.getByRole('button', { name: 'Edit GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete GitHub' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('shows only the configured number of cards and a view-all action for additional bookmarks', () => {
    const snapshot = createDefaultSnapshot();
    for (let index = 0; index < 6; index += 1) {
      snapshot.bookmarks.push({
        id: `bookmark-${index}`,
        title: `Bookmark ${index}`,
        url: `https://bookmark-${index}.test/`,
        groupId: 'development',
        order: index + 4,
        createdAt: 0,
        updatedAt: 0,
      });
    }
    const onViewAll = vi.fn();

    render(<BookmarkGrid snapshot={snapshot} groupId="development" limit={8} onViewAll={onViewAll} />);

    expect(screen.getAllByRole('article')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: '查看全部（共 10 个）' }));
    expect(onViewAll).toHaveBeenCalledOnce();
  });

  it('does not show a view-all action when the grid is within its configured limit', () => {
    const snapshot = createDefaultSnapshot();
    for (let index = 0; index < 4; index += 1) {
      snapshot.bookmarks.push({
        id: `bookmark-${index}`,
        title: `Bookmark ${index}`,
        url: `https://bookmark-${index}.test/`,
        groupId: 'development',
        order: index + 4,
        createdAt: 0,
        updatedAt: 0,
      });
    }

    render(<BookmarkGrid snapshot={snapshot} groupId="development" limit={8} />);

    expect(screen.getAllByRole('article')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /查看全部/ })).not.toBeInTheDocument();
  });
});
