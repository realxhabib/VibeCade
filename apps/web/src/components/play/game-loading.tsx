"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { Button } from "@/components/ui/button";
import { appImageSrc } from "@/lib/app-images";
import { cn } from "@/lib/utils";
import type { AppManifest } from "@/platform/types";

/** What a loading screen needs to know about the game (any of it may still be missing). */
export type LoadingApp = Pick<AppManifest, "slug" | "name" | "icon" | "accent"> &
  Partial<Pick<AppManifest, "iconImage" | "coverImage" | "tagline">>;

/**
 * Each step owns a slice of the bar: it starts at `from` and creeps toward `to`
 * (never reaching it) until the next step takes over. The game's own loader,
 * where it has one, carries on from there with real progress.
 */
const STEPS = {
  joining: { from: 4, to: 38 },
  opening: { from: 4, to: 38 },
  loading: { from: 42, to: 92 },
} as const;
export type LoadingStep = keyof typeof STEPS;

/** After this long a step offers a way out (slow network, a stuck page). */
const SLOW_AFTER_MS = 12_000;

/**
 * The full loading screen shown from the tap until the game paints: the game's
 * art, name and what's happening, over a progress bar. One look for every
 * stage (route, match, app frame) so the hand-offs read as a single load.
 */
export function GameLoading({
  app,
  step,
  label,
  overlay = false,
  onRetry,
  backHref,
  className,
}: {
  app?: LoadingApp | null;
  step: LoadingStep;
  /** Overrides the step's line ("Joining the match…"). */
  label?: string;
  /** Covers its (positioned) parent instead of the whole screen. */
  overlay?: boolean;
  /** Shown as "Reload" once the step runs long. */
  onRetry?: () => void;
  /** A Back button in the corner (full-screen loaders, which have no top bar). */
  backHref?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  const { from, to } = STEPS[step];
  const [a, b] = app?.accent ?? ["#5b74ff", "#ff5ca8"];
  const cover = appImageSrc(app?.coverImage);
  const line =
    label ?? (step === "joining" ? "Joining the match" : step === "opening" ? (app ? `Opening ${app.name}` : "Opening") : app ? `Loading ${app.name}` : "Loading the game");

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "isolate flex flex-col items-center justify-center overflow-hidden bg-ink-950 px-6 text-center text-ink-50",
        overlay ? "absolute inset-0 z-10" : "relative min-h-dvh",
        className,
      )}
      style={{ "--load-a": a, "--load-b": b } as React.CSSProperties}
    >
      {/* Backdrop: the game's cover art, blurred, under its accent glows. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element -- storage URLs and data URLs, not optimizable
          <img src={cover} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-25 blur-2xl" />
        )}
        <div
          className="absolute -left-1/4 -top-1/3 size-[80vmax] rounded-full opacity-25"
          style={{ background: `radial-gradient(circle, ${a}, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 size-[70vmax] rounded-full opacity-20"
          style={{ background: `radial-gradient(circle, ${b}, transparent 70%)` }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(8_9_14/0.7))]" />
      </div>

      {backHref && (
        <div className="absolute left-3 top-3">
          <Button variant="ghost" size="sm" href={backHref} icon={<ArrowLeft className="size-4" />}>
            Back
          </Button>
        </div>
      )}

      <div className="relative">
        {/* A soft breathing glow behind the icon: alive even when nothing else moves. */}
        <motion.div
          aria-hidden
          className="absolute -inset-8 rounded-full"
          style={{ background: `radial-gradient(circle, ${a}80, ${b}33 45%, transparent 70%)` }}
          animate={reduced ? undefined : { opacity: [0.5, 1, 0.5], scale: [0.92, 1.08, 0.92] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div animate={reduced ? undefined : { scale: [1, 1.05, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
          {app ? (
            <AppGlyph app={app} size={88} />
          ) : (
            <div className="size-[88px] rounded-[26px] bg-[linear-gradient(135deg,var(--load-a),var(--load-b))] opacity-80" />
          )}
        </motion.div>
      </div>

      <p className="mt-7 max-w-xs truncate font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{app?.name ?? "VibeCade"}</p>
      {app?.tagline && <p className="mt-1 line-clamp-2 max-w-xs text-sm text-ink-300">{app.tagline}</p>}

      <div className="mt-6 w-56 max-w-full">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-label={line}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={from}
        >
          <motion.div
            className="relative h-full overflow-hidden rounded-full bg-[linear-gradient(90deg,var(--load-a),var(--load-b))]"
            initial={{ width: `${from}%` }}
            animate={{ width: `${reduced ? (from + to) / 2 : to}%` }}
            transition={reduced ? { duration: 0 } : { duration: 10, ease: [0.1, 0.7, 0.2, 1] }}
          >
            {!reduced && (
              <motion.span
                aria-hidden
                className="absolute inset-y-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.55),transparent)]"
                animate={{ left: ["-50%", "100%"] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </motion.div>
        </div>
        <p className="mt-3 text-sm font-medium text-ink-200">{line}…</p>
      </div>

      <div className="mt-4 flex min-h-9 flex-col items-center gap-2">
        {slow && (
          <motion.div
            className="flex flex-col items-center gap-2"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-xs text-ink-400">Taking longer than usual. Hang tight, or try again.</p>
            {onRetry && (
              <Button variant="glass" size="sm" onClick={onRetry} icon={<RotateCw className="size-3.5" />}>
                Reload
              </Button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
