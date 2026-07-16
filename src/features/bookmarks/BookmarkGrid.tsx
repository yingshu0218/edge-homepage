import type { AppSnapshot, Bookmark } from '../../domain/models';
import { BookmarkCard } from './BookmarkCard';
import { filterBookmarksByGroup } from './bookmarkActions';

type Props = { snapshot: AppSnapshot; groupId: string; onEdit?: (bookmark: Bookmark) => void; onDelete?: (bookmark: Bookmark) => void };
export function BookmarkGrid({ snapshot, groupId, onEdit, onDelete }: Props) {
  const bookmarks = filterBookmarksByGroup(snapshot, groupId);
  return (
    <section aria-label="Bookmarks">{bookmarks.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} onEdit={onEdit} onDelete={onDelete} />)}</section>
  );
}
