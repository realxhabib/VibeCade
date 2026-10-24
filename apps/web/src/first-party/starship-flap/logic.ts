/**
 * Starship Flap: pure rules (no React, no DOM). Every player flies the same
 * seeded course of launch-tower gates; one tap fires the engines (an upward
 * burst), gravity does the rest. Score = gates cleared before you crash.
 *
 * The world is a fixed 600-unit-tall strip that scrolls right to left, and the
 * simulation runs in fixed steps, so the course and the physics are identical
 * on every device whatever its screen or frame rate.
 */

export interface Rand {
  next(): number;
}

/** World height in units (the canvas scales to fit it). */
export const WORLD_H = 600;
/** Where the ship flies, measured from the left edge of the view. */
export const SHIP_X = 130;
export const SHIP_RADIUS = 15;
/** Fixed simulation step (seconds). */
export const STEP = 1 / 120;

export const GRAVITY = 1500;
/** A tap sets the ship's vertical speed to this (upwards). */
export const THRUST_VY = -470;
export const MAX_FALL = 720;

export const FIRST_GATE_X = 560;
export const GATE_SPACING = 290;
export const GATE_WIDTH = 66;
/** Keeps gaps away from the ground and the ceiling. */
export const GATE_MARGIN = 70;
/**
 * How far a gap's centre may move from one gate to the next (keeps every course
 * flyable at top speed). Climbing takes taps, falling is free, so climbs are shorter.
 */
export const MAX_CLIMB = 150;
export const MAX_DROP = 200;

/** Hovering before the first tap ends on its own after this long. */
export const HOVER_MAX_S = 3;

export interface Gate {
  /** World x of the tower's left edge. */
  x: number;
  /** Gap centre and height. */
  gapY: number;
  gapH: number;
}

/** Gap height shrinks from 205 to 150 units over the first 40 gates. */
export function gapHeight(index: number): number {
  return Math.round(205 - Math.min(1, index / 40) * 55);
}

/** Scroll speed (units/s) after `score` gates: 175, picking up to 265. */
export function speedFor(score: number): number {
  return 175 + Math.min(90, score * 3);
}

/**
 * The course: `count` gates drawn from the match's shared random, so every
 * player in the match flies exactly the same one.
 */
export function createCourse(rand: Rand, count = 400): Gate[] {
  const gates: Gate[] = [];
  let prev = WORLD_H / 2;
  for (let i = 0; i < count; i++) {
    const gapH = gapHeight(i);
    // y grows downwards: a smaller gapY is a climb.
    const lo = Math.max(GATE_MARGIN + gapH / 2, prev - MAX_CLIMB);
    const hi = Math.min(WORLD_H - GATE_MARGIN - gapH / 2, prev + MAX_DROP);
    const gapY = Math.round(lo + rand.next() * (hi - lo));
    gates.push({ x: FIRST_GATE_X + i * GATE_SPACING, gapY, gapH });
    prev = gapY;
  }
  return gates;
}

export type Phase = "hover" | "flying" | "crashed";

export interface Flight {
  phase: Phase;
  /** Seconds since the run began (hover included). */
  t: number;
  /** Distance flown (world x of the view's left edge). */
  dist: number;
  y: number;
  vy: number;
  score: number;
  /** Seconds since the last thrust (for the engine flame). */
  sinceThrust: number;
  /** What ended the run. */
  crash: "tower" | "ground" | "ceiling" | null;
}

export function startFlight(): Flight {
  return { phase: "hover", t: 0, dist: 0, y: WORLD_H * 0.45, vy: 0, score: 0, sinceThrust: 99, crash: null };
}

export type FlightEvent = { type: "launch" } | { type: "thrust" } | { type: "gate"; score: number } | { type: "crash"; score: number; cause: NonNullable<Flight["crash"]> };

/** World x of the ship's centre. */
export function shipWorldX(f: Pick<Flight, "dist">): number {
  return f.dist + SHIP_X;
}

function circleHitsRect(cx: number, cy: number, r: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const nx = Math.max(x0, Math.min(cx, x1));
  const ny = Math.max(y0, Math.min(cy, y1));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

/** True if the ship at (x, y) touches gate `g`'s towers. */
export function hitsGate(g: Gate, x: number, y: number, r = SHIP_RADIUS): boolean {
  const top = g.gapY - g.gapH / 2;
  const bottom = g.gapY + g.gapH / 2;
  return circleHitsRect(x, y, r, g.x, -1e4, g.x + GATE_WIDTH, top) || circleHitsRect(x, y, r, g.x, bottom, g.x + GATE_WIDTH, 1e4);
}

/**
 * Advances one fixed step. `thrust` fires the engines this step. Mutates and
 * returns `f` (the game loop runs it hundreds of times a second); events go to `emit`.
 */
export function step(f: Flight, course: readonly Gate[], thrust: boolean, emit?: (e: FlightEvent) => void): Flight {
  if (f.phase === "crashed") return f;
  f.t += STEP;
  f.sinceThrust += STEP;
  if (f.phase === "hover") {
    // Bob gently until the first tap (or the hover runs out).
    f.y = WORLD_H * 0.45 + Math.sin(f.t * 4) * 6;
    if (!thrust && f.t < HOVER_MAX_S) return f;
    f.phase = "flying";
    f.vy = thrust ? THRUST_VY : 0;
    if (thrust) f.sinceThrust = 0;
    emit?.({ type: "launch" });
    return f;
  }
  if (thrust) {
    f.vy = THRUST_VY;
    f.sinceThrust = 0;
    emit?.({ type: "thrust" });
  }
  f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * STEP);
  f.y += f.vy * STEP;
  f.dist += speedFor(f.score) * STEP;

  const x = shipWorldX(f);
  const crash = (cause: NonNullable<Flight["crash"]>) => {
    f.phase = "crashed";
    f.crash = cause;
    emit?.({ type: "crash", score: f.score, cause });
    return f;
  };
  if (f.y + SHIP_RADIUS >= WORLD_H) {
    f.y = WORLD_H - SHIP_RADIUS;
    return crash("ground");
  }
  if (f.y - SHIP_RADIUS <= 0) return crash("ceiling");
  const next = course[f.score];
  if (next) {
    if (hitsGate(next, x, f.y)) return crash("tower");
    if (x - SHIP_RADIUS > next.x + GATE_WIDTH) {
      f.score += 1;
      emit?.({ type: "gate", score: f.score });
    }
  }
  return f;
}

