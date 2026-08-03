import { describe, expect, it } from 'vitest';

import { createDefaultSnapshot } from './defaults';
import { migrateSnapshot } from './snapshotValidator';

function schema1Snapshot() {
  const snapshot = createDefaultSnapshot() as unknown as Record<string, unknown>;
  snapshot.schemaVersion = 1;
  const settings = { ...(snapshot.settings as Record<string, unknown>) };
  delete settings.bookmarkDisplayLimit;
  delete settings.clockHour12;
  delete settings.clockShowSeconds;
  delete settings.clockShowFullDate;
  delete settings.temperatureUnit;
  delete settings.weatherLocation;
  snapshot.settings = settings;
  return snapshot;
}

describe('migrateSnapshot', () => {
  it('migrates a schema-1 snapshot with the schema-2 settings defaults', () => {
    const v1 = schema1Snapshot();

    expect(migrateSnapshot(v1, 'local snapshot').settings).toMatchObject({
      bookmarkDisplayLimit: 8,
      clockHour12: false,
      clockShowSeconds: false,
      clockShowFullDate: true,
      temperatureUnit: 'celsius',
    });
    expect(migrateSnapshot(v1, 'local snapshot').schemaVersion).toBe(2);
  });

  it('preserves explicit schema-2 local settings and weather location', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings = {
      ...snapshot.settings,
      bookmarkDisplayLimit: 16,
      clockHour12: true,
      clockShowSeconds: true,
      clockShowFullDate: false,
      temperatureUnit: 'fahrenheit',
      weatherLocation: {
        id: '5391959',
        name: 'San Francisco',
        admin: 'California',
        country: 'United States',
        latitude: 37.7749,
        longitude: -122.4194,
        timezone: 'America/Los_Angeles',
      },
    };

    expect(migrateSnapshot(snapshot, 'local snapshot')).toEqual(snapshot);
  });

  it('preserves valid bookmark opening statistics', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks[0] = {
      ...snapshot.bookmarks[0]!,
      totalOpenCount: 4,
      recentOpenTimestamps: [10, 20, 30],
    };

    expect(migrateSnapshot(snapshot, 'local snapshot')).toEqual(snapshot);
  });

  it.each([
    ['an unsupported bookmark display limit', (snapshot: Record<string, unknown>) => {
      (snapshot.settings as Record<string, unknown>).bookmarkDisplayLimit = 10;
    }],
    ['a malformed weather coordinate', (snapshot: Record<string, unknown>) => {
      (snapshot.settings as Record<string, unknown>).weatherLocation = {
        id: '1', name: 'Beijing', country: 'China', latitude: 91, longitude: 116.4, timezone: 'Asia/Shanghai',
      };
    }],
    ['an unknown temperature unit', (snapshot: Record<string, unknown>) => {
      (snapshot.settings as Record<string, unknown>).temperatureUnit = 'kelvin';
    }],
    ['malformed bookmark opening statistics', (snapshot: Record<string, unknown>) => {
      ((snapshot.bookmarks as Record<string, unknown>[])[0]!).recentOpenTimestamps = [10, -1];
    }],
  ])('fails closed for %s', (_label, mutate) => {
    const snapshot = createDefaultSnapshot() as unknown as Record<string, unknown>;
    mutate(snapshot);

    expect(() => migrateSnapshot(snapshot, 'local snapshot')).toThrow('Corrupted local snapshot');
  });

  it('fails closed for unknown schema versions', () => {
    const snapshot = { ...createDefaultSnapshot(), schemaVersion: 99 };

    expect(() => migrateSnapshot(snapshot, 'local snapshot')).toThrow('unsupported schema 99');
  });
});
