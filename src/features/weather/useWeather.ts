import { useCallback, useEffect, useRef, useState } from 'react';

import type { WeatherLocation } from '../../domain/models';
import type { WeatherCacheStore } from '../../storage/types';
import type { WeatherClient, WeatherForecast } from './types';
import { isFreshWeatherCache } from './weatherCache';

export type WeatherState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'ready'; forecast: WeatherForecast; refreshing: boolean; stale: boolean; error?: string }
  | { kind: 'error'; message: string };

export type UseWeatherOptions = {
  location?: WeatherLocation;
  client: WeatherClient;
  cache: WeatherCacheStore;
  now?: () => number;
};

export type WeatherRefreshOptions = {
  force?: boolean;
};

export type UseWeatherResult = {
  state: WeatherState;
  refresh(options?: WeatherRefreshOptions): Promise<void>;
};

type NetworkRequest = {
  controller: AbortController;
  promise: Promise<WeatherForecast>;
};

type RefreshRequest = {
  selection: number;
  promise: Promise<void>;
};

type InitialLoad = {
  selection: number;
  promise: Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '天气服务暂时不可用，请稍后重试。';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useWeather({
  location,
  client,
  cache,
  now = Date.now,
}: UseWeatherOptions): UseWeatherResult {
  const [state, setState] = useState<WeatherState>(() => (
    location ? { kind: 'loading' } : { kind: 'unconfigured' }
  ));
  const stateRef = useRef(state);
  stateRef.current = state;
  const mountedRef = useRef(true);
  const selectionRef = useRef({ id: location?.id, version: 0 });
  const locationRef = useRef(location);
  const clientRef = useRef(client);
  const cacheRef = useRef(cache);
  const nowRef = useRef(now);
  const networkRequestsRef = useRef(new Map<string, NetworkRequest>());
  const refreshRequestsRef = useRef(new Map<string, RefreshRequest>());
  const initialLoadRef = useRef<InitialLoad | undefined>(undefined);
  const cacheWriteRef = useRef<Promise<void>>(Promise.resolve());
  const refreshRef = useRef<(options?: WeatherRefreshOptions) => Promise<void>>(async () => {});

  locationRef.current = location;
  clientRef.current = client;
  cacheRef.current = cache;
  nowRef.current = now;

  const updateState = useCallback((next: WeatherState) => {
    if (!mountedRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const isActiveSelection = useCallback((id: string, selection: number) => (
    mountedRef.current
    && selectionRef.current.id === id
    && selectionRef.current.version === selection
  ), []);

  const getNetworkRequest = useCallback((selectedLocation: WeatherLocation): NetworkRequest => {
    const existing = networkRequestsRef.current.get(selectedLocation.id);
    if (existing) return existing;

    const controller = new AbortController();
    let promise: Promise<WeatherForecast>;
    try {
      promise = clientRef.current.getForecast(selectedLocation, controller.signal);
    } catch (error) {
      promise = Promise.reject(error);
    }
    const request = { controller, promise };
    networkRequestsRef.current.set(selectedLocation.id, request);
    const removeRequest = () => {
      if (networkRequestsRef.current.get(selectedLocation.id) === request) {
        networkRequestsRef.current.delete(selectedLocation.id);
      }
    };
    void promise.then(removeRequest, removeRequest);
    return request;
  }, []);

  const runRefresh = useCallback((
    selectedLocation: WeatherLocation,
    options: WeatherRefreshOptions,
    cachedForecast: WeatherForecast | undefined,
    selection: number,
  ): Promise<void> => {
    const existing = refreshRequestsRef.current.get(selectedLocation.id);
    if (existing?.selection === selection) return existing.promise;

    const currentForecast = stateRef.current.kind === 'ready'
      && stateRef.current.forecast.location.id === selectedLocation.id
      ? stateRef.current.forecast
      : cachedForecast;
    const fresh = currentForecast
      ? isFreshWeatherCache(currentForecast, selectedLocation, nowRef.current())
      : false;
    if (!options.force && fresh) return Promise.resolve();

    if (currentForecast) {
      updateState({
        kind: 'ready',
        forecast: currentForecast,
        refreshing: true,
        stale: !fresh,
      });
    } else {
      updateState({ kind: 'loading' });
    }

    const operation = (async () => {
      try {
        const nextForecast = await getNetworkRequest(selectedLocation).promise;
        if (!isActiveSelection(selectedLocation.id, selection)) return;
        const precedingWrite = cacheWriteRef.current.catch(() => {});
        const cacheWrite = precedingWrite.then(async () => {
          if (!isActiveSelection(selectedLocation.id, selection)) return;
          await cacheRef.current.save(nextForecast);
        });
        cacheWriteRef.current = cacheWrite.then(() => {}, () => {});
        await cacheWrite;
        if (!isActiveSelection(selectedLocation.id, selection)) return;
        updateState({
          kind: 'ready',
          forecast: nextForecast,
          refreshing: false,
          stale: false,
        });
      } catch (error) {
        if (!isActiveSelection(selectedLocation.id, selection) || isAbortError(error)) return;
        if (currentForecast) {
          updateState({
            kind: 'ready',
            forecast: currentForecast,
            refreshing: false,
            stale: !isFreshWeatherCache(currentForecast, selectedLocation, nowRef.current()),
            error: errorMessage(error),
          });
        } else {
          updateState({ kind: 'error', message: errorMessage(error) });
        }
      }
    })();
    const request = { selection, promise: operation };
    refreshRequestsRef.current.set(selectedLocation.id, request);
    void operation.finally(() => {
      if (refreshRequestsRef.current.get(selectedLocation.id) === request) {
        refreshRequestsRef.current.delete(selectedLocation.id);
      }
    });
    return operation;
  }, [getNetworkRequest, isActiveSelection, updateState]);

  const refresh = useCallback((options: WeatherRefreshOptions = {}): Promise<void> => {
    const selectedLocation = locationRef.current;
    if (!selectedLocation) return Promise.resolve();
    const selection = selectionRef.current;
    if (selection.id !== selectedLocation.id) return Promise.resolve();
    const initialLoad = initialLoadRef.current;
    if (!options.force && initialLoad?.selection === selection.version) {
      return initialLoad.promise;
    }
    const cachedForecast = stateRef.current.kind === 'ready'
      ? stateRef.current.forecast
      : undefined;
    return runRefresh(selectedLocation, options, cachedForecast, selection.version);
  }, [runRefresh]);
  refreshRef.current = refresh;

  useEffect(() => {
    mountedRef.current = true;
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshRef.current();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      selectionRef.current.version += 1;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      for (const request of networkRequestsRef.current.values()) request.controller.abort();
      networkRequestsRef.current.clear();
      refreshRequestsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const selectedLocation = locationRef.current;
    const version = selectionRef.current.version + 1;
    selectionRef.current = { id: selectedLocation?.id, version };

    if (!selectedLocation) {
      updateState({ kind: 'unconfigured' });
      return;
    }

    updateState({ kind: 'loading' });
    const load = (async () => {
      let entry: WeatherForecast | undefined;
      try {
        entry = await cacheRef.current.load();
      } catch {
        entry = undefined;
      }
      if (!isActiveSelection(selectedLocation.id, version)) return;

      if (entry?.location.id === selectedLocation.id) {
        const fresh = isFreshWeatherCache(entry, selectedLocation, nowRef.current());
        if (fresh) {
          updateState({ kind: 'ready', forecast: entry, refreshing: false, stale: false });
          return;
        }
        await runRefresh(selectedLocation, {}, entry, version);
        return;
      }
      await runRefresh(selectedLocation, {}, undefined, version);
    })();
    const initialLoad = { selection: version, promise: load };
    initialLoadRef.current = initialLoad;
    const clearInitialLoad = () => {
      if (initialLoadRef.current === initialLoad) initialLoadRef.current = undefined;
    };
    void load.then(clearInitialLoad, clearInitialLoad);

    return () => {
      if (selectionRef.current.id === selectedLocation.id
        && selectionRef.current.version === version) {
        selectionRef.current.version += 1;
      }
      const networkRequest = networkRequestsRef.current.get(selectedLocation.id);
      if (networkRequest) {
        networkRequest.controller.abort();
        networkRequestsRef.current.delete(selectedLocation.id);
      }
      const refreshRequest = refreshRequestsRef.current.get(selectedLocation.id);
      if (refreshRequest?.selection === version) {
        refreshRequestsRef.current.delete(selectedLocation.id);
      }
      if (initialLoadRef.current === initialLoad) initialLoadRef.current = undefined;
    };
  }, [location?.id, isActiveSelection, runRefresh, updateState]);

  return { state, refresh };
}
