import type { AppSettings, AppSnapshot, Bookmark, BookmarkGroup } from '../domain/models';

type BackupEnvelope = {
  app: 'day-start';
  exportedAt: string;
  snapshot: AppSnapshot;
};

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const nonEmpty = (value: unknown): value is string => string(value) && value.trim().length > 0;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const optionalTimestamp = (value: unknown): boolean => value === undefined || finite(value);
const exactKeys = (value: Record<string, unknown>, required: string[], optional: string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every((key) => key in value) && keys.every((key) => required.includes(key) || optional.includes(key));
};

function validUrl(value: unknown): value is string {
  if (!string(value)) return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function validGroup(value: unknown): value is BookmarkGroup {
  return object(value)
    && exactKeys(value, ['id', 'name', 'order', 'updatedAt'], ['deletedAt'])
    && nonEmpty(value.id) && nonEmpty(value.name) && finite(value.order)
    && finite(value.updatedAt) && optionalTimestamp(value.deletedAt);
}

function validBookmark(value: unknown): value is Bookmark {
  return object(value)
    && exactKeys(value, ['id', 'title', 'url', 'groupId', 'order', 'createdAt', 'updatedAt'], ['deletedAt'])
    && nonEmpty(value.id) && nonEmpty(value.title) && validUrl(value.url) && nonEmpty(value.groupId)
    && finite(value.order) && finite(value.createdAt) && finite(value.updatedAt) && optionalTimestamp(value.deletedAt);
}

function validSettings(value: unknown): value is AppSettings {
  if (!object(value) || !exactKeys(value, ['searchTemplate', 'themeId', 'appearance', 'overlay', 'blur', 'useCustomBackground', 'updatedAt'])) return false;
  return nonEmpty(value.searchTemplate) && value.searchTemplate.includes('%s') && validUrl(value.searchTemplate.replace('%s', 'query'))
    && nonEmpty(value.themeId) && (value.appearance === 'light' || value.appearance === 'dark')
    && finite(value.overlay) && value.overlay >= 0 && value.overlay <= 1
    && finite(value.blur) && value.blur >= 0
    && typeof value.useCustomBackground === 'boolean' && finite(value.updatedAt);
}

function validateSnapshot(value: unknown): AppSnapshot {
  if (!object(value) || value.schemaVersion !== 1) throw new Error('Unsupported backup schema');
  if (!exactKeys(value, ['schemaVersion', 'bookmarks', 'groups', 'settings'])
    || !Array.isArray(value.bookmarks) || !value.bookmarks.every(validBookmark)
    || !Array.isArray(value.groups) || !value.groups.every(validGroup)
    || !validSettings(value.settings)) throw new Error('Invalid backup');

  const groups = value.groups as BookmarkGroup[];
  const bookmarks = value.bookmarks as Bookmark[];
  const groupIds = new Set(groups.map(({ id }) => id));
  const uniqueGroupIds = groupIds.size === groups.length;
  const uniqueBookmarkIds = new Set(bookmarks.map(({ id }) => id)).size === bookmarks.length;
  if (!uniqueGroupIds || !uniqueBookmarkIds || bookmarks.some(({ groupId }) => !groupIds.has(groupId))) {
    throw new Error('Invalid backup');
  }
  return value as unknown as AppSnapshot;
}

export function exportSnapshot(snapshot: AppSnapshot): Blob {
  const envelope: BackupEnvelope = { app: 'day-start', exportedAt: new Date().toISOString(), snapshot };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  // Older embedded WebViews and jsdom omit Blob.text(). Keep the public Blob API usable there.
  if (typeof blob.text !== 'function') Object.defineProperty(blob, 'text', { value: async () => json });
  return blob;
}

export function parseSnapshot(text: string): AppSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Invalid backup JSON');
  }

  // Recognize the schema first so old/new backups fail with the actionable error.
  if (object(value) && 'schemaVersion' in value) return validateSnapshot(value);
  if (!object(value) || !exactKeys(value, ['app', 'exportedAt', 'snapshot']) || value.app !== 'day-start'
    || !string(value.exportedAt) || !Number.isFinite(Date.parse(value.exportedAt))) throw new Error('Invalid backup');
  return validateSnapshot(value.snapshot);
}
