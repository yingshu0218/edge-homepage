import { describe, expect, it } from 'vitest';
import { normalizeDestination } from './url';

describe('normalizeDestination', () => {
  it('keeps explicit https URLs', () => expect(normalizeDestination('https://example.com', 'https://www.google.com/search?q=%s')).toBe('https://example.com/'));
  it('adds https to hostnames', () => expect(normalizeDestination('example.com/docs', 'https://www.google.com/search?q=%s')).toBe('https://example.com/docs'));
  it('turns other text into a search', () => expect(normalizeDestination('edge start page', 'https://www.google.com/search?q=%s')).toBe('https://www.google.com/search?q=edge%20start%20page'));
});
