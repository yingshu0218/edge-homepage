# Edge Start Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a loadable Microsoft Edge Manifest V3 new-tab extension with custom grouped bookmarks, image themes, local-first persistence, Microsoft/Edge profile sync, and JSON backup.

**Architecture:** React renders the new-tab experience while focused domain modules own validation, sorting, and migrations. A repository writes immediately to `chrome.storage.local`, mirrors quota-safe records to `chrome.storage.sync`, and exposes a provider boundary for future backends; IndexedDB stores only custom background blobs.

**Tech Stack:** React 19, TypeScript 5, Vite 7, Vitest, Testing Library, `@dnd-kit`, `idb`, CSS modules, Manifest V3.

## Global Constraints

- The extension must replace the Microsoft Edge new-tab page through Manifest V3.
- Use React, TypeScript, and Vite.
- Use single-level bookmark groups with drag-and-drop ordering; do not read Edge Favorites.
- Bundle 6–8 WebP or AVIF themes; sync theme IDs and settings, never image bytes.
- Save custom backgrounds only in local IndexedDB and fall back safely when absent.
- Keep every `chrome.storage.sync` item below 8 KB and total synchronized data below 100 KB.
- Persist locally before attempting synchronization; synchronization failure must never discard local edits.
- Provide JSON import/export and reserve a `SyncProvider` interface for future VPS/Git providers.
- Respect keyboard navigation, visible focus, reduced motion, and readable contrast.

---

### Task 1: Extension scaffold and domain model

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.setup.ts`, `index.html`
- Create: `src/domain/models.ts`, `src/domain/defaults.ts`, `src/domain/url.ts`, `src/domain/url.test.ts`
- Create: `src/newtab/main.tsx`, `src/newtab/App.tsx`

**Interfaces:**
- Produces: `Bookmark`, `BookmarkGroup`, `AppSettings`, `AppSnapshot`, `normalizeDestination(input: string, searchTemplate: string): string`, and `createDefaultSnapshot(): AppSnapshot`.

- [ ] **Step 1: Add the test/build scaffold and failing URL tests**

```json
{
  "name": "day-start",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "tsc -b && vite build", "test": "vitest run", "test:watch": "vitest" },
  "dependencies": { "@dnd-kit/core": "^6.3.1", "@dnd-kit/sortable": "^10.0.0", "idb": "^8.0.3", "react": "^19.1.0", "react-dom": "^19.1.0" },
  "devDependencies": { "@testing-library/jest-dom": "^6.6.3", "@testing-library/react": "^16.3.0", "@types/chrome": "^0.1.0", "@types/react": "^19.1.0", "@types/react-dom": "^19.1.0", "@vitejs/plugin-react": "^4.6.0", "jsdom": "^26.1.0", "typescript": "^5.8.3", "vite": "^7.0.0", "vitest": "^3.2.4" }
}
```

```ts
// src/domain/url.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeDestination } from './url';

describe('normalizeDestination', () => {
  it('keeps explicit https URLs', () => expect(normalizeDestination('https://example.com', 'https://www.google.com/search?q=%s')).toBe('https://example.com/'));
  it('adds https to hostnames', () => expect(normalizeDestination('example.com/docs', 'https://www.google.com/search?q=%s')).toBe('https://example.com/docs'));
  it('turns other text into a search', () => expect(normalizeDestination('edge start page', 'https://www.google.com/search?q=%s')).toBe('https://www.google.com/search?q=edge%20start%20page'));
});
```

- [ ] **Step 2: Install dependencies and prove the test fails**

Run: `npm install && npm test -- src/domain/url.test.ts`

Expected: FAIL because `src/domain/url.ts` does not exist.

- [ ] **Step 3: Define domain types, defaults, and URL normalization**

```ts
// src/domain/models.ts
export type Bookmark = { id: string; title: string; url: string; groupId: string; order: number; createdAt: number; updatedAt: number; deletedAt?: number };
export type BookmarkGroup = { id: string; name: string; order: number; updatedAt: number; deletedAt?: number };
export type AppSettings = { searchTemplate: string; themeId: string; appearance: 'light' | 'dark'; overlay: number; blur: number; useCustomBackground: boolean; updatedAt: number };
export type AppSnapshot = { schemaVersion: 1; bookmarks: Bookmark[]; groups: BookmarkGroup[]; settings: AppSettings };
```

```ts
// src/domain/url.ts
export function normalizeDestination(input: string, searchTemplate: string): string {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return new URL(value).toString();
  if (/^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(value)) return new URL(`https://${value}`).toString();
  return searchTemplate.replace('%s', encodeURIComponent(value));
}
```

Create `createDefaultSnapshot()` with one “开发” group, four useful sample bookmarks, Google search, `aurora` theme, dark appearance, overlay `0.38`, blur `0`, and `useCustomBackground: false`.

- [ ] **Step 4: Run the focused and full test suites**

Run: `npm test -- src/domain/url.test.ts && npm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.setup.ts index.html src
git commit -m "chore: scaffold Edge new tab extension"
```

### Task 2: Local repository, migrations, and custom background storage

**Files:**
- Create: `src/storage/types.ts`, `src/storage/chromeApi.ts`, `src/storage/snapshotRepository.ts`, `src/storage/snapshotRepository.test.ts`
- Create: `src/storage/backgroundStore.ts`, `src/storage/backgroundStore.test.ts`

**Interfaces:**
- Consumes: `AppSnapshot`, `createDefaultSnapshot()`.
- Produces: `SnapshotRepository.load(): Promise<AppSnapshot>`, `SnapshotRepository.save(snapshot): Promise<void>`, `BackgroundStore.put(blob): Promise<void>`, `get(): Promise<Blob | undefined>`, and `clear(): Promise<void>`.

- [ ] **Step 1: Write failing repository tests**

```ts
it('returns defaults when local storage is empty', async () => {
  const repository = new SnapshotRepository(fakeChromeStorage());
  expect(await repository.load()).toEqual(createDefaultSnapshot());
});

