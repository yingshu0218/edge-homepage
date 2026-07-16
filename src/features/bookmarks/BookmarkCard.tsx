import type { Bookmark } from '../../domain/models';

type Props = { bookmark: Bookmark; onEdit?: (bookmark: Bookmark) => void; onDelete?: (bookmark: Bookmark) => void };
export function BookmarkCard({ bookmark, onEdit, onDelete }: Props) {
  return (
    <article data-bookmark-id={bookmark.id} aria-label={bookmark.title}>
      <a href={bookmark.url} style={{ outlineOffset: 4 }}><span>{bookmark.title}</span><small>{new URL(bookmark.url).hostname}</small></a>
      {onEdit && <button type="button" aria-label={`Edit ${bookmark.title}`} onClick={() => onEdit(bookmark)}>Edit</button>}
      {onDelete && <button type="button" aria-label={`Delete ${bookmark.title}`} onClick={() => onDelete(bookmark)}>Delete</button>}
    </article>
  );
}
