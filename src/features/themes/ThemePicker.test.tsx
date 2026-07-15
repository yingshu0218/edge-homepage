import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackgroundStore } from '../../storage/backgroundStore';
import { ThemePicker, validateBackgroundFile } from './ThemePicker';

afterEach(cleanup);

describe('custom background upload', () => {
  it('accepts supported image formats and rejects unsupported files', () => {
    expect(() => validateBackgroundFile(new File(['x'], 'scene.avif', { type: 'image/avif' }))).not.toThrow();
    expect(() => validateBackgroundFile(new File(['x'], 'scene.gif', { type: 'image/gif' }))).toThrow(
      '请选择 JPEG、PNG、WebP 或 AVIF 图片',
    );
  });

  it('rejects images above 12 MB', () => {
    const file = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: 12 * 1024 * 1024 + 1 });

    expect(() => validateBackgroundFile(file)).toThrow('图片不能超过 12 MB');
  });

  it('persists the processed WebP and selects the custom theme', async () => {
    const store = { put: vi.fn().mockResolvedValue(undefined) } as unknown as BackgroundStore;
    const onCustomBackgroundChange = vi.fn();
    const processImage = vi.fn().mockResolvedValue(new Blob(['webp'], { type: 'image/webp' }));
    render(
      <ThemePicker
        selectedThemeId="aurora"
        useCustomBackground={false}
        backgroundStore={store}
        onThemeChange={vi.fn()}
        onCustomBackgroundChange={onCustomBackgroundChange}
        processImage={processImage}
      />,
    );

    fireEvent.change(screen.getByLabelText('上传自定义背景'), {
      target: { files: [new File(['raw'], 'scene.png', { type: 'image/png' })] },
    });

    await waitFor(() => expect(store.put).toHaveBeenCalled());
    expect(onCustomBackgroundChange).toHaveBeenCalledWith(true);
  });
});
