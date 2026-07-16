import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot, Bookmark } from '../domain/models';
import { BookmarkDialog, type BookmarkDialogValue } from '../features/bookmarks/BookmarkDialog';
import { BookmarkGrid } from '../features/bookmarks/BookmarkGrid';
import { GroupTabs } from '../features/bookmarks/GroupTabs';
import { addBookmark, addGroup, deleteBookmark, deleteGroup, deleteGroupAndBookmarks, editBookmark, editGroup, reorderGroups } from '../features/bookmarks/bookmarkActions';
import { SearchBox } from '../features/search/SearchBox';
import { SettingsPanel, type ImportMode } from '../features/settings/SettingsPanel';
import { ThemePicker } from '../features/themes/ThemePicker';
import { applyResolvedTheme, resolveTheme } from '../features/themes/themeResolver';
import { exportSnapshot, parseSnapshot } from '../storage/transfer';
import type { SnapshotStorage } from '../storage/types';
import { SyncStatus } from '../sync/SyncStatus';
import { mergeSnapshots } from '../sync/edgeSyncProvider';
import type { SyncProvider, SyncState } from '../sync/types';
import './app.css';

type Coordinator = { saveAndSync(snapshot: AppSnapshot): Promise<SyncState> };
type Backgrounds = { get(): Promise<Blob | undefined>; put(blob: Blob): Promise<void>; clear(): Promise<void> };

export type AppServices = {
  repository: SnapshotStorage;
  coordinator: Coordinator;
  sync: Pick<SyncProvider, 'pull' | 'subscribe'>;
  backgrounds: Backgrounds;
  navigate(destination: string): void;
  download(blob: Blob, filename: string): void;
  now?: () => number;
  createId?: () => string;
};

type Drawer = 'theme' | 'settings' | null;
const focusableSelector = 'input:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
const timeFormatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

function mergeImported(current: AppSnapshot, incoming: AppSnapshot): AppSnapshot {
  return mergeSnapshots(current, incoming, Number.MAX_SAFE_INTEGER);
}

