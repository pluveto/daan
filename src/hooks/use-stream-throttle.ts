import { useEffect, useRef, useState } from 'react';

/**
 * Throttles updates for streaming text to reduce render frequency.
 * When streaming, updates propagate at most once per interval.
 * When streaming stops, the latest value is shown immediately.
 */
export function useStreamThrottle(
  value: string,
  isStreaming = false,
  interval = 70,
): string {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastRan = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isStreaming || !value) {
      setThrottledValue(value);
      return;
    }

    const now = Date.now();
    const timeSinceLastRun = now - lastRan.current;

    if (timeSinceLastRun >= interval) {
      setThrottledValue(value);
      lastRan.current = now;
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastRan.current = Date.now();
      }, interval - timeSinceLastRun);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, isStreaming, interval]);

  return throttledValue;
}
