export type ClockFormatOptions = {
  hour12: boolean;
  showSeconds: boolean;
};

const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatClock(date: Date, { hour12, showSeconds }: ClockFormatOptions): string {
  const minutes = pad(date.getMinutes());
  const seconds = showSeconds ? `:${pad(date.getSeconds())}` : '';

  if (!hour12) return `${pad(date.getHours())}:${minutes}${seconds}`;

  const hours = date.getHours();
  const period = hours < 12 ? '上午' : '下午';
  const displayHour = hours % 12 || 12;
  return `${period} ${displayHour}:${minutes}${seconds}`;
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
}
