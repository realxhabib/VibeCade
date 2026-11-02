"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Bot, Clock3, Swords, Users, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/chrome/toasts";
import { AppArt } from "@/components/marketplace/app-art";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { ChallengeSheet } from "@/components/marketplace/challenge-sheet";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { goToHost } from "@/lib/host-nav";
import { spring } from "@/lib/motion";
import { cn, formatCompact } from "@/lib/utils";
import { useResolveViewer } from "@/platform/client";
import { usePractice } from "@/platform/queries";
import type { AppManifest, Match, Profile } from "@/platform/types";
import { SITE_ROUTES, useHostRoutes } from "./host-routes";
import { seatedPlayers, tableSizeLabel } from "./match-view";

type EndedStatus = "declined" | "cancelled" | "expired";

const STATUS: Record<EndedStatus, { emoji: string; label: string; title: string }> = {
  expired: { emoji: "⌛", label: "Expired", title: "The clock ran out" },
  declined: { emoji: "🙅", label: "Declined", title: "Challenge declined" },
  cancelled: { emoji: "🚫", label: "Cancelled", title: "Challenge called off" },
};

function blurb(status: EndedStatus, rival: Profile | null, viewerIsChallenger: boolean): string {
  const them = rival ? `@${rival.handle}` : "Everyone";
  if (status === "declined") return rival ? `${them} passed on this one. Run it back, or warm up first.` : "Not this time. Run it back, or warm up first.";
  if (status === "cancelled") return "This round never got going. The game's still right here.";
  if (viewerIsChallenger) return `${them} didn't show up in time. Send a fresh challenge and make them answer.`;
  return "This one timed out before it started. The board's still warm though.";
}

/**
 * A challenge that never got played (expired, declined or cancelled): instead of a dead end,
 * show the game it was on and a way straight back in.
 */
