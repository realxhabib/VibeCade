"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { spring } from "@/lib/motion";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { OFFICIAL_APPS } from "@/platform/catalog";
import { useViewer } from "@/platform/client";
import { levelInfo } from "@/platform/scoring";
import { useApps, useLeaderboard } from "@/platform/queries";
import type { AppManifest, LeaderRow } from "@/platform/types";
import { StatLeaderboards } from "./app-progress";

const PODIUM = [
  { place: 2, height: "h-28", color: "from-[#c9d2e6] to-[#8b97b3]", delay: 0.15 },
  { place: 1, height: "h-40", color: "from-[#ffe08a] to-[#ffb13d]", delay: 0 },
  { place: 3, height: "h-20", color: "from-[#f0b58a] to-[#b56a3d]", delay: 0.3 },
];

function Podium({ rows }: { rows: LeaderRow[] }) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-3 items-end gap-3">
      {PODIUM.map(({ place, height, color, delay }) => {
        const row = rows[place - 1];
        if (!row) return <div key={place} />;
        return (
          <Link key={place} href={`/u/${row.profile.handle}`} className="group flex flex-col items-center">
            <motion.div
              className="relative"
              initial={{ y: 30, opacity: 0, scale: 0.6 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: delay + 0.35, ...spring.bouncy }}
            >
              {place === 1 && (
                <motion.span
                  className="absolute -top-7 left-1/2 -translate-x-1/2 text-3xl"
                  initial={{ y: -20, rotate: -30, opacity: 0 }}
                  animate={{ y: [0, -4, 0], rotate: 0, opacity: 1 }}
                  transition={{ delay: 0.9, y: { duration: 2, repeat: Infinity, delay: 1.2 }, rotate: spring.wobbly }}
                >
                  👑
                </motion.span>
              )}
              <Avatar person={row.profile} size={place === 1 ? 88 : 68} ring={levelInfo(row.profile.xp).progress} ringColor={place === 1 ? "#ffc93d" : "#c9d2e6"} />
            </motion.div>
            <p className="mt-2 max-w-full truncate text-sm font-semibold group-hover:underline">@{row.profile.handle}</p>
            <p className="font-mono text-xs text-ink-400 tabular">{row.xp.toLocaleString("en")} XP</p>
            <motion.div
              className={cn("mt-3 flex w-full items-start justify-center rounded-t-3xl bg-gradient-to-b pt-3", height, color)}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              style={{ transformOrigin: "bottom" }}
              transition={{ delay, type: "spring", stiffness: 120, damping: 16 }}
            >
              <span className="font-display text-4xl font-extrabold text-ink-950/80">{place}</span>
            </motion.div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Apps with a board here: games rank by match wins/XP; standalone apps (no matches) only when they
 * declare stats, whose boards they show instead. Official apps first (catalog order), then published
 * community apps by popularity.
 */
function rankedApps(apps: AppManifest[]): AppManifest[] {
  const ranked = apps.filter((a) => a.status === "published" && !a.retired && (a.kind !== "app" || !!a.stats?.length));
  const community = ranked
    .filter((a) => !a.official)
    .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0) || b.playCount - a.playCount || a.name.localeCompare(b.name));
  return [...ranked.filter((a) => a.official), ...community];
}

export function Leaderboard() {
  const router = useRouter();
  const params = useSearchParams();
  const app = params.get("app") ?? "all";
  const { viewer } = useViewer();
  const mounted = useMounted();
  const { data: cachedApps } = useApps();
  // Until the apps list loads (or if it fails), the built-in apps still show; the server render has
  // no list, so the first client render doesn't use a cached one either (hydration).
  const apps = mounted ? cachedApps : undefined;
  const boards = rankedApps(apps ?? OFFICIAL_APPS);
  const picked = app === "all" ? null : (boards.find((a) => a.slug === app) ?? apps?.find((a) => a.slug === app) ?? null);
  const standalone = picked?.kind === "app";
  const { data, isPending } = useLeaderboard(app === "all" ? undefined : app, !standalone);
  const filterRef = useRef<HTMLDivElement>(null);
  const tabCount = boards.length;

  // A deep link to a community app picks a tab past the strip's edge: scroll the strip (not the page) to it.
  useEffect(() => {
    const strip = filterRef.current?.querySelector<HTMLElement>("[role=tablist]");
    const tab = strip?.querySelector<HTMLElement>("[aria-selected=true]");
    if (!strip || !tab) return;
    const left = tab.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + tab.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - (strip.clientWidth - tab.offsetWidth) / 2 });
    }
  }, [app, tabCount]);

  return (
    <div>
      <motion.header className="text-center" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-gold">Leaderboard</p>
        <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">Hall of receipts</h1>
      </motion.header>
      <div ref={filterRef} className="mt-6 flex justify-center">
        <Segmented
          layoutId="lb-filter"
          size="sm"
          value={app}
          onChange={(value) => router.replace(value === "all" ? "/leaderboard" : `/leaderboard?app=${value}`, { scroll: false })}
          items={[
            { id: "all", label: "Overall" },
            ...boards.map((a) => ({ id: a.slug, label: a.name, icon: a.iconImage ? <AppGlyph app={a} size={18} /> : <span>{a.icon}</span> })),
          ]}
        />
      </div>
      {picked && !picked.official && (
        <p className="mt-3 text-center text-xs text-ink-400">
          Community {standalone ? "app" : "game"}
          {picked.developer.id && <> by @{picked.developer.handle}</>} ·{" "}
          <Link href={`/apps/${picked.slug}`} className="text-ink-200 underline-offset-2 hover:underline">
            Open {picked.name}
          </Link>
        </p>
      )}
      <div className="mt-12">
        {standalone && picked ? (
          picked.stats?.length ? (
            <div className="mx-auto max-w-2xl">
              <StatLeaderboards key={picked.slug} app={picked} stats={picked.stats} />
            </div>
          ) : (
            <EmptyState emoji="📊" title="No leaderboard">
              {picked.name} doesn&apos;t keep stats yet.
            </EmptyState>
          )
        ) : isPending ? (
          <Skeleton className="mx-auto h-72 max-w-2xl rounded-[2rem]" />
        ) : !data || data.length === 0 ? (
          <EmptyState emoji="🏁" title="No ranked matches yet">
            Win a match to claim the top spot.
          </EmptyState>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={app} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}>
              <Podium rows={data} />
              <ol className="mx-auto mt-2 max-w-2xl space-y-2">
                {data.slice(3).map((row, i) => {
                  const me = row.profile.id === viewer?.id;
                  return (
                    <motion.li
                      key={row.profile.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + Math.min(i, 12) * 0.035, ...spring.soft }}
                    >
                      <Link
                        href={`/u/${row.profile.handle}`}
                        className={cn(
                          "flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-ink-850/70 px-4 py-3 transition hover:border-white/15 hover:bg-ink-800",
                          me && "border-volt/40 bg-volt/[0.06]",
                        )}
                      >
                        <span className="w-7 text-center font-mono text-sm font-bold text-ink-400">{row.rank}</span>
                        <Avatar person={row.profile} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">
                            {row.profile.name} {me && <span className="text-xs text-volt">(you)</span>}
                          </p>
                          <p className="truncate text-xs text-ink-400">@{row.profile.handle}</p>
                        </div>
                        <div className="hidden text-right text-xs text-ink-400 sm:block">
                          <p>
                            <b className="font-mono text-sm text-ink-100">{row.wins}</b> wins
                          </p>
                          <p>{row.played} played</p>
                        </div>
                        <p className="w-20 text-right font-mono font-bold tabular">
                          <AnimatedNumber value={row.xp} />
                          <span className="ml-1 text-xs font-normal text-ink-400">XP</span>
                        </p>
                      </Link>
                    </motion.li>
                  );
                })}
              </ol>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
