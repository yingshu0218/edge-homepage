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

describe('weather overview layout CSS', () => {
  it('keeps the dashboard column responsive without horizontal overflow', () => {
    expect(css).toMatch(/\.dashboard-column\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.weather-overview-card\s*\{[^}]*width:\s*100%[^}]*min-height:\s*310px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*980px\)[\s\S]*\.workspace\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('keeps hourly and state text legible on the light glass card', () => {
    expect(css).toContain('[data-appearance="light"] .weather-overview-hours time { color: rgba(24,35,51,.62); }');
    expect(css).toContain('[data-appearance="light"] .weather-overview-card [role="status"] { color: rgba(24,35,51,.68); }');
    expect(css).toContain('[data-appearance="light"] .weather-overview-card [role="alert"] { color: #9a3412; }');
  });
});

describe('drawer palette CSS', () => {
  it('keeps every drawer on an explicit dark palette in light appearance', () => {
    expect(css).toMatch(/\.drawer \{[^}]*--drawer-text: #f5f2fb;[^}]*--drawer-muted: rgba\(245,242,251,\.66\);[^}]*background: #191529;[^}]*color: var\(--drawer-text\);[^}]*color-scheme: dark;/);
    expect(css).toContain('.drawer :where(header, section, form, fieldset, h1, h2, h3, p, label, legend, time, output) { color: inherit; }');
    expect(css).toMatch(/\.drawer :where\(input:not\(\[type="range"\]\), select\) \{[^}]*background: var\(--drawer-control\);[^}]*color: var\(--drawer-text\);/);
    expect(css).toContain('.drawer :where(button) { color: inherit; }');
    expect(css).toContain('.drawer input::placeholder { color: var(--drawer-muted); }');
    expect(css).not.toMatch(/\[data-appearance="light"\] \.weather-(?!overview)/);
  });
});
