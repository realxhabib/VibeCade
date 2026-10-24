/**
 * The vibecade-mcp tools: docs search, scaffolding, manifest checks, stats and
 * achievements, a project review and mock-host test URLs.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { DEFAULT_TEMPLATE, scaffold, TEMPLATES } from "create-vibecade";
import { checkProject } from "./check";
import { loadDocs, readSection, searchDocs, tableOfContents, type Docs } from "./docs";
import { applyProgress, checkManifest, MANIFEST_FILE } from "./manifest";
import { textResult, type Prompt, type Resource, type ServerDefinition, type Tool } from "./rpc";

export interface ServerOptions {
  /** Folder with the bundled docs. */
  docsDir: string;
  /** Relative paths in tool arguments resolve against this (default: the process's working directory). */
  cwd?: string;
  version?: string;
}

const INSTRUCTIONS = `Tools for building games and apps for VibeCade, the social arcade on X, with vibecade-sdk.
Typical flow: vibecade_create_app → edit the code (vibecade_search_docs / vibecade_read_doc for the API) → vibecade_set_progress for stats and achievements → vibecade_check_app and vibecade_validate_manifest until clean → vibecade_test_url to play it locally against bots → host it and register at https://vibecade.si/developers/new.
Read the "skill" doc (vibecade_read_doc { id: "skill" }) before writing game code: it has the rules that make a game work on VibeCade.`;

const str = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`"${name}" is required`);
  return value.trim();
};
const optStr = (value: unknown): string | undefined => (typeof value === "string" && value.trim() ? value.trim() : undefined);

