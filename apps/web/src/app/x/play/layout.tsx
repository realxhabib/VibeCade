import type { Metadata } from "next";
import { XPlayerShell } from "@/components/x/player-shell";

export const metadata: Metadata = {
  title: { absolute: "XApps" },
  // The share pages (`/x`, `/x/<slug>`) are the public links.
  robots: { index: false },
};

// Never cached: the player is what stays live in a post after X caches the card.
export const dynamic = "force-dynamic";

/** `/x/play…`: what X frames inside a playable post (480×480 on desktop web). */
export default function XPlayerLayout({ children }: LayoutProps<"/x/play">) {
  return (
    <div className="min-h-dvh touch-manipulation overscroll-none bg-ink-950">
      <XPlayerShell>{children}</XPlayerShell>
    </div>
  );
}
