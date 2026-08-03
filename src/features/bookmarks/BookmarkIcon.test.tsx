import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookmarkIcon, iconColor } from './BookmarkIcon';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BookmarkIcon', () => {
  it('derives a stable color', () => {
    expect(iconColor('github.com')).toBe(iconColor('github.com'));
    expect(iconColor('github.com')).not.toBe(iconColor('example.com'));
  });

  it('shows a cached icon and falls back after image failure', async () => {
    const blob = new Blob(['icon'], { type: 'image/png' });
    render(<BookmarkIcon
      title=" GitHub"
      url="https://github.com/"
      loadIcon={async () => ({ blob, updated: false })}
      createObjectUrl={() => 'blob:cached-icon'}
    />);
    const image = await screen.findByRole('img', { name: 'GitHub 图标' });
    fireEvent.error(image);
    expect(screen.queryByRole('img', { name: 'GitHub 图标' })).not.toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('shows the local initial until an icon is available', async () => {
    render(<BookmarkIcon title="文档" url="not a url" loadIcon={async () => ({ updated: false })} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('文')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('img')).not.toBeInTheDocument());
  });

  it('shows the browser-managed favicon immediately while persistent cache loads', () => {
    vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => `chrome-extension://test/${path}` } });
    render(<BookmarkIcon title="GitHub" url="https://github.com/" loadIcon={() => new Promise(() => {})} />);

    expect(screen.getByRole('img', { name: 'GitHub 图标' })).toHaveAttribute(
      'src',
      'chrome-extension://test/_favicon/?pageUrl=https%3A%2F%2Fgithub.com%2F&size=32',
    );
  });
});
