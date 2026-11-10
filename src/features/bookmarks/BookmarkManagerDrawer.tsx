import { useEffect, useMemo, useState } from 'react';

import type { AppSnapshot, Bookmark } from '../../domain/models';
import { BookmarkIcon } from './BookmarkIcon';
import { BUILTIN_BOOKMARK_TABS, selectBookmarks, searchBookmarks } from './bookmarkActions';

type Props = {
  snapshot: AppSnapshot;
  groupId: string;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (ids: string[]) => void;
  onMove: (ids: string[], destinationGroupId: string) => void;
  onOpenSort: () => void;
};

export function BookmarkManagerDrawer({ snapshot, groupId, onEdit, onDelete, onMove, onOpenSort }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const groups = useMemo(() => snapshot.groups.filter(({ deletedAt }) => deletedAt === undefined).sort((left, right) => left.order - right.order), [snapshot.groups]);
  const bookmarks = useMemo(() => selectBookmarks(snapshot, groupId), [snapshot, groupId]);
  const visibleBookmarks = useMemo(() => searchBookmarks(snapshot, groupId, query), [snapshot, groupId, query]);
  const destinations = useMemo(() => groups.filter(({ id }) => id !== groupId), [groups, groupId]);
  const [destinationGroupId, setDestinationGroupId] = useState(() => destinations[0]?.id ?? '');
  const group = groups.find(({ id }) => id === groupId);
  const selectedIds = bookmarks.filter(({ id }) => selected.has(id)).map(({ id }) => id);
  const visibleIds = visibleBookmarks.map(({ id }) => id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  useEffect(() => {
    const activeIds = new Set(bookmarks.map(({ id }) => id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => activeIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [bookmarks]);

  useEffect(() => {
    if (destinations.some(({ id }) => id === destinationGroupId)) return;
    setDestinationGroupId(destinations[0]?.id ?? '');
  }, [destinationGroupId, destinations]);

  useEffect(() => {
    if (confirmingDelete && selectedIds.length === 0) setConfirmingDelete(false);
  }, [confirmingDelete, selectedIds.length]);

  const toggleSelection = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleVisibleSelection = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const moveSelected = () => {
    if (!destinationGroupId || selectedIds.length === 0) return;
    onMove(selectedIds, destinationGroupId);
    setSelected(new Set());
  };

  const deleteSelected = () => {
    onDelete(selectedIds);
    setSelected(new Set());
    setConfirmingDelete(false);
  };

  return (
    <section className="bookmark-manager" aria-label="书签管理内容">
      <div className="bookmark-manager-heading">
        <div><p>当前分组</p><h3>{group?.name ?? BUILTIN_BOOKMARK_TABS.find(({ id }) => id === groupId)?.name ?? '未命名分组'}</h3></div>
        <span>{bookmarks.length} 个书签</span>
      </div>
      <div className="bookmark-manager-toolbar">
        <label className="bookmark-manager-search">搜索书签<input type="search" role="searchbox" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="按名称或网址搜索" /></label>
        <button disabled={!group} type="button" className="bookmark-manager-sort" onClick={onOpenSort}>打开排序管理</button>
      </div>

      <div className="bookmark-manager-select-all">
        <label><input type="checkbox" aria-label="选择所有可见书签" checked={allVisibleSelected} disabled={visibleIds.length === 0} onChange={toggleVisibleSelection} />全选当前结果</label>
        <div className="bookmark-manager-counts">
          {query.trim() && <span role="status" aria-live="polite" aria-atomic="true">筛选结果 {visibleBookmarks.length} 个</span>}
          <span>已选择 {selectedIds.length} 个书签</span>
        </div>
      </div>

      {visibleBookmarks.length === 0 ? <p className="bookmark-manager-empty">{query.trim() ? '未找到匹配的书签' : '当前分组暂无书签'}</p> : (
        <ul className="bookmark-manager-list">
          {visibleBookmarks.map((bookmark) => <li key={bookmark.id} className={selected.has(bookmark.id) ? 'is-selected' : undefined}>
            <label className="bookmark-manager-check"><input type="checkbox" aria-label={`选择 ${bookmark.title}`} checked={selected.has(bookmark.id)} onChange={() => toggleSelection(bookmark.id)} /></label>
            <BookmarkIcon title={bookmark.title} url={bookmark.url} />
            <span className="bookmark-manager-copy"><strong>{bookmark.title}</strong><small>{new URL(bookmark.url).hostname}</small></span>
            <button type="button" aria-label={`编辑 ${bookmark.title}`} onClick={() => onEdit(bookmark)}>✎</button>
          </li>)}
        </ul>
      )}

      <div className="bookmark-manager-batch" aria-label="批量操作">
        <label>移动到分组<select value={destinationGroupId} disabled={selectedIds.length === 0 || destinations.length === 0} onChange={(event) => setDestinationGroupId(event.target.value)}>
          {destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}
        </select></label>
        <button type="button" disabled={selectedIds.length === 0 || !destinationGroupId} onClick={moveSelected}>移动 {selectedIds.length} 个书签</button>
        <button type="button" disabled={selectedIds.length === 0} onClick={() => setConfirmingDelete(true)}>删除 {selectedIds.length} 个书签</button>
      </div>

      {confirmingDelete && <div className="bookmark-manager-delete-confirm" role="region" aria-label="删除书签确认">
        <p>删除选中的 {selectedIds.length} 个书签？</p>
        <button type="button" onClick={deleteSelected}>确认删除</button>
        <button type="button" onClick={() => setConfirmingDelete(false)}>取消</button>
      </div>}
    </section>
  );
}
