# Weather Overview Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent weather overview card below the mood card and resolve opt-in device coordinates to a real city name.

**Architecture:** Keep Open-Meteo weather fetching unchanged and add a separate, injected `ReverseGeocodeClient` for BigDataCloud. A pure `WeatherOverviewCard` renders the existing `WeatherState`; `App` only composes it into a right-side column and routes card activation to the existing weather drawer.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Vitest 3, Testing Library, Chromium Manifest V3, Open-Meteo, BigDataCloud free client-side reverse geocoding.

## Global Constraints

- The weather card is always present below the mood card; the unconfigured state is a setup prompt.
- The ready card shows real city, current conditions, apparent temperature, daily high/low, precipitation probability, and the next three hourly readings.
- Clicking the card opens the existing weather drawer and closing the drawer restores focus to the exact trigger.
- Open-Meteo remains the only weather provider.
- BigDataCloud is called only after the user explicitly requests current location and only with coordinates returned by that client device.
- The BigDataCloud request uses `localityLanguage=zh`, needs no API key, and must use the exact host permission `https://api.bigdatacloud.net/*`.
- No continuous location watch, location history, analytics, advertising, telemetry, or additional runtime dependency.
- If reverse geocoding fails, forecast setup continues with a recoverable location-name fallback.
- Both dark and light appearance, narrow windows, keyboard navigation, and reduced motion remain supported.

---

### Task 1: BigDataCloud reverse-geocoding boundary

**Files:**
- Create: `src/features/weather/reverseGeocodeClient.ts`
- Create: `src/features/weather/reverseGeocodeClient.test.ts`
- Modify: `src/features/weather/types.ts`

**Interfaces:**
- Consumes: WGS84 latitude and longitude returned by browser geolocation.
- Produces:

```ts
export type ReverseGeocodeResult = {
  name: string;
  admin?: string;
  country: string;
};

export interface ReverseGeocodeClient {
  reverse(latitude: number, longitude: number, signal?: AbortSignal): Promise<ReverseGeocodeResult>;
}

export function createBigDataCloudReverseGeocodeClient(
  fetchFn?: typeof fetch,
): ReverseGeocodeClient;
```

- [ ] **Step 1: Write the failing contract tests**

Create `src/features/weather/reverseGeocodeClient.test.ts` with cases that verify the exact endpoint and parameters, response priority, fallback fields, malformed payloads, HTTP errors, and abort propagation:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createBigDataCloudReverseGeocodeClient } from './reverseGeocodeClient';

