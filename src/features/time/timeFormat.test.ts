import { describe, expect, it } from 'vitest';

import { formatClock, formatLocalDate } from './timeFormat';

describe('formatClock', () => {
  it('formats a local date in 24-hour time without seconds by default', () => {
    const date = new Date(2026, 6, 21, 9, 5, 7);

    expect(formatClock(date, { hour12: false, showSeconds: false })).toBe('09:05');
  });

  it('formats seconds when requested', () => {
    const date = new Date(2026, 6, 21, 9, 5, 7);

    expect(formatClock(date, { hour12: false, showSeconds: true })).toBe('09:05:07');
  });

  it('formats local afternoon time in 12-hour time', () => {
    const date = new Date(2026, 6, 21, 13, 5, 7);

    expect(formatClock(date, { hour12: true, showSeconds: false })).toBe('下午 1:05');
  });

  it('treats midnight and noon as 12 in 12-hour time', () => {
    expect(formatClock(new Date(2026, 6, 21, 0, 0, 0), { hour12: true, showSeconds: false })).toBe('上午 12:00');
    expect(formatClock(new Date(2026, 6, 21, 12, 0, 0), { hour12: true, showSeconds: false })).toBe('下午 12:00');
  });
});

describe('formatLocalDate', () => {
  it('formats the complete local Chinese date and weekday', () => {
    const date = new Date(2026, 6, 21, 9, 5, 7);

    expect(formatLocalDate(date)).toBe('2026年7月21日 星期二');
  });
});
