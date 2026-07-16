import { useEffect, useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';

import type { AppSnapshot } from '../../domain/models';
import type { SyncState } from '../../sync/types';
import { SyncStatus } from '../../sync/SyncStatus';
import { parseSnapshot } from '../../storage/transfer';

export type ImportMode = 'replace' | 'merge';

export type SettingsPanelProps = {
  snapshot: AppSnapshot;
  syncState: SyncState;
  onSearchTemplateChange: (searchTemplate: string) => void;
  onThemeParametersChange: (parameters: { overlay: number; blur: number }) => void;
  onImport: (text: string, mode: ImportMode) => void | Promise<void>;
  onExport: () => void;
  onReset: () => void;
};

function readFile(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('无法读取备份'));
    reader.readAsText(file);
  });
}

export function SettingsPanel({ snapshot, syncState, onSearchTemplateChange, onThemeParametersChange, onImport, onExport, onReset }: SettingsPanelProps) {
  const importId = useId();
  const [mode, setMode] = useState<ImportMode>('replace');
  const [parameters, setParameters] = useState({ overlay: snapshot.settings.overlay, blur: snapshot.settings.blur });
  const [searchDraft, setSearchDraft] = useState(snapshot.settings.searchTemplate);
  const [searchError, setSearchError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pendingImport, setPendingImport] = useState<{ text: string; mode: ImportMode; groups: number; bookmarks: number }>();

  useEffect(() => {
    setParameters({ overlay: snapshot.settings.overlay, blur: snapshot.settings.blur });
  }, [snapshot.settings.overlay, snapshot.settings.blur]);
  useEffect(() => { setSearchDraft(snapshot.settings.searchTemplate); setSearchError(undefined); }, [snapshot.settings.searchTemplate]);

  const changeParameter = (name: 'overlay' | 'blur', value: number) => {
    const next = { ...parameters, [name]: value };
    setParameters(next);
    onThemeParametersChange(next);
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(undefined);
    try {
      const text = await readFile(file);
      const parsed = parseSnapshot(text);
      setPendingImport({ text, mode, groups: parsed.groups.filter(({ deletedAt }) => !deletedAt).length, bookmarks: parsed.bookmarks.filter(({ deletedAt }) => !deletedAt).length });
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败'); }
  };
  const commitSearchTemplate = () => {
    if (!searchDraft.includes('%s')) { setSearchError('搜索地址必须包含 %s 占位符'); return; }
    try {
      const url = new URL(searchDraft.replace('%s', 'query'));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsafe protocol');
    } catch {
      setSearchError('请输入有效的 HTTP 或 HTTPS 搜索地址');
      return;
    }
    setSearchError(undefined);
    if (searchDraft !== snapshot.settings.searchTemplate) onSearchTemplateChange(searchDraft);
  };
  const searchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commitSearchTemplate(); }
  };

  return (
    <section aria-label="设置">
      <h2>设置</h2>
      <label>搜索引擎
        <input value={searchDraft} aria-invalid={searchError ? 'true' : undefined} aria-describedby={searchError ? `${importId}-search-error` : undefined}
          onChange={(event) => { setSearchDraft(event.target.value); setSearchError(undefined); }} onBlur={commitSearchTemplate} onKeyDown={searchKeyDown} />
      </label>
      {searchError && <p id={`${importId}-search-error`} role="alert">{searchError}</p>}
      <label>遮罩强度
        <input type="range" min="0" max="1" step="0.05" value={parameters.overlay} onChange={(event) => changeParameter('overlay', Number(event.target.value))} />
      </label>
      <label>模糊强度
        <input type="range" min="0" max="24" step="1" value={parameters.blur} onChange={(event) => changeParameter('blur', Number(event.target.value))} />
      </label>
      <fieldset>
        <legend>导入方式</legend>
        <label><input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />替换现有数据</label>
        <label><input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />合并数据</label>
      </fieldset>
      <label htmlFor={importId}>导入备份</label>
      <input id={importId} type="file" accept="application/json,.json" onChange={importFile} />
      {pendingImport && <div className="import-confirm" role="region" aria-label="确认导入">
        <strong>确认{pendingImport.mode === 'replace' ? '替换' : '合并'}导入</strong>
        <p>{pendingImport.groups} 个分组 · {pendingImport.bookmarks} 个书签</p>
        <button type="button" onClick={async () => { const pending = pendingImport; setPendingImport(undefined); await onImport(pending.text, pending.mode); }}>确认导入</button>
        <button type="button" onClick={() => setPendingImport(undefined)}>取消导入</button>
      </div>}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onExport}>导出备份</button>
      <button type="button" onClick={() => { if (window.confirm('确定要重置全部数据吗？此操作无法撤销。')) onReset(); }}>重置全部数据</button>
      <SyncStatus state={syncState} />
    </section>
  );
}
