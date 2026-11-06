// vibecade-mcp: the VibeCade MCP server over stdio.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serveStdio } from "./rpc";
import { createServer } from "./server";

const version = (() => {
  try {
    return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string }).version;
  } catch {
    return undefined;
  }
})();

if (process.argv.includes("--version") || process.argv.includes("-v")) {
  console.log(version ?? "unknown");
} else if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`vibecade-mcp ${version ?? ""}

An MCP server (stdio) for building VibeCade games with an agent.

  Claude Code:  claude mcp add vibecade -- npx -y vibecade-mcp
  Other hosts:  { "command": "npx", "args": ["-y", "vibecade-mcp"] }`);
} else {
  const docsDir = fileURLToPath(new URL("./docs/", import.meta.url));
  // stdout is the protocol channel: anything human-readable goes to stderr.
  await serveStdio(createServer({ docsDir, version }));
}
