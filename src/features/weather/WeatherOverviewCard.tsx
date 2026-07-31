import type { TemperatureUnit, WeatherLocation } from '../../domain/models';
import type { HourlyWeather } from './types';
import type { WeatherState } from './useWeather';
import { convertTemperature, describeWeatherCode } from './weatherCodes';

export type WeatherOverviewCardProps = {
  state: WeatherState;
  unit: TemperatureUnit;
  configuredLocation?: WeatherLocation;
  onOpen(trigger: HTMLButtonElement): void;
};

function temperature(value: number, unit: TemperatureUnit): string {
  return `${convertTemperature(value, unit)}${unit === 'fahrenheit' ? '℉' : '℃'}`;
}

function timeLabel(value: string): string {
  return value.slice(11, 16) || value;
}

function fetchedAtLabel(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function sourceLabel(location: WeatherLocation): string {
  return location.id.startsWith('coords:')
    ? '天气：Open-Meteo · 地点：BigDataCloud'
    : '天气与地点：Open-Meteo';
}

function isHourlyWeather(value: unknown): value is HourlyWeather {
  if (!value || typeof value !== 'object') return false;
  const hour = value as Partial<HourlyWeather>;
  return typeof hour.time === 'string'
    && typeof hour.temperature === 'number'
    && typeof hour.weatherCode === 'number'
    && typeof hour.isDay === 'boolean';
}

export function WeatherOverviewCard({ state, unit, configuredLocation, onOpen }: WeatherOverviewCardProps) {
  const configuredName = configuredLocation?.name;
  const buttonProps = {
    className: `weather-overview-card is-${state.kind}`,
    type: 'button' as const,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => onOpen(event.currentTarget),
  };

  if (state.kind === 'unconfigured') {
    return (
      <button {...buttonProps} aria-label="设置天气">
        <span className="weather-overview-eyebrow">天气概览</span>
        <span>选择城市后查看天气</span>
        <span>设置天气</span>
      </button>
    );
  }

  if (state.kind === 'loading') {
    const loadingLabel = configuredName ? `${configuredName}，正在获取天气` : '正在获取天气';
    return (
      <button {...buttonProps} aria-label={loadingLabel}>
        <span className="weather-overview-eyebrow">天气概览</span>
        {configuredName ? <strong>{configuredName}</strong> : null}
        <span role="status">正在获取天气</span>
      </button>
    );
  }

  if (state.kind === 'error') {
    return (
      <button {...buttonProps} aria-label={`${state.message}，点击重试或设置天气`}>
        <span className="weather-overview-eyebrow">天气概览</span>
        {configuredName ? <strong>{configuredName}</strong> : null}
        <span role="alert">{state.message}</span>
        <span>点击重试或设置天气</span>
      </button>
    );
  }

  const { forecast } = state;
  const currentWeather = describeWeatherCode(forecast.current.weatherCode, forecast.current.isDay);
  const daily = Array.isArray(forecast.daily) ? forecast.daily : [];
  const hourly = Array.isArray(forecast.hourly) ? forecast.hourly : [];
  const today = daily[0];
  const currentTemperature = temperature(forecast.current.temperature, unit);

  return (
    <button
      {...buttonProps}
      aria-label={`${forecast.location.name}，${currentWeather.label}，${currentTemperature}，查看天气详情`}
    >
      <span className="weather-overview-eyebrow">天气概览</span>
      <span className="weather-overview-header">
        <strong>{forecast.location.name}</strong>
        <span aria-label={currentWeather.label} role="img">{currentWeather.icon}</span>
        <span>{currentWeather.label}</span>
        <strong>{currentTemperature}</strong>
      </span>
      <span className="weather-overview-metrics">
        <span>体感 {temperature(forecast.current.apparentTemperature, unit)}</span>
        {today ? <span>{temperature(today.temperatureMax, unit)} / {temperature(today.temperatureMin, unit)}</span> : null}
        {today ? <span>降水 {today.precipitationProbability}%</span> : null}
        <span>更新于 {fetchedAtLabel(forecast.fetchedAt)}</span>
      </span>
      {state.refreshing ? <span role="status">正在刷新天气</span> : null}
      {state.stale && !state.refreshing ? <span role="alert">更新失败，正在显示上次数据</span> : null}
      <ul className="weather-overview-hours" aria-label="未来三小时">
        {hourly.slice(0, 3).filter(isHourlyWeather).map((hour) => {
          const weather = describeWeatherCode(hour.weatherCode, hour.isDay);
          return (
            <li key={hour.time}>
              <time dateTime={hour.time}>{timeLabel(hour.time)}</time>
              <span aria-label={weather.label} role="img">{weather.icon}</span>
              <strong>{temperature(hour.temperature, unit)}</strong>
            </li>
          );
        })}
      </ul>
      <span className="weather-overview-source">{sourceLabel(forecast.location)}</span>
    </button>
  );
}