it('round-trips a snapshot through local storage', async () => {
  const storage = fakeChromeStorage();
  const repository = new SnapshotRepository(storage);
  const snapshot = createDefaultSnapshot();
  snapshot.groups[0].name = '工作';
  await repository.save(snapshot);
  expect((await repository.load()).groups[0].name).toBe('工作');
});
```

- [ ] **Step 2: Run the tests and verify missing implementations**

Run: `npm test -- src/storage/snapshotRepository.test.ts src/storage/backgroundStore.test.ts`

Expected: FAIL because the repository and background store are missing.

- [ ] **Step 3: Implement local-first storage**

Implement `ChromeStorageArea` as `{ get(keys?: string | string[]): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> }`. Save the snapshot under `app:snapshot`, validate `schemaVersion === 1` on load, and return defaults for absent data. Use `idb.openDB('day-start-assets', 1)` with an `assets` store and key `custom-background` for blobs.

- [ ] **Step 4: Run storage tests**

Run: `npm test -- src/storage`

Expected: all storage tests PASS, including a rejected unsupported schema and Blob round trip.

- [ ] **Step 5: Commit**

```bash
git add src/storage
git commit -m "feat: add local snapshot and background storage"
```

### Task 3: Microsoft/Edge synchronization provider

**Files:**
- Create: `src/sync/types.ts`, `src/sync/edgeSyncProvider.ts`, `src/sync/edgeSyncProvider.test.ts`, `src/sync/syncCoordinator.ts`, `src/sync/syncCoordinator.test.ts`

**Interfaces:**
- Produces: `SyncProvider.push(snapshot): Promise<SyncResult>`, `pull(): Promise<AppSnapshot | null>`, `subscribe(listener): () => void`; `SyncCoordinator.saveAndSync(snapshot): Promise<SyncState>`.

- [ ] **Step 1: Write failing sync tests**

```ts
it('writes locally before pushing remotely', async () => {
  const calls: string[] = [];
  const coordinator = makeCoordinator(calls);
  await coordinator.saveAndSync(createDefaultSnapshot());
  expect(calls.slice(0, 2)).toEqual(['local.save', 'sync.push']);
});

it('keeps local success when sync quota fails', async () => {
  const coordinator = makeCoordinator([], { pushError: new Error('QUOTA_BYTES') });
  expect(await coordinator.saveAndSync(createDefaultSnapshot())).toMatchObject({ kind: 'error', localSaved: true });
});
```

- [ ] **Step 2: Run sync tests and verify failure**

Run: `npm test -- src/sync`

Expected: FAIL because the synchronization interfaces are missing.

- [ ] **Step 3: Implement chunked Edge sync**

Use keys `meta`, `settings`, `group:<id>`, and `bookmark:<id>`. Reject any serialized key/value pair above `8192` bytes and warn above `90 * 1024` total bytes using `chrome.storage.sync.getBytesInUse(null)`. Debounce pushes by 750 ms, subscribe through `chrome.storage.onChanged`, merge records by `updatedAt`, and retain deletion markers for 30 days.

```ts
export type SyncState =
  | { kind: 'local' }
  | { kind: 'pending' }
  | { kind: 'synced'; at: number }
  | { kind: 'warning'; bytes: number }
  | { kind: 'error'; message: string; localSaved: true };
```

- [ ] **Step 4: Run tests for chunking, quota, merge, and local-first order**

Run: `npm test -- src/sync`

Expected: all sync tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sync
git commit -m "feat: sync lightweight data through Edge profile"
```