describe('BigDataCloud reverse geocoder', () => {
  it('requests the current coordinates in Chinese and prefers city', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      city: '福州市',
      locality: '鼓楼区',
      principalSubdivision: '福建省',
      countryName: '中国',
    }), { status: 200 }));
    const client = createBigDataCloudReverseGeocodeClient(fetchFn);

    await expect(client.reverse(26.08044, 119.30049)).resolves.toEqual({
      name: '福州市',
      admin: '福建省',
      country: '中国',
    });
    const url = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://api.bigdatacloud.net/data/reverse-geocode-client');
    expect(url.searchParams.get('latitude')).toBe('26.08044');
    expect(url.searchParams.get('longitude')).toBe('119.30049');
    expect(url.searchParams.get('localityLanguage')).toBe('zh');
  });

  it.each([
    [{ city: '', locality: '鼓楼区', principalSubdivision: '福建省', countryName: '中国' }, '鼓楼区'],
    [{ city: '', locality: '', principalSubdivision: '福建省', countryName: '中国' }, '福建省'],
    [{ city: '', locality: '', principalSubdivision: '', countryName: '中国' }, '中国'],
  ])('uses the first available readable locality from %o', async (body, name) => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    await expect(createBigDataCloudReverseGeocodeClient(fetchFn).reverse(26, 119))
      .resolves.toMatchObject({ name });
  });

  it('rejects a payload without any readable place', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(createBigDataCloudReverseGeocodeClient(fetchFn).reverse(26, 119))
      .rejects.toThrow('暂时无法解析所在城市');
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npm test -- src/features/weather/reverseGeocodeClient.test.ts
```

Expected: FAIL because `reverseGeocodeClient.ts` does not exist.

- [ ] **Step 3: Add the interfaces and strict client implementation**

Add the interfaces to `src/features/weather/types.ts`. Implement:

```ts
const ENDPOINT = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

function readable(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function createBigDataCloudReverseGeocodeClient(
  fetchFn: typeof fetch = fetch,
): ReverseGeocodeClient {
  return {
    async reverse(latitude, longitude, signal) {
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw new Error('无效的位置坐标');
      }
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        localityLanguage: 'zh',
      }).toString();
      try {
        const response = await fetchFn(url, signal ? { signal } : undefined);
        if (!response.ok) throw new Error(`reverse geocode HTTP ${response.status}`);
        const body: unknown = await response.json();
        if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('invalid payload');
        const value = body as Record<string, unknown>;
        const country = readable(value.countryName);
        const admin = readable(value.principalSubdivision);
        const name = readable(value.city) ?? readable(value.locality) ?? admin ?? country;
        if (!name || !country) throw new Error('missing place');
        return { name, ...(admin && admin !== name ? { admin } : {}), country };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new Error('暂时无法解析所在城市');
      }
    },
  };
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm test -- src/features/weather/reverseGeocodeClient.test.ts
```

Expected: all reverse-geocoder tests PASS.

- [ ] **Step 5: Commit the isolated boundary**

```bash
git add src/features/weather/types.ts src/features/weather/reverseGeocodeClient.ts src/features/weather/reverseGeocodeClient.test.ts
git commit -m "feat: add reverse geocoding client"
```

---

### Task 2: Resolve a real city during opt-in location

**Files:**
- Modify: `src/features/weather/WeatherDrawer.tsx`
- Modify: `src/features/weather/WeatherDrawer.test.tsx`
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/main.tsx`

**Interfaces:**
- Consumes: `ReverseGeocodeClient` from Task 1.
- Produces: `WeatherDrawer` prop `reverseGeocoder: ReverseGeocodeClient` and `AppServices.reverseGeocoder: ReverseGeocodeClient`.
- Persists a `WeatherLocation` whose ID remains `coords:<lat>,<lon>` and whose `name`, `admin`, and `country` come from BigDataCloud when available.

- [ ] **Step 1: Replace the old location test with failing city-resolution tests**

Update the weather-drawer test helper to pass:

```ts
const reverseGeocoder: ReverseGeocodeClient = {
  reverse: vi.fn().mockResolvedValue({
    name: '福州市',
    admin: '福建省',
    country: '中国',
  }),
};
```

Replace “without reverse geocoding” with:

```ts
it('resolves and saves the real city after the user requests current location', async () => {
  const onLocationChange = vi.fn();
  const reverse = vi.fn().mockResolvedValue({
    name: '福州市',
    admin: '福建省',
    country: '中国',
  });
  const geolocation: GeolocationAdapter = {
    getCurrentPosition(success) {
      success({ coords: { latitude: 26.08044, longitude: 119.30049 } });
    },
  };
  renderDrawer({ geolocation, reverseGeocoder: { reverse }, onLocationChange });
  fireEvent.click(screen.getByRole('button', { name: '使用当前位置' }));

  await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith(expect.objectContaining({
    id: 'coords:26.080,119.300',
    name: '福州市',
    admin: '福建省',
    country: '中国',
  })));
  expect(reverse).toHaveBeenCalledWith(26.08044, 119.30049, expect.any(AbortSignal));
});

it('keeps weather setup usable when city resolution fails', async () => {
  const onLocationChange = vi.fn();
  renderDrawer({
    geolocation: {
      getCurrentPosition(success) {
        success({ coords: { latitude: 26.08044, longitude: 119.30049 } });
      },
    },
    reverseGeocoder: { reverse: vi.fn().mockRejectedValue(new Error('offline')) },
    onLocationChange,
  });
  fireEvent.click(screen.getByRole('button', { name: '使用当前位置' }));

  await waitFor(() => expect(onLocationChange).toHaveBeenCalledWith(expect.objectContaining({
    name: '当前位置',
    country: '定位',
  })));
  expect(screen.getByRole('alert')).toHaveTextContent('城市名称解析失败');
});
```

