/**
 * hooks/use-visible-interval.ts — battery-friendly setInterval.
 *
 * Runs the callback on an interval ONLY when the document is visible.
 * When the user switches to another tab or minimizes the browser, the
 * interval pauses automatically — saving battery on mobile. When the
 * tab becomes visible again, the interval resumes.
 *
 * This is the #1 mobile battery optimization: intervals that run in a
 * background tab keep the CPU awake, drain the battery, and do no useful
 * work (the user can't see the updates anyway).
 *
 * Usage:
 *   useVisibleInterval(() => { ... }, 60_000);
 *
 * The callback runs once immediately on mount (when visible) so the
 * caller doesn't need a separate "check now" call.
 */
import { useEffect, useRef } from "react";

export function useVisibleInterval(callback: () => void, delayMs: number): void {
  const savedCallback = useRef(callback);

  // Remember the latest callback.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs <= 0) return undefined;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (intervalId !== null) return; // already running
      // Run once immediately on (re)start so the caller doesn't have to
      // wait a full interval for the first check after the tab regains
      // visibility.
      savedCallback.current();
      intervalId = setInterval(() => savedCallback.current(), delayMs);
    };

    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    // Start if currently visible, pause if hidden.
    if (!document.hidden) {
      start();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [delayMs]);
}
