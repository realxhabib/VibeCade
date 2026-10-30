import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkProject } from "../src/check";
import { loadDocs, readSection, searchDocs, slugify, splitSections } from "../src/docs";
import { applyProgress, checkManifest } from "../src/manifest";
import { createHandler } from "../src/rpc";
import { createServer } from "../src/server";

const pkgDir = fileURLToPath(new URL("..", import.meta.url));
const docsDir = join(pkgDir, "dist", "docs");
const bin = join(pkgDir, "dist", "vibecade-mcp.js");

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "vibecade-mcp-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const validManifest = () => ({
  name: "Tap Race",
  version: "1.0.0",
  url: "https://tap-race.vercel.app/",
  tagline: "Most taps wins",
  description: "A tap race.",
  category: "games",
  icon: "👆",
  accent: ["#8b5cf6", "#22d3ee"],
  modes: ["live", "practice"],
  players: { min: 2, max: 2 },
  scoring: "high",
  howTo: ["Tap"],
  stats: [],
  achievements: [],
});

function client(cwd = tmp) {
  const handle = createHandler(createServer({ docsDir, cwd, version: "test" }));
  let id = 0;
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const response = await handle({ jsonrpc: "2.0", id: ++id, method, params });
    if (!response) throw new Error("no response");
    if (response.error) throw new Error(response.error.message);
    return response.result as Record<string, unknown>;
  };
  const tool = async (name: string, args: Record<string, unknown>) => {
    const result = (await call("tools/call", { name, arguments: args })) as { content: { text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
    return { text: result.content.map((c) => c.text).join("\n"), data: result.structuredContent ?? {}, isError: result.isError === true };
  };
  return { call, tool };
}

describe("protocol", () => {
  it("initializes, negotiates the version and lists tools, resources and prompts", async () => {
    const { call } = client();
    const init = await call("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    expect(init.protocolVersion).toBe("2025-03-26");
    expect((await call("initialize", { protocolVersion: "1999-01-01" })).protocolVersion).toBe("2025-06-18");
    const { tools } = (await call("tools/list")) as { tools: { name: string; inputSchema: { type: string } }[] };
    expect(tools.map((t) => t.name)).toEqual([
      "vibecade_search_docs",
      "vibecade_read_doc",
      "vibecade_create_app",
      "vibecade_validate_manifest",
      "vibecade_set_progress",
      "vibecade_check_app",
      "vibecade_test_url",
    ]);
    for (const t of tools) expect(t.inputSchema.type).toBe("object");
    const { resources } = (await call("resources/list")) as { resources: { uri: string }[] };
    expect(resources.map((r) => r.uri)).toContain("vibecade://docs/sdk");
    const read = (await call("resources/read", { uri: "vibecade://docs/skill" })) as { contents: { text: string }[] };
    expect(read.contents[0]!.text).toContain("name: vibecade-game");
    const prompt = (await call("prompts/get", { name: "build-vibecade-game", arguments: { idea: "air hockey" } })) as {
      messages: { content: { text: string } }[];
    };
    expect(prompt.messages[0]!.content.text).toContain("Build this VibeCade game: air hockey");
    expect(prompt.messages[0]!.content.text).not.toMatch(/^---/);
  });

  it("answers unknown methods and tools with errors, and ignores notifications", async () => {
    const handle = createHandler(createServer({ docsDir }));
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect((await handle({ jsonrpc: "2.0", id: 1, method: "nope" }))?.error?.code).toBe(-32601);
    expect((await handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "nope" } }))?.error?.code).toBe(-32602);
    expect((await handle({ id: 3 }))?.error?.code).toBe(-32600);
    // A failing tool is a result the model can read.
    const failed = await handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "vibecade_check_app", arguments: {} } });
    expect((failed?.result as { isError: boolean }).isError).toBe(true);
  });

  it("serves the built binary over stdio", async () => {
    const child = spawn(process.execPath, [bin], { stdio: ["pipe", "pipe", "inherit"] });
    const lines: string[] = [];
    child.stdout.setEncoding("utf8");
    let buffer = "";
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop()!;
      lines.push(...parts.filter(Boolean));
    });
    const done = new Promise((resolve) => child.on("close", resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "vibecade_read_doc", arguments: { id: "sdk#achievements" } } })}\n`);
    child.stdin.end("not json\n");
    await done;
    const messages = lines.map((l) => JSON.parse(l) as { id: number | null; result?: { content?: { text: string }[]; serverInfo?: { version: string } }; error?: { code: number } });
    expect(messages).toHaveLength(3);
    expect(messages[0]!.result?.serverInfo?.version).toBe(JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version);
    expect(messages[1]!.result?.content?.[0]?.text).toContain("achievements.unlock");
    expect(messages[2]!.error?.code).toBe(-32700);
  });
});

describe("docs", () => {
  const docs = loadDocs(docsDir);

  it("bundles every doc", () => {
    expect(docs.files.map((f) => f.id).sort()).toEqual(["api", "guide", "manifest", "patterns", "sdk", "skill", "templates"]);
  });

  it("splits at headings (not inside code fences) with GitHub-style ids", () => {
    expect(slugify("Server authority & webhooks")).toBe("server-authority--webhooks");
    expect(slugify("Matches for 2–8 players")).toBe("matches-for-28-players");
    const sections = splitSections("x", "# Top\nintro\n## A\n```sh\n# not a heading\n```\n## A\nagain");
    expect(sections.map((s) => s.id)).toEqual(["x#top", "x#a", "x#a-1"]);
    expect(sections[1]!.text).toContain("# not a heading");
    expect(sections[1]!.path).toEqual(["Top"]);
  });

  it("finds API names and reads sections with their sub-sections", () => {
    const hits = searchDocs(docs, "state.update conflict");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.section.doc === "sdk")).toBe(true);
    const multi = readSection(docs, "sdk#matches-for-28-players");
    expect(multi).toContain("### Team play");
    expect(readSection(docs, "sdk#nope")).toBeNull();
    // The SKILL.md links section ids that must exist.
    expect(readSection(docs, "sdk#server-authority--webhooks")).toContain("reportResult");
  });

  it("read_doc lists docs, returns tables of contents and suggests on a miss", async () => {
    const { tool } = client();
    expect((await tool("vibecade_read_doc", {})).text).toContain("sdk: vibecade-sdk reference");
    expect((await tool("vibecade_read_doc", { id: "sdk" })).text).toContain("`sdk#stats--leaderboards`");
    expect((await tool("vibecade_read_doc", { id: "manifest" })).text).toContain("## Fields");
    expect((await tool("vibecade_read_doc", { id: "storage-scopes" })).text).toContain("scope");
    const miss = await tool("vibecade_read_doc", { id: "sdk#stats" });
    expect(miss.isError).toBe(true);
    expect(miss.text).toContain("Did you mean");
  });
});

