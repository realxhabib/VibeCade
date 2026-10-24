"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, BarChart3, ExternalLink, FlaskConical, GitBranch, Plus, Rocket } from "lucide-react";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "@/components/chrome/toasts";
import { celebrate } from "@/components/motion/confetti";
import { AppGlyph } from "@/components/marketplace/app-glyph";
import { DeveloperNotices } from "@/components/pages/developer-notices";
import { SignInPrompt } from "@/components/pages/sign-in-prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { useMounted } from "@/lib/use-mounted";
import { accentVars, cn } from "@/lib/utils";
import { useViewer } from "@/platform/client";
import { useAppsVersions, useMyApps, usePublishVersion } from "@/platform/queries";
import type { AppManifest, AppVersion } from "@/platform/types";
import { ConfirmDialog } from "./confirm";
import { ManifestDiff, VersionStatusChip, ago, useNow } from "./ui";
import { sideOf } from "./version-editor";
import { summarizeVersions, type NextStep, type VersionSummary } from "./version-summary";

const NEXT_TEXT: Record<NextStep, (v: string) => string> = {
  publish: (v) => `v${v} is approved and ready to go live.`,
  wait: (v) => `v${v} is waiting for a reviewer.`,
  fix: (v) => `v${v} came back with changes requested.`,
  submit: (v) => `v${v} is a draft. Submit it when it's ready.`,
  start: () => "No versions yet. Create one to test changes before they go live.",
  none: () => "Up to date: the live version is your newest.",
};

/** `/developers/apps`: every app the viewer owns, with where its versions stand. */
export function ConsoleHome() {
  const { viewer, loading } = useViewer();
  const { data: apps, isPending, isError } = useMyApps();
  const mounted = useMounted();

  if (!mounted || loading || (viewer && isPending)) return <ConsoleHomeSkeleton />;
  if (!viewer) {
    return <SignInPrompt title="Sign in to open your console">See every app you&apos;ve registered and manage its versions.</SignInPrompt>;
  }
  return (
    <div>
      <Link href="/developers" transitionTypes={["nav-back"]} className="mb-4 inline-flex items-center gap-1 text-sm text-ink-400 transition hover:text-ink-100">
        ← Developers
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-ink-400">Console</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Your apps</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href="/developers/sandbox" variant="glass" size="sm" icon={<FlaskConical className="size-4" />}>
            Sandbox
          </Button>
          <Button href="/developers/new" variant="primary" size="sm" icon={<Plus className="size-4" />}>
            Register an app
          </Button>
        </div>
      </header>

      <DeveloperNotices className="mt-6" />

      {isError ? (
        <p className="mt-6 text-sm text-danger">Couldn&apos;t load your apps.</p>
      ) : !apps || apps.length === 0 ? (
        <EmptyState emoji="🛠️" title="No apps yet" className="mt-6" action={<Button href="/developers/new">Register your first app</Button>}>
          Register an app and it shows up here, with its versions, testers, analytics and server settings.
        </EmptyState>
      ) : (
        <AppList apps={apps} />
      )}
    </div>
  );
}

