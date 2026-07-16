import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BookmarkIcon, faviconUrl, iconColor } from './BookmarkIcon';

afterEach(cleanup);

describe('BookmarkIcon', () => {
  it('derives the site root favicon and a stable color', () => {
    expect(faviconUrl('https://github.com/org/repo')).toBe('https://github.com/favicon.ico');
    expect(iconColor('github.com')).toBe(iconColor('github.com'));
    expect(iconColor('github.com')).not.toBe(iconColor('example.com'));
  });

  it('falls back to the first visible character after image failure', () => {
    render(<BookmarkIcon title=" GitHub" url="https://github.com/" />);
    const image = screen.getByRole('img', { name: 'GitHub 图标' });
    fireEvent.error(image);
    expect(screen.queryByRole('img', { name: 'GitHub 图标' })).not.toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('handles invalid URLs without rendering a broken image', () => {
    render(<BookmarkIcon title="文档" url="not a url" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('文')).toBeInTheDocument();
  });
});
