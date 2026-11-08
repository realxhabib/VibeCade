"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Headphones, Mic, MicOff, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { VoiceMember, VoiceSnapshot } from "@/lib/voice-chat";
import type { Match } from "@/platform/types";

/** What the HUD needs to show and drive voice chat. */
export interface VoiceControls {
  snapshot: VoiceSnapshot;
  /** Spectators join to listen only. */
  listenOnly: boolean;
  join: () => void;
  leave: () => void;
  toggleMute: () => void;
  silence: (userId: string, silenced: boolean) => void;
}

/** How one person shows on their seat: talking now, in the call with the mic off, or in the call. */
export type SeatVoice = "speaking" | "muted" | "on";

export function seatVoices(voice: VoiceControls | undefined, viewerId: string): Map<string, SeatVoice> {
  const out = new Map<string, SeatVoice>();
  if (!voice) return out;
  const { snapshot } = voice;
  for (const m of snapshot.members) {
    if (!m.talk) continue;
    out.set(m.userId, m.speaking ? "speaking" : m.muted ? "muted" : "on");
  }
  if (snapshot.joined && snapshot.talk) out.set(viewerId, snapshot.speaking ? "speaking" : snapshot.muted ? "muted" : "on");
  return out;
}

/** A glowing ring around a seat's avatar while they talk, and a small mic badge while they're in the call. */
export function SeatVoiceMark({ state }: { state: SeatVoice | undefined }) {
  const reduce = useReducedMotion();
  return (
    <>
      <AnimatePresence>
        {state === "speaking" && (
          <motion.span
            key="ring"
            aria-hidden
            className="pointer-events-none absolute -inset-[4px] rounded-full border-2 border-success shadow-[0_0_12px_var(--color-success)]"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [0.75, 1, 0.75], scale: [1, 1.06, 1] }}
            exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
            transition={reduce ? spring.snappy : { duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {state && (
          <motion.span
            key={state === "muted" ? "off" : "on"}
            className={cn(
              "absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full ring-2 ring-ink-950",
              state === "muted" ? "bg-ink-700 text-ink-200" : "bg-success text-ink-950",
            )}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={spring.bouncy}
            aria-label={state === "muted" ? "In voice, muted" : state === "speaking" ? "Talking" : "In voice"}
          >
            {state === "muted" ? <MicOff className="size-2.5" strokeWidth={3} /> : <Mic className="size-2.5" strokeWidth={3} />}
          </motion.span>
        )}
      </AnimatePresence>
    </>
  );
}

/** The HUD's mic button: join the call, then mute and unmute (listeners: join and leave). */
export function VoiceButton({ voice }: { voice: VoiceControls }) {
  const { snapshot, listenOnly } = voice;
  const reduce = useReducedMotion();
  const others = snapshot.members.length;
  const Icon = listenOnly ? Headphones : snapshot.joined && snapshot.muted ? MicOff : Mic;
  const label = !snapshot.joined
    ? listenOnly
      ? "Listen to voice chat"
      : "Join voice chat"
    : listenOnly
      ? "Stop listening"
      : snapshot.muted
        ? "Unmute"
        : "Mute";

  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      disabled={snapshot.joining}
      onClick={() => {
        haptic("light");
        if (!snapshot.joined) voice.join();
        else if (listenOnly) voice.leave();
        else voice.toggleMute();
      }}
      className={cn(
        "relative flex size-10 items-center justify-center rounded-full transition sm:size-11",
        !snapshot.joined && "text-ink-200 hover:bg-white/10 hover:text-white",
        snapshot.joined && !snapshot.muted && "bg-success/15 text-success hover:bg-success/25",
        snapshot.joined && snapshot.muted && !listenOnly && "bg-danger/15 text-danger hover:bg-danger/25",
        snapshot.joined && listenOnly && "bg-success/15 text-success hover:bg-success/25",
        snapshot.joining && "opacity-60",
      )}
      aria-label={label}
      aria-pressed={snapshot.joined ? (listenOnly ? true : !snapshot.muted) : undefined}
      title={label}
    >
      <AnimatePresence>
        {snapshot.speaking && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full ring-2 ring-success"
            initial={{ opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: [0.5, 1, 0.5], scale: [1, 1.08, 1] }}
            exit={{ opacity: 0 }}
            transition={reduce ? spring.snappy : { duration: 0.9, repeat: Infinity }}
          />
        )}
      </AnimatePresence>
      <Icon className={cn("size-5", snapshot.joining && !reduce && "animate-pulse")} />
      {!snapshot.joined && others > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={spring.bouncy}
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-success px-1 font-mono text-[10px] font-bold text-ink-950 tabular"
          aria-label={`${others} in voice`}
        >
          {others}
        </motion.span>
      )}
    </motion.button>
  );
}

