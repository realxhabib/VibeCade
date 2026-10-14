"use client";

import { useQuery } from "@tanstack/react-query";
import { getOfficialApp } from "@/platform/catalog";
import { adoptGuestApp, getCardCatalog } from "@/platform/guest";
import type { AppManifest } from "@/platform/types";

/** Everything the card lists: the first-party apps right away, then community apps from the catalog. */
export function useCardApps(initial: AppManifest[]): AppManifest[] {
  const { data } = useQuery({
    queryKey: ["x-card", "apps"],
    queryFn: () => getCardCatalog().listApps(),
    staleTime: 60_000,
  });
  return (data ?? initial).filter((app) => app.status === "published" && !app.retired);
}

/** A community app's page in the card (first-party apps come from the catalog on the server). */
export function useCardApp(slug: string) {
  return useQuery({
    queryKey: ["x-card", "app", slug],
    queryFn: async () => {
      const app = await getCardCatalog().getApp(slug);
      if (app && !getOfficialApp(slug)) adoptGuestApp(app);
      return app;
    },
    staleTime: 60_000,
    retry: 1,
  });
}
