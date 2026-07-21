export type Bookmark = {
  id: string;
  title: string;
  url: string;
  groupId: string;
  order: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
};

export type BookmarkGroup = {
  id: string;
  name: string;
  order: number;
  updatedAt: number;
  deletedAt?: number;
};

export type BookmarkDisplayLimit = 8 | 12 | 16;
export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type WeatherLocation = {
  id: string;
  name: string;
  admin?: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export type AppSettings = {
  searchTemplate: string;
  themeId: string;
  appearance: 'light' | 'dark';
  overlay: number;
  blur: number;
  useCustomBackground: boolean;
  bookmarkDisplayLimit: BookmarkDisplayLimit;
  clockHour12: boolean;
  clockShowSeconds: boolean;
  clockShowFullDate: boolean;
  temperatureUnit: TemperatureUnit;
  weatherLocation?: WeatherLocation;
  updatedAt: number;
};

export type AppSnapshot = {
  schemaVersion: 2;
  bookmarks: Bookmark[];
  groups: BookmarkGroup[];
  settings: AppSettings;
};
