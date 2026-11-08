import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { PresenceEntry, PresenceMeta, PresenceTransport } from "../presence";

/** The one channel everyone signed in shares (see the online_presence migration's realtime.messages policies). */
export const ONLINE_TOPIC = "online";

/**
 * Who's online on Supabase Realtime: presence only (no broadcast) on the private `online` channel,
 * keyed by user id, one meta per open tab. Signed-in users only. A refused join (the migration
 * isn't installed yet) just leaves the list empty, retrying now and then.
 */
export function createSupabasePresence(supabase: SupabaseClient, viewerId: string): PresenceTransport {
  const handlers = new Set<(entries: PresenceEntry[]) => void>();
  let meta: PresenceMeta | null = null;
  let entries: PresenceEntry[] = [];
  let channel: RealtimeChannel | null = null;
  let subscribed = false;
  let closed = false;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => handlers.forEach((h) => h(entries.slice()));

  const connect = async () => {
    await supabase.realtime.setAuth();
    if (closed) return;
    const ch = supabase.channel(ONLINE_TOPIC, {
      config: { private: true, presence: { key: viewerId, enabled: true } },
    });
    channel = ch;
    ch.on("presence", { event: "sync" }, () => {
      if (channel !== ch) return;
      const state = ch.presenceState<PresenceMeta>();
      entries = Object.entries(state).map(([userId, metas]) => ({ userId, metas: metas as PresenceMeta[] }));
      emit();
    }).subscribe((status) => {
      if (channel !== ch) return;
      if (status === "SUBSCRIBED") {
        subscribed = true;
        retries = 0;
        if (meta) void ch.track(meta);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        subscribed = false;
        if (!closed) reconnect();
      }
    });
  };

  const reconnect = () => {
    if (closed || retryTimer) return;
    const old = channel;
    channel = null;
    if (old) void supabase.removeChannel(old);
    if (entries.length) {
      entries = [];
      emit();
    }
    const delay = Math.min(60_000, 1_000 * 2 ** retries++);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void connect();
    }, delay);
  };
  void connect();

  return {
    track(next) {
      meta = { ...next };
      if (channel && subscribed) void channel.track(meta);
    },
    onSync(handler) {
      handlers.add(handler);
      handler(entries.slice());
      return () => handlers.delete(handler);
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      handlers.clear();
      if (channel) void supabase.removeChannel(channel);
      channel = null;
    },
  };
}
