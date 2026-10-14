import { describe, expect, it } from "vitest";
import { NONCE_PATTERN, confirmCode, newNonce, nonceFromHash, openedByOurSite, safeBackPath, toHandoffTokens } from "./x-session";

describe("sign-in codes", () => {
  it("are 43 base64url characters that the RPCs accept", () => {
    const n = newNonce();
    expect(n).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(NONCE_PATTERN.test(n)).toBe(true);
    expect(newNonce()).not.toBe(n);
    expect(newNonce(new Uint8Array(32).fill(255))).toBe("_".repeat(42) + "8");
  });

  it("come from the popup's fragment only when valid", () => {
    const n = newNonce();
    expect(nonceFromHash(`#n=${n}`)).toBe(n);
    expect(nonceFromHash(`n=${n}`)).toBe(n);
    expect(nonceFromHash("#n=short")).toBeNull();
    expect(nonceFromHash("#n=has spaces and more than thirty-two chars")).toBeNull();
    expect(nonceFromHash("")).toBeNull();
  });
});

describe("confirmCode", () => {
  it("is 4 unambiguous characters, the same for the same sign-in code", () => {
    const n = newNonce();
    expect(confirmCode(n)).toMatch(/^[ACDEFGHJKMNPRTUVWXY34679]{4}$/);
    expect(confirmCode(n)).toBe(confirmCode(n));
    const codes = new Set(Array.from({ length: 200 }, () => confirmCode(newNonce())));
    expect(codes.size).toBeGreaterThan(150);
  });
});

describe("openedByOurSite", () => {
  const win = (opener: unknown) => ({ opener, location: { origin: "https://xapps.example" } }) as unknown as Window;
  it("trusts only a same-site opener", () => {
    expect(openedByOurSite(win({ location: { origin: "https://xapps.example" } }))).toBe(true);
    expect(openedByOurSite(win(null))).toBe(false);
    expect(openedByOurSite(win({ location: { origin: "https://evil.example" } }))).toBe(false);
    const crossSite = {
      get location(): Location {
        throw new DOMException("Blocked a frame", "SecurityError");
      },
    };
    expect(openedByOurSite(win(crossSite))).toBe(false);
  });
});

describe("toHandoffTokens", () => {
  it("needs both tokens", () => {
    expect(toHandoffTokens({ access_token: "a", refresh_token: "r" })).toEqual({ access_token: "a", refresh_token: "r" });
    expect(toHandoffTokens({ access_token: "a" })).toBeNull();
    expect(toHandoffTokens({ access_token: "", refresh_token: "r" })).toBeNull();
    expect(toHandoffTokens(null)).toBeNull();
    expect(toHandoffTokens("tokens")).toBeNull();
  });
});

describe("safeBackPath", () => {
  it("only comes back to card pages on this site", () => {
    expect(safeBackPath("/x/play/four-in-a-row")).toBe("/x/play/four-in-a-row");
    expect(safeBackPath("/x/play")).toBe("/x/play");
    expect(safeBackPath("/x/play/match/m-1?x=1")).toBe("/x/play/match/m-1?x=1");
    expect(safeBackPath("https://evil.example/x/play")).toBe("/x/play");
    expect(safeBackPath("//evil.example/x/play")).toBe("/x/play");
    expect(safeBackPath("/x/playground")).toBe("/x/play");
    expect(safeBackPath("/admin")).toBe("/x/play");
    expect(safeBackPath(undefined)).toBe("/x/play");
  });
});
