import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';

import type { AppSnapshot, Bookmark } from '../../domain/models';
import { filterBookmarksByGroup, reorderBookmarks } from './bookmarkActions';

type Props = {
  snapshot: AppSnapshot;
  groupId: string;
  onChange: (snapshot: AppSnapshot) => void;
  now?: () => number;
};

export const SORT_POINTER_CONSTRAINT = { distance: 6 } as const;

export function reorderFromDrawer(snapshot: AppSnapshot, activeId: string, overId: string | undefined, now: number) {
  if (!overId || activeId === overId) return undefined;
  const next = reorderBookmarks(snapshot, activeId, overId, now);
  return next === snapshot ? undefined : next;
}

function SortableBookmarkRow({ bookmark }: { bookmark: Bookmark }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bookmark.id });
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
  };
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'bookmark-sort-row is-dragging' : 'bookmark-sort-row'} aria-label={bookmark.title}>
      <span><strong>{bookmark.title}</strong><small>{new URL(bookmark.url).hostname}</small></span>
      <button type="button" aria-label={`排序 ${bookmark.title}`} {...attributes} {...listeners}>⠿</button>
    </li>
  );
}

export function BookmarkSortDrawer({ snapshot, groupId, onChange, now = Date.now }: Props) {
  const bookmarks = filterBookmarksByGroup(snapshot, groupId);
  const group = snapshot.groups.find(({ id, deletedAt }) => id === groupId && deletedAt === undefined);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: SORT_POINTER_CONSTRAINT }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragEnd = ({ active, over }: DragEndEvent) => {
    const next = reorderFromDrawer(snapshot, String(active.id), over ? String(over.id) : undefined, now());
    if (next) onChange(next);
  };

  return (
    <section className="bookmark-sort-panel" aria-label="书签排序内容">
      <p>当前分组</p>
      <h3>{group?.name ?? '未命名分组'}</h3>
      {bookmarks.length === 0 ? <p className="bookmark-sort-empty">当前分组暂无书签</p> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
          <SortableContext items={bookmarks.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
            <ol className="bookmark-sort-list">
              {bookmarks.map((bookmark) => <SortableBookmarkRow key={bookmark.id} bookmark={bookmark} />)}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