Add a race test that two location attempts cannot allow the first reverse-geocoder result to overwrite the second.

- [ ] **Step 2: Run the drawer tests and verify RED**

Run:

```bash
npm test -- src/features/weather/WeatherDrawer.test.tsx
```

Expected: FAIL because `WeatherDrawer` does not accept or call `reverseGeocoder`.

- [ ] **Step 3: Implement abortable reverse geocoding in the location action**

Add `reverseGeocoder` to the drawer props. Track the current reverse-geocode controller in a ref, abort it on a new attempt and unmount, and after geolocation succeeds:

```ts
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
  .catch((cause) => {
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
```

Keep `locating` true until both browser geolocation and reverse geocoding settle.

- [ ] **Step 4: Inject the client through the application**

Extend `AppServices` with:

```ts
reverseGeocoder: ReverseGeocodeClient;
```

Pass it to `WeatherDrawer` and construct it in `src/newtab/main.tsx`:

```ts
reverseGeocoder: createBigDataCloudReverseGeocodeClient(),
```

Update all `fakeServices` helpers with a deterministic mock.

- [ ] **Step 5: Run weather and app tests**

Run:

```bash
npm test -- src/features/weather/WeatherDrawer.test.tsx src/newtab/App.test.tsx
```

Expected: all selected tests PASS; no test performs a real network request.

- [ ] **Step 6: Commit the location behavior**

```bash
git add src/features/weather/WeatherDrawer.tsx src/features/weather/WeatherDrawer.test.tsx src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/main.tsx
git commit -m "feat: resolve current location city"
```

---

### Task 3: Build the pure weather overview card

**Files:**
- Create: `src/features/weather/WeatherOverviewCard.tsx`
- Create: `src/features/weather/WeatherOverviewCard.test.tsx`

**Interfaces:**
- Consumes:

```ts
type WeatherOverviewCardProps = {
  state: WeatherState;
  unit: TemperatureUnit;
  configuredLocation?: WeatherLocation;
  onOpen(trigger: HTMLButtonElement): void;
};
```

- Produces: one native button with class `weather-overview-card`, state-specific content, and an accessible label.

- [ ] **Step 1: Write failing component tests for every state**

Create tests for unconfigured, loading, ready, stale-refresh failure, and empty-cache error states. The ready test uses non-empty hourly and daily arrays:

```tsx
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
```

The loading test must keep the configured city visible. The stale test must display “更新失败，正在显示上次数据”. The error test must display a retry/setup prompt without embedding a second button inside the card button.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- src/features/weather/WeatherOverviewCard.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement state rendering and formatting helpers**

Implement the component with:

- `describeWeatherCode` for icon and label.
- `convertTemperature` for every temperature.
- `forecast.daily[0]` for high/low and daily precipitation.
- `forecast.hourly.slice(0, 3)` for the three-hour trend.
- `Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })` for `fetchedAt`.
- `id.startsWith('coords:')` to choose source attribution without changing the persisted schema.

Use this structural shape:

```tsx
<button className={`weather-overview-card is-${state.kind}`} type="button" onClick={(event) => onOpen(event.currentTarget)}>
  <span className="weather-overview-eyebrow">天气概览</span>
  {/* state-specific header and metrics */}
  <ul className="weather-overview-hours" aria-label="未来三小时">...</ul>
  <span className="weather-overview-source">...</span>
</button>
```

- [ ] **Step 4: Run focused component and weather-domain tests**

Run:

```bash
npm test -- src/features/weather/WeatherOverviewCard.test.tsx src/features/weather/weatherCodes.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit the pure card**

```bash
git add src/features/weather/WeatherOverviewCard.tsx src/features/weather/WeatherOverviewCard.test.tsx
git commit -m "feat: add weather overview card"
```

---

### Task 4: Integrate the reference layout and responsive styling

**Files:**
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/app.css`
- Modify: `src/newtab/app.css.test.mjs`

