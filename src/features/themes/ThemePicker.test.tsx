import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackgroundStore } from '../../storage/backgroundStore';
import { processCustomBackground, ThemePicker, validateBackgroundFile } from './ThemePicker';

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

describe('processCustomBackground', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('scales the longest edge to 2560 and encodes WebP through canvas', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 5120, height: 2880, close }));
    const drawImage = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
      expect(type).toBe('image/webp');
      callback(new Blob(['encoded'], { type: 'image/webp' }));
    });
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage })), toBlob };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);

    const result = await processCustomBackground(new File(['raw'], 'wide.png', { type: 'image/png' }));

    expect(canvas).toMatchObject({ width: 2560, height: 1440 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2560, 1440);
    expect(result.type).toBe('image/webp');
    expect(close).toHaveBeenCalled();
  });

  it('fails clearly when a 2D canvas context is unavailable', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600, close }));
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => null) };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);

    await expect(processCustomBackground(new File(['raw'], 'scene.png', { type: 'image/png' }))).rejects.toThrow(
      '当前浏览器无法处理该图片',
    );
    expect(close).toHaveBeenCalled();
  });

  it('fails clearly when WebP encoding returns no blob', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600, close }));
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) => callback(null)),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLCanvasElement);

    await expect(processCustomBackground(new File(['raw'], 'scene.webp', { type: 'image/webp' }))).rejects.toThrow(
      '图片压缩失败',
    );
    expect(close).toHaveBeenCalled();
  });
});
