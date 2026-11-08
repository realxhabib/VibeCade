import type { PresenceEntry, PresenceMeta, PresenceTransport } from "../presence";
import { isHumanOnline, load } from "./store";

type Wire = { t: "here"; userId: string; meta: PresenceMeta } | { t: "leave"; userId: string };

const HEARTBEAT_MS = 2_000;
const STALE_MS = 6_000;
/** Demo personas that hang around online, so the list is never empty on a fresh demo. */
const REGULARS = ["p-pixelqueen", "p-neon_nomad", "p-byte_bandit"];

/**
 * Demo stand-in for the Supabase `online` presence channel: every tab (each signed in as its own
 * persona) shares its meta over BroadcastChannel, plus a few demo personas who are always about.
 */
export function createDemoPresence(viewerId: string, now: () => number = Date.now): PresenceTransport {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("xapps-online") : null;
  const handlers = new Set<(entries: PresenceEntry[]) => void>();
  const peers = new Map<string, { meta: PresenceMeta; seenAt: number }>();
  const startedAt = now();
  let me: PresenceMeta | null = null;
  let closed = false;

  const post = (message: Wire) => {
    if (!closed) channel?.postMessage(message);
  };

  const regulars = (): PresenceEntry[] => {
    const db = load();
    return REGULARS.filter((id) => id !== viewerId && !peers.has(id) && !isHumanOnline(id))
      .map((id) => db.profiles[id])
      .filter((p) => !!p)
      .map((p, i) => ({
        userId: p.id,
        metas: [{ handle: p.handle, name: p.name, avatarUrl: p.avatarUrl, activity: null, at: startedAt - (i + 1) * 97_000 }],
      }));
  };

  const emit = () => {
    const entries: PresenceEntry[] = [];
    if (me) entries.push({ userId: viewerId, metas: [me] });
    for (const [userId, peer] of peers) if (userId !== viewerId) entries.push({ userId, metas: [peer.meta] });
    entries.push(...regulars());
    handlers.forEach((h) => h(entries.slice()));
  };

  const onMessage = (event: MessageEvent<Wire>) => {
    const message = event.data;
    if (!message || typeof message !== "object" || message.userId === viewerId) return;
    if (message.t === "here") {
      const known = peers.has(message.userId);
      peers.set(message.userId, { meta: message.meta, seenAt: now() });
      if (!known && me) post({ t: "here", userId: viewerId, meta: me });
      emit();
    } else if (message.t === "leave") {
      if (peers.delete(message.userId)) emit();
    }
  };
  channel?.addEventListener("message", onMessage);

  const heartbeat = setInterval(() => {
    if (me) post({ t: "here", userId: viewerId, meta: me });
    let changed = false;
    for (const [userId, peer] of peers) {
      if (now() - peer.seenAt > STALE_MS) {
        peers.delete(userId);
        changed = true;
      }
    }
    if (changed) emit();
  }, HEARTBEAT_MS);

  const onUnload = () => post({ t: "leave", userId: viewerId });
  if (typeof window !== "undefined") window.addEventListener("pagehide", onUnload);

  return {
    track(meta) {
      me = { ...meta };
      post({ t: "here", userId: viewerId, meta: me });
      emit();
    },
    onSync(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    close() {
      if (closed) return;
      post({ t: "leave", userId: viewerId });
      closed = true;
      clearInterval(heartbeat);
      if (typeof window !== "undefined") window.removeEventListener("pagehide", onUnload);
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      handlers.clear();
    },
  };
}