export function ChallengeEnded({ app, match, viewer }: { app: AppManifest; match: Match; viewer: Profile | null }) {
  const router = useRouter();
  const routes = useHostRoutes();
  const reduced = useReducedMotion();
  const resolveViewer = useResolveViewer();
  const practice = usePractice();
  const [sheet, setSheet] = useState(false);

  const status = (match.status as EndedStatus) in STATUS ? (match.status as EndedStatus) : "expired";
  const meta = STATUS[status];
  const seats = seatedPlayers(match);
  const iPlayed = !!viewer && seats.some((p) => p.userId === viewer.id);
  const rivals = seats.filter((p) => !p.isBot && p.userId !== viewer?.id);
  // 1v1 against one person: the challenge sheet opens with them already picked.
  const rival = iPlayed && rivals.length === 1 && match.maxPlayers <= 2 ? rivals[0].profile : null;
  // The challenge sheet lands on the site's match page, so only offer it on the site (not inside the X player).
  const onSite = !routes.guest && routes.challenges === SITE_ROUTES.challenges;
  const canChallenge = onSite && app.modes.some((m) => m !== "practice");
  const canPractice = !routes.guest && app.modes.includes("practice");
  const appHref = routes.app(app.slug);
  const needSignIn = () => router.push(`/login?next=${encodeURIComponent(routes.match(match.id))}`);

  const challenge = async () => ((viewer ?? (await resolveViewer())) ? setSheet(true) : needSignIn());
  const warmUp = async () => {
    if (!(viewer ?? (await resolveViewer()))) return needSignIn();
    try {
      const next = await practice.mutateAsync({ appSlug: app.slug, players: match.maxPlayers > 2 ? match.maxPlayers : undefined, versionId: match.versionId });
      goToHost(router, routes.match(next.id));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Couldn't start a match", { tone: "danger" });
    }
  };

  const facts = [
    { icon: <Users className="size-3.5" />, text: tableSizeLabel(app) },
    { icon: <Clock3 className="size-3.5" />, text: app.durationLabel },
    ...(app.playCount > 0 ? [{ icon: <Zap className="size-3.5" />, text: `${formatCompact(app.playCount)} matches played` }] : []),
  ];

  return (
    <motion.div
      className="mx-auto w-full max-w-xl px-4 pb-16 pt-6"
      initial={reduced ? false : { opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.soft}
      style={{ "--accent-from": app.accent[0], "--accent-to": app.accent[1] } as React.CSSProperties}
    >
      <div
        className="relative overflow-hidden rounded-[2.2rem] p-[1.5px] shadow-2xl"
        style={{ background: `linear-gradient(140deg, ${app.accent[0]}, transparent 45%, ${app.accent[1]})` }}
      >
        <div className="relative overflow-hidden rounded-[2.1rem] bg-ink-900/95">
          {/* The game's art, with the challenge's fate stamped on it. */}
          <div className="relative h-44 sm:h-56">
            <AppArt app={app} className={cn("absolute inset-0", !app.coverImage && "scale-110")} />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-ink-900/20 to-ink-900" />
            <motion.span
              className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-950/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink-100 backdrop-blur"
              initial={reduced ? false : { opacity: 0, scale: 0.6, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ delay: 0.35, ...spring.wobbly }}
            >
              <motion.span
                aria-hidden
                className="inline-block"
                animate={reduced || status !== "expired" ? undefined : { rotate: [0, 0, 180, 180] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", times: [0, 0.6, 0.8, 1] }}
              >
                {meta.emoji}
              </motion.span>
              {meta.label}
            </motion.span>
          </div>

          <div className="relative -mt-12 px-6 pb-7 sm:px-8">
            <div className="flex items-end gap-4">
              <motion.div
                initial={reduced ? false : { y: 20, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, ...spring.bouncy }}
                className="rounded-[1.4rem] ring-4 ring-ink-900"
              >
                <AppGlyph app={app} size={76} />
              </motion.div>
              <div className="min-w-0 pb-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">{meta.title}</p>
                <h1 className="truncate font-display text-3xl font-extrabold leading-tight">{app.name}</h1>
              </div>
            </div>

            <p className="mt-4 text-base font-medium text-ink-100">{app.tagline}</p>
            {app.description && <p className="mt-2 line-clamp-3 text-sm text-ink-300">{app.description}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {facts.map((f, i) => (
                <motion.span
                  key={f.text}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-ink-200"
                  initial={reduced ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.05, ...spring.soft }}
                >
                  {f.icon}
                  {f.text}
                </motion.span>
              ))}
            </div>

            {seats.length > 0 && (
              <div className="mt-6 flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3">
                <div className="flex -space-x-2">
                  {seats.slice(0, 5).map((p) => (
                    <span key={p.userId} className={cn("rounded-full ring-2 ring-ink-900", p.state === "invited" || p.state === "declined" ? "opacity-50 grayscale" : "")}>
                      <Avatar person={{ ...p.profile, isBot: p.isBot }} size={36} />
                    </span>
                  ))}
                </div>
                <p className="min-w-0 text-sm text-ink-300">{blurb(status, rival ?? rivals[0]?.profile ?? null, viewer?.id === match.createdBy)}</p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {canChallenge ? (
                <Button size="lg" variant="accent" magnetic icon={<Swords className="size-4" />} onClick={() => void challenge()}>
                  {rival ? `Challenge @${rival.handle} again` : "Send a new challenge"}
                </Button>
              ) : (
                <Button size="lg" variant="accent" magnetic href={appHref} iconRight={<ArrowRight className="size-4" />}>
                  Play {app.name}
                </Button>
              )}
              {canPractice && (
                <Button size="lg" variant="glass" icon={<Bot className="size-4" />} loading={practice.isPending} onClick={() => void warmUp()}>
                  Practice now
                </Button>
              )}
              {canChallenge && (
                <Button size="lg" variant="ghost" href={appHref} iconRight={<ArrowRight className="size-4" />}>
                  Game page
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      {canChallenge && <ChallengeSheet app={app} open={sheet} onClose={() => setSheet(false)} initialOpponent={rival ?? undefined} />}
    </motion.div>
  );
}