### Task 4: Search, bookmark groups, and drag ordering UI

**Files:**
- Create: `src/features/search/SearchBox.tsx`, `src/features/search/SearchBox.test.tsx`
- Create: `src/features/bookmarks/BookmarkGrid.tsx`, `BookmarkCard.tsx`, `BookmarkDialog.tsx`, `GroupTabs.tsx`, `bookmarkActions.ts`, `bookmarkActions.test.ts`

**Interfaces:**
- Consumes: domain models and `normalizeDestination`.
- Produces: `reorderBookmarks(snapshot, activeId, overId): AppSnapshot` and controlled UI callbacks `onChange(nextSnapshot)`.

- [ ] **Step 1: Write failing behavior tests**

```tsx
it('submits search text to the normalized destination', async () => {
  const navigate = vi.fn();
  render(<SearchBox searchTemplate="https://www.google.com/search?q=%s" navigate={navigate} />);
  await userEvent.type(screen.getByRole('searchbox'), 'edge themes{Enter}');
  expect(navigate).toHaveBeenCalledWith('https://www.google.com/search?q=edge%20themes');
});
```

Add pure-action tests asserting add/edit/delete, group filtering, stable reorder values, and moving bookmarks before group deletion.

- [ ] **Step 2: Run focused UI tests**

Run: `npm test -- src/features/search src/features/bookmarks`

Expected: FAIL because components and actions are missing.

- [ ] **Step 3: Implement accessible controlled components**

Build a search form with `role="searchbox"`, bookmark cards with visible focus, a dialog with labeled title/URL/group fields, and group tabs using buttons. Use `@dnd-kit/core` plus `@dnd-kit/sortable`; update ordering only in `onDragEnd`. Validate URLs through `normalizeDestination` before save.

- [ ] **Step 4: Run interaction tests**

Run: `npm test -- src/features/search src/features/bookmarks`

Expected: all tests PASS for keyboard submission, CRUD, filtering, validation, and reorder actions.

- [ ] **Step 5: Commit**

```bash
git add src/features/search src/features/bookmarks
git commit -m "feat: add search and grouped bookmark management"
```

### Task 5: Built-in and custom themes

**Files:**
- Create: `src/features/themes/themes.ts`, `ThemePicker.tsx`, `themeResolver.ts`, `themeResolver.test.ts`
- Create: `src/assets/themes/aurora.webp`, `dusk.webp`, `forest.webp`, `ocean.webp`, `ember.webp`, `violet.webp`

**Interfaces:**
- Produces: `ThemeDefinition`, `BUILT_IN_THEMES`, and `resolveTheme(settings, customBackground): ResolvedTheme`.

- [ ] **Step 1: Write failing fallback tests**

```ts
it('falls back to aurora when a custom background is absent', () => {
  const settings = { ...createDefaultSnapshot().settings, useCustomBackground: true };
  expect(resolveTheme(settings, undefined).id).toBe('aurora');
});
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/features/themes/themeResolver.test.ts`

Expected: FAIL because `resolveTheme` is missing.

- [ ] **Step 3: Implement theme manifest and picker**

Each definition contains `id`, `name`, `imageUrl`, `textColor`, `accentColor`, `overlay`, and `defaultAppearance`. Apply CSS custom properties at the page root. Validate uploads as JPEG/PNG/WebP/AVIF, reject files above 12 MB, render to a maximum 2560-pixel edge in canvas, encode to WebP, and save through `BackgroundStore`.

- [ ] **Step 4: Verify theme behavior and asset sizes**

Run: `npm test -- src/features/themes && find src/assets/themes -type f -size +900k -print`

Expected: tests PASS and the `find` command prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/features/themes src/assets/themes
git commit -m "feat: add atmospheric built-in and local themes"
```

### Task 6: Settings, JSON import/export, and diagnostics

**Files:**
- Create: `src/features/settings/SettingsPanel.tsx`, `SettingsPanel.test.tsx`
- Create: `src/storage/transfer.ts`, `src/storage/transfer.test.ts`
- Create: `src/sync/SyncStatus.tsx`

**Interfaces:**
- Produces: `exportSnapshot(snapshot): Blob`, `parseSnapshot(text): AppSnapshot`, and settings callbacks for search engine, theme parameters, import mode, export, and reset.

- [ ] **Step 1: Write failing transfer tests**

```ts
it('round-trips a versioned snapshot', async () => {
  const snapshot = createDefaultSnapshot();
  const text = await exportSnapshot(snapshot).text();
  expect(parseSnapshot(text)).toEqual(snapshot);
});

