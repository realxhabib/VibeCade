/** Where an app's versions stand, for the console home's app cards. */
import type { AppVersion } from "@/platform/types";
import { compareSemver } from "./semver";

/**
 * What the developer can do next with an app:
 * - `publish`: a version newer than the live one is approved.
 * - `wait`: one is in review.
 * - `fix`: the newest one came back with changes requested.
 * - `submit`: the newest one is a draft.
 * - `start`: the app has no versions yet.
 * - `none`: the live version is the newest.
 */
export type NextStep = "publish" | "wait" | "fix" | "submit" | "start" | "none";

export interface VersionSummary {
  live: AppVersion | null;
  /** The version the next step is about (null for `start` and `none`). */
  pending: AppVersion | null;
  next: NextStep;
  /** Versions newer than the live one that haven't been retired or replaced. */
  ahead: number;
}

export function summarizeVersions(versions: AppVersion[]): VersionSummary {
  const sorted = [...versions].sort((a, b) => compareSemver(b.version, a.version));
  const live = sorted.find((v) => v.status === "published") ?? null;
  const ahead = sorted.filter(
    (v) => (!live || compareSemver(v.version, live.version) > 0) && ["draft", "in_review", "approved", "rejected"].includes(v.status),
  );
  const pick = (status: AppVersion["status"]) => ahead.find((v) => v.status === status) ?? null;
  const summary = (next: NextStep, pending: AppVersion | null): VersionSummary => ({ live, pending, next, ahead: ahead.length });

  const approved = pick("approved");
  if (approved) return summary("publish", approved);
  const inReview = pick("in_review");
  if (inReview) return summary("wait", inReview);
  const newest = ahead[0];
  if (newest) return summary(newest.status === "rejected" ? "fix" : "submit", newest);
  return summary(sorted.length === 0 ? "start" : "none", null);
}
