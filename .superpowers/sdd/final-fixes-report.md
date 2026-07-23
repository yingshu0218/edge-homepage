# Final review fixes report

Date: 2026-07-16

Implementation commit: `585b17764975deadd4a3c5da1385a135a8ce17b1`

## Result

All Critical and Important findings from the final review were addressed. The listed Minor findings were also handled: real Blob bytes/clone semantics, missing-local-background fallback feedback, complete tab keyboard semantics, and group drag interaction coverage.

## Finding → fix → test mapping

1. **Fail-closed runtime validation**
   - Added shared `src/domain/snapshotValidator.ts` and routed both `SnapshotRepository.load()` and `EdgeSyncProvider.pull()` through it.
   - Validation is strict for top-level/schema/settings and every group/bookmark field, exact keys, finite numeric timestamps, safe HTTP(S) URLs, unique IDs/orders, chunk-key/record-ID agreement, missing/deleted group references, and invalid metadata.
   - Edge corruption throws an explicit `SnapshotCorruptionError`; `App` keeps the local snapshot, does not merge/save the bad pull, displays the diagnostic, and exposes “重置同步数据”.
   - Evidence: `snapshotRepository.test.ts` unsafe nested local snapshot; `edgeSyncProvider.test.ts` corrupted chunk; `App.test.tsx` corrupted remote does not call local save and exposes recovery.

2. **Order changes participate in LWW**
   - `reorderBookmarks` now accepts `now`; every record whose `order` changes gets that timestamp. Bookmark group moves/normalization use the same rule.
   - Added `reorderGroups`; changed group orders are timestamped. Group deletion also normalizes surviving orders and timestamps changed groups.
   - Evidence: bookmark/group order timestamp tests and old-remote/new-local merge regression in `bookmarkActions.test.ts` and `edgeSyncProvider.test.ts`.

3. **Local latest-wins persistence**
   - `SyncCoordinator` now serializes local saves through a failure-tolerant queue while leaving provider pushes outside that queue, preserving provider debounce/sequencing and existing remote-error semantics.
   - Evidence: controllably blocked first local write finishes before the queued latest write; final stored theme is `latest`. Existing local-before-remote and remote-quota-error tests remain green.

4. **Complete group management UI**
   - Active-group rename/delete actions are reachable beside the tab list.
   - Delete requires an explicit `move` (default), `delete`, or `cancel`; moving targets another active group, while delete soft-deletes contained bookmarks. The last group cannot be deleted.
   - Native group drag/drop calls timestamped `reorderGroups`.
   - Tabs use roving `tabIndex`, Left/Right/Home/End navigation, selection, focus movement, and clean tablist semantics.
   - Evidence: `GroupTabs.test.tsx` keyboard, actions, and drag/drop; domain tests cover move/delete validation and timestamped reorder.

5. **Import preview and confirmation**
   - A selected JSON backup is parsed and validated before any write. The panel displays mode plus active group/bookmark counts and requires explicit confirm; cancel performs no write.
   - Evidence: two `SettingsPanel.test.tsx` tests cover confirmed merge summary and cancellation. The App replace-import test now confirms before asserting background clearing/persistence.

6. **Edge sync preflight quota**
   - Before `set`, the provider reads current total bytes and existing managed-key bytes, estimates UTF-8 bytes for the replacement managed payload, and computes projected total.
   - Projected usage over 90 KiB returns a warning; over 100 KiB rejects before `set`, preserving local data.
   - Evidence: pre-write warning and rejection boundary tests plus per-item quota regression.

7. **Truthful sync visuals**
   - Both top chip and atmosphere card derive from `SyncState`.
   - Only `synced` renders green/✓. `local`, `pending`, `warning`, and `error` render distinct neutral/amber/error facts.
   - Evidence: App UI tests cover local, pending, warning, error, and absence of a synced fact.

8. **Minor hardening**
   - Background Blob fake now performs a byte-for-byte FileReader clone, asserts identical bytes, and asserts different object identity.
   - A missing device-local custom background visibly falls back with a non-blocking status; choosing a built-in theme clears the notice.
   - Group tabs implement full roving keyboard behavior; group drag/drop has automated interaction coverage.

## TDD RED evidence

Initial focused RED command:

`npm test -- src/storage/snapshotRepository.test.ts src/sync/edgeSyncProvider.test.ts src/features/bookmarks/bookmarkActions.test.ts src/sync/syncCoordinator.test.ts`

Observed: 7 expected failures — unsafe local snapshot resolved, unsafe Edge chunk resolved, over-limit write was performed, projected warning was absent, slow old local write won, reorder timestamps were unchanged, and `reorderGroups` did not exist.

Second focused RED command:

`npm test -- src/features/bookmarks/GroupTabs.test.tsx src/features/settings/SettingsPanel.test.tsx src/newtab/App.test.tsx src/storage/backgroundStore.test.ts`

