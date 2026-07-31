import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot, Bookmark } from '../domain/models';
import { BookmarkDialog, type BookmarkDialogValue } from '../features/bookmarks/BookmarkDialog';
import { BookmarkGrid } from '../features/bookmarks/BookmarkGrid';
import { BookmarkManagerDrawer } from '../features/bookmarks/BookmarkManagerDrawer';
import { BookmarkSortDrawer } from '../features/bookmarks/BookmarkSortDrawer';
import { GroupManager } from '../features/bookmarks/GroupManager';
import { GroupTabs } from '../features/bookmarks/GroupTabs';
import { addBookmark, addGroup, deleteBookmark, deleteBookmarks, deleteGroup, deleteGroupAndBookmarks, editBookmark, editGroup, moveBookmarks, reorderGroups } from '../features/bookmarks/bookmarkActions';
import { SearchBox } from '../features/search/SearchBox';
import { SettingsPanel, type ImportMode } from '../features/settings/SettingsPanel';
import { ThemePicker } from '../features/themes/ThemePicker';
import { applyResolvedTheme, resolveTheme } from '../features/themes/themeResolver';
import { TimeDrawer } from '../features/time/TimeDrawer';
import { formatClock } from '../features/time/timeFormat';
import { useLocalClock } from '../features/time/useLocalClock';
import { WeatherDrawer } from '../features/weather/WeatherDrawer';
import { useWeather } from '../features/weather/useWeather';
import type { ReverseGeocodeClient, WeatherClient } from '../features/weather/types';
import { convertTemperature, describeWeatherCode } from '../features/weather/weatherCodes';
import { exportSnapshot, parseSnapshot } from '../storage/transfer';
import type { SnapshotStorage, WeatherCacheStore } from '../storage/types';
import './app.css';

type Backgrounds = { get(): Promise<Blob | undefined>; put(blob: Blob): Promise<void>; clear(): Promise<void> };

export type AppServices = {
  repository: SnapshotStorage;
  backgrounds: Backgrounds;
  weather: WeatherClient;
  reverseGeocoder: ReverseGeocodeClient;
  weatherCache: WeatherCacheStore;
  geolocation?: Pick<Geolocation, 'getCurrentPosition'>;
  navigate(destination: string): void;
  download(blob: Blob, filename: string): void;
  now?: () => number;
  createId?: () => string;
};

type Drawer = 'theme' | 'settings' | 'sort' | 'groups' | 'bookmarks' | 'time' | 'weather' | null;
const focusableSelector = 'input:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });

function drawerLabel(drawer: Exclude<Drawer, null>): string {
  return ({ theme: '主题设置', settings: '应用设置', sort: '书签排序', groups: '分组管理', bookmarks: '书签管理', time: '时间设置', weather: '天气' })[drawer];
}

function normalizeActiveOrders<T extends { id: string; order: number; deletedAt?: number }>(records: T[]): T[] {
  const orders = new Map(records
    .filter(({ deletedAt }) => deletedAt === undefined)
    .sort((left, right) => left.order - right.order)
    .map(({ id }, order) => [id, order]));
  return records.map((record) => orders.has(record.id) && record.order !== orders.get(record.id)
    ? { ...record, order: orders.get(record.id)! }
    : record);
}

function mergeImported(current: AppSnapshot, incoming: AppSnapshot): AppSnapshot {
  const groupIds = new Set(current.groups.map(({ id }) => id));
  const bookmarkIds = new Set(current.bookmarks.map(({ id }) => id));
  const groups = normalizeActiveOrders([...current.groups, ...incoming.groups.filter(({ id }) => !groupIds.has(id))]);
  const deletedGroupIds = new Set(groups.filter(({ deletedAt }) => deletedAt !== undefined).map(({ id }) => id));
  const importedBookmarks = incoming.bookmarks.filter((bookmark) => !bookmarkIds.has(bookmark.id)
    && (bookmark.deletedAt !== undefined || !deletedGroupIds.has(bookmark.groupId)));
  const mergedBookmarks = [...current.bookmarks, ...importedBookmarks];
  const bookmarks = groups.reduce((result, group) => {
    const groupBookmarks = normalizeActiveOrders(result.filter((bookmark) => bookmark.groupId === group.id));
    const normalizedById = new Map(groupBookmarks.map((bookmark) => [bookmark.id, bookmark]));
    return result.map((bookmark) => normalizedById.get(bookmark.id) ?? bookmark);
  }, mergedBookmarks);
  return {
    ...current,
    groups,
    bookmarks,
    settings: { ...current.settings, ...incoming.settings, updatedAt: incoming.settings.updatedAt },
  };
}

