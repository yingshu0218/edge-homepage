import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../../domain/defaults';
import { BookmarkGrid } from './BookmarkGrid';

afterEach(cleanup);

describe('BookmarkGrid', () => {
  it('finishes the local open record before ordinary card navigation', async () => {
    let finish!: () => void;
    const recorded = new Promise<void>((resolve) => { finish = resolve; });
    const onOpen = vi.fn().mockReturnValue(recorded);
    const navigate = vi.fn();
    render(<BookmarkGrid snapshot={createDefaultSnapshot()} groupId="development" onOpen={onOpen} navigate={navigate} />);
    fireEvent.click(screen.getByRole('link', { name: /GitHub/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(navigate).toHaveBeenCalledExactlyOnceWith('https://github.com/');
  });

  it('retains native modifier and middle-click behavior while recording each open once', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks[0]!.url = 'http://localhost:3000/#github';
    const onOpen = vi.fn();
    const navigate = vi.fn();
    render(<BookmarkGrid snapshot={snapshot} groupId="development" onOpen={onOpen} navigate={navigate} />);
    const link = screen.getByRole('link', { name: /GitHub/ });
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent(link, new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }))).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
  });
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
    const onOpen = vi.fn();
    render(<BookmarkGrid snapshot={snapshot} groupId={snapshot.groups[0].id} onEdit={onEdit} onDelete={onDelete} onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: /GitHub/ });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    fireEvent(link, new MouseEvent('auxclick', { button: 2, bubbles: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete GitHub' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(snapshot.bookmarks[0]);
  });

  it('renders the four bookmark opening counters', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarkUsage.github = {
      totalOpenCount: 9,
      recentOpenTimestamps: [900, 950, 990],
    };
    render(<BookmarkGrid snapshot={snapshot} groupId={snapshot.groups[0].id} now={1_000} />);

    const stats = screen.getByLabelText('GitHub 打开统计');
    expect(stats).toHaveTextContent('24h3');
    expect(stats).toHaveTextContent('7d3');
    expect(stats).toHaveTextContent('30d3');
    expect(stats).toHaveTextContent('总计9');
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
