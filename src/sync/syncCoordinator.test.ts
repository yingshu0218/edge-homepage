import { describe, expect, it } from 'vitest';
import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import type { SyncProvider } from './types';
import { SyncCoordinator } from './syncCoordinator';

function makeCoordinator(calls: string[], options: { pushError?: Error } = {}) {
  const local = { async save(_snapshot: AppSnapshot) { calls.push('local.save'); } };
  const provider: SyncProvider = {
    async push() { calls.push('sync.push'); if (options.pushError) throw options.pushError; return { kind: 'synced', at: 123 }; },
    async pull() { return null; },
    subscribe() { return () => undefined; },
  };
  return new SyncCoordinator(local, provider);
}

describe('SyncCoordinator', () => {
  it('writes locally before pushing remotely', async () => {
    const calls: string[] = [];
    const coordinator = makeCoordinator(calls);
    await coordinator.saveAndSync(createDefaultSnapshot());
    expect(calls.slice(0, 2)).toEqual(['local.save', 'sync.push']);
  });

  it('keeps local success when sync quota fails', async () => {
    const coordinator = makeCoordinator([], { pushError: new Error('QUOTA_BYTES') });
    expect(await coordinator.saveAndSync(createDefaultSnapshot())).toMatchObject({ kind: 'error', localSaved: true });
  });
});
