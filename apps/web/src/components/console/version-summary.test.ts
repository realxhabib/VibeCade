import { describe, expect, it } from "vitest";
import type { AppVersion, AppVersionStatus } from "@/platform/types";
import { summarizeVersions } from "./version-summary";

const v = (version: string, status: AppVersionStatus): AppVersion =>
  ({ id: `${version}-${status}`, appSlug: "tap-race", version, status }) as AppVersion;

describe("summarizeVersions", () => {
  it("asks for a first version when there are none", () => {
    expect(summarizeVersions([])).toMatchObject({ live: null, pending: null, next: "start", ahead: 0 });
  });

  it("is up to date when the live version is the newest", () => {
    const s = summarizeVersions([v("1.0.0", "retired"), v("1.1.0", "published"), v("0.9.0", "rejected")]);
    expect(s.next).toBe("none");
    expect(s.live?.version).toBe("1.1.0");
  });

  it("puts an approved version first", () => {
    const s = summarizeVersions([v("1.0.0", "published"), v("1.2.0", "draft"), v("1.1.0", "approved")]);
    expect(s).toMatchObject({ next: "publish", ahead: 2 });
    expect(s.pending?.version).toBe("1.1.0");
  });

  it("waits on a version in review, ignoring the one it replaced", () => {
    const s = summarizeVersions([v("1.0.0", "published"), v("1.1.0", "superseded"), v("1.1.1", "in_review")]);
    expect(s).toMatchObject({ next: "wait", ahead: 1 });
    expect(s.pending?.version).toBe("1.1.1");
  });

  it("follows the newest of drafts and rejected versions", () => {
    expect(summarizeVersions([v("1.0.0", "published"), v("1.1.0", "rejected")]).next).toBe("fix");
    expect(summarizeVersions([v("1.0.0", "published"), v("1.1.0", "rejected"), v("1.2.0", "draft")]).next).toBe("submit");
  });

  it("ignores old versions below the live one", () => {
    expect(summarizeVersions([v("2.0.0", "published"), v("1.5.0", "draft")]).next).toBe("none");
  });
});
