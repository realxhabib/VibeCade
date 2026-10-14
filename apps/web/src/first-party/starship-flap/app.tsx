"use client";

import type { Json, PlayerInfo } from "vibecade-sdk";
import { useGestureLock, useMatchResult, useMatchStarted, useRoomEvent, useVibeCade } from "vibecade-sdk/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useBot, useLiveOpponent } from "@/first-party/shared/hooks";
import { reportStats, unlockAchievements } from "@/first-party/shared/progress";
import { AnimatedDots, Eyebrow, Screen } from "@/first-party/shared/ui";
import { fadeUp, spring, staggerChildren } from "@/lib/motion";
import { play } from "@/lib/sfx";
import {
  SHIP_X,
  STEP,
  botCrashGate,
  botPlan,
  createCourse,
  earnedAchievements,
  flightStats,
  gatesLabel,
  shipWorldX,
  startFlight,
  step,
  type Flight,
  type FlightEvent,
} from "./logic";
import { drawScene, explode, updateParticles, type Particle, type ShipSprite } from "./render";

/** Live flights are broadcast this often (in simulation steps: 20 a second). */
const SEND_EVERY = 6;

interface Ghost {
  dist: number;
  y: number;
  vy: number;
  score: number;
  crashed: boolean;
  /** When we last heard from them (ms). */
  at: number;
}

interface Final {
  me: number;
  /** The bot's score, once it has been flown out. */
  bot: number | null;
}

function quietly(promise: Promise<unknown>): void {
  promise.catch(() => {});
}

function displayName(player: PlayerInfo | undefined): string {
  return player ? player.name?.trim() || `@${player.handle}` : "Opponent";
}

function isGhostMessage(payload: Json): payload is { d: number; y: number; vy: number; s: number; c?: boolean } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const p = payload as Record<string, unknown>;
  return [p.d, p.y, p.vy, p.s].every((n) => typeof n === "number" && Number.isFinite(n));
}

