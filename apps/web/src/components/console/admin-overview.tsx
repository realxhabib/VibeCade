"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Gavel, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { SignInPrompt } from "@/components/pages/sign-in-prompt";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { spring } from "@/lib/motion";
import { useMounted } from "@/lib/use-mounted";
import { cn, formatNumber } from "@/lib/utils";
import { useViewer } from "@/platform/client";
import { useAdminOverview, useAdminPlayers, useIsAdmin } from "@/platform/queries";
import { isStandaloneApp } from "@/platform/shipping";
import type { AdminAppStats, AdminOverview, AdminPlayer } from "@/platform/types";
import { Legend, LineChart, SERIES_COLORS, StatTile } from "./charts";
import { Panel, PanelTitle, ago, fieldClass, useNow } from "./ui";

type Range = "7" | "30" | "90";
type View = "apps" | "players";

const SERIES = [
  { key: "matches" as const, label: "Matches", color: SERIES_COLORS[0] },
  { key: "players" as const, label: "Players", color: SERIES_COLORS[1] },
  { key: "newPeople" as const, label: "Sign-ups", color: SERIES_COLORS[2] },
];

/** `/admin`: every app's numbers and everyone on the platform (admins only). */
export function AdminOverviewPage() {
  const { viewer, loading } = useViewer();
  const isAdmin = useIsAdmin();
  const mounted = useMounted();

  if (!mounted || loading) return <OverviewSkeleton />;
  if (!viewer) return <SignInPrompt title="Sign in to open the admin view">Stats and players across every app, for VibeCade admins.</SignInPrompt>;
  if (!isAdmin) {
    return (
      <EmptyState emoji="🧭" title="This page got ratioed." action={<Button href="/">Back to VibeCade</Button>}>
        It doesn&apos;t exist, or it moved.
      </EmptyState>
    );
  }
  return <Overview />;
}

function Overview() {
  const reduced = useReducedMotion();
  const [range, setRange] = useState<Range>("30");
  const [view, setView] = useState<View>("apps");
  const { data, isPending, isError, isFetching } = useAdminOverview(Number(range));

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400">Admin</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">All apps</h1>
        </div>
        <Button href="/admin/review" variant="glass" size="sm" icon={<Gavel className="size-4" />}>
          Review queue
        </Button>
      </header>

      <div className="mt-6">
        <Segmented
          layoutId="admin-range"
          size="sm"
          value={range}
          onChange={setRange}
          items={[
            { id: "7", label: "7 days" },
            { id: "30", label: "30 days" },
            { id: "90", label: "90 days" },
          ]}
        />
      </div>

      {isPending ? (
        <OverviewSkeleton bare />
      ) : isError || !data ? (
        <EmptyState emoji="📉" title="Overview unavailable" className="mt-4">
          We couldn&apos;t load the platform numbers. Try again in a moment.
        </EmptyState>
      ) : (
        <motion.div
          className={cn("mt-4 space-y-4 transition-opacity", isFetching && "opacity-60")}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring.soft}
        >
          <Totals data={data} />
          <Panel>
            <PanelTitle sub={`Every app, last ${data.days} days. Test builds don't count.`}>Activity</PanelTitle>
            <div className="mt-3">
              <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color, value: formatNumber(data.series.reduce((n, d) => n + d[s.key], 0)) }))} />
            </div>
            <div className="mt-3">
              <LineChart data={data.series} series={SERIES} label={`Matches, players and sign-ups per day, last ${data.days} days`} />
            </div>
          </Panel>
        </motion.div>
      )}

      <div className="mt-6">
        <Segmented
          layoutId="admin-view"
          size="sm"
          value={view}
          onChange={setView}
          items={[
            { id: "apps" as const, label: "Apps", count: data?.totals.apps },
            { id: "players" as const, label: "Players", count: data?.totals.people },
          ]}
        />
      </div>
      <div className="mt-4">{view === "apps" ? data && <AppsPanel data={data} /> : <PlayersPanel />}</div>
    </div>
  );
}

function Totals({ data }: { data: AdminOverview }) {
  const t = data.totals;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="People" value={formatNumber(t.people)} sub={`${formatNumber(t.newPeople)} signed up`} trend={data.series.map((d) => d.newPeople)} />
      <StatTile label="Active players" value={formatNumber(t.activePlayers)} sub={`played or opened an app`} trend={data.series.map((d) => d.players)} />
      <StatTile label="Matches" value={formatNumber(t.matches)} sub={`${formatNumber(t.completed)} completed`} trend={data.series.map((d) => d.matches)} />
      <StatTile label="Apps" value={formatNumber(t.apps)} sub={`${formatNumber(t.listedApps)} listed`} />
    </div>
  );
}

