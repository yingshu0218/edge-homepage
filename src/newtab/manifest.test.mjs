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
});