/* ------------------------------------------------------------------ */
/* Autopilot (the practice bot)                                        */
/* ------------------------------------------------------------------ */

/**
 * Plans a flight through the first `gates` gates: the step indices to tap on,
 * or null if it finds none. A beam search over (height, speed) states: at any
 * step every surviving flight has flown the same distance and cleared the
 * same gates, so those two are the whole state. Near-identical states are
 * merged, so a plan is only proven by replaying it (`replayPlan`).
 */
export function planFlight(course: readonly Gate[], gates: number, beam = 40, maxSteps = 120 * 60 * 10): number[] | null {
  interface Node {
    f: Flight;
    parent: number;
    tap: boolean;
  }
  // layers[d]: the flights after d steps. A node made on step d (in layers[d + 1]) with `tap` tapped on step d.
  const layers: Node[][] = [[{ f: startFlight(), parent: -1, tap: false }]];
  for (let s = 0; s < maxSteps; s++) {
    const layer = layers[s]!;
    const next = new Map<number, Node>();
    for (let i = 0; i < layer.length; i++) {
      const node = layer[i]!;
      for (const tap of [false, true]) {
        // Hovering, only the launch tap matters (and it comes at once). Tapping again while
        // still shooting up barely changes anything, so it isn't explored.
        if (node.f.phase === "hover" ? !tap : tap && node.f.vy < THRUST_VY + 150) continue;
        const f = step({ ...node.f }, course, tap);
        if (f.phase === "crashed") continue;
        if (f.score >= gates) {
          const taps = tap ? [s] : [];
          for (let d = s, at = i; d > 0; d--) {
            const back = layers[d]![at]!;
            if (back.tap) taps.push(d - 1);
            at = back.parent;
          }
          return taps.reverse();
        }
        const key = Math.round(f.y / 5) * 256 + Math.round((f.vy - THRUST_VY) / 60);
        if (!next.has(key)) next.set(key, { f, parent: i, tap });
      }
    }
    if (next.size === 0) return null;
    let nodes = [...next.values()];
    if (nodes.length > beam) {
      // Keep the flights best lined up with the next gap.
      const aim = course[nodes[0]!.f.score];
      const target = aim ? aim.gapY : WORLD_H / 2;
      nodes = nodes.sort((p, q) => Math.abs(p.f.y - target) - Math.abs(q.f.y - target)).slice(0, beam);
    }
    layers.push(nodes);
  }
  return null;
}

/** Flies `taps` (step indices) and returns the flight when it ends or `steps` run out. */
export function replayPlan(course: readonly Gate[], taps: readonly number[], steps: number): Flight {
  const set = new Set(taps);
  const f = startFlight();
  for (let s = 0; s < steps && f.phase !== "crashed"; s++) step(f, course, set.has(s));
  return f;
}

/**
 * The gate the practice bot crashes at (it flies the real course until then).
 * Uses the bot's own random, never the match seed. Most runs land between 6 and 30.
 */
export function botCrashGate(rand: () => number): number {
  const skill = 4 + rand() * 8;
  return Math.max(2, Math.round(skill + -Math.log(1 - rand()) * 9));
}

/**
 * The practice bot's flight: a plan through its crash gate, after which it
 * stops tapping and falls. Planned once per match (a few milliseconds).
 */
export function botPlan(course: readonly Gate[], crashGate: number): Set<number> {
  return new Set(planFlight(course, crashGate) ?? [0]);
}

/** Flies the bot's whole run in one go: its final flight (to settle it once the human's run is over). */
export function simulateBot(course: readonly Gate[], taps: ReadonlySet<number>, maxSteps = 120 * 60 * 15): Flight {
  const f = startFlight();
  for (let s = 0; s < maxSteps && f.phase !== "crashed"; s++) step(f, course, taps.has(s));
  return f;
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export const ACHIEVEMENTS = [
  { at: 1, id: "liftoff" },
  { at: 10, id: "orbit" },
  { at: 25, id: "booster_catch" },
  { at: 50, id: "mars" },
] as const;

/** Achievement ids a run of `score` gates earned. */
export function earnedAchievements(score: number): string[] {
  return ACHIEVEMENTS.filter((a) => score >= a.at).map((a) => a.id);
}

export function flightStats(score: number): { best_gates: number; flights: number; total_gates: number } {
  return { best_gates: score, flights: 1, total_gates: score };
}

/** "12 towers" / "1 tower" (what the game calls its gates). */
export function gatesLabel(score: number): string {
  return `${score} tower${score === 1 ? "" : "s"}`;
}