Observed expected failures for missing roving tabs/actions/drag, missing import preview/cancel, unconditional green sync fact, missing corruption recovery, missing background fallback, and inadequate Blob clone simulation. The Blob fake initially exposed jsdom's missing `Blob.arrayBuffer`; the test was corrected to use `FileReader` before production behavior was judged.

An additional RED test proved group deletion left surviving group orders sparse and timestamps stale.

## GREEN and final verification

Fresh final commands before the implementation commit:

```text
npm test
  15 test files passed
  87 tests passed

npm run build
  TypeScript build passed
  Vite production build passed (54 modules)

node manifest/package validator
  manifest/package validator passed

git diff --check
  passed
```

## Remaining attention

- Native Edge unpacked-extension QA is still recommended for Microsoft-account cross-device propagation and real `chrome.storage.sync.getBytesInUse` reporting, because jsdom/fake storage cannot reproduce Edge account policy or network timing.
- The self-use first release intentionally uses simple prompts for group rename/delete choices; the behavior is explicit and accessible, but a custom in-page dialog could improve visual polish later without changing the data model.

## v2 final-review follow-up

Implementation commit: `293e803c0d54966ccac674fe22fd5dde50e5b77a`

### 1. Valid and convergent snapshot merges

- Reproduced two legal devices independently adding a bookmark at the same tail order and independently adding/moving into groups with the same group order. The former merged into duplicate bookmark order; the latter into duplicate group order.
- `mergeRecords` now resolves equal-revision/equal-tombstone conflicts with a deterministic canonical-record tie break and emits records in ID order, so merge direction cannot choose a different equal-revision value.
- After record LWW, active groups and each active bookmark group are normalized by `(order, id)`. Only records whose numeric order actually changes receive a deterministic logical revision of `max(updatedAt) + 1`; unchanged records keep their timestamp. This makes the normalized record beat the stale conflicting record without creating a timestamp on every merge.
- Active bookmarks orphaned by a concurrent group deletion are deterministically tombstoned. `mergeSnapshots` calls the shared runtime validator before returning.
- Tests prove both concurrent scenarios validate, forward/reverse results match, repeated bidirectional merge is identical, and a merged snapshot survives `SnapshotRepository.save()` plus reload.

### 2. Transactional search-template editing and defensive saves

- Reproduced `SettingsPanel` persisting every keystroke, including an empty template.
- Search input is now a draft. Change events never persist. Blur or Enter validates that `%s` exists and that substituting it produces an HTTP(S) URL; invalid input stays in the field with an inline error and never invokes the persistence callback.
- `SnapshotRepository.save()` now validates before calling storage, so an invalid snapshot rejects without overwriting the last valid snapshot.
- Tests cover character-by-character clearing, missing `%s`, unsafe URL schemes, valid blur commit, App-level coordinator persistence only for the valid committed value, and valid-old-snapshot reload after a rejected save.
- Import preview semantics were tightened from a nested pseudo-modal `role=dialog` to a labeled `role=region`.

### v2 RED/GREEN evidence

RED command:

`npm test -- src/sync/edgeSyncProvider.test.ts src/storage/snapshotRepository.test.ts src/features/settings/SettingsPanel.test.tsx`

Observed 4 expected failures: concurrent bookmark order failed validation, concurrent group order failed validation, invalid repository save resolved, and an empty search keystroke invoked persistence.

GREEN focused result: 3 files, 29 tests passed. Final App persistence coverage raised the full count to 92.

Fresh final verification before commit:

```text
npm test                         15 files, 92 tests passed
npm run build                    passed (TypeScript + Vite, 54 modules)
node manifest/package validator  passed
git diff --check                 passed
```

## Local bookmarks/time/weather final-review follow-up — 2026-07-23

Initial four-findings implementation commit: `4334c6c060b119c2e0fd90bf78b21dd361078864`.

### Result

All four final-review findings were fixed in one change set:

1. Merge import now normalizes active group orders and active bookmark orders independently within each group after applying the existing current-snapshot-wins duplicate-ID rule. Deleted records retain their tombstones and order metadata. An App integration test imports two independently extended, individually valid backups, validates the merged schema-2 snapshot, reads it through the real `SnapshotRepository`, unmounts, reloads, and confirms the imported group/bookmark remain persisted.
2. Every drawer now owns an explicit dark palette (`#191529` surface, `#f5f2fb` text, dark native color scheme, dedicated muted/border/control colors) rather than inheriting light root text. Base coverage includes headings, body copy, labels, legends, time/output, inputs, selects, buttons, and the light-mode close icon. The conflicting light-appearance weather overrides were removed. The palette therefore applies consistently to theme, settings, sort, group, bookmark, time, and weather drawers.
3. Open-Meteo geocoding accepts an ID only when it is a non-blank string or a finite integer. Latitude must be within `[-90, 90]` and longitude within `[-180, 180]`; malformed provider results still surface the existing Chinese user-safe error.
4. Bookmark-manager search now exposes `筛选结果 N 个` as a polite, atomic status while a trimmed query is active. The original total count and selected count remain visible.

