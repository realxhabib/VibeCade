import type { Match, MatchPlayer, PlayableMode, Profile } from "./types";

/* ---------------------------------------------------------------------- */
/* Who's online                                                           */
/* ---------------------------------------------------------------------- */

/**
 * What a signed-in player is doing right now, shared with everyone online. Null: around the site
 * (browsing, on a profile…). A lobby is `open` when anyone may take one of its seats (an open
 * challenge or a quick-match lobby with seats left), so others online can jump in.
 */
export type OnlineActivity =
  | { kind: "lobby"; matchId: string; appSlug: string; mode: PlayableMode; open: boolean; seatsLeft: number }
  | { kind: "playing"; matchId: string; appSlug: string; mode: PlayableMode }
  | { kind: "watching"; matchId: string; appSlug: string };

/** What each open tab shares on the `online` presence channel. */
export interface PresenceMeta {
  handle: string;
  name: string;
  avatarUrl: string | null;
  activity: OnlineActivity | null;
  /** When this tab last changed what it's doing (ms since epoch). */
  at: number;
}

export interface OnlinePlayer {
  userId: string;
  handle: string;
  name: string;
  avatarUrl: string | null;
  activity: OnlineActivity | null;
  /** When they started doing it (ms since epoch). */
  since: number;
}

/** One presence connection: Supabase Realtime presence, or BroadcastChannel in the demo. */
export interface PresenceTransport {
  /** Shares (or updates) our meta; joins on the first call. */
  track(meta: PresenceMeta): void;
  /** Everyone connected, including us: each user's metas, one per open tab. */
  onSync(handler: (entries: PresenceEntry[]) => void): () => void;
  close(): void;
}

export interface PresenceEntry {
  userId: string;
  metas: PresenceMeta[];
}

const PRIORITY: Record<OnlineActivity["kind"] | "none", number> = { none: 0, watching: 1, playing: 2, lobby: 3 };
const priority = (activity: OnlineActivity | null) => PRIORITY[activity?.kind ?? "none"];

const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

/** Presence payloads come from other clients: keep only well-formed ones. */
export function cleanActivity(value: unknown): OnlineActivity | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  if (!isText(a.matchId, 64) || !isText(a.appSlug, 64) || !a.matchId || !a.appSlug) return null;
  const mode = a.mode === "live" || a.mode === "async" || a.mode === "practice" ? a.mode : null;
  if (a.kind === "watching") return { kind: "watching", matchId: a.matchId, appSlug: a.appSlug };
  if (!mode) return null;
  if (a.kind === "playing") return { kind: "playing", matchId: a.matchId, appSlug: a.appSlug, mode };
  if (a.kind === "lobby") {
    const seatsLeft = typeof a.seatsLeft === "number" && Number.isFinite(a.seatsLeft) ? Math.max(0, Math.min(8, Math.floor(a.seatsLeft))) : 0;
    return { kind: "lobby", matchId: a.matchId, appSlug: a.appSlug, mode, open: a.open === true && seatsLeft > 0, seatsLeft };
  }
  return null;
}

/**
 * One row per person: their busiest tab (a lobby beats a game beats watching beats browsing;
 * the newest wins a tie). Sorted: open lobbies first, then games, then the rest, newest first.
 */
export function mergePresence(entries: PresenceEntry[]): OnlinePlayer[] {
  const players: OnlinePlayer[] = [];
  for (const { userId, metas } of entries) {
    let best: PresenceMeta | null = null;
    let bestActivity: OnlineActivity | null = null;
    for (const meta of metas) {
      if (!meta || !isText(meta.handle, 32) || !meta.handle) continue;
      const activity = cleanActivity(meta.activity);
      const at = typeof meta.at === "number" ? meta.at : 0;
      if (!best || priority(activity) > priority(bestActivity) || (priority(activity) === priority(bestActivity) && at > best.at)) {
        best = { ...meta, at };
        bestActivity = activity;
      }
    }
    if (!best) continue;
    players.push({
      userId,
      handle: best.handle,
      name: isText(best.name, 80) && best.name ? best.name : best.handle,
      avatarUrl: isText(best.avatarUrl, 2048) ? best.avatarUrl : null,
      activity: bestActivity,
      since: best.at,
    });
  }
  const rank = (p: OnlinePlayer) => (p.activity?.kind === "lobby" && p.activity.open ? 4 : priority(p.activity));
  return players.sort((a, b) => rank(b) - rank(a) || b.since - a.since || a.handle.localeCompare(b.handle));
}

/** A lobby someone online is waiting in that the viewer could take a seat at. */
export function joinableLobby(player: OnlinePlayer): Extract<OnlineActivity, { kind: "lobby" }> | null {
  return player.activity?.kind === "lobby" && player.activity.open && player.activity.seatsLeft > 0 ? player.activity : null;
}

/**
 * What the viewer is doing in a match, for presence: waiting in its lobby, playing it, watching it,
 * or nothing (not in it, it's over). Test builds stay private.
 */
