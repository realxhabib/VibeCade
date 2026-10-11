"use client";

import { useMemo, type ReactNode } from "react";
import { Toaster } from "@/components/chrome/toasts";
import { ConfettiLayer } from "@/components/motion/confetti";
import { AchievementLayer } from "@/components/play/achievement-moment";
import { HostRoutesProvider, type HostRoutes } from "@/components/play/host-routes";
import { xMatchPlayerPath, xMatchSharePath, xPlayerPath, xSharePath } from "@/lib/x-player";
import { PlatformProvider, useBackend } from "@/platform/client";

/** Inside the post: leaving a match comes back to the player, and links shared from it are playable posts too. */
const X_ROUTES: Omit<HostRoutes, "guest"> = {
  home: xPlayerPath(),
  apps: xPlayerPath(),
  app: (slug) => xPlayerPath(slug),
  match: (id) => xMatchPlayerPath(id),
  share: (slug) => xSharePath(slug),
  matchLink: (id) => xMatchSharePath(id),
  challenges: xPlayerPath(),
  arena: xPlayerPath(),
};

/** Guests play on this device and earn nothing; signed in, the card runs on the real backend. */
function XRoutes({ children }: { children: ReactNode }) {
  const guest = useBackend().kind === "demo";
  const routes = useMemo(() => ({ ...X_ROUTES, guest }), [guest]);
  return <HostRoutesProvider routes={routes}>{children}</HostRoutesProvider>;
}

/** The X player's host: the card's backend (signed in or guest), the match host's layers, and X routes. */
export function XPlayerShell({ children }: { children: ReactNode }) {
  return (
    <PlatformProvider guest>
      <XRoutes>
        <div data-app-host className="contents">
          {children}
        </div>
        <Toaster />
        <ConfettiLayer />
        <AchievementLayer />
      </XRoutes>
    </PlatformProvider>
  );
}
