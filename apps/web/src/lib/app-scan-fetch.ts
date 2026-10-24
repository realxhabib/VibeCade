import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { ScanSource } from "@/platform/app-scan";

/**
 * Server side of "Scan app" for a URL: downloads the page a developer
 * registered plus the scripts it loads (following the bundle's own chunk
 * imports on the same origin) and a `vibecade.manifest.json` next to it, so
 * `scanSources` can read them. Only public https hosts; every redirect hop is
 * checked again, and sizes and counts are capped.
 */

export const SCAN_LIMITS = {
  pageBytes: 1024 * 1024,
  scriptBytes: 3 * 1024 * 1024,
  totalBytes: 12 * 1024 * 1024,
  scripts: 16,
  redirects: 3,
  timeoutMs: 8000,
  budgetMs: 20_000,
} as const;

export class ScanFetchError extends Error {}

/** False for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPublicAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (version === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return false;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]!);
    if (/^(fc|fd|fe[89ab]|ff)/.test(v)) return false;
    if (v.startsWith("64:ff9b:") || v.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

export type Lookup = (host: string) => Promise<string[]>;

const defaultLookup: Lookup = async (host) => (await dnsLookup(host, { all: true, verbatim: true })).map((a) => a.address);

/** Throws unless `url` is https on a host that resolves only to public addresses. */
export async function assertScannableUrl(url: URL, lookup: Lookup = defaultLookup): Promise<void> {
  if (url.protocol !== "https:") throw new ScanFetchError("Only https URLs can be scanned. For localhost, pick your project folder instead.");
  if (url.username || url.password) throw new ScanFetchError("URLs with a username or password can't be scanned");
  if (url.port && url.port !== "443") throw new ScanFetchError("Only the standard https port can be scanned");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new ScanFetchError("That address isn't public");
    return;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw new ScanFetchError("That host isn't public. For local builds, pick your project folder instead.");
  }
  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new ScanFetchError(`Couldn't find ${host}`);
  }
  if (!addresses.length || !addresses.every(isPublicAddress)) throw new ScanFetchError("That host isn't public");
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

interface Ctx {
  fetch: Fetch;
  lookup: Lookup;
  deadline: number;
  total: number;
}

/** GET with redirects followed by hand (each hop re-checked) and the body capped. Null on 404 & co. */
async function get(ctx: Ctx, start: URL, maxBytes: number): Promise<{ url: URL; text: string; type: string } | null> {
  let url = start;
  for (let hop = 0; hop <= SCAN_LIMITS.redirects; hop++) {
    await assertScannableUrl(url, ctx.lookup);
    const left = ctx.deadline - Date.now();
    if (left <= 0) throw new ScanFetchError("The scan took too long");
    const res = await ctx.fetch(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(SCAN_LIMITS.timeoutMs, left)),
      headers: { "user-agent": "VibeCadeScanner/1.0 (+https://vibecade.si/developers)", accept: "text/html,application/javascript,application/json;q=0.9,*/*;q=0.5" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) return null;
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const text = await readText(res, Math.min(maxBytes, SCAN_LIMITS.totalBytes - ctx.total));
    ctx.total += text.length;
    return { url, text, type: res.headers.get("content-type") ?? "" };
  }
  throw new ScanFetchError("Too many redirects");
}

/** The body as text, cut at `max` bytes (a cut bundle still scans fine up to that point). */
async function readText(res: Response, max: number): Promise<string> {
  if (!res.body || max <= 0) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total >= max) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const out = new Uint8Array(Math.min(total, max));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, out.length - offset);
    out.set(part, offset);
    offset += part.length;
    if (offset >= out.length) break;
  }
  return new TextDecoder().decode(out);
}

