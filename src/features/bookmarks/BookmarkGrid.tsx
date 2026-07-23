import type { AppSnapshot, Bookmark } from '../../domain/models';
import { BookmarkCard } from './BookmarkCard';
import { filterBookmarksByGroup } from './bookmarkActions';

type Props = {
  snapshot: AppSnapshot;
  groupId: string;
  limit?: number;
  onViewAll?: (trigger: HTMLButtonElement) => void;
  onEdit?: (bookmark: Bookmark) => void;
  onDelete?: (bookmark: Bookmark) => void;
};
export function BookmarkGrid({ snapshot, groupId, limit, onViewAll, onEdit, onDelete }: Props) {
  const bookmarks = filterBookmarksByGroup(snapshot, groupId);
  const visible = limit === undefined ? bookmarks : bookmarks.slice(0, limit);
  return (
    <section aria-label="Bookmarks">
      {visible.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} onEdit={onEdit} onDelete={onDelete} />)}
      {bookmarks.length > visible.length && (
        <button type="button" className="view-all-bookmarks" onClick={(event) => onViewAll?.(event.currentTarget)}>
          查看全部（共 {bookmarks.length} 个）
        </button>
      )}
    </section>
  );
}
