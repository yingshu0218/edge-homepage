import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../../domain/defaults';
import { BookmarkManagerDrawer } from './BookmarkManagerDrawer';

afterEach(cleanup);

function createSnapshot() {
  const snapshot = createDefaultSnapshot();
  snapshot.groups.push({ id: 'personal', name: '个人', order: 1, updatedAt: 0 });
  return snapshot;
}

function renderDrawer() {
  const snapshot = createSnapshot();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onMove = vi.fn();
  const onOpenSort = vi.fn();
  render(<BookmarkManagerDrawer snapshot={snapshot} groupId="development" onEdit={onEdit} onDelete={onDelete} onMove={onMove} onOpenSort={onOpenSort} />);
  return { onEdit, onDelete, onMove, onOpenSort };
}

describe('BookmarkManagerDrawer', () => {
  it('searches current-group bookmarks and moves the selected result', () => {
    const { onMove } = renderDrawer();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索书签' }), { target: { value: 'github' } });
    expect(screen.getByRole('checkbox', { name: '选择 GitHub' })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: '选择 MDN Web Docs' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 GitHub' }));
    fireEvent.change(screen.getByLabelText('移动到分组'), { target: { value: 'personal' } });
    fireEvent.click(screen.getByRole('button', { name: '移动 1 个书签' }));
    expect(onMove).toHaveBeenCalledWith(['github'], 'personal');
  });

  it('selects all visible results and reports the selected count', () => {
    renderDrawer();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索书签' }), { target: { value: 'https' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '选择所有可见书签' }));

    expect(screen.getByText('已选择 4 个书签')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '选择 MDN Web Docs' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择 Stack Overflow' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择 GitHub' })).toBeChecked();
  });

  it('announces the filtered result count while retaining total and selected counts', () => {
    renderDrawer();

    expect(screen.getByText('4 个书签')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索书签' }), { target: { value: 'github' } });

    const filteredCount = screen.getByRole('status');
    expect(filteredCount).toHaveTextContent('筛选结果 1 个');
    expect(filteredCount).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('4 个书签')).toBeInTheDocument();
    expect(screen.getByText('已选择 0 个书签')).toBeInTheDocument();
  });

  it('asks for confirmation before deleting selected bookmarks', () => {
    const { onDelete } = renderDrawer();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 GitHub' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 MDN Web Docs' }));
    fireEvent.click(screen.getByRole('button', { name: '删除 2 个书签' }));

    expect(screen.getByText('删除选中的 2 个书签？')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(onDelete).toHaveBeenCalledWith(['github', 'mdn']);
  });

  it('clears selection and an open confirmation when selected bookmarks disappear', () => {
    const snapshot = createSnapshot();
    const { rerender } = render(<BookmarkManagerDrawer snapshot={snapshot} groupId="development" onEdit={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onOpenSort={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: '删除 1 个书签' }));

    rerender(<BookmarkManagerDrawer snapshot={{ ...snapshot, bookmarks: snapshot.bookmarks.map((bookmark) => bookmark.id === 'github' ? { ...bookmark, deletedAt: 1 } : bookmark) }} groupId="development" onEdit={vi.fn()} onDelete={vi.fn()} onMove={vi.fn()} onOpenSort={vi.fn()} />);

    expect(screen.getByText('已选择 0 个书签')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '删除书签确认' })).not.toBeInTheDocument();
  });

  it('shows an empty search state and offers edit and sorting actions', () => {
    const { onEdit, onOpenSort } = renderDrawer();
    fireEvent.change(screen.getByRole('searchbox', { name: '搜索书签' }), { target: { value: 'not-a-bookmark' } });
    expect(screen.getByText('未找到匹配的书签')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索书签' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '编辑 GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: '打开排序管理' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'github' }));
    expect(onOpenSort).toHaveBeenCalledOnce();
  });
});
