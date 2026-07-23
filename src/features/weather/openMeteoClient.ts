import type { WeatherLocation } from '../../domain/models';
import type {
  DailyWeather,
  HourlyWeather,
  WeatherClient,
  WeatherForecast,
  WeatherSummary,
} from './types';

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type OpenMeteoGeocodingResult = {
  id: string | number;
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type OpenMeteoCurrent = {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  weather_code: number;
  is_day: number;
};

type OpenMeteoHourly = {
  time: string[];
  temperature_2m: number[];
  precipitation_probability: number[];
  weather_code: number[];
  is_day: number[];
};

type OpenMeteoDaily = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
};

type OpenMeteoForecastResponse = {
  current: OpenMeteoCurrent;
  hourly: OpenMeteoHourly;
  daily: OpenMeteoDaily;
};

const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const USER_SAFE_ERROR = '天气服务暂时不可用，请稍后重试。';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLocationId(value: unknown): value is string | number {
  return (typeof value === 'string' && value.trim().length > 0)
    || (isFiniteNumber(value) && Number.isInteger(value));
}

function isCoordinate(value: unknown, minimum: number, maximum: number): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum;
}

function isWeatherCode(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function isDayValue(value: unknown): value is number {
  return value === 0 || value === 1;
}

function requireStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) throw new Error('invalid weather strings');
  return value;
}

function requireNumberArray(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every(isFiniteNumber)) throw new Error('invalid weather numbers');
  return value;
}

function requireCodeArray(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every(isWeatherCode)) throw new Error('invalid weather codes');
  return value;
}

function requireDayArray(value: unknown): number[] {
  if (!Array.isArray(value) || !value.every(isDayValue)) throw new Error('invalid day values');
  return value;
}

function requireAligned(arrays: unknown[][]): void {
  const length = arrays[0]?.length;
  if (length === undefined || arrays.some((array) => array.length !== length)) {
    throw new Error('unaligned weather arrays');
  }
}

function parseLocation(value: unknown): WeatherLocation {
  if (!isRecord(value)) throw new Error('invalid location');

  const id = value.id;
  if (!isLocationId(id)
    || !isNonEmptyString(value.name)
    || !isNonEmptyString(value.country)
    || !isCoordinate(value.latitude, -90, 90)
    || !isCoordinate(value.longitude, -180, 180)
    || !isNonEmptyString(value.timezone)
    || (value.admin1 !== undefined && typeof value.admin1 !== 'string')) {
    throw new Error('invalid location');
  }

  const result: WeatherLocation = {
    id: String(id),
    name: value.name,
    country: value.country,
    latitude: value.latitude,
    longitude: value.longitude,
    timezone: value.timezone,
  };
  if (value.admin1) result.admin = value.admin1;
  return result;
}

function parseLocations(value: unknown): WeatherLocation[] {
  if (!isRecord(value)) throw new Error('invalid geocoding response');
  if (value.results === undefined) return [];
  if (!Array.isArray(value.results)) throw new Error('invalid geocoding results');
  return (value.results as OpenMeteoGeocodingResult[]).map(parseLocation);
}

function parseCurrent(value: unknown): WeatherSummary {
  if (!isRecord(value)
    || !isNonEmptyString(value.time)
    || !isFiniteNumber(value.temperature_2m)
    || !isFiniteNumber(value.apparent_temperature)
    || !isWeatherCode(value.weather_code)
    || !isDayValue(value.is_day)) {
    throw new Error('invalid current weather');
  }

  const current = value as OpenMeteoCurrent;
  return {
    time: current.time,
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    weatherCode: current.weather_code,
    isDay: current.is_day === 1,
  };
}

function parseHourly(value: unknown): HourlyWeather[] {
  if (!isRecord(value)) throw new Error('invalid hourly weather');
  const times = requireStringArray(value.time);
  const temperatures = requireNumberArray(value.temperature_2m);
  const precipitation = requireNumberArray(value.precipitation_probability);
  const codes = requireCodeArray(value.weather_code);
  const dayValues = requireDayArray(value.is_day);
  requireAligned([times, temperatures, precipitation, codes, dayValues]);

  return times.slice(0, 12).map((time, index) => ({
    time,
    temperature: temperatures[index],
    precipitationProbability: precipitation[index],
    weatherCode: codes[index],
    isDay: dayValues[index] === 1,
  }));
}

function parseDaily(value: unknown): DailyWeather[] {
  if (!isRecord(value)) throw new Error('invalid daily weather');
  const times = requireStringArray(value.time);
  const codes = requireCodeArray(value.weather_code);
  const maximums = requireNumberArray(value.temperature_2m_max);
  const minimums = requireNumberArray(value.temperature_2m_min);
  const precipitation = requireNumberArray(value.precipitation_probability_max);
  requireAligned([times, codes, maximums, minimums, precipitation]);

  return times.slice(0, 5).map((date, index) => ({
    date,
    temperatureMax: maximums[index],
    temperatureMin: minimums[index],
    precipitationProbability: precipitation[index],
    weatherCode: codes[index],
  }));
}

function parseForecast(value: unknown, location: WeatherLocation, fetchedAt: number): WeatherForecast {
  if (!isRecord(value)) throw new Error('invalid forecast response');
  const response = value as OpenMeteoForecastResponse;
  return {
    location,
    current: parseCurrent(response.current),
    hourly: parseHourly(response.hourly),
    daily: parseDaily(response.daily),
    fetchedAt,
  };
}

async function requestJson(fetchFn: FetchFn, url: URL, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchFn(url, signal ? { signal } : undefined);
  if (!response.ok) throw new Error(`weather HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

function toUserSafeError(error: unknown): never {
  if (error instanceof DOMException && error.name === 'AbortError') throw error;
  throw new Error(USER_SAFE_ERROR);
}

export function createOpenMeteoClient(
  fetchFn: FetchFn = fetch,
  now: () => number = Date.now,
): WeatherClient {
  return {
    async searchLocations(query, signal) {
      if (!query.trim()) return [];

      try {
        const url = new URL(GEOCODING_ENDPOINT);
        url.search = new URLSearchParams({
          name: query.trim(),
          count: '10',
          language: 'zh',
          format: 'json',
        }).toString();
        return parseLocations(await requestJson(fetchFn, url, signal));
      } catch (error) {
        return toUserSafeError(error);
      }
    },

    async getForecast(location, signal) {
      try {
        const url = new URL(FORECAST_ENDPOINT);
        url.search = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          current: 'temperature_2m,apparent_temperature,weather_code,is_day',
          hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
          daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
          forecast_hours: '12',
          forecast_days: '5',
          timezone: 'auto',
        }).toString();
        const body = await requestJson(fetchFn, url, signal);
        const fetchedAt = now();
        if (!isFiniteNumber(fetchedAt)) throw new Error('invalid clock');
        return parseForecast(body, location, fetchedAt);
      } catch (error) {
        return toUserSafeError(error);
      }
    },
  };
}
