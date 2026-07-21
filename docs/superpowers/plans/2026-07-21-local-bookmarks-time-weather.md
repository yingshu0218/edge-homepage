# Local Bookmarks, Time, and Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Day Start to a local-only extension with capped bookmark presentation, a full bookmark manager, device-local clock controls, and cached Open-Meteo weather.

**Architecture:** Upgrade the snapshot to schema 2 and migrate schema 1 data locally, while keeping transient weather responses in a separate local cache. Pure domain functions own bookmark mutations, time formatting, weather response conversion, and cache decisions; focused React components render drawers and the top-bar summaries. `App` composes those modules and persists only through `SnapshotStorage`, without constructing or calling an Edge sync provider.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Vitest 3, Testing Library, Manifest V3, `chrome.storage.local`, Open-Meteo Geocoding and Forecast APIs.

## Global Constraints

- Do not read or write `chrome.storage.sync` at runtime.
- Do not add Microsoft, VPS, GitHub, Gitea, tasks, calendar, multi-time-zone, or HTML bookmark import features.
- The home page shows only the first `8`, `12`, or `16` bookmarks in the active group; default is `8`.
- Use the device time zone only; default to 24-hour time without seconds.
- Use Open-Meteo without an API key and refresh cached weather no more than once per 30 minutes per location.
- Declare Chromium's required `geolocation` permission, but call `navigator.geolocation` only after the user presses “使用当前位置”.
- Keep JSON import/export compatible with existing schema 1 backups; never export weather response cache or custom background bytes.
- Preserve the existing drawer focus trap, Escape behavior, reduced-motion behavior, and responsive layout.
- Add no production dependency unless an existing platform API cannot satisfy the requirement.

---

### Task 1: Schema 2 Settings and Backward-Compatible Local Migration

**Files:**
- Modify: `src/domain/models.ts`
- Modify: `src/domain/defaults.ts`
- Modify: `src/domain/snapshotValidator.ts`
- Modify: `src/storage/snapshotRepository.ts`
- Modify: `src/storage/transfer.ts`
- Test: `src/domain/snapshotValidator.test.ts`
- Test: `src/storage/snapshotRepository.test.ts`
- Test: `src/storage/transfer.test.ts`

**Interfaces:**
- Produces: `BookmarkDisplayLimit`, `TemperatureUnit`, `WeatherLocation`, schema-2 `AppSettings`, and `migrateSnapshot(value, source): AppSnapshot`.
- Consumes: existing schema-1 records and backup envelopes.

- [ ] **Step 1: Write failing migration and validation tests**

Add tests that assert an existing schema-1 snapshot becomes schema 2 with these defaults, while explicit schema-2 values round-trip:

```ts
expect(migrateSnapshot(v1, 'local snapshot').settings).toMatchObject({
  bookmarkDisplayLimit: 8,
  clockHour12: false,
  clockShowSeconds: false,
  clockShowFullDate: true,
  temperatureUnit: 'celsius',
});
expect(migrateSnapshot(v1, 'local snapshot').schemaVersion).toBe(2);
expect(parseSnapshot(JSON.stringify(v1)).schemaVersion).toBe(2);
```