function AppList({ apps }: { apps: AppManifest[] }) {
  const results = useAppsVersions(apps.map((a) => a.slug));
  const summaries = results.map((r) => (r.data ? summarizeVersions(r.data) : null));
  const count = (steps: NextStep[]) => summaries.filter((s) => s && steps.includes(s.next)).length;
  const stats = [
    { label: "Apps", value: apps.length },
    { label: "Live", value: summaries.filter((s) => s?.live).length },
    { label: "In review", value: count(["wait"]) },
    { label: "Need you", value: count(["publish", "fix", "submit"]), highlight: true },
  ];

  return (
    <>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-3xl border border-white/[0.08] bg-ink-850/70 px-4 py-3">
            <dt className="text-xs font-semibold uppercase tracking-wider text-ink-400">{s.label}</dt>
            <dd className={cn("mt-1 font-display text-2xl font-extrabold tabular", s.highlight && s.value > 0 && "text-volt")}>{s.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-4 space-y-3">
        {apps.map((app, i) => (
          <AppRow key={app.slug} app={app} index={i} summary={summaries[i]} failed={results[i].isError} />
        ))}
      </ul>
    </>
  );
}

function AppRow({ app, index, summary, failed }: { app: AppManifest; index: number; summary: VersionSummary | null; failed: boolean }) {
  const reduced = useReducedMotion();
  const now = useNow();
  const [confirm, setConfirm] = useState<AppVersion | null>(null);
  const closeConfirm = useCallback(() => setConfirm(null), []);
  const publish = usePublishVersion(app.slug);
  const base = `/developers/apps/${app.slug}`;
  const pending = summary?.pending ?? null;

  const runPublish = async () => {
    if (!confirm) return;
    try {
      await publish.mutateAsync(confirm.id);
      play("win");
      haptic("success");
      celebrate({ pattern: "cannons", colors: [app.accent[0], app.accent[1], "#ffffff"] });
      toast(`${app.name} v${confirm.version} is live`, { tone: "success", description: "Every new match loads this build." });
      setConfirm(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "That didn't work", { tone: "danger" });
    }
  };

  let action: ReactNode = null;
  if (summary?.next === "publish" && pending) {
    action = (
      <Button size="sm" variant="volt" icon={<Rocket className="size-4" />} onClick={() => setConfirm(pending)}>
        Publish v{pending.version}
      </Button>
    );
  } else if (summary?.next === "fix") {
    action = (
      <Button size="sm" variant="glass" href={`${base}?tab=versions`}>
        Read the notes
      </Button>
    );
  } else if (summary?.next === "submit") {
    action = (
      <Button size="sm" variant="glass" href={`${base}?tab=versions`}>
        Open draft
      </Button>
    );
  } else if (summary?.next === "start" || summary?.next === "none") {
    action = (
      <Button size="sm" variant="glass" icon={<Plus className="size-4" />} href={`${base}?tab=versions&new=1`}>
        New version
      </Button>
    );
  }

  return (
    <motion.li
      style={accentVars(app.accent)}
      className="rounded-[1.75rem] border border-white/[0.08] bg-ink-850/70 p-3 sm:p-4"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.soft, delay: reduced ? 0 : Math.min(index, 8) * 0.04 }}
    >
      <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
        <Link href={base} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl">
          <AppGlyph app={app} size={48} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{app.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone={app.status === "published" ? "success" : app.status === "pending" ? "gold" : "danger"}>
                {app.status === "published" ? "Listed" : app.status === "pending" ? "Not listed yet" : "Rejected"}
              </Badge>
              {summary?.live && (
                <Badge tone="neutral" className="font-mono normal-case tracking-normal">
                  v{summary.live.version} live
                </Badge>
              )}
            </div>
          </div>
        </Link>
        {action && <div className="flex w-full justify-end sm:w-auto">{action}</div>}
      </div>

      <div className="mt-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-sm">
        {failed ? (
          <p className="text-danger">Couldn&apos;t load versions.</p>
        ) : !summary ? (
          <Skeleton className="h-5 w-2/3" />
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {pending && <VersionStatusChip status={pending.status} />}
            <span className="text-ink-200">{NEXT_TEXT[summary.next](pending?.version ?? "")}</span>
            {pending && <span className="text-xs text-ink-500">{ago(pending.reviewedAt ?? pending.submittedAt ?? pending.createdAt, now)}</span>}
            {summary.ahead > 1 && <span className="text-xs text-ink-400">· {summary.ahead} versions ahead of live</span>}
          </div>
        )}
        {summary?.next === "fix" && pending?.reviewNotes && <p className="mt-1.5 line-clamp-2 break-words text-ink-400">“{pending.reviewNotes}”</p>}
      </div>

      <nav aria-label={`${app.name} console`} className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs font-semibold text-ink-300">
        <Link href={`${base}?tab=versions`} className="inline-flex items-center gap-1 hover:text-ink-100 hover:underline">
          <GitBranch className="size-3.5" aria-hidden /> Versions
        </Link>
        <Link href={`${base}?tab=analytics`} className="inline-flex items-center gap-1 hover:text-ink-100 hover:underline">
          <BarChart3 className="size-3.5" aria-hidden /> Analytics
        </Link>
        {app.status === "published" && (
          <Link href={`/apps/${app.slug}`} className="inline-flex items-center gap-1 hover:text-ink-100 hover:underline">
            <ExternalLink className="size-3.5" aria-hidden /> Public page
          </Link>
        )}
        <Link href={base} className="ml-auto inline-flex items-center gap-1 text-nova-300 hover:underline">
          Open console <ArrowRight className="size-3" aria-hidden />
        </Link>
      </nav>

      <ConfirmDialog
        open={!!confirm}
        onClose={closeConfirm}
        busy={publish.isPending}
        onConfirm={runPublish}
        tone="volt"
        icon={<Rocket className="size-4" />}
        title={`Publish ${app.name} v${confirm?.version}?`}
        description={summary?.live ? `Players get it on their next match. v${summary.live.version} is retired.` : "Players get it on their next match."}
        confirmLabel="Publish now"
      >
        {confirm && (
          <div className="max-h-[40dvh] overflow-y-auto">
            <ManifestDiff
              before={summary?.live ? sideOf(summary.live) : null}
              after={sideOf(confirm)}
              beforeLabel={summary?.live ? `v${summary.live.version}` : "Published"}
              afterLabel={`v${confirm.version}`}
            />
          </div>
        )}
      </ConfirmDialog>
    </motion.li>
  );
}

export function ConsoleHomeSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-5 w-28" />
      <Skeleton className="h-12 w-56" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-3xl" />
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 rounded-[1.75rem]" />
        ))}
      </div>
    </div>
  );
}
