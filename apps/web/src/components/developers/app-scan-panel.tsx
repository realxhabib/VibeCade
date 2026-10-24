"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FileCode2, FolderOpen, Globe, ScanSearch, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { cn } from "@/lib/utils";
import {
  describeFinding,
  isScannablePath,
  scanPatch,
  scanSources,
  SCAN_FIELD_LABEL,
  type ScanConfidence,
  type ScanFinding,
  type ScannedFields,
  type ScanReport,
  type ScanSource,
} from "@/platform/app-scan";
import type { AchievementDef, StatDef } from "@/platform/types";
import type { AchievementRow, StatRow } from "@/components/pages/progress-editors";

/** Folder picks stop here, so a stray `dist/` or monorepo doesn't hang the tab. */
const FOLDER_LIMITS = { files: 600, fileBytes: 2 * 1024 * 1024, totalBytes: 24 * 1024 * 1024 };

const CONFIDENCE: Record<ScanConfidence, { label: string; className: string }> = {
  manifest: { label: "Manifest", className: "border-volt/30 bg-volt/10 text-volt" },
  code: { label: "From code", className: "border-nova-400/30 bg-nova-400/10 text-nova-300" },
  guess: { label: "Guess", className: "border-gold/30 bg-gold/10 text-gold" },
};

type Current = Partial<ScannedFields> & { stats: StatDef[]; achievements: AchievementDef[] };

/** True when applying the finding wouldn't change the form. */
function alreadySet(f: ScanFinding, current: Current): boolean {
  if (f.field === "stats") return (f.value as StatDef[]).every((s) => current.stats.some((c) => c.key === s.key));
  if (f.field === "achievements") return (f.value as AchievementDef[]).every((a) => current.achievements.some((c) => c.id === a.id));
  return JSON.stringify(current[f.field]) === JSON.stringify(f.value);
}

/** The files of a folder (or a hand-picked set) that are worth reading, as text. */
async function readPicked(list: File[]): Promise<{ sources: ScanSource[]; skipped: number }> {
  const files = list.filter((f) => isScannablePath(f.webkitRelativePath || f.name) && f.size <= FOLDER_LIMITS.fileBytes);
  const sources: ScanSource[] = [];
  let total = 0;
  for (const file of files.slice(0, FOLDER_LIMITS.files)) {
    if (total + file.size > FOLDER_LIMITS.totalBytes) break;
    total += file.size;
    // Show paths inside the picked folder: "tap-race/src/App.tsx" → "src/App.tsx".
    const path = (file.webkitRelativePath || file.name).split("/").slice(file.webkitRelativePath ? 1 : 0).join("/") || file.name;
    sources.push({ path, text: await file.text() });
  }
  return { sources, skipped: list.length - sources.length };
}

/**
 * A form with the scan's patch applied: stats and achievements become editor
 * rows, and the three how-to inputs stay three.
 */
export function withScanPatch<F extends { stats: StatRow[]; achievements: AchievementRow[]; howTo: string[] }>(form: F, patch: Partial<ScannedFields>): F {
  const { stats, achievements, howTo, ...rest } = patch;
  return {
    ...form,
    ...rest,
    stats: stats ? stats.map((s) => form.stats.find((r) => r.key === s.key) ?? { ...s, keyTouched: true }) : form.stats,
    achievements: achievements ? achievements.map((a) => form.achievements.find((r) => r.id === a.id) ?? { ...a, idTouched: true }) : form.achievements,
    howTo: howTo ? [...howTo, "", "", ""].slice(0, Math.max(3, form.howTo.length)) : form.howTo,
  };
}

/**
 * "Scan your app": reads the app (its URL, or a project folder picked from the
 * developer's computer) and proposes the fields below, each with where it was
 * found. Nothing changes until the developer applies the ones they tick.
 */
