"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { Avatar } from "@/components/ui/avatar";
import { goToHost } from "@/lib/host-nav";
import { play } from "@/lib/sfx";
import { useBackend, useViewer } from "@/platform/client";
import { canInterrupt, newLobbyAlerts } from "@/platform/presence";
import { useOnlinePlayers } from "@/platform/presence-client";
import { useApps } from "@/platform/queries";
import { seatedPlayers } from "@/components/play/match-view";
import { toast } from "./toasts";

const ALERTS_KEY = "xapps:lobby-alerts";
const listeners = new Set<() => void>();

/** Whether the viewer wants a toast when someone online opens a lobby (on unless turned off). */
export function lobbyAlertsEnabled(): boolean {
  try {
    return window.localStorage.getItem(ALERTS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setLobbyAlerts(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(ALERTS_KEY);
    else window.localStorage.setItem(ALERTS_KEY, "off");
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function onLobbyAlertsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLobbyAlertsSetting(): boolean {
  return useSyncExternalStore(onLobbyAlertsChange, lobbyAlertsEnabled, () => true);
}

/**
 * "@xhabib is waiting in the Frontline lobby": a toast with Join whenever someone online opens a
 * lobby anyone can take a seat at, on any page (in a practice game too: joining leaves it). Never
 * mid-match against people. Each lobby is announced once, and only after the match checks out
 * (it's still open, with a seat, and that person really is its host), since presence is client-sent.
 */
export function LobbyAlerts() {
  const backend = useBackend();
  const router = useRouter();
  const { viewer } = useViewer();
  const { data: apps } = useApps();
  const players = useOnlinePlayers();
  const enabled = useLobbyAlertsSetting();
  /** Lobbies already announced (or open when we arrived, which the online list shows instead). */
  const announced = useRef<Set<string> | null>(null);
  const viewerId = viewer?.id;

  useEffect(() => {
    announced.current = null;
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId) return;
    const mine = backend.presence.getActivity();
    if (!announced.current) {
      // Whatever is open when we first hear who's online is in the list already: no burst of toasts.
      if (players.length === 0) return;
      announced.current = new Set();
      newLobbyAlerts(players, viewerId, mine, announced.current);
      return;
    }
    const alerts = newLobbyAlerts(players, viewerId, mine, announced.current);
    if (!enabled || !canInterrupt(mine)) return;
    for (const host of alerts) {
      const lobby = host.activity;
      if (lobby?.kind !== "lobby") continue;
      void backend
        .getMatch(lobby.matchId)
        .then((match) => {
          if (!match || (match.status !== "open" && match.status !== "pending") || !match.isOpen) return;
          if (match.createdBy !== host.userId && !match.players.some((p) => p.userId === host.userId && p.state === "joined")) return;
          if (match.players.some((p) => p.userId === viewerId)) return;
          const seatsLeft = Math.max(2, match.maxPlayers) - seatedPlayers(match).length;
          if (seatsLeft <= 0) return;
          const now = backend.presence.getActivity();
          if (!canInterrupt(now)) return;
          const app = apps?.find((a) => a.slug === match.appSlug);
          const practicing = now?.kind === "playing" && now.mode === "practice";
          play("notify");
          toast(`@${host.handle} is waiting in the lobby`, {
            description: `${app?.name ?? "A match"} · ${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left${practicing ? " · leaves your practice game" : ""}`,
            icon: app ? <AppGlyph app={app} size={28} /> : <Avatar person={host} size={28} />,
            action: { label: "Join", onClick: () => goToHost(router, `/play/${match.id}?join=1`) },
            duration: 12_000,
          });
        })
        .catch(() => undefined);
    }
  }, [apps, backend, enabled, players, router, viewerId]);

  return null;
}
