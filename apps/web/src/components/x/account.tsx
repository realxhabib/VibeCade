"use client";

import { ArrowUpRight, LogOut } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { XLogo } from "@/components/ui/x-logo";
import { isSupabaseConfigured } from "@/lib/env";
import { useMounted } from "@/lib/use-mounted";
import { useBackend, useViewer } from "@/platform/client";
import { signOutXPlayer, useXSignIn } from "./use-x-sign-in";

/** True when the card plays real matches: signed in, or a demo deployment (its personas are local). */
export function usePlaysForReal(): boolean {
  return useBackend().kind === "supabase" || !isSupabaseConfigured;
}

/** "Sign in with X" for the card, with its waiting and popup-blocked states. */
export function XSignInButton({ label = "Sign in with X", size = "md", className }: { label?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const { state, code, start, cancel } = useXSignIn();
  if (state === "blocked") {
    return (
      <Button size={size} variant="glass" href="/login" target="_blank" rel="noopener" iconRight={<ArrowUpRight className="size-4" />} className={className}>
        Popup blocked: sign in on VibeCade
      </Button>
    );
  }
  if (state === "waiting") {
    return (
      <Button size={size} variant="glass" loading onClick={cancel} className={className} aria-label="Finish signing in in the popup (click to cancel)">
        Finish in the popup{code ? ` · code ${code}` : ""}
      </Button>
    );
  }
  return (
    <Button size={size} variant="primary" icon={<XLogo className="size-4" />} onClick={start} className={className}>
      {label}
    </Button>
  );
}

/** The header's account corner: who's signed in (and sign out), or (with `signIn`) the sign-in button. */
export function XAccount({ signIn = true }: { signIn?: boolean }) {
  const mounted = useMounted();
  const backend = useBackend();
  const { viewer } = useViewer();
  if (!mounted || !isSupabaseConfigured) return null;
  if (backend.kind === "supabase" && viewer) {
    return (
      <div className="flex items-center gap-1.5">
        <Avatar person={viewer} size={26} />
        <span className="max-w-[9rem] truncate text-[13px] font-semibold text-ink-100">@{viewer.handle}</span>
        <button
          type="button"
          onClick={() => void signOutXPlayer()}
          aria-label="Sign out"
          className="rounded-full p-1.5 text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    );
  }
  if (backend.kind === "supabase" || !signIn) return null;
  return <XSignInButton size="sm" />;
}
