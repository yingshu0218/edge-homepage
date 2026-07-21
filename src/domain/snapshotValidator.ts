import type { AppSettings, AppSnapshot, Bookmark, BookmarkGroup, WeatherLocation } from './models';

type Schema1Settings = Omit<AppSettings, 'bookmarkDisplayLimit' | 'clockHour12' | 'clockShowSeconds' | 'clockShowFullDate' | 'temperatureUnit' | 'weatherLocation'>;
type Schema1Snapshot = {
  schemaVersion: 1;
  bookmarks: Bookmark[];
  groups: BookmarkGroup[];
  settings: Schema1Settings;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const timestamp = (value: unknown): value is number => finite(value) && value >= 0;
const order = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value: Record<string, unknown>, required: string[], optional: string[] = []) => {
  const keys = Object.keys(value);
  return required.every((key) => key in value) && keys.every((key) => required.includes(key) || optional.includes(key));
};

function safeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

function isGroup(value: unknown): value is BookmarkGroup {
  return isObject(value) && exactKeys(value, ['id', 'name', 'order', 'updatedAt'], ['deletedAt'])
    && nonEmpty(value.id) && nonEmpty(value.name) && order(value.order) && timestamp(value.updatedAt)
    && (value.deletedAt === undefined || timestamp(value.deletedAt));
}

function isBookmark(value: unknown): value is Bookmark {
  return isObject(value) && exactKeys(value, ['id', 'title', 'url', 'groupId', 'order', 'createdAt', 'updatedAt'], ['deletedAt'])
    && nonEmpty(value.id) && nonEmpty(value.title) && safeHttpUrl(value.url) && nonEmpty(value.groupId) && order(value.order)
    && timestamp(value.createdAt) && timestamp(value.updatedAt) && (value.deletedAt === undefined || timestamp(value.deletedAt));
}

function hasBaseSettings(value: Record<string, unknown>): boolean {
  return nonEmpty(value.searchTemplate) && value.searchTemplate.includes('%s') && safeHttpUrl(value.searchTemplate.replace('%s', 'query'))
    && nonEmpty(value.themeId) && (value.appearance === 'light' || value.appearance === 'dark')
    && finite(value.overlay) && value.overlay >= 0 && value.overlay <= 1
    && finite(value.blur) && value.blur >= 0 && value.blur <= 24
    && typeof value.useCustomBackground === 'boolean' && timestamp(value.updatedAt);
}

function isSchema1Settings(value: unknown): value is Schema1Settings {
  return isObject(value) && exactKeys(value, ['searchTemplate', 'themeId', 'appearance', 'overlay', 'blur', 'useCustomBackground', 'updatedAt'])
    && hasBaseSettings(value);
}

