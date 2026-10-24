"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where the match host sends people (leave, rematch, results, share). The site
 * uses its own pages; the X player (`/x/play`) keeps everything inside the
 * post's frame and shares playable `/x/<slug>` links instead.
 */
export interface HostRoutes {
  home: string;
  /** The catalog (where a retired app's matches point). */
  apps: string;
  app(slug: string): string;
  match(id: string): string;
  /** The page a results post links to. */
  share(slug: string): string;
  /** The link people pass around to join a match: opening it takes the seat and lands in the lobby. */
  matchLink(id: string): string;
  /** Where declining or finishing elsewhere goes (the viewer's challenges). */
  challenges: string;
  /** The crowd vote for contests. */
  arena: string;
  /** The viewer is the X player's guest: matches run on this device by design and earn nothing. */
  guest: boolean;
}

export const SITE_ROUTES: HostRoutes = {
  home: "/",
  apps: "/apps",
  app: (slug) => `/apps/${slug}`,
  match: (id) => `/play/${id}`,
  share: (slug) => `/apps/${slug}`,
  matchLink: (id) => `/play/${id}?join=1`,
  challenges: "/challenges",
  arena: "/arena",
  guest: false,
};

const HostRoutesContext = createContext<HostRoutes>(SITE_ROUTES);

export function HostRoutesProvider({ routes, children }: { routes: HostRoutes; children: ReactNode }) {
  return <HostRoutesContext.Provider value={routes}>{children}</HostRoutesContext.Provider>;
}

export function useHostRoutes(): HostRoutes {
  return useContext(HostRoutesContext);
}
