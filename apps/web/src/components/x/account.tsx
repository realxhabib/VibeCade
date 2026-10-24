"use client";

import { ArrowUpRight, Inbox } from "lucide-react";
import Link from "next/link";
import { useInbox } from "@/components/chrome/use-inbox";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { XLogo } from "@/components/ui/x-logo";
import { isSupabaseConfigured } from "@/lib/env";
import { useMounted } from "@/lib/use-mounted";
import { xChallengesPath, xProfilePath } from "@/lib/x-player";
import { useBackend, useViewer } from "@/platform/client";
import { useXSignIn } from "./use-x-sign-in";

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

/**
 * The header's account corner. Signed in: your challenges (with a count of the
 * ones waiting on you) and your profile. Signed out: (with `signIn`) the sign-in button.
 */
export function XAccount({ signIn = true }: { signIn?: boolean }) {
  const mounted = useMounted();
  const forReal = usePlaysForReal();
  const { viewer } = useViewer();
  const { count } = useInbox();
  if (!mounted) return null;
  if (forReal && viewer) {
    return (
      <div className="flex items-center gap-1">
        <Link
          href={xChallengesPath()}
          aria-label={count ? `Challenges: ${count} waiting on you` : "Challenges"}
          className="relative rounded-full p-2 text-ink-200 hover:bg-white/[0.06] hover:text-ink-50"
        >
          <Inbox className="size-[18px]" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[#ff5ca8] px-1 text-[10px] font-bold leading-4 text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Link>
        <Link href={xProfilePath()} aria-label="Your profile" className="flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 hover:bg-white/[0.06]">
          <Avatar person={viewer} size={26} />
          <span className="max-w-[8rem] truncate text-[13px] font-semibold text-ink-100">@{viewer.handle}</span>
        </Link>
      </div>
    );
  }
  if (!isSupabaseConfigured || forReal || !signIn) return null;
  return <XSignInButton size="sm" />;
}
