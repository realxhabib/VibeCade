"use client";

import { ArrowLeft, ArrowUpRight, AtSign, Bot, Clock, Megaphone, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/chrome/toasts";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { Button } from "@/components/ui/button";
import { goToHost } from "@/lib/host-nav";
import { useMounted } from "@/lib/use-mounted";
import { playsInPost, xMatchPlayerPath, xPlayerPath } from "@/lib/x-player";
import { useCreateChallenge, usePractice, useQuickMatch } from "@/platform/queries";
import type { AppManifest, Match } from "@/platform/types";
import { XAccount, XSignInButton, usePlaysForReal } from "./account";

/** Games people can challenge each other to from the card (apps with their own setup screen need the site). */
export function challengeableInPost(app: AppManifest): boolean {
  return playsInPost(app) && !app.setup && app.modes.some((mode) => mode === "live" || mode === "async");
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * `/x/play/<slug>`: one app inside the post. Anyone can play the bots (guests
 * on this device). Signed in through the card's popup, people also quick-match,
 * post an open challenge (its link is a playable post) or challenge an @handle,
 * all without leaving the post. Apps that aren't games open the full site.
 */
export function XPlayerApp({ app }: { app: AppManifest }) {
  const router = useRouter();
  const mounted = useMounted();
  const forReal = usePlaysForReal();
  const practice = usePractice();
  const quick = useQuickMatch();
  const challenge = useCreateChallenge();
  const [handleOpen, setHandleOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const inPost = playsInPost(app);
  const canChallenge = mounted && challengeableInPost(app);
  const mode = app.modes.includes("live") ? "live" : "async";
  const players = app.players.min === app.players.max ? `${app.players.min} players` : `${app.players.min}–${app.players.max} players`;
  const busy = practice.isPending || quick.isPending || challenge.isPending;

  const go = async (start: () => Promise<Match>, fallback: string) => {
    try {
      const match = await start();
      goToHost(router, xMatchPlayerPath(match.id));
    } catch (error) {
      toast(errorText(error, fallback), { tone: "danger" });
    }
  };

  return (
    <main
      className="relative mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pb-4"
      style={{ background: `radial-gradient(circle at 80% 0%, ${app.accent[0]}40 0%, transparent 55%), radial-gradient(circle at 0% 100%, ${app.accent[1]}33 0%, transparent 50%)` }}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-2">
        <Link href={xPlayerPath()} className="-ml-2 flex items-center gap-1 rounded-full px-2 py-1.5 text-[13px] font-semibold text-ink-200 hover:bg-white/[0.06] hover:text-ink-50">
          <ArrowLeft className="size-4" /> All games
        </Link>
        {/* Signed out, the sign-in button sits with the actions below. */}
        <XAccount signIn={!challengeableInPost(app)} />
      </header>

      <div className="flex flex-1 flex-col justify-center gap-3">
        <div className="flex items-center gap-4">
          <AppGlyph app={app} size={60} />
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink-50">{app.name}</h1>
            <p className="text-sm text-ink-200">{app.tagline}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[12px] text-ink-300">
          <span className="flex items-center gap-1 rounded-full glass px-2.5 py-1">
            <Clock className="size-3.5" /> {app.durationLabel}
          </span>
          {inPost && (
            <span className="flex items-center gap-1 rounded-full glass px-2.5 py-1">
              <Users className="size-3.5" /> {players}
            </span>
          )}
        </div>
        {app.howTo.length > 0 && (
          <ol className="space-y-1 text-[13px] leading-snug text-ink-200">
            {app.howTo.slice(0, forReal && canChallenge ? 2 : 3).map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-ink-50">{i + 1}</span>
                <span className="line-clamp-2">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Hidden until the card knows whether it's signed in, so the buttons don't shift under a tap. */}
      <div className={`flex flex-col gap-2 pt-3 ${mounted ? "" : "invisible"}`}>
        {!inPost ? (
          <Button size="lg" variant="accent" href={`/apps/${app.slug}`} target="_blank" rel="noopener" iconRight={<ArrowUpRight className="size-4" />}>
            Open {app.name}
          </Button>
        ) : canChallenge && forReal ? (
          <>
            <Button
              size="lg"
              variant="accent"
              icon={<Megaphone className="size-5" />}
              loading={challenge.isPending && !handleOpen}
              disabled={busy}
              onClick={() => void go(() => challenge.mutateAsync({ appSlug: app.slug, mode }), "Couldn't create the challenge")}
            >
              Post a challenge
            </Button>
            {handleOpen ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const who = handle.trim().replace(/^@/, "");
                  if (!who) return;
                  void go(() => challenge.mutateAsync({ appSlug: app.slug, mode, opponentHandle: who }), "Couldn't send the challenge");
                }}
              >
                <label className="flex h-10 min-w-0 flex-1 items-center gap-1 rounded-full glass px-3">
                  <AtSign className="size-4 shrink-0 text-ink-400" />
                  <input
                    autoFocus
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="handle"
                    aria-label="X handle to challenge"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-base text-ink-50 outline-none placeholder:text-ink-500"
                  />
                </label>
                <Button type="submit" size="md" variant="primary" loading={challenge.isPending} disabled={busy || !handle.trim()}>
                  Challenge
                </Button>
              </form>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Button size="md" variant="glass" icon={<Zap className="size-4" />} loading={quick.isPending} disabled={busy} onClick={() => void go(() => quick.mutateAsync(app.slug), "Couldn't find a match")}>
                  Quick match
                </Button>
                <Button size="md" variant="glass" icon={<AtSign className="size-4" />} disabled={busy} onClick={() => setHandleOpen(true)}>
                  Friend
                </Button>
                <Button size="md" variant="glass" icon={<Bot className="size-4" />} loading={practice.isPending} disabled={busy} onClick={() => void go(() => practice.mutateAsync(app.slug), "Couldn't start the game")}>
                  Bots
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <Button size="lg" variant="accent" icon={<Bot className="size-5" />} loading={practice.isPending} onClick={() => void go(() => practice.mutateAsync(app.slug), "Couldn't start the game")}>
              Play vs bots
            </Button>
            {canChallenge ? (
              <XSignInButton label="Sign in with X to challenge people" />
            ) : (
              mounted &&
              app.modes.some((m) => m !== "practice") && (
                <Button size="md" variant="glass" href={`/apps/${app.slug}`} target="_blank" rel="noopener" iconRight={<ArrowUpRight className="size-4" />}>
                  Challenge someone on VibeCade
                </Button>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
