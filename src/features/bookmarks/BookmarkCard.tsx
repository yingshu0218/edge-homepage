import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Bookmark } from '../../domain/models';
import { BookmarkIcon } from './BookmarkIcon';
import { bookmarkOpenStats } from './bookmarkActions';

type Props = { bookmark: Bookmark; onEdit?: (bookmark: Bookmark) => void; onDelete?: (bookmark: Bookmark) => void; onOpen?: (bookmark: Bookmark) => void; now?: number };
export function BookmarkCard({ bookmark, onEdit, onDelete, onOpen, now = Date.now() }: Props) {
  const stats = bookmarkOpenStats(bookmark, now);
  const trackOpen = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    onOpen?.(bookmark);
  };
  return (
    <article data-bookmark-id={bookmark.id} aria-label={bookmark.title}>
      <a href={bookmark.url} style={{ outlineOffset: 4 }} onClick={trackOpen} onAuxClick={trackOpen}>
        <BookmarkIcon title={bookmark.title} url={bookmark.url} />
        <strong>{bookmark.title}</strong>
        <small>{new URL(bookmark.url).hostname}</small>
        <dl className="bookmark-stats" aria-label={`${bookmark.title} 打开统计`}>
          <div><dt>24h</dt><dd>{stats.day}</dd></div>
          <div><dt>7d</dt><dd>{stats.week}</dd></div>
          <div><dt>30d</dt><dd>{stats.month}</dd></div>
          <div><dt>总计</dt><dd>{stats.total}</dd></div>
        </dl>
      </a>
      {onEdit && <button type="button" aria-label={`Edit ${bookmark.title}`} onClick={() => onEdit(bookmark)}>Edit</button>}
      {onDelete && <button type="button" aria-label={`Delete ${bookmark.title}`} onClick={() => onDelete(bookmark)}>Delete</button>}
    </article>
  );
}
