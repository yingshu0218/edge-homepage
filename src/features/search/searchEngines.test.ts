import { describe, expect, it } from 'vitest';

import { findSearchEngine, SEARCH_ENGINES } from './searchEngines';

describe('search engines', () => {
  it('provides the agreed mainstream presets', () => {
    expect(SEARCH_ENGINES.map(({ id }) => id)).toEqual([
      'google', 'bing', 'baidu', 'duckduckgo', 'brave', 'sogou', 'so360',
    ]);
  });

  it('matches known templates and leaves custom templates unmatched', () => {
    expect(findSearchEngine('https://www.google.com/search?q=%s')?.id).toBe('google');
    expect(findSearchEngine('https://private.example/?q=%s')).toBeUndefined();
  });
});
