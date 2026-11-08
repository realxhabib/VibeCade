"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useBackend, useViewer } from "./client";
import type { OnlineActivity, OnlinePlayer } from "./presence";

const NONE: OnlinePlayer[] = [];

/** Everyone online, the viewer included (empty when signed out). */
export function useOnlinePlayers(): OnlinePlayer[] {
  const { presence } = useBackend();
  return useSyncExternalStore(presence.subscribe, presence.snapshot, () => NONE);
}

/** Everyone online but the viewer. */
export function useOnlineOthers(): OnlinePlayer[] {
  const players = useOnlinePlayers();
  const { viewer } = useViewer();
  return useMemo(() => players.filter((p) => p.userId !== viewer?.id), [players, viewer?.id]);
}

/** Shares what the viewer is doing while the calling component is mounted (null: nothing). */
export function useAnnounceActivity(activity: OnlineActivity | null): void {
  const { presence } = useBackend();
  const key = activity ? JSON.stringify(activity) : "";
  useEffect(() => {
    if (!key) return;
    presence.setActivity(JSON.parse(key) as OnlineActivity);
    return () => presence.setActivity(null);
  }, [key, presence]);
}
