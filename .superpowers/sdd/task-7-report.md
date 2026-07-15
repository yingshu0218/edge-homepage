# Task 7 Report — New-tab composition and MV3 package

## Result

Implemented the production new-tab composition and packaged it as a loadable Edge Manifest V3 extension. The application now injects real local storage, IndexedDB background storage, Edge `storage.sync`, and coordinator services. Bookmark CRUD, group creation and selection, theme selection/custom background, settings, import/export, reset, and sync status are reachable from the main screen.

Implementation commit: `2d8d745cbbaa199d5d4bed57b44a2e4059cc3a68`

## TDD evidence

### RED 1 — application composition

Command: `npm test -- src/newtab/App.test.tsx`

Observed: 3/3 tests failed because the placeholder `App` exposed neither a loading status nor the snapshot/bookmark/settings UI. This was the expected missing-feature failure.

### GREEN 1

Implemented service-injected composition, loading/recoverable error states, bookmark add/edit/delete flow, theme and settings drawers, data transfer actions, and persistence through `SyncCoordinator`.

Observed: 3/3 integration tests passed.

### RED 2 — initial Edge hydration

Added a fresh-device integration test where `sync.pull()` contains a remote bookmark.

Observed: the remote bookmark was absent because the app only listened for future storage changes.

### GREEN 2

Initial load now reads local snapshot, custom background, and Edge sync concurrently, merges the snapshots, and persists the hydrated local result.

### RED 3 — sync pull recovery

Added an integration test where initial Edge pull rejects.

Observed: the app rendered a fatal loading error instead of the usable local snapshot.

### GREEN 3

Edge pull failures now degrade to local data and an explicit sync-error status.

## Final UI decisions

- Preserved the approved B×C skeleton: compact top chrome, large command/search focus, three-column quick-bookmark rail, group tabs, and one right-side status card.
- Used the generated full-bleed theme image as the atmosphere layer, with a tunable dark overlay and glass surfaces for search, bookmarks, status, dialogs, and drawers.
- Kept `App` as orchestration/composition glue; bookmark, search, theme, settings, storage, and sync behavior remain in their existing modules.
- Theme and settings controls open in a right drawer so the accepted first-viewport hierarchy stays intact.
- Added a dashed “new bookmark” tile to match the accepted mockup and retained the compact header add action.
- Responsive behavior collapses the status card and bookmark grid cleanly below tablet width.
- Formal extension icon uses the same sunrise/atmosphere motif and was generated at 16, 32, 48, and 128 px.

## Manifest/package verification

- Manifest V3
- `chrome_url_overrides.newtab = "index.html"`
- Permissions are exactly `storage` and `unlimitedStorage`
- No `bookmarks`, `tabs`, or host permissions
- `dist/` contains index, manifest, six theme assets, and all four PNG icons

Final commands:

```text
npm test                         14 files, 63 tests passed
npm run build                    passed
node manifest/package validator  passed
git diff --check                 passed
```

## Visual QA and concerns

- Accepted source: `.superpowers/brainstorm/60365-1784125796/content/layout-v2.html`.
- The default `aurora.webp` and final 128 px icon were inspected directly with `view_image`; the theme preserves high-contrast negative space for the left command surface and visual interest on the right.
- The in-app Browser runtime reported that no browser was available after the local Vite server was started. There was no locally installed Playwright/Chromium fallback, so a browser-rendered screenshot and native-size side-by-side `view_image` comparison could not be produced in this environment. Automated DOM workflow tests cover loading, remote hydration, offline recovery, bookmark creation, settings/theme reachability; this limitation should be closed by loading `dist/` as an unpacked extension in Edge for final visual sign-off.
- The visible above-the-fold copy matches the approved structure except the sync provider label is intentionally “Microsoft” instead of the obsolete GitHub label, reflecting the final product decision.