export function App({ services }: { services: AppServices }) {
  const now = services.now ?? Date.now;
  const createId = services.createId ?? (() => crypto.randomUUID());
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [customBackground, setCustomBackground] = useState<Blob>();
  const [error, setError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [backgroundError, setBackgroundError] = useState<string>();
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);
  const [backgroundFallback, setBackgroundFallback] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bookmark>();
  const [drawer, setDrawer] = useState<Drawer>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const sortButtonRef = useRef<HTMLButtonElement>(null);
  const groupsButtonRef = useRef<HTMLButtonElement>(null);
  const bookmarksButtonRef = useRef<HTMLButtonElement>(null);
  const timeButtonRef = useRef<HTMLButtonElement>(null);
  const weatherButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSaveRef = useRef(0);

  const acceptSnapshot = useCallback((next: AppSnapshot) => {
    setSnapshot(next);
    setActiveGroupId((current) => next.groups.some((group) => group.id === current && !group.deletedAt)
      ? current : (next.groups.find((group) => !group.deletedAt)?.id ?? ''));
  }, []);

  useEffect(() => {
    let active = true;
    services.repository.load()
      .then((local) => {
        if (!active) return;
        acceptSnapshot(local);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : String(cause)));
    services.backgrounds.get()
      .then((background) => { if (active) setCustomBackground(background); })
      .catch((cause) => active && setBackgroundError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => { if (active) setBackgroundLoaded(true); });
    return () => { active = false; };
  }, [acceptSnapshot, services.backgrounds, services.repository]);

  useEffect(() => {
    if (!snapshot) return;
    setBackgroundFallback(snapshot.settings.useCustomBackground && backgroundLoaded && !customBackground);
    const resolved = resolveTheme(snapshot.settings, customBackground);
    applyResolvedTheme(resolved);
    return () => { if (resolved.isCustom) URL.revokeObjectURL(resolved.imageUrl); };
  }, [backgroundLoaded, customBackground, snapshot]);

  useEffect(() => {
    if (!drawer) return;
    drawerCloseRef.current?.focus();
    return () => drawerTriggerRef.current?.focus();
  }, [drawer]);

  const currentTime = useLocalClock(snapshot?.settings.clockShowSeconds ?? false, now);
  const weather = useWeather({ location: snapshot?.settings.weatherLocation, client: services.weather, cache: services.weatherCache, now });
  const persist = useCallback(async (next: AppSnapshot) => {
    acceptSnapshot(next);
    const version = latestSaveRef.current + 1;
    latestSaveRef.current = version;
    setSaveError(undefined);
    const write = saveQueueRef.current.catch(() => undefined).then(() => services.repository.save(next));
    saveQueueRef.current = write.catch(() => undefined);
    try { await write; if (latestSaveRef.current === version) setSaveError(undefined); }
    catch (cause) { if (latestSaveRef.current === version) setSaveError(cause instanceof Error ? cause.message : String(cause)); }
  }, [acceptSnapshot, services.repository]);
  const updateSettings = useCallback((changes: Partial<AppSnapshot['settings']>) => {
    if (snapshot) void persist({ ...snapshot, settings: { ...snapshot.settings, ...changes, updatedAt: now() } });
  }, [now, persist, snapshot]);

  const openDrawer = (next: Exclude<Drawer, null>, trigger: HTMLButtonElement | null) => {
    drawerTriggerRef.current = trigger;
    if (next === 'weather') void weather.refresh();
    setDrawer(next);
  };
  const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setDrawer(null); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const first = focusable[0]; const last = focusable.at(-1);
    if (!first || !last) return;
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  };

  const bookmarkCount = useMemo(() => snapshot?.bookmarks.filter((bookmark) => !bookmark.deletedAt).length ?? 0, [snapshot]);
  if (error) return <main className="state-shell"><section role="alert"><strong>启动页暂时无法加载</strong><p>{error}</p><button type="button" onClick={() => window.location.reload()}>重新加载</button></section></main>;
  if (!snapshot) return <main className="state-shell"><p role="status">正在准备启动页…</p></main>;

  const activeGroup = activeGroupId || snapshot.groups.find((group) => !group.deletedAt)?.id || '';
  const saveBookmark = (value: BookmarkDialogValue) => {
    const next = editing ? editBookmark(snapshot, editing.id, value, now()) : addBookmark(snapshot, { ...value, id: createId(), now: now() });
    setDialogOpen(false); setEditing(undefined); void persist(next);
  };
  const importData = async (text: string, mode: ImportMode) => {
    const imported = parseSnapshot(text);
    if (mode === 'replace') {
      await services.backgrounds.clear(); setCustomBackground(undefined);
      await persist({ ...imported, settings: { ...imported.settings, useCustomBackground: false, updatedAt: now() } });
    } else await persist(mergeImported(snapshot, imported));
  };
  const reset = async () => {
    try { await Promise.all([services.backgrounds.clear(), services.weatherCache.clear()]); setCustomBackground(undefined); await persist(createDefaultSnapshot()); }
    catch (cause) { setSaveError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const weatherSummary = weather.state.kind === 'ready'
    ? (() => {
      const description = describeWeatherCode(weather.state.forecast.current.weatherCode, weather.state.forecast.current.isDay);
      const unit = snapshot.settings.temperatureUnit === 'fahrenheit' ? '℉' : '℃';
      return { icon: description.icon, label: description.label, temperature: `${convertTemperature(weather.state.forecast.current.temperature, snapshot.settings.temperatureUnit)}${unit}`, location: weather.state.forecast.location.name };
    })()
    : undefined;
  const clockText = formatClock(currentTime, { hour12: snapshot.settings.clockHour12, showSeconds: snapshot.settings.clockShowSeconds });
  const clockPrimary = snapshot.settings.clockShowSeconds ? clockText.slice(0, -3) : clockText;
  const clockSeconds = snapshot.settings.clockShowSeconds ? clockText.slice(-3) : undefined;

  return <main className="app-shell">
    <div className="backdrop" aria-hidden="true" />
    <header className="topbar">
      <a className="brand" href="index.html" aria-label="Day Start 首页">DAY<span>/</span>START</a>
      <nav className="top-actions" aria-label="启动页操作">
        <span className="local-data-label">数据保存在本机</span>
        <button ref={timeButtonRef} className="summary-button clock-summary" type="button" aria-label={`时间 ${clockText}`} onClick={() => openDrawer('time', timeButtonRef.current)}><span className="clock-summary-primary">{clockPrimary}</span>{clockSeconds && <span className="clock-summary-seconds">{clockSeconds}</span>}</button>
        <button ref={weatherButtonRef} className="summary-button weather-summary" type="button" aria-label={weatherSummary ? `天气 ${weatherSummary.icon} ${weatherSummary.label} · ${weatherSummary.temperature} · ${weatherSummary.location}` : '天气 设置天气'} onClick={() => openDrawer('weather', weatherButtonRef.current)}>{weatherSummary ? <><span className="weather-summary-icon" aria-hidden="true">{weatherSummary.icon}</span><span className="weather-summary-temperature">{weatherSummary.temperature}</span><span className="weather-summary-location">{weatherSummary.location}</span></> : '设置天气'}</button>
        <button ref={themeButtonRef} className="icon-button" type="button" aria-label="主题" onClick={() => openDrawer('theme', themeButtonRef.current)}>◐</button>
        <button ref={settingsButtonRef} className="icon-button" type="button" aria-label="设置" onClick={() => openDrawer('settings', settingsButtonRef.current)}>⚙</button>
      </nav>
    </header>
    <div className="workspace">
      <section className="command-area">
        <h1>今天去哪里？</h1><p className="date-line">{dateFormatter.format(currentTime)} · {formatClock(currentTime, { hour12: snapshot.settings.clockHour12, showSeconds: snapshot.settings.clockShowSeconds })}</p>
        <SearchBox searchTemplate={snapshot.settings.searchTemplate} navigate={services.navigate} placeholder="搜索书签、输入网址或执行命令" />
        <div className="section-heading"><strong>置顶</strong><div><button ref={bookmarksButtonRef} type="button" className="sort-manager-button" aria-label="管理书签" onClick={() => openDrawer('bookmarks', bookmarksButtonRef.current)}>管理书签</button><button ref={sortButtonRef} type="button" className="sort-manager-button" onClick={() => openDrawer('sort', sortButtonRef.current)}>管理排序</button><button ref={addButtonRef} type="button" aria-label="添加书签" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>＋ 添加</button></div></div>
        <div className="bookmark-collection"><BookmarkGrid snapshot={snapshot} groupId={activeGroup} limit={snapshot.settings.bookmarkDisplayLimit} onViewAll={(trigger) => openDrawer('bookmarks', trigger)} onEdit={(bookmark) => { setEditing(bookmark); setDialogOpen(true); }} onDelete={(bookmark) => { if (window.confirm(`删除“${bookmark.title}”？`)) void persist(deleteBookmark(snapshot, bookmark.id, now())); }} /><button className="new-bookmark-card" type="button" onClick={() => { setEditing(undefined); setDialogOpen(true); }}><b>＋</b><span>新建书签</span><small>添加到当前分组</small></button></div>
        <div className="group-rail"><GroupTabs groups={snapshot.groups} activeGroupId={activeGroup} onSelect={setActiveGroupId} /><button ref={groupsButtonRef} type="button" aria-label="管理分组" onClick={() => openDrawer('groups', groupsButtonRef.current)}>管理</button></div>
      </section>
      <aside className="mood-card"><p>今日氛围</p><h2>专注</h2><blockquote>把复杂留给工具，<br />把清晰留给自己。</blockquote><hr /><p>快速状态</p><dl><div><dt>数据</dt><dd>本机</dd></div><div><dt>书签</dt><dd>{bookmarkCount}</dd></div></dl>{(backgroundFallback || backgroundError) && <p role="status" aria-label="背景回退提示">{backgroundError ? (snapshot.settings.useCustomBackground ? `自定义背景读取失败：${backgroundError}，已回退到内置主题。` : `本地背景读取失败：${backgroundError}，启动页仍可使用。`) : '自定义背景仅保存在原设备，已回退到内置主题。'}</p>}{saveError && <p role="status">保存失败：{saveError}</p>}</aside>
    </div>
    <BookmarkDialog open={dialogOpen} groups={snapshot.groups} searchTemplate={snapshot.settings.searchTemplate} bookmark={editing} onSave={saveBookmark} onClose={() => { setDialogOpen(false); setEditing(undefined); }} returnFocusRef={addButtonRef} />
    {drawer && <div className="drawer-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawer(null); }}><aside ref={drawerRef} className="drawer" role="dialog" aria-modal="true" aria-label={drawerLabel(drawer)} onKeyDown={handleDrawerKeyDown}><header><h2>{drawerLabel(drawer)}</h2><button ref={drawerCloseRef} className="icon-button" type="button" aria-label={`关闭${drawerLabel(drawer)}`} onClick={() => setDrawer(null)}>×</button></header>
      {drawer === 'theme' ? <ThemePicker selectedThemeId={snapshot.settings.themeId} useCustomBackground={snapshot.settings.useCustomBackground} appearance={snapshot.settings.appearance} overlay={snapshot.settings.overlay} blur={snapshot.settings.blur} backgroundStore={services.backgrounds} onThemeChange={(themeId, recommended) => updateSettings({ themeId, useCustomBackground: false, ...recommended })} onAppearanceChange={updateSettings} onCustomBackgroundChange={(enabled) => { updateSettings({ useCustomBackground: enabled }); if (enabled) void services.backgrounds.get().then((background) => { setCustomBackground(background); setBackgroundFallback(!background); }); }} /> : null}
      {drawer === 'sort' ? <BookmarkSortDrawer snapshot={snapshot} groupId={activeGroup} onChange={(next) => void persist(next)} now={now} /> : null}
      {drawer === 'groups' ? <GroupManager snapshot={snapshot} onCreate={(name) => void persist(addGroup(snapshot, { id: createId(), name }, now()))} onRename={(id, name) => void persist(editGroup(snapshot, id, name, now()))} onReorder={(activeId, overId) => void persist(reorderGroups(snapshot, activeId, overId, now()))} onDelete={(id, mode, destinationId) => { if (mode === 'delete') void persist(deleteGroupAndBookmarks(snapshot, id, now())); else if (destinationId) void persist(deleteGroup(snapshot, id, destinationId, now())); }} /> : null}
      {drawer === 'bookmarks' ? <BookmarkManagerDrawer snapshot={snapshot} groupId={activeGroup} onEdit={(bookmark) => { setDrawer(null); setEditing(bookmark); setDialogOpen(true); }} onDelete={(ids) => void persist(deleteBookmarks(snapshot, ids, now()))} onMove={(ids, destination) => void persist(moveBookmarks(snapshot, ids, destination, now()))} onOpenSort={() => setDrawer('sort')} /> : null}
      {drawer === 'time' ? <TimeDrawer currentTime={currentTime} clockHour12={snapshot.settings.clockHour12} clockShowSeconds={snapshot.settings.clockShowSeconds} clockShowFullDate={snapshot.settings.clockShowFullDate} onChange={updateSettings} /> : null}
      {drawer === 'weather' ? <WeatherDrawer state={weather.state} client={services.weather} location={snapshot.settings.weatherLocation} selectedLocation={snapshot.settings.weatherLocation} unit={snapshot.settings.temperatureUnit} onLocationChange={(location) => updateSettings({ weatherLocation: location })} onUnitChange={(temperatureUnit) => updateSettings({ temperatureUnit })} onRefresh={() => weather.refresh({ force: true })} geolocation={services.geolocation} reverseGeocoder={services.reverseGeocoder} /> : null}
      {drawer === 'settings' ? <SettingsPanel snapshot={snapshot} onSearchTemplateChange={(searchTemplate) => updateSettings({ searchTemplate })} onSettingsChange={updateSettings} onImport={importData} onExport={() => services.download(exportSnapshot(snapshot), `day-start-${new Date(now()).toISOString().slice(0, 10)}.json`)} onReset={() => void reset()} /> : null}
    </aside></div>}
  </main>;
}
