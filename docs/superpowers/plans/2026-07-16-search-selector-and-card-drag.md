# Search Selector and Card Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form search settings with preset selection plus custom fallback, and make the full bookmark card reliably draggable without breaking clicks.

**Architecture:** Keep `searchTemplate` as the persisted schema field and isolate preset mapping in a pure domain module. Move the sortable activator to the bookmark article, use a pointer distance constraint, and keep reorder data flow unchanged.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, `@dnd-kit`.

## Global Constraints

- Google is the default search engine.
- Presets: Google, Bing, 百度, DuckDuckGo, Brave, 搜狗, 360 搜索, and 自定义.
- Existing `searchTemplate` data and schema version remain compatible.
- Custom templates require HTTP(S) and a `%s` placeholder before persistence.
- The whole bookmark card is draggable after 6px movement; ordinary link and action clicks remain functional.
- Mouse, trackpad/pointer, and keyboard dragging remain accessible.

---

### Task 1: Search engine presets and selector

**Files:**
- Create: `src/features/search/searchEngines.ts`, `src/features/search/searchEngines.test.ts`
- Modify: `src/features/settings/SettingsPanel.tsx`, `src/features/settings/SettingsPanel.test.tsx`

**Interfaces:**
- Produces: `SEARCH_ENGINES`, `findSearchEngine(template): SearchEngine | undefined`, and `SearchEngineId`.
- Preserves: `onSearchTemplateChange(searchTemplate: string): void`.

- [ ] **Step 1: Write failing preset and SettingsPanel tests**

```ts
expect(findSearchEngine('https://www.google.com/search?q=%s')?.id).toBe('google');
expect(findSearchEngine('https://private.example/?q=%s')).toBeUndefined();
```

```tsx
expect(screen.getByRole('combobox', { name: '搜索引擎' })).toHaveValue('google');
await user.selectOptions(screen.getByRole('combobox', { name: '搜索引擎' }), 'bing');
expect(onSearchTemplateChange).toHaveBeenCalledWith('https://www.bing.com/search?q=%s');
```

Add tests asserting all eight choices, unknown templates select `custom`, the custom input is conditional, and invalid custom input never calls the callback.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/features/search/searchEngines.test.ts src/features/settings/SettingsPanel.test.tsx`

Expected: FAIL because the preset module and combobox do not exist.

- [ ] **Step 3: Implement preset mapping and selector**

```ts
export const SEARCH_ENGINES = [
  { id: 'google', name: 'Google', template: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', template: 'https://www.bing.com/search?q=%s' },
  { id: 'baidu', name: '百度', template: 'https://www.baidu.com/s?wd=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
  { id: 'brave', name: 'Brave', template: 'https://search.brave.com/search?q=%s' },
  { id: 'sogou', name: '搜狗', template: 'https://www.sogou.com/web?query=%s' },
  { id: 'so360', name: '360 搜索', template: 'https://www.so.com/s?q=%s' }
] as const;
```

Render a labeled `<select>`. Persist preset templates immediately. For unknown templates choose `custom`, render the validated draft field, and preserve the current template until a valid custom commit.

- [ ] **Step 4: Run focused and full tests**

Run: `npm test -- src/features/search/searchEngines.test.ts src/features/settings/SettingsPanel.test.tsx && npm test`

Expected: preset/settings tests and the full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/search/searchEngines.ts src/features/search/searchEngines.test.ts src/features/settings/SettingsPanel.tsx src/features/settings/SettingsPanel.test.tsx
git commit -m "feat: add search engine selector"
```

### Task 2: Full-card bookmark dragging

**Files:**
- Modify: `src/features/bookmarks/BookmarkGrid.tsx`, `src/features/bookmarks/BookmarkCard.tsx`, `src/features/bookmarks/BookmarkGrid.test.tsx`, `src/newtab/app.css`

**Interfaces:**
- `BookmarkCard` continues to consume `Bookmark`, `onEdit`, and `onDelete`.
- `BookmarkGrid` continues to emit `onChange(nextSnapshot)` after valid reorder.

- [ ] **Step 1: Add failing interaction tests**

```tsx
expect(screen.getByRole('article', { name: 'GitHub' })).toHaveAttribute('aria-roledescription', 'sortable');
```

Add a sensor configuration test asserting `PointerSensor` receives `{ activationConstraint: { distance: 6 } }`; verify the old dedicated `Drag GitHub` button is absent, link/edit/delete clicks do not call `onChange`, and keyboard sortable attributes remain on the article.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- src/features/bookmarks/BookmarkGrid.test.tsx`

Expected: FAIL because listeners remain on the small Drag button and the pointer constraint is absent.

- [ ] **Step 3: Move the sortable activator to the article**

Configure `useSensor(PointerSensor, { activationConstraint: { distance: 6 } })`. Apply `attributes` and `listeners` to the `<article>` with an accessible label, `aria-roledescription="sortable"`, and a draggable class. Remove the focusable Drag button. Keep anchor/edit/delete handlers intact and add cursor, dragging elevation, and `touch-action` styles.

- [ ] **Step 4: Verify drag behavior and build**

Run: `npm test -- src/features/bookmarks/BookmarkGrid.test.tsx && npm test && npm run build`

Expected: all tests and build PASS.

- [ ] **Step 5: Verify in Edge**

Reload Day Start from `edge://extensions`, drag a card body more than 6px, confirm order changes, refresh, and confirm persistence. Select every search preset and confirm the search destination template changes without console errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/bookmarks/BookmarkGrid.tsx src/features/bookmarks/BookmarkCard.tsx src/features/bookmarks/BookmarkGrid.test.tsx src/newtab/app.css
git commit -m "fix: make bookmark cards draggable"
```