export function AppScanPanel({
  url,
  current,
  onApply,
  idPrefix,
}: {
  /** The URL field's value, scanned by "Scan URL". */
  url: string;
  current: Current;
  onApply: (patch: Partial<ScannedFields>) => void;
  idPrefix: string;
}) {
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState<"url" | "folder" | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [source, setSource] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  const trimmed = url.trim();
  const urlScannable = /^https:\/\/[^/]+\.[^/]+/.test(trimmed);

  const show = (next: ScanReport, from: string) => {
    setReport(next);
    setSource(from);
    setApplied(null);
    // Tick what the manifest or the code states and that would change something; leave guesses for the developer.
    setChosen(new Set(next.findings.filter((f) => f.confidence !== "guess" && !alreadySet(f, current)).map((f) => f.field)));
    play(next.findings.length ? "pop" : "tick");
  };

  const scanUrl = async () => {
    setBusy("url");
    setError(null);
    try {
      const res = await fetch("/api/scan-app", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: trimmed }) });
      const body = (await res.json().catch(() => null)) as { report?: ScanReport; url?: string; error?: { message: string } } | null;
      if (!res.ok || !body?.report) throw new Error(body?.error?.message ?? "Couldn't scan that URL");
      show(body.report, body.url ?? trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't scan that URL");
      play("error");
    } finally {
      setBusy(null);
    }
  };

  const scanPicked = async (list: File[]) => {
    if (!list.length) return;
    setBusy("folder");
    setError(null);
    try {
      const { sources, skipped } = await readPicked(list);
      if (!sources.length) throw new Error("No code files in there (looked for .js, .ts, .tsx, .html and vibecade.manifest.json)");
      const top = list[0]!.webkitRelativePath.split("/")[0];
      const next = scanSources(sources);
      if (skipped > 0 && list.length > FOLDER_LIMITS.files) next.notes.push(`Read ${sources.length} of ${list.length} files`);
      show(next, top ? `${top}/` : `${sources.length} file${sources.length === 1 ? "" : "s"}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read those files");
      play("error");
    } finally {
      setBusy(null);
    }
  };

  const apply = () => {
    if (!report) return;
    const picked = report.findings.filter((f) => chosen.has(f.field));
    if (!picked.length) return;
    const { patch, skipped } = scanPatch(current, picked);
    onApply(patch);
    setApplied(`Filled in ${picked.map((f) => SCAN_FIELD_LABEL[f.field].toLowerCase()).join(", ")}. Review them below before you save.${skipped.length ? ` Left out ${skipped.join(", ")}.` : ""}`);
    setReport(null);
    play("notify");
  };

  const toggle = (field: string) =>
    setChosen((s) => {
      const next = new Set(s);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  return (
    <div className="rounded-3xl border border-nova-400/25 bg-nova-400/[0.04] p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-nova-400/15 text-nova-300">
          <ScanSearch className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Scan your app</p>
          <p className="text-xs text-ink-400">
            We read your code for SDK calls (stats, achievements, turns, bots, setup…) and your page&apos;s title and description, then suggest the fields below.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="glass"
          icon={<Globe className="size-3.5" />}
          loading={busy === "url"}
          disabled={!!busy || !urlScannable}
          onClick={() => void scanUrl()}
          title={urlScannable ? `Scan ${trimmed}` : "Enter your app's https URL first"}
        >
          Scan URL
        </Button>
        <Button type="button" size="sm" variant="glass" icon={<FolderOpen className="size-3.5" />} loading={busy === "folder"} disabled={!!busy} onClick={() => folderInput.current?.click()}>
          Choose project folder
        </Button>
        <Button type="button" size="sm" variant="ghost" icon={<FileCode2 className="size-3.5" />} disabled={!!busy} onClick={() => filesInput.current?.click()}>
          Pick files
        </Button>
        <input
          ref={folderInput}
          id={`${idPrefix}-scan-folder`}
          type="file"
          multiple
          className="hidden"
          // Directory pickers are non-standard attributes React doesn't type.
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => {
            // Copy the list first: clearing the input (so the same folder can be picked again) empties it.
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void scanPicked(files);
          }}
        />
        <input
          ref={filesInput}
          id={`${idPrefix}-scan-files`}
          type="file"
          multiple
          accept=".js,.mjs,.cjs,.ts,.tsx,.jsx,.html,.htm,.vue,.svelte,.json"
          className="hidden"
          onChange={(e) => {
            // Copy the list first: clearing the input (so the same folder can be picked again) empties it.
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void scanPicked(files);
          }}
        />
      </div>
      {!urlScannable && trimmed.startsWith("http://localhost") && (
        <p className="mt-1.5 text-xs text-ink-400">Running on localhost? Choose the project folder instead; nothing is uploaded, it&apos;s read in your browser.</p>
      )}

      <AnimatePresence initial={false}>
        {error && (
          <motion.p key="error" role="alert" className="mt-2 text-xs text-danger" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.p>
        )}
        {applied && !report && (
          <motion.p key="applied" role="status" className="mt-2 text-xs text-volt" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {applied}
          </motion.p>
        )}
        {report && (
          <motion.div
            key="report"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={spring.soft}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-white/10 pt-3" data-testid="scan-report">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs text-ink-400">
                  {report.findings.length ? `Found ${report.findings.length} field${report.findings.length === 1 ? "" : "s"} in ` : "Nothing to fill in from "}
                  <span className="font-mono text-ink-200">{source}</span>
                  {report.manifest ? " (with a manifest file)" : ""}
                </p>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss scan results" onClick={() => setReport(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              {report.findings.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {report.findings.map((f) => {
                    const same = alreadySet(f, current);
                    const on = chosen.has(f.field);
                    const tag = CONFIDENCE[f.confidence];
                    const where = f.evidence[0];
                    return (
                      <li key={f.field}>
                        <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 transition", on ? "border-white/25 bg-white/[0.05]" : "border-white/10")}>
                          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--color-volt)]" checked={on} onChange={() => toggle(f.field)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold">{SCAN_FIELD_LABEL[f.field]}</span>
                              <span className={cn("rounded-full border px-1.5 text-[10px] font-semibold uppercase tracking-wider", tag.className)}>{tag.label}</span>
                              {same && <span className="text-[11px] text-ink-500">already set</span>}
                            </span>
                            <span className="mt-0.5 block break-words text-sm text-ink-100">{describeFinding(f)}</span>
                            <span className="mt-0.5 block text-xs text-ink-400">{f.why}</span>
                            {where && where.snippet && (
                              <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-500" title={`${where.file}:${where.line}\n${where.snippet}`}>
                                {where.file.replace(/^https?:\/\/[^/]+/, "")}:{where.line} · {where.snippet}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {report.notes.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-gold">
                  {report.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              {report.findings.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                  <span className="mr-auto text-xs text-ink-400">Stats and achievements are added to the rows you already have.</span>
                  <Button type="button" size="sm" variant="primary" disabled={!chosen.size} onClick={apply}>
                    Apply {chosen.size || ""}
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