Also assert invalid display limits, malformed coordinates, unknown units, and unknown schema versions fail closed.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- src/domain/snapshotValidator.test.ts src/storage/snapshotRepository.test.ts src/storage/transfer.test.ts`

Expected: FAIL because schema 2 types and `migrateSnapshot` do not exist.

- [ ] **Step 3: Define schema-2 types and defaults**

Use these exact public types in `src/domain/models.ts`:

```ts
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
```

Set the exact defaults described in the first test.

- [ ] **Step 4: Implement strict schema validation and migration**

Export `migrateSnapshot(value: unknown, source: string): AppSnapshot`. For schema 1, validate the old exact shape first and append new defaults; for schema 2, validate all required fields plus optional `weatherLocation`. Require latitude `[-90, 90]`, longitude `[-180, 180]`, non-empty location identity strings, finite timestamps, and exact allowed keys.

Update `SnapshotRepository.load()` and `parseSnapshot()` to call `migrateSnapshot`. Save and export only validated schema 2. Do not loosen URL, duplicate-ID, deleted-group, or order validation.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- src/domain/snapshotValidator.test.ts src/storage/snapshotRepository.test.ts src/storage/transfer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the schema migration**

```bash
git add src/domain src/storage
git commit -m "feat: add local settings schema migration"
```

---

### Task 2: Bookmark Limit and Batch Domain Operations

**Files:**
- Modify: `src/features/bookmarks/bookmarkActions.ts`
- Modify: `src/features/bookmarks/BookmarkGrid.tsx`
- Test: `src/features/bookmarks/bookmarkActions.test.ts`
- Test: `src/features/bookmarks/BookmarkGrid.test.tsx`

**Interfaces:**
- Consumes: schema-2 `AppSnapshot` and `BookmarkDisplayLimit`.
- Produces: `searchBookmarks`, `moveBookmarks`, `deleteBookmarks`, and `BookmarkGrid` props `limit?: number` and `onViewAll?: () => void`.

- [ ] **Step 1: Write failing pure-function tests**

Cover case-insensitive title/URL matching, stable multi-move order, source order normalization, duplicate IDs, invalid destination rejection, and batch soft deletion:

```ts
expect(searchBookmarks(snapshot, 'GITHUB').map(({ id }) => id)).toEqual(['github']);
const moved = moveBookmarks(snapshot, ['mdn', 'github'], 'personal', 100);
expect(filterBookmarksByGroup(moved, 'personal').slice(-2).map(({ id }) => id))
  .toEqual(['github', 'mdn']);
expect(deleteBookmarks(snapshot, ['github', 'mdn'], 100).bookmarks
  .filter(({ id }) => ['github', 'mdn'].includes(id))
  .every(({ deletedAt }) => deletedAt === 100)).toBe(true);
```

The moved IDs must follow their source display order, not checkbox click order.

- [ ] **Step 2: Write failing grid truncation tests**

Render 10 bookmarks with `limit={8}` and assert only 8 cards plus `查看全部（共 10 个）`; render 8 and assert no view-all button.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- src/features/bookmarks/bookmarkActions.test.ts src/features/bookmarks/BookmarkGrid.test.tsx`

Expected: FAIL because the new functions and props are absent.

- [ ] **Step 4: Implement pure operations and capped rendering**

Use the active, ordered records from `filterBookmarksByGroup`. `searchBookmarks(snapshot, groupId, query)` trims the query and matches `title` or `url` with `toLocaleLowerCase()`. `moveBookmarks` validates an active target, deduplicates selected IDs, appends selected active bookmarks to the target, and normalizes every affected group. `deleteBookmarks` soft-deletes selected active records and normalizes affected source groups.

`BookmarkGrid` slices only when `limit` is defined and renders this exact accessible action after the grid:

```tsx
{bookmarks.length > visible.length && (
  <button type="button" className="view-all-bookmarks" onClick={onViewAll}>
    查看全部（共 {bookmarks.length} 个）
  </button>
)}
```

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/features/bookmarks/bookmarkActions.test.ts src/features/bookmarks/BookmarkGrid.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit bookmark domain support**

```bash
git add src/features/bookmarks
git commit -m "feat: add capped and batch bookmark operations"
```

---

### Task 3: Full Bookmark Manager Drawer

**Files:**
- Create: `src/features/bookmarks/BookmarkManagerDrawer.tsx`
- Create: `src/features/bookmarks/BookmarkManagerDrawer.test.tsx`
- Modify: `src/newtab/app.css`

**Interfaces:**
- Consumes: `snapshot`, `groupId`, and callbacks `onEdit(bookmark)`, `onDelete(ids)`, `onMove(ids, destinationGroupId)`, `onOpenSort()`.
- Produces: an accessible searchable and selectable bookmark-management surface.

