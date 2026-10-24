import type { SupabaseClient } from "@supabase/supabase-js";
import { BackendError, type RoomEvent, type RoomOptions, type RoomPeer, type RoomStateCopy, type RoomTransport } from "../backend";
import type { Json } from "../types";

/** Events sent before the room has signed us in are held (and sent on welcome), up to this many. */
const MAX_PENDING = 200;
/** How long a write waits for a room that holds the state to get its first copy. */
const SEED_WAIT_MS = 5000;

type StateErrorCode = "conflict" | "forbidden" | "invalid" | "unavailable";

type ServerMessage =
  /** `holds`: the room holds the match state; `state`: its copy, null until a host offers one. */
  | { t: "welcome"; you: string; holds?: boolean; state?: RoomStateCopy | null }
  | { t: "event"; from: string; at: number; event: RoomEvent }
  | { t: "presence"; peers: RoomPeer[] }
  | { t: "pong"; at: number | null }
  /** A new copy of the state (`by`: its writer, or whoever offered it). */
  | { t: "state"; state: Json | null; version: number; by: string | null }
  | { t: "state.ok"; id: number; version: number }
  /** A refused write; a conflict carries the room's current copy. */
  | { t: "state.err"; id: number; code: StateErrorCode; message?: string; state?: Json | null; version?: number };

const isCopy = (v: unknown): v is RoomStateCopy =>
  !!v && typeof v === "object" && typeof (v as RoomStateCopy).version === "number" && "state" in v;

function stateError(code: StateErrorCode, message?: string): BackendError {
  if (code === "conflict") return new BackendError(message ?? "The match state changed — try again", "conflict");
  if (code === "forbidden") return new BackendError(message ?? "You can't change this match's state", "forbidden");
  if (code === "invalid") return new BackendError(message ?? "Invalid match state", "invalid");
  return new BackendError(message ?? "The live room is reconnecting", "internal");
}

/** The live server's room address for a match: https://host → wss://host/room?match=<id>. */
export function liveRoomUrl(base: string, matchId: string): string {
  const url = new URL("/room", base);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.searchParams.set("match", matchId);
  return url.toString();
}

/**
 * Match room on the XApps live server (the arcade server on the droplet, its
 * `server/rooms.mjs`): the same room as `createSupabaseRoom` for fast games,
 * without Supabase Realtime's message quota. It signs in with the player's
 * session; the server checks they're in the match the way the Realtime room
 * policies do. Reconnects with backoff (and a fresh token) when dropped.
 *
 * The room also holds the match state in memory (`state`): writes go to the room, which orders
 * and broadcasts them. On every sign-in we offer the room our latest copy (`latestState`), so a
 * room that restarted picks up from the newest copy any of us has.
 */