export function App({ services }: { services: AppServices }) {
  const now = services.now ?? Date.now;
  const createId = services.createId ?? (() => crypto.randomUUID());
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [customBackground, setCustomBackground] = useState<Blob>();
  const [syncState, setSyncState] = useState<SyncState>({ kind: 'local' });
  const [error, setError] = useState<string>();
  const [backgroundFallback, setBackgroundFallback] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bookmark>();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const snapshotRef = useRef<AppSnapshot | undefined>(undefined);

  const acceptSnapshot = useCallback((next: AppSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    setActiveGroupId((current) => next.groups.some((group) => group.id === current && !group.deletedAt)
      ? current
      : (next.groups.find((group) => !group.deletedAt)?.id ?? ''));
  }, []);

  useEffect(() => {
    let active = true;
    const remote = services.sync.pull().catch((cause) => {
      if (active) setSyncState({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause), localSaved: true });
      return null;
    });
    Promise.all([services.repository.load(), services.backgrounds.get(), remote])
      .then(async ([local, background, remote]) => {
        if (!active) return;
        const hydrated = remote ? mergeSnapshots(local, remote) : local;
        acceptSnapshot(hydrated);
        setCustomBackground(background);
        setBackgroundFallback(hydrated.settings.useCustomBackground && !background);
        if (remote) {
          try {
            await services.repository.save(hydrated);
          } catch (cause) {
            if (active) setSyncState({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause), localSaved: false });
          }
        }
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => { active = false; };
  }, [acceptSnapshot, services]);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let queue = Promise.resolve();
    const unsubscribe = services.sync.subscribe(() => {
      const requested = ++generation;
      queue = queue.then(async () => {
        if (!active || requested !== generation) return;
        try {
          const remote = await services.sync.pull();
          if (!active || requested !== generation || !remote) return;
          const local = snapshotRef.current;
          const merged = local ? mergeSnapshots(local, remote) : remote;
          await services.repository.save(merged);
          if (!active || requested !== generation) return;
          acceptSnapshot(merged);
        } catch (cause) {
          if (active && requested === generation) setSyncState({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause), localSaved: true });
        }
      });
    });
    return () => { active = false; generation += 1; unsubscribe(); };
  }, [acceptSnapshot, services]);

  useEffect(() => {
    if (!snapshot) return;
    if (!snapshot.settings.useCustomBackground) setBackgroundFallback(false);
    const resolved = resolveTheme(snapshot.settings, customBackground);
    applyResolvedTheme(resolved);
    return () => { if (resolved.isCustom) URL.revokeObjectURL(resolved.imageUrl); };
  }, [customBackground, snapshot]);

  useEffect(() => {
    if (!drawer) return;
    drawerCloseRef.current?.focus();
    return () => {
      drawerTriggerRef.current?.focus();
    };
  }, [drawer]);

  const openDrawer = (next: Exclude<Drawer, null>, trigger: HTMLButtonElement | null) => {
    drawerTriggerRef.current = trigger;
    setDrawer(next);
  };

  const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setDrawer(null);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  };

  const persist = useCallback(async (next: AppSnapshot) => {
    acceptSnapshot(next);
    setSyncState({ kind: 'pending' });
    try {
      setSyncState(await services.coordinator.saveAndSync(next));
    } catch (cause) {
      setSyncState({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause), localSaved: false });
    }
  }, [acceptSnapshot, services.coordinator]);

  const updateSettings = useCallback((changes: Partial<AppSnapshot['settings']>) => {
    if (!snapshot) return;
    void persist({ ...snapshot, settings: { ...snapshot.settings, ...changes, updatedAt: now() } });
  }, [now, persist, snapshot]);

  const bookmarkCount = useMemo(() => snapshot?.bookmarks.filter((bookmark) => !bookmark.deletedAt).length ?? 0, [snapshot]);

  if (error) {
    return <main className="state-shell"><section role="alert"><strong>启动页暂时无法加载</strong><p>{error}</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></section></main>;
  }
  if (!snapshot) return <main className="state-shell"><p role="status">正在准备启动页…</p></main>;

  const date = new Date(now());
  const activeGroup = activeGroupId || snapshot.groups.find((group) => !group.deletedAt)?.id || '';

  const saveBookmark = (value: BookmarkDialogValue) => {
    const next = editing
      ? editBookmark(snapshot, editing.id, value, now())
      : addBookmark(snapshot, { ...value, id: createId(), now: now() });
    setDialogOpen(false);
    setEditing(undefined);
    void persist(next);
  };

  const importData = async (text: string, mode: ImportMode) => {
    const imported = parseSnapshot(text);
    if (mode === 'replace') {
      await services.backgrounds.clear();
      setCustomBackground(undefined);
      await persist({ ...imported, settings: { ...imported.settings, useCustomBackground: false, updatedAt: now() } });
      return;
    }
    await persist(mergeImported(snapshot, imported));
  };

  const reset = async () => {
    try {
      await services.backgrounds.clear();
      setCustomBackground(undefined);
      await persist(createDefaultSnapshot());
    } catch (cause) {
      setSyncState({ kind: 'error', message: cause instanceof Error ? cause.message : String(cause), localSaved: false });
    }
  };

  const addNewGroup = () => {
    const name = window.prompt('分组名称');
    if (!name?.trim()) return;
    void persist(addGroup(snapshot, { id: createId(), name: name.trim() }, now()));
  };

  const renameGroup = (id: string) => {
    const group = snapshot.groups.find((item) => item.id === id);
    const name = window.prompt('新的分组名称', group?.name ?? '');
    if (name?.trim()) void persist(editGroup(snapshot, id, name.trim(), now()));
  };
  const removeGroup = (id: string) => {
    const others = snapshot.groups.filter((group) => !group.deletedAt && group.id !== id);
    if (others.length === 0) { window.alert('至少需要保留一个分组'); return; }
    const choice = window.prompt('删除分组：输入 move 将书签移动到其他分组（默认），输入 delete 一并删除书签，输入 cancel 取消', 'move')?.trim().toLowerCase();
    if (!choice || choice === 'cancel') return;
    if (choice === 'delete') void persist(deleteGroupAndBookmarks(snapshot, id, now()));
    else if (choice === 'move') void persist(deleteGroup(snapshot, id, others[0]!.id, now()));
  };

  const syncFact = syncState.kind === 'synced'
    ? { label: 'Microsoft 已同步', symbol: '✓', detail: '已同步', success: true }
    : syncState.kind === 'warning'
      ? { label: 'Microsoft 同步警告', symbol: '!', detail: '容量警告', success: false }
      : syncState.kind === 'error'
        ? { label: 'Microsoft 同步异常', symbol: '×', detail: '同步异常', success: false }
        : syncState.kind === 'pending'
          ? { label: 'Microsoft 正在同步', symbol: '…', detail: '正在同步', success: false }
          : { label: 'Microsoft 仅本地', symbol: '•', detail: '仅本地', success: false };

  return (
    <main className="app-shell">
      <div className="backdrop" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="index.html" aria-label="Day Start 首页">DAY<span>/</span>START</a>
        <nav className="top-actions" aria-label="启动页操作">
          <div className={`sync-chip sync-${syncState.kind}`}><span aria-hidden="true" />Microsoft · <SyncStatus state={syncState} /></div>
          <button ref={themeButtonRef} className="icon-button" type="button" aria-label="主题" onClick={() => openDrawer('theme', themeButtonRef.current)}>◐</button>
          <button ref={settingsButtonRef} className="icon-button" type="button" aria-label="设置" onClick={() => openDrawer('settings', settingsButtonRef.current)}>⚙</button>
        </nav>
      </header>

      <div className="workspace">
        <section className="command-area">
          <h1>今天去哪里？</h1>
          <p className="date-line">{dateFormatter.format(date)} · {timeFormatter.format(date)}</p>
          <SearchBox searchTemplate={snapshot.settings.searchTemplate} navigate={services.navigate} placeholder="搜索书签、输入网址或执行命令" />

          <div className="section-heading">
            <strong>置顶</strong>
            <div><span>拖拽排序</span><button ref={addButtonRef} type="button" aria-label="添加书签" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>＋ 添加</button></div>
          </div>
          <div className="bookmark-collection">
            <BookmarkGrid
              snapshot={snapshot}
              groupId={activeGroup}
              onChange={(next) => void persist(next)}
              onEdit={(bookmark) => { setEditing(bookmark); setDialogOpen(true); }}
              onDelete={(bookmark) => { if (window.confirm(`删除“${bookmark.title}”？`)) void persist(deleteBookmark(snapshot, bookmark.id, now())); }}
              now={now}
            />
            <button className="new-bookmark-card" type="button" onClick={() => { setEditing(undefined); setDialogOpen(true); }}><b>＋</b><span>新建书签</span><small>添加到当前分组</small></button>
          </div>
          <div className="group-rail">
            <GroupTabs groups={snapshot.groups} activeGroupId={activeGroup} onSelect={setActiveGroupId} onRename={renameGroup} onDelete={removeGroup}
              onReorder={(activeId, overId) => void persist(reorderGroups(snapshot, activeId, overId, now()))} />
            <button type="button" aria-label="添加分组" onClick={addNewGroup}>＋</button>
          </div>
        </section>

        <aside className="mood-card">
          <p>今日氛围</p><h2>专注</h2><blockquote>把复杂留给工具，<br />把清晰留给自己。</blockquote>
          <hr />
          <p>快速状态</p>
          <dl><div><dt>Microsoft</dt><dd aria-label={syncFact.label} className={syncFact.success ? 'success' : undefined}>{syncFact.symbol}</dd></div><div><dt>同步状态</dt><dd>{syncFact.detail}</dd></div><div><dt>书签</dt><dd>{bookmarkCount}</dd></div></dl>
          {backgroundFallback && <p role="status" aria-label="背景回退提示">自定义背景仅保存在原设备，已回退到内置主题。</p>}
          {syncState.kind === 'error' && syncState.message.includes('Corrupted Edge sync data') && <button type="button" onClick={() => void persist(snapshot)}>重置同步数据</button>}
        </aside>
      </div>

      <BookmarkDialog open={dialogOpen} groups={snapshot.groups} searchTemplate={snapshot.settings.searchTemplate} bookmark={editing} onSave={saveBookmark} onClose={() => { setDialogOpen(false); setEditing(undefined); }} returnFocusRef={addButtonRef} />

      {drawer && <div className="drawer-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}>
        <aside ref={drawerRef} className="drawer" role="dialog" aria-modal="true" aria-label={drawer === 'theme' ? '主题设置' : '应用设置'} onKeyDown={handleDrawerKeyDown}>
          <header><h2>{drawer === 'theme' ? '主题' : '设置'}</h2><button ref={drawerCloseRef} className="icon-button" type="button" aria-label={`关闭${drawer === 'theme' ? '主题' : '设置'}`} onClick={() => setDrawer(null)}>×</button></header>
          {drawer === 'theme' ? <ThemePicker
            selectedThemeId={snapshot.settings.themeId}
            useCustomBackground={snapshot.settings.useCustomBackground}
            backgroundStore={services.backgrounds}
            onThemeChange={(themeId) => updateSettings({ themeId, useCustomBackground: false })}
            onCustomBackgroundChange={(enabled) => {
              updateSettings({ useCustomBackground: enabled });
              if (enabled) void services.backgrounds.get().then((background) => { setCustomBackground(background); setBackgroundFallback(!background); });
            }}
          /> : <SettingsPanel
            snapshot={snapshot}
            syncState={syncState}
            onSearchTemplateChange={(searchTemplate) => updateSettings({ searchTemplate })}
            onThemeParametersChange={(parameters) => updateSettings(parameters)}
            onImport={importData}
            onExport={() => services.download(exportSnapshot(snapshot), `day-start-${new Date(now()).toISOString().slice(0, 10)}.json`)}
            onReset={() => void reset()}
          />}
        </aside>
      </div>}
    </main>
  );
}
