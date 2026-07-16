import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDefaultSnapshot } from '../../domain/defaults';
import { GroupManager } from './GroupManager';

afterEach(cleanup);

describe('GroupManager', () => {
  it('shows bookmark counts and creates groups inline', () => {
    const snapshot = createDefaultSnapshot();
    const create = vi.fn();
    render(<GroupManager snapshot={snapshot} onCreate={create} onRename={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />);
    expect(screen.getByText('4 个书签')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('新分组名称'), { target: { value: '阅读' } });
    fireEvent.click(screen.getByRole('button', { name: '新建分组' }));
    expect(create).toHaveBeenCalledWith('阅读');
  });

  it('renames and requests deletion without native prompts', () => {
    const snapshot = createDefaultSnapshot();
    const rename = vi.fn(); const remove = vi.fn();
    render(<GroupManager snapshot={snapshot} onCreate={vi.fn()} onRename={rename} onDelete={remove} onReorder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '重命名 开发' }));
    const input = screen.getByLabelText('分组名称 开发');
    fireEvent.change(input, { target: { value: '工程' } });
    fireEvent.click(screen.getByRole('button', { name: '保存 开发' }));
    expect(rename).toHaveBeenCalledWith('development', '工程');
    fireEvent.click(screen.getByRole('button', { name: '删除 开发' }));
    expect(screen.getByRole('region', { name: '删除分组确认' })).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText('至少需要保留一个分组。')).toBeInTheDocument();
  });

  it('puts sorting semantics only on handles', () => {
    const snapshot = createDefaultSnapshot();
    render(<GroupManager snapshot={snapshot} onCreate={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} onReorder={vi.fn()} />);
    expect(screen.getByRole('listitem', { name: '开发' })).not.toHaveAttribute('aria-roledescription');
    expect(screen.getByRole('button', { name: '排序 开发' })).toHaveAttribute('aria-roledescription', 'sortable');
  });

  it('offers moving bookmarks before deleting a non-empty group', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.groups.push({ id: 'other', name: '其他', order: 1, updatedAt: 0 });
    const remove = vi.fn();
    render(<GroupManager snapshot={snapshot} onCreate={vi.fn()} onRename={vi.fn()} onDelete={remove} onReorder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '删除 开发' }));
    expect(screen.getByRole('combobox', { name: '目标分组' })).toHaveValue('other');
    fireEvent.click(screen.getByRole('button', { name: '移动书签并删除' }));
    expect(remove).toHaveBeenCalledWith('development', 'move', 'other');
  });

  it('deletes an empty group with a direct confirmation', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.groups.push({ id: 'empty', name: '空组', order: 1, updatedAt: 0 });
    const remove = vi.fn();
    render(<GroupManager snapshot={snapshot} onCreate={vi.fn()} onRename={vi.fn()} onDelete={remove} onReorder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '删除 空组' }));
    expect(screen.queryByRole('combobox', { name: '目标分组' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认删除空分组' }));
    expect(remove).toHaveBeenCalledWith('empty', 'delete');
  });
});
