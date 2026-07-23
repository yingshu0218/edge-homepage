import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { BackgroundStore } from '../storage/backgroundStore';
import { SnapshotRepository } from '../storage/snapshotRepository';
import { ChromeWeatherCache } from '../features/weather/weatherCache';
import { createOpenMeteoClient } from '../features/weather/openMeteoClient';
import { App, type AppServices } from './App';

const localStorageAdapter = {
  get: (keys?: string | string[]) => chrome.storage.local.get(keys),
  set: (items: Record<string, unknown>) => chrome.storage.local.set(items),
};

const repository = new SnapshotRepository(localStorageAdapter);
const backgrounds = new BackgroundStore();

const services: AppServices = {
  repository,
  backgrounds,
  weather: createOpenMeteoClient(),
  weatherCache: new ChromeWeatherCache(localStorageAdapter),
  geolocation: navigator.geolocation,
  navigate(destination) {
    window.location.assign(destination);
  },
  download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  },
};

const rootElement = document.getElementById('root');

if (!rootElement) throw new Error('Root element was not found');

createRoot(rootElement).render(<StrictMode><App services={services} /></StrictMode>);
