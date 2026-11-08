/**
 * One match room per match on this page, shared by the lobby and the match stage, so the room (and
 * the voice call riding on it) carries straight on when the lobby turns into the match. Each user
 * `acquire`s it and `release`s it; the last release closes it after a short grace period, which is
 * what lets the stage pick up the lobby's room instead of opening a second channel on the same topic.
 *
 * The voice call (`VoiceChat`) lives with the room. Its snapshot is kept in a small store here so
 * components read it with `useVoiceSnapshot` (no setState in effects).
 */
import { useSyncExternalStore } from "react";
import { isVoiceEvent, VoiceChat, type VoiceSnapshot, voiceSupported } from "@/lib/voice-chat";
import type { Backend, RoomStateCopy, RoomTransport } from "@/platform/backend";

const GRACE_MS = 3000;

interface Entry {
  key: string;
  matchId: string;
  room: RoomTransport;
  voice: VoiceChat | null;
  refs: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
  latestState: (() => RoomStateCopy | null) | null;
  off: () => void;
}

const entries = new Map<string, Entry>();
const snapshots = new Map<string, VoiceSnapshot>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export interface SharedRoom {
  room: RoomTransport;
  /** Our latest copy of the match state, offered to a live server room (the stage sets it). */
  setLatestState(fn: (() => RoomStateCopy | null) | null): void;
  release(): void;
}

/** Opens (or reuses) the match's room. Call from an effect; `release` in its cleanup. */
export function acquireRoom(backend: Backend, matchId: string, viewerId: string, appSlug: string): SharedRoom {
  const key = `${backend.kind}:${matchId}:${viewerId}`;
  let entry = entries.get(key);
  if (entry) {
    if (entry.closeTimer) clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  } else {
    const holder: { entry?: Entry } = {};
    const room = backend.openRoom(matchId, viewerId, appSlug, { latestState: () => holder.entry?.latestState?.() ?? null });
    const voice = voiceSupported()
      ? new VoiceChat({
          selfId: viewerId,
          send: (event) => room.send(event),
          canTalk: () => false,
          onChange: (snap) => {
            snapshots.set(matchId, snap);
            notify();
          },
        })
      : null;
    const offEvent = room.onEvent((event, from) => {
      if (isVoiceEvent(event)) voice?.handle(event, from);
    });
    const offPresence = room.onPresence((peers) => voice?.setPresent(peers.map((p) => p.userId)));
    entry = {
      key,
      matchId,
      room,
      voice,
      refs: 0,
      closeTimer: null,
      latestState: null,
      off: () => {
        offEvent();
        offPresence();
      },
    };
    holder.entry = entry;
    entries.set(key, entry);
  }
  const e = entry;
  e.refs++;
  let released = false;
  return {
    room: e.room,
    setLatestState: (fn) => {
      e.latestState = fn;
    },
    release: () => {
      if (released) return;
      released = true;
      e.refs--;
      if (e.refs > 0) return;
      e.closeTimer = setTimeout(() => {
        if (e.refs > 0 || entries.get(e.key) !== e) return;
        entries.delete(e.key);
        e.off();
        e.voice?.destroy();
        e.room.close();
        snapshots.delete(e.matchId);
        notify();
      }, GRACE_MS);
    },
  };
}

function voiceOf(matchId: string): VoiceChat | null {
  for (const e of entries.values()) if (e.matchId === matchId && e.voice) return e.voice;
  return null;
}

/** The voice call's actions for a match (no-ops while its room isn't open). */
export function voiceActions(matchId: string) {
  return {
    /** `talk`: with the microphone (seated players), else listen only (spectators). */
    join: (talk: boolean) => voiceOf(matchId)?.join(talk) ?? Promise.resolve(),
    leave: () => voiceOf(matchId)?.leave(),
    setMuted: (muted: boolean) => voiceOf(matchId)?.setMuted(muted),
    setSilenced: (userId: string, silenced: boolean) => voiceOf(matchId)?.setSilenced(userId, silenced),
  };
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The match's voice call as it stands (null: no room open, or the browser can't do voice). */
export function useVoiceSnapshot(matchId: string): VoiceSnapshot | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshots.get(matchId) ?? null,
    () => null,
  );
}
