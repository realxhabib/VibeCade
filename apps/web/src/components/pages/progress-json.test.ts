import { describe, expect, it } from "vitest";
import { importProgressJson, progressToJson, type ProgressDefs } from "./progress-json";

const current: ProgressDefs = {
  stats: [{ key: "wins", label: "Wins", aggregate: "sum" }],
  achievements: [{ id: "first_win", name: "First win", description: "Win once", icon: "🏆", xp: 10 }],
};

describe("importProgressJson", () => {
  it("round-trips its own export", () => {
    const result = importProgressJson(progressToJson(current), { stats: [], achievements: [] });
    expect(result).toMatchObject({ ok: true, value: current, warnings: [] });
  });

  it("fills optional fields and derives ids from names", () => {
    const result = importProgressJson(
      JSON.stringify({ stats: [{ label: "Best time", aggregate: "min", format: "ms" }], achievements: [{ name: "Level 2" }] }),
      current,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        stats: [{ key: "best_time", label: "Best time", aggregate: "min", format: "ms" }],
        achievements: [{ id: "level_2", name: "Level 2", description: "", icon: "🏆", xp: 0 }],
      },
    });
  });

  it("keeps a list the JSON leaves out", () => {
    const result = importProgressJson(JSON.stringify({ achievements: [] }), current);
    expect(result).toMatchObject({ ok: true, value: { stats: current.stats, achievements: [] }, touched: { stats: false, achievements: true } });
  });

  it("merges by id, updating matches and appending the rest", () => {
    const result = importProgressJson(
      JSON.stringify([
        { id: "first_win", name: "First win", icon: "🥇", xp: 20 },
        { id: "level_3", name: "Level 3", icon: "⭐", xp: 15 },
      ]),
      current,
      "merge",
    );
    expect(result.ok && result.value.achievements.map((a) => [a.id, a.xp])).toEqual([
      ["first_win", 20],
      ["level_3", 15],
    ]);
    expect(result.ok && result.value.stats).toEqual(current.stats);
  });

  it("reads stats and achievements out of a full manifest", () => {
    const result = importProgressJson(JSON.stringify({ manifest: { name: "Tap race", stats: [{ key: "taps", label: "Taps", aggregate: "max" }] } }), current);
    expect(result).toMatchObject({ ok: true, value: { stats: [{ key: "taps" }], achievements: current.achievements } });
  });

  it("warns about fields it ignores", () => {
    const result = importProgressJson(JSON.stringify({ stats: [{ key: "taps", label: "Taps", aggregation: "max" }] }), current);
    expect(result.ok && result.warnings).toEqual(['Stat 1: ignored "aggregation"']);
  });

  it("rejects bad JSON and invalid definitions without changing anything", () => {
    expect(importProgressJson("{ stats: [", current)).toMatchObject({ ok: false, error: expect.stringContaining("Not valid JSON") });
    expect(importProgressJson(JSON.stringify({ achievements: [{ id: "x", name: "X", icon: "🏆", xp: 500 }] }), current)).toMatchObject({
      ok: false,
      error: expect.stringContaining("XP must be"),
    });
    expect(importProgressJson(JSON.stringify({ title: "nope" }), current)).toMatchObject({ ok: false });
  });

  it("checks the XP budget after merging", () => {
    const big = Array.from({ length: 5 }, (_, i) => ({ id: `lvl_${i}`, name: `Level ${i}`, icon: "⭐", xp: 100 }));
    const result = importProgressJson(JSON.stringify({ achievements: big }), current, "merge");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("After merging") });
  });
});
