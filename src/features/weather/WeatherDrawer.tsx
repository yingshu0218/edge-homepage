import { useEffect, useId, useRef, useState } from 'react';

import type { TemperatureUnit, WeatherLocation } from '../../domain/models';
import type { ReverseGeocodeClient, WeatherClient, WeatherForecast } from './types';
import type { WeatherState } from './useWeather';
import { convertTemperature, describeWeatherCode } from './weatherCodes';

const SEARCH_DELAY_MS = 300;

type GeolocationPositionLike = {
  coords: Pick<GeolocationCoordinates, 'latitude' | 'longitude'>;
};

type GeolocationErrorLike = {
  code: number;
  message?: string;
};

export type GeolocationAdapter = {
  getCurrentPosition(
    success: (position: GeolocationPositionLike) => void,
    failure?: (error: GeolocationErrorLike) => void,
    options?: PositionOptions,
  ): void;
};

export type WeatherDrawerProps = {
  state: WeatherState;
  client: WeatherClient;
  unit: TemperatureUnit;
  location?: WeatherLocation;
  selectedLocation?: WeatherLocation;
  onLocationChange(location: WeatherLocation): void;
  onUnitChange(unit: TemperatureUnit): void;
  onRefresh(): void | Promise<void>;
  geolocation?: GeolocationAdapter;
  reverseGeocoder: ReverseGeocodeClient;
};

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function temperature(value: number, unit: TemperatureUnit): string {
  return `${convertTemperature(value, unit)}${unit === 'fahrenheit' ? '℉' : '℃'}`;
}

function timeLabel(value: string): string {
  // Open-Meteo hourly timestamps are already expressed in the location's timezone.
  return value.slice(11, 16) || value;
}

function updatedLabel(forecast: WeatherForecast): string {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: forecast.location.timezone,
    }).format(new Date(forecast.fetchedAt));
  } catch {
    return new Date(forecast.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}

function dayLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    }).format(date);
  } catch {
    return value;
  }
}

function locationDescription(location: WeatherLocation): string {
  return [location.admin, location.country].filter(Boolean).join(' · ');
}

function geolocationMessage(error: GeolocationErrorLike): string {
  if (error.code === 1) return '位置权限被拒绝。请在浏览器设置中允许定位，或搜索城市。';
  if (error.code === 2) return '暂时无法确定当前位置，请稍后重试或搜索城市。';
  if (error.code === 3) return '获取当前位置超时，请重试或搜索城市。';
  return '无法获取当前位置，请重试或搜索城市。';
}

