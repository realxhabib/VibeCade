/**
 * Demo app audience (mirrors supabase/migrations/20261023000000_app_audience.sql): standalone-app
 * opens per person, opt-in email sharing, and the owner's roster (`app_players`). Demo people have
 * no real email, so a shared one is `<handle>@example.com`. Personas start out sharing with a few
 * apps (deterministic per app and persona, until they change it) so a fresh console has emails.
 */
import { createRandom } from "vibecade-sdk";
import type { AppPlayer, AppPlayers } from "../types";
import { isPracticeBot } from "./seed";
import type { AudienceRow, DemoDb } from "./store";

const WEEK_MS = 7 * 86_400_000;
const TAKEN = new Set(["joined", "submitted", "left"]);

const keyOf = (appSlug: string, userId: string) => `${appSlug}:${userId}`;

export function demoEmail(handle: string): string {
  return `${handle}@example.com`;
}

/** When `userId` started sharing their email with `appSlug` (null = not sharing); `seededAt` for a seeded persona. */
function sharedAt(db: DemoDb, appSlug: string, userId: string, seededAt: string): string | null {
  const row = db.audience?.[keyOf(appSlug, userId)];
  if (row && row.emailSharedAt !== undefined) return row.emailSharedAt;
  const profile = db.profiles[userId];
  if (!profile?.isBot || isPracticeBot(userId)) return null;
  return createRandom(`xapps-audience:${appSlug}:${userId}`).next() < 0.4 ? seededAt : null;
}

export function emailSharing(db: DemoDb, appSlug: string, userId: string | null | undefined): boolean {
  return !!userId && !!sharedAt(db, appSlug, userId, new Date(0).toISOString());
}

/** `open_app` for a signed-in viewer on the live app. */
export function recordOpen(db: DemoDb, appSlug: string, userId: string, now: string): void {
  const audience = (db.audience ??= {});
  const row: AudienceRow = audience[keyOf(appSlug, userId)] ?? { opens: 0, firstOpenedAt: null, lastOpenedAt: null };
  audience[keyOf(appSlug, userId)] = { ...row, opens: row.opens + 1, firstOpenedAt: row.firstOpenedAt ?? now, lastOpenedAt: now };
}

/** `set_app_email_sharing` (the app is already resolved and visible when turning it on). */
export function setEmailSharing(db: DemoDb, appSlug: string, userId: string, on: boolean, now: string): boolean {
  const audience = (db.audience ??= {});
  const row: AudienceRow = audience[keyOf(appSlug, userId)] ?? { opens: 0, firstOpenedAt: null, lastOpenedAt: null };
  const current = sharedAt(db, appSlug, userId, now);
  audience[keyOf(appSlug, userId)] = { ...row, emailSharedAt: on ? (current ?? now) : null };
  return on;
}

/** `app_players`: the roster, newest activity first (`query` by handle or name, `limit` clamped to 1–1000). */
export function computePlayers(db: DemoDb, appSlug: string, filter: { query?: string; limit?: number } = {}, now = Date.now()): AppPlayers {
  const byUser = new Map<string, { matches: number; wins: number; opens: number; first: string | null; last: string | null }>();
  const entry = (userId: string) => {
    let row = byUser.get(userId);
    if (!row) byUser.set(userId, (row = { matches: 0, wins: 0, opens: 0, first: null, last: null }));
    return row;
  };
  const seen = (row: { first: string | null; last: string | null }, at: string | null) => {
    if (!at) return;
    if (!row.first || at < row.first) row.first = at;
    if (!row.last || at > row.last) row.last = at;
  };

  for (const m of Object.values(db.matches)) {
    if (m.appSlug !== appSlug || m.versionId) continue;
    for (const p of m.players) {
      if (p.role !== "player" || p.isBot || isPracticeBot(p.userId) || !TAKEN.has(p.state)) continue;
      const row = entry(p.userId);
      row.matches++;
      if (p.result === "win") row.wins++;
      seen(row, m.createdAt);
    }
  }
  const prefix = `${appSlug}:`;
  for (const [key, a] of Object.entries(db.audience ?? {})) {
    if (!key.startsWith(prefix)) continue;
    const row = entry(key.slice(prefix.length));
    row.opens = a.opens;
    seen(row, a.firstOpenedAt);
    seen(row, a.lastOpenedAt);
  }

  const people: AppPlayer[] = [];
  for (const [userId, row] of byUser) {
    const profile = db.profiles[userId];
    if (!profile) continue;
    const shared = sharedAt(db, appSlug, userId, row.first ?? new Date(now).toISOString());
    // Shared without ever playing: on the roster, like the SQL full join.
    if (!row.matches && !row.opens && !shared) continue;
    people.push({
      profile,
      matches: row.matches,
      wins: row.wins,
      opens: row.opens,
      firstSeenAt: row.first,
      lastSeenAt: row.last,
      email: shared ? demoEmail(profile.handle) : null,
      emailSharedAt: shared,
    });
  }
  people.sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") || a.profile.handle.localeCompare(b.profile.handle));

  const query = (filter.query ?? "").trim().replace(/^@/, "").toLowerCase();
  const limit = Math.max(1, Math.min(Math.floor(filter.limit ?? 500), 1000));
  const matching = query ? people.filter((p) => p.profile.handle.includes(query) || p.profile.name.toLowerCase().includes(query)) : people;
  return {
    total: people.length,
    emailsShared: people.filter((p) => p.email).length,
    newThisWeek: people.filter((p) => p.firstSeenAt && Date.parse(p.firstSeenAt) >= now - WEEK_MS).length,
    players: matching.slice(0, limit),
  };
}
