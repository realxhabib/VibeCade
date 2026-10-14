"use client";

import { useXApps } from "@xapps/sdk/react";
import type { PlayerInfo } from "@xapps/sdk";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/** The bot this client must play for (practice / sandbox / demo personas), if any. */
export function useBot(): PlayerInfo | undefined {
  const xapps = useXApps();
  return xapps.opponents.find((p) => p.isBot);
}

/** True when a human opponent is on the other end of the room. */
export function useLiveOpponent(): PlayerInfo | undefined {
  const xapps = useXApps();
  return xapps.match.mode === "live" ? xapps.opponents.find((p) => !p.isBot) : undefined;
}

/**
 * Countdown driven by requestAnimationFrame. Returns remaining milliseconds.
 * `onExpire` fires once when it reaches zero.
 */
export function useCountdown(durationMs: number, running: boolean, onExpire?: () => void): number {
  const [remaining, setRemaining] = useState(durationMs);
  const expireRef = useRef(onExpire);
  useLayoutEffect(() => {
    expireRef.current = onExpire;
  });

  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    let raf = 0;
    let fired = false;
    const tick = (now: number) => {
      const left = Math.max(0, durationMs - (now - start));
      setRemaining(left);
      if (left <= 0) {
        if (!fired) {
          fired = true;
          expireRef.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setRemaining(durationMs);
    };
  }, [durationMs, running]);

  return running ? remaining : durationMs;
}

/** setTimeout that is cleared automatically on unmount. */
export function useTimeouts() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const set = timers.current;
    return () => set.forEach(clearTimeout);
  }, []);
  return useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
}

/** Whether a CSS media query matches (false on the server and before hydration). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
