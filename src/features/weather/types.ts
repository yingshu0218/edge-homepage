import type { WeatherLocation } from '../../domain/models';

export type WeatherSummary = {
  time: string;
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  isDay: boolean;
};

export type HourlyWeather = {
  time: string;
  temperature: number;
  precipitationProbability: number;
  weatherCode: number;
  isDay: boolean;
};

export type DailyWeather = {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  precipitationProbability: number;
  weatherCode: number;
};

export type WeatherForecast = {
  location: WeatherLocation;
  current: WeatherSummary;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  fetchedAt: number;
};

export interface WeatherClient {
  searchLocations(query: string, signal?: AbortSignal): Promise<WeatherLocation[]>;
  getForecast(location: WeatherLocation, signal?: AbortSignal): Promise<WeatherForecast>;
}
