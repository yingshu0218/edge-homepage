import { useState, type FormEvent } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { AppSnapshot, BookmarkGroup } from '../../domain/models';

type Props = {
  snapshot: AppSnapshot;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string, mode: 'move' | 'delete', destinationId?: string) => void;
  onReorder: (activeId: string, overId: string) => void;
};

function GroupRow({ group, count, onRename, onDelete }: { group: BookmarkGroup; count: number; onRename: Props['onRename']; onDelete: Props['onDelete'] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const save = () => { if (name.trim()) { onRename(group.id, name.trim()); setEditing(false); } };
  return <li ref={setNodeRef} aria-label={group.name} className={isDragging ? 'group-manager-row is-dragging' : 'group-manager-row'} style={{ transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined, transition }}>
    <button className="group-drag-handle" type="button" aria-label={`排序 ${group.name}`} {...attributes} {...listeners}>⠿</button>
    <span className="group-manager-copy">{editing ? <input aria-label={`分组名称 ${group.name}`} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save(); }} /> : <strong>{group.name}</strong>}<small>{count} 个书签</small></span>
    {editing ? <button type="button" aria-label={`保存 ${group.name}`} onClick={save}>✓</button> : <button type="button" aria-label={`重命名 ${group.name}`} onClick={() => setEditing(true)}>✎</button>}
    <button type="button" aria-label={`删除 ${group.name}`} onClick={() => onDelete(group.id, 'move')}>×</button>
  </li>;
}

export function GroupManager({ snapshot, onCreate, onRename, onDelete, onReorder }: Props) {
  const [name, setName] = useState('');
  const [deletingId, setDeletingId] = useState<string>();
  const [destinationId, setDestinationId] = useState('');
  const groups = snapshot.groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order);
  const deletingCount = snapshot.bookmarks.filter((bookmark) => bookmark.groupId === deletingId && !bookmark.deletedAt).length;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (!name.trim()) return; onCreate(name.trim()); setName(''); };
  const dragEnd = ({ active, over }: DragEndEvent) => { if (over && active.id !== over.id) onReorder(String(active.id), String(over.id)); };
  return <section className="group-manager" aria-label="分组管理内容">
    <form onSubmit={submit}><label>新分组名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><button type="submit">新建分组</button></form>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}><SortableContext items={groups.map(({ id }) => id)} strategy={verticalListSortingStrategy}><ol>
      {groups.map((group) => <GroupRow key={group.id} group={group} count={snapshot.bookmarks.filter((bookmark) => bookmark.groupId === group.id && !bookmark.deletedAt).length} onRename={onRename} onDelete={(id) => { setDeletingId(id); setDestinationId(groups.find((candidate) => candidate.id !== id)?.id ?? ''); }} />)}
    </ol></SortableContext></DndContext>
    {deletingId && <div className="group-delete-confirm" role="region" aria-label="删除分组确认"><strong>删除“{groups.find(({ id }) => id === deletingId)?.name}”</strong>{groups.length === 1 ? <p>至少需要保留一个分组。</p> : deletingCount === 0 ? <button type="button" onClick={() => { onDelete(deletingId, 'delete'); setDeletingId(undefined); }}>确认删除空分组</button> : <><p>此分组包含 {deletingCount} 个书签。</p><label>书签移动到<select aria-label="目标分组" value={destinationId} onChange={(event) => setDestinationId(event.target.value)}>{groups.filter(({ id }) => id !== deletingId).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><button type="button" onClick={() => { onDelete(deletingId, 'move', destinationId); setDeletingId(undefined); }}>移动书签并删除</button><button type="button" onClick={() => { onDelete(deletingId, 'delete'); setDeletingId(undefined); }}>一并删除书签</button></>}<button type="button" onClick={() => setDeletingId(undefined)}>取消</button></div>}
  </section>;
}
