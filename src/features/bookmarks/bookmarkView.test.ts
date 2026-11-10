import { describe, expect, it } from 'vitest';
import { createDefaultSnapshot } from '../../domain/defaults';
import { ALL_BOOKMARKS, RECENT_BOOKMARKS, recordBookmarkOpen } from './bookmarkActions';
import { resolveBookmarkView } from './bookmarkView';

describe('bookmark view selection', () => {
  it('chooses all for a fresh install and recent when local history exists', () => {
    expect(resolveBookmarkView(createDefaultSnapshot(), '', 100)).toBe(ALL_BOOKMARKS);
    expect(resolveBookmarkView(recordBookmarkOpen(createDefaultSnapshot(), 'github', 10), '', 100)).toBe(RECENT_BOOKMARKS);
  });

  it('keeps valid groups and built-in views, and resolves deleted / unknown groups', () => {
    const snapshot = createDefaultSnapshot();
    for (const view of [ALL_BOOKMARKS, RECENT_BOOKMARKS, 'development']) expect(resolveBookmarkView(snapshot, view, 100)).toBe(view);
    snapshot.groups[0]!.deletedAt = 50;
    expect(resolveBookmarkView(snapshot, 'development', 100)).toBe(ALL_BOOKMARKS);
    expect(resolveBookmarkView(snapshot, 'missing', 100)).toBe(ALL_BOOKMARKS);
  });
});
