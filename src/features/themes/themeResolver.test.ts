import { createDefaultSnapshot } from '../../domain/defaults';
import { describe, expect, it, vi } from 'vitest';
import { resolveTheme } from './themeResolver';
import { BUILT_IN_THEMES } from './themes';

describe('resolveTheme', () => {
  it('falls back to aurora when a custom background is absent', () => {
    const settings = { ...createDefaultSnapshot().settings, useCustomBackground: true };

    expect(resolveTheme(settings, undefined).id).toBe('aurora');
  });

  it('falls back to aurora when a selected non-default theme loses its custom background', () => {
    const settings = {
      ...createDefaultSnapshot().settings,
      themeId: 'ember',
      useCustomBackground: true,
    };

    expect(resolveTheme(settings, undefined).id).toBe('aurora');
  });

  it('resolves a selected built-in theme and keeps setting overrides', () => {
    const settings = {
      ...createDefaultSnapshot().settings,
      themeId: 'ember',
      appearance: 'light' as const,
      overlay: 0.6,
    };

    expect(resolveTheme(settings, undefined)).toMatchObject({
      id: 'ember',
      appearance: 'light',
      overlay: 0.6,
    });
  });

  it('uses a local object URL when a custom background is present', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:custom');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    const settings = { ...createDefaultSnapshot().settings, useCustomBackground: true };
    const blob = new Blob(['image'], { type: 'image/webp' });

    expect(resolveTheme(settings, blob)).toMatchObject({ id: 'custom', imageUrl: 'blob:custom' });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('falls back to aurora for an unknown built-in id', () => {
    const settings = { ...createDefaultSnapshot().settings, themeId: 'missing' };

    expect(resolveTheme(settings, undefined).id).toBe('aurora');
  });

  it('ships six complete built-in theme definitions', () => {
    expect(BUILT_IN_THEMES).toHaveLength(6);
    expect(new Set(BUILT_IN_THEMES.map((theme) => theme.id)).size).toBe(6);
    for (const theme of BUILT_IN_THEMES) {
      expect(theme).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        imageUrl: expect.stringContaining('.webp'),
        textColor: expect.stringMatching(/^#/),
        accentColor: expect.stringMatching(/^#/),
        overlay: expect.any(Number),
        defaultAppearance: expect.stringMatching(/^(light|dark)$/),
      });
    }
  });
});
