"use client";

import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/chrome/logo";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { isSupabaseConfigured } from "@/lib/env";
import { useMounted } from "@/lib/use-mounted";
import { useBackend } from "@/platform/client";
import { fadeUp, staggerChildren } from "@/lib/motion";
import { opensInPost, xPlayerPath } from "@/lib/x-player";
import type { AppManifest } from "@/platform/types";
import { XAccount } from "./account";
import { useCardApps } from "./card-catalog";

/** `/x/play`: every app as a tile, sized for the 480×480 frame (and phones). */
export function XPlayerHub({ apps: firstParty }: { apps: AppManifest[] }) {
  const apps = useCardApps(firstParty);
  // After mounting: the server renders the guest's text (the card's session lives in this browser).
  const mounted = useMounted();
  const signedIn = useBackend().kind === "supabase" && mounted;
  const ordered = [...apps.filter(opensInPost), ...apps.filter((app) => !opensInPost(app))];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-3 pb-3">
      <header className="flex h-12 shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="font-display text-[17px] font-extrabold tracking-tight text-ink-50">VibeCade</span>
        </div>
        <XAccount />
      </header>
      <p className="mb-3 text-[13px] text-ink-300">
        {!isSupabaseConfigured
          ? "Pick a game and play right here."
          : signedIn
            ? "Pick a game: challenge anyone on X, or play the bots, right here."
            : "Pick a game: play the bots, or sign in to challenge people right here."}
      </p>
      <motion.ul className="grid grid-cols-3 gap-2" variants={staggerChildren(0.03)} initial="hidden" animate="show">
        {ordered.map((app) => {
          const inPost = opensInPost(app);
          return (
            <motion.li key={app.slug} variants={fadeUp}>
              <Link
                href={xPlayerPath(app.slug)}
                className="flex h-full flex-col items-center gap-1.5 rounded-2xl glass px-1.5 pb-2.5 pt-3 text-center transition-colors hover:bg-white/10"
              >
                <AppGlyph app={app} size={48} />
                <span className="line-clamp-1 text-[13px] font-semibold text-ink-50">{app.name}</span>
                <span className="flex items-center gap-0.5 text-[11px] text-ink-400">
                  {inPost ? app.durationLabel : "Opens VibeCade"}
                  {!inPost && <ArrowUpRight className="size-3" />}
                </span>
              </Link>
            </motion.li>
          );
        })}
      </motion.ul>
    </main>
  );
}
