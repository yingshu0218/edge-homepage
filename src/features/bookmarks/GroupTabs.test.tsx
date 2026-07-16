import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupTabs } from './GroupTabs';

afterEach(cleanup);
const groups = [
  { id: 'a', name: 'Alpha', order: 0, updatedAt: 0 },
  { id: 'b', name: 'Beta', order: 1, updatedAt: 0 },
];

describe('GroupTabs', () => {
  it('uses roving tab stops and arrow-key navigation', () => {
    const select = vi.fn();
    render(<GroupTabs groups={groups} activeGroupId="a" onSelect={select} />);
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    const beta = screen.getByRole('tab', { name: 'Beta' });
    expect(alpha).toHaveAttribute('tabindex', '0');
    expect(beta).toHaveAttribute('tabindex', '-1');
    alpha.focus();
    fireEvent.keyDown(alpha, { key: 'ArrowRight' });
    expect(beta).toHaveFocus();
    expect(select).toHaveBeenCalledWith('b');
  });

  it('exposes rename/delete actions and drag reordering', () => {
    const rename = vi.fn(); const remove = vi.fn(); const reorder = vi.fn();
    render(<GroupTabs groups={groups} activeGroupId="a" onSelect={vi.fn()} onRename={rename} onDelete={remove} onReorder={reorder} />);
    fireEvent.click(screen.getByRole('button', { name: '重命名 Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: '删除 Alpha' }));
    const alpha = screen.getByRole('tab', { name: 'Alpha' });
    const beta = screen.getByRole('tab', { name: 'Beta' });
    fireEvent.dragStart(alpha);
    fireEvent.drop(beta);
    expect(rename).toHaveBeenCalledWith('a');
    expect(remove).toHaveBeenCalledWith('a');
    expect(reorder).toHaveBeenCalledWith('a', 'b');
  });
});
