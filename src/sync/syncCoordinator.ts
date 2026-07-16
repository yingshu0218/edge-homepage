import type { AppSnapshot } from '../domain/models';
import type { SyncProvider, SyncState } from './types';

type LocalSnapshotWriter = { save(snapshot: AppSnapshot): Promise<void> };

export class SyncCoordinator {
  private localQueue: Promise<unknown> = Promise.resolve();
  constructor(private readonly local: LocalSnapshotWriter, private readonly provider: SyncProvider) {}

  saveAndSync(snapshot: AppSnapshot): Promise<SyncState> {
    const localSave = this.localQueue.then(() => this.local.save(snapshot));
    this.localQueue = localSave.catch(() => undefined);
    return localSave.then(async () => {
      try { return await this.provider.push(snapshot); }
      catch (error) { return { kind: 'error', message: error instanceof Error ? error.message : String(error), localSaved: true } as SyncState; }
    });
  }
}
