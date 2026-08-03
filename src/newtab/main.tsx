import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { BackgroundStore } from '../storage/backgroundStore';
import { faviconCache } from '../features/bookmarks/bookmarkIconLoader';
import { chromeLocalStorage, chromeStorageChanges, chromeSyncStorage } from '../storage/chromeApi';
import { SnapshotRepository } from '../storage/snapshotRepository';
import { EdgeSyncProvider } from '../sync/edgeSyncProvider';
import { ChromeWeatherCache } from '../features/weather/weatherCache';
import { createOpenMeteoClient } from '../features/weather/openMeteoClient';
import { createBigDataCloudReverseGeocodeClient } from '../features/weather/reverseGeocodeClient';
import { App, type AppServices } from './App';

const repository = new SnapshotRepository(chromeLocalStorage);
const backgrounds = new BackgroundStore();
const sync = new EdgeSyncProvider(chromeSyncStorage, chromeStorageChanges);

const services: AppServices = {
  repository,
  sync,
  backgrounds,
  weather: createOpenMeteoClient(),
  reverseGeocoder: createBigDataCloudReverseGeocodeClient(),
  weatherCache: new ChromeWeatherCache(chromeLocalStorage),
  faviconCache,
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
