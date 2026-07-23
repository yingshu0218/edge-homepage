import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultSnapshot } from '../domain/defaults';
import type { AppSnapshot } from '../domain/models';
import type { WeatherClient, WeatherForecast } from '../features/weather/types';
import { exportSnapshot } from '../storage/transfer';
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

function fakeServices(snapshot: AppSnapshot, load?: () => Promise<AppSnapshot>): AppServices {
  return {
    repository: { load: load ?? vi.fn().mockResolvedValue(snapshot), save: vi.fn().mockResolvedValue(undefined) },
    backgrounds: { get: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) },
    weather,
    weatherCache: { load: vi.fn().mockResolvedValue(undefined), save: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined) },
    navigate: vi.fn(), download: vi.fn(), now: () => 1_752_636_060_000, createId: () => 'docs',
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
    fireEvent.click(time);
    expect(screen.getByRole('dialog', { name: '时间设置' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /天气/ }));
    expect(screen.queryByRole('dialog', { name: '时间设置' })).not.toBeInTheDocument();
    const weatherDrawer = screen.getByRole('dialog', { name: '天气' });
    fireEvent.keyDown(weatherDrawer, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: /天气/ })).toHaveFocus());
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

  it('checks normal weather freshness when the weather drawer opens', async () => {
    const snapshot = createDefaultSnapshot();
    snapshot.settings.weatherLocation = forecast().location;
    const services = fakeServices(snapshot);
    services.weatherCache.load = vi.fn().mockResolvedValue(forecast());
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: /天气/ }));
    await waitFor(() => expect(services.weatherCache.load).toHaveBeenCalled());
    expect(services.weather.getForecast).not.toHaveBeenCalled();
  });

  it('keeps the page usable and warns locally when background loading fails', async () => {
    const services = fakeServices(createDefaultSnapshot());
    services.backgrounds.get = vi.fn().mockRejectedValue(new Error('background unavailable'));
    render(<App services={services} />);
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: '背景回退提示' })).toHaveTextContent('background unavailable');
  });

  it('clears the weather cache as part of a confirmed reset', async () => {
    const services = fakeServices(createDefaultSnapshot());
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App services={services} />);
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    fireEvent.click(screen.getByRole('button', { name: '重置全部数据' }));
    await waitFor(() => expect(services.weatherCache.clear).toHaveBeenCalledOnce());
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
});
