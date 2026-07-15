import type { BookmarkGroup } from '../../domain/models';

type Props = { groups: BookmarkGroup[]; activeGroupId: string; onSelect: (groupId: string) => void };
export function GroupTabs({ groups, activeGroupId, onSelect }: Props) {
  return <div role="tablist" aria-label="Bookmark groups">{groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order).map((group) => (
    <button key={group.id} type="button" role="tab" aria-selected={activeGroupId === group.id} onClick={() => onSelect(group.id)}>{group.name}</button>
  ))}</div>;
}
