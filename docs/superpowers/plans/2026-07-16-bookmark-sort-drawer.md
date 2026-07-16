# Bookmark Sort Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dragging from new-tab bookmark cards and provide current-group ordering in a dedicated right-side drawer with handle-only dragging.

**Architecture:** `BookmarkGrid` becomes a presentational grid with no dnd-kit context. A new `BookmarkSortDrawer` owns its own sortable context and renders focused `SortableBookmarkRow` items whose listeners are bound only to a handle. `App` adds a third drawer state and sends reordered snapshots through the existing `persist` pipeline.

**Tech Stack:** React 19, TypeScript, dnd-kit, Vitest, Testing Library, Vite, Manifest V3.

## Global Constraints

- The drawer manages only the currently active bookmark group.
- Only the row handle starts pointer dragging; row content is not draggable.
- Sorting saves immediately through the existing local and Microsoft/Edge synchronization path.
- The drawer does not add bookmark creation, editing, deletion, or cross-group movement.
- Existing drawer Escape, scrim-close, focus trap, and focus restoration behavior must remain intact.

---

### Task 1: Make the start-page bookmark grid non-draggable

**Files:**
- Modify: `src/features/bookmarks/BookmarkGrid.tsx`
- Modify: `src/features/bookmarks/BookmarkCard.tsx`
- Modify: `src/features/bookmarks/BookmarkGrid.test.tsx`
- Modify: `src/newtab/app.css`

**Interfaces:**
- Consumes: `filterBookmarksByGroup(snapshot, groupId): Bookmark[]`.
- Produces: `BookmarkGrid({ snapshot, groupId, onEdit, onDelete })` without an `onChange` or `now` dependency.

- [ ] **Step 1: Write the failing component tests**

Replace the sortable-card expectations with assertions that cards have no `aria-roledescription`, no dnd-kit `tabindex`, and no drag control, while links and action buttons remain usable.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/features/bookmarks/BookmarkGrid.test.tsx`

Expected: FAIL because the card still has sortable attributes and `BookmarkGrid` still initializes sensors.

- [ ] **Step 3: Remove dnd-kit from the grid and card**

Render filtered bookmarks directly in `BookmarkGrid`; render `BookmarkCard` as a plain `<article data-bookmark-id>` without `useSortable`, drag attributes, drag styles, or grab cursors.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/features/bookmarks/BookmarkGrid.test.tsx`

Expected: all grid tests PASS without console warnings.

- [ ] **Step 5: Commit**

```bash
git add src/features/bookmarks/BookmarkGrid.tsx src/features/bookmarks/BookmarkCard.tsx src/features/bookmarks/BookmarkGrid.test.tsx src/newtab/app.css
git commit -m "refactor: remove dragging from bookmark cards"
```

### Task 2: Build the handle-only bookmark sorting drawer content

**Files:**
- Create: `src/features/bookmarks/BookmarkSortDrawer.tsx`
- Create: `src/features/bookmarks/BookmarkSortDrawer.test.tsx`
- Modify: `src/newtab/app.css`

**Interfaces:**
- Consumes: `AppSnapshot`, `groupId`, `filterBookmarksByGroup`, and `reorderBookmarks`.
- Produces: `BookmarkSortDrawer({ snapshot, groupId, onChange, now? })`, where `onChange(next: AppSnapshot): void` fires only after a valid position change.

- [ ] **Step 1: Write failing drawer tests**

Cover the current group name and filtered bookmark rows, empty state, absence of sortable attributes on row content, presence of one accessible `排序 <title>` handle per bookmark, and no `onChange` when active and target IDs match.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/features/bookmarks/BookmarkSortDrawer.test.tsx`

Expected: FAIL because `BookmarkSortDrawer` does not exist.

- [ ] **Step 3: Implement the minimal sortable drawer content**

Use `DndContext`, `PointerSensor` with `{ distance: 6 }`, `KeyboardSensor`, `SortableContext`, and a private `SortableBookmarkRow`. Bind `attributes`, `listeners`, and keyboard focus only to `<button aria-label={\`排序 ${bookmark.title}\`}>⠿</button>`. Render title and `new URL(bookmark.url).hostname` outside the handle.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/features/bookmarks/BookmarkSortDrawer.test.tsx`

Expected: all drawer tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/bookmarks/BookmarkSortDrawer.tsx src/features/bookmarks/BookmarkSortDrawer.test.tsx src/newtab/app.css
git commit -m "feat: add bookmark sorting drawer content"
```

### Task 3: Integrate the sorting drawer into the application shell

**Files:**
- Modify: `src/newtab/App.tsx`
- Modify: `src/newtab/App.test.tsx`
- Modify: `src/newtab/app.css`

**Interfaces:**
- Consumes: `BookmarkSortDrawer`, active group ID, and `persist(next)`.
- Produces: a `sort` drawer state opened by `管理排序`, labelled `书签排序`, and closed through the common drawer lifecycle.

- [ ] **Step 1: Write failing application tests**

Assert that `管理排序` opens dialog `书签排序`, shows the active group and its bookmarks, Escape closes it and restores focus to `管理排序`, and bookmark cards no longer expose sorting semantics.

- [ ] **Step 2: Run the focused application test and verify RED**

Run: `npm test -- src/newtab/App.test.tsx`

Expected: FAIL because the button and sort drawer state do not exist.

- [ ] **Step 3: Wire the new drawer state**

Extend `Drawer` to `'theme' | 'settings' | 'sort' | null`, add a `sortButtonRef`, replace the static “拖拽排序” text with a `管理排序` button, remove obsolete `BookmarkGrid` ordering props, and render `BookmarkSortDrawer` for the `sort` state with `onChange={(next) => void persist(next)}`.

- [ ] **Step 4: Run application and focused component tests**

Run: `npm test -- src/newtab/App.test.tsx src/features/bookmarks/BookmarkGrid.test.tsx src/features/bookmarks/BookmarkSortDrawer.test.tsx`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/newtab/App.tsx src/newtab/App.test.tsx src/newtab/app.css
git commit -m "feat: open bookmark sorting in side drawer"
```

### Task 4: Full verification and extension build

**Files:**
- Verify: `src/**`
- Build output: `dist/**` (generated and ignored)

**Interfaces:**
- Consumes: all completed changes.
- Produces: a tested Manifest V3 build loadable through Edge's extension reload action.

- [ ] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Build the production extension**

Run: `npm run build`

Expected: TypeScript and Vite exit 0 and emit `dist/index.html`, bundled CSS/JS, theme assets, and the extension manifest.

- [ ] **Step 3: Check the patch**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional plan/implementation files appear.

- [ ] **Step 4: Perform rendered QA when a local server is available**

Verify: new tab cards click normally; `管理排序` opens the right drawer; dragging by the handle changes the visible order; clicking row content does not start dragging; Escape returns focus.

- [ ] **Step 5: Record final verification**

Commit any test-only corrections with a focused message, then report exact test counts, build result, rendered-QA status, and the Edge reload step.
