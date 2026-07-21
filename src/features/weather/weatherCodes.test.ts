import { describe, expect, it } from 'vitest';

import { convertTemperature, describeWeatherCode } from './weatherCodes';

describe('describeWeatherCode', () => {
  it('distinguishes clear daytime and nighttime weather', () => {
    expect(describeWeatherCode(0, true)).toEqual({ label: '晴朗', icon: '☀️' });
    expect(describeWeatherCode(0, false)).toEqual({ label: '晴朗', icon: '🌙' });
  });

  it.each([
    [2, { label: '多云', icon: '⛅' }],
    [45, { label: '有雾', icon: '🌫️' }],
    [53, { label: '毛毛雨', icon: '🌦️' }],
    [63, { label: '有雨', icon: '🌧️' }],
    [73, { label: '有雪', icon: '❄️' }],
    [95, { label: '雷暴', icon: '⛈️' }],
  ])('maps WMO code %i to a local description', (code, expected) => {
    expect(describeWeatherCode(code, true)).toEqual(expected);
  });

  it('falls back safely for an unknown code', () => {
    expect(describeWeatherCode(999, true)).toEqual({ label: '未知天气', icon: '❔' });
  });
});

describe('convertTemperature', () => {
  it('keeps Celsius values unchanged', () => {
    expect(convertTemperature(12.5, 'celsius')).toBe(12.5);
  });

  it('converts Celsius to Fahrenheit and rounds to the nearest integer', () => {
    expect(convertTemperature(12.5, 'fahrenheit')).toBe(55);
    expect(convertTemperature(-40, 'fahrenheit')).toBe(-40);
  });
});
