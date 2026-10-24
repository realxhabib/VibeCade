import { fetchAppSources, ScanFetchError } from "@/lib/app-scan-fetch";
import { scanSources } from "@/platform/app-scan";

/**
 * "Scan app" for a URL: `{ url }` → `{ report }` (a ScanReport). The page and
 * its scripts are read here because browsers can't fetch other origins; only
 * the findings go back, never the files.
 */

export const runtime = "nodejs";

const WINDOW_MS = 60_000;
const PER_WINDOW = 8;
const recent = new Map<string, number[]>();

/** A few scans a minute per address (per server instance), so the route isn't a free crawler. */
function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= PER_WINDOW) return true;
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return false;
}

function fail(status: number, message: string): Response {
  return Response.json({ error: { message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (limited(request)) return fail(429, "Too many scans. Try again in a minute.");
  let url: unknown;
  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return fail(400, "Send { \"url\": \"https://…\" }");
  }
  if (typeof url !== "string" || !url.trim() || url.length > 2048) return fail(400, "Enter your app's URL first");
  try {
    const { sources, url: finalUrl } = await fetchAppSources(url.trim());
    const report = scanSources(sources);
    return Response.json({ report, url: finalUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ScanFetchError) return fail(422, error.message);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return fail(504, "The app took too long to answer");
    return fail(502, "Couldn't reach the app");
  }
}
