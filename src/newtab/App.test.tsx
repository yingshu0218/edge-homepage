import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import { validateSnapshot } from '../domain/snapshotValidator';
import type { WeatherClient, WeatherForecast } from '../features/weather/types';
import { ChromeWeatherCache } from '../features/weather/weatherCache';
import { SnapshotRepository } from '../storage/snapshotRepository';
import type { ChromeStorageArea } from '../storage/types';
import { exportSnapshot } from '../storage/transfer';
import type { SyncProvider } from '../sync/types';
import { App, type AppServices } from './App';

afterEach(cleanup);

const weather: WeatherClient = {
  searchLocations: vi.fn().mockResolvedValue([]),
  getForecast: vi.fn(),
};

function forecast(): WeatherForecast {
  return {
    location: { id: 'beijing', name: '北京', country: '中国', latitude: 39.9, longitude: 116.4, timezone: 'Asia/Shanghai' },
    current: { time: '2026-07-21T13:05', temperature: 20, apparentTemperature: 19, weatherCode: 61, isDay: true },
    hourly: [], daily: [], fetchedAt: 1_752_636_060_000,
  };
}

function makeOverviewForecast(): WeatherForecast {
  return {
    ...forecast(),
    hourly: [
      { time: '2026-07-21T14:00', temperature: 20, precipitationProbability: 80, weatherCode: 61, isDay: true },
      { time: '2026-07-21T15:00', temperature: 19, precipitationProbability: 75, weatherCode: 61, isDay: true },
      { time: '2026-07-21T16:00', temperature: 19, precipitationProbability: 65, weatherCode: 61, isDay: true },
    ],
  };
}

function fakeServices(snapshot: AppSnapshot, load?: () => Promise<AppSnapshot>): AppServices {
  return {
    repository: { load: load ?? vi.fn().mockResolvedValue(snapshot), save: vi.fn().mockResolvedValue(undefined) },
    backgrounds: { get: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) },
    weather,
    reverseGeocoder: { reverse: vi.fn().mockResolvedValue({ name: '福州市', admin: '福建省', country: '中国' }) },
    weatherCache: { load: vi.fn().mockResolvedValue(undefined), save: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) },
    navigate: vi.fn(), download: vi.fn(), now: () => 1_752_636_060_000, createId: () => 'docs',
  };
}

function memoryChromeStorage(): ChromeStorageArea {
  const values: Record<string, unknown> = {};
  return {
    async get(keys) {
      if (typeof keys === 'string') return keys in values ? { [keys]: values[keys] } : {};
      if (Array.isArray(keys)) return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]));
      return { ...values };
    },
    async set(items) { Object.assign(values, items); },
  };
}

function fakeSync(remote: AppSnapshot | null = null): SyncProvider {
  return {
    pull: vi.fn().mockResolvedValue(remote),
    push: vi.fn().mockResolvedValue({ kind: 'synced', at: 1_752_636_060_000 }),
    subscribe: vi.fn().mockReturnValue(() => undefined),
  };
}

