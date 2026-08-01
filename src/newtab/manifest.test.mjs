import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('extension weather permissions', () => {
  it('grants only the documented weather and reverse-geocoding hosts', async () => {
    const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
    expect(manifest.host_permissions).toEqual([
      'https://geocoding-api.open-meteo.com/*',
      'https://api.open-meteo.com/*',
      'https://api.bigdatacloud.net/*',
    ]);
  });

  it('uses the browser favicon API without broad website host permissions', async () => {
    const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
    expect(manifest.permissions).toContain('favicon');
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions).not.toContain('https://*/*');
  });
});
