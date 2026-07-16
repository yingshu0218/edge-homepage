# Bookmark Icons, Group Management, and Theme Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add derived bookmark favicons, consolidate group operations in a right drawer, and improve theme selection and appearance controls.

**Architecture:** A focused `BookmarkIcon` component derives visual state without changing synced data. A `GroupManager` component owns group forms and handle-only ordering while `App` performs persistence and destructive confirmations. `ThemePicker` becomes the single theme appearance surface and emits complete parameter changes.

**Tech Stack:** React 19, TypeScript, dnd-kit, Vitest, Testing Library, Vite, Manifest V3.

## Global Constraints

- Preserve snapshot schema version 1 and avoid syncing image bytes.
- Use test-first red-green cycles for every behavior change.
- Bind drag listeners only to explicit handles.
- Preserve existing drawer accessibility and sync persistence behavior.

---

### Task 1: Derived bookmark icons

**Files:** Create `src/features/bookmarks/BookmarkIcon.tsx`, create its test, modify `BookmarkCard.tsx`, CSS, and `public/manifest.json`.

- [ ] Write tests for favicon derivation, fallback character, stable color, and failed image state.
- [ ] Run focused tests and confirm failure because the component is missing.
- [ ] Implement `BookmarkIcon` and integrate it into cards.
- [ ] Verify focused tests and manifest host permissions.
- [ ] Commit the tested unit.

### Task 2: Group manager drawer

**Files:** Create `GroupManager.tsx` and test; simplify `GroupTabs.tsx` and tests; modify `App.tsx`, application tests, and CSS.

- [ ] Write component tests for counts, inline create/rename, handle controls, and delete callbacks.
- [ ] Run focused tests and confirm RED.
- [ ] Implement the manager and remove native drag/action controls from tabs.
- [ ] Write application tests for opening, focus restoration, persistence, last-group protection, and delete choices.
- [ ] Wire a `groups` drawer state to existing bookmark action functions and verify GREEN.
- [ ] Commit the tested unit.

### Task 3: Theme detail controls

**Files:** Modify `ThemePicker.tsx` and tests, `App.tsx` and tests, `SettingsPanel.tsx` and tests, and CSS.

- [ ] Write tests for selection mark, accent swatch, appearance selection, numeric slider feedback, and custom state.
- [ ] Run focused tests and confirm RED.
- [ ] Extend `ThemePicker` props with current appearance/overlay/blur and a parameter-change callback.
- [ ] Apply built-in recommended parameters when selecting a theme and route manual changes through `updateSettings`.
- [ ] Remove duplicate appearance sliders from `SettingsPanel` and update tests.
- [ ] Verify theme and application tests, then commit.

### Task 4: Completion verification

- [ ] Run `npm test` and require zero failures.
- [ ] Run `npm run build` and require TypeScript/Vite exit 0.
- [ ] Validate `dist/manifest.json`, asset output, and `git diff --check`.
- [ ] Audit each design requirement against source and tests.
- [ ] Commit any verification corrections and provide Edge reload instructions.
