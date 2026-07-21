import { describe, expect, it, vi } from 'vitest';

import type { WeatherLocation } from '../../domain/models';
import { createOpenMeteoClient } from './openMeteoClient';

const location: WeatherLocation = {
  id: 'xiamen',
  name: '厦门',
  admin: '福建',
  country: '中国',
  latitude: 24.4798,
  longitude: 118.0894,
  timezone: 'Asia/Shanghai',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validForecastResponse(): unknown {
  return {
    current: {
      time: '2026-07-21T10:00',
      temperature_2m: 30.5,
      apparent_temperature: 35.2,
      weather_code: 2,
      is_day: 1,
    },
    hourly: {
      time: ['2026-07-21T10:00', '2026-07-21T11:00'],
      temperature_2m: [30.5, 31.1],
      precipitation_probability: [10, 20],
      weather_code: [2, 61],
      is_day: [1, 1],
    },
    daily: {
      time: ['2026-07-21', '2026-07-22'],
      weather_code: [61, 3],
      temperature_2m_max: [34, 32],
      temperature_2m_min: [27, 26],
      precipitation_probability_max: [60, 30],
    },
  };
}

describe('Open-Meteo location search', () => {
  it('URL-encodes a query and maps provider results into locations', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      results: [{
        id: 1790645,
        name: '厦门',
        admin1: '福建',
        country: '中国',
        latitude: 24.4798,
        longitude: 118.0894,
        timezone: 'Asia/Shanghai',
      }],
    }));
    const client = createOpenMeteoClient(fetchFn);

    await expect(client.searchLocations('厦门')).resolves.toEqual([{
      ...location,
      id: '1790645',
    }]);

    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://geocoding-api.open-meteo.com/v1/search');
    expect(url.searchParams.get('name')).toBe('厦门');
    expect(String(fetchFn.mock.calls[0]?.[0])).toContain('%E5%8E%A6%E9%97%A8');
  });
});

describe('Open-Meteo forecast conversion', () => {
  it('requests the required fields and maps aligned response arrays', async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(validForecastResponse()));
    const client = createOpenMeteoClient(fetchFn, () => 1_721_533_200_000);

    await expect(client.getForecast(location)).resolves.toEqual({
      location,
      current: {
        time: '2026-07-21T10:00',
        temperature: 30.5,
        apparentTemperature: 35.2,
        weatherCode: 2,
        isDay: true,
      },
      hourly: [
        { time: '2026-07-21T10:00', temperature: 30.5, precipitationProbability: 10, weatherCode: 2, isDay: true },
        { time: '2026-07-21T11:00', temperature: 31.1, precipitationProbability: 20, weatherCode: 61, isDay: true },
      ],
      daily: [
        { date: '2026-07-21', temperatureMax: 34, temperatureMin: 27, precipitationProbability: 60, weatherCode: 61 },
        { date: '2026-07-22', temperatureMax: 32, temperatureMin: 26, precipitationProbability: 30, weatherCode: 3 },
      ],
      fetchedAt: 1_721_533_200_000,
    });

    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe(String(location.latitude));
    expect(url.searchParams.get('longitude')).toBe(String(location.longitude));
    expect(url.searchParams.get('current')?.split(',')).toEqual([
      'temperature_2m', 'apparent_temperature', 'weather_code', 'is_day',
    ]);
    expect(url.searchParams.get('hourly')?.split(',')).toEqual([
      'temperature_2m', 'precipitation_probability', 'weather_code', 'is_day',
    ]);
    expect(url.searchParams.get('daily')?.split(',')).toEqual([
      'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'precipitation_probability_max',
    ]);
    expect(url.searchParams.get('forecast_hours')).toBe('12');
    expect(url.searchParams.get('forecast_days')).toBe('5');
    expect(url.searchParams.get('timezone')).toBe('auto');
  });

  it('limits valid provider entries to 12 hourly and 5 daily records', async () => {
    const body = validForecastResponse() as Record<string, Record<string, unknown[]>>;
    body.hourly = {
      time: Array.from({ length: 13 }, (_, index) => `hour-${index}`),
      temperature_2m: Array.from({ length: 13 }, (_, index) => index),
      precipitation_probability: Array.from({ length: 13 }, () => 0),
      weather_code: Array.from({ length: 13 }, () => 0),
      is_day: Array.from({ length: 13 }, () => 1),
    };
    body.daily = {
      time: Array.from({ length: 6 }, (_, index) => `day-${index}`),
      weather_code: Array.from({ length: 6 }, () => 0),
      temperature_2m_max: Array.from({ length: 6 }, () => 20),
      temperature_2m_min: Array.from({ length: 6 }, () => 10),
      precipitation_probability_max: Array.from({ length: 6 }, () => 0),
    };
    const client = createOpenMeteoClient(async () => jsonResponse(body));

    const forecast = await client.getForecast(location);

    expect(forecast.hourly).toHaveLength(12);
    expect(forecast.daily).toHaveLength(5);
  });

  it.each([
    ['an HTTP error', async () => jsonResponse({ reason: 'rate limited' }, 429)],
    ['a missing hourly array', async () => {
      const body = validForecastResponse() as { hourly: Record<string, unknown> };
      delete body.hourly.time;
      return jsonResponse(body);
    }],
    ['a non-finite temperature', async () => {
      const body = validForecastResponse() as { hourly: { temperature_2m: unknown[] } };
      body.hourly.temperature_2m[0] = 'hot';
      return jsonResponse(body);
    }],
    ['mismatched array lengths', async () => {
      const body = validForecastResponse() as { daily: { weather_code: unknown[] } };
      body.daily.weather_code.pop();
      return jsonResponse(body);
    }],
  ])('rejects %s with a Chinese user-safe error', async (_label, fetchFn) => {
    const client = createOpenMeteoClient(fetchFn);

    await expect(client.getForecast(location)).rejects.toThrow('天气服务暂时不可用，请稍后重试。');
  });
});
