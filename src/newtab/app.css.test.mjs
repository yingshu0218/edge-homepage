import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/newtab/app.css'), 'utf8');

describe('compact topbar CSS', () => {
  it('preserves controls while progressively hiding only secondary summary content', () => {
    expect(css).toContain('.topbar { width: min(1160px, 100%); min-width: 0;');
    expect(css).toContain('.brand { flex: 0 0 auto;');
    expect(css).toContain('.top-actions { min-width: 0; display: flex; flex: 1 1 auto;');
    expect(css).toContain('.summary-button { min-width: 0;');
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.weather-summary-location, \.clock-summary-seconds \{ display: none; \}/);
    expect(css).toMatch(/@media \(max-width: 430px\)[\s\S]*?\.top-actions \{ gap: 4px; \}/);
  });
});
