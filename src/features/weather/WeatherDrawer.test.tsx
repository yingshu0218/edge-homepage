import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TemperatureUnit, WeatherLocation } from '../../domain/models';
import { WeatherDrawer, type GeolocationAdapter } from './WeatherDrawer';
import type { ReverseGeocodeClient, WeatherClient, WeatherForecast } from './types';
import type { WeatherState } from './useWeather';

const fuzhou: WeatherLocation = {
  id: 'fuzhou-cn',
  name: '福州',
  admin: '福建',
  country: '中国',
  latitude: 26.08,
  longitude: 119.3,
  timezone: 'Asia/Shanghai',
};

const xiamen: WeatherLocation = {
  id: 'xiamen-cn',
  name: '厦门',
  admin: '福建',
  country: '中国',
  latitude: 24.48,
  longitude: 118.08,
  timezone: 'Asia/Shanghai',
};

function makeForecast(): WeatherForecast {
  return {
    location: fuzhou,
    current: {
      time: '2026-07-22T09:00',
      temperature: 30,
      apparentTemperature: 34,
      weatherCode: 0,
      isDay: true,
    },
    hourly: Array.from({ length: 13 }, (_, index) => ({
      time: `2026-07-22T${String(index + 10).padStart(2, '0')}:00`,
      temperature: 30 + index,
      precipitationProbability: index,
      weatherCode: index % 2 ? 61 : 0,
      isDay: index < 9,
    })),
    daily: Array.from({ length: 6 }, (_, index) => ({
      date: `2026-07-${String(index + 22).padStart(2, '0')}`,
      temperatureMax: 34 + index,
      temperatureMin: 26 + index,
      precipitationProbability: 20 + index,
      weatherCode: index % 2 ? 61 : 0,
    })),
    fetchedAt: new Date('2026-07-22T01:15:00.000Z').getTime(),
  };
}

function client(searchLocations: WeatherClient['searchLocations'] = vi.fn().mockResolvedValue([])): WeatherClient {
  return { searchLocations, getForecast: vi.fn() };
}

function defaultReverseGeocoder(): ReverseGeocodeClient {
  return { reverse: vi.fn().mockResolvedValue({ name: '福州市', admin: '福建省', country: '中国' }) };
}

function renderDrawer({
  state = { kind: 'unconfigured' },
  searchLocations,
  unit = 'celsius',
  geolocation,
  reverseGeocoder = defaultReverseGeocoder(),
  onLocationChange = vi.fn(),
  onUnitChange = vi.fn(),
  onRefresh = vi.fn(),
}: {
  state?: WeatherState;
  searchLocations?: WeatherClient['searchLocations'];
  unit?: TemperatureUnit;
  geolocation?: GeolocationAdapter;
  reverseGeocoder?: ReverseGeocodeClient;
  onLocationChange?: (location: WeatherLocation) => void;
  onUnitChange?: (unit: TemperatureUnit) => void;
  onRefresh?: () => void | Promise<void>;
} = {}) {
  return render(
    <WeatherDrawer
      state={state}
      client={client(searchLocations)}
      unit={unit}
      location={state.kind === 'ready' ? state.forecast.location : undefined}
      onLocationChange={onLocationChange}
      onUnitChange={onUnitChange}
      onRefresh={onRefresh}
      geolocation={geolocation}
      reverseGeocoder={reverseGeocoder}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WeatherDrawer city selection', () => {
  it('debounces non-empty city searches and exposes results as candidate buttons', async () => {
    vi.useFakeTimers();
    const search = vi.fn<WeatherClient['searchLocations']>().mockResolvedValue([fuzhou, xiamen]);
    renderDrawer({ searchLocations: search });

    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: '   ' } });
    await act(async () => vi.advanceTimersByTime(350));
    expect(search).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: '福' } });
    await act(async () => vi.advanceTimersByTime(299));
    expect(search).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(search).toHaveBeenCalledWith('福', expect.any(AbortSignal));
    await act(async () => Promise.resolve());
    expect(screen.getByRole('button', { name: /选择福州/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择厦门/ })).toBeInTheDocument();
  });

  it('aborts a superseded search and saves the selected candidate', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const search = vi.fn<WeatherClient['searchLocations']>((_query, signal) => {
      signals.push(signal!);
      return Promise.resolve([fuzhou]);
    });
    const onLocationChange = vi.fn();
    renderDrawer({ searchLocations: search, onLocationChange });

    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: '福' } });
    await act(async () => vi.advanceTimersByTime(300));
    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: '厦' } });
    expect(signals[0]?.aborted).toBe(true);
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByRole('button', { name: /选择福州/ }));
    expect(onLocationChange).toHaveBeenCalledWith(fuzhou);
  });

  it('immediately removes old candidates when a different query is typed', async () => {
    vi.useFakeTimers();
    const search = vi.fn<WeatherClient['searchLocations']>()
      .mockResolvedValueOnce([fuzhou])
      .mockResolvedValueOnce([xiamen]);
    renderDrawer({ searchLocations: search });

    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: '福' } });
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => Promise.resolve());
    expect(screen.getByRole('button', { name: /选择福州/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: '厦' } });
    expect(screen.queryByRole('button', { name: /选择福州/ })).not.toBeInTheDocument();
  });

  it('reserves flow layout for unit controls above the search input', () => {
    renderDrawer();
    const searchInput = screen.getByLabelText('搜索城市');
    const controls = searchInput.closest('.weather-location-controls');
    expect(controls).not.toBeNull();
    const heading = controls!.querySelector('.weather-location-heading');
    expect(heading).not.toBeNull();
    expect(within(heading as HTMLElement).getByText('搜索城市')).toBeInTheDocument();
    expect(within(heading as HTMLElement).getByRole('group', { name: '温度单位' })).toBeInTheDocument();
    expect(heading?.nextElementSibling).toBe(searchInput);
  });

  it('marks long unbroken city names for constrained non-hourly rendering', async () => {
    vi.useFakeTimers();
    const forecast = makeForecast();
    forecast.location = {
      ...forecast.location,
      name: 'ExtremelyLongUnbrokenCityNameThatMustNeverEscapeTheNarrowDrawer',
    };
    renderDrawer({
      state: { kind: 'ready', forecast, refreshing: false, stale: false },
      searchLocations: vi.fn().mockResolvedValue([forecast.location]),
    });

    const heading = screen.getByRole('heading', { name: forecast.location.name });
    expect(heading).toHaveClass('weather-city-name');
    expect(screen.getByText(`已选择：${forecast.location.name}`)).toHaveClass('weather-city-name');
    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: 'Extremely' } });
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => Promise.resolve());
    expect(screen.getByRole('button', { name: /选择ExtremelyLongUnbrokenCityName/ }).querySelector('strong')).toHaveClass('weather-city-name');
  });
});

