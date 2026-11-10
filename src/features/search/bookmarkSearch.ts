import type { AppSnapshot } from '../../domain/models';
import { ALL_BOOKMARKS, selectBookmarks } from '../bookmarks/bookmarkActions';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();

function matchScore(value: string, token: string): number {
  const index = value.indexOf(token);
  if (index >= 0) return index === 0 ? 0 : 1;
  if (token.length < 2) return Infinity;
  // Ordered character matching supports short forms such as "gthb" / "mwd".
  let cursor = 0;
  for (const character of token) {
    cursor = value.indexOf(character, cursor);
    if (cursor < 0) return Infinity;
    cursor += 1;
  }
  return 3;
}

export function findBookmarkMatches(snapshot: AppSnapshot, query: string, limit = 8) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return selectBookmarks(snapshot, ALL_BOOKMARKS)
    .map((bookmark, order) => ({
      bookmark, order,
      score: tokens.reduce((score, token) => score + Math.min(matchScore(normalize(bookmark.title), token), matchScore(normalize(bookmark.url), token) + 1), 0),
    }))
    .filter(({ score }) => Number.isFinite(score))
    .sort((left, right) => left.score - right.score || left.order - right.order)
    .slice(0, limit)
    .map(({ bookmark }) => bookmark);
}
