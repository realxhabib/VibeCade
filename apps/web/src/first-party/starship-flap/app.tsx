"use client";

/**
 * Starship Flap, solo: fly as often as you like, a fresh course every flight,
 * and see where your best ranks worldwide after each crash (the `best_gates`
 * stat). No matches, opponents or waiting.
 */

import type { StatStanding, VibeCadeClient } from "vibecade-sdk";
import { useGestureLock, useVibeCade } from "vibecade-sdk/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/first-party/shared/hooks";
import { reportStats, unlockAchievements } from "@/first-party/shared/progress";
import { cleanStanding, formatCount, standingMoments, BOARD_TOP, type Moments } from "@/first-party/shared/standing";
import { StandingPanel, type BoardStatus, type BoardUnits } from "@/first-party/shared/standing-panel";
import { ActionButton, Eyebrow, Screen } from "@/first-party/shared/ui";
import { fadeUp, spring, staggerChildren } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import { STEP, createCourse, earnedAchievements, flightStats, gatesLabel, shipWorldX, startFlight, step, type Flight, type FlightEvent } from "./logic";
import { drawScene, explode, updateParticles, type Particle } from "./render";

const TAG = "starship-flap";
/** The stat the global board ranks (aggregate `max`). */
const BOARD_STAT = "best_gates";
/** After a crash, taps and Space wait this long before they count as "fly again" (no accidental restarts). */
const AGAIN_DELAY_MS = 900;

const TOWER_UNITS: BoardUnits = {
  title: "most towers",
  format: gatesLabel,
  stillCounts: "Your flight still counts.",
  notYet: "Your flights aren't on the board yet.",
  empty: "Nobody's on the board yet. You could be first.",
};

function quietly(promise: Promise<unknown>): void {
  promise.catch(() => {});
}

interface Board {
  status: BoardStatus;
  standing: StatStanding | null;
}

/** Reads the global board. Never rejects: a failure comes back as status "error". */
function readBoard(xapps: VibeCadeClient): Promise<Board> {
  const failed = (error: unknown): Board => {
    console.warn(`[${TAG}] stats.leaderboard failed`, error);
    return { status: "error", standing: null };
  };
  try {
    return xapps.stats.leaderboard(BOARD_STAT, { limit: BOARD_TOP }).then((raw) => {
      const standing = cleanStanding(raw, BOARD_STAT);
      return standing ? { status: "ready", standing } : failed(new Error("malformed standing"));
    }, failed);
  } catch (error) {
    return Promise.resolve(failed(error));
  }
}

/** What a finished flight produced, for its result screen. */
interface RunResult {
  board: Board;
  moments: Moments;
  /** Your rank before this flight (null: none yet, or unknown). */
  prevRank: number | null;
}

const isGo = (e: KeyboardEvent) =>
  !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey && (e.code === "Space" || e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === "Enter");

export function StarshipFlap() {
  const xapps = useVibeCade();
  const [run, setRun] = useState(0);
  const [board, setBoard] = useState<Board>({ status: "loading", standing: null });

  useEffect(() => {
    xapps.ready().catch((error: unknown) => console.warn(`[${TAG}] ready failed`, error));
    let alive = true;
    void readBoard(xapps).then((b) => alive && setBoard(b));
    return () => {
      alive = false;
    };
  }, [xapps]);

  /** Stats → achievements → the fresh board. Never rejects. */
  const finishRun = async (score: number): Promise<RunResult> => {
    const before = board.status === "ready" && board.standing ? board.standing : undefined;
    // A flight that cleared nothing still counts as a flight, but doesn't put you on the board at 0.
    const { best_gates, ...rest } = flightStats(score);
    await reportStats(xapps, score > 0 ? { best_gates, ...rest } : rest, TAG);
    unlockAchievements(xapps, earnedAchievements(score), TAG);
    const after = await readBoard(xapps);
    setBoard(after);
    return { board: after, moments: standingMoments(before, after.standing, score), prevRank: before?.me?.rank ?? null };
  };

  const fly = () => {
    play("go");
    setRun((n) => n + 1);
  };

  if (run === 0) return <Title board={board} onStart={fly} />;
  return <FlightView key={run} run={run} onFinish={finishRun} onAgain={fly} onRetryBoard={() => readBoard(xapps)} />;
}

/* ---------------------------------------------------------------------- */
/* A flight                                                               */
/* ---------------------------------------------------------------------- */