- [ ] **Step 1: Write failing component tests**

Test these user paths with Testing Library:

```ts
await user.type(screen.getByRole('searchbox', { name: '搜索书签' }), 'github');
expect(screen.getByRole('checkbox', { name: /选择 GitHub/ })).toBeVisible();
expect(screen.queryByRole('checkbox', { name: /选择 MDN/ })).not.toBeInTheDocument();

await user.click(screen.getByRole('checkbox', { name: /选择 GitHub/ }));
await user.selectOptions(screen.getByLabelText('移动到分组'), 'personal');
await user.click(screen.getByRole('button', { name: '移动 1 个书签' }));
expect(onMove).toHaveBeenCalledWith(['github'], 'personal');
```

Also cover selection count, select-all-visible behavior, deletion confirmation text `删除选中的 2 个书签？`, empty search state, edit callback, and sort callback.

- [ ] **Step 2: Run the component test and verify failure**

Run: `npm test -- src/features/bookmarks/BookmarkManagerDrawer.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused component**

Keep selection state local as `Set<string>`, clear selections that disappear after mutation or group change, and disable bulk controls when nothing is selected. Render native search input, checkboxes, select, and buttons. Show group name and total count. Use existing `BookmarkIcon` and existing edit affordance patterns; do not embed sorting drag sensors.

- [ ] **Step 4: Add responsive styles**

Add classes for a compact manager toolbar, readable rows, selected state, batch-action bar, and an empty state. At narrow widths, stack the batch select and buttons without horizontal page overflow.

- [ ] **Step 5: Run focused and neighboring bookmark tests**

Run: `npm test -- src/features/bookmarks`

Expected: PASS.

- [ ] **Step 6: Commit the drawer**

```bash
git add src/features/bookmarks src/newtab/app.css
git commit -m "feat: add full bookmark manager drawer"
```

---

### Task 4: Device-Local Clock Module

**Files:**
- Create: `src/features/time/timeFormat.ts`
- Create: `src/features/time/timeFormat.test.ts`
- Create: `src/features/time/useLocalClock.ts`
- Create: `src/features/time/TimeDrawer.tsx`
- Create: `src/features/time/TimeDrawer.test.tsx`

**Interfaces:**
- Consumes: `clockHour12`, `clockShowSeconds`, `clockShowFullDate`, current time, and `onChange(changes)`.
- Produces: `formatClock(date, options)`, `formatLocalDate(date)`, `useLocalClock(showSeconds, now?)`, and `TimeDrawer`.

- [ ] **Step 1: Write failing deterministic format tests**

Construct local `Date` values rather than UTC strings and assert 24-hour, 12-hour, seconds, complete Chinese date, and midnight/noon behavior. Avoid assertions that depend on the CI machine's time zone.

- [ ] **Step 2: Write failing TimeDrawer tests**

Assert that toggling “12 小时制”, “显示秒”, and “显示完整日期与星期” calls `onChange` with exactly one changed key and that the supplied fixed time is rendered.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- src/features/time`

Expected: FAIL because the module does not exist.

- [ ] **Step 4: Implement formatting, aligned ticking, and drawer controls**

`useLocalClock` must schedule the next update at `1000 - now() % 1000` with seconds enabled or `60000 - now() % 60000` otherwise. Listen for `visibilitychange`; clear the timer while hidden and immediately update plus reschedule when visible. Keep the injectable `now` callback stable through a ref so tests can use fake timers.

- [ ] **Step 5: Run time tests**

Run: `npm test -- src/features/time`

Expected: PASS.

- [ ] **Step 6: Commit the clock module**

```bash
git add src/features/time
git commit -m "feat: add local clock controls"
```

---

### Task 5: Open-Meteo Domain Client

