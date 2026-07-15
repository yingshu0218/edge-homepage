import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchBox } from './SearchBox';

afterEach(cleanup);

it('submits search text to the normalized destination', async () => {
  const navigate = vi.fn();
  render(<SearchBox searchTemplate="https://www.google.com/search?q=%s" navigate={navigate} />);

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'edge themes' } });
  fireEvent.submit(screen.getByRole('searchbox').closest('form')!);

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

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'docs!' } });

  expect(screen.getByRole('searchbox')).toHaveValue('docs');
  expect(onQueryChange).toHaveBeenCalledWith('docs!');
});
