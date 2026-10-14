import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomEvent, RoomPeer, RoomTransport } from "../backend";

/** Events sent before the room has signed us in are held (and sent on welcome), up to this many. */
const MAX_PENDING = 200;

type ServerMessage =
  | { t: "welcome"; you: string }
  | { t: "event"; from: string; at: number; event: RoomEvent }
  | { t: "presence"; peers: RoomPeer[] }
  | { t: "pong"; at: number | null };

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
 */
export function createLiveRoom(
  supabase: SupabaseClient,
  baseUrl: string,
  matchId: string,
  options: { WebSocket?: typeof WebSocket } = {},
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
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      eventHandlers.clear();
      presenceHandlers.clear();
      pending.length = 0;
      const ws = socket;
      socket = null;
      ws?.close(1000, "left");
    },
  };
}
