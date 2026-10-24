import { describe, expect, it } from "vitest";
import { guessStat, isScannablePath, objectLiteralKeys, scanPatch, scanSources, type ScanFinding, type ScanReport } from "./app-scan";
import { achievementDefsError, statDefsError } from "./catalog";

const field = (report: ScanReport, name: ScanFinding["field"]) => report.findings.find((f) => f.field === name);

describe("objectLiteralKeys", () => {
  it("reads keys, shorthand and quoted keys, skipping nested commas and spreads", () => {
    expect(objectLiteralKeys(` wins: 1, best, "streak": Math.max(a, b), ...rest, nested: { x: 1, y: 2 } `)).toEqual(["wins", "best", "streak", "nested"]);
  });
});

describe("guessStat", () => {
  it("guesses aggregates and formats from the key", () => {
    expect(guessStat("best_time")).toEqual({ key: "best_time", label: "Best time", aggregate: "min", format: "ms" });
    expect(guessStat("wins")).toMatchObject({ aggregate: "sum" });
    expect(guessStat("high_score")).toMatchObject({ aggregate: "max" });
    expect(guessStat("accuracy")).toMatchObject({ aggregate: "max", format: "percent" });
  });
});

describe("scanSources", () => {
  const app = {
    path: "src/App.tsx",
    text: `
import { connect } from "vibecade-sdk";
const vc = await connect();
vc.room.on("tap", () => {});
if (vc.isSpectator) render();
async function finish(ms) {
  await vc.stats.report({ best_time: ms, wins: won ? 1 : 0 });
  await vc.achievements.unlock("first_win");
  if (streak >= 5) vc.achievements.unlock('hot_streak');
  await vc.submit({ score: ms, display: { kind: "text", body: "done" } });
  for (const bot of bots) await vc.submitFor(bot.id, { score: botMs });
}
`,
  };

  it("proposes stats, achievements, modes and capabilities from SDK calls", () => {
    const report = scanSources([app]);
    expect(report.sdk).toBe(true);
    expect(field(report, "stats")?.value).toEqual([
      { key: "best_time", label: "Best time", aggregate: "min", format: "ms" },
      { key: "wins", label: "Wins", aggregate: "sum" },
    ]);
    const achievements = field(report, "achievements")!.value as { id: string; icon: string }[];
    expect(achievements.map((a) => a.id)).toEqual(["first_win", "hot_streak"]);
    expect(achievementDefsError(achievements)).toBeNull();
    expect(field(report, "kind")?.value).toBe("game");
    expect(field(report, "modes")?.value).toEqual(["live", "practice"]);
    expect(field(report, "spectators")?.value).toBe(true);
    expect(field(report, "scoring")?.value).toBe("low");
    expect(field(report, "turnBased")).toBeUndefined();
    expect(field(report, "stats")!.evidence[0]).toMatchObject({ file: "src/App.tsx", line: 7 });
  });

  it("reads minified bundles and hook calls", () => {
    const bundle = {
      path: "https://game.example/assets/index-abc.js",
      // The SDK's hooks are inlined (and tree-shaken) next to the app's own code.
      text: `const P={xapps:1};function a(){const e=k();return{defs:e.stats.defs,report:t=>e.stats.report(t)}}function b(){const e=k();return{unlock:t=>e.achievements.unlock(t)}}function c(){const e=k();return{end:t=>e.turn.end(t)}}function S(){const e=k();return{submit:(t,n)=>e.setup.submit(t,n)}}function G(){const{report:r}=a(),{unlock:u}=b(),t=c();r({moves:n,games_played:1});u("perfect_game");t.end()}`,
    };
    const report = scanSources([bundle]);
    expect((field(report, "stats")!.value as { key: string }[]).map((s) => s.key)).toEqual(["moves", "games_played"]);
    expect((field(report, "achievements")!.value as { id: string }[]).map((a) => a.id)).toEqual(["perfect_game"]);
    expect(field(report, "turnBased")?.value).toBe(true);
    expect(field(report, "setup")?.value).toBe(true);
    expect(field(report, "modes")?.value).toEqual(["async"]);
  });

  it("flags keys that can't be declared", () => {
    const report = scanSources([{ path: "a.js", text: `vc.stats.report({ bestTime: t })` }]);
    expect(field(report, "stats")).toBeUndefined();
    expect(report.notes.join(" ")).toContain("best_time");
  });

  it("prefers the manifest file and adds what only the code reports", () => {
    const manifest = {
      path: "vibecade.manifest.json",
      text: JSON.stringify({
        name: "Tap Race",
        tagline: "Tap faster than your rival in 10 seconds.",
        modes: ["live"],
        players: { min: 2, max: 4 },
        teams: 2,
        turnBased: false,
        stats: [{ key: "wins", label: "Matches won", aggregate: "sum" }],
        achievements: [],
      }),
    };
    const report = scanSources([manifest, app]);
    expect(report.manifest).toBe("vibecade.manifest.json");
    expect(field(report, "name")).toMatchObject({ value: "Tap Race", confidence: "manifest" });
    expect(field(report, "players")?.value).toEqual({ min: 2, max: 4 });
    expect(field(report, "modes")).toMatchObject({ value: ["live"], confidence: "manifest" });
    const stats = field(report, "stats")!.value as { key: string; label: string }[];
    expect(stats).toEqual([
      { key: "wins", label: "Matches won", aggregate: "sum" },
      { key: "best_time", label: "Best time", aggregate: "min", format: "ms" },
    ]);
    expect(statDefsError(stats)).toBeNull();
  });

  it("ignores template placeholders in a fresh manifest", () => {
    const report = scanSources([{ path: "vibecade.manifest.json", text: `{"name":"{{name}}","modes":["live","practice"]}` }]);
    expect(field(report, "name")).toBeUndefined();
    expect(field(report, "modes")?.value).toEqual(["live", "practice"]);
  });

  it("reads the listing from the page's meta tags and emoji favicon", () => {
    const html = {
      path: "index.html",
      text: `<!doctype html><html><head>
<title>Quiz Night · Live trivia</title>
<meta name="description" content="Five questions, two players, one winner.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧠</text></svg>">
</head><body><script type="module">import { connect } from "https://vibecade.si/sdk/v1.js";</script></body></html>`,
    };
    const report = scanSources([html]);
    expect(field(report, "name")?.value).toBe("Quiz Night");
    expect(field(report, "tagline")?.value).toBe("Five questions, two players, one winner.");
    expect(field(report, "icon")?.value).toBe("🧠");
    expect(report.sdk).toBe(true);
  });

  it("detects standalone apps", () => {
    const report = scanSources([{ path: "main.js", text: `const vc = await VibeCade.connect(); if (vc.purpose === "app") showFeed(); vc.stats.report({ articles_read: 1 });` }]);
    expect(field(report, "kind")?.value).toBe("app");
    expect(field(report, "modes")).toBeUndefined();
  });

  it("says so when there's no SDK at all", () => {
    const report = scanSources([{ path: "main.js", text: "console.log('hi')" }]);
    expect(report.findings).toEqual([]);
    expect(report.notes.join(" ")).toContain("No VibeCade SDK calls");
  });
});