/** Script URLs a page loads: <script src>, <link rel="modulepreload">. */
export function pageScripts(html: string, base: URL): URL[] {
  const out: URL[] = [];
  const tags = html.match(/<(?:script|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? [];
  for (const tag of tags) {
    const isScript = /^<script/i.test(tag);
    if (!isScript && !/\brel\s*=\s*["']?(modulepreload|preload)/i.test(tag)) continue;
    if (!isScript && !/\bas\s*=\s*["']?script|\.m?js\b/i.test(tag)) continue;
    const attr = tag.match(isScript ? /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i : /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const value = attr?.[1] ?? attr?.[2] ?? attr?.[3];
    if (!value) continue;
    try {
      out.push(new URL(value, base));
    } catch {
      /* not a URL */
    }
  }
  return out;
}

/** Same-origin chunks a bundle imports: `import("./chunk.js")`, `from "./x.js"`, Vite's `"assets/x.js"` lists. */
export function bundleImports(js: string, scriptUrl: URL, pageUrl: URL): URL[] {
  const out: URL[] = [];
  const re = /["'`]((?:\.{1,2}\/|\/)?[\w\-./@]+\.m?js)["'`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const path = m[1]!;
    if (!/^(\.{1,2}\/|\/|assets\/|_next\/static\/|static\/)/.test(path)) continue;
    try {
      const url = new URL(path, path.startsWith(".") ? scriptUrl : pageUrl);
      if (url.origin === pageUrl.origin) out.push(url);
    } catch {
      /* not a URL */
    }
    if (out.length > 200) break;
  }
  return out;
}

const SKIP_SCRIPT = /\/sdk\/(v\d+|xapps|vibecade)[^/]*\.js$|googletagmanager|google-analytics|gtag\/js|\/cdn-cgi\/|plausible|posthog|sentry|hotjar|clarity\.ms/i;

/** Fetches the page, its scripts and a manifest next to it. */
export async function fetchAppSources(
  rawUrl: string,
  { fetch: fetchImpl = fetch, lookup = defaultLookup }: { fetch?: Fetch; lookup?: Lookup } = {},
): Promise<{ sources: ScanSource[]; url: string }> {
  let start: URL;
  try {
    start = new URL(rawUrl);
  } catch {
    throw new ScanFetchError("That isn't a full URL");
  }
  const ctx: Ctx = { fetch: fetchImpl, lookup, deadline: Date.now() + SCAN_LIMITS.budgetMs, total: 0 };
  const page = await get(ctx, start, SCAN_LIMITS.pageBytes);
  if (!page) throw new ScanFetchError("The app's URL didn't load (it answered with an error)");
  const sources: ScanSource[] = [{ path: page.url.toString(), text: page.text }];

  // Manifest next to the page, or at the root.
  for (const candidate of new Set([new URL("vibecade.manifest.json", page.url).toString(), new URL("/vibecade.manifest.json", page.url).toString()])) {
    const found = await get(ctx, new URL(candidate), 64 * 1024).catch(() => null);
    if (!found) continue;
    try {
      const data: unknown = JSON.parse(found.text);
      if (data && typeof data === "object" && !Array.isArray(data)) {
        sources.push({ path: candidate, text: found.text });
        break;
      }
    } catch {
      /* an HTML fallback page, not a manifest */
    }
  }

  const queue = pageScripts(page.text, page.url).filter((u) => !SKIP_SCRIPT.test(u.toString()));
  const seen = new Set<string>();
  while (queue.length && seen.size < SCAN_LIMITS.scripts && ctx.total < SCAN_LIMITS.totalBytes && Date.now() < ctx.deadline) {
    const url = queue.shift()!;
    const key = url.toString().split("#")[0]!;
    if (seen.has(key)) continue;
    seen.add(key);
    const script = await get(ctx, url, SCAN_LIMITS.scriptBytes).catch(() => null);
    if (!script || /text\/html/i.test(script.type)) continue;
    sources.push({ path: key, text: script.text });
    for (const next of bundleImports(script.text, script.url, page.url)) {
      if (!seen.has(next.toString()) && !SKIP_SCRIPT.test(next.toString())) queue.push(next);
    }
  }
  return { sources, url: page.url.toString() };
}
