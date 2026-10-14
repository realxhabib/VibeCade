import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveRoom, liveRoomUrl } from "./live-room";

class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.readyState = 3;
  }
  // Test helpers: the server side.
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const supabase = (token: string | null = "tok-1") =>
  ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } }) as unknown as SupabaseClient;
const MATCH = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

describe("liveRoomUrl", () => {
  it("turns the server's address into its room socket", () => {
    expect(liveRoomUrl("https://174-138-34-59.sslip.io", MATCH)).toBe(`wss://174-138-34-59.sslip.io/room?match=${MATCH}`);
    expect(liveRoomUrl("http://localhost:8787", MATCH)).toBe(`ws://localhost:8787/room?match=${MATCH}`);
  });
});

describe("createLiveRoom", () => {
  it("signs in, holds events until welcomed, then relays both ways", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const ws = FakeSocket.all[0]!;
    const got: unknown[] = [];
    room.onEvent((event, from, at) => got.push({ event, from, at }));
    room.send({ kind: "start", at: 1 });
    room.track({ ready: true });
    ws.open();
    expect(ws.sent).toEqual([{ t: "auth", token: "tok-1" }]);
    ws.receive({ t: "welcome", you: "alice" });
    expect(ws.sent.slice(1)).toEqual([
      { t: "track", ready: true },
      { t: "event", event: { kind: "start", at: 1 } },
    ]);
    room.send({ kind: "reaction", emoji: "🔥" });
    expect(ws.sent.at(-1)).toEqual({ t: "event", event: { kind: "reaction", emoji: "🔥" } });
    ws.receive({ t: "event", from: "bob", at: 7, event: { kind: "app", type: "pos", payload: 3 } });
    expect(got).toEqual([{ event: { kind: "app", type: "pos", payload: 3 }, from: "bob", at: 7 }]);
    room.close();
  });

  it("reports presence", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    const seen: unknown[] = [];
    room.onPresence((p) => seen.push(p));
    FakeSocket.all[0]!.receive({ t: "presence", peers: [{ userId: "alice", ready: true }, { userId: "bob", ready: false }] });
    expect(seen.at(-1)).toEqual([
      { userId: "alice", ready: true },
      { userId: "bob", ready: false },
    ]);
    room.close();
  });

  it("reconnects with a fresh token when dropped, but not when refused", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.drop(1006);
    await vi.advanceTimersByTimeAsync(600);
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
    FakeSocket.all[1]!.drop(4403);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.all).toHaveLength(2);
    room.close();
  });

  it("stops for good once closed", async () => {
    const room = createLiveRoom(supabase(), "https://live.example", MATCH, { WebSocket: FakeSocket as unknown as typeof WebSocket });
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
    room.close();
    FakeSocket.all[0]!.drop(1006);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeSocket.all).toHaveLength(1);
  });
});
