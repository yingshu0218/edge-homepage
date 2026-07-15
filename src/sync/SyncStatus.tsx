import type { SyncState } from './types';

export function SyncStatus({ state }: { state: SyncState }) {
  let message: string;
  switch (state.kind) {
    case 'local': message = '仅保存在此设备'; break;
    case 'pending': message = '正在同步…'; break;
    case 'synced': message = `已同步 · ${new Date(state.at).toLocaleString()}`; break;
    case 'warning': message = `已同步，但数据量较大（${Math.ceil(state.bytes / 1024)} KB）`; break;
    case 'error': message = `已保存在本机，同步失败：${state.message}`; break;
  }
  return <p role="status">{message}</p>;
}
