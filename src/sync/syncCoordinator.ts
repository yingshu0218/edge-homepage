import type { AppSnapshot } from '../domain/models';
import type { SyncProvider, SyncState } from './types';

type LocalSnapshotWriter = { save(snapshot: AppSnapshot): Promise<void> };

export class SyncCoordinator {
  constructor(private readonly local: LocalSnapshotWriter, private readonly provider: SyncProvider) {}

  async saveAndSync(snapshot: AppSnapshot): Promise<SyncState> {
    await this.local.save(snapshot);
    try {
      return await this.provider.push(snapshot);
    } catch (error) {
      return { kind: 'error', message: error instanceof Error ? error.message : String(error), localSaved: true };
    }
  }
}
