import { describe, expect, it } from 'vitest';

import { createDefaultSnapshot } from '../domain/defaults';
import { exportSnapshot, parseSnapshot } from './transfer';

describe('snapshot transfer', () => {
  it('round-trips a versioned snapshot', async () => {
    const snapshot = createDefaultSnapshot();
    const text = await exportSnapshot(snapshot).text();

    expect(JSON.parse(text)).toMatchObject({ app: 'day-start', exportedAt: expect.any(String), snapshot });
    expect(parseSnapshot(text)).toEqual(snapshot);
  });

  it('migrates a schema-1 backup to schema 2', () => {
    const v1 = createDefaultSnapshot() as unknown as Record<string, unknown>;
    v1.schemaVersion = 1;
    const settings = { ...(v1.settings as Record<string, unknown>) };
    delete settings.bookmarkDisplayLimit;
    delete settings.clockHour12;
    delete settings.clockShowSeconds;
    delete settings.clockShowFullDate;
    delete settings.temperatureUnit;
    delete settings.weatherLocation;
    v1.settings = settings;

    expect(parseSnapshot(JSON.stringify(v1)).schemaVersion).toBe(2);
  });

  it('rejects unknown schemas before writing', () => {
    expect(() => parseSnapshot('{"schemaVersion":99}')).toThrow('Unsupported backup schema');
  });

  it('rejects malformed JSON and incomplete settings', () => {
    expect(() => parseSnapshot('{oops')).toThrow('Invalid backup JSON');
    const snapshot = createDefaultSnapshot() as unknown as Record<string, unknown>;
    snapshot.settings = { themeId: 'aurora' };
    expect(() => parseSnapshot(JSON.stringify({ app: 'day-start', exportedAt: new Date().toISOString(), snapshot }))).toThrow(
      'Invalid backup',
    );
  });

  it('requires exportedAt to be a canonical ISO timestamp', () => {
    const snapshot = createDefaultSnapshot();
    for (const exportedAt of ['0', '2026-07-16', '2026-07-16T01:02:03Z']) {
      expect(() => parseSnapshot(JSON.stringify({ app: 'day-start', exportedAt, snapshot }))).toThrow('Invalid backup');
    }
    expect(() => parseSnapshot(JSON.stringify({ app: 'day-start', exportedAt: '2026-07-16T01:02:03.000Z', snapshot }))).not.toThrow();
  });

  it('rejects invalid bookmark URLs, empty IDs, and dangling group references', () => {
    const invalidUrl = createDefaultSnapshot();
    invalidUrl.bookmarks[0]!.url = 'javascript:alert(1)';
    expect(() => parseSnapshot(JSON.stringify({ app: 'day-start', exportedAt: new Date().toISOString(), snapshot: invalidUrl }))).toThrow('Invalid backup');

    const emptyId = createDefaultSnapshot();
    emptyId.groups[0]!.id = '';
    expect(() => parseSnapshot(JSON.stringify({ app: 'day-start', exportedAt: new Date().toISOString(), snapshot: emptyId }))).toThrow('Invalid backup');

    const dangling = createDefaultSnapshot();
    dangling.bookmarks[0]!.groupId = 'missing';
    expect(() => parseSnapshot(JSON.stringify({ app: 'day-start', exportedAt: new Date().toISOString(), snapshot: dangling }))).toThrow('Invalid backup');
  });
});
