import { describe, expect, it } from 'vitest';
import { createDefaultSnapshot } from '../../domain/defaults';
import { findBookmarkMatches } from './bookmarkSearch';

describe('local bookmark search', () => {
  it('matches titles, URLs, multiple tokens, and ordered abbreviations across groups', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.groups.push({ id: 'reading', name: '阅读', order: 1, updatedAt: 0 });
    snapshot.bookmarks.push({ ...snapshot.bookmarks[0]!, id: 'cn', title: '中文开发指南', url: 'https://cn.example/guide', groupId: 'reading', order: 0 });
    for (const query of ['gthb', 'ＧＩＴＨＵＢ', 'github.com', 'GitHub github.com']) expect(findBookmarkMatches(snapshot, query)[0]?.id).toBe('github');
    expect(findBookmarkMatches(snapshot, '中文 指南')[0]?.id).toBe('cn');
    expect(findBookmarkMatches(snapshot, 'mwd')[0]?.id).toBe('mdn');
    expect(findBookmarkMatches(snapshot, 'not-an-existing-bookmark')).toEqual([]);
    expect(findBookmarkMatches(snapshot, '   ')).toEqual([]);
  });

  it('excludes deleted records and groups and bounds results without altering the snapshot', () => {
    const snapshot = createDefaultSnapshot();
    snapshot.bookmarks = Array.from({ length: 20 }, (_, index) => ({ ...snapshot.bookmarks[0]!, id: `${index}`, title: `Docs ${index}`, order: index }));
    snapshot.bookmarks[0]!.deletedAt = 1;
    expect(findBookmarkMatches(snapshot, 'Docs')).toHaveLength(8);
    expect(findBookmarkMatches(snapshot, 'Docs').some(({ id }) => id === '0')).toBe(false);
    snapshot.groups[0]!.deletedAt = 1;
    expect(findBookmarkMatches(snapshot, 'Docs')).toEqual([]);
    expect(snapshot.bookmarks).toHaveLength(20);
  });
});
