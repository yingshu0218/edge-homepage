import type { AppSettings } from '../../domain/models';
import { DEFAULT_THEME, findBuiltInTheme, type ThemeDefinition } from './themes';

export type ResolvedTheme = Omit<ThemeDefinition, 'defaultAppearance'> & {
  appearance: 'light' | 'dark';
  blur: number;
  isCustom: boolean;
};

export function resolveTheme(settings: AppSettings, customBackground?: Blob): ResolvedTheme {
  const selected = settings.useCustomBackground && !customBackground
    ? DEFAULT_THEME
    : (findBuiltInTheme(settings.themeId) ?? DEFAULT_THEME);

  if (settings.useCustomBackground && customBackground) {
    return {
      ...selected,
      id: 'custom',
      name: '自定义',
      imageUrl: URL.createObjectURL(customBackground),
      appearance: settings.appearance,
      overlay: settings.overlay,
      blur: settings.blur,
      isCustom: true,
    };
  }

  return {
    ...selected,
    appearance: settings.appearance,
    overlay: settings.overlay,
    blur: settings.blur,
    isCustom: false,
  };
}

export function applyResolvedTheme(theme: ResolvedTheme, root: HTMLElement = document.documentElement): void {
  root.dataset.appearance = theme.appearance;
  root.style.setProperty('--theme-background-image', `url("${theme.imageUrl}")`);
  root.style.setProperty('--theme-text-color', theme.textColor);
  root.style.setProperty('--theme-accent-color', theme.accentColor);
  root.style.setProperty('--theme-overlay', String(theme.overlay));
  root.style.setProperty('--theme-blur', `${theme.blur}px`);
}
