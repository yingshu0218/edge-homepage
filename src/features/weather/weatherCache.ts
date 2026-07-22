import type { WeatherLocation } from '../../domain/models';
import type { ChromeStorageArea, WeatherCacheStore } from '../../storage/types';
import type { DailyWeather, HourlyWeather, WeatherForecast, WeatherSummary } from './types';

const WEATHER_CACHE_KEY = 'weather:forecast-cache';
const WEATHER_CACHE_MAX_AGE = 30 * 60 * 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isWeatherCode(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isWeatherLocation(value: unknown): value is WeatherLocation {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && (value.admin === undefined || isNonEmptyString(value.admin))
    && isNonEmptyString(value.country)
    && isFiniteNumber(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && isFiniteNumber(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180
    && isNonEmptyString(value.timezone);
}

function isWeatherSummary(value: unknown): value is WeatherSummary {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.time)
    && isFiniteNumber(value.temperature)
    && isFiniteNumber(value.apparentTemperature)
    && isWeatherCode(value.weatherCode)
    && typeof value.isDay === 'boolean';
}

function isHourlyWeather(value: unknown): value is HourlyWeather {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.time)
    && isFiniteNumber(value.temperature)
    && isFiniteNumber(value.precipitationProbability)
    && isWeatherCode(value.weatherCode)
    && typeof value.isDay === 'boolean';
}

function isDailyWeather(value: unknown): value is DailyWeather {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.date)
    && isFiniteNumber(value.temperatureMax)
    && isFiniteNumber(value.temperatureMin)
    && isFiniteNumber(value.precipitationProbability)
    && isWeatherCode(value.weatherCode);
}

function parseWeatherForecast(value: unknown): WeatherForecast {
  if (!isRecord(value)
    || !isWeatherLocation(value.location)
    || !isWeatherSummary(value.current)
    || !Array.isArray(value.hourly)
    || !value.hourly.every(isHourlyWeather)
    || !Array.isArray(value.daily)
    || !value.daily.every(isDailyWeather)
    || !isFiniteNumber(value.fetchedAt)) {
    throw new Error('Corrupted weather cache');
  }

  return value as WeatherForecast;
}

export class ChromeWeatherCache implements WeatherCacheStore {
  constructor(private readonly storage: ChromeStorageArea) {}

  async load(): Promise<WeatherForecast | undefined> {
    const stored = (await this.storage.get(WEATHER_CACHE_KEY))[WEATHER_CACHE_KEY];
    return stored === undefined ? undefined : parseWeatherForecast(stored);
  }

  async save(forecast: WeatherForecast): Promise<void> {
    await this.storage.set({ [WEATHER_CACHE_KEY]: parseWeatherForecast(forecast) });
  }

  async clear(): Promise<void> {
    if (this.storage.remove) {
      await this.storage.remove(WEATHER_CACHE_KEY);
      return;
    }
    await this.storage.set({ [WEATHER_CACHE_KEY]: undefined });
  }
}

export function isFreshWeatherCache(
  entry: WeatherForecast,
  location: WeatherLocation,
  now: number,
): boolean {
  const age = now - entry.fetchedAt;
  return Number.isFinite(now)
    && entry.location.id === location.id
    && age >= 0
    && age <= WEATHER_CACHE_MAX_AGE;
}
