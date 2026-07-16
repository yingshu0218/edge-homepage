import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { AppSnapshot, Bookmark } from '../../domain/models';
import { BookmarkCard } from './BookmarkCard';
import { filterBookmarksByGroup, reorderBookmarks } from './bookmarkActions';

type Props = { snapshot: AppSnapshot; groupId: string; onChange: (snapshot: AppSnapshot) => void; onEdit?: (bookmark: Bookmark) => void; onDelete?: (bookmark: Bookmark) => void; now?: () => number };
export function BookmarkGrid({ snapshot, groupId, onChange, onEdit, onDelete, now = Date.now }: Props) {
  const bookmarks = filterBookmarksByGroup(snapshot, groupId);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function dragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) onChange(reorderBookmarks(snapshot, String(active.id), String(over.id), now()));
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
      <SortableContext items={bookmarks.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
        <section aria-label="Bookmarks">{bookmarks.map((bookmark) => <BookmarkCard key={bookmark.id} bookmark={bookmark} onEdit={onEdit} onDelete={onDelete} />)}</section>
      </SortableContext>
    </DndContext>
  );
}