describe("manifest", () => {
  it("accepts a good manifest", () => {
    const report = checkManifest(validManifest());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toContain("Game · Games · 2–2 players");
  });

  it("reports every problem at once, with the site's messages", () => {
    const report = checkManifest({ ...validManifest(), name: "X", icon: "not an emoji", accent: ["red"], modes: [], players: { min: 2, max: 6 }, teams: 4, url: "http://example.com", wat: 1 });
    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        "name: Name must be 2–40 characters",
        "accent: Accent is two hex colors",
        "modes: Pick at least one mode (live, async, practice)",
        "players + teams: Max players must be a multiple of the team count",
        "url: Use https (or http://localhost while testing)",
      ]),
    );
    expect(report.warnings.some((w) => w.includes('"wat"'))).toBe(true);
    expect(report.warnings.some((w) => w.includes("single emoji"))).toBe(true);
  });

  it("flags template placeholders, missing fields and a missing practice mode", () => {
    const report = checkManifest({ ...validManifest(), name: "{{name}}", modes: ["live"], tagline: undefined, url: "https://your-app.example.com/" });
    expect(report.errors).toContain('Missing "tagline"');
    expect(report.errors.some((e) => e.includes("placeholder"))).toBe(true);
    expect(report.warnings.some((w) => w.includes('no "practice"'))).toBe(true);
    expect(report.warnings.some((w) => w.includes("placeholder"))).toBe(true);
  });

  it("checks stats and achievements limits", () => {
    const tooMuch = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, name: `A${i}`, icon: "🏆", xp: 100 }));
    expect(checkManifest({ ...validManifest(), achievements: tooMuch }).errors.join()).toContain("at most 500 XP");
    expect(checkManifest({ ...validManifest(), stats: [{ key: "Best", label: "Best", aggregate: "max" }] }).ok).toBe(false);
  });

  it("applies short-form stats and achievements like the console import", () => {
    const result = applyProgress(validManifest(), { stats: [{ label: "Best time", aggregate: "min", format: "ms" }], achievements: [{ name: "First win", xp: 20 }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.defs.stats).toEqual([{ key: "best_time", label: "Best time", aggregate: "min", format: "ms" }]);
    expect(result.defs.achievements).toEqual([{ id: "first_win", name: "First win", description: "", icon: "🏆", xp: 20 }]);
    const merged = applyProgress(result.manifest, { stats: [{ key: "wins", label: "Wins", aggregate: "sum" }] });
    expect(merged.ok && merged.defs.stats.map((s) => s.key)).toEqual(["best_time", "wins"]);
    const replaced = applyProgress(result.manifest, { stats: [{ label: "Wins", aggregate: "sum" }] }, "replace");
    expect(replaced.ok && replaced.defs.stats.map((s) => s.key)).toEqual(["wins"]);
    expect(replaced.ok && replaced.defs.achievements).toHaveLength(1); // untouched list is kept
    expect(applyProgress(validManifest(), {}).ok).toBe(false);
    expect(applyProgress(validManifest(), { achievements: [{ name: "Huge", xp: 101 }] }).ok).toBe(false);
  });
});