describe('WeatherDrawer opt-in geolocation', () => {
  it('does not request geolocation until the user clicks the action', () => {
    const geolocation: GeolocationAdapter = { getCurrentPosition: vi.fn() };
    renderDrawer({ geolocation });
    expect(geolocation.getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '使用当前位置' }));
    expect(geolocation.getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('resolves and saves the real city after the user requests current location', async () => {
    const onLocationChange = vi.fn();
    const reverse = vi.fn().mockResolvedValue({ name: '福州市', admin: '福建省', country: '中国' });
    const geolocation: GeolocationAdapter = {
      getCurrentPosition(success) {
        success({ coords: { latitude: 26.08044, longitude: 119.30049 } });
      },
    };
    renderDrawer({ geolocation, reverseGeocoder: { reverse }, onLocationChange });
    fireEvent.click(screen.getByRole('button', { name: '使用当前位置' }));

    await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith(expect.objectContaining({
      id: 'coords:26.080,119.300',
      name: '福州市',
      admin: '福建省',
      country: '中国',
    })));
    expect(reverse).toHaveBeenCalledWith(26.08044, 119.30049, expect.any(AbortSignal));
  });

  it('keeps weather setup usable when city resolution fails', async () => {
    const onLocationChange = vi.fn();
    renderDrawer({
      geolocation: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 26.08044, longitude: 119.30049 } });
        },
      },
      reverseGeocoder: { reverse: vi.fn().mockRejectedValue(new Error('offline')) },
      onLocationChange,
    });
    fireEvent.click(screen.getByRole('button', { name: '使用当前位置' }));

    await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith(expect.objectContaining({
      name: '当前位置',
      country: '定位',
    })));
    expect(screen.getByRole('alert')).toHaveTextContent('城市名称解析失败');
  });

  it('does not let a prior city resolution overwrite a newer location attempt', async () => {
    let resolveFirst!: (place: { name: string; admin?: string; country: string }) => void;
    let resolveSecond!: (place: { name: string; admin?: string; country: string }) => void;
    const reverse = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const geolocation: GeolocationAdapter = {
      getCurrentPosition(success) {
        success({ coords: { latitude: 26.08044, longitude: 119.30049 } });
      },
    };
    const onLocationChange = vi.fn();
    renderDrawer({ geolocation, reverseGeocoder: { reverse }, onLocationChange });

    fireEvent.click(screen.getByRole('button', { name: '使用当前位置' }));
    fireEvent.click(screen.getByRole('button', { name: '正在获取位置…' }));
    resolveSecond({ name: '厦门市', admin: '福建省', country: '中国' });
    await waitFor(() => expect(onLocationChange).toHaveBeenLastCalledWith(expect.objectContaining({ name: '厦门市' })));
    resolveFirst({ name: '福州市', admin: '福建省', country: '中国' });
    await act(async () => Promise.resolve());

    expect(onLocationChange).toHaveBeenCalledTimes(1);
  });

  it('explains a denied location request next to the recovery action', () => {
    const geolocation: GeolocationAdapter = {
      getCurrentPosition(_success, failure) {
        failure?.({ code: 1, message: 'denied' });
      },
    };
    renderDrawer({ geolocation });
    fireEvent.click(screen.getByRole('button', { name: '使用当前位置' }));
    expect(screen.getByRole('alert')).toHaveTextContent('位置权限被拒绝');
    expect(screen.getByRole('button', { name: '使用当前位置' })).toBeInTheDocument();
  });
});