it('rejects unknown schemas before writing', () => {
  expect(() => parseSnapshot('{"schemaVersion":99}')).toThrow('Unsupported backup schema');
});
```

- [ ] **Step 2: Run transfer and settings tests**

Run: `npm test -- src/storage/transfer.test.ts src/features/settings`

Expected: FAIL because transfer and settings modules are missing.

- [ ] **Step 3: Implement validated import/export and settings UI**

Export `{ exportedAt, app: 'day-start', snapshot }` as formatted UTF-8 JSON. Parse into unknown data, validate all required arrays, IDs, URLs, and `schemaVersion`, and return data only after full validation. The settings panel must offer “replace” and “merge” import modes, require confirmation for reset, and show `SyncState` without claiming Microsoft account status that the API cannot prove.

- [ ] **Step 4: Run settings tests**

Run: `npm test -- src/storage/transfer.test.ts src/features/settings`

Expected: all tests PASS, including malformed JSON, unsupported schema, and reset confirmation.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings src/storage/transfer.ts src/storage/transfer.test.ts src/sync/SyncStatus.tsx
git commit -m "feat: add settings and JSON data transfer"
```

### Task 7: Compose the new-tab application and Manifest V3 package

**Files:**
- Modify: `src/newtab/App.tsx`, `src/newtab/main.tsx`, `vite.config.ts`, `index.html`
- Create: `src/newtab/App.test.tsx`, `src/newtab/app.css`
- Create: `public/manifest.json`, `public/icons/icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`

**Interfaces:**
- Consumes: repository, coordinator, search, bookmark, theme, and settings modules.
- Produces: loadable `dist/` Edge extension with `chrome_url_overrides.newtab = "index.html"`.

- [ ] **Step 1: Write failing application integration test**

```tsx
it('loads the snapshot and persists an added bookmark', async () => {
  const services = fakeServices(createDefaultSnapshot());
  render(<App services={services} />);
  await screen.findByText('GitHub');
  await userEvent.click(screen.getByRole('button', { name: '添加书签' }));
  await fillBookmarkDialog({ title: 'Docs', url: 'https://example.com/docs' });
  expect(services.coordinator.saveAndSync).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm test -- src/newtab/App.test.tsx`

Expected: FAIL because `App` is not composed with services.

- [ ] **Step 3: Compose the app and extension manifest**

Use a loading shell until `repository.load()` resolves, render recoverable errors, and inject real services in `main.tsx`. Add manifest permissions `storage` and `unlimitedStorage`; set `chrome_url_overrides.newtab` to `index.html`. Do not request `bookmarks`, `tabs`, or broad host permissions.

- [ ] **Step 4: Run tests and build the unpacked extension**

Run: `npm test && npm run build`

Expected: all tests PASS; `dist/manifest.json`, `dist/index.html`, theme assets, and icons exist.

- [ ] **Step 5: Validate manifest fields**

Run: `node -e "const m=require('./dist/manifest.json'); if(m.manifest_version!==3||m.chrome_url_overrides?.newtab!=='index.html') process.exit(1)"`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/newtab public index.html vite.config.ts
git commit -m "feat: package the Edge new tab experience"
```

### Task 8: Browser QA, accessibility, and installation guide

**Files:**
- Modify: `src/newtab/app.css`
- Create: `README.md`, `docs/edge-installation.md`

**Interfaces:**
- Consumes: built `dist/` extension.
- Produces: verified desktop layouts and exact Edge developer-mode installation instructions.

- [ ] **Step 1: Start the production preview and inspect at target sizes**

Run: `npm run build && npm exec vite preview -- --host 127.0.0.1`

Expected: preview starts without console errors. Inspect at 1440×900, 1280×720, and 900×700; verify no horizontal overflow and that the atmosphere panel moves below the main content at narrow width.

- [ ] **Step 2: Verify interactions and accessibility**

Using the browser, add/edit/delete a bookmark, reorder cards, switch groups, select every built-in theme, upload and remove a local background, export/import JSON, press Escape in each dialog, tab through all controls, and emulate `prefers-reduced-motion: reduce`.

Expected: actions persist after reload, focus never disappears, dialogs return focus to their trigger, custom-image failure falls back to `aurora`, and reduced-motion disables nonessential transitions.

- [ ] **Step 3: Document Edge installation and sync verification**

Write exact instructions: open `edge://extensions`, enable Developer mode, choose “Load unpacked”, select `dist/`, open a new tab, then verify Edge profile sync is enabled on both devices. Document that built-in theme selections sync but custom image bytes do not.

- [ ] **Step 4: Run final verification**

Run: `npm test && npm run build && git status --short`

Expected: tests and build PASS; status lists only the intended README/CSS/documentation changes.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/edge-installation.md src/newtab/app.css
git commit -m "docs: add Edge installation and QA guidance"
```
