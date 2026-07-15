const auroraImage = new URL('../../assets/themes/aurora.webp', import.meta.url).href;
const duskImage = new URL('../../assets/themes/dusk.webp', import.meta.url).href;
const emberImage = new URL('../../assets/themes/ember.webp', import.meta.url).href;
const forestImage = new URL('../../assets/themes/forest.webp', import.meta.url).href;
const oceanImage = new URL('../../assets/themes/ocean.webp', import.meta.url).href;
const violetImage = new URL('../../assets/themes/violet.webp', import.meta.url).href;

export type ThemeDefinition = {
  id: string;
  name: string;
  imageUrl: string;
  textColor: string;
  accentColor: string;
  overlay: number;
  defaultAppearance: 'light' | 'dark';
};

export const BUILT_IN_THEMES: readonly ThemeDefinition[] = [
  {
    id: 'aurora',
    name: '极光',
    imageUrl: auroraImage,
    textColor: '#f2fbff',
    accentColor: '#69e8c5',
    overlay: 0.38,
    defaultAppearance: 'dark',
  },
  {
    id: 'dusk',
    name: '暮色',
    imageUrl: duskImage,
    textColor: '#fff5ee',
    accentColor: '#ff9f80',
    overlay: 0.4,
    defaultAppearance: 'dark',
  },
  {
    id: 'forest',
    name: '幽林',
    imageUrl: forestImage,
    textColor: '#f3fff8',
    accentColor: '#8ed6a5',
    overlay: 0.42,
    defaultAppearance: 'dark',
  },
  {
    id: 'ocean',
    name: '深海',
    imageUrl: oceanImage,
    textColor: '#f1f8ff',
    accentColor: '#65c9ff',
    overlay: 0.4,
    defaultAppearance: 'dark',
  },
  {
    id: 'ember',
    name: '余烬',
    imageUrl: emberImage,
    textColor: '#fff8f1',
    accentColor: '#f39a55',
    overlay: 0.36,
    defaultAppearance: 'dark',
  },
  {
    id: 'violet',
    name: '星云',
    imageUrl: violetImage,
    textColor: '#faf5ff',
    accentColor: '#c49aff',
    overlay: 0.39,
    defaultAppearance: 'dark',
  },
] as const;

export const DEFAULT_THEME = BUILT_IN_THEMES[0];

export function findBuiltInTheme(id: string): ThemeDefinition | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id);
}