function ForecastContent({
  state,
  unit,
  onRefresh,
}: {
  state: Extract<WeatherState, { kind: 'ready' }>;
  unit: TemperatureUnit;
  onRefresh(): void | Promise<void>;
}) {
  const { forecast } = state;
  const currentWeather = describeWeatherCode(forecast.current.weatherCode, forecast.current.isDay);

  return (
    <div className="weather-forecast">
      <div className="weather-current">
        <div>
          <p className="weather-eyebrow">{locationDescription(forecast.location) || '天气实况'}</p>
          <h3 className="weather-city-name">{forecast.location.name}</h3>
          <p className="weather-description"><span aria-hidden="true">{currentWeather.icon}</span> {currentWeather.label}</p>
        </div>
        <strong className="weather-temperature">{temperature(forecast.current.temperature, unit)}</strong>
      </div>
      <div className="weather-current-meta">
        <span>体感 {temperature(forecast.current.apparentTemperature, unit)}</span>
        <span>更新于 {updatedLabel(forecast)}</span>
      </div>

      {state.refreshing ? <p className="weather-inline-status" role="status">正在刷新天气…</p> : null}
      {state.stale && !state.refreshing ? <p className="weather-inline-status">显示上次更新的数据</p> : null}
      {state.error ? (
        <div className="weather-action-error">
          <p role="alert">{state.error}</p>
          <button type="button" onClick={() => void onRefresh()}>重试刷新</button>
        </div>
      ) : null}

      <section className="weather-hourly" aria-labelledby="weather-hourly-title">
        <h3 id="weather-hourly-title">未来 12 小时</h3>
        <ul aria-label="未来 12 小时">
          {forecast.hourly.slice(0, 12).map((hour) => {
            const weather = describeWeatherCode(hour.weatherCode, hour.isDay);
            return (
              <li key={hour.time}>
                <time dateTime={hour.time}>{timeLabel(hour.time)}</time>
                <span className="weather-glyph" role="img" aria-label={weather.label}>{weather.icon}</span>
                <strong>{temperature(hour.temperature, unit)}</strong>
                <small>降水 {hour.precipitationProbability}%</small>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="weather-daily" aria-labelledby="weather-daily-title">
        <h3 id="weather-daily-title">未来 5 天</h3>
        <ul aria-label="未来 5 天">
          {forecast.daily.slice(0, 5).map((day) => {
            const weather = describeWeatherCode(day.weatherCode, true);
            return (
              <li key={day.date}>
                <time dateTime={day.date}>{dayLabel(day.date)}</time>
                <span className="weather-glyph" role="img" aria-label={weather.label}>{weather.icon}</span>
                <span className="weather-daily-rain">降水 {day.precipitationProbability}%</span>
                <strong>{temperature(day.temperatureMax, unit)} / {temperature(day.temperatureMin, unit)}</strong>
              </li>
            );
          })}
        </ul>
      </section>

      <button className="weather-refresh" type="button" disabled={state.refreshing} onClick={() => void onRefresh()}>
        {state.refreshing ? '正在刷新' : '刷新天气'}
      </button>
    </div>
  );
}

export function WeatherDrawer({
  state,
  client,
  unit,
  location,
  selectedLocation,
  onLocationChange,
  onUnitChange,
  onRefresh,
  geolocation,
  reverseGeocoder,
}: WeatherDrawerProps) {
  const searchHelpId = useId();
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<WeatherLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string>();
  const locationAttempt = useRef(0);
  const reverseController = useRef<AbortController | undefined>(undefined);
  const currentLocation = selectedLocation ?? location;

  useEffect(() => {
    const normalized = query.trim();
    setSearchError(undefined);
    setSearchCompleted(false);
    if (!normalized) {
      setCandidates([]);
      setSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const nextCandidates = await client.searchLocations(normalized, controller.signal);
        if (controller.signal.aborted) return;
        setCandidates(nextCandidates);
        setSearchCompleted(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setCandidates([]);
        setSearchError(messageFrom(error, '无法搜索城市，请稍后重试。'));
        setSearchCompleted(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, query]);

  useEffect(() => () => {
    locationAttempt.current += 1;
    reverseController.current?.abort();
  }, []);

  const chooseLocation = (candidate: WeatherLocation) => {
    onLocationChange(candidate);
    setQuery('');
    setCandidates([]);
    setSearchError(undefined);
  };

  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setCandidates([]);
    setSearchCompleted(false);
    setSearchError(undefined);
    setSearching(false);
  };

  const requestCurrentLocation = () => {
    const adapter = geolocation ?? (typeof navigator === 'undefined' ? undefined : navigator.geolocation);
    setLocationError(undefined);
    if (!adapter) {
      setLocationError('当前浏览器不支持定位，请搜索城市。');
      return;
    }

    const attempt = locationAttempt.current + 1;
    locationAttempt.current = attempt;
    reverseController.current?.abort();
    setLocating(true);
    adapter.getCurrentPosition(
      ({ coords }) => {
        if (locationAttempt.current !== attempt) return;
        const roundedLatitude = coords.latitude.toFixed(3);
        const roundedLongitude = coords.longitude.toFixed(3);
        let timezone = 'UTC';
        try {
          timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
          // UTC is a valid fallback when the runtime cannot resolve a local zone.
        }
        const controller = new AbortController();
        reverseController.current?.abort();
        reverseController.current = controller;
        void reverseGeocoder.reverse(coords.latitude, coords.longitude, controller.signal)
          .then((place) => {
            if (locationAttempt.current !== attempt) return;
            onLocationChange({
              id: `coords:${roundedLatitude},${roundedLongitude}`,
              name: place.name,
              ...(place.admin ? { admin: place.admin } : {}),
              country: place.country,
              latitude: coords.latitude,
              longitude: coords.longitude,
              timezone,
            });
          })
          .catch(() => {
            if (controller.signal.aborted || locationAttempt.current !== attempt) return;
            setLocationError('已获取当前位置，但城市名称解析失败；天气仍可使用。');
            onLocationChange({
              id: `coords:${roundedLatitude},${roundedLongitude}`,
              name: '当前位置',
              country: '定位',
              latitude: coords.latitude,
              longitude: coords.longitude,
              timezone,
            });
          })
          .finally(() => {
            if (locationAttempt.current === attempt) setLocating(false);
          });
      },
      (error) => {
        if (locationAttempt.current !== attempt) return;
        setLocating(false);
        setLocationError(geolocationMessage(error));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60 * 1_000 },
    );
  };

  return (
    <section className="weather-drawer-panel" aria-label="天气">
      <div className="weather-location-controls">
        <div className="weather-location-heading">
          <label htmlFor={searchHelpId}>搜索城市</label>
          <div className="weather-unit-toggle" role="group" aria-label="温度单位">
            <button type="button" aria-label="摄氏度" aria-pressed={unit === 'celsius'} onClick={() => onUnitChange('celsius')}>℃</button>
            <button type="button" aria-label="华氏度" aria-pressed={unit === 'fahrenheit'} onClick={() => onUnitChange('fahrenheit')}>℉</button>
          </div>
        </div>
        <input
          id={searchHelpId}
          type="search"
          value={query}
          autoComplete="off"
          placeholder="输入城市名称"
          aria-describedby={searchError ? `${searchHelpId}-error` : undefined}
          aria-invalid={searchError ? 'true' : undefined}
          onChange={(event) => changeQuery(event.target.value)}
        />
        {searching ? <p role="status">正在搜索城市…</p> : null}
        {searchError ? <p id={`${searchHelpId}-error`} role="alert">{searchError}</p> : null}
        {searchCompleted && !searching && !searchError && candidates.length === 0 ? <p>没有找到匹配的城市</p> : null}
        {candidates.length > 0 ? (
          <ul className="weather-location-results" aria-label="城市搜索结果">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  aria-label={`选择${candidate.name}，${locationDescription(candidate)}`}
                  onClick={() => chooseLocation(candidate)}
                >
                  <strong className="weather-city-name">{candidate.name}</strong>
                  <span>{locationDescription(candidate)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="weather-geolocation-action">
          <button type="button" onClick={requestCurrentLocation}>
            {locating ? '正在获取位置…' : '使用当前位置'}
          </button>
          {locationError ? <p role="alert">{locationError}</p> : null}
        </div>
        {currentLocation ? <p className="weather-selected-location weather-city-name">已选择：{currentLocation.name}</p> : null}
      </div>

      {state.kind === 'unconfigured' ? (
        <div className="weather-empty-state"><span aria-hidden="true">🌤️</span><p>选择城市后查看天气</p></div>
      ) : null}
      {state.kind === 'loading' ? <p className="weather-state" role="status">正在获取天气…</p> : null}
      {state.kind === 'error' ? (
        <div className="weather-state weather-action-error">
          <p role="alert">{state.message}</p>
          <button type="button" onClick={() => void onRefresh()}>重试</button>
        </div>
      ) : null}
      {state.kind === 'ready' ? <ForecastContent state={state} unit={unit} onRefresh={onRefresh} /> : null}
    </section>
  );
}