function isWeatherLocation(value: unknown): value is WeatherLocation {
  return isObject(value) && exactKeys(value, ['id', 'name', 'country', 'latitude', 'longitude', 'timezone'], ['admin'])
    && nonEmpty(value.id) && nonEmpty(value.name) && nonEmpty(value.country) && nonEmpty(value.timezone)
    && (value.admin === undefined || nonEmpty(value.admin))
    && finite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
    && finite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

function isSchema2Settings(value: unknown): value is AppSettings {
  if (!isObject(value) || !exactKeys(value, [
    'searchTemplate', 'themeId', 'appearance', 'overlay', 'blur', 'useCustomBackground',
    'bookmarkDisplayLimit', 'clockHour12', 'clockShowSeconds', 'clockShowFullDate', 'temperatureUnit', 'updatedAt',
  ], ['weatherLocation'])) return false;
  return hasBaseSettings(value) && [8, 12, 16].includes(value.bookmarkDisplayLimit as number)
    && typeof value.clockHour12 === 'boolean' && typeof value.clockShowSeconds === 'boolean'
    && typeof value.clockShowFullDate === 'boolean' && (value.temperatureUnit === 'celsius' || value.temperatureUnit === 'fahrenheit')
    && (value.weatherLocation === undefined || isWeatherLocation(value.weatherLocation));
}

export class SnapshotCorruptionError extends Error {
  constructor(source: string, detail = 'invalid snapshot structure') {
    super(`Corrupted ${source}: ${detail}`);
    this.name = 'SnapshotCorruptionError';
  }
}

function validatedRecords(value: unknown, source: string): { bookmarks: Bookmark[]; groups: BookmarkGroup[] } {
  if (!isObject(value) || !exactKeys(value, ['schemaVersion', 'bookmarks', 'groups', 'settings']) || !Array.isArray(value.groups)
    || !Array.isArray(value.bookmarks) || !value.groups.every(isGroup) || !value.bookmarks.every(isBookmark)) {
    throw new SnapshotCorruptionError(source);
  }
  const groups = value.groups as BookmarkGroup[];
  const bookmarks = value.bookmarks as Bookmark[];
  const groupIds = new Set(groups.map(({ id }) => id));
  if (groupIds.size !== groups.length || new Set(bookmarks.map(({ id }) => id)).size !== bookmarks.length) {
    throw new SnapshotCorruptionError(source, 'duplicate record id');
  }
  if (bookmarks.some(({ groupId }) => !groupIds.has(groupId))) throw new SnapshotCorruptionError(source, 'bookmark references a missing group');
  const deletedGroups = new Set(groups.filter(({ deletedAt }) => deletedAt !== undefined).map(({ id }) => id));
  if (bookmarks.some(({ deletedAt, groupId }) => deletedAt === undefined && deletedGroups.has(groupId))) {
    throw new SnapshotCorruptionError(source, 'active bookmark references a deleted group');
  }
  const activeGroupOrders = groups.filter(({ deletedAt }) => deletedAt === undefined).map(({ order }) => order);
  if (new Set(activeGroupOrders).size !== activeGroupOrders.length) throw new SnapshotCorruptionError(source, 'duplicate active group order');
  for (const group of groups) {
    const activeBookmarkOrders = bookmarks.filter((bookmark) => bookmark.groupId === group.id && bookmark.deletedAt === undefined).map(({ order }) => order);
    if (new Set(activeBookmarkOrders).size !== activeBookmarkOrders.length) throw new SnapshotCorruptionError(source, `duplicate bookmark order in group ${group.id}`);
  }
  return { bookmarks, groups };
}

function validateSchema1(value: unknown, source: string): Schema1Snapshot {
  const { bookmarks, groups } = validatedRecords(value, source);
  if (!isObject(value) || value.schemaVersion !== 1 || !isSchema1Settings(value.settings)) {
    throw new SnapshotCorruptionError(source);
  }
  return { schemaVersion: 1, bookmarks, groups, settings: value.settings };
}

function validateSchema2(value: unknown, source: string): AppSnapshot {
  const { bookmarks, groups } = validatedRecords(value, source);
  if (!isObject(value) || value.schemaVersion !== 2 || !isSchema2Settings(value.settings)) {
    throw new SnapshotCorruptionError(source);
  }
  return { schemaVersion: 2, bookmarks, groups, settings: value.settings };
}

export function migrateSnapshot(value: unknown, source: string): AppSnapshot {
  if (!isObject(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) {
    throw new SnapshotCorruptionError(source, `unsupported schema ${String(value && isObject(value) ? value.schemaVersion : undefined)}`);
  }
  if (value.schemaVersion === 2) return validateSchema2(value, source);

  const snapshot = validateSchema1(value, source);
  return {
    schemaVersion: 2,
    bookmarks: snapshot.bookmarks,
    groups: snapshot.groups,
    settings: {
      ...snapshot.settings,
      bookmarkDisplayLimit: 8,
      clockHour12: false,
      clockShowSeconds: false,
      clockShowFullDate: true,
      temperatureUnit: 'celsius',
    },
  };
}

export function validateSnapshot(value: unknown, source: string): AppSnapshot {
  return migrateSnapshot(value, source);
}
