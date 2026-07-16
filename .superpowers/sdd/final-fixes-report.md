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
