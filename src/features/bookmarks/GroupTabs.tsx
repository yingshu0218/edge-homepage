import { useRef, type DragEvent, type KeyboardEvent } from 'react';
import type { BookmarkGroup } from '../../domain/models';

type Props = {
  groups: BookmarkGroup[];
  activeGroupId: string;
  onSelect: (groupId: string) => void;
  onRename?: (groupId: string) => void;
  onDelete?: (groupId: string) => void;
  onReorder?: (activeId: string, overId: string) => void;
};

export function GroupTabs({ groups, activeGroupId, onSelect, onRename, onDelete, onReorder }: Props) {
  const activeGroups = groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const dragging = useRef<string | undefined>(undefined);
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % activeGroups.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + activeGroups.length) % activeGroups.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = activeGroups.length - 1;
    else return;
    event.preventDefault();
    const id = activeGroups[next]!.id;
    onSelect(id);
    refs.current.get(id)?.focus();
  };
  const drop = (event: DragEvent, overId: string) => {
    event.preventDefault();
    if (dragging.current && dragging.current !== overId) onReorder?.(dragging.current, overId);
    dragging.current = undefined;
  };
  const activeGroup = activeGroups.find(({ id }) => id === activeGroupId) ?? activeGroups[0];
  return <div className="group-tabs"><div role="tablist" aria-label="Bookmark groups">{activeGroups.map((group, index) => (
      <button key={group.id} ref={(node) => { if (node) refs.current.set(group.id, node); else refs.current.delete(group.id); }} draggable type="button" role="tab"
        tabIndex={activeGroupId === group.id ? 0 : -1} aria-selected={activeGroupId === group.id}
        onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, group.id)}
        onDragStart={() => { dragging.current = group.id; }} onKeyDown={(event) => keyDown(event, index)} onClick={() => onSelect(group.id)}>{group.name}</button>
  ))}</div>{activeGroup && <div className="group-actions" aria-label="当前分组操作">
    {onRename && <button type="button" className="group-action" aria-label={`重命名 ${activeGroup.name}`} onClick={() => onRename(activeGroup.id)}>✎</button>}
    {onDelete && <button type="button" className="group-action" aria-label={`删除 ${activeGroup.name}`} onClick={() => onDelete(activeGroup.id)}>×</button>}
  </div>}</div>;
}