**Interfaces:**
- Consumes: `WeatherOverviewCard` from Task 3 and the existing `openDrawer('weather', trigger)` flow.
- Produces: `.dashboard-column` containing `.mood-card` then `.weather-overview-card`.

- [ ] **Step 1: Write failing application and CSS-contract tests**

Add an app test:

```tsx
it('places the weather overview after the mood card and restores card focus', async () => {
  const snapshot = createDefaultSnapshot();
  snapshot.settings.weatherLocation = forecast().location;
  const services = fakeServices(snapshot);
  services.weatherCache.load = vi.fn().mockResolvedValue(makeOverviewForecast());
  render(<App services={services} />);

  const overview = await screen.findByRole('button', { name: /北京.*有雨/ });
  expect(overview.parentElement).toHaveClass('dashboard-column');
  expect(overview.previousElementSibling).toHaveClass('mood-card');
  fireEvent.click(overview);
  const drawer = screen.getByRole('dialog', { name: '天气' });
  fireEvent.keyDown(drawer, { key: 'Escape' });
  await waitFor(() => expect(overview).toHaveFocus());
});
```

Extend `app.css.test.mjs` to assert:

```js
expect(css).toMatch(/\.dashboard-column\s*\{[^}]*display:\s*grid/);
expect(css).toMatch(/\.weather-overview-card\s*\{[^}]*width:\s*100%/);
expect(css).toMatch(/@media\s*\(max-width:\s*980px\)[\s\S]*\.workspace\s*\{[^}]*grid-template-columns:\s*1fr/);
```

- [ ] **Step 2: Run app and CSS tests and verify RED**

Run:

```bash
npm test -- src/newtab/App.test.tsx src/newtab/app.css.test.mjs
```

Expected: FAIL because the dashboard column and weather card are not integrated.

- [ ] **Step 3: Compose the right-side dashboard column**

Replace the single mood-card sibling with:

```tsx
<aside className="dashboard-column" aria-label="启动页概览">
  <section className="mood-card">...</section>
  <WeatherOverviewCard
    state={weather.state}
    unit={snapshot.settings.temperatureUnit}
    configuredLocation={snapshot.settings.weatherLocation}
    onOpen={(trigger) => openDrawer('weather', trigger)}
  />
</aside>
```

Do not nest one `<aside>` inside another; the mood card becomes a `<section>`.

- [ ] **Step 4: Implement desktop, light-mode, and narrow-window styles**

Add:

```css
.dashboard-column { min-width: 0; display: grid; align-content: start; gap: 18px; }
.weather-overview-card {
  width: 100%;
  min-width: 0;
  display: block;
  padding: 22px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.16);
  border-radius: 20px;
  background: rgba(255,255,255,.075);
  color: inherit;
  text-align: left;
  backdrop-filter: blur(24px);
  box-shadow: 0 24px 60px rgba(6,4,14,.18);
  cursor: pointer;
}
.weather-overview-hours { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); }
```

Add explicit light-appearance selectors for the card, muted text, sub-panels, and borders. At `max-width: 980px`, let `.dashboard-column` follow the command area as a normal single-column item. At `max-width: 430px`, reduce padding and gaps but retain three hourly columns without horizontal overflow.

- [ ] **Step 5: Run focused tests and production build**

Run:

```bash
npm test -- src/features/weather/WeatherOverviewCard.test.tsx src/newtab/App.test.tsx src/newtab/app.css.test.mjs
npm run build
```

Expected: focused tests PASS and Vite build exits 0.

- [ ] **Step 6: Commit the integrated layout**

```bash
git add src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/app.css src/newtab/app.css.test.mjs
git commit -m "feat: show weather overview on new tab"
```

---

### Task 5: Permissions, privacy documentation, and release verification

