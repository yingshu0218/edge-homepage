import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WeatherLocation } from '../../domain/models';
import type { WeatherCacheStore } from '../../storage/types';
import type { WeatherClient, WeatherForecast } from './types';
import { useWeather } from './useWeather';

const THIRTY_MINUTES = 30 * 60 * 1_000;
const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalVisibilityState) {
    Object.defineProperty(document, 'visibilityState', originalVisibilityState);
  } else {
    Reflect.deleteProperty(document, 'visibilityState');
  }
});

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

function forecast(location: WeatherLocation, fetchedAt: number): WeatherForecast {
  return {
    location,
    current: {
      time: '2026-07-21T10:00',
      temperature: 31,
      apparentTemperature: 35,
      weatherCode: 2,
      isDay: true,
    },
    hourly: [{
      time: '2026-07-21T11:00',
      temperature: 32,
      precipitationProbability: 10,
      weatherCode: 2,
      isDay: true,
    }],
    daily: [{
      date: '2026-07-21',
      temperatureMax: 34,
      temperatureMin: 27,
      precipitationProbability: 30,
      weatherCode: 2,
    }],
    fetchedAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

class MemoryWeatherCache implements WeatherCacheStore {
  current: WeatherForecast | undefined;
  readonly saves: WeatherForecast[] = [];

  constructor(entry?: WeatherForecast) {
    this.current = entry;
  }

  async load() {
    return this.current;
  }

  async save(next: WeatherForecast) {
    this.current = next;
    this.saves.push(next);
  }

  async clear() {
    this.current = undefined;
  }
}

function client(getForecast: WeatherClient['getForecast']): WeatherClient {
  return {
    searchLocations: vi.fn().mockResolvedValue([]),
    getForecast,
  };
}

describe('useWeather', () => {
  it('stays unconfigured and makes no request without a selected location', async () => {
    const getForecast = vi.fn<WeatherClient['getForecast']>();
    const result = renderHook(() => useWeather({
      location: undefined,
      client: client(getForecast),
      cache: new MemoryWeatherCache(),
      now: () => 1_000,
    }));

    expect(result.result.current.state).toEqual({ kind: 'unconfigured' });
    await act(async () => result.result.current.refresh({ force: true }));
    expect(getForecast).not.toHaveBeenCalled();
  });

  it('displays a fresh cached forecast without requesting weather', async () => {
    const now = 2_000_000;
    const cached = forecast(fuzhou, now - THIRTY_MINUTES);
    const getForecast = vi.fn<WeatherClient['getForecast']>();
    const { result } = renderHook(() => useWeather({
      location: fuzhou,
      client: client(getForecast),
      cache: new MemoryWeatherCache(cached),
      now: () => now,
    }));

    await waitFor(() => expect(result.current.state).toEqual({
      kind: 'ready', forecast: cached, refreshing: false, stale: false,
    }));
    expect(getForecast).not.toHaveBeenCalled();
  });

  it('displays stale cache while refreshing and saves the successful response', async () => {
    const now = 2_000_000;
    const cached = forecast(fuzhou, now - THIRTY_MINUTES - 1);
    const updated = forecast(fuzhou, now);
    const request = deferred<WeatherForecast>();
    const getForecast = vi.fn<WeatherClient['getForecast']>().mockReturnValue(request.promise);
    const cache = new MemoryWeatherCache(cached);
    const { result } = renderHook(() => useWeather({
      location: fuzhou, client: client(getForecast), cache, now: () => now,
    }));

    await waitFor(() => expect(result.current.state).toEqual({
      kind: 'ready', forecast: cached, refreshing: true, stale: true,
    }));

    await act(async () => request.resolve(updated));

    await waitFor(() => expect(result.current.state).toEqual({
      kind: 'ready', forecast: updated, refreshing: false, stale: false,
    }));
    expect(cache.saves).toEqual([updated]);
  });

  it('deduplicates concurrent forced refreshes for the same location', async () => {
    const now = 2_000_000;
    const cached = forecast(fuzhou, now);
    const updated = forecast(fuzhou, now + 1);
    const request = deferred<WeatherForecast>();
    const getForecast = vi.fn<WeatherClient['getForecast']>().mockReturnValue(request.promise);
    const cache = new MemoryWeatherCache(cached);
    const { result } = renderHook(() => useWeather({
      location: fuzhou, client: client(getForecast), cache, now: () => now,
    }));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refresh({ force: true });
      second = result.current.refresh({ force: true });
    });
    expect(getForecast).toHaveBeenCalledOnce();

    request.resolve(updated);
    await act(async () => Promise.all([first, second]));
    expect(cache.saves).toEqual([updated]);
  });

  it('keeps stale cached weather visible when refresh fails', async () => {
    const now = 2_000_000;
    const cached = forecast(fuzhou, now - THIRTY_MINUTES - 1);
    const request = deferred<WeatherForecast>();
    const getForecast = vi.fn<WeatherClient['getForecast']>().mockReturnValue(request.promise);
    const { result } = renderHook(() => useWeather({
      location: fuzhou,
      client: client(getForecast),
      cache: new MemoryWeatherCache(cached),
      now: () => now,
    }));
    await waitFor(() => expect(getForecast).toHaveBeenCalledOnce());

    await act(async () => request.reject(new Error('offline')));

    expect(result.current.state).toEqual({
      kind: 'ready', forecast: cached, refreshing: false, stale: true, error: 'offline',
    });
  });

  it('shows a retryable first-load error and recovers on retry', async () => {
    const now = 2_000_000;
    const updated = forecast(fuzhou, now);
    const getForecast = vi.fn<WeatherClient['getForecast']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(updated);
    const { result } = renderHook(() => useWeather({
      location: fuzhou,
      client: client(getForecast),
      cache: new MemoryWeatherCache(),
      now: () => now,
    }));

    await waitFor(() => expect(result.current.state).toEqual({ kind: 'error', message: 'offline' }));
    await act(async () => result.current.refresh());
    expect(result.current.state).toEqual({
      kind: 'ready', forecast: updated, refreshing: false, stale: false,
    });
  });

  it('normal refresh honors freshness while force refresh bypasses it', async () => {
    const now = 2_000_000;
    const cached = forecast(fuzhou, now);
    const updated = forecast(fuzhou, now + 1);
    const getForecast = vi.fn<WeatherClient['getForecast']>().mockResolvedValue(updated);
    const { result } = renderHook(() => useWeather({
      location: fuzhou,
      client: client(getForecast),
      cache: new MemoryWeatherCache(cached),
      now: () => now,
    }));
    await waitFor(() => expect(result.current.state.kind).toBe('ready'));

    await act(async () => result.current.refresh());
    expect(getForecast).not.toHaveBeenCalled();

    await act(async () => result.current.refresh({ force: true }));
    expect(getForecast).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({ kind: 'ready', forecast: updated });
  });

  it('refreshes on visibility restoration only after cached data becomes stale', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-07-21T02:00:00.000Z');
    vi.setSystemTime(start);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const cached = forecast(fuzhou, Date.now());
    const updated = forecast(fuzhou, Date.now() + THIRTY_MINUTES + 1);
    const getForecast = vi.fn<WeatherClient['getForecast']>().mockResolvedValue(updated);
    const { result } = renderHook(() => useWeather({
      location: fuzhou,
      client: client(getForecast),
      cache: new MemoryWeatherCache(cached),
      now: Date.now,
    }));
    await act(async () => Promise.resolve());
    expect(result.current.state.kind).toBe('ready');

    act(() => {
      vi.advanceTimersByTime(THIRTY_MINUTES);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => Promise.resolve());
    expect(getForecast).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await act(async () => Promise.resolve());
    expect(getForecast).toHaveBeenCalledOnce();
  });

  it('does not bypass a pending fresh-cache read when visibility is restored', async () => {
    const now = 2_000_000;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const cached = forecast(fuzhou, now);
    const cacheRead = deferred<WeatherForecast | undefined>();
    const cache: WeatherCacheStore = {
      load: () => cacheRead.promise,
      save: vi.fn(),
      clear: vi.fn(),
    };
    const getForecast = vi.fn<WeatherClient['getForecast']>();
    const { result } = renderHook(() => useWeather({
      location: fuzhou, client: client(getForecast), cache, now: () => now,
    }));

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(getForecast).not.toHaveBeenCalled();

    await act(async () => cacheRead.resolve(cached));
    await waitFor(() => expect(result.current.state).toEqual({
      kind: 'ready', forecast: cached, refreshing: false, stale: false,
    }));
    expect(getForecast).not.toHaveBeenCalled();
  });

  it('removes the visibility listener and ignores an in-flight result after unmount', async () => {
    const now = 2_000_000;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const cached = forecast(fuzhou, now - THIRTY_MINUTES - 1);
    const updated = forecast(fuzhou, now);
    const request = deferred<WeatherForecast>();
    const getForecast = vi.fn<WeatherClient['getForecast']>().mockReturnValue(request.promise);
    const cache = new MemoryWeatherCache(cached);
    const { unmount } = renderHook(() => useWeather({
      location: fuzhou, client: client(getForecast), cache, now: () => now,
    }));
    await waitFor(() => expect(getForecast).toHaveBeenCalledOnce());

    unmount();
    document.dispatchEvent(new Event('visibilitychange'));
    request.resolve(updated);
    await act(async () => Promise.resolve());

    expect(getForecast).toHaveBeenCalledOnce();
    expect(cache.saves).toEqual([]);
  });

  it('does not let a previous location response overwrite the current location cache', async () => {
    const now = 2_000_000;
    const fuzhouRequest = deferred<WeatherForecast>();
    const xiamenRequest = deferred<WeatherForecast>();
    const getForecast = vi.fn<WeatherClient['getForecast']>()
      .mockReturnValueOnce(fuzhouRequest.promise)
      .mockReturnValueOnce(xiamenRequest.promise);
    const cache = new MemoryWeatherCache();
    const weatherClient = client(getForecast);
    const { rerender } = renderHook(
      ({ location }: { location: WeatherLocation }) => useWeather({
        location, client: weatherClient, cache, now: () => now,
      }),
      { initialProps: { location: fuzhou } },
    );
    await waitFor(() => expect(getForecast).toHaveBeenCalledWith(fuzhou, expect.any(AbortSignal)));

    rerender({ location: xiamen });
    await waitFor(() => expect(getForecast).toHaveBeenCalledWith(xiamen, expect.any(AbortSignal)));

    const xiamenForecast = forecast(xiamen, now);
    await act(async () => xiamenRequest.resolve(xiamenForecast));
    await act(async () => fuzhouRequest.resolve(forecast(fuzhou, now)));

    expect(cache.current).toEqual(xiamenForecast);
    expect(cache.saves).toEqual([xiamenForecast]);
  });

  it('serializes cache writes so a slow previous-location write cannot win', async () => {
    const now = 2_000_000;
    const fuzhouRequest = deferred<WeatherForecast>();
    const xiamenRequest = deferred<WeatherForecast>();
    const finishFuzhouSave = deferred<void>();
    let current: WeatherForecast | undefined;
    const saveStarted: string[] = [];
    const cache: WeatherCacheStore = {
      async load() {
        return undefined;
      },
      async save(next) {
        saveStarted.push(next.location.id);
        if (next.location.id === fuzhou.id) await finishFuzhouSave.promise;
        current = next;
      },
      async clear() {
        current = undefined;
      },
    };
    const getForecast = vi.fn<WeatherClient['getForecast']>()
      .mockReturnValueOnce(fuzhouRequest.promise)
      .mockReturnValueOnce(xiamenRequest.promise);
    const weatherClient = client(getForecast);
    const { rerender } = renderHook(
      ({ location }: { location: WeatherLocation }) => useWeather({
        location, client: weatherClient, cache, now: () => now,
      }),
      { initialProps: { location: fuzhou } },
    );
    await waitFor(() => expect(getForecast).toHaveBeenCalledTimes(1));

    await act(async () => fuzhouRequest.resolve(forecast(fuzhou, now)));
    await waitFor(() => expect(saveStarted).toEqual([fuzhou.id]));
    rerender({ location: xiamen });
    await waitFor(() => expect(getForecast).toHaveBeenCalledTimes(2));
    await act(async () => xiamenRequest.resolve(forecast(xiamen, now)));

    expect(saveStarted).toEqual([fuzhou.id]);
    await act(async () => finishFuzhouSave.resolve());
    await waitFor(() => expect(saveStarted).toEqual([fuzhou.id, xiamen.id]));
    expect(current?.location.id).toBe(xiamen.id);
  });
});
