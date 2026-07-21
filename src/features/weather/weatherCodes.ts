import type { TemperatureUnit } from '../../domain/models';

export type WeatherCodeDescription = {
  label: string;
  icon: string;
};

const UNKNOWN_WEATHER: WeatherCodeDescription = { label: '未知天气', icon: '❔' };

export function describeWeatherCode(code: number, isDay: boolean): WeatherCodeDescription {
  if (code === 0) return { label: '晴朗', icon: isDay ? '☀️' : '🌙' };
  if (code === 1 || code === 2) return { label: '多云', icon: '⛅' };
  if (code === 3) return { label: '阴', icon: '☁️' };
  if (code === 45 || code === 48) return { label: '有雾', icon: '🌫️' };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: '毛毛雨', icon: '🌦️' };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: '有雨', icon: '🌧️' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: '有雪', icon: '❄️' };
  if ([95, 96, 99].includes(code)) return { label: '雷暴', icon: '⛈️' };
  return UNKNOWN_WEATHER;
}

export function convertTemperature(value: number, unit: TemperatureUnit): number {
  return unit === 'fahrenheit' ? Math.round((value * 9) / 5 + 32) : value;
}
