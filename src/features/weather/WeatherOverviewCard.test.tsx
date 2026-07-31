import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { WeatherLocation } from '../../domain/models';
import { WeatherOverviewCard } from './WeatherOverviewCard';
import type { WeatherForecast } from './types';

const fuzhou: WeatherLocation = {
  id: 'fuzhou-cn',
  name: '福州',
  admin: '福建',
  country: '中国',
  latitude: 26.08,
  longitude: 119.3,
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
    hourly: Array.from({ length: 4 }, (_, index) => ({
      time: `2026-07-22T${String(index + 10).padStart(2, '0')}:00`,
      temperature: 30 + index,
      precipitationProbability: index * 10,
      weatherCode: index % 2 ? 61 : 0,
      isDay: true,
    })),
    daily: [{
      date: '2026-07-22',
      temperatureMax: 34,
      temperatureMin: 26,
      precipitationProbability: 20,
      weatherCode: 0,
    }],
    fetchedAt: new Date('2026-07-22T01:15:00.000Z').getTime(),
  };
}

afterEach(cleanup);

describe('WeatherOverviewCard', () => {
  it('offers weather setup when no city is configured', () => {
    render(<WeatherOverviewCard state={{ kind: 'unconfigured' }} unit="celsius" onOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: /设置天气/ })).toHaveTextContent('选择城市后查看天气');
  });

  it('keeps the configured city visible while weather is loading', () => {
    render(<WeatherOverviewCard state={{ kind: 'loading' }} unit="celsius" configuredLocation={fuzhou} onOpen={vi.fn()} />);

    expect(screen.getByRole('button', { name: /福州.*正在获取天气/ })).toBeInTheDocument();
    expect(screen.getByText('福州')).toBeInTheDocument();
  });

  it('renders a balanced ready overview and only the next three hours', () => {
    const forecast = makeForecast();
    render(
      <WeatherOverviewCard
        state={{ kind: 'ready', forecast, refreshing: false, stale: false }}
        unit="celsius"
        configuredLocation={forecast.location}
        onOpen={vi.fn()}
      />,
    );

    const card = screen.getByRole('button', { name: /福州.*晴.*30℃/ });
    expect(within(card).getByText('体感 34℃')).toBeInTheDocument();
    expect(within(card).getByText('34℃ / 26℃')).toBeInTheDocument();
    expect(within(card).getByText('降水 20%')).toBeInTheDocument();
    expect(within(card).getAllByRole('listitem')).toHaveLength(3);
    expect(within(card).getByText('天气与地点：Open-Meteo')).toBeInTheDocument();
  });

  it('converts every displayed temperature to Fahrenheit', () => {
    const forecast = makeForecast();
    render(<WeatherOverviewCard state={{ kind: 'ready', forecast, refreshing: false, stale: false }} unit="fahrenheit" onOpen={vi.fn()} />);

    const card = screen.getByRole('button', { name: /福州.*86℉/ });
    expect(within(card).getByText('体感 93℉')).toBeInTheDocument();
    expect(within(card).getByText('93℉ / 79℉')).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: '未来三小时' })).toHaveTextContent('88℉');
  });

  it('reports a failed refresh while retaining the cached overview', () => {
    render(
      <WeatherOverviewCard
        state={{ kind: 'ready', forecast: makeForecast(), refreshing: false, stale: true, error: '网络离线' }}
        unit="celsius"
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText('更新失败，正在显示上次数据')).toBeInTheDocument();
    expect(screen.getAllByText('30℃').length).toBeGreaterThan(0);
  });

  it('offers a retry or setup prompt for an empty-cache error without nesting another button', () => {
    render(<WeatherOverviewCard state={{ kind: 'error', message: '天气服务不可用' }} unit="celsius" onOpen={vi.fn()} />);

    const card = screen.getByRole('button', { name: /重试或设置天气/ });
    expect(within(card).getByText('天气服务不可用')).toBeInTheDocument();
    expect(card.querySelector('button')).toBeNull();
  });

  it('attributes device-location naming to BigDataCloud', () => {
    const forecast = makeForecast();
    forecast.location = { ...forecast.location, id: 'coords:26.080,119.300', name: '福州市' };
    render(<WeatherOverviewCard state={{ kind: 'ready', forecast, refreshing: false, stale: false }} unit="celsius" configuredLocation={forecast.location} onOpen={vi.fn()} />);

    expect(screen.getByText('天气：Open-Meteo · 地点：BigDataCloud')).toBeInTheDocument();
  });

  it('opens from the whole card and exposes the trigger', () => {
    const onOpen = vi.fn();
    render(<WeatherOverviewCard state={{ kind: 'unconfigured' }} unit="celsius" onOpen={onOpen} />);
    const card = screen.getByRole('button', { name: /设置天气/ });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(card);
  });
});
