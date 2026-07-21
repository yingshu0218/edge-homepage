import { useEffect, useRef, useState } from 'react';

export function useLocalClock(showSeconds: boolean, now: () => number = Date.now): Date {
  const nowRef = useRef(now);
  nowRef.current = now;
  const [currentTime, setCurrentTime] = useState(() => new Date(nowRef.current()));

  useEffect(() => {
    const interval = showSeconds ? 1_000 : 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const update = () => setCurrentTime(new Date(nowRef.current()));
    const schedule = () => {
      if (document.visibilityState === 'hidden') return;
      const current = nowRef.current();
      timer = setTimeout(() => {
        update();
        schedule();
      }, interval - (current % interval));
    };

    const handleVisibilityChange = () => {
      clearTimer();
      if (document.visibilityState === 'hidden') return;
      update();
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showSeconds]);

  return currentTime;
}
