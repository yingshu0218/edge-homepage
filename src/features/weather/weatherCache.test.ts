import { describe, expect, it } from 'vitest';

import type { WeatherLocation } from '../../domain/models';
import type { ChromeStorageArea } from '../../storage/types';
import type { WeatherForecast } from './types';
import { ChromeWeatherCache, isFreshWeatherCache } from './weatherCache';

const THIRTY_MINUTES = 30 * 60 * 1_000;

const location: WeatherLocation = {
  id: 'fuzhou-cn',
  name: '福州',
  admin: '福建',
  country: '中国',
  latitude: 26.08,
  longitude: 119.3,
  timezone: 'Asia/Shanghai',
};

function forecast(fetchedAt = 1_000): WeatherForecast {
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

function fakeChromeStorage() {
  const values: Record<string, unknown> = {};
  const storage: ChromeStorageArea = {
    async get(keys) {
      if (typeof keys === 'string') return keys in values ? { [keys]: values[keys] } : {};
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, values[key]]));
      }
      return { ...values };
    },
    async set(items) {
      Object.assign(values, items);
    },
    async remove(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
    },
  };
  return { storage, values };
}

describe('ChromeWeatherCache', () => {
  it('stores forecasts under a key separate from the app snapshot', async () => {
    const { storage, values } = fakeChromeStorage();
    const snapshot = { schemaVersion: 2 };
    await storage.set({ 'app:snapshot': snapshot });

    await new ChromeWeatherCache(storage).save(forecast());

    expect(values['weather:forecast-cache']).toEqual(forecast());
    expect(values['app:snapshot']).toBe(snapshot);
  });

  it('loads a valid stored forecast', async () => {
    const { storage } = fakeChromeStorage();
    await storage.set({ 'weather:forecast-cache': forecast() });

    await expect(new ChromeWeatherCache(storage).load()).resolves.toEqual(forecast());
  });

  it.each([
    ['a non-object value', 'damaged'],
    ['a malformed location', { ...forecast(), location: { ...location, latitude: '26.08' } }],
    ['an out-of-range location', { ...forecast(), location: { ...location, latitude: 91 } }],
    ['a malformed current reading', { ...forecast(), current: { ...forecast().current, isDay: 1 } }],
    ['a fractional weather code', { ...forecast(), current: { ...forecast().current, weatherCode: 2.5 } }],
    ['a malformed hourly reading', { ...forecast(), hourly: [{ ...forecast().hourly[0], weatherCode: Number.NaN }] }],
    ['a malformed daily reading', { ...forecast(), daily: [{ ...forecast().daily[0], date: '' }] }],
    ['a malformed fetch timestamp', { ...forecast(), fetchedAt: Number.POSITIVE_INFINITY }],
  ])('rejects %s instead of using corrupted cache data', async (_label, damaged) => {
    const { storage } = fakeChromeStorage();
    await storage.set({ 'weather:forecast-cache': damaged });

    await expect(new ChromeWeatherCache(storage).load()).rejects.toThrow('Corrupted weather cache');
  });

  it('clears only the weather entry', async () => {
    const { storage, values } = fakeChromeStorage();
    const snapshot = { schemaVersion: 2 };
    await storage.set({ 'app:snapshot': snapshot, 'weather:forecast-cache': forecast() });

    await new ChromeWeatherCache(storage).clear();

    expect(values).toEqual({ 'app:snapshot': snapshot });
  });
});

describe('isFreshWeatherCache', () => {
  it('is fresh for the selected location through the exact thirty-minute boundary', () => {
    const entry = forecast(10_000);

    expect(isFreshWeatherCache(entry, location, 10_000 + THIRTY_MINUTES)).toBe(true);
    expect(isFreshWeatherCache(entry, location, 10_000 + THIRTY_MINUTES + 1)).toBe(false);
  });

  it('is stale when the selected location ID differs', () => {
    expect(isFreshWeatherCache(forecast(), { ...location, id: 'xiamen-cn' }, 1_000)).toBe(false);
  });
});
