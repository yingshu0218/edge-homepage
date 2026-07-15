import type { AppSnapshot } from '../domain/models';

export type SyncState =
  | { kind: 'local' }
  | { kind: 'pending' }
  | { kind: 'synced'; at: number }
  | { kind: 'warning'; bytes: number }
  | { kind: 'error'; message: string; localSaved: true };

export type SyncResult = Extract<SyncState, { kind: 'synced' | 'warning' }>;

export interface SyncProvider {
  push(snapshot: AppSnapshot): Promise<SyncResult>;
  pull(): Promise<AppSnapshot | null>;
  subscribe(listener: () => void): () => void;
}