function FlightView({
  run,
  onFinish,
  onAgain,
  onRetryBoard,
}: {
  run: number;
  onFinish: (score: number) => Promise<RunResult>;
  onAgain: () => void;
  onRetryBoard: () => Promise<Board>;
}) {
  const xapps = useVibeCade();
  const reduced = useReducedMotion() ?? false;
  // A fresh course every flight: the app's random is seeded per open, forked per run.
  const course = useMemo(() => createCourse(xapps.random.fork(`run:${run}`)), [xapps, run]);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useGestureLock(rootRef);

  const flightRef = useRef<Flight>(startFlight());
  const tapRef = useRef(false);
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const crashedAt = useRef(0);

  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<Flight["phase"]>("hover");
  const [result, setResult] = useState<RunResult | null>(null);
  const [retrying, setRetrying] = useState(false);
  // The X post's card and phones on their side: a shorter board, so Fly again stays in view.
  const short = useMediaQuery("(max-height: 560px)");

  const onCrash = useEffectEvent((mine: number) => {
    play("slam");
    quietly(xapps.ui.haptic("error"));
    shakeRef.current = 14;
    crashedAt.current = performance.now();
    const f = flightRef.current;
    if (!reduced) explode(particlesRef.current, shipWorldX(f), f.y);
    quietly(xapps.ui.setStatus(gatesLabel(mine)));
    void onFinish(mine).then((r) => {
      setResult(r);
      if (r.moments.newBest || r.moments.climbed > 0) {
        play(r.moments.newBest ? "achievement" : "notify");
        quietly(xapps.ui.haptic("success"));
      }
    });
  });

  const onFlightEvent = useEffectEvent((event: FlightEvent) => {
    switch (event.type) {
      case "launch":
        setPhase("flying");
        play("whoosh");
        quietly(xapps.ui.setStatus("Tower 1"));
        break;
      case "thrust":
        quietly(xapps.ui.haptic("light"));
        break;
      case "gate":
        setScore(event.score);
        play("pop");
        quietly(xapps.ui.setStatus(`Tower ${event.score + 1}`));
        break;
      case "crash":
        setPhase("crashed");
        onCrash(event.score);
        break;
    }
  });

  /* The loop: fixed simulation steps, one draw per frame. */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        const f = flightRef.current;
        if (f.phase !== "crashed") {
          const tap = tapRef.current;
          tapRef.current = false;
          step(f, course, tap, onFlightEvent);
        }
      }
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(rect.width * dpr);
      const ch = Math.round(rect.height * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      updateParticles(particlesRef.current, dt);
      shakeRef.current = Math.max(0, shakeRef.current - dt * 40);
      const f = flightRef.current;
      drawScene(ctx, {
        width: rect.width,
        height: rect.height,
        time: now / 1000,
        camera: f.dist,
        course,
        ships: [{ x: shipWorldX(f), y: f.y, vy: f.vy, sinceThrust: f.sinceThrust, crashed: f.phase === "crashed", alpha: 1 }],
        particles: particlesRef.current,
        shake: shakeRef.current,
        reduced,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [course, reduced]);

  /* Input: tap / Space thrusts; after a crash (and a beat), it flies again. */
  const press = useCallback(() => {
    if (flightRef.current.phase !== "crashed") {
      tapRef.current = true;
      return;
    }
    if (performance.now() - crashedAt.current > AGAIN_DELAY_MS) onAgain();
  }, [onAgain]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isGo(e)) return;
      if (e.target instanceof Element && e.target.closest("button, a, input")) return;
      e.preventDefault();
      press();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const retryBoard = () => {
    if (retrying) return;
    setRetrying(true);
    void onRetryBoard().then((board) => {
      setRetrying(false);
      setResult((prev) => (prev ? { ...prev, board } : prev));
    });
  };

  return (
    <div
      ref={rootRef}
      className="relative h-dvh min-h-[320px] w-full touch-none select-none overflow-hidden [-webkit-touch-callout:none]"
      data-phase={phase}
      data-score={score}
      onPointerDown={(e) => {
        if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
        if (e.target instanceof Element && e.target.closest("button, a, section")) return;
        press();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-label="Starship Flap: tap anywhere to fire the engines" role="img" />

      {phase !== "crashed" && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <motion.span
            key={score}
            initial={reduced ? false : { scale: 1.35 }}
            animate={{ scale: 1 }}
            transition={spring.bouncy}
            className="font-display text-6xl font-extrabold tabular-nums text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]"
          >
            {score}
          </motion.span>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {phase === "crashed" ? `Crashed. ${gatesLabel(score)}.` : score > 0 ? gatesLabel(score) : ""}
      </p>

      <AnimatePresence>
        {phase === "hover" && (
          <motion.div
            key="hint"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="pointer-events-none absolute inset-x-0 bottom-[18%] text-center"
          >
            <p className="font-display text-xl font-extrabold text-white">Tap to fire the engines</p>
            <p className="mt-1 text-sm text-ink-300">
              Fly through the towers<span className="hidden [@media(pointer:fine)]:inline"> · or press Space</span>
            </p>
          </motion.div>
        )}
        {phase === "crashed" && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center overflow-y-auto bg-ink-950/55 px-4 pt-4 backdrop-blur-[2px]"
          >
            <div className="my-auto flex w-full flex-col items-center gap-3 pb-3">
              <motion.div
                className="text-center"
                initial={reduced ? false : { opacity: 0, y: 16, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={spring.bouncy}
              >
                <Eyebrow>Rapid unscheduled disassembly</Eyebrow>
                <p className={cn("mt-1 font-display font-extrabold text-white", short ? "text-3xl" : "text-4xl")}>{gatesLabel(score)}</p>
              </motion.div>
              <StandingPanel
                units={TOWER_UNITS}
                status={result ? result.board.status : "loading"}
                standing={result?.board.standing ?? null}
                moments={result?.moments ?? null}
                prevRank={result?.prevRank ?? null}
                me={xapps.me}
                onRetry={retryBoard}
                reduced={reduced}
                rows={short ? 3 : BOARD_TOP}
              />
            </div>
            {/* Pinned: always in reach, however tall the board. */}
            <div className="sticky bottom-0 -mx-4 flex w-[calc(100%+2rem)] justify-center bg-gradient-to-t from-ink-950/90 to-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4">
              <ActionButton onClick={onAgain} className="px-9">
                ↻ Fly again
              </ActionButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Title                                                                  */
/* ---------------------------------------------------------------------- */

function Title({ board, onStart }: { board: Board; onStart: () => void }) {
  const xapps = useVibeCade();
  const reduced = useReducedMotion() ?? false;
  const mine = board.standing?.me ?? null;
  const leader = board.standing?.top[0] ?? null;

  const status = mine ? `Best ${gatesLabel(mine.value)} · #${formatCount(mine.rank)}` : "";
  useEffect(() => {
    quietly(xapps.ui.setStatus(status));
  }, [xapps, status]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (!isGo(e) || (e.target instanceof Element && e.target.closest("button, a, input"))) return;
    e.preventDefault();
    onStart();
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <Screen className="py-4">
      <motion.div className="flex flex-col items-center gap-4 text-center" variants={staggerChildren(0.05)} initial="hidden" animate="show">
        <motion.div variants={fadeUp}>
          <Eyebrow>Solo · worldwide leaderboard</Eyebrow>
        </motion.div>
        <motion.h1 variants={fadeUp} className="font-display text-[clamp(38px,11vw,64px)] font-extrabold leading-[0.9] tracking-tight">
          <span className="bg-[linear-gradient(100deg,#ffffff,var(--accent-from)_45%,var(--accent-to))] bg-clip-text text-transparent">Starship Flap</span>
        </motion.h1>
        <motion.div variants={fadeUp} aria-hidden className="relative h-20 w-56">
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={reduced ? undefined : { y: [0, -10, 0], rotate: [-4, -10, -4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg viewBox="-60 -24 130 48" className="h-16 w-44">
              <defs>
                <linearGradient id="sf-hull" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f4f6fa" />
                  <stop offset="1" stopColor="#7d8594" />
                </linearGradient>
                <linearGradient id="sf-flame" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0" stopColor="#fff7d6" />
                  <stop offset="0.4" stopColor="#ffaa3c" />
                  <stop offset="1" stopColor="#ff4620" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M-31 -7 Q-50 -10 -58 0 Q-50 10 -31 7 Z" fill="url(#sf-flame)" />
              <path d="M-27 -9.5 L-35 -19 L-15 -19 L-11 -9.5 Z M-27 9.5 L-35 19 L-15 19 L-11 9.5 Z" fill="#2c2f38" />
              <path d="M-31 -9.5 L17 -9.5 Q35 -6 37 0 Q35 6 17 9.5 L-31 9.5 Z" fill="url(#sf-hull)" />
              <path d="M-31 3.3 L17 3.3 Q33 3 36 1.4 Q35 6 17 9.5 L-31 9.5 Z" fill="#1a1c22" />
            </svg>
          </motion.div>
        </motion.div>
        <motion.p variants={fadeUp} className="max-w-[19rem] text-sm leading-relaxed text-ink-300">
          Tap to fire the engines. Thread the launch towers. Touch anything and it&apos;s a rapid unscheduled disassembly.
        </motion.p>
        <motion.div variants={fadeUp} className="min-h-5 text-sm text-ink-200">
          {mine ? (
            <span>
              Your best <b className="text-ink-50">{gatesLabel(mine.value)}</b> · #{formatCount(mine.rank)} in the world
            </span>
          ) : leader ? (
            <span>
              World record <b className="text-ink-50">{gatesLabel(leader.value)}</b> by @{leader.player.handle}
            </span>
          ) : null}
        </motion.div>
        <motion.div variants={fadeUp}>
          <ActionButton onClick={onStart} className="px-10">
            🚀 Fly
          </ActionButton>
        </motion.div>
      </motion.div>
    </Screen>
  );
}
