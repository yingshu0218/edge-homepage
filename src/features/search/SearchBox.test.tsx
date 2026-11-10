import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchBox } from './SearchBox';
import { createDefaultSnapshot } from '../../domain/defaults';

afterEach(cleanup);

it('submits search text to the normalized destination', async () => {
  const navigate = vi.fn();
  render(<SearchBox searchTemplate="https://www.google.com/search?q=%s" navigate={navigate} />);

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'edge themes' } });
  fireEvent.submit(screen.getByRole('combobox').closest('form')!);

  expect(navigate).toHaveBeenCalledWith('https://www.google.com/search?q=edge%20themes');
});

it('keeps the query controlled when its value is supplied', async () => {
  const onQueryChange = vi.fn();
  render(
    <SearchBox
      query="docs"
      onQueryChange={onQueryChange}
      searchTemplate="https://search.test/?q=%s"
      navigate={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'docs!' } });

  expect(screen.getByRole('combobox')).toHaveValue('docs');
  expect(onQueryChange).toHaveBeenCalledWith('docs!');
});

function setupSearch() {
  const navigate = vi.fn();
  const onBookmarkOpen = vi.fn().mockResolvedValue(undefined);
  const snapshot = createDefaultSnapshot();
  snapshot.groups.push({ id: 'reading', name: '阅读', order: 1, updatedAt: 0 });
  snapshot.bookmarks[0]!.groupId = 'reading';
  render(<SearchBox snapshot={snapshot} searchTemplate="https://search.test/?q=%s" navigate={navigate} onBookmarkOpen={onBookmarkOpen} />);
  const input = screen.getByRole('combobox');
  input.focus();
  return { input, navigate, onBookmarkOpen, snapshot };
}

it('opens a cross-group bookmark with mouse and records exactly once', async () => {
  const { input, navigate, onBookmarkOpen, snapshot } = setupSearch();
  fireEvent.change(input, { target: { value: 'gthb' } });
  const result = screen.getByRole('option', { name: /GitHub/ });
  expect(result).toHaveTextContent('阅读');
  fireEvent.mouseDown(within(result).getByRole('button'));
  expect(input).toHaveFocus();
  fireEvent.click(within(result).getByRole('button'));
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://github.com/'));
  expect(onBookmarkOpen).toHaveBeenCalledExactlyOnceWith(snapshot.bookmarks[0]);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('selects with arrows, keeps focus, opens with Enter and closes with Escape', async () => {
  const { input, navigate, onBookmarkOpen } = setupSearch();
  fireEvent.change(input, { target: { value: 'mdn' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: /MDN Web Docs/ })).toHaveAttribute('aria-selected', 'true');
  expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: /MDN Web Docs/ }).id);
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: /搜索网页/ })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('https://developer.mozilla.org/'));
  expect(onBookmarkOpen).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: 'github' } });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(input).toHaveFocus();
  expect(input).toHaveValue('github');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: /GitHub/ })).toHaveAttribute('aria-selected', 'true');
});

it('preserves direct URL and web search actions and shows the empty state', () => {
  const { input, navigate, onBookmarkOpen } = setupSearch();
  fireEvent.change(input, { target: { value: 'github.com' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(navigate).toHaveBeenLastCalledWith('https://github.com/');
  expect(onBookmarkOpen).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'missing-bookmark-xyz' } });
  expect(screen.getByRole('status')).toHaveTextContent('未找到匹配书签');
  fireEvent.click(screen.getByRole('button', { name: '搜索或打开所选结果' }));
  expect(navigate).toHaveBeenLastCalledWith('https://search.test/?q=missing-bookmark-xyz');
  fireEvent.change(input, { target: { value: '' } });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('does not navigate or select while Chinese IME is composing', () => {
  const { input, navigate, onBookmarkOpen } = setupSearch();
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '中文' } });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.submit(input.closest('form')!);
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input);
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(navigate).toHaveBeenCalledWith('https://search.test/?q=%E4%B8%AD%E6%96%87');
  expect(onBookmarkOpen).not.toHaveBeenCalled();
});

it('closes suggestions when focus leaves search and handles invalid URLs inline', () => {
  const { input, navigate } = setupSearch();
  fireEvent.change(input, { target: { value: 'https://[' } });
  expect(screen.getByRole('option')).toHaveTextContent('请输入有效的网址');
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(navigate).not.toHaveBeenCalled();
  fireEvent.blur(input, { relatedTarget: document.body });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

it('honors a keyboard selection when the browser submits through the submit button', async () => {
  const { input, navigate, onBookmarkOpen } = setupSearch();
  fireEvent.change(input, { target: { value: 'GitHub' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith('https://github.com/'));
  expect(onBookmarkOpen).toHaveBeenCalledTimes(1);
});