describe("tools on a real project", () => {
  it("scaffolds, finds the template's gaps, then passes once they're fixed", async () => {
    const { tool } = client();
    const created = await tool("vibecade_create_app", { directory: "tap-race", template: "react", name: "Tap Race" });
    expect(created.isError).toBe(false);
    expect(created.text).toContain("vibecade.manifest.json");
    const dir = join(tmp, "tap-race");

    // The fresh template: valid code, but the manifest still points at the placeholder URL.
    const first = await tool("vibecade_check_app", { directory: "tap-race" });
    expect(first.data.ok).toBe(true);
    expect(first.text).toContain("placeholder");

    // Code that unlocks an undeclared achievement and reports an undeclared stat.
    const app = join(dir, "src", "App.tsx");
    writeFileSync(app, `${readFileSync(app, "utf8")}\nexport function extra(v: any) { v.stats.report({ best_taps: 3 }); v.achievements.unlock("first_win"); }\n`);
    const second = await tool("vibecade_check_app", { directory: dir });
    expect(second.data.ok).toBe(false);
    expect(second.text).toContain("best_taps");
    expect(second.text).toContain("first_win");

    const set = await tool("vibecade_set_progress", {
      path: "tap-race",
      stats: [{ key: "best_taps", label: "Best taps", aggregate: "max" }],
      achievements: [{ id: "first_win", name: "First win", icon: "🏁", xp: 20 }],
    });
    expect(set.isError).toBe(false);
    expect(set.text).toContain("```json");
    const manifest = JSON.parse(readFileSync(join(dir, "vibecade.manifest.json"), "utf8"));
    expect(manifest.stats).toHaveLength(1);
    expect(manifest.name).toBe("Tap Race");

    const third = await tool("vibecade_check_app", { directory: dir });
    expect(third.data.ok).toBe(true);

    const validated = await tool("vibecade_validate_manifest", { path: "tap-race/vibecade.manifest.json" });
    expect(validated.text).toContain("✓ VibeCade accepts this manifest.");

    const url = await tool("vibecade_test_url", { players: 4, manifest: "tap-race" });
    const parsed = new URL(url.data.url as string);
    expect(parsed.searchParams.get("vibecade-players")).toBe("4");
    expect(JSON.parse(parsed.searchParams.get("vibecade-stats")!)).toEqual(manifest.stats);
  });

  it("refuses to scaffold into a folder that isn't empty", async () => {
    mkdirSync(join(tmp, "taken"));
    writeFileSync(join(tmp, "taken", "x.txt"), "x");
    const { tool } = client();
    const result = await tool("vibecade_create_app", { directory: "taken" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not empty");
  });

  it("catches lifecycle mistakes, Math.random and framing headers", () => {
    mkdirSync(join(tmp, "game"));
    writeFileSync(join(tmp, "game", "vibecade.manifest.json"), JSON.stringify(validManifest()));
    writeFileSync(
      join(tmp, "game", "main.js"),
      `import { connect } from "vibecade-sdk";\nconst v = await connect();\nv.room.send("move", { x: Math.random() });\nv.room.send("xapps.direct", {});\n`,
    );
    writeFileSync(join(tmp, "game", "vercel.json"), JSON.stringify({ headers: [{ source: "/(.*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors https://vibecade.si" }] }] }));
    const report = checkProject(join(tmp, "game"));
    const text = report.issues.map((i) => i.message).join("\n");
    expect(report.ok).toBe(false);
    expect(text).toContain("ready() is never called");
    expect(text).toContain("submit({ score }) is never called");
    expect(text).toContain("never calls submitFor");
    expect(text).toContain("Math.random()");
    expect(text).toContain("xapps.direct");
    expect(text).toContain("frame-ancestors leaves out x.com, twitter.com");
  });

  it("knows standalone apps have no matches", () => {
    mkdirSync(join(tmp, "notes"));
    writeFileSync(join(tmp, "notes", "vibecade.manifest.json"), JSON.stringify({ ...validManifest(), kind: "app" }));
    writeFileSync(join(tmp, "notes", "index.html"), `<script type="module">import { connect } from "https://vibecade.si/sdk/v1.js"; const v = await connect(); v.submit({ score: 1 });</script>`);
    const report = checkProject(join(tmp, "notes"));
    expect(report.issues.some((i) => i.level === "error" && i.message.includes("standalone app"))).toBe(true);
    expect(report.issues.some((i) => i.message.includes("ready()"))).toBe(false);
  });
});
