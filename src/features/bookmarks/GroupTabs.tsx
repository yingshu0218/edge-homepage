import { useRef, type KeyboardEvent } from 'react';
import { BUILTIN_BOOKMARK_TABS } from './bookmarkActions';
import type { BookmarkGroup } from '../../domain/models';

type Props = {
  groups: BookmarkGroup[];
  activeGroupId: string;
  onSelect: (groupId: string) => void;
};

export function GroupTabs({ groups, activeGroupId, onSelect }: Props) {
  const activeGroups = [...BUILTIN_BOOKMARK_TABS, ...groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order)];
  const refs = useRef(new Map<string, HTMLButtonElement>());
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
  return <div className="group-tabs"><div role="tablist" aria-label="Bookmark groups">{activeGroups.map((group, index) => (
      <button key={group.id} ref={(node) => { if (node) refs.current.set(group.id, node); else refs.current.delete(group.id); }} type="button" role="tab"
        tabIndex={activeGroupId === group.id ? 0 : -1} aria-selected={activeGroupId === group.id}
        onKeyDown={(event) => keyDown(event, index)} onClick={() => onSelect(group.id)}>{group.name}</button>
  ))}</div></div>;
}
