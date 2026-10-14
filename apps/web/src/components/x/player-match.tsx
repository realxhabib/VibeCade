"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/chrome/logo";
import { PlayRoom } from "@/components/play/play-room";
import { isSupabaseConfigured } from "@/lib/env";
import { useMounted } from "@/lib/use-mounted";
import { xPlayerPath } from "@/lib/x-player";
import { useBackend } from "@/platform/client";
import { isOfflineMatch } from "@/platform/health";
import { XSignInButton } from "./account";

/**
 * `/x/play/match/<id>`: a match inside the post. Practice runs anywhere; a real
 * match (an open challenge someone posted, an invite) needs the card signed in,
 * so a guest gets the sign-in prompt instead.
 */
export function XPlayerMatch({ matchId }: { matchId: string }) {
  const mounted = useMounted();
  const backend = useBackend();
  // The backend is only known in the browser (the card's session lives there).
  if (!mounted) return null;
  if (backend.kind === "demo" && isSupabaseConfigured && !isOfflineMatch(matchId)) return <SignInToPlay />;
  return <PlayRoom matchId={matchId} />;
}

function SignInToPlay() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pb-4">
      <header className="flex h-12 shrink-0 items-center">
        <Link href={xPlayerPath()} className="-ml-2 flex items-center gap-1 rounded-full px-2 py-1.5 text-[13px] font-semibold text-ink-200 hover:bg-white/[0.06] hover:text-ink-50">
          <ArrowLeft className="size-4" /> All games
        </Link>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <LogoMark size={48} />
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-50">You&apos;ve been challenged</h1>
        <p className="max-w-xs text-sm text-ink-300">Sign in with X to take the seat and play right here in the post.</p>
        <XSignInButton size="lg" />
      </div>
    </main>
  );
}