function AppsPanel({ data }: { data: AdminOverview }) {
  const now = useNow(60_000);
  const [query, setQuery] = useState("");
  const q = query.trim().replace(/^@/, "").toLowerCase();
  const apps = q
    ? data.apps.filter((a) => a.app.slug.includes(q) || a.app.name.toLowerCase().includes(q) || a.app.developer.handle.toLowerCase().includes(q))
    : data.apps;

  return (
    <Panel>
      <PanelTitle sub={`Busiest first over the last ${data.days} days. Open one for its analytics, players and logs.`}>Apps</PanelTitle>
      <SearchField value={query} onChange={setQuery} placeholder="Search by app or @developer" label="Search apps" />
      {apps.length === 0 ? (
        <Nobody>{q ? `No app matches “${query.trim()}”.` : "No apps yet."}</Nobody>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/[0.06]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="text-left text-xs text-ink-400">
                <th className="px-3 py-2.5 font-normal">App</th>
                <th className="px-3 py-2.5 text-right font-normal">Matches</th>
                <th className="px-3 py-2.5 text-right font-normal">Players</th>
                <th className="px-3 py-2.5 text-right font-normal">All-time players</th>
                <th className="px-3 py-2.5 text-right font-normal">Opens</th>
                <th className="px-3 py-2.5 text-right font-normal">Last active</th>
                <th className="px-3 py-2.5 font-normal">
                  <span className="sr-only">Console</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <AppRow key={a.app.slug} stats={a} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function AppRow({ stats: s, now }: { stats: AdminAppStats; now: number }) {
  const { app } = s;
  const href = `/developers/apps/${app.slug}?tab=analytics`;
  return (
    <tr className="border-t border-white/[0.05]">
      <td className="px-3 py-2">
        <Link href={href} className="flex min-w-0 items-center gap-2.5 rounded-xl transition hover:opacity-80">
          <AppGlyph app={app} size={32} />
          <span className="min-w-0">
            <span className="block max-w-[220px] truncate font-semibold">{app.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
              {app.official ? "Official" : `@${app.developer.handle}`}
              {app.status !== "published" && <Badge tone={app.status === "pending" ? "gold" : "danger"}>{app.status === "pending" ? "Not listed" : "Rejected"}</Badge>}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular">{isStandaloneApp(app) ? "—" : formatNumber(s.matches)}</td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(s.players)}</td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(s.roster)}</td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(s.opens)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-ink-300">{s.lastActiveAt ? ago(s.lastActiveAt, now) : "—"}</td>
      <td className="px-3 py-2 text-right">
        <Link href={href} aria-label={`Open ${app.name}'s console`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-nova-300 hover:underline">
          Console <ArrowRight className="size-3" aria-hidden />
        </Link>
      </td>
    </tr>
  );
}

function PlayersPanel() {
  const now = useNow(60_000);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().replace(/^@/, ""));
  const { data, isPending, isError, isFetching } = useAdminPlayers(deferred);

  if (isPending) return <Skeleton className="h-80 rounded-[1.75rem]" />;
  if (isError || !data) {
    return (
      <EmptyState emoji="🫥" title="Players unavailable">
        We couldn&apos;t load the players. Try again in a moment.
      </EmptyState>
    );
  }
  return (
    <Panel>
      <PanelTitle
        sub={`${formatNumber(data.total)} people · ${formatNumber(data.newThisWeek)} new this week · ${formatNumber(data.activeThisWeek)} active this week. Emails stay per app, in each app's Players tab, and only for players who share theirs.`}
      >
        Players
      </PanelTitle>
      <SearchField value={query} onChange={setQuery} placeholder="Search by @handle or name" label="Search players" />
      {data.players.length === 0 ? (
        <Nobody>{deferred ? `Nobody matches “${deferred}”.` : "Nobody has signed up yet."}</Nobody>
      ) : (
        <div className={cn("mt-4 overflow-x-auto rounded-2xl border border-white/[0.06] transition-opacity", isFetching && "opacity-60")}>
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-white/[0.02]">
              <tr className="text-left text-xs text-ink-400">
                <th className="px-3 py-2.5 font-normal">Player</th>
                <th className="px-3 py-2.5 text-right font-normal">Matches</th>
                <th className="px-3 py-2.5 text-right font-normal">Wins</th>
                <th className="px-3 py-2.5 text-right font-normal">Apps</th>
                <th className="px-3 py-2.5 text-right font-normal">Opens</th>
                <th className="px-3 py-2.5 text-right font-normal">Joined</th>
                <th className="px-3 py-2.5 text-right font-normal">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.players.map((p) => (
                <PlayerRow key={p.profile.id} player={p} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!deferred && data.players.length < data.total && (
        <p className="mt-2 text-xs text-ink-400">Showing the {formatNumber(data.players.length)} most recent people. Search to find anyone else.</p>
      )}
    </Panel>
  );
}

function PlayerRow({ player: p, now }: { player: AdminPlayer; now: number }) {
  return (
    <tr className="border-t border-white/[0.05]">
      <td className="px-3 py-2">
        <Link href={`/u/${p.profile.handle}`} className="flex min-w-0 items-center gap-2.5 rounded-xl transition hover:opacity-80">
          <Avatar person={p.profile} size={30} />
          <span className="min-w-0">
            <span className="block max-w-[180px] truncate font-semibold">{p.profile.name || `@${p.profile.handle}`}</span>
            <span className="block truncate text-xs text-ink-400">@{p.profile.handle}</span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(p.matches)}</td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(p.wins)}</td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(p.apps)}</td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(p.opens)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-ink-300">{ago(p.joinedAt, now)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-ink-300">{p.lastSeenAt ? ago(p.lastSeenAt, now) : "—"}</td>
    </tr>
  );
}

function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative mt-4">
      <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-ink-400" aria-hidden />
      <input className={cn(fieldClass, "pl-10")} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} autoComplete="off" />
    </div>
  );
}

function Nobody({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-ink-400">{children}</p>;
}

function OverviewSkeleton({ bare = false }: { bare?: boolean }) {
  return (
    <div className={bare ? "mt-4" : undefined}>
      {!bare && <Skeleton className="h-12 w-56" />}
      <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", !bare && "mt-6")}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-64 rounded-[1.75rem]" />
    </div>
  );
}
