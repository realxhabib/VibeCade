"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import {
  HANDOFF_POLL_MS,
  HANDOFF_TTL_MS,
  X_PLAYER_STORAGE_KEY,
  claimHandoff,
  confirmCode,
  getXPlayerSupabase,
  isFramed,
  newNonce,
  rememberSameTabSignIn,
} from "@/platform/x-session";

export type XSignInState = "idle" | "waiting" | "blocked";

/**
 * Sign in with X from inside the post: opens the popup with a fresh code, waits
 * for the session it parks (see platform/x-session.ts), adopts it and reloads
 * the card so it runs signed in. When the card is the whole page (the X phone
 * apps), it signs in with a redirect in the same tab instead. Call `start` from
 * a click (popups need one).
 */
export function useXSignIn() {
  const [state, setState] = useState<XSignInState>("idle");
  /** The short code the popup may ask the person to match. */
  const [code, setCode] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    stop();
    const nonce = newNonce();
    // The whole page (the X phone apps' browser): sign in with a redirect in this tab and come back.
    if (!isFramed()) {
      try {
        rememberSameTabSignIn({ nonce, back: `${window.location.pathname}${window.location.search}` });
        setState("waiting");
        window.location.assign(new URL(`/x/auth#n=${nonce}`, window.location.href));
        return;
      } catch {
        // No sessionStorage: fall back to the popup.
      }
    }
    // Not "noopener": that always returns null, and null is how we spot a blocked popup.
    const popup = window.open(`/x/auth#n=${nonce}`, "xapps-sign-in", "popup,width=520,height=720");
    if (!popup) {
      setState("blocked");
      return;
    }
    setState("waiting");
    setCode(confirmCode(nonce));
    const until = Date.now() + HANDOFF_TTL_MS;
    let busy = false;
    timer.current = setInterval(() => {
      if (busy) return;
      if (Date.now() > until) {
        stop();
        setState("idle");
        return;
      }
      busy = true;
      claimHandoff(nonce)
        .then(async (tokens) => {
          if (!tokens) return;
          stop();
          const { error } = await getXPlayerSupabase().auth.setSession(tokens);
          if (error) throw error;
          window.location.reload();
        })
        // A failed check (offline, a blip) just tries again on the next tick.
        .catch((error: unknown) => console.warn("[x-sign-in] check failed", error))
        .finally(() => {
          busy = false;
        });
    }, HANDOFF_POLL_MS);
  }, [stop]);

  const cancel = useCallback(() => {
    stop();
    setState("idle");
  }, [stop]);

  return { available: isSupabaseConfigured, state, code, start, cancel };
}

/** Signs the card out (this card's session only, never the person's other sessions) and reloads it. */
export async function signOutXPlayer(): Promise<void> {
  await getXPlayerSupabase()
    .auth.signOut({ scope: "local" })
    .catch(() => undefined);
  try {
    window.localStorage.removeItem(X_PLAYER_STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  window.location.reload();
}
