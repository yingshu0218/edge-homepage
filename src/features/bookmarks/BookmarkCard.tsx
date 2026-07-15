import { useSortable } from '@dnd-kit/sortable';
import type { Bookmark } from '../../domain/models';

type Props = { bookmark: Bookmark; onEdit?: (bookmark: Bookmark) => void; onDelete?: (bookmark: Bookmark) => void };
export function BookmarkCard({ bookmark, onEdit, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bookmark.id });
  const style = { transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <article ref={setNodeRef} style={style} data-bookmark-id={bookmark.id}>
      <a href={bookmark.url} style={{ outlineOffset: 4 }}><span>{bookmark.title}</span><small>{new URL(bookmark.url).hostname}</small></a>
      <button type="button" aria-label={`Drag ${bookmark.title}`} {...attributes} {...listeners}>Drag</button>
      {onEdit && <button type="button" aria-label={`Edit ${bookmark.title}`} onClick={() => onEdit(bookmark)}>Edit</button>}
      {onDelete && <button type="button" aria-label={`Delete ${bookmark.title}`} onClick={() => onDelete(bookmark)}>Delete</button>}
    </article>
  );
}
