import { createRandom } from "vibecade-sdk";
import { describe, expect, it } from "vitest";
import {
  GATE_MARGIN,
  HOVER_MAX_S,
  MAX_CLIMB,
  MAX_DROP,
  STEP,
  THRUST_VY,
  WORLD_H,
  botPlan,
  botCrashGate,
  createCourse,
  earnedAchievements,
  gapHeight,
  gatesLabel,
  planFlight,
  replayPlan,
  simulateBot,
  startFlight,
  step,
  type FlightEvent,
} from "./logic";

const course = (seed: string, count?: number) => createCourse(createRandom(seed), count);

describe("createCourse", () => {
  it("is the same for everyone with the match seed", () => {
    expect(course("match-1")).toEqual(course("match-1"));
    expect(course("match-1")).not.toEqual(course("match-2"));
  });

  it("keeps gaps on screen and never shifts them too far at once", () => {
    for (const seed of ["a", "b", "c", "d"]) {
      const gates = course(seed);
      gates.forEach((g, i) => {
        expect(g.gapH).toBe(gapHeight(i));
        expect(g.gapY - g.gapH / 2).toBeGreaterThanOrEqual(GATE_MARGIN - 1);
        expect(g.gapY + g.gapH / 2).toBeLessThanOrEqual(WORLD_H - GATE_MARGIN + 1);
        if (i > 0) expect(g.gapY - gates[i - 1]!.gapY).toBeGreaterThanOrEqual(-MAX_CLIMB - 1);
        if (i > 0) expect(g.gapY - gates[i - 1]!.gapY).toBeLessThanOrEqual(MAX_DROP + 1);
      });
    }
  });

  it("narrows the gaps as the run goes on", () => {
    expect(gapHeight(0)).toBeGreaterThan(gapHeight(20));
    expect(gapHeight(40)).toBe(gapHeight(400));
  });
});

describe("step", () => {
  it("hovers until the first tap, then thrusts up and falls", () => {
    const gates = course("x");
    const f = startFlight();
    for (let i = 0; i < 60; i++) step(f, gates, false);
    expect(f.phase).toBe("hover");
    expect(f.dist).toBe(0);
    const events: FlightEvent[] = [];
    step(f, gates, true, (e) => events.push(e));
    expect(events).toEqual([{ type: "launch" }]);
    expect(f.vy).toBe(THRUST_VY);
    const y = f.y;
    for (let i = 0; i < 10; i++) step(f, gates, false);
    expect(f.y).toBeLessThan(y);
    for (let i = 0; i < 60; i++) step(f, gates, false);
    expect(f.vy).toBeGreaterThan(0);
  });

  it("launches on its own when the hover runs out, then crashes into the ground without taps", () => {
    const gates = course("x");
    const f = startFlight();
    const events: FlightEvent[] = [];
    for (let i = 0; i < (HOVER_MAX_S + 5) / STEP; i++) step(f, gates, false, (e) => events.push(e));
    expect(events[0]).toEqual({ type: "launch" });
    expect(f.phase).toBe("crashed");
    expect(f.crash).toBe("ground");
    expect(events.at(-1)).toEqual({ type: "crash", score: 0, cause: "ground" });
  });

  it("hits the ceiling when you tap constantly", () => {
    const gates = course("x");
    const f = startFlight();
    for (let i = 0; i < 600 && f.phase !== "crashed"; i++) step(f, gates, i % 8 === 0);
    expect(f.crash).toBe("ceiling");
  });
});

describe("planFlight", () => {
  it("finds a way through every course (each one is flyable), proven by replaying it", () => {
    for (let s = 0; s < 12; s++) {
      const gates = course(`seed-${s}`);
      const taps = planFlight(gates, 60);
      expect(taps, `seed-${s}`).not.toBeNull();
      const f = replayPlan(gates, taps!, 120 * 60 * 10);
      expect({ seed: s, score: f.score }).toEqual({ seed: s, score: 60 });
    }
  }, 30_000);

  it("the bot flies its plan and crashes just after its planned gate", () => {
    const gates = course("bot");
    const f = simulateBot(gates, botPlan(gates, 7));
    expect(f.phase).toBe("crashed");
    expect(f.score).toBeGreaterThanOrEqual(7);
    expect(f.score).toBeLessThanOrEqual(8);
  });

  it("plans believable bot scores", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const scores = Array.from({ length: 500 }, () => botCrashGate(rand)).sort((a, b) => a - b);
    expect(scores[0]).toBeGreaterThanOrEqual(2);
    const median = scores[250]!;
    expect(median).toBeGreaterThanOrEqual(10);
    expect(median).toBeLessThanOrEqual(22);
  });
});

describe("progress", () => {
  it("earns milestones", () => {
    expect(earnedAchievements(0)).toEqual([]);
    expect(earnedAchievements(12)).toEqual(["liftoff", "orbit"]);
    expect(earnedAchievements(50)).toEqual(["liftoff", "orbit", "booster_catch", "mars"]);
    expect([gatesLabel(1), gatesLabel(3)]).toEqual(["1 tower", "3 towers"]);
  });
});