**Files:**
- Create: `src/features/weather/types.ts`
- Create: `src/features/weather/weatherCodes.ts`
- Create: `src/features/weather/weatherCodes.test.ts`
- Create: `src/features/weather/openMeteoClient.ts`
- Create: `src/features/weather/openMeteoClient.test.ts`

**Interfaces:**
- Produces: `WeatherSummary`, `WeatherForecast`, `WeatherClient`, `createOpenMeteoClient(fetchFn)`, `describeWeatherCode(code, isDay)`, and `convertTemperature(value, unit)`.
- Consumes: Open-Meteo Geocoding `/v1/search` and Forecast `/v1/forecast` JSON.

- [ ] **Step 1: Write failing WMO mapping and conversion tests**

Cover clear day/night, cloudy, fog, drizzle, rain, snow, thunderstorm, unknown codes, Celsius identity, and Fahrenheit conversion rounded to the nearest integer.

- [ ] **Step 2: Write failing client contract tests with injected fetch**

Assert `searchLocations('厦门')` URL-encodes the query and maps IDs, administrative area, country, coordinates, and timezone. Assert `getForecast(location)` requests `current`, `hourly`, `daily`, `forecast_hours=12`, `forecast_days=5`, and `timezone=auto`, then maps aligned arrays to the internal model. Reject HTTP errors, missing arrays, non-finite temperatures, and mismatched array lengths with a Chinese user-safe error.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- src/features/weather/weatherCodes.test.ts src/features/weather/openMeteoClient.test.ts`

Expected: FAIL because the weather domain does not exist.

- [ ] **Step 4: Implement strict response conversion**

Keep third-party response types private in `openMeteoClient.ts`. Build URLs through `URL` and `URLSearchParams`. The returned internal forecast must contain current values, exactly the available next 12 hourly entries, up to 5 daily entries, and `fetchedAt` supplied by an injectable clock. Do not pass raw Open-Meteo objects into React.

- [ ] **Step 5: Run weather domain tests**

Run: `npm test -- src/features/weather/weatherCodes.test.ts src/features/weather/openMeteoClient.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the client**

```bash
git add src/features/weather
git commit -m "feat: add Open-Meteo weather client"
```

---

### Task 6: Weather Cache and Refresh Controller

**Files:**
- Create: `src/features/weather/weatherCache.ts`
- Create: `src/features/weather/weatherCache.test.ts`
- Create: `src/features/weather/useWeather.ts`
- Create: `src/features/weather/useWeather.test.tsx`
- Modify: `src/storage/types.ts`

**Interfaces:**
- Produces: `WeatherCacheStore`, `ChromeWeatherCache`, `isFreshWeatherCache(entry, location, now)`, and `useWeather({ location, client, cache, now })`.
- Consumes: `ChromeStorageArea`, `WeatherClient`, and selected `WeatherLocation`.

- [ ] **Step 1: Write failing cache tests**

Assert the cache key is separate from `app:snapshot`, fresh only when location IDs match and age is `<= 30 * 60 * 1000`, rejects malformed cache data, and clears independently.

- [ ] **Step 2: Write failing controller tests**

With fake timers and deferred promises, cover: no request without location; immediate fresh-cache display; stale-cache display followed by refresh; concurrent refresh deduplication; successful cache save; failed refresh preserving cached forecast plus error; first-load failure showing retryable error; visibility restoration refreshing only stale data.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -- src/features/weather/weatherCache.test.ts src/features/weather/useWeather.test.tsx`

Expected: FAIL because cache/controller modules do not exist.

- [ ] **Step 4: Implement cache and controller**

Use key `weather:forecast-cache`. Represent hook state as a discriminated union:

```ts
type WeatherState =
  | { kind: 'unconfigured' }
  | { kind: 'loading' }
  | { kind: 'ready'; forecast: WeatherForecast; refreshing: boolean; stale: boolean; error?: string }
  | { kind: 'error'; message: string };
