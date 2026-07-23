# Task 8 Report — Local-Only App Integration

## Delivered

- Replaced the new-tab runtime sync composition with optimistic local snapshot persistence.
- Kept the isolated sync provider/coordinator sources and their tests intact, but removed all runtime calls and UI references.
- Integrated bookmark display limits, the view-all manager, batch move/delete, and edit handoff.
- Added local clock and weather summaries with mutually exclusive, keyboard-accessible drawers.
- Wired time preferences, weather location/unit/refresh, and explicit geolocation access through the weather drawer.
- Updated settings with the 8/12/16 bookmark display selector, local-only status, manifest permissions, and summary styling.
- Retained import/export/reset and schema-1 backup migration behavior.

## Verification

- `npm test -- src/newtab/App.test.tsx src/features/settings/SettingsPanel.test.tsx` — 14 passing.
- `npm test` — 29 files, 189 tests passing.
- `npm run build` — passing.
- Runtime sync scan of `src/newtab`, `src/features/settings`, and `public/manifest.json` — no sync provider/coordinator/status calls or Microsoft UI remain; the only Microsoft string is an absence assertion in the app test.
- `git diff --check` — clean.

## Second review follow-up

- `main.tsx` now reuses `chromeLocalStorage`, whose adapter exposes `remove`; `ChromeWeatherCache.clear()` therefore deletes the weather key in production instead of writing `undefined`.
- The reset integration test uses a real `ChromeWeatherCache` backed by a `remove` spy, and the cache unit test asserts the remove path without a fallback `set` call.
- The weather drawer test lets initial cached hydration settle, advances the freshness clock, then proves opening the drawer starts a second normal refresh. Removing `weather.refresh()` from the drawer-open path makes that test fail.
- Topbar CSS now has explicit shrinking/min-width rules, compact gaps, seconds/city hiding at 760px, and additional 430px padding and brand/action compaction. A standalone CSS structural test verifies these breakpoints while the App test verifies the retained control markup.
- Background read failures use custom-background fallback wording only when a custom background is selected; ordinary failures are a nonfatal local-background warning.

### Second follow-up verification

- Focused: `npm test -- src/newtab/App.test.tsx src/newtab/app.css.test.mjs src/features/weather/weatherCache.test.ts` — 31 passing.
- Full: `npm test` — 30 files, 200 tests passing.
- Build: `npm run build` — passing.
- Sync and unused-prop scans remain clean; only the intentional Microsoft absence assertion remains in tests.

## Review notes

- The weather client is intentionally still network-backed only after a user selects a city or clicks the explicit current-location action. The manifest includes only the two Open-Meteo hosts and the required `geolocation` permission.
- The pre-existing `.superpowers/sdd/task-7-report.md` modification was not included in this task's commit.

## Review follow-up

- Reset now clears both the background store and weather cache before saving the default snapshot.
- Opening the weather drawer calls the normal `refresh()` path, retaining cache freshness behavior; manual refresh remains forceful.
- The top weather summary uses the WMO description helper, selected unit conversion, icon and temperature-first markup, with the city hidden below 760px. The clock summary now includes seconds whenever enabled.
- The view-all callback receives its actual button trigger, so drawer close restores focus to that button.
- Local saves are queued and versioned: the UI remains optimistic, writes are serialized, and only the latest write may change the error banner.
- Repository loading and background loading are independent. A background read failure now leaves the core page available with a local fallback warning.
- Removed the unused SettingsPanel `onThemeParametersChange` prop and its obsolete test usage.

### Follow-up verification

- Focused: `npm test -- src/newtab/App.test.tsx src/features/settings/SettingsPanel.test.tsx src/features/bookmarks/BookmarkGrid.test.tsx` — 25 passing.
- Full: `npm test` — 29 files, 196 tests passing.
- Build: `npm run build` — passing.
- Runtime sync scan and `onThemeParametersChange` scan — no runtime sync references or unused settings prop; the sole Microsoft occurrence is an intentional absence assertion in `App.test.tsx`.
- `git diff --check` — clean.
