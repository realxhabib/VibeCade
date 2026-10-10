"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/chrome/toasts";
import { ConfettiLayer } from "@/components/motion/confetti";
import { AchievementLayer } from "@/components/play/achievement-moment";
import { HostRoutesProvider, type HostRoutes } from "@/components/play/host-routes";
import { xPlayerPath, xSharePath } from "@/lib/x-player";
import { PlatformProvider } from "@/platform/client";

/** Inside the post: leaving a match comes back to the player, and results share playable links. */
const X_ROUTES: HostRoutes = {
  home: xPlayerPath(),
  apps: xPlayerPath(),
  app: (slug) => xPlayerPath(slug),
  match: (id) => `${xPlayerPath()}/match/${id}`,
  share: (slug) => xSharePath(slug),
  guest: true,
};

/** The X player's host: the guest backend, the match host's layers, and X routes. */
export function XPlayerShell({ children }: { children: ReactNode }) {
  return (
    <PlatformProvider guest>
      <HostRoutesProvider routes={X_ROUTES}>
        <div data-app-host className="contents">
          {children}
        </div>
        <Toaster />
        <ConfettiLayer />
        <AchievementLayer />
      </HostRoutesProvider>
    </PlatformProvider>
  );
}
