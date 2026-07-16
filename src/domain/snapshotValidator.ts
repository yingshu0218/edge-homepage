import type { AppSettings, AppSnapshot, Bookmark, BookmarkGroup } from './models';

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

function isSettings(value: unknown): value is AppSettings {
  if (!isObject(value) || !exactKeys(value, ['searchTemplate', 'themeId', 'appearance', 'overlay', 'blur', 'useCustomBackground', 'updatedAt'])) return false;
  return nonEmpty(value.searchTemplate) && value.searchTemplate.includes('%s') && safeHttpUrl(value.searchTemplate.replace('%s', 'query'))
    && nonEmpty(value.themeId) && (value.appearance === 'light' || value.appearance === 'dark')
    && finite(value.overlay) && value.overlay >= 0 && value.overlay <= 1
    && finite(value.blur) && value.blur >= 0 && value.blur <= 24
    && typeof value.useCustomBackground === 'boolean' && timestamp(value.updatedAt);
}

export class SnapshotCorruptionError extends Error {
  constructor(source: string, detail = 'invalid snapshot structure') {
    super(`Corrupted ${source}: ${detail}`);
    this.name = 'SnapshotCorruptionError';
  }
}

export function validateSnapshot(value: unknown, source: string): AppSnapshot {
  if (!isObject(value) || value.schemaVersion !== 1) throw new SnapshotCorruptionError(source, `unsupported schema ${String(value && isObject(value) ? value.schemaVersion : undefined)}`);
  if (!exactKeys(value, ['schemaVersion', 'bookmarks', 'groups', 'settings']) || !Array.isArray(value.groups)
    || !Array.isArray(value.bookmarks) || !value.groups.every(isGroup) || !value.bookmarks.every(isBookmark) || !isSettings(value.settings)) {
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
  return value as unknown as AppSnapshot;
}
