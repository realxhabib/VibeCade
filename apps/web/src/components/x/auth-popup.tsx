"use client";

import { useEffect, useState } from "react";
import { LogoMark } from "@/components/chrome/logo";
import { Spinner } from "@/components/ui/spinner";
import { isSupabaseConfigured } from "@/lib/env";
import { resolveXProvider } from "@/platform/supabase/supabase-backend";
import {
  POPUP_NONCE_KEY,
  clearPopupSession,
  confirmCode,
  forgetSameTabSignIn,
  getPopupSupabase,
  getXPlayerSupabase,
  nonceFromHash,
  openedByOurSite,
  sameTabSignIn,
} from "@/platform/x-session";

type Status =
  | { kind: "working"; text: string }
  | { kind: "confirm"; code: string; onContinue: () => void }
  | { kind: "done" }
  | { kind: "error"; text: string };

function PopupFrame({ status }: { status: Status }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark size={44} />
      {status.kind === "working" && (
        <p className="flex items-center gap-2 text-ink-200">
          <Spinner className="size-4" /> {status.text}
        </p>
      )}
      {status.kind === "confirm" && (
        <>
          <p className="font-display text-xl font-extrabold text-ink-50">Sign in to the post showing</p>
          <p className="rounded-2xl bg-white/10 px-5 py-2 font-mono text-3xl font-bold tracking-[0.3em] text-ink-50">{status.code}</p>
          <p className="max-w-xs text-sm text-ink-300">Only continue if the VibeCade post you&apos;re playing shows this code. If you didn&apos;t start this, close the window.</p>
          <div className="flex gap-2">
            <button type="button" onClick={closeOrBack} className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-ink-50">
              Close
            </button>
            <button type="button" onClick={status.onContinue} className="rounded-full bg-ink-50 px-5 py-2 text-sm font-semibold text-ink-950">
              It matches, continue
            </button>
          </div>
        </>
      )}
      {status.kind === "done" && (
        <>
          <p className="font-display text-xl font-extrabold text-ink-50">You&apos;re signed in</p>
          <p className="text-sm text-ink-300">Head back to the post. This window closes on its own.</p>
        </>
      )}
      {status.kind === "error" && (
        <>
          <p className="font-display text-xl font-extrabold text-ink-50">Sign-in didn&apos;t work</p>
          <p className="max-w-xs text-sm text-ink-300">{status.text}</p>
          <button type="button" onClick={closeOrBack} className="rounded-full bg-ink-50 px-5 py-2 text-sm font-semibold text-ink-950">
            Close
          </button>
        </>
      )}
    </main>
  );
}

/** Closes the popup, or (signing in in the card's own tab, or opened from a link) goes back to the games. */
function closeOrBack(): void {
  if (window.opener) window.close();
  else window.location.assign(new URL("/x/play", window.location.href));
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Close this window and try again.";
}

/**
 * `/x/auth#n=<code>`: opened by the card; remembers the code and goes to X to
 * sign in. Opened any other way (a link someone sent, another site), it first
 * asks the person to match the card's short code: see `confirmCode`.
 */
export function XAuthStart() {
  const [status, setStatus] = useState<Status>({ kind: "working", text: "Opening X…" });
  useEffect(() => {
    const fail = (error: unknown) => setStatus({ kind: "error", text: message(error) });
    const goToX = async () => {
      setStatus({ kind: "working", text: "Opening X…" });
      const provider = await resolveXProvider();
      const { error } = await getPopupSupabase().auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/x/auth/callback` } });
      if (error) throw error;
    };
    void (async () => {
      const nonce = nonceFromHash(window.location.hash);
      // Drop the code from the address bar (and history) right away.
      window.history.replaceState(null, "", window.location.pathname);
      if (!isSupabaseConfigured) throw new Error("Sign in with X isn't set up on this site.");
      if (!nonce) throw new Error("This sign-in link is broken. Start again from the post.");
      try {
        window.sessionStorage.setItem(POPUP_NONCE_KEY, nonce);
      } catch {
        throw new Error("Your browser blocked this window's storage, so sign-in can't finish.");
      }
      // Opened by our card (desktop popup), or started by this same tab (the card as a whole page).
      if (openedByOurSite() || sameTabSignIn(nonce)) return goToX();
      setStatus({ kind: "confirm", code: confirmCode(nonce), onContinue: () => void goToX().catch(fail) });
    })().catch(fail);
  }, []);
  return <PopupFrame status={status} />;
}

/** `/x/auth/callback`: back from X. Finishes the sign-in and parks the session for the card. */
export function XAuthCallback() {
  const [status, setStatus] = useState<Status>({ kind: "working", text: "Signing you in…" });
  useEffect(() => {
    const fail = (text: string) => setStatus({ kind: "error", text });
    void (async () => {
      const params = new URLSearchParams(window.location.search);
      window.history.replaceState(null, "", window.location.pathname);
      const denied = params.get("error_description") ?? params.get("error");
      if (denied) throw new Error(denied);
      const code = params.get("code");
      let nonce: string | null = null;
      try {
        nonce = window.sessionStorage.getItem(POPUP_NONCE_KEY);
      } catch {
        // Handled below.
      }
      if (!code || !nonce) throw new Error("This sign-in expired. Start again from the post.");
      const sb = getPopupSupabase();
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      if (error) throw error;
      const session = data.session;
      // Started in this tab (the card as a whole page): adopt the session and go back to the card.
      const sameTab = sameTabSignIn(nonce);
      if (sameTab) {
        const { error: adoptError } = await getXPlayerSupabase().auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
        if (adoptError) throw adoptError;
        clearPopupSession();
        forgetSameTabSignIn();
        window.location.replace(sameTab.back);
        return;
      }
      const { error: parkError } = await sb.rpc("put_x_auth_handoff", {
        p_nonce: nonce,
        p_access_token: session.access_token,
        p_refresh_token: session.refresh_token,
      });
      if (parkError) throw parkError;
      clearPopupSession();
      setStatus({ kind: "done" });
      setTimeout(() => window.close(), 1200);
    })().catch((error: unknown) => {
      clearPopupSession();
      forgetSameTabSignIn();
      fail(message(error));
    });
  }, []);
  return <PopupFrame status={status} />;
}