export function activityForMatch(match: Match, me: MatchPlayer | undefined): OnlineActivity | null {
  if (!me || match.versionId) return null;
  const base = { matchId: match.id, appSlug: match.appSlug };
  if (me.role === "spectator") {
    return ["open", "pending", "active"].includes(match.status) ? { kind: "watching", ...base } : null;
  }
  if (me.state !== "joined") return null;
  const lobby = match.status === "open" || match.status === "pending";
  if (lobby && match.mode !== "async") {
    const seated = match.players.filter((p) => p.role !== "spectator" && p.seat !== null && p.state !== "declined" && p.state !== "left").length;
    const seatsLeft = Math.max(0, Math.max(2, match.maxPlayers) - seated);
    return { kind: "lobby", ...base, mode: match.mode, open: match.isOpen && seatsLeft > 0, seatsLeft };
  }
  if (match.status === "active" || (lobby && match.mode === "async")) return { kind: "playing", ...base, mode: match.mode };
  return null;
}

/** Whether a "someone's waiting in the lobby" alert may interrupt the viewer: never mid-match against people. */
export function canInterrupt(activity: OnlineActivity | null): boolean {
  return !activity || activity.kind !== "playing" || activity.mode === "practice";
}

/**
 * Open lobbies to tell the viewer about: someone else's lobby they haven't been told about yet
 * (`announced`, which this adds to), and not one the viewer is already in.
 */
export function newLobbyAlerts(players: OnlinePlayer[], viewerId: string, mine: OnlineActivity | null, announced: Set<string>): OnlinePlayer[] {
  const alerts: OnlinePlayer[] = [];
  for (const player of players) {
    const lobby = joinableLobby(player);
    if (!lobby || player.userId === viewerId || announced.has(lobby.matchId)) continue;
    announced.add(lobby.matchId);
    if (mine?.matchId === lobby.matchId) continue;
    alerts.push(player);
  }
  return alerts;
}

/* ---------------------------------------------------------------------- */
/* Hub: one connection per backend, kept across page changes              */
/* ---------------------------------------------------------------------- */

const EMPTY: OnlinePlayer[] = [];

/**
 * Who's online for the signed-in viewer. `connect` joins (and leaves when the viewer signs out or
 * changes); `setActivity` updates what we share; `subscribe`/`snapshot` feed useSyncExternalStore.
 * The snapshot includes the viewer.
 */
export class PresenceHub {
  private transport: PresenceTransport | null = null;
  private viewer: Profile | null = null;
  private activity: OnlineActivity | null = null;
  private at = Date.now();
  private players: OnlinePlayer[] = EMPTY;
  private listeners = new Set<() => void>();
  private unsync: (() => void) | null = null;

  constructor(private readonly open: (viewerId: string) => PresenceTransport) {}

  connect(viewer: Profile | null): void {
    if (viewer?.id === this.viewer?.id && (this.transport || !viewer)) {
      if (viewer && this.viewer && (viewer.handle !== this.viewer.handle || viewer.avatarUrl !== this.viewer.avatarUrl || viewer.name !== this.viewer.name)) {
        this.viewer = viewer;
        this.track();
      }
      return;
    }
    this.disconnect();
    this.viewer = viewer;
    if (!viewer || viewer.isBot) return;
    const transport = this.open(viewer.id);
    this.transport = transport;
    this.unsync = transport.onSync((entries) => {
      this.players = mergePresence(entries);
      this.listeners.forEach((l) => l());
    });
    this.track();
  }

  disconnect(): void {
    this.unsync?.();
    this.unsync = null;
    this.transport?.close();
    this.transport = null;
    if (this.players !== EMPTY) {
      this.players = EMPTY;
      this.listeners.forEach((l) => l());
    }
  }

  setActivity(activity: OnlineActivity | null): void {
    if (JSON.stringify(activity) === JSON.stringify(this.activity)) return;
    this.activity = activity;
    this.at = Date.now();
    this.track();
  }

  getActivity(): OnlineActivity | null {
    return this.activity;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = (): OnlinePlayer[] => this.players;

  private track(): void {
    const viewer = this.viewer;
    if (!viewer || !this.transport) return;
    this.transport.track({ handle: viewer.handle, name: viewer.name, avatarUrl: viewer.avatarUrl, activity: this.activity, at: this.at });
  }
}

/** One line on what someone online is doing ("Waiting in the Frontline lobby · 2 seats left"). */
export function activityLabel(activity: OnlineActivity | null, appName: string | undefined): string {
  if (!activity) return "Hanging out";
  const name = appName ?? "a game";
  switch (activity.kind) {
    case "lobby":
      return activity.open
        ? `Waiting in the ${name} lobby · ${activity.seatsLeft} seat${activity.seatsLeft === 1 ? "" : "s"} left`
        : `In a ${name} lobby`;
    case "playing":
      return activity.mode === "practice" ? `Practicing ${name}` : `Playing ${name}`;
    case "watching":
      return `Watching ${name}`;
  }
}
