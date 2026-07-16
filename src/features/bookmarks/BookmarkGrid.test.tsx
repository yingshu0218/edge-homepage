import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../../domain/defaults';
import { POINTER_ACTIVATION_CONSTRAINT, BookmarkGrid } from './BookmarkGrid';

afterEach(cleanup);

describe('BookmarkGrid', () => {
  it('uses a movement threshold before pointer dragging starts', () => {
    expect(POINTER_ACTIVATION_CONSTRAINT).toEqual({ distance: 6 });
  });

  it('makes the card itself the single accessible sortable activator', () => {
    const snapshot = createDefaultSnapshot();
    render(<BookmarkGrid snapshot={snapshot} groupId={snapshot.groups[0].id} onChange={vi.fn()} />);
    const card = screen.getByRole('article', { name: 'GitHub' });
    expect(card).toHaveAttribute('aria-roledescription', 'sortable');
    expect(card).toHaveAttribute('tabindex', '0');
    expect(screen.queryByRole('button', { name: 'Drag GitHub' })).not.toBeInTheDocument();
  });

  it('does not reorder when opening or using card actions', () => {
    const snapshot = createDefaultSnapshot();
    const onChange = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<BookmarkGrid snapshot={snapshot} groupId={snapshot.groups[0].id} onChange={onChange} onEdit={onEdit} onDelete={onDelete} />);
    const link = screen.getByRole('link', { name: /GitHub/ });
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    fireEvent.click(screen.getByRole('button', { name: 'Edit GitHub' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete GitHub' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