function linkNote(m: VoiceMember, joined: boolean): string | null {
  if (!joined || m.link === null) return m.talk ? null : "listening";
  if (m.link === "connecting") return "connecting…";
  if (m.link === "failed") return "can't connect";
  return m.talk ? null : "listening";
}

/** The voice section of the HUD's options menu: who's in the call, mute someone for yourself, leave. */
export function VoiceMenu({ voice, match, onDone }: { voice: VoiceControls; match: Match; onDone: () => void }) {
  const { snapshot, listenOnly } = voice;
  const count = snapshot.members.length + (snapshot.joined ? 1 : 0);
  return (
    <div className="mb-1 border-b border-white/[0.08] pb-1.5">
      <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        Voice{count > 0 && ` · ${count} in call`}
      </p>
      {snapshot.members.length === 0 && <p className="px-3 pb-1.5 text-xs text-ink-400">{snapshot.joined ? "Just you so far." : "Nobody's talking yet."}</p>}
      {snapshot.members.map((m) => {
        const player = match.players.find((p) => p.userId === m.userId);
        const note = linkNote(m, snapshot.joined);
        return (
          <div key={m.userId} className="flex items-center gap-2.5 rounded-xl px-3 py-1.5">
            <span className="relative">
              {player ? (
                <Avatar person={player.profile} size={24} />
              ) : (
                <span className="flex size-6 items-center justify-center rounded-full bg-white/10">
                  <Headphones className="size-3 text-ink-300" />
                </span>
              )}
              {m.speaking && <span aria-hidden className="absolute -inset-[3px] rounded-full border-2 border-success" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{player ? player.profile.name || `@${player.profile.handle}` : "Spectator"}</span>
              {note && <span className={cn("block text-[11px]", m.link === "failed" ? "text-danger" : "text-ink-400")}>{note}</span>}
            </span>
            {m.talk && m.muted && <MicOff className="size-3.5 shrink-0 text-ink-400" aria-label="Muted" />}
            {m.talk && snapshot.joined && (
              <button
                onClick={() => voice.silence(m.userId, !m.silenced)}
                className={cn("flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-white/10", m.silenced ? "text-danger" : "text-ink-300")}
                aria-label={m.silenced ? "Hear them again" : "Mute them for me"}
                title={m.silenced ? "Hear them again" : "Mute them for me"}
              >
                {m.silenced ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            )}
          </div>
        );
      })}
      {snapshot.joined ? (
        <button
          onClick={() => {
            voice.leave();
            onDone();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-danger hover:bg-danger/10"
        >
          <PhoneOff className="size-4" /> Leave voice
        </button>
      ) : (
        <button
          disabled={snapshot.joining}
          onClick={() => {
            voice.join();
            onDone();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-white/[0.07]"
        >
          {listenOnly ? <Headphones className="size-4 text-ink-300" /> : <Mic className="size-4 text-ink-300" />}
          {listenOnly ? "Listen to voice chat" : "Join voice chat"}
        </button>
      )}
    </div>
  );
}
