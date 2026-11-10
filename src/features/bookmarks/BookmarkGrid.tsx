import type { AppSnapshot, Bookmark } from '../../domain/models';
import { BookmarkCard } from './BookmarkCard';
import { selectBookmarks } from './bookmarkActions';

type Props = {
  snapshot: AppSnapshot;
  groupId: string;
  limit?: number;
  onViewAll?: (trigger: HTMLButtonElement) => void;
  onEdit?: (bookmark: Bookmark) => void;
  onDelete?: (bookmark: Bookmark) => void;
  onOpen?: (bookmark: Bookmark) => void | Promise<void>;
  navigate?: (destination: string) => void;
  now?: number;
  revealedBookmarkId?: string;
};
export function BookmarkGrid({ snapshot, groupId, limit, onViewAll, onEdit, onDelete, onOpen, navigate, now, revealedBookmarkId }: Props) {
  const bookmarks = selectBookmarks(snapshot, groupId, now);
  let visible = limit === undefined ? bookmarks : bookmarks.slice(0, limit);
  const revealed = bookmarks.find(({ id }) => id === revealedBookmarkId);
  if (revealed && limit && !visible.includes(revealed)) visible = [...visible.slice(0, limit - 1), revealed];
  return (
    <section aria-label="Bookmarks">
      {bookmarks.length === 0 && <p>暂无书签</p>}
      {visible.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} usage={snapshot.bookmarkUsage[bookmark.id]} onEdit={onEdit} onDelete={onDelete} onOpen={onOpen} navigate={navigate} now={now} />)}
      {bookmarks.length > visible.length && (
        <button type="button" className="view-all-bookmarks" onClick={(event) => onViewAll?.(event.currentTarget)}>
          查看全部（共 {bookmarks.length} 个）
        </button>
      )}
    </section>
  );
}