export function createLiveRoom(
  supabase: SupabaseClient,
  baseUrl: string,
  matchId: string,
  options: RoomOptions & { WebSocket?: typeof WebSocket } = {},
): RoomTransport {
  const Socket = options.WebSocket ?? WebSocket;
  const eventHandlers = new Set<(event: RoomEvent, from: string, at: number) => void>();
  const presenceHandlers = new Set<(peers: RoomPeer[]) => void>();
  let tracked: { ready: boolean } | null = null;
  let peers: RoomPeer[] = [];
  let socket: WebSocket | null = null;
  let welcomed = false;
  let closed = false;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const pending: RoomEvent[] = [];

  const stateHandlers = new Set<(copy: RoomStateCopy, by: string | null) => void>();
  /** The room holds the state (as of our last sign-in). */
  let holds = false;
  /** The room's latest copy. */
  let held: RoomStateCopy | null = null;
  let nextWrite = 1;
  const writes = new Map<number, { resolve: (version: number) => void; reject: (error: BackendError) => void }>();
  /** Writes waiting for the room's first copy. */
  const seedWaiters = new Set<() => void>();

  const adopt = (copy: RoomStateCopy, by: string | null) => {
    if (held && copy.version <= held.version) return;
    held = { state: copy.state, version: copy.version };
    const now = { ...held };
    stateHandlers.forEach((h) => h(now, by));
    seedWaiters.forEach((w) => w());
  };
  /** Writes in flight when the connection drops never get an answer: fail them (the app retries). */
  const failWrites = (error: BackendError) => {
    const all = [...writes.values()];
    writes.clear();
    all.forEach((w) => w.reject(error));
  };

  const emitPresence = () => presenceHandlers.forEach((h) => h(peers.slice()));
  const raw = (msg: object) => {
    if (socket && socket.readyState === Socket.OPEN) socket.send(JSON.stringify(msg));
  };

  const connect = async () => {
    if (closed) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (closed) return;
    if (!token) return reconnect();
    const ws = new Socket(liveRoomUrl(baseUrl, matchId));
    socket = ws;
    welcomed = false;
    ws.onopen = () => ws.send(JSON.stringify({ t: "auth", token }));
    ws.onmessage = (e) => {
      if (socket !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.t === "welcome") {
        welcomed = true;
        retries = 0;
        if (tracked) raw({ t: "track", ready: tracked.ready });
        for (const event of pending.splice(0)) raw({ t: "event", event });
        holds = msg.holds === true;
        if (!holds) return;
        // A restarted room may be behind us, or empty: it takes the newest copy anyone offers.
        held = null;
        if (isCopy(msg.state)) adopt(msg.state, null);
        const mine = options.latestState?.();
        const theirs = isCopy(msg.state) ? msg.state : null;
        if (mine && (!theirs || mine.version > theirs.version)) raw({ t: "state.offer", state: mine.state, version: mine.version });
      } else if (msg.t === "state" && typeof msg.version === "number") {
        if (holds) adopt({ state: msg.state ?? null, version: msg.version }, msg.by ?? null);
      } else if (msg.t === "state.ok") {
        const w = writes.get(msg.id);
        writes.delete(msg.id);
        w?.resolve(msg.version);
      } else if (msg.t === "state.err") {
        const w = writes.get(msg.id);
        writes.delete(msg.id);
        if (msg.code === "conflict" && typeof msg.version === "number" && holds) adopt({ state: msg.state ?? null, version: msg.version }, null);
        w?.reject(stateError(msg.code, msg.message));
      } else if (msg.t === "event" && msg.event) {
        eventHandlers.forEach((h) => h(msg.event, msg.from, msg.at));
      } else if (msg.t === "presence" && Array.isArray(msg.peers)) {
        peers = msg.peers.map((p) => ({ userId: p.userId, ready: p.ready === true }));
        emitPresence();
      }
    };
    ws.onclose = (e) => {
      if (socket !== ws) return;
      socket = null;
      welcomed = false;
      holds = false;
      failWrites(stateError("unavailable"));
      if (closed) return;
      if (e.code === 4403) {
        console.warn(`[xapps] live room refused: not in match ${matchId}`);
        return;
      }
      console.warn(`[xapps] live room closed (${e.code}) for match ${matchId}, reconnecting`);
      reconnect();
    };
  };

  const reconnect = () => {
    if (closed || retryTimer) return;
    const delay = Math.min(10_000, 500 * 2 ** retries++);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  };
  void connect();

  /** Resolves once the room has a copy (rejects after SEED_WAIT_MS, or when we're closed). */
  const seeded = () =>
    new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer);
        seedWaiters.delete(done);
        if (held && holds && welcomed) resolve();
        else reject(stateError("unavailable"));
      };
      const timer = setTimeout(done, SEED_WAIT_MS);
      seedWaiters.add(done);
    });

  const write = (state: Json | null, expectedVersion: number) =>
    new Promise<number>((resolve, reject) => {
      if (closed || !welcomed || !holds) return reject(stateError("unavailable"));
      const id = nextWrite++;
      writes.set(id, { resolve, reject });
      raw({ t: "state.set", id, state, expectedVersion });
    });

  return {
    send(event) {
      if (closed) return;
      if (welcomed) raw({ t: "event", event });
      else if (pending.length < MAX_PENDING) pending.push(event);
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    track(state) {
      tracked = { ...state };
      if (welcomed) raw({ t: "track", ready: tracked.ready });
    },
    onPresence(handler) {
      presenceHandlers.add(handler);
      handler(peers.slice());
      return () => presenceHandlers.delete(handler);
    },
    state: {
      holds: () => !closed && welcomed && holds,
      copy: () => (welcomed && holds && held ? { ...held } : null),
      async set(state, expectedVersion) {
        if (closed || !welcomed || !holds) throw stateError("unavailable");
        if (!held) await seeded();
        return write(state, expectedVersion);
      },
      onChange(handler) {
        stateHandlers.add(handler);
        return () => stateHandlers.delete(handler);
      },
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      eventHandlers.clear();
      presenceHandlers.clear();
      stateHandlers.clear();
      holds = false;
      held = null;
      failWrites(stateError("unavailable"));
      seedWaiters.forEach((w) => w());
      pending.length = 0;
      const ws = socket;
      socket = null;
      ws?.close(1000, "left");
    },
  };
}