describe("isScannablePath", () => {
  it("skips dependencies and the SDK bundle", () => {
    expect(isScannablePath("my-game/src/App.tsx")).toBe(true);
    expect(isScannablePath("my-game/vibecade.manifest.json")).toBe(true);
    expect(isScannablePath("my-game/node_modules/vibecade-sdk/dist/react.js")).toBe(false);
    expect(isScannablePath("my-game/public/logo.png")).toBe(false);
    expect(isScannablePath("my-game/package.json")).toBe(false);
  });
});

describe("scanPatch", () => {
  it("adds new stats and achievements after the developer's rows, within the XP budget", () => {
    const current = {
      stats: [{ key: "wins", label: "Matches won", aggregate: "sum" as const }],
      achievements: [1, 2, 3, 4, 5].map((n) => ({ id: n === 1 ? "big" : `a${n}`, name: `A${n}`, description: "", icon: "🏆", xp: 98 })),
    };
    const findings: ScanFinding[] = [
      { field: "stats", value: [guessStat("wins"), guessStat("best_time")], confidence: "code", why: "", evidence: [] },
      {
        field: "achievements",
        value: [
          { id: "big", name: "Big", description: "", icon: "🏅", xp: 25 },
          { id: "first_win", name: "First win", description: "", icon: "🥇", xp: 25 },
        ],
        confidence: "code",
        why: "",
        evidence: [],
      },
      { field: "turnBased", value: true, confidence: "code", why: "", evidence: [] },
    ];
    const { patch } = scanPatch(current, findings);
    expect(patch.stats?.map((s) => s.label)).toEqual(["Matches won", "Best time"]);
    expect(patch.achievements?.map((a) => a.id)).toEqual(["big", "a2", "a3", "a4", "a5", "first_win"]);
    expect(patch.achievements?.at(-1)?.xp).toBe(10);
    expect(achievementDefsError(patch.achievements)).toBeNull();
    expect(patch.turnBased).toBe(true);
  });
});