describe('new tab application', () => {
  it('shows a loading shell until the local snapshot resolves', async () => {
    let resolve!: (snapshot: AppSnapshot) => void;
    const services = fakeServices(createDefaultSnapshot(), () => new Promise((done) => { resolve = done; }));
    render(<App services={services} />);
    expect(screen.getByRole('status')).toHaveTextContent('正在准备启动页');
    resolve(createDefaultSnapshot());
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
  });

  it('uses local storage only, labels local data, and saves an added bookmark', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');
    expect(screen.getByText('数据保存在本机')).toBeInTheDocument();
    expect(screen.queryByText(/Microsoft/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加书签' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Docs' } });
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com/docs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }));
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledWith(expect.objectContaining({ bookmarks: expect.arrayContaining([expect.objectContaining({ id: 'docs' })]) })));
  });

  it('pulls, merges, saves locally, and pushes Edge sync data on startup', async () => {
    const local = createDefaultSnapshot();
    const remote = createDefaultSnapshot();
    remote.bookmarks[0] = { ...remote.bookmarks[0]!, title: 'GitHub from Edge', updatedAt: 100 };
    const services = fakeServices(local);
    services.sync = fakeSync(remote);

    render(<App services={services} />);

    expect(await screen.findByText('GitHub from Edge')).toBeInTheDocument();
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ bookmarks: expect.arrayContaining([expect.objectContaining({ title: 'GitHub from Edge' })]) }),
    ));
    expect(services.sync.pull).toHaveBeenCalledTimes(1);
    expect(services.sync.push).toHaveBeenCalledWith(expect.objectContaining({
      bookmarks: expect.arrayContaining([expect.objectContaining({ title: 'GitHub from Edge' })]),
    }));
    expect(await screen.findByText(/已同步/)).toBeInTheDocument();
  });

  it('keeps local changes usable and reports a non-blocking Edge sync failure', async () => {
    const services = fakeServices(createDefaultSnapshot());
    const sync = fakeSync();
    sync.push = vi.fn().mockRejectedValue(new Error('Edge sync unavailable'));
    services.sync = sync;

    render(<App services={services} />);

    expect(await screen.findByText(/已保存在本机，同步失败：Edge sync unavailable/)).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(services.repository.save).toHaveBeenCalled();
  });

  it('limits a group and opens the full bookmark manager from view all', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.bookmarkDisplayLimit = 8;
    snapshot.bookmarks = Array.from({ length: 9 }, (_, index) => ({ ...snapshot.bookmarks[0]!, id: `bookmark-${index}`, title: `Bookmark ${index}`, order: index }));
    render(<App services={fakeServices(snapshot)} />);
    expect(await screen.findByRole('button', { name: '查看全部（共 9 个）' })).toBeInTheDocument();
    const viewAll = screen.getByRole('button', { name: '查看全部（共 9 个）' });
    fireEvent.click(viewAll);
    expect(screen.getByRole('dialog', { name: '书签管理' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog', { name: '书签管理' }), { key: 'Escape' });
    await waitFor(() => expect(viewAll).toHaveFocus());
  });

  it('connects bookmark manager batch callbacks to local persistence', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.groups.push({ id: 'reading', name: '阅读', order: 1, updatedAt: 0 });
    const services = fakeServices(snapshot);
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '管理书签' }));
    fireEvent.click(screen.getByLabelText('选择 GitHub'));
    fireEvent.click(screen.getByRole('button', { name: '移动 1 个书签' }));
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledWith(expect.objectContaining({ bookmarks: expect.arrayContaining([expect.objectContaining({ id: 'github', groupId: 'reading' })]) })));
  });

  it('opens time and weather drawers exclusively and restores trigger focus', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');
    const time = screen.getByRole('button', { name: /时间/ });
    const weatherSummary = screen.getByRole('button', { name: /^天气/ });
    fireEvent.click(time);
    expect(screen.getByRole('dialog', { name: '时间设置' })).toBeInTheDocument();
    fireEvent.click(weatherSummary);
    expect(screen.queryByRole('dialog', { name: '时间设置' })).not.toBeInTheDocument();
    const weatherDrawer = screen.getByRole('dialog', { name: '天气' });
    fireEvent.keyDown(weatherDrawer, { key: 'Escape' });
    await waitFor(() => expect(weatherSummary).toHaveFocus());
  });

  it('persists time preferences and reflects seconds in the top summary', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: /时间/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: '显示秒' }));
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledWith(expect.objectContaining({ settings: expect.objectContaining({ clockShowSeconds: true }) })));
    expect(screen.getByRole('button', { name: /时间 \d{2}:\d{2}:\d{2}/ })).toBeInTheDocument();
  });

  it('renders a WMO weather icon and Fahrenheit temperature in a narrow-priority summary', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.weatherLocation = forecast().location;
    snapshot.settings.temperatureUnit = 'fahrenheit';
    const services = fakeServices(snapshot);
    services.weatherCache.load = vi.fn().mockResolvedValue(forecast());
    render(<App services={services} />);
    const summary = await screen.findByRole('button', { name: /天气.*有雨.*68℉/ });
    expect(summary.querySelector('.weather-summary-icon')).toHaveTextContent('🌧️');
    expect(summary.querySelector('.weather-summary-temperature')).toHaveTextContent('68℉');
    expect(summary.querySelector('.weather-summary-location')).toHaveTextContent('北京');
  });

  it('places the weather overview after the mood card and restores card focus', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.weatherLocation = forecast().location;
    const services = fakeServices(snapshot);
    services.weatherCache.load = vi.fn().mockResolvedValue(makeOverviewForecast());
    render(<App services={services} />);

    const overview = await screen.findByRole('button', { name: /北京.*有雨/ });
    expect(overview.parentElement).toHaveClass('dashboard-column');
    expect(overview.previousElementSibling).toHaveClass('mood-card');
    fireEvent.click(overview);
    const drawer = screen.getByRole('dialog', { name: '天气' });
    fireEvent.keyDown(drawer, { key: 'Escape' });
    await waitFor(() => expect(overview).toHaveFocus());
  });

  it('runs a second normal freshness check when the weather drawer opens', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.weatherLocation = forecast().location;
    const services = fakeServices(snapshot);
    let currentTime = forecast().fetchedAt;
    services.now = () => currentTime;
    services.weatherCache.load = vi.fn().mockResolvedValue(forecast());
    services.weather.getForecast = vi.fn().mockResolvedValue(forecast());
    render(<App services={services} />);
    await screen.findByRole('button', { name: /天气.*有雨/ });
    expect(services.weatherCache.load).toHaveBeenCalledTimes(1);
    currentTime += 30 * 60 * 1_000 + 1;
    fireEvent.click(screen.getByRole('button', { name: /^天气/ }));
    await waitFor(() => expect(services.weather.getForecast).toHaveBeenCalledTimes(1));
  });

  it('keeps the page usable and warns locally when background loading fails', async () => {
    const services = fakeServices(createDefaultSnapshot());
    services.backgrounds.get = vi.fn().mockRejectedValue(new Error('background unavailable'));
    render(<App services={services} />);
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '背景回退提示' })).toHaveTextContent('background unavailable');
    expect(screen.getByRole('status', { name: '背景回退提示' })).not.toHaveTextContent('自定义背景读取失败');
  });

  it('uses fallback copy for a selected custom background that cannot be read', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.useCustomBackground = true;
    const services = fakeServices(snapshot);
    services.backgrounds.get = vi.fn().mockRejectedValue(new Error('background unavailable'));
    render(<App services={services} />);
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '背景回退提示' })).toHaveTextContent('自定义背景读取失败');
  });

  it('clears the real weather-cache adapter with remove as part of a confirmed reset', async () => {
    const services = fakeServices(createDefaultSnapshot());
    const remove = vi.fn().mockResolvedValue(undefined);
    const adapter: ChromeStorageArea = { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined), remove };
    services.weatherCache = new ChromeWeatherCache(adapter);
    const clearFavicons = vi.fn().mockResolvedValue(undefined);
    services.faviconCache = { clear: clearFavicons };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '重置全部数据' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('weather:forecast-cache'));
    expect(clearFavicons).toHaveBeenCalledTimes(1);
  });

  it('keeps the minimum-width topbar controls structurally available for compact styling', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.weatherLocation = forecast().location;
    const services = fakeServices(snapshot);
    services.weatherCache.load = vi.fn().mockResolvedValue(forecast());
    render(<App services={services} />);
    await screen.findByRole('button', { name: /天气.*有雨/ });
    expect(screen.getByRole('link', { name: 'Day Start 首页' })).toHaveClass('brand');
    expect(screen.getByRole('button', { name: /时间/ })).toHaveClass('summary-button');
    expect(screen.getByRole('button', { name: /^天气/ })).toHaveClass('weather-summary');
    expect(screen.getByRole('button', { name: '主题' })).toHaveClass('icon-button');
    expect(screen.getByRole('button', { name: '设置' })).toHaveClass('icon-button');
    expect(screen.getByRole('button', { name: /时间/ }).querySelector('.clock-summary-primary')).toBeInTheDocument();
  });

  it('wires card edit, delete, and sort drawer actions to local state', async () => {
    const services = fakeServices(createDefaultSnapshot());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Edit GitHub' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'GitHub Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }));
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledWith(expect.objectContaining({ bookmarks: expect.arrayContaining([expect.objectContaining({ id: 'github', title: 'GitHub Edited' })]) })));
    fireEvent.click(screen.getByRole('button', { name: 'Delete MDN Web Docs' }));
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledWith(expect.objectContaining({ bookmarks: expect.arrayContaining([expect.objectContaining({ id: 'mdn', deletedAt: expect.any(Number) })]) })));
    fireEvent.click(screen.getByRole('button', { name: '管理排序' }));
    expect(screen.getByRole('dialog', { name: '书签排序' })).toBeInTheDocument();
  });

  it('serializes saves and ignores a stale save failure after a newer save', async () => {
    const snapshot = createDefaultSnapshot();
    let rejectFirst!: (cause: Error) => void;
    let resolveSecond!: () => void;
    const first = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    void first.catch(() => undefined);
    const second = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const services = fakeServices(snapshot);
    services.repository.save = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.change(screen.getByRole('combobox', { name: '每组显示书签' }), { target: { value: '12' } });
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('combobox', { name: '搜索引擎' }), { target: { value: 'bing' } });
    expect(services.repository.save).toHaveBeenCalledTimes(1);
    await act(async () => rejectFirst(new Error('stale write')));
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledTimes(2));
    await act(async () => resolveSecond());
    expect(screen.queryByText(/stale write/)).not.toBeInTheDocument();
  });

  it('keeps theme, settings, import/export, and schema-one backup migration available', async () => {
    const services = fakeServices(createDefaultSnapshot());
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '导出备份' }));
    expect(services.download).toHaveBeenCalledOnce();
    const old = createDefaultSnapshot() as unknown as Record<string, unknown>;
    old.schemaVersion = 1;
    const settings = { ...(old.settings as Record<string, unknown>) };
    for (const key of ['bookmarkDisplayLimit', 'clockHour12', 'clockShowSeconds', 'clockShowFullDate', 'temperatureUnit', 'weatherLocation']) delete settings[key];
    old.settings = settings;
    const backup = JSON.stringify({ app: 'day-start', exportedAt: new Date(0).toISOString(), snapshot: old });
    fireEvent.change(screen.getByLabelText('导入备份'), { target: { files: [new File([backup], 'legacy.json')] } });
    fireEvent.click(await screen.findByRole('button', { name: '确认导入' }));
    await waitFor(() => expect(services.repository.save).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 2, settings: expect.objectContaining({ bookmarkDisplayLimit: 8 }) })));
    fireEvent.click(screen.getByRole('button', { name: '关闭应用设置' }));
    fireEvent.click(screen.getByRole('button', { name: '主题' }));
    fireEvent.click(screen.getByRole('listitem', { name: '极光' }));
    await waitFor(() => expect(services.repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ settings: expect.objectContaining({ themeId: 'aurora' }) })));
  });

  it('normalizes independently appended group and bookmark orders before persisting a merge', async () => {
    const current = createDefaultSnapshot();
    current.groups[0]!.name = '当前开发';
    current.groups.push(
      { id: 'current-group', name: '当前追加分组', order: 1, updatedAt: 10 },
      { id: 'current-group-tombstone', name: '当前已删除分组', order: 1, updatedAt: 11, deletedAt: 11 },
    );
    current.bookmarks[0]!.title = '当前 GitHub';
    current.bookmarks.push(
      { id: 'current-bookmark', title: '当前追加书签', url: 'https://current.example/', groupId: 'development', order: 4, createdAt: 10, updatedAt: 10 },
      { id: 'current-bookmark-tombstone', title: '当前已删除书签', url: 'https://deleted-current.example/', groupId: 'development', order: 4, createdAt: 11, updatedAt: 11, deletedAt: 11 },
    );

    const incoming = createDefaultSnapshot();
    incoming.groups[0]!.name = '导入开发';
    incoming.groups.push(
      { id: 'incoming-group', name: '导入追加分组', order: 1, updatedAt: 20 },
      { id: 'incoming-group-tombstone', name: '导入已删除分组', order: 1, updatedAt: 21, deletedAt: 21 },
    );
    incoming.bookmarks[0]!.title = '导入 GitHub';
    incoming.bookmarks.push(
      { id: 'incoming-bookmark', title: '导入追加书签', url: 'https://incoming.example/', groupId: 'development', order: 4, createdAt: 20, updatedAt: 20 },
      { id: 'incoming-bookmark-tombstone', title: '导入已删除书签', url: 'https://deleted-incoming.example/', groupId: 'development', order: 4, createdAt: 21, updatedAt: 21, deletedAt: 21 },
    );

    const repository = new SnapshotRepository(memoryChromeStorage());
    await repository.save(current);
    const services = fakeServices(current);
    services.repository = repository;
    const firstMount = render(<App services={services} />);
    await screen.findByText('当前 GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByLabelText('合并数据'));
    const backup = await exportSnapshot(incoming).text();
    fireEvent.change(screen.getByLabelText('导入备份'), { target: { files: [new File([backup], 'independent-backup.json')] } });
    fireEvent.click(await screen.findByRole('button', { name: '确认导入' }));

    await waitFor(async () => expect((await repository.load()).groups.some(({ id }) => id === 'incoming-group')).toBe(true));
    const persisted = await repository.load();
    expect(() => validateSnapshot(persisted, 'merged snapshot')).not.toThrow();
    expect(persisted.groups.filter(({ deletedAt }) => deletedAt === undefined).map(({ id, order }) => [id, order])).toEqual([
      ['development', 0], ['current-group', 1], ['incoming-group', 2],
    ]);
    expect(persisted.bookmarks.filter(({ groupId, deletedAt }) => groupId === 'development' && deletedAt === undefined).map(({ id, order }) => [id, order])).toEqual([
      ['github', 0], ['mdn', 1], ['stackoverflow', 2], ['npm', 3], ['current-bookmark', 4], ['incoming-bookmark', 5],
    ]);
    expect(persisted.groups.find(({ id }) => id === 'development')?.name).toBe('当前开发');
    expect(persisted.bookmarks.find(({ id }) => id === 'github')?.title).toBe('当前 GitHub');
    expect(persisted.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current-group-tombstone', deletedAt: 11 }),
      expect.objectContaining({ id: 'incoming-group-tombstone', deletedAt: 21 }),
    ]));
    expect(persisted.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current-bookmark-tombstone', deletedAt: 11 }),
      expect.objectContaining({ id: 'incoming-bookmark-tombstone', deletedAt: 21 }),
    ]));

    firstMount.unmount();
    render(<App services={services} />);
    expect(await screen.findByText('导入追加书签')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '导入追加分组' })).toBeInTheDocument();
    expect(screen.queryByText('导入 GitHub')).not.toBeInTheDocument();
  });

  it('drops imported active bookmarks when the current duplicate group is deleted and reloads the valid merge', async () => {
    const current = createDefaultSnapshot();
    current.groups.push({ id: 'shared-archive', name: '当前已删除分组', order: 1, updatedAt: 30, deletedAt: 30 });
    current.bookmarks.push({
      id: 'current-archive-history', title: '当前删除历史', url: 'https://current-history.example/',
      groupId: 'shared-archive', order: 0, createdAt: 30, updatedAt: 30, deletedAt: 30,
    });

    const incoming = createDefaultSnapshot();
    incoming.settings.bookmarkDisplayLimit = 12;
    incoming.groups.push({ id: 'shared-archive', name: '导入活动分组', order: 1, updatedAt: 40 });
    incoming.bookmarks.push(
      { id: 'incoming-active', title: '不应恢复的活动书签', url: 'https://active.example/', groupId: 'shared-archive', order: 0, createdAt: 40, updatedAt: 40 },
      { id: 'incoming-archive-history', title: '导入删除历史', url: 'https://incoming-history.example/', groupId: 'shared-archive', order: 1, createdAt: 41, updatedAt: 41, deletedAt: 41 },
    );

    const repository = new SnapshotRepository(memoryChromeStorage());
    await repository.save(current);
    const services = fakeServices(current);
    services.repository = repository;
    const firstMount = render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByLabelText('合并数据'));
    const backup = await exportSnapshot(incoming).text();
    fireEvent.change(screen.getByLabelText('导入备份'), { target: { files: [new File([backup], 'deleted-group-conflict.json')] } });
    fireEvent.click(await screen.findByRole('button', { name: '确认导入' }));

    await waitFor(async () => expect((await repository.load()).bookmarks.some(({ id }) => id === 'incoming-archive-history')).toBe(true));
    const persisted = await repository.load();
    expect(() => validateSnapshot(persisted, 'deleted-group merge')).not.toThrow();
    expect(persisted.groups.find(({ id }) => id === 'shared-archive')).toMatchObject({ name: '当前已删除分组', deletedAt: 30 });
    expect(persisted.bookmarks.find(({ id }) => id === 'incoming-active')).toBeUndefined();
    expect(persisted.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current-archive-history', deletedAt: 30 }),
      expect.objectContaining({ id: 'incoming-archive-history', deletedAt: 41 }),
    ]));

    firstMount.unmount();
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    expect(screen.getByRole('combobox', { name: '每组显示书签' })).toHaveValue('12');
    expect(screen.queryByText('不应恢复的活动书签')).not.toBeInTheDocument();
  });
});