**Files:**
- Modify: `public/manifest.json`
- Modify: `README.md`
- Modify: `docs/edge-installation.md`
- Modify: `docs/superpowers/specs/2026-07-31-weather-overview-card-design.md` only if implementation reveals a necessary factual correction

**Interfaces:**
- Consumes: BigDataCloud endpoint and behavior implemented in Task 1.
- Produces: a build whose manifest grants only the required API host and documentation that accurately describes coordinate transmission.

- [ ] **Step 1: Add a failing manifest assertion**

Add to the existing manifest/build validation location, or create `src/newtab/manifest.test.mjs` if none exists:

```js
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('extension weather permissions', () => {
  it('grants only the documented weather and reverse-geocoding hosts', async () => {
    const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'));
    expect(manifest.host_permissions).toEqual([
      'https://geocoding-api.open-meteo.com/*',
      'https://api.open-meteo.com/*',
      'https://api.bigdatacloud.net/*',
    ]);
  });
});
```

- [ ] **Step 2: Run the assertion and verify RED**

Run:

```bash
npm test -- src/newtab/manifest.test.mjs
```

Expected: FAIL because BigDataCloud is not yet in `host_permissions`.

- [ ] **Step 3: Update the manifest and user-facing privacy documentation**

Append exactly:

```json
"https://api.bigdatacloud.net/*"
```

Document all of the following in README and Edge installation instructions:

- Open-Meteo receives a city query for manual search and coordinates for weather.
- BigDataCloud receives current coordinates only after the user clicks “使用当前位置”.
- BigDataCloud states that its free client endpoint observes the requesting IP and current coordinates and uses anonymous aggregated pairings to improve IP geolocation.
- No continuous location, location history, API key, analytics, advertising, or account is used.
- The overview footer identifies the active data sources.
- Reloading the unpacked extension may prompt Edge to acknowledge the new host permission.

- [ ] **Step 4: Run complete automated verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all test files PASS, production build exits 0, and `git diff --check` has no output.

- [ ] **Step 5: Inspect the built extension**

Run:

```bash
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('dist/manifest.json','utf8')); console.log(JSON.stringify({version:m.version,permissions:m.permissions,host_permissions:m.host_permissions},null,2))"
```

Expected: version remains `0.1.0` for this feature branch, permissions remain `storage`, `unlimitedStorage`, and `geolocation`, and host permissions contain only the two Open-Meteo hosts plus `https://api.bigdatacloud.net/*`.

- [ ] **Step 6: Perform Edge rendered acceptance**

Reload `/Users/infinity/Agent/Codex/browser-start/dist` from `edge://extensions/`, then verify:

1. Unconfigured weather shows the setup card below “今日氛围”.
2. A manually selected city shows current conditions, three hours, `天气与地点：Open-Meteo`, and a readable update time.
3. “使用当前位置” asks for browser permission only after click, resolves the city, and changes attribution to `天气：Open-Meteo · 地点：BigDataCloud`.
4. Clicking the card opens the weather drawer; pressing Escape returns focus to the card.
5. Dark, light, desktop, and narrow-window layouts have no overlap, clipping, or horizontal scrolling.
6. Weather/network failure preserves cached content or shows the recoverable empty state.

- [ ] **Step 7: Commit documentation and release baseline**

```bash
git add public/manifest.json README.md docs/edge-installation.md src/newtab/manifest.test.mjs
git commit -m "docs: disclose weather location sources"
```

---

## Plan Self-Review

- Spec coverage: Tasks 1–5 cover the reverse-geocoding boundary, opt-in location flow, all card states, source attribution, responsive/light styling, permissions, privacy copy, automated tests, build, and Edge acceptance.
- Type consistency: `ReverseGeocodeClient.reverse(latitude, longitude, signal?)` is defined once in Task 1 and consumed unchanged in Tasks 2 and 5.
- Persistence compatibility: `WeatherLocation` and schema version remain unchanged; source attribution is inferred from the existing `coords:` ID prefix.
- Network isolation: component and application tests inject clients, so no automated test reaches Open-Meteo or BigDataCloud.