```

Keep an in-flight promise ref per location ID. Only an explicit `refresh({ force: true })` bypasses freshness; visibility and drawer opening use normal freshness checks.

- [ ] **Step 5: Run cache/controller tests**

Run: `npm test -- src/features/weather/weatherCache.test.ts src/features/weather/useWeather.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit cache behavior**

```bash
git add src/features/weather src/storage/types.ts
git commit -m "feat: cache and refresh local weather"
```

---

### Task 7: Weather Drawer and Opt-In Location

**Files:**
- Create: `src/features/weather/WeatherDrawer.tsx`
- Create: `src/features/weather/WeatherDrawer.test.tsx`
- Modify: `src/newtab/app.css`

**Interfaces:**
- Consumes: weather state, `WeatherClient`, `TemperatureUnit`, selected `WeatherLocation`, `onLocationChange`, `onUnitChange`, `onRefresh`, and optional `geolocation` adapter.
- Produces: city search, explicit geolocation request, forecast presentation, cached-error display, and retry actions.

- [ ] **Step 1: Write failing city and location tests**

Cover debounced city search only after a non-empty query, accessible candidate buttons, selecting a candidate, no geolocation call on render, geolocation call only after clicking “使用当前位置”, denial messaging, and conversion of coordinates to a saved location label `当前位置`.

- [ ] **Step 2: Write failing forecast-state tests**

Cover unconfigured, loading, ready, refreshing, stale-with-error, error-with-retry, 12-hour list, 5-day list, ℃/℉ change, updated-at label, and manual refresh.

- [ ] **Step 3: Run the drawer tests and verify failure**

Run: `npm test -- src/features/weather/WeatherDrawer.test.tsx`

Expected: FAIL because the drawer does not exist.

- [ ] **Step 4: Implement the drawer**

Use native controls and locally mapped WMO glyphs/text. Abort superseded city-search requests. Do not request reverse geocoding for GPS in this version; store an ID derived from rounded coordinates and label it `当前位置`. Display request failures next to the action that can recover them without replacing cached forecast content.

- [ ] **Step 5: Add weather styles and run weather tests**

Run: `npm test -- src/features/weather`

Expected: PASS. Check narrow layout does not overflow except the intentional hourly forecast strip.

- [ ] **Step 6: Commit the drawer**

```bash
git add src/features/weather src/newtab/app.css
git commit -m "feat: add weather details and location selection"
```

---

### Task 8: Local-Only App Integration