### TDD RED evidence

- `npm test -- src/newtab/App.test.tsx`
  - 1 expected failure: the independent-backup merge was rendered optimistically but `SnapshotRepository.save()` rejected `Corrupted local snapshot: duplicate active group order`; reload did not contain the incoming group.
- `npm test -- src/newtab/app.css.test.mjs`
  - 1 expected failure: the drawer had no explicit palette variables/text/color scheme and still contained light-mode weather overrides.
- `npm test -- src/features/weather/openMeteoClient.test.ts`
  - 7 expected failures: empty/blank/fractional IDs and all four coordinate boundary violations resolved instead of rejecting.
- Non-finite ID regression proof: with the finite/integer guard temporarily reverted, `npm test -- src/features/weather/openMeteoClient.test.ts -t "non-finite numeric location ID"` failed because `1e400` mapped to the string `Infinity`; restoring the guard made the complete 15-test file pass.
- `npm test -- src/features/bookmarks/BookmarkManagerDrawer.test.tsx`
  - 1 expected failure: no accessible `status` existed after search filtering.

### Focused GREEN evidence

```text
npm test -- src/newtab/App.test.tsx src/newtab/app.css.test.mjs src/features/weather/openMeteoClient.test.ts src/features/bookmarks/BookmarkManagerDrawer.test.tsx
  Test Files  4 passed (4)
  Tests       39 passed (39)
```

Additional focused non-finite verification after restoring the guard:

```text
npm test -- src/features/weather/openMeteoClient.test.ts
  Test Files  1 passed (1)
  Tests       15 passed (15)
```

### Fresh final verification

```text
npm test
  Test Files  30 passed (30)
  Tests       211 passed (211)

npm run build
  tsc -b passed
  Vite production build passed
  65 modules transformed

rg -n "EdgeSyncProvider|SyncCoordinator|chrome\.storage\.sync|Microsoft .*同步|重置同步数据" src/newtab src/features/settings public/manifest.json README.md docs/edge-installation.md
  no matches (expected rg exit code 1)

git diff --check
  no output; exit code 0
```

### Consistency inspection and concerns

- The structural CSS test asserts the drawer-owned surface/text/muted/control palette, inherited text coverage, explicit input/select/button treatment, placeholder contrast, and absence of light-appearance weather overrides.
- Source inspection confirmed the only remaining light-appearance rules target the page shell/top controls/bookmark cards/mood card; the drawer close icon is explicitly re-overridden by the drawer palette.
- No implementation concern remains for the four findings. A native Edge screenshot was not produced; the drawer readability conclusion is based on explicit cascade structure plus production-build and DOM/component coverage.
- The pre-existing unrelated modification to `.superpowers/sdd/task-7-report.md` was intentionally excluded from this commit.

## Deleted winning-group merge follow-up — 2026-07-23

Follow-up implementation commit: this report is committed with the fix; the exact SHA is returned in the task handoff.

### Result

Current-wins merge now handles the remaining group/bookmark conflict without changing the established ID semantics:

- If the current snapshot owns a deleted group ID and the imported snapshot owns an active group with that same ID, the current deleted group remains the resolved record.
- Imported-only active bookmarks targeting that resolved deleted group are excluded from the merge.
- Current bookmarks are untouched, and imported deleted-bookmark history is retained.
- Active group and per-group bookmark order normalization still runs after this filter.

The App regression composes two independently valid schema-2 snapshots, performs a UI merge through the real `SnapshotRepository`, validates the persisted result, proves the current deleted group wins, proves the imported active bookmark is absent, proves current/imported tombstones survive, unmounts, reloads, and confirms imported settings persisted.

### TDD RED/GREEN evidence

RED:

```text
npm test -- src/newtab/App.test.tsx -t "current duplicate group is deleted"
  Test Files  1 failed (1)
  Tests       1 failed | 16 skipped (17)
  Repository rejection: Corrupted local snapshot: active bookmark references a deleted group
```

GREEN:

```text
npm test -- src/newtab/App.test.tsx -t "current duplicate group is deleted"
  Test Files  1 passed (1)
  Tests       1 passed | 16 skipped (17)

npm test -- src/newtab/App.test.tsx
  Test Files  1 passed (1)
  Tests       17 passed (17)
```

### Fresh final verification

```text
npm test
  Test Files  30 passed (30)
  Tests       212 passed (212)

npm run build
  tsc -b passed
  Vite production build passed
  65 modules transformed

rg -n "EdgeSyncProvider|SyncCoordinator|chrome\.storage\.sync|Microsoft .*同步|重置同步数据" src/newtab src/features/settings public/manifest.json README.md docs/edge-installation.md
  no matches (expected rg exit code 1)

git diff --check
  no output; exit code 0
```

### Concerns

None for this merge edge case. The unrelated pre-existing `.superpowers/sdd/task-7-report.md` modification remains excluded.