export function createServer(options: ServerOptions): ServerDefinition {
  const docs: Docs = loadDocs(options.docsDir);
  const cwd = options.cwd ?? process.cwd();
  const pathOf = (p: string) => (isAbsolute(p) ? p : resolve(cwd, p));
  const manifestPathOf = (p: string) => {
    const full = pathOf(p);
    return full.endsWith(".json") ? full : join(full, MANIFEST_FILE);
  };
  const readJson = (path: string): unknown => {
    if (!existsSync(path)) throw new Error(`${path} doesn't exist`);
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw new Error(`${path} isn't valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const tools: Tool[] = [
    {
      name: "vibecade_search_docs",
      title: "Search the VibeCade docs",
      description:
        "Search the VibeCade SDK reference, the build-a-game guide, the game patterns and the manifest reference. Returns the best matching sections with their ids; read one in full with vibecade_read_doc. Good queries name an API (state.update, submitFor, room.direct) or a task (practice bots, team play, framing headers, achievements).",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to look for" },
          limit: { type: "integer", minimum: 1, maximum: 20, default: 6 },
        },
        required: ["query"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args) {
        const query = str(args.query, "query");
        const limit = Number.isInteger(args.limit) ? Math.min(20, Math.max(1, args.limit as number)) : 6;
        const hits = searchDocs(docs, query, limit);
        if (!hits.length) return textResult(`Nothing matched "${query}". Docs: ${docs.files.map((f) => f.id).join(", ")} (vibecade_read_doc lists their sections).`);
        const text = hits.map((h) => `## ${[...h.section.path.slice(-1), h.section.heading].join(" › ")}\nid: ${h.section.id}\n${h.snippet}`).join("\n\n");
        return textResult(text, { results: hits.map((h) => ({ id: h.section.id, heading: h.section.heading, snippet: h.snippet })) });
      },
    },
    {
      name: "vibecade_read_doc",
      title: "Read a VibeCade doc",
      description:
        'Read the VibeCade docs. No id: lists the docs. A doc id: "skill", "api", "patterns" and "manifest" are returned whole; "sdk", "guide" and "templates" return their table of contents. A section id from the contents or a search ("sdk#stats--leaderboards"): that section with its sub-sections.',
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: 'A doc id or a section id like "sdk#achievements"' } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args) {
        const id = optStr(args.id);
        if (!id) return textResult(docs.files.map((f) => `- ${f.id}: ${f.title}. ${f.description}`).join("\n"));
        const file = docs.files.find((f) => f.id === id);
        if (file) {
          if (file.markdown.split("\n").length < 400 && ["skill", "api", "patterns", "manifest"].includes(id)) return textResult(file.markdown);
          return textResult(`# ${file.title}\n\n${tableOfContents(docs, id)}\n\nRead a section with vibecade_read_doc { id: "<section id>" }.`);
        }
        const section = readSection(docs, id.includes("#") ? id : `sdk#${id}`);
        if (section) return textResult(section);
        const hits = searchDocs(docs, id.replace(/^[a-z]+#/, "").replace(/-/g, " "), 3);
        throw new Error(`No doc or section "${id}".${hits.length ? ` Did you mean: ${hits.map((h) => h.section.id).join(", ")}?` : ""}`);
      },
    },
    {
      name: "vibecade_create_app",
      title: "Create a VibeCade app",
      description: `Scaffold a new VibeCade project (what \`npm create vibecade\` does) into an empty or new folder. Templates: ${TEMPLATES.map((t) => `"${t.name}" (${t.description})`).join("; ")}. Then run \`npm install\` and \`npm run dev\` in it (not needed for vanilla).`,
      inputSchema: {
        type: "object",
        properties: {
          directory: { type: "string", description: "Target folder (created if missing; must be empty). Its name becomes the npm package name, so use lowercase-with-dashes." },
          template: { type: "string", enum: TEMPLATES.map((t) => t.name), default: DEFAULT_TEMPLATE },
          name: { type: "string", description: 'Display name, e.g. "Tap Race" (default: from the folder name)' },
        },
        required: ["directory"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      run(args) {
        const result = scaffold({ targetDir: pathOf(str(args.directory, "directory")), template: optStr(args.template), name: optStr(args.name) });
        const build = result.template === "vanilla" ? "No build: serve the folder (npx serve) and open index.html." : `cd ${result.targetDir} && npm install && npm run dev`;
        return textResult(
          `Created "${result.name}" (${result.template}) in ${result.targetDir}:\n${result.files.map((f) => `- ${f}`).join("\n")}\n\nNext: ${build}\nOpened outside VibeCade, the SDK's mock host seats you against a practice bot. Edit ${MANIFEST_FILE} for the listing.`,
          { ...result },
        );
      },
    },
    {
      name: "vibecade_validate_manifest",
      title: "Validate a VibeCade manifest",
      description: `Check a ${MANIFEST_FILE} with the same rules as VibeCade's registration form and version editor (name, tagline, category, icon, accent, modes, players, teams, scoring, howTo, stats, achievements, url), plus warnings for things that work but hurt (no practice mode, placeholder URL…). Pass a path (file or project folder) or the manifest object.`,
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: `A ${MANIFEST_FILE} or the folder that has one` },
          manifest: { type: "object", description: "The manifest itself, instead of a path" },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args) {
        const manifest = args.manifest !== undefined ? args.manifest : readJson(manifestPathOf(str(args.path, "path")));
        const report = checkManifest(manifest);
        const lines = [
          report.ok ? "✓ VibeCade accepts this manifest." : `✗ ${report.errors.length} problem${report.errors.length === 1 ? "" : "s"} to fix:`,
          ...report.errors.map((e) => `- ${e}`),
          ...(report.warnings.length ? ["", "Warnings:", ...report.warnings.map((w) => `- ${w}`)] : []),
          ...(report.summary ? ["", report.summary] : []),
        ];
        return textResult(lines.join("\n"), { ...report });
      },
    },
    {
      name: "vibecade_set_progress",
      title: "Define stats and achievements",
      description:
        `Add or replace the stats (leaderboards) and achievements in a ${MANIFEST_FILE}, validated like VibeCade's "Stats & achievements as JSON" import. Short forms work: a stat needs a label (key from the label, aggregate "max" by default), an achievement needs a name (id from the name, icon 🏆, 0 XP by default). Limits: 8 stats; 30 achievements, 0–100 XP each, 500 XP in total. Returns the JSON to paste into the console's import too.`,
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: `The ${MANIFEST_FILE} or its project folder` },
          stats: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string", pattern: "^[a-z][a-z0-9_]{0,31}$" },
                label: { type: "string", maxLength: 40 },
                aggregate: { type: "string", enum: ["max", "min", "sum", "last"], description: "max: best score, min: best time, sum: running total, last: latest value" },
                format: { type: "string", enum: ["number", "ms", "percent"] },
              },
              required: ["label"],
            },
          },
          achievements: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", pattern: "^[a-z][a-z0-9_]{0,31}$" },
                name: { type: "string", maxLength: 40 },
                description: { type: "string", maxLength: 140 },
                icon: { type: "string", description: "One emoji" },
                xp: { type: "integer", minimum: 0, maximum: 100 },
                secret: { type: "boolean" },
              },
              required: ["name"],
            },
          },
          mode: { type: "string", enum: ["merge", "replace"], default: "merge", description: "merge: update matching keys/ids and append the rest. replace: the lists you pass become the whole lists." },
          dryRun: { type: "boolean", default: false, description: "Validate and show the result without writing the file" },
        },
        required: ["path"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      run(args) {
        const path = manifestPathOf(str(args.path, "path"));
        const current = readJson(path);
        if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error(`${path} isn't a JSON object`);
        const mode = args.mode === "replace" ? "replace" : "merge";
        const result = applyProgress(current as Record<string, unknown>, { stats: args.stats, achievements: args.achievements }, mode);
        if (!result.ok) throw new Error(result.error);
        if (args.dryRun !== true) writeFileSync(path, `${JSON.stringify(result.manifest, null, 2)}\n`);
        const json = JSON.stringify(result.defs, null, 2);
        return textResult(
          [
            `${args.dryRun === true ? "Would set" : `Updated ${path}:`} ${result.summary}`,
            ...result.warnings.map((w) => `- ${w}`),
            "",
            "Report them in code with xapps.stats.report({ key: value }) and xapps.achievements.unlock(\"id\") (React: useStats / useAchievements). Undeclared keys and ids are refused.",
            "Registered apps: paste this into your app's console → Versions → New version → Stats & achievements as JSON:",
            "```json",
            json,
            "```",
          ].join("\n"),
          { summary: result.summary, warnings: result.warnings, stats: result.defs.stats, achievements: result.defs.achievements },
        );
      },
    },
    {
      name: "vibecade_check_app",
      title: "Check a VibeCade project",
      description:
        "Review a project folder before testing or shipping: the manifest, the lifecycle (ready, submit, submitFor for practice bots), stats and achievements used in code but not declared, capabilities the code uses but the manifest doesn't switch on, Math.random in multiplayer code, reserved events, and hosting headers (frame-ancestors / X-Frame-Options) that would blank the game inside X.",
      inputSchema: {
        type: "object",
        properties: { directory: { type: "string", description: "The project folder (where vibecade.manifest.json lives)" } },
        required: ["directory"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args) {
        const report = checkProject(pathOf(str(args.directory, "directory")));
        const icon = { error: "✗", warning: "!", info: "·" } as const;
        const lines = [
          report.ok ? `✓ No blocking problems (${report.summary})` : `✗ ${report.summary}`,
          ...report.issues.map((i) => `${icon[i.level]} ${i.message}${i.at ? ` (${i.at})` : ""}`),
        ];
        return textResult(lines.join("\n"), { ...report });
      },
    },
    {
      name: "vibecade_test_url",
      title: "Build a local test URL",
      description:
        "Build the address that opens a game in the SDK's mock host with a given table: N players (you + bots), teams, turns, spectating, the setup screen, match settings, and the manifest's stats and achievements so reports are checked like on VibeCade.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The dev server address", default: "http://localhost:5173/" },
          players: { type: "integer", minimum: 2, maximum: 8 },
          teams: { type: "integer", enum: [2, 3, 4] },
          turnBased: { type: "boolean" },
          role: { type: "string", enum: ["player", "spectator"] },
          purpose: { type: "string", enum: ["match", "setup", "app"] },
          settings: { type: "object", description: "match.settings for the mock match" },
          manifest: { type: "string", description: "A manifest (or its folder) to take stats and achievements from" },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run(args) {
        const url = new URL(optStr(args.url) ?? "http://localhost:5173/");
        const set = (k: string, v: string) => url.searchParams.set(`xapps-${k}`, v);
        if (Number.isInteger(args.players)) set("players", String(args.players));
        if (Number.isInteger(args.teams)) set("teams", String(args.teams));
        if (args.turnBased === true) set("turns", "1");
        if (args.role === "spectator") set("role", "spectator");
        if (args.purpose === "setup" || args.purpose === "app") set("purpose", args.purpose);
        if (args.settings && typeof args.settings === "object") set("settings", JSON.stringify(args.settings));
        const from = optStr(args.manifest);
        if (from) {
          const m = readJson(manifestPathOf(from)) as Record<string, unknown>;
          if (Array.isArray(m.stats) && m.stats.length) set("stats", JSON.stringify(m.stats));
          if (Array.isArray(m.achievements) && m.achievements.length) set("achievements", JSON.stringify(m.achievements));
          if (m.kind === "app" && !url.searchParams.has("xapps-purpose")) set("purpose", "app");
          if (m.turnBased === true && !url.searchParams.has("xapps-turns")) set("turns", "1");
          if (typeof m.teams === "number" && m.teams > 0 && !url.searchParams.has("xapps-teams")) set("teams", String(m.teams));
        }
        return textResult(
          `${url.toString()}\n\nOpen it directly (not in a frame). The console shows [xapps mock] lines; two seats side by side with a protocol log: https://vibecade.si/developers/sandbox`,
          { url: url.toString() },
        );
      },
    },
  ];

  const resources: Resource[] = docs.files.map((f) => ({
    uri: `vibecade://docs/${f.id}`,
    name: f.id,
    title: f.title,
    description: f.description,
    mimeType: "text/markdown",
    read: () => f.markdown,
  }));

  const skill = docs.files.find((f) => f.id === "skill");
  const prompts: Prompt[] = skill
    ? [
        {
          name: "build-vibecade-game",
          title: "Build a VibeCade game",
          description: "Start building a game for VibeCade with the SDK, following the VibeCade workflow and rules",
          arguments: [{ name: "idea", description: "The game to build, in a sentence", required: false }],
          get: ({ idea }) => `${skill.markdown.replace(/^---[\s\S]*?---\s*/, "")}\n\n---\n\n${idea ? `Build this VibeCade game: ${idea}` : "Ask me what game to build, then build it."}`,
        },
      ]
    : [];

  return { name: "vibecade", title: "VibeCade", version: options.version ?? "0.0.0", instructions: INSTRUCTIONS, tools, resources, prompts };
}
