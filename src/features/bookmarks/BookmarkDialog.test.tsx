import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BookmarkDialog } from './BookmarkDialog';

const groups = [{ id: 'work', name: 'Work', order: 0, updatedAt: 0 }];
afterEach(cleanup);

it('normalizes a valid destination before saving', async () => {
  const onSave = vi.fn();
  render(<BookmarkDialog open groups={groups} searchTemplate="https://search.test/?q=%s" onSave={onSave} onClose={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Example' } });
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'example.com/docs' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }));

  expect(onSave).toHaveBeenCalledWith({ title: 'Example', url: 'https://example.com/docs', groupId: 'work' });
});

it('shows an error and does not save an unsafe URL', async () => {
  const onSave = vi.fn();
  render(<BookmarkDialog open groups={groups} searchTemplate="https://search.test/?q=%s" onSave={onSave} onClose={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unsafe' } });
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'javascript:alert(1)' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }));

  expect(screen.getByRole('alert')).toHaveTextContent('valid HTTP or HTTPS URL');
  expect(onSave).not.toHaveBeenCalled();
});
