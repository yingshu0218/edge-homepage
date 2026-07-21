import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TimeDrawer } from './TimeDrawer';
import { useLocalClock } from './useLocalClock';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const fixedTime = new Date(2026, 6, 21, 13, 5, 7);

function ClockProbe({ showSeconds, now }: { showSeconds: boolean; now: () => number }) {
  const currentTime = useLocalClock(showSeconds, now);
  return <output>{currentTime.getTime()}</output>;
}

describe('TimeDrawer', () => {
  it('renders the supplied fixed local time', () => {
    render(
      <TimeDrawer
        clockHour12={false}
        clockShowSeconds={true}
        clockShowFullDate={true}
        currentTime={fixedTime}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('13:05:07')).toBeInTheDocument();
    expect(screen.getByText('2026年7月21日 星期二')).toBeInTheDocument();
  });

  it.each([
    ['12 小时制', { clockHour12: true }],
    ['显示秒', { clockShowSeconds: true }],
    ['显示完整日期与星期', { clockShowFullDate: true }],
  ] as const)('emits only %s when that setting is enabled', (label, expected) => {
    const onChange = vi.fn();
    render(
      <TimeDrawer
        clockHour12={false}
        clockShowSeconds={false}
        clockShowFullDate={false}
        currentTime={fixedTime}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: label }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(expected);
  });
});

describe('useLocalClock', () => {
  it('updates on the next minute boundary when seconds are hidden', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 21, 9, 5, 10, 250));
    render(<ClockProbe showSeconds={false} now={Date.now} />);

    act(() => vi.advanceTimersByTime(49_749));
    expect(screen.getByRole('status')).toHaveTextContent(String(new Date(2026, 6, 21, 9, 5, 10, 250).getTime()));
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toHaveTextContent(String(new Date(2026, 6, 21, 9, 6).getTime()));
  });

  it('updates on the next second boundary when seconds are shown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 21, 9, 5, 0, 250));
    render(<ClockProbe showSeconds now={Date.now} />);

    expect(screen.getByRole('status')).toHaveTextContent(String(Date.now()));
    act(() => vi.advanceTimersByTime(749));
    expect(screen.getByRole('status')).toHaveTextContent(String(new Date(2026, 6, 21, 9, 5, 0, 250).getTime()));
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status')).toHaveTextContent(String(new Date(2026, 6, 21, 9, 5, 1).getTime()));
  });

  it('pauses while hidden and corrects immediately when visible again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 21, 9, 5, 0, 250));
    const visibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    render(<ClockProbe showSeconds now={Date.now} />);

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(750);
    });
    expect(screen.getByRole('status')).toHaveTextContent(String(new Date(2026, 6, 21, 9, 5, 0, 250).getTime()));

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('status')).toHaveTextContent(String(new Date(2026, 6, 21, 9, 5, 1).getTime()));

    if (visibilityState) Object.defineProperty(document, 'visibilityState', visibilityState);
  });
});
