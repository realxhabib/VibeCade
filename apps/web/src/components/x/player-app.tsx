"use client";

import { ArrowLeft, ArrowUpRight, Bot, Clock, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/chrome/toasts";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { Button } from "@/components/ui/button";
import { goToHost } from "@/lib/host-nav";
import { playsInPost, xPlayerPath } from "@/lib/x-player";
import { usePractice } from "@/platform/queries";
import type { AppManifest } from "@/platform/types";

/**
 * `/x/play/<slug>`: one app inside the post. Games start a practice match
 * against the bots on this device; challenging people (and apps that aren't
 * games) open the full site in a new tab, where they can sign in with X.
 */
export function XPlayerApp({ app }: { app: AppManifest }) {
  const router = useRouter();
  const practice = usePractice();
  const inPost = playsInPost(app);
  const players = app.players.min === app.players.max ? `${app.players.min} players` : `${app.players.min}–${app.players.max} players`;

  const start = async () => {
    try {
      const match = await practice.mutateAsync(app.slug);
      goToHost(router, `${xPlayerPath()}/match/${match.id}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't start the game", { tone: "danger" });
    }
  };

  return (
    <main
      className="relative mx-auto flex min-h-dvh max-w-[480px] flex-col px-4 pb-4"
      style={{ background: `radial-gradient(circle at 80% 0%, ${app.accent[0]}40 0%, transparent 55%), radial-gradient(circle at 0% 100%, ${app.accent[1]}33 0%, transparent 50%)` }}
    >
      <header className="flex h-12 shrink-0 items-center justify-between">
        <Link href={xPlayerPath()} className="-ml-2 flex items-center gap-1 rounded-full px-2 py-1.5 text-[13px] font-semibold text-ink-200 hover:bg-white/[0.06] hover:text-ink-50">
          <ArrowLeft className="size-4" /> All games
        </Link>
        <a
          href={`/apps/${app.slug}`}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-200 hover:bg-white/[0.06] hover:text-ink-50"
        >
          Open XApps <ArrowUpRight className="size-3.5" />
        </a>
      </header>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <div className="flex items-center gap-4">
          <AppGlyph app={app} size={64} />
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
          <ol className="space-y-1.5 text-[13px] leading-snug text-ink-200">
            {app.howTo.slice(0, 3).map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-ink-50">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-3">
        {inPost ? (
          <Button size="lg" variant="accent" icon={<Bot className="size-5" />} loading={practice.isPending} onClick={start}>
            Play vs bots
          </Button>
        ) : (
          <Button size="lg" variant="accent" href={`/apps/${app.slug}`} target="_blank" rel="noopener" iconRight={<ArrowUpRight className="size-4" />}>
            Open {app.name}
          </Button>
        )}
        {inPost && app.modes.some((mode) => mode !== "practice") && (
          <Button size="md" variant="glass" href={`/apps/${app.slug}`} target="_blank" rel="noopener" iconRight={<ArrowUpRight className="size-4" />}>
            Challenge someone on X
          </Button>
        )}
      </div>
    </main>
  );
}
