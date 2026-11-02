import { describe, expect, it } from "vitest";
import { idleIntent } from "./game";
import { Input } from "./input";

describe("Input.release", () => {
  // The touch buttons remount switched off after a pause or a death, so a
  // toggle left on in the input could never be switched off again.
  it("drops the touch crouch and aim toggles", () => {
    const input = new Input();
    input.setTouch({ crouch: true, ads: true });
    input.release();
    const intent = idleIntent();
    input.sample(intent, 2.2, false, 1, 0);
    expect(intent.crouch).toBe(false);
    expect(intent.ads).toBe(false);
  });
});
