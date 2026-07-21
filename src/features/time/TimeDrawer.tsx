import type { AppSettings } from '../../domain/models';
import { formatClock, formatLocalDate } from './timeFormat';

type ClockSettingsChange = Partial<Pick<AppSettings, 'clockHour12' | 'clockShowSeconds' | 'clockShowFullDate'>>;

export type TimeDrawerProps = {
  clockHour12: boolean;
  clockShowSeconds: boolean;
  clockShowFullDate: boolean;
  currentTime: Date;
  onChange: (changes: ClockSettingsChange) => void;
};

export function TimeDrawer({
  clockHour12,
  clockShowSeconds,
  clockShowFullDate,
  currentTime,
  onChange,
}: TimeDrawerProps) {
  return (
    <section aria-label="时间设置">
      <p>设备本地时间</p>
      <time dateTime={currentTime.toISOString()}>{formatClock(currentTime, { hour12: clockHour12, showSeconds: clockShowSeconds })}</time>
      {clockShowFullDate && <p>{formatLocalDate(currentTime)}</p>}
      <label><input type="checkbox" checked={clockHour12} onChange={(event) => onChange({ clockHour12: event.target.checked })} />12 小时制</label>
      <label><input type="checkbox" checked={clockShowSeconds} onChange={(event) => onChange({ clockShowSeconds: event.target.checked })} />显示秒</label>
      <label><input type="checkbox" checked={clockShowFullDate} onChange={(event) => onChange({ clockShowFullDate: event.target.checked })} />显示完整日期与星期</label>
    </section>
  );
}
