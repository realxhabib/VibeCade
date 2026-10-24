"use client";

import { ArrowLeft, Inbox, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "@/components/chrome/toasts";
import { MatchCard } from "@/components/marketplace/match-card";
import { groupMyMatches, type ChallengeTab } from "@/components/pages/challenges";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { goToHost } from "@/lib/host-nav";
import { useMounted } from "@/lib/use-mounted";
import { xChallengesPath, xMatchPlayerPath, xPlayerPath } from "@/lib/x-player";
import { useViewer } from "@/platform/client";
import { useApps, useMatchAction, useMyMatches } from "@/platform/queries";
import { levelInfo, levelTitle } from "@/platform/scoring";
import { XSignInButton, usePlaysForReal } from "./account";
import { signOutXPlayer } from "./use-x-sign-in";

function CardPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col px-3 pb-3">
      <header className="flex h-12 shrink-0 items-center gap-2">
        <Link href={xPlayerPath()} className="-ml-1 flex items-center gap-1 rounded-full px-2 py-1.5 text-[13px] font-semibold text-ink-200 hover:bg-white/[0.06] hover:text-ink-50">
          <ArrowLeft className="size-4" /> All games
        </Link>
        <h1 className="ml-auto font-display text-[15px] font-extrabold text-ink-50">{title}</h1>
      </header>
      {children}
    </main>
  );
}

/** Signed out (or a guest on this device): sign in first. */
function SignInFirst({ why }: { why: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-ink-300">{why}</p>
      <XSignInButton size="lg" />
    </div>
  );
}

/** `/x/play/challenges`: the challenges waiting on you, the ones you sent, and finished matches. */
export function XPlayerChallenges() {
  const router = useRouter();
  const mounted = useMounted();
  const forReal = usePlaysForReal();
  const { viewer } = useViewer();
  const { data, isPending } = useMyMatches();
  const { data: apps } = useApps();
  const action = useMatchAction();
  const [tab, setTab] = useState<ChallengeTab>("move");
  const groups = useMemo(() => groupMyMatches(data, viewer?.id), [data, viewer]);

  if (!mounted) return <CardPage title="Challenges">{null}</CardPage>;
  if (!forReal || !viewer) return <CardPage title="Challenges"><SignInFirst why="Sign in with X to see who challenged you and the challenges you sent." /></CardPage>;

  const respond = async (matchId: string, kind: "join" | "decline") => {
    try {
      await action.mutateAsync({ action: kind, matchId });
      if (kind === "join") goToHost(router, xMatchPlayerPath(matchId));
      else toast("Challenge declined");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Something went wrong", { tone: "danger" });
    }
  };
  const list = groups[tab];
  return (
    <CardPage title="Challenges">
      <Segmented
        layoutId="x-challenges-tab"
        value={tab}
        onChange={setTab}
        items={[
          { id: "move", label: "Your move", count: groups.move.length },
          { id: "waiting", label: "Waiting", count: groups.waiting.length },
          { id: "history", label: "History" },
        ]}
      />
      <div className="mt-3 flex flex-col gap-2">
        {isPending ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-3xl" />)
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-sm text-ink-300">
              {tab === "move" ? "Nothing waiting on you." : tab === "waiting" ? "No open challenges." : "Finished matches show up here."}
            </p>
            <Button href={xPlayerPath()} size="md" variant="accent">
              Challenge someone
            </Button>
          </div>
        ) : (
          list.map((m) => {
            const invited = m.players.find((p) => p.userId === viewer.id)?.state === "invited";
            return (
              <MatchCard
                key={m.id}
                match={m}
                viewerId={viewer.id}
                apps={apps}
                onAccept={invited ? () => void respond(m.id, "join") : undefined}
                onDecline={invited ? () => void respond(m.id, "decline") : undefined}
              />
            );
          })
        )}
      </div>
    </CardPage>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl glass px-2 py-2">
      <span className="font-display text-xl font-extrabold tabular-nums text-ink-50">{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
    </div>
  );
}

/** `/x/play/me`: your level, record and recent matches, and signing out. */
export function XPlayerMe() {
  const mounted = useMounted();
  const forReal = usePlaysForReal();
  const { viewer } = useViewer();
  const { data } = useMyMatches();
  const { data: apps } = useApps();
  if (!mounted) return <CardPage title="You">{null}</CardPage>;
  if (!forReal || !viewer) return <CardPage title="You"><SignInFirst why="Sign in with X to keep your wins, XP and streaks." /></CardPage>;

  const lv = levelInfo(viewer.xp);
  const recent = groupMyMatches(data, viewer.id).history.slice(0, 5);
  const waiting = groupMyMatches(data, viewer.id).move.length;
  return (
    <CardPage title="You">
      <div className="flex items-center gap-3">
        <Avatar person={viewer} size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-extrabold text-ink-50">{viewer.name}</p>
          <p className="truncate text-sm text-ink-300">@{viewer.handle}</p>
        </div>
      </div>
      <div className="mt-3 rounded-2xl glass px-3 py-2.5">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-bold text-ink-50">
            Level {lv.level} · {levelTitle(lv.level)}
          </span>
          <span className="tabular-nums text-ink-400">
            {viewer.xp} / {lv.next} XP
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,#00a8e8,#e600e6)]" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        <Stat label="Wins" value={viewer.wins} />
        <Stat label="Losses" value={viewer.losses} />
        <Stat label="Draws" value={viewer.draws} />
        <Stat label="Best run" value={viewer.bestStreak} />
      </div>
      <Link href={xChallengesPath()} className="mt-2 flex items-center gap-2 rounded-2xl glass px-3 py-2.5 text-sm font-semibold text-ink-100 hover:bg-white/10">
        <Inbox className="size-4" /> Challenges
        {waiting > 0 && <span className="ml-auto rounded-full bg-[#ff5ca8] px-2 text-xs font-bold leading-5 text-white">{waiting} waiting on you</span>}
      </Link>
      {recent.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-[0.18em] text-ink-400">Recent matches</p>
          <div className="flex flex-col gap-2">
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} viewerId={viewer.id} apps={apps} />
            ))}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => void signOutXPlayer()}
        className="mx-auto mt-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-ink-400 hover:bg-white/[0.06] hover:text-ink-100"
      >
        <LogOut className="size-3.5" /> Sign out
      </button>
    </CardPage>
  );
}
