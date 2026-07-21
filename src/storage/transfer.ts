import type { AppSnapshot } from '../domain/models';
import { migrateSnapshot, SnapshotCorruptionError } from '../domain/snapshotValidator';

type BackupEnvelope = {
  app: 'day-start';
  exportedAt: string;
  snapshot: AppSnapshot;
};

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const exactKeys = (value: Record<string, unknown>, required: string[]): boolean => {
  const keys = Object.keys(value);
  return required.every((key) => key in value) && keys.every((key) => required.includes(key));
};

function parseRuntimeSnapshot(value: unknown): AppSnapshot {
  try {
    return migrateSnapshot(value, 'backup');
  } catch (error) {
    if (error instanceof SnapshotCorruptionError && error.message.includes('unsupported schema')) {
      throw new Error('Unsupported backup schema');
    }
    throw new Error('Invalid backup');
  }
}

export function exportSnapshot(snapshot: AppSnapshot): Blob {
  const validatedSnapshot = parseRuntimeSnapshot(snapshot);
  const envelope: BackupEnvelope = { app: 'day-start', exportedAt: new Date().toISOString(), snapshot: validatedSnapshot };
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

  if (object(value) && 'schemaVersion' in value) return parseRuntimeSnapshot(value);
  if (!object(value) || !exactKeys(value, ['app', 'exportedAt', 'snapshot']) || value.app !== 'day-start'
    || !string(value.exportedAt) || !canonicalIsoTimestamp(value.exportedAt)) throw new Error('Invalid backup');
  return parseRuntimeSnapshot(value.snapshot);
}

function canonicalIsoTimestamp(value: string): boolean {
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}
