/**
 * Demo admin overview (mirrors supabase/migrations/20261024000100_admin_overview.sql): platform
 * totals and every app's numbers (`admin_overview`), and everyone on the platform (`admin_players`).
 * Test builds are left out. Practice bots aren't people; demo personas are (they stand in for humans).
 * Pure (takes the db, the apps and "now").
 */
import type { AdminAppStats, AdminOverview, AdminPlayer, AdminPlayers, AppManifest } from "../types";
import { dayOf } from "./analytics";
import { isPracticeBot } from "./seed";
import type { DemoDb, MatchRow } from "./store";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const TAKEN = new Set(["joined", "submitted", "left"]);

interface Seat {
  userId: string;
  appSlug: string;
  result: string | null;
  at: string;
}

const liveMatches = (db: DemoDb) => Object.values(db.matches).filter((m) => !m.versionId);

/** Humans who took a seat in a live (non-test) match. */
function seatsOf(matches: MatchRow[]): Seat[] {
  return matches.flatMap((m) =>
    m.players
      .filter((p) => p.role === "player" && !p.isBot && !isPracticeBot(p.userId) && TAKEN.has(p.state))
      .map((p) => ({ userId: p.userId, appSlug: m.appSlug, result: p.result, at: m.createdAt })),
  );
}

function audienceRows(db: DemoDb) {
  return Object.entries(db.audience ?? {}).map(([key, row]) => {
    const at = key.lastIndexOf(":");
    return { appSlug: key.slice(0, at), userId: key.slice(at + 1), ...row };
  });
}

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const humans = (db: DemoDb) => Object.values(db.profiles).filter((p) => !isPracticeBot(p.id));

/** `admin_overview`: `apps` is every app (official ones included, any status). */
export function computeAdminOverview(db: DemoDb, apps: AppManifest[], days: number, now = Date.now()): AdminOverview {
  const today = Date.parse(`${dayOf(now)}T00:00:00.000Z`);
  const start = today - (days - 1) * DAY_MS;
  const inWindow = (at: string | null | undefined) => !!at && Date.parse(at) >= start;
  const matches = liveMatches(db);
  const seats = seatsOf(matches);
  const audience = audienceRows(db);
  const people = humans(db);
  const isHuman = new Set(people.map((p) => p.id));

  const series: AdminOverview["series"] = [];
  const index = new Map<string, number>();
  for (let t = start; t <= today; t += DAY_MS) {
    index.set(dayOf(t), series.length);
    series.push({ date: dayOf(t), matches: 0, players: 0, newPeople: 0 });
  }
  const at = (iso: string) => index.get(dayOf(iso));
  for (const m of matches) {
    const i = at(m.createdAt);
    if (i !== undefined) series[i]!.matches++;
  }
  const seatedOn = new Map<number, Set<string>>();
  for (const s of seats) {
    const i = at(s.at);
    if (i === undefined) continue;
    if (!seatedOn.has(i)) seatedOn.set(i, new Set());
    seatedOn.get(i)!.add(s.userId);
  }
  for (const [i, users] of seatedOn) series[i]!.players = users.size;
  for (const p of people) {
    const i = at(p.createdAt);
    if (i !== undefined) series[i]!.newPeople++;
  }

  const active = new Set(seats.filter((s) => inWindow(s.at)).map((s) => s.userId));
  for (const a of audience) if (isHuman.has(a.userId) && inWindow(a.lastOpenedAt)) active.add(a.userId);

  const stats: AdminAppStats[] = apps.map((app) => {
    const mine = matches.filter((m) => m.appSlug === app.slug);
    const mySeats = seats.filter((s) => s.appSlug === app.slug);
    const myAudience = audience.filter((a) => a.appSlug === app.slug);
    const roster = new Set([...mySeats.map((s) => s.userId), ...myAudience.filter((a) => a.opens > 0).map((a) => a.userId)]);
    let last: string | null = null;
    for (const m of mine) last = later(last, m.createdAt);
    for (const a of myAudience) last = later(last, a.lastOpenedAt);
    return {
      app,
      matches: mine.filter((m) => inWindow(m.createdAt)).length,
      completed: mine.filter((m) => m.status === "completed" && inWindow(m.endedAt)).length,
      players: new Set(mySeats.filter((s) => inWindow(s.at)).map((s) => s.userId)).size,
      roster: roster.size,
      opens: app.playCount,
      lastActiveAt: last,
    };
  });
  stats.sort(
    (a, b) =>
      b.matches - a.matches ||
      b.players - a.players ||
      b.roster - a.roster ||
      (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? "") ||
      a.app.slug.localeCompare(b.app.slug),
  );

  return {
    days,
    totals: {
      apps: apps.length,
      listedApps: apps.filter((a) => a.status === "published").length,
      people: people.length,
      newPeople: people.filter((p) => inWindow(p.createdAt)).length,
      activePlayers: active.size,
      matches: matches.filter((m) => inWindow(m.createdAt)).length,
      completed: matches.filter((m) => m.status === "completed" && inWindow(m.endedAt)).length,
    },
    series,
    apps: stats,
  };
}

/** `admin_players`: everyone, newest activity first, then newest sign-up (`query` by handle or name, `limit` 1–1000). */
export function computeAdminPlayers(db: DemoDb, filter: { query?: string; limit?: number } = {}, now = Date.now()): AdminPlayers {
  const byUser = new Map<string, { matches: number; wins: number; opens: number; apps: Set<string>; last: string | null }>();
  const entry = (userId: string) => {
    let row = byUser.get(userId);
    if (!row) byUser.set(userId, (row = { matches: 0, wins: 0, opens: 0, apps: new Set(), last: null }));
    return row;
  };
  for (const s of seatsOf(liveMatches(db))) {
    const row = entry(s.userId);
    row.matches++;
    if (s.result === "win") row.wins++;
    row.apps.add(s.appSlug);
    row.last = later(row.last, s.at);
  }
  for (const a of audienceRows(db)) {
    const row = entry(a.userId);
    row.opens += a.opens;
    if (a.opens > 0) row.apps.add(a.appSlug);
    row.last = later(row.last, a.lastOpenedAt);
  }

  const people: AdminPlayer[] = humans(db).map((profile) => {
    const row = byUser.get(profile.id);
    return {
      profile,
      matches: row?.matches ?? 0,
      wins: row?.wins ?? 0,
      opens: row?.opens ?? 0,
      apps: row?.apps.size ?? 0,
      joinedAt: profile.createdAt,
      lastSeenAt: row?.last ?? null,
    };
  });
  people.sort(
    (a, b) =>
      (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") ||
      b.joinedAt.localeCompare(a.joinedAt) ||
      a.profile.handle.localeCompare(b.profile.handle),
  );

  const query = (filter.query ?? "").trim().replace(/^@/, "").toLowerCase();
  const limit = Math.max(1, Math.min(Math.floor(filter.limit ?? 500), 1000));
  const matching = query ? people.filter((p) => p.profile.handle.includes(query) || p.profile.name.toLowerCase().includes(query)) : people;
  return {
    total: people.length,
    newThisWeek: people.filter((p) => Date.parse(p.joinedAt) >= now - WEEK_MS).length,
    activeThisWeek: people.filter((p) => p.lastSeenAt && Date.parse(p.lastSeenAt) >= now - WEEK_MS).length,
    players: matching.slice(0, limit),
  };
}
