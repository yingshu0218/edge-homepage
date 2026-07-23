import { useEffect, useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';

import type { AppSnapshot } from '../../domain/models';
import { parseSnapshot } from '../../storage/transfer';
import { findSearchEngine, SEARCH_ENGINES } from '../search/searchEngines';

export type ImportMode = 'replace' | 'merge';

export type SettingsPanelProps = {
  snapshot: AppSnapshot;
  onSearchTemplateChange: (searchTemplate: string) => void;
  onSettingsChange: (changes: Partial<AppSnapshot['settings']>) => void;
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

export function SettingsPanel({ snapshot, onSearchTemplateChange, onSettingsChange, onImport, onExport, onReset }: SettingsPanelProps) {
  const importId = useId();
  const [mode, setMode] = useState<ImportMode>('replace');
  const [searchDraft, setSearchDraft] = useState(snapshot.settings.searchTemplate);
  const [selectedEngineId, setSelectedEngineId] = useState(findSearchEngine(snapshot.settings.searchTemplate)?.id ?? 'custom');
  const [searchError, setSearchError] = useState<string>();
  const [error, setError] = useState<string>();
  const [pendingImport, setPendingImport] = useState<{ text: string; mode: ImportMode; groups: number; bookmarks: number }>();

  useEffect(() => {
    setSearchDraft(snapshot.settings.searchTemplate);
    setSelectedEngineId(findSearchEngine(snapshot.settings.searchTemplate)?.id ?? 'custom');
    setSearchError(undefined);
  }, [snapshot.settings.searchTemplate]);

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
        <select value={selectedEngineId} onChange={(event) => {
          const id = event.target.value;
          setSelectedEngineId(id);
          setSearchError(undefined);
          const engine = SEARCH_ENGINES.find((candidate) => candidate.id === id);
          if (engine) {
            setSearchDraft(engine.template);
            onSearchTemplateChange(engine.template);
          }
        }}>
          {SEARCH_ENGINES.map((engine) => <option key={engine.id} value={engine.id}>{engine.name}</option>)}
          <option value="custom">自定义</option>
        </select>
      </label>
      {selectedEngineId === 'custom' && <label>自定义搜索地址
        <input value={searchDraft} aria-invalid={searchError ? 'true' : undefined} aria-describedby={searchError ? `${importId}-search-error` : undefined}
          onChange={(event) => { setSearchDraft(event.target.value); setSearchError(undefined); }} onBlur={commitSearchTemplate} onKeyDown={searchKeyDown} />
      </label>}
      {searchError && <p id={`${importId}-search-error`} role="alert">{searchError}</p>}
      <label>每组显示书签
        <select value={snapshot.settings.bookmarkDisplayLimit} onChange={(event) => onSettingsChange({ bookmarkDisplayLimit: Number(event.target.value) as 8 | 12 | 16 })}>
          <option value={8}>8</option><option value={12}>12</option><option value={16}>16</option>
        </select>
      </label>
      <fieldset className="import-mode-options">
        <legend>导入方式</legend>
        <label>
          <input type="radio" name="import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
          <span>替换现有数据</span>
        </label>
        <label>
          <input type="radio" name="import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
          <span>合并数据</span>
        </label>
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
    </section>
  );
}
