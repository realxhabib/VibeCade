import { describe, expect, it } from "vitest";
import { scanSources } from "@/platform/app-scan";
import { assertScannableUrl, bundleImports, fetchAppSources, isPublicAddress, pageScripts } from "./app-scan-fetch";

const publicLookup = async () => ["93.184.216.34"];

describe("isPublicAddress", () => {
  it("rejects private, loopback and link-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["93.184.216.34", "2606:4700::1111", "172.32.0.1"]) expect(isPublicAddress(ip), ip).toBe(true);
  });
});

describe("assertScannableUrl", () => {
  it("only allows public https hosts", async () => {
    await expect(assertScannableUrl(new URL("http://game.example.com"), publicLookup)).rejects.toThrow(/https/);
    await expect(assertScannableUrl(new URL("https://localhost:3000"), publicLookup)).rejects.toThrow();
    await expect(assertScannableUrl(new URL("https://169.254.169.254/latest"), publicLookup)).rejects.toThrow(/public/);
    await expect(assertScannableUrl(new URL("https://sneaky.example.com"), async () => ["10.0.0.5"])).rejects.toThrow(/public/);
    await expect(assertScannableUrl(new URL("https://game.example.com/play"), publicLookup)).resolves.toBeUndefined();
  });
});

describe("pageScripts / bundleImports", () => {
  it("finds scripts and same-origin chunks", () => {
    const page = new URL("https://game.example.com/play/");
    const html = `<script type="module" crossorigin src="/assets/index-a1.js"></script><link rel="modulepreload" href="./assets/vendor.js"><link rel="stylesheet" href="/x.css"><script src="https://cdn.other.com/lib.js"></script>`;
    expect(pageScripts(html, page).map(String)).toEqual([
      "https://game.example.com/assets/index-a1.js",
      "https://game.example.com/play/assets/vendor.js",
      "https://cdn.other.com/lib.js",
    ]);
    const js = `import{a}from"./chunk-b2.js";const m=()=>import("./Game-c3.js");const d=["assets/Lazy-d4.js","https://cdn.other.com/x.js"]`;
    expect(bundleImports(js, new URL("https://game.example.com/assets/index-a1.js"), new URL("https://game.example.com/")).map(String)).toEqual([
      "https://game.example.com/assets/chunk-b2.js",
      "https://game.example.com/assets/Game-c3.js",
      "https://game.example.com/assets/Lazy-d4.js",
    ]);
  });
});

describe("fetchAppSources", () => {
  it("reads the page, its chunks and the manifest, then scans them", async () => {
    const files: Record<string, { body: string; type: string; status?: number; location?: string }> = {
      "https://game.example.com/": { body: "", type: "text/html", status: 301, location: "/play/" },
      "https://game.example.com/play/": {
        body: `<html><head><title>Tap Race</title></head><body><script type="module" src="/assets/index.js"></script><script src="https://vibecade.si/sdk/v1.js"></script></body></html>`,
        type: "text/html",
      },
      "https://game.example.com/play/vibecade.manifest.json": { body: `{"players":{"min":2,"max":4}}`, type: "application/json" },
      "https://game.example.com/assets/index.js": { body: `const P={xapps:1};import("./game.js")`, type: "application/javascript" },
      "https://game.example.com/assets/game.js": { body: `x.stats.report({wins:1});x.achievements.unlock("first_win");x.turn.end()`, type: "application/javascript" },
    };
    const requested: string[] = [];
    const fetchImpl = async (url: string) => {
      requested.push(url);
      const file = files[url];
      if (!file) return new Response("not found", { status: 404 });
      return new Response(file.status ? null : file.body, {
        status: file.status ?? 200,
        headers: { "content-type": file.type, ...(file.location ? { location: file.location } : {}) },
      });
    };
    const { sources, url } = await fetchAppSources("https://game.example.com/", { fetch: fetchImpl, lookup: publicLookup });
    expect(url).toBe("https://game.example.com/play/");
    expect(requested).not.toContain("https://vibecade.si/sdk/v1.js");
    const report = scanSources(sources);
    expect(report.manifest).toBe("https://game.example.com/play/vibecade.manifest.json");
    const value = (field: string) => report.findings.find((f) => f.field === field)?.value;
    expect(value("name")).toBe("Tap Race");
    expect(value("players")).toEqual({ min: 2, max: 4 });
    expect(value("turnBased")).toBe(true);
    expect((value("stats") as { key: string }[]).map((s) => s.key)).toEqual(["wins"]);
  });

  it("refuses redirects to private hosts", async () => {
    const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "https://127.0.0.1/admin" } });
    await expect(fetchAppSources("https://game.example.com/", { fetch: fetchImpl, lookup: publicLookup })).rejects.toThrow(/public/);
  });
});
