import { useEffect, useState } from 'react';
import { loadBookmarkIcon, type BookmarkIconResult } from './bookmarkIconLoader';

const ICON_COLORS = ['#5b8def', '#8b6fe8', '#df6b8b', '#e28a45', '#3ba58c', '#4b9bc2', '#9a7b55'];
const createBlobUrl = (blob: Blob) => URL.createObjectURL(blob);

export function iconColor(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length]!;
}

export function BookmarkIcon({
  title,
  url,
  loadIcon = loadBookmarkIcon,
  createObjectUrl = createBlobUrl,
}: {
  title: string;
  url: string;
  loadIcon?: (url: string, options?: { onCached?: (blob: Blob) => void }) => Promise<BookmarkIconResult>;
  createObjectUrl?: (blob: Blob) => string;
}) {
  const [source, setSource] = useState<string>();
  let hostname = title;
  try { hostname = new URL(url).hostname; } catch { /* use title */ }
  const initial = title.trim().charAt(0).toLocaleUpperCase() || '?';

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    let displayedBlob: Blob | undefined;
    setSource(undefined);
    const showBlob = (blob: Blob) => {
      if (!active || blob === displayedBlob) return;
      if (objectUrl && URL.revokeObjectURL) URL.revokeObjectURL(objectUrl);
      displayedBlob = blob;
      objectUrl = createObjectUrl(blob);
      setSource(objectUrl);
    };
    void loadIcon(url, { onCached: showBlob })
      .then(({ blob }) => {
        if (!active || !blob) return;
        showBlob(blob);
      })
      .catch(() => { /* keep the local initial */ });
    return () => {
      active = false;
      if (objectUrl && URL.revokeObjectURL) URL.revokeObjectURL(objectUrl);
    };
  }, [createObjectUrl, loadIcon, url]);

  return <span className="bookmark-icon" style={{ backgroundColor: iconColor(hostname) }}>
    {source ? <img src={source} alt={`${title.trim()} 图标`} onError={() => setSource(undefined)} /> : <b aria-hidden="true">{initial}</b>}
  </span>;
}
