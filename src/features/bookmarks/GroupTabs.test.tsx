import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupTabs } from './GroupTabs';

afterEach(cleanup);
const groups = [
  { id: 'a', name: 'Alpha', order: 0, updatedAt: 0 },
  { id: 'b', name: 'Beta', order: 1, updatedAt: 0 },
];

describe('GroupTabs', () => {
  it('pins recent and all before custom groups, including when no groups exist', () => {
    const { rerender } = render(<GroupTabs groups={[...groups].reverse()} activeGroupId="view:recent" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['最近常用', '全部', 'Alpha', 'Beta']);
    rerender(<GroupTabs groups={[]} activeGroupId="view:recent" onSelect={vi.fn()} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['最近常用', '全部']);
  });

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

  it('keeps tabs focused on selection without management controls', () => {
    render(<GroupTabs groups={groups} activeGroupId="a" onSelect={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Alpha' })).not.toHaveAttribute('draggable');
    expect(screen.queryByRole('button', { name: '重命名 Alpha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除 Alpha' })).not.toBeInTheDocument();
  });
});
