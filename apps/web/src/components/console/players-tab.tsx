"use client";

import { motion, useReducedMotion } from "motion/react";
import { Copy, Download, Mail, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { toast } from "@/components/chrome/toasts";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { cn, formatNumber } from "@/lib/utils";
import { useAppPlayers } from "@/platform/queries";
import { isStandaloneApp } from "@/platform/shipping";
import type { AppManifest, AppPlayer } from "@/platform/types";
import { StatTile } from "./charts";
import { playersCsv } from "./players-csv";
import { Panel, PanelTitle, ago, fieldClass, useNow } from "./ui";

type Show = "all" | "email";

/** The people who play the app: a small CRM, with the emails players chose to share. */
export function PlayersTab({ app }: { app: AppManifest }) {
  const reduced = useReducedMotion();
  const now = useNow(60_000);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const deferred = useDeferredValue(query.trim().replace(/^@/, ""));
  const { data, isPending, isError, isFetching } = useAppPlayers(app.slug, deferred);
  const standalone = isStandaloneApp(app);

  const players = (data?.players ?? []).filter((p) => show === "all" || p.email);
  const emails = players.flatMap((p) => (p.email ? [p.email] : []));

  const copyEmails = async () => {
    try {
      await navigator.clipboard.writeText(emails.join(", "));
      play("pop");
      toast(`Copied ${emails.length} ${emails.length === 1 ? "email" : "emails"}`, { tone: "success" });
    } catch {
      toast("Couldn't copy to the clipboard", { tone: "danger" });
    }
  };

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([playersCsv(players)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${app.slug}-players-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    play("tick");
  };

  if (isPending) return <PlayersSkeleton />;
  if (isError || !data) {
    return (
      <EmptyState emoji="🫥" title="Players unavailable">
        We couldn&apos;t load this app&apos;s players. Try again in a moment.
      </EmptyState>
    );
  }
  if (data.total === 0) {
    return (
      <EmptyState emoji="👋" title="No players yet">
        Everyone who plays {app.name} signed in shows up here. Test builds don&apos;t count.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <motion.div
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
      >
        <StatTile label="Players" value={formatNumber(data.total)} sub="all time" />
        <StatTile label="Sharing their email" value={formatNumber(data.emailsShared)} sub={data.total ? `${Math.round((data.emailsShared / data.total) * 100)}% of players` : undefined} />
        <StatTile label="New this week" value={formatNumber(data.newThisWeek)} sub="first played in 7 days" className="col-span-2 lg:col-span-1" />
      </motion.div>

      <Panel>
        <PanelTitle
          sub={
            <>
              Emails appear only for players who chose to share theirs with you from {app.name}&apos;s page. Use them for news about your app, and honour unsubscribes.
            </>
          }
        >
          Players
        </PanelTitle>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-ink-400" aria-hidden />
            <input
              className={cn(fieldClass, "pl-10")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by @handle or name"
              aria-label="Search players"
              autoComplete="off"
            />
          </div>
          <Segmented
            layoutId="players-show"
            size="sm"
            className="shrink-0 self-start"
            value={show}
            onChange={setShow}
            items={[
              { id: "all" as const, label: "Everyone" },
              { id: "email" as const, label: "Shared email", icon: <Mail className="size-3.5" aria-hidden /> },
            ]}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" icon={<Copy className="size-3.5" />} disabled={emails.length === 0} onClick={copyEmails}>
            Copy emails{emails.length > 0 && ` (${formatNumber(emails.length)})`}
          </Button>
          <Button size="sm" variant="outline" icon={<Download className="size-3.5" />} disabled={players.length === 0} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>

        {players.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-ink-400">
            {deferred ? `Nobody matches “${deferred}”.` : "Nobody has shared their email yet."}
          </p>
        ) : (
          <div className={cn("mt-4 overflow-x-auto rounded-2xl border border-white/[0.06] transition-opacity", isFetching && "opacity-60")}>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-white/[0.02]">
                <tr className="text-left text-xs text-ink-400">
                  <th className="px-3 py-2.5 font-normal">Player</th>
                  <th className="px-3 py-2.5 font-normal">Email</th>
                  <th className="px-3 py-2.5 text-right font-normal">{standalone ? "Opens" : "Matches"}</th>
                  {!standalone && <th className="px-3 py-2.5 text-right font-normal">Wins</th>}
                  <th className="px-3 py-2.5 text-right font-normal">First seen</th>
                  <th className="px-3 py-2.5 text-right font-normal">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <PlayerRow key={p.profile.id} player={p} standalone={standalone} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!deferred && data.players.length < data.total && (
          <p className="mt-2 text-xs text-ink-400">Showing the {formatNumber(data.players.length)} most recent players. Search to find anyone else.</p>
        )}
      </Panel>
    </div>
  );
}

function PlayerRow({ player: p, standalone, now }: { player: AppPlayer; standalone: boolean; now: number }) {
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
      <td className="px-3 py-2">
        {p.email ? (
          <a href={`mailto:${p.email}`} className="block max-w-[220px] truncate text-ink-100 underline-offset-2 hover:underline">
            {p.email}
          </a>
        ) : (
          <span className="text-ink-500">Not shared</span>
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(standalone ? p.opens : p.matches)}</td>
      {!standalone && <td className="px-3 py-2 text-right font-mono tabular">{formatNumber(p.wins)}</td>}
      <td className="whitespace-nowrap px-3 py-2 text-right text-ink-300">{p.firstSeenAt ? ago(p.firstSeenAt, now) : "—"}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-ink-300">{p.lastSeenAt ? ago(p.lastSeenAt, now) : "—"}</td>
    </tr>
  );
}

function PlayersSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className={cn("h-24 rounded-3xl", i === 2 && "col-span-2 lg:col-span-1")} />
        ))}
      </div>
      <Skeleton className="h-80 rounded-[1.75rem]" />
    </div>
  );
}
