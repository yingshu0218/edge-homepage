import { FormEvent, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react';
import type { Bookmark, BookmarkGroup } from '../../domain/models';
import { normalizeDestination } from '../../domain/url';

export type BookmarkDialogValue = Pick<Bookmark, 'title' | 'url' | 'groupId'>;
type Props = {
  open: boolean;
  groups: BookmarkGroup[];
  searchTemplate: string;
  bookmark?: Bookmark;
  onSave: (value: BookmarkDialogValue) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

const focusableSelector = 'input:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function BookmarkDialog({ open, groups, searchTemplate, bookmark, onSave, onClose, returnFocusRef }: Props) {
  const availableGroups = groups.filter(({ deletedAt }) => deletedAt === undefined).sort((a, b) => a.order - b.order);
  const [title, setTitle] = useState(bookmark?.title ?? '');
  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [groupId, setGroupId] = useState(bookmark?.groupId ?? availableGroups[0]?.id ?? '');
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(bookmark?.title ?? '');
    setUrl(bookmark?.url ?? '');
    setGroupId(bookmark?.groupId ?? availableGroups[0]?.id ?? '');
    setError('');
  }, [bookmark, open]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleRef.current?.focus();
    return () => (returnFocusRef?.current ?? previouslyFocused)?.focus();
  }, [open, returnFocusRef]);

  if (!open) return null;
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (!title.trim() || !url.trim() || !groupId || /^[a-z][a-z\d+.-]*:/i.test(url.trim()) && !/^https?:/i.test(url.trim())) throw new Error();
      const normalized = normalizeDestination(url, searchTemplate);
      if (!/^https?:\/\//i.test(normalized)) throw new Error();
      onSave({ title: title.trim(), url: normalized, groupId });
    } catch {
      setError('Enter a title and a valid HTTP or HTTPS URL.');
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    }
  }

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bookmark-dialog-title" onKeyDown={handleKeyDown}>
      <form onSubmit={submit}>
        <h2 id="bookmark-dialog-title">{bookmark ? 'Edit bookmark' : 'Add bookmark'}</h2>
        <label>Title<input ref={titleRef} required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>URL<input required inputMode="url" value={url} aria-describedby={error ? 'bookmark-error' : undefined} onChange={(event) => setUrl(event.target.value)} /></label>
        <label>Group<select required value={groupId} onChange={(event) => setGroupId(event.target.value)}>{availableGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        {error && <p id="bookmark-error" role="alert">{error}</p>}
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit">Save bookmark</button>
      </form>
    </div>
  );
}
