"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { goToHost } from "@/lib/host-nav";
import { play } from "@/lib/sfx";
import { BLUR_TWEEN, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { activityLabel, joinableLobby, type OnlinePlayer } from "@/platform/presence";
import { useOnlineOthers, useOnlineStatus } from "@/platform/presence-client";
import { useApps } from "@/platform/queries";
import { setLobbyAlerts, useLobbyAlertsSetting } from "./lobby-alerts";

function OnlineRow({ player, onDone }: { player: OnlinePlayer; onDone: () => void }) {
  const router = useRouter();
  const { data: apps } = useApps();
  const slug = player.activity?.appSlug;
  const app = slug ? apps?.find((a) => a.slug === slug) : undefined;
  const lobby = joinableLobby(player);
  return (
    <div className="flex items-center gap-3 rounded-2xl px-2.5 py-2 hover:bg-white/[0.04]">
      <Link href={`/u/${player.handle}`} onClick={onDone} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar person={player} size={36} online />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{player.name}</span>
          <span className={cn("block truncate text-xs", lobby ? "text-volt" : "text-ink-400")}>{activityLabel(player.activity, app?.name)}</span>
        </span>
      </Link>
      {lobby ? (
        <Button
          size="sm"
          variant="volt"
          onClick={() => {
            onDone();
            goToHost(router, `/play/${lobby.matchId}?join=1`);
          }}
        >
          Join
        </Button>
      ) : (
        <Button size="sm" variant="glass" href={`/u/${player.handle}`} onClick={onDone}>
          Challenge
        </Button>
      )}
    </div>
  );
}

/** Top bar: who else is online (a green dot and a few faces), and a list to join their lobbies or challenge them. */
export function OnlineNow() {
  const others = useOnlineOthers();
  const status = useOnlineStatus();
  /** Until we're on the channel, an empty list means "don't know", not "nobody". */
  const count = others.length === 0 && status !== "live" ? "–" : String(others.length);
  const alerts = useLobbyAlertsSetting();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const waiting = others.some((p) => joinableLobby(p));

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => {
          setOpen((o) => !o);
          play("pop");
        }}
        className={cn(
          "flex h-10 items-center gap-2 rounded-full border bg-white/[0.03] pl-3 pr-3 text-sm transition hover:border-white/20",
          waiting ? "border-volt/40 text-ink-50" : "border-white/10 text-ink-300 hover:text-ink-100",
        )}
        aria-label={`${others.length} other${others.length === 1 ? "" : "s"} online`}
        aria-expanded={open}
      >
        <span className="relative flex size-2.5">
          {!reduced && others.length > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
          <span className={cn("relative size-2.5 rounded-full", others.length > 0 ? "bg-success" : "bg-ink-500")} />
        </span>
        <span className="hidden -space-x-2 sm:flex">
          {others.slice(0, 3).map((p) => (
            <Avatar key={p.userId} person={p} size={22} className="rounded-full ring-2 ring-ink-900" />
          ))}
        </span>
        <span className="tabular font-semibold">{count}</span>
        <span className="hidden md:inline">online</span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -6, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12 } }}
            transition={{ ...spring.snappy, filter: BLUR_TWEEN }}
            style={{ transformOrigin: "top right" }}
            className="glass-strong fixed inset-x-3 top-[4.75rem] z-50 overflow-hidden rounded-3xl p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80"
          >
            <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
              <p className="text-sm font-semibold">
                Online now <span className="tabular text-ink-400">· {count}</span>
              </p>
              <button
                onClick={() => setLobbyAlerts(!alerts)}
                className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-ink-300 transition hover:bg-white/[0.07] hover:text-ink-100"
                title="A notification when someone online opens a lobby you can join"
              >
                {alerts ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
                Lobby alerts {alerts ? "on" : "off"}
              </button>
            </div>
            {others.length === 0 && status !== "live" ? (
              <p className="px-3 pb-4 pt-3 text-sm text-ink-400">
                {status === "unavailable"
                  ? "Can't reach the online list right now, so we can't tell who's on. Retrying…"
                  : "Checking who's online…"}
              </p>
            ) : others.length === 0 ? (
              <p className="px-3 pb-4 pt-3 text-sm text-ink-400">
                Nobody else is on right now. Open a lobby and share the link, and anyone who comes online will see it.
              </p>
            ) : (
              <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
                {others.map((p) => (
                  <OnlineRow key={p.userId} player={p} onDone={() => setOpen(false)} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