**Files:**
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/main.tsx`
- Modify: `src/features/settings/SettingsPanel.tsx`
- Modify: `src/features/settings/SettingsPanel.test.tsx`
- Modify: `src/newtab/app.css`
- Modify: `public/manifest.json`

**Interfaces:**
- Consumes: all modules from Tasks 1–7.
- Produces: the complete local-only new-tab page and minimal runtime services.

- [ ] **Step 1: Rewrite App service-contract tests first**

Change the test harness so `AppServices` contains only:

```ts
type AppServices = {
  repository: SnapshotStorage;
  backgrounds: Backgrounds;
  weather: WeatherClient;
  weatherCache: WeatherCacheStore;
  geolocation?: Pick<Geolocation, 'getCurrentPosition'>;
  navigate(destination: string): void;
  download(blob: Blob, filename: string): void;
  now?: () => number;
  createId?: () => string;
};
```

Add assertions for local load/save, absence of Microsoft/sync copy, `数据保存在本机`, bookmark display limit, view-all drawer opening, batch callbacks, time drawer, weather drawer, drawer mutual exclusion, and old backup migration. Delete tests whose only contract is remote pull, subscription, merge, quota warning, or sync reset.

- [ ] **Step 2: Update SettingsPanel tests**

Remove `syncState` expectations. Add a native select labeled `每组显示书签` with options 8/12/16 and assert `onSettingsChange({ bookmarkDisplayLimit: 12 })`. Keep search-engine, import, export, and reset coverage.

- [ ] **Step 3: Run integration tests and verify failure**

Run: `npm test -- src/newtab/App.test.tsx src/features/settings/SettingsPanel.test.tsx`

Expected: FAIL against the old sync-based app contract.

- [ ] **Step 4: Remove sync from the runtime composition**

In `main.tsx`, do not construct `EdgeSyncProvider` or `SyncCoordinator`. Implement `persist` in `App` as optimistic local state plus `await repository.save(next)`, restoring an error banner only when the local save fails. Load `repository`, background, and weather cache without any remote pull or subscription.

Remove `SyncStatus`, `SyncState`, `syncFact`, Microsoft chip, reset-sync action, and the mood-card sync facts. Replace them with a compact local-data label. Keep the sync source files and their isolated tests untouched for future provider reuse.

- [ ] **Step 5: Integrate summaries and drawers**

Extend `Drawer` with `'bookmarks' | 'time' | 'weather'`. Render top-bar buttons from `useLocalClock` and `useWeather`. Connect bookmark batch operations, edit dialog, sort drawer, time settings, selected weather location, temperature unit, refresh, and the existing focus-return mechanism. Pass `snapshot.settings.bookmarkDisplayLimit` into `BookmarkGrid`.

- [ ] **Step 6: Update settings, styles, and manifest**

Change the extension description to `一个专注、可定制并以本地数据为主的新标签页。`. Add host permissions only for:

```json
"host_permissions": [
  "https://geocoding-api.open-meteo.com/*",
  "https://api.open-meteo.com/*"
]
```

Add `geolocation` to `permissions`; Chromium requires it for extension-page access and does not allow it in `optional_permissions`. Keep the actual `navigator.geolocation` call behind the explicit “使用当前位置” button. Style top summaries as short buttons that remain readable over every bundled theme.

- [ ] **Step 7: Run integrated tests**

Run: `npm test -- src/newtab/App.test.tsx src/features/settings/SettingsPanel.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit app integration**

```bash
git add src/newtab src/features/settings public/manifest.json
git commit -m "feat: integrate local bookmarks time and weather"
```

---

### Task 9: Documentation, Full Verification, and Edge Acceptance

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/edge-installation.md`

**Interfaces:**
- Consumes: completed extension behavior.
- Produces: accurate local-only installation, permission, backup, weather, and acceptance documentation.

- [ ] **Step 1: Update documentation**

Remove claims that Microsoft accounts synchronize data. Document local-only storage, JSON migration between devices, 8/12/16 bookmark limits, full bookmark manager, local clock, Open-Meteo requests, optional user-triggered location permission, 30-minute weather cache, and offline fallback.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests PASS with no unhandled rejection or act warning.

- [ ] **Step 3: Run type-check and production build**

Run: `npm run build`

Expected: TypeScript and Vite complete successfully; `dist/manifest.json` contains manifest version 3, local wording, both Open-Meteo host permissions, and only `storage`, `unlimitedStorage`, and `geolocation` permissions.

- [ ] **Step 4: Inspect runtime sync references**

Run: `rg -n "EdgeSyncProvider|SyncCoordinator|chrome\.storage\.sync|Microsoft .*同步|重置同步数据" src/newtab src/features/settings public/manifest.json README.md docs/edge-installation.md`

Expected: no matches in runtime composition or user-facing documentation. References may remain only inside isolated `src/sync` implementation/tests and historical design documents.

- [ ] **Step 5: Reload unpacked extension in Edge and perform acceptance checks**

Load the rebuilt `dist/` folder, then verify: local data survives reload; display limit changes between 8/12/16; view-all search/edit/move/delete works; time matches the device; city search and explicitly requested current location work; weather cache remains visible after going offline; JSON export/import restores settings; no Microsoft sync status appears.

- [ ] **Step 6: Commit documentation and validation baseline**

```bash
git add README.md CHANGELOG.md docs/edge-installation.md
git commit -m "docs: document local weather release"
```