export function StarshipFlap() {
  const xapps = useVibeCade();
  const started = useMatchStarted();
  const result = useMatchResult();
  const bot = useBot();
  const liveOpp = useLiveOpponent();
  const reduced = useReducedMotion() ?? false;
  const spectating = xapps.isSpectator;

  const course = useMemo(() => createCourse(xapps.random.fork("course")), [xapps]);
  const me = xapps.me;
  const opp = xapps.opponent;
  const botId = bot?.id ?? null;
  const liveOppId = liveOpp?.id ?? null;

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useGestureLock(rootRef);

  const flightRef = useRef<Flight>(startFlight());
  const tapRef = useRef(false);
  const botRef = useRef<{ taps: Set<number>; flight: Flight; step: number } | null>(null);
  const ghostsRef = useRef(new Map<string, Ghost>());
  const particlesRef = useRef<Particle[]>([]);
  const shakeRef = useRef(0);
  const submittedRef = useRef(false);

  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<Flight["phase"]>("hover");
  const [final, setFinal] = useState<Final | null>(null);
  const [oppScore, setOppScore] = useState<number | null>(null);
  const [oppCrashed, setOppCrashed] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  useEffect(() => {
    xapps.ready().catch((error: unknown) => console.warn("[starship-flap] ready failed", error));
  }, [xapps]);

  // The practice bot plans its flight during the intro (its own randomness, never the match seed).
  useEffect(() => {
    if (!botId || botRef.current) return;
    const taps = botPlan(course, botCrashGate(Math.random));
    botRef.current = { taps, flight: startFlight(), step: 0 };
  }, [botId, course]);

  /* ---------------------------------------------------------------- */
  /* Live opponents (and spectators) hear each other's flights        */
  /* ---------------------------------------------------------------- */

  useRoomEvent("fly", (payload: Json, from: string) => {
    if (from === me.id || !isGhostMessage(payload)) return;
    const ghost = { dist: payload.d, y: payload.y, vy: payload.vy, score: payload.s, crashed: !!payload.c, at: performance.now() };
    const blewUp = ghost.crashed && !ghostsRef.current.get(from)?.crashed;
    ghostsRef.current.set(from, ghost);
    if (from === liveOppId) {
      setOppScore(ghost.score);
      if (ghost.crashed) setOppCrashed(true);
    }
    if (blewUp && !reduced) explode(particlesRef.current, ghost.dist + SHIP_X, ghost.y);
  });

  /* ---------------------------------------------------------------- */
  /* Settling                                                         */
  /* ---------------------------------------------------------------- */

  const submitRun = useCallback(
    (mine: number, botScore: number | null) => {
      setSubmitError(false);
      const send = async () => {
        if (botId && botScore !== null) {
          await xapps.submitFor(botId, { score: botScore, data: { gates: botScore } }).catch((error: unknown) => console.warn("[starship-flap] bot submit failed", error));
        }
        await xapps.submit({
          score: mine,
          data: { gates: mine },
          display: { kind: "text", title: gatesLabel(mine), body: mine >= 25 ? "Booster caught. Legendary flying." : mine >= 10 ? "Made it to orbit." : "Rapid unscheduled disassembly." },
        });
      };
      send().catch((error: unknown) => {
        console.error("[starship-flap] submit failed", error);
        setSubmitError(true);
      });
    },
    [xapps, botId],
  );

  const onCrash = useEffectEvent((mine: number) => {
    play("slam");
    quietly(xapps.ui.haptic("error"));
    shakeRef.current = 14;
    const f = flightRef.current;
    if (!reduced) explode(particlesRef.current, shipWorldX(f), f.y);
    quietly(xapps.ui.setStatus(`Crashed at gate ${mine + 1}`));
    if (submittedRef.current) return;
    submittedRef.current = true;
    reportStats(xapps, flightStats(mine), "starship-flap");
    unlockAchievements(xapps, earnedAchievements(mine), "starship-flap");
    // The bot flies out the rest of its run at once.
    const b = botRef.current;
    let botScore: number | null = null;
    if (botId && b) {
      for (let i = 0; i < 120 * 60 * 15 && b.flight.phase !== "crashed"; i++) step(b.flight, course, b.taps.has(b.step++));
      botScore = b.flight.score;
      quietly(xapps.ui.setScores({ [me.id]: mine, [botId]: botScore }));
    }
    setFinal({ me: mine, bot: botScore });
    submitRun(mine, botScore);
  });

  const onFlightEvent = useEffectEvent((event: FlightEvent) => {
    switch (event.type) {
      case "launch":
        setPhase("flying");
        play("whoosh");
        quietly(xapps.ui.setStatus("Gate 1"));
        break;
      case "thrust":
        quietly(xapps.ui.haptic("light"));
        break;
      case "gate":
        setScore(event.score);
        play("pop");
        quietly(xapps.ui.setStatus(`Gate ${event.score + 1}`));
        quietly(xapps.ui.setScores({ [me.id]: event.score, ...(opp ? { [opp.id]: botRef.current?.flight.score ?? ghostsRef.current.get(opp.id)?.score ?? 0 } : {}) }));
        break;
      case "crash":
        setPhase("crashed");
        onCrash(event.score);
        break;
    }
  });

  // Someone forfeited or the platform settled the match: stop flying.
  useEffect(() => {
    if (result && flightRef.current.phase !== "crashed") flightRef.current.phase = "crashed";
  }, [result]);

  /* ---------------------------------------------------------------- */
  /* The loop: fixed simulation steps, one draw per frame             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let sent = 0;
    const flying = !spectating && !xapps.finalResult;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        const f = flightRef.current;
        if (flying && f.phase !== "crashed") {
          const tap = tapRef.current;
          tapRef.current = false;
          const crashed = step(f, course, tap, onFlightEvent).phase === "crashed";
          if (liveOppId && (++sent % SEND_EVERY === 0 || crashed)) {
            quietly(xapps.room.send("fly", { d: Math.round(f.dist), y: Math.round(f.y), vy: Math.round(f.vy), s: f.score, c: crashed }));
          }
        }
        const b = botRef.current;
        if (b && b.flight.phase !== "crashed" && flightRef.current.phase !== "crashed") {
          step(b.flight, course, b.taps.has(b.step++));
        }
      }

      // Draw.
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
      const ships: ShipSprite[] = [];
      const b = botRef.current;
      if (b && opp) ships.push({ x: shipWorldX(b.flight), y: b.flight.y, vy: b.flight.vy, sinceThrust: b.flight.sinceThrust, crashed: b.flight.phase === "crashed", alpha: 0.45, label: displayName(opp) });
      let camera = f.dist;
      for (const [id, g] of ghostsRef.current) {
        const who = xapps.match.players.find((p) => p.id === id);
        ships.push({ x: g.dist + SHIP_X, y: g.y, vy: g.vy, sinceThrust: 1, crashed: g.crashed, alpha: spectating ? 0.95 : 0.45, label: displayName(who) });
        if (spectating) camera = Math.max(camera, g.dist);
      }
      if (!spectating) ships.push({ x: shipWorldX(f), y: f.y, vy: f.vy, sinceThrust: f.sinceThrust, crashed: f.phase === "crashed", alpha: 1 });
      drawScene(ctx, { width: rect.width, height: rect.height, time: now / 1000, camera, course, ships, particles: particlesRef.current, shake: shakeRef.current, reduced });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [started, course, xapps, liveOppId, opp, spectating, reduced]);

  /* ---------------------------------------------------------------- */
  /* Input                                                            */
  /* ---------------------------------------------------------------- */

  const thrust = useCallback(() => {
    if (flightRef.current.phase !== "crashed") tapRef.current = true;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code !== "Space" && e.key !== "ArrowUp" && e.key !== "w" && e.key !== "W" && e.key !== "Enter") return;
      e.preventDefault();
      thrust();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [thrust]);

  /* ---------------------------------------------------------------- */
  /* Render                                                           */
  /* ---------------------------------------------------------------- */

  if (!started) return <Pregame oppName={displayName(opp)} spectating={spectating} />;

  return (
    <div
      ref={rootRef}
      className="relative h-dvh min-h-[360px] w-full touch-none select-none overflow-hidden [-webkit-touch-callout:none]"
      data-phase={phase}
      data-score={score}
      onPointerDown={(e) => {
        if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
        thrust();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-label="Starship Flap: tap anywhere to fire the engines" role="img" />

      {!spectating && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center">
          <motion.span
            key={score}
            initial={reduced ? false : { scale: 1.35 }}
            animate={{ scale: 1 }}
            transition={spring.bouncy}
            className="font-display text-6xl font-extrabold tabular-nums text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.6)]"
          >
            {score}
          </motion.span>
          {liveOppId && oppScore !== null && (
            <span className="mt-1 rounded-full bg-black/40 px-2.5 py-0.5 text-xs font-semibold text-ink-200">
              {displayName(opp)}: {oppScore}
              {oppCrashed ? " 💥" : ""}
            </span>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {phase === "crashed" ? `Crashed. ${gatesLabel(score)}.` : score > 0 ? `${gatesLabel(score)}` : ""}
      </p>

      <AnimatePresence>
        {!spectating && phase === "hover" && (
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
        {final && (
          <FinalCard
            key="final"
            final={final}
            oppName={displayName(opp)}
            live={!!liveOppId}
            oppScore={oppScore}
            oppDone={oppCrashed || !!opp?.submitted}
            settled={!!result}
            submitError={submitError}
            onRetry={() => submitRun(final.me, final.bot)}
          />
        )}
      </AnimatePresence>

      {spectating && (
        <p className="pointer-events-none absolute inset-x-0 top-4 text-center text-sm font-semibold text-ink-200">
          Watching live
          <AnimatedDots />
        </p>
      )}
    </div>
  );
}

function FinalCard({
  final,
  oppName,
  live,
  oppScore,
  oppDone,
  settled,
  submitError,
  onRetry,
}: {
  final: Final;
  oppName: string;
  live: boolean;
  oppScore: number | null;
  oppDone: boolean;
  settled: boolean;
  submitError: boolean;
  onRetry: () => void;
}) {
  const other = final.bot ?? (live ? oppScore : null);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={spring.bouncy}
      className="pointer-events-auto absolute inset-x-4 top-1/2 mx-auto max-w-xs -translate-y-1/2 rounded-3xl border border-white/10 bg-ink-900/85 p-5 text-center backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Eyebrow>Rapid unscheduled disassembly</Eyebrow>
      <p className="mt-2 font-display text-4xl font-extrabold text-white">{gatesLabel(final.me)}</p>
      {other !== null && (
        <p className="mt-1 text-sm text-ink-300">
          {oppName}: {gatesLabel(other)}
          {live && !oppDone ? " and counting" : ""}
        </p>
      )}
      <p className="mt-3 text-xs text-ink-400">
        {submitError ? (
          <button type="button" onClick={onRetry} className="rounded-full bg-white/10 px-3 py-1 font-bold text-ink-50">
            Couldn&apos;t send your result. Retry
          </button>
        ) : settled ? (
          "✓ Result locked in"
        ) : live && !oppDone ? (
          <>
            Waiting for {oppName}
            <AnimatedDots />
          </>
        ) : (
          <>
            Locking in the result
            <AnimatedDots />
          </>
        )}
      </p>
    </motion.div>
  );
}

function Pregame({ oppName, spectating }: { oppName: string; spectating: boolean }) {
  return (
    <Screen className="py-4">
      <motion.div className="flex flex-col items-center gap-5 text-center" variants={staggerChildren(0.05)} initial="hidden" animate="show">
        <motion.div variants={fadeUp}>
          <Eyebrow>{spectating ? "Spectating" : `Same course · vs ${oppName}`}</Eyebrow>
        </motion.div>
        <motion.h1 variants={fadeUp} className="font-display text-[clamp(40px,12vw,64px)] font-extrabold leading-[0.9] tracking-tight">
          <span className="bg-[linear-gradient(100deg,#ffffff,var(--accent-from)_45%,var(--accent-to))] bg-clip-text text-transparent">Starship Flap</span>
        </motion.h1>
        <motion.div variants={fadeUp} aria-hidden className="relative h-24 w-56">
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ y: [0, -10, 0], rotate: [-4, -10, -4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            <svg viewBox="-60 -24 130 48" className="h-20 w-48">
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
        <motion.p variants={fadeUp} className="text-sm font-semibold text-ink-100">
          Get ready
          <AnimatedDots />
        </motion.p>
      </motion.div>
    </Screen>
  );
}
