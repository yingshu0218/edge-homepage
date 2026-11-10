import { type FormEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AppSnapshot, Bookmark } from '../../domain/models';
import { normalizeDestination } from '../../domain/url';
import { findBookmarkMatches } from './bookmarkSearch';

export type SearchBoxProps = {
  searchTemplate: string;
  navigate: (destination: string) => void;
  snapshot?: AppSnapshot;
  onBookmarkOpen?: (bookmark: Bookmark) => void | Promise<void>;
  query?: string;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
};

export function SearchBox({ searchTemplate, navigate, snapshot, onBookmarkOpen, query, onQueryChange, placeholder = '搜索书签、输入网址或搜索网页' }: SearchBoxProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [composing, setComposing] = useState(false);
  const composingRef = useRef(false);
  const listId = useId();
  const value = query ?? internalQuery;
  const matches = useMemo(() => snapshot ? findBookmarkMatches(snapshot, value) : [], [snapshot, value]);
  const expanded = open && Boolean(value.trim()) && !composing;
  // Enter keeps URL / web search as the default until a result is selected.
  const selectedIndex = expanded && activeIndex <= matches.length ? activeIndex : -1;
  useEffect(() => {
    if (selectedIndex >= 0) document.getElementById(`${listId}-${selectedIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [listId, selectedIndex]);
  let destination: string | undefined;
  try { if (value.trim()) destination = normalizeDestination(value, searchTemplate); } catch { /* Invalid URL: show inline feedback. */ }
  const isAddress = /^https?:\/\//i.test(value.trim()) || /^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(value.trim());

  async function chooseBookmark(bookmark: Bookmark) {
    setOpen(false);
    setActiveIndex(-1);
    await onBookmarkOpen?.(bookmark);
    navigate(bookmark.url);
  }

  function openDestination() {
    if (!destination || composingRef.current) return;
    setOpen(false);
    setActiveIndex(-1);
    navigate(destination);
  }

  function activateSelection() {
    if (composingRef.current) return;
    const bookmark = selectedIndex >= 0 ? matches[selectedIndex] : undefined;
    if (bookmark) void chooseBookmark(bookmark);
    else openDestination();
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); activateSelection(); }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activateSelection();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && value.trim()) {
      event.preventDefault();
      setOpen(true);
      const count = matches.length + 1;
      const current = expanded ? selectedIndex : -1;
      setActiveIndex(event.key === 'ArrowDown' ? (current + 1) % count : (current <= 0 ? count - 1 : current - 1));
    }
  }

  return (
    <form onSubmit={submit} aria-label="搜索" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActiveIndex(-1); }
    }}>
      <input
        type="search"
        role="combobox"
        aria-label="搜索书签或输入网址"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { composingRef.current = true; setComposing(true); setActiveIndex(-1); }}
        onCompositionEnd={() => { composingRef.current = false; setComposing(false); setOpen(true); }}
        onChange={(event) => {
          onQueryChange?.(event.target.value);
          if (query === undefined) setInternalQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
      />
      <button className="search-submit" type="submit" aria-label="搜索或打开所选结果">搜索</button>
      {expanded && <div className="search-results">
        <p role="status">{matches.length ? `匹配书签 ${matches.length} 个（跨分组，最多显示 8 个）` : '未找到匹配书签，可继续搜索网页或打开网址'}</p>
        <ul id={listId} role="listbox" aria-label="搜索建议">
          {matches.map((bookmark, index) => <li key={bookmark.id} id={`${listId}-${index}`} role="option" aria-selected={selectedIndex === index}
            onMouseEnter={() => setActiveIndex(index)}>
            <button type="button" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={() => void chooseBookmark(bookmark)}>
              <strong>{bookmark.title}</strong><small>{bookmark.url}</small><span>{snapshot?.groups.find(({ id }) => id === bookmark.groupId)?.name}</span>
            </button>
          </li>)}
          <li id={`${listId}-${matches.length}`} role="option" aria-selected={selectedIndex === matches.length}>
            <button type="button" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(matches.length)} onClick={openDestination} disabled={!destination}>
              {destination ? `${isAddress ? '打开网址' : '搜索网页'}：${value.trim()}` : '请输入有效的网址'}
            </button>
          </li>
        </ul>
        <p className="search-hint">↑↓ 选择 · Enter 打开 · Esc 关闭</p>
      </div>}
    </form>
  );
}
