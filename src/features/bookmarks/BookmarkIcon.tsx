import { useState } from 'react';

const ICON_COLORS = ['#5b8def', '#8b6fe8', '#df6b8b', '#e28a45', '#3ba58c', '#4b9bc2', '#9a7b55'];

export function faviconUrl(url: string): string | undefined {
  try { return `${new URL(url).origin}/favicon.ico`; }
  catch { return undefined; }
}

export function iconColor(seed: string): string {
  let hash = 0;
  for (const character of seed) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length]!;
}

export function BookmarkIcon({ title, url }: { title: string; url: string }) {
  const source = faviconUrl(url);
  const [failed, setFailed] = useState(false);
  let hostname = title;
  try { hostname = new URL(url).hostname; } catch { /* use title */ }
  const initial = title.trim().charAt(0).toLocaleUpperCase() || '?';
  return <span className="bookmark-icon" style={{ backgroundColor: iconColor(hostname) }}>
    {source && !failed ? <img src={source} alt={`${title.trim()} 图标`} onError={() => setFailed(true)} /> : <b aria-hidden="true">{initial}</b>}
  </span>;
}
