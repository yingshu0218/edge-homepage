import type { SyncState } from './types';

export function SyncStatus({ state, className }: { state: SyncState; className?: string }) {
  let message: string;
  switch (state.kind) {
    case 'local': message = '数据保存在本机'; break;
    case 'pending': message = '正在同步…'; break;
    case 'synced': message = `已同步 · ${new Date(state.at).toLocaleString()}`; break;
    case 'warning': message = `已同步，但数据量较大（${Math.ceil(state.bytes / 1024)} KB）`; break;
    case 'error': message = state.localSaved ? `已保存在本机，同步失败：${state.message}` : `保存失败：${state.message}`; break;
  }
  return <p className={className} role="status">{message}</p>;
}