describe('WeatherDrawer forecast states', () => {
  it('presents the unconfigured and loading states', () => {
    const view = renderDrawer();
    expect(screen.getByText('选择城市后查看天气')).toBeInTheDocument();
    view.rerender(
      <WeatherDrawer
        state={{ kind: 'loading' }} client={client()} unit="celsius"
        onLocationChange={vi.fn()} onUnitChange={vi.fn()} onRefresh={vi.fn()} reverseGeocoder={defaultReverseGeocoder()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在获取天气');
  });

  it('shows current conditions, exactly 12 hours, 5 days, and updated time', () => {
    renderDrawer({ state: { kind: 'ready', forecast: makeForecast(), refreshing: false, stale: false } });
    expect(screen.getByRole('heading', { name: '福州' })).toBeInTheDocument();
    expect(screen.getByText('晴朗')).toBeInTheDocument();
    expect(screen.getAllByText('30℃').length).toBeGreaterThan(0);
    expect(screen.getByText(/更新于 09:15/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '未来 12 小时' }).children).toHaveLength(12);
    expect(screen.getByRole('list', { name: '未来 5 天' }).children).toHaveLength(5);
  });

  it('changes units and renders converted Fahrenheit temperatures', () => {
    const onUnitChange = vi.fn();
    const state: WeatherState = { kind: 'ready', forecast: makeForecast(), refreshing: false, stale: false };
    const view = renderDrawer({ state, unit: 'celsius', onUnitChange });
    fireEvent.click(screen.getByRole('button', { name: '华氏度' }));
    expect(onUnitChange).toHaveBeenCalledWith('fahrenheit');
    view.rerender(
      <WeatherDrawer state={state} client={client()} unit="fahrenheit" location={fuzhou}
        onLocationChange={vi.fn()} onUnitChange={onUnitChange} onRefresh={vi.fn()} reverseGeocoder={defaultReverseGeocoder()} />,
    );
    expect(screen.getAllByText('86℉').length).toBeGreaterThan(0);
  });

  it('keeps provider-local hourly times when the city uses another timezone', () => {
    const forecast = makeForecast();
    forecast.location = { ...forecast.location, timezone: 'America/New_York' };
    renderDrawer({ state: { kind: 'ready', forecast, refreshing: false, stale: false } });
    expect(screen.getByRole('list', { name: '未来 12 小时' }).querySelector('time')).toHaveTextContent('10:00');
  });

  it('keeps cached forecast visible while refreshing or reporting a stale error', () => {
    const forecast = makeForecast();
    const view = renderDrawer({ state: { kind: 'ready', forecast, refreshing: true, stale: true } });
    expect(screen.getByRole('status')).toHaveTextContent('正在刷新');
    expect(screen.getAllByText('30℃').length).toBeGreaterThan(0);

    view.rerender(
      <WeatherDrawer state={{ kind: 'ready', forecast, refreshing: false, stale: true, error: '网络离线' }}
        client={client()} unit="celsius" location={fuzhou} onLocationChange={vi.fn()}
        onUnitChange={vi.fn()} onRefresh={vi.fn()} reverseGeocoder={defaultReverseGeocoder()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('网络离线');
    expect(screen.getAllByText('30℃').length).toBeGreaterThan(0);
  });

  it('offers retry for a first-load error and manual refresh for ready data', () => {
    const onRefresh = vi.fn();
    const view = renderDrawer({ state: { kind: 'error', message: '天气服务不可用' }, onRefresh });
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRefresh).toHaveBeenCalledOnce();

    view.rerender(
      <WeatherDrawer state={{ kind: 'ready', forecast: makeForecast(), refreshing: false, stale: false }}
        client={client()} unit="celsius" location={fuzhou} onLocationChange={vi.fn()}
        onUnitChange={vi.fn()} onRefresh={onRefresh} reverseGeocoder={defaultReverseGeocoder()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '刷新天气' }));
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('keeps search failure by the city search while preserving cached data', async () => {
    vi.useFakeTimers();
    const search = vi.fn<WeatherClient['searchLocations']>().mockRejectedValue(new Error('城市服务离线'));
    renderDrawer({
      state: { kind: 'ready', forecast: makeForecast(), refreshing: false, stale: false },
      searchLocations: search,
    });
    fireEvent.change(screen.getByLabelText('搜索城市'), { target: { value: '福州' } });
    await act(async () => vi.advanceTimersByTime(300));
    await act(async () => Promise.resolve());
    expect(screen.getByRole('alert')).toHaveTextContent('城市服务离线');
    expect(screen.getAllByText('30℃').length).toBeGreaterThan(0);
  });
});
