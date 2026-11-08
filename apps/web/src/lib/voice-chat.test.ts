import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iceServersFromEnv, micConstraints, type VoiceEvent, VoiceChat, type VoiceSnapshot } from "./voice-chat";

/** Just enough of RTCPeerConnection for the signaling protocol (real audio is checked in a browser). */
class FakePc {
  static all: FakePc[] = [];
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  signalingState = "stable";
  connectionState = "new";
  iceGatheringState = "complete";
  closed = false;
  transceivers: { direction: string; sender: { replaceTrack: () => Promise<void> } }[] = [];
  ontrack: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor() {
    FakePc.all.push(this);
  }
  addTransceiver() {
    this.transceivers.push({ direction: "sendrecv", sender: { replaceTrack: async () => undefined } });
  }
  getTransceivers() {
    if (!this.transceivers.length) this.addTransceiver();
    return this.transceivers;
  }
  async createOffer() {
    return { type: "offer", sdp: "offer-sdp" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "answer-sdp" };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = d;
    this.signalingState = d.type === "offer" ? "have-local-offer" : "stable";
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d;
    this.signalingState = d.type === "offer" ? "have-remote-offer" : "stable";
  }
  addEventListener() {}
  removeEventListener() {}
  close() {
    this.closed = true;
  }
  connect() {
    this.connectionState = "connected";
    this.onconnectionstatechange?.();
  }
}

const track = { enabled: true, stop: vi.fn() };
const stream = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;

function rig(ids: { id: string; talk?: boolean }[]) {
  const sent: { from: string; event: VoiceEvent }[] = [];
  const snaps: Record<string, VoiceSnapshot> = {};
  const chats: Record<string, VoiceChat> = {};
  for (const { id, talk = true } of ids) {
    chats[id] = new VoiceChat({
      selfId: id,
      iceServers: [],
      canTalk: () => talk,
      getUserMedia: async () => stream,
      send: (event) => sent.push({ from: id, event }),
      onChange: (s) => (snaps[id] = s),
    });
  }
  /** Delivers everything sent so far to everyone else, until the room is quiet. */
  const flush = async () => {
    for (let round = 0; round < 20 && sent.length; round++) {
      const batch = sent.splice(0);
      for (const { from, event } of batch) for (const [id, chat] of Object.entries(chats)) if (id !== from) chat.handle(event, from);
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { chats, snaps, sent, flush };
}

beforeEach(() => {
  FakePc.all = [];
  vi.stubGlobal("RTCPeerConnection", FakePc);
  vi.stubGlobal("Audio", class {});
});
afterEach(() => vi.unstubAllGlobals());

describe("VoiceChat", () => {
  it("connects each pair once, dialed by the larger id", async () => {
    const { chats, snaps, flush } = rig([{ id: "a" }, { id: "b" }, { id: "c" }]);
    await chats.a!.join();
    await flush();
    await chats.c!.join();
    await flush();
    await chats.b!.join();
    await flush();
    // 3 pairs, 2 connections each (dialer + answerer), no extras.
    expect(FakePc.all).toHaveLength(6);
    const offers = FakePc.all.filter((pc) => pc.localDescription?.type === "offer");
    expect(offers).toHaveLength(3);
    expect(offers.every((pc) => pc.remoteDescription?.type === "answer")).toBe(true);
    expect(snaps.a!.members.map((m) => m.userId)).toEqual(["b", "c"]);
    expect(snaps.a!.members.every((m) => m.link === "connecting")).toBe(true);
    FakePc.all.forEach((pc) => pc.connect());
    expect(snaps.b!.members.every((m) => m.link === "connected")).toBe(true);
  });

  it("never connects two listeners, and shows who's in voice before joining", async () => {
    const { chats, snaps, flush } = rig([{ id: "a" }, { id: "s1", talk: false }, { id: "s2", talk: false }]);
    await chats.s1!.join();
    await chats.s2!.join();
    await flush();
    expect(FakePc.all).toHaveLength(0);
    expect(snaps.a!.joined).toBe(false);
    expect(snaps.a!.members.map((m) => m.userId)).toEqual(["s1", "s2"]);
    await chats.a!.join();
    await flush();
    expect(FakePc.all).toHaveLength(4);
    expect(snaps.s1!.members.find((m) => m.userId === "a")?.link).toBe("connecting");
    expect(snaps.s1!.members.find((m) => m.userId === "s2")?.link).toBeNull();
  });

  it("hangs up on bye and on leaving presence, and ignores events for someone else", async () => {
    const { chats, snaps, flush } = rig([{ id: "a" }, { id: "b" }]);
    await chats.a!.join();
    await chats.b!.join();
    await flush();
    chats.a!.handle({ kind: "voice", op: "bye", session: "x", talk: true, muted: false, to: "zzz" }, "b");
    expect(snaps.a!.members).toHaveLength(1);
    chats.b!.leave();
    await flush();
    expect(snaps.a!.members).toHaveLength(0);
    expect(FakePc.all.every((pc) => pc.closed)).toBe(true);

    await chats.b!.join();
    await flush();
    expect(snaps.a!.members).toHaveLength(1);
    chats.a!.setPresent(["a"]);
    expect(snaps.a!.members).toHaveLength(0);
  });

  it("starts over when someone rejoins with a new session or says they lost the connection", async () => {
    const { chats, flush } = rig([{ id: "a" }, { id: "b" }]);
    await chats.a!.join();
    await chats.b!.join();
    await flush();
    FakePc.all.forEach((pc) => pc.connect());
    expect(FakePc.all).toHaveLength(2);
    // b lost its side (e.g. a dropped presence blip) and says hello listing nobody.
    chats.b!.handle({ kind: "voice", op: "bye", session: "", talk: true, muted: false }, "a");
    chats.b!.setPresent(["a", "b"]);
    await flush();
    expect(FakePc.all.filter((pc) => !pc.closed)).toHaveLength(2);
    expect(FakePc.all).toHaveLength(4);
  });

  it("mutes the microphone track and tells the others", async () => {
    const { chats, snaps, flush } = rig([{ id: "a" }, { id: "b" }]);
    await chats.a!.join();
    await chats.b!.join();
    await flush();
    chats.a!.setMuted(true);
    await flush();
    expect(track.enabled).toBe(false);
    expect(snaps.a!.muted).toBe(true);
    expect(snaps.b!.members[0]?.muted).toBe(true);
    chats.a!.setMuted(false);
    expect(track.enabled).toBe(true);
  });
});

describe("iceServersFromEnv", () => {
  it("defaults to public STUN and reads a JSON list", () => {
    expect(iceServersFromEnv("")[0]?.urls).toContain("stun:stun.l.google.com:19302");
    const turn = [{ urls: "turn:t.example:3478", username: "u", credential: "p" }];
    expect(iceServersFromEnv(JSON.stringify(turn))).toEqual(turn);
    expect(iceServersFromEnv(JSON.stringify(turn[0]))).toEqual(turn);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(iceServersFromEnv("not json")[0]?.urls).toContain("stun:stun.l.google.com:19302");
  });
});

describe("micConstraints", () => {
  it("asks for voice isolation only where the browser supports it", () => {
    expect(micConstraints({})).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    expect(micConstraints({ voiceIsolation: true })).toMatchObject({ voiceIsolation: true, noiseSuppression: true });
  });
});
