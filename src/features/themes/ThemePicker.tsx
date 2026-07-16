import { useId, useState, type ChangeEvent } from 'react';

import { BackgroundStore } from '../../storage/backgroundStore';
import { BUILT_IN_THEMES } from './themes';

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2560;
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export type BackgroundProcessor = (file: File) => Promise<Blob>;

export function validateBackgroundFile(file: File): void {
  if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
    throw new Error('请选择 JPEG、PNG、WebP 或 AVIF 图片');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('图片不能超过 12 MB');
  }
}

export async function processCustomBackground(file: File): Promise<Blob> {
  validateBackgroundFile(file);
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');

  if (!context) {
    bitmap.close();
    throw new Error('当前浏览器无法处理该图片');
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!result) {
    throw new Error('图片压缩失败');
  }
  return result;
}

export type ThemePickerProps = {
  selectedThemeId: string;
  useCustomBackground: boolean;
  appearance?: 'light' | 'dark';
  overlay?: number;
  blur?: number;
  backgroundStore?: Pick<BackgroundStore, 'put'>;
  onThemeChange: (themeId: string, recommended?: { appearance: 'light' | 'dark'; overlay: number }) => void;
  onCustomBackgroundChange: (enabled: boolean) => void;
  onAppearanceChange?: (changes: Partial<{ appearance: 'light' | 'dark'; overlay: number; blur: number }>) => void;
  processImage?: BackgroundProcessor;
};

export function ThemePicker({
  selectedThemeId,
  useCustomBackground,
  appearance = 'dark',
  overlay = 0.38,
  blur = 0,
  backgroundStore = new BackgroundStore(),
  onThemeChange,
  onCustomBackgroundChange,
  onAppearanceChange = () => undefined,
  processImage = processCustomBackground,
}: ThemePickerProps) {
  const uploadId = useId();
  const [error, setError] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);

  const selectBuiltInTheme = (themeId: string) => {
    const theme = BUILT_IN_THEMES.find(({ id }) => id === themeId);
    onThemeChange(themeId, theme ? { appearance: theme.defaultAppearance, overlay: theme.overlay } : undefined);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(undefined);
    setIsProcessing(true);
    try {
      validateBackgroundFile(file);
      const background = await processImage(file);
      await backgroundStore.put(background);
      onCustomBackgroundChange(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法处理该图片');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <section aria-label="主题">
      <div role="list" aria-label="内置主题">
        {BUILT_IN_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="listitem"
            aria-label={theme.name}
            aria-pressed={!useCustomBackground && selectedThemeId === theme.id}
            onClick={() => selectBuiltInTheme(theme.id)}
          >
            <img src={theme.imageUrl} alt="" />
            <span className="theme-card-caption"><b>{theme.name}</b><i aria-label={`${theme.name}强调色`} style={{ backgroundColor: theme.accentColor }} />{!useCustomBackground && selectedThemeId === theme.id && <em>✓ 已选择</em>}</span>
          </button>
        ))}
      </div>
      <div className="theme-controls">
        <label>外观模式<select value={appearance} onChange={(event) => onAppearanceChange({ appearance: event.target.value as 'light' | 'dark' })}><option value="dark">深色</option><option value="light">浅色</option></select></label>
        <label>遮罩强度 <output>{Math.round(overlay * 100)}%</output><input aria-label="遮罩强度" type="range" min="0" max="0.8" step="0.05" value={overlay} onChange={(event) => onAppearanceChange({ overlay: Number(event.target.value) })} /></label>
        <label>背景模糊 <output>{blur}px</output><input aria-label="背景模糊" type="range" min="0" max="24" step="1" value={blur} onChange={(event) => onAppearanceChange({ blur: Number(event.target.value) })} /></label>
      </div>
      <p className="custom-background-status">{useCustomBackground ? '当前使用自定义背景' : '当前使用内置主题'}</p>
      <label htmlFor={uploadId}>{isProcessing ? '正在处理…' : '上传自定义背景'}</label>
      <input
        id={uploadId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        disabled={isProcessing}
        onChange={upload}
      />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
