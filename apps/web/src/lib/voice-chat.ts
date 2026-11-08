/**
 * In-match voice chat: a WebRTC audio mesh (one RTCPeerConnection per pair of people in the call),
 * signaled through the match room itself (`RoomEvent` kinds "voice" and "rtc"). Works the same on
 * Supabase Realtime, the live server and the demo backend's BroadcastChannel: the room only relays.
 * Audio goes browser to browser; nothing is recorded or stored.
 *
 * The approach follows hovtgc/open-space (MIT): a small full mesh of Opus audio tracks, each pair
 * dialed by exactly one side, with audio meters for speaking rings.
 *
 * Protocol:
 * - Joining broadcasts `hello`. Everyone already in the call answers with `here` (to the newcomer).
 *   A fresh `session` id per join tells a reload apart from a repeat.
 * - Of each pair, the larger user id dials: it sends one `rtc` offer with its ICE candidates
 *   gathered in (no trickle, to keep room traffic to two messages per pair). The other answers.
 * - A failed connection is dialed again (new `link` id) a few times with backoff.
 * - When someone new shows up in room presence, everyone in the call says `hello` again, and a
 *   person who drops out of presence is hung up on.
 * - Spectators join to listen (`talk: false`); two listeners never connect to each other.
 */
import type { RoomEvent, RtcRoomEvent, VoiceRoomEvent } from "@/platform/backend";
import { env } from "./env";

export type VoiceEvent = VoiceRoomEvent | RtcRoomEvent;

export type VoiceLink = "connecting" | "connected" | "failed";

export interface VoiceMember {
  userId: string;
  talk: boolean;
  muted: boolean;
  speaking: boolean;
  /** Our connection to them (null: none needed, e.g. both of us only listen). */
  link: VoiceLink | null;
  /** We turned them down on our side. */
  silenced: boolean;
}

export interface VoiceSnapshot {
  joined: boolean;
  /** Joining (asking for the microphone). */
  joining: boolean;
  /** Our microphone is off (or we only listen). */
  muted: boolean;
  /** We have a microphone in the call. */
  talk: boolean;
  speaking: boolean;
  /** Everyone else in the call, as far as we know (also before we join). */
  members: VoiceMember[];
}

export class VoiceError extends Error {
  constructor(
    message: string,
    readonly code: "denied" | "unsupported" | "no-device",
  ) {
    super(message);
  }
}

export interface VoiceChatOptions {
  selfId: string;
  send: (event: VoiceEvent) => void;
  /** Whether we may talk (seated players) or only listen (spectators). Read on each join. */
  canTalk: () => boolean;
  onChange: (snapshot: VoiceSnapshot) => void;
  iceServers?: RTCIceServer[];
  /** For tests. */
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

interface Pair {
  pc: RTCPeerConnection;
  link: string;
  dialer: boolean;
  state: VoiceLink;
  audio: HTMLAudioElement | null;
  analyser: AnalyserNode | null;
  source: MediaStreamAudioSourceNode | null;
  retries: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
}

interface Known {
  session: string;
  talk: boolean;
  muted: boolean;
}

const GATHER_MS = 2500;
const METER_MS = 120;
const SPEAK_LEVEL = 0.035;
const SPEAK_HOLD_MS = 450;
const MAX_RETRIES = 3;

const DEFAULT_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] }];

/** `NEXT_PUBLIC_ICE_SERVERS` (a JSON RTCIceServer list), else public STUN. */
export function iceServersFromEnv(raw: string = env.iceServers): RTCIceServer[] {
  if (!raw.trim()) return DEFAULT_ICE;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const valid = list.filter(
      (s): s is RTCIceServer =>
        !!s && typeof s === "object" && (typeof (s as RTCIceServer).urls === "string" || Array.isArray((s as RTCIceServer).urls)),
    );
    return valid.length ? valid : DEFAULT_ICE;
  } catch {
    console.warn("[voice] NEXT_PUBLIC_ICE_SERVERS isn't valid JSON; using public STUN");
    return DEFAULT_ICE;
  }
}

export function isVoiceEvent(event: RoomEvent): event is VoiceEvent {
  return event.kind === "voice" || event.kind === "rtc";
}

/** Whether this browser can do voice chat at all. */
export function voiceSupported(): boolean {
  return typeof window !== "undefined" && typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Microphone processing: echo cancellation, noise suppression and gain control everywhere, plus
 * voice isolation (the browser keeps only the speaker's voice) where the browser offers it. Keeping
 * the platform's voice processing on is also what lets Safari on iPhone and Mac apply the system's
 * own Voice Isolation mic mode (Control Center, while the mic is in use).
 */
export function micConstraints(
  supported: MediaTrackSupportedConstraints & { voiceIsolation?: boolean } = typeof navigator !== "undefined" ? (navigator.mediaDevices?.getSupportedConstraints?.() ?? {}) : {},
): MediaTrackConstraints {
  const audio: MediaTrackConstraints & { voiceIsolation?: boolean } = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (supported.voiceIsolation) audio.voiceIsolation = true;
  return audio;
}

const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Waits for ICE gathering to finish (or a timeout: whatever was gathered by then goes). */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, GATHER_MS);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export class VoiceChat {
  private readonly opts: VoiceChatOptions;
  private readonly known = new Map<string, Known>();
  private readonly pairs = new Map<string, Pair>();
  private readonly silenced = new Set<string>();
  private readonly speaking = new Map<string, number>();
  private present = new Set<string>();
  private session = "";
  private joined = false;
  private joining = false;
  private talk = false;
  private muted = false;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(512));
  private destroyed = false;
  private lastFp = "";

  constructor(opts: VoiceChatOptions) {
    this.opts = opts;
  }

  /* ------------------------------------------------------------ public */

  snapshot(): VoiceSnapshot {
    const now = Date.now();
    const members: VoiceMember[] = [];
    for (const [userId, k] of this.known) {
      const pair = this.pairs.get(userId);
      members.push({
        userId,
        talk: k.talk,
        muted: k.muted,
        speaking: (this.speaking.get(userId) ?? 0) > now,
        link: pair ? pair.state : this.joined && this.needsPair(k) ? "connecting" : null,
        silenced: this.silenced.has(userId),
      });
    }
    members.sort((a, b) => a.userId.localeCompare(b.userId));
    return {
      joined: this.joined,
      joining: this.joining,
      muted: this.muted || !this.talk,
      talk: this.talk,
      speaking: this.joined && this.talk && !this.muted && (this.speaking.get(this.opts.selfId) ?? 0) > now,
      members,
    };
  }

  /** Join the call: with the microphone when we may talk, else to listen. Must run from a tap. */
  async join(talk: boolean = this.opts.canTalk()): Promise<void> {
    if (this.joined || this.joining || this.destroyed) return;
    this.joining = true;
    this.emit();
    try {
      // Created inside the tap, so autoplay rules don't hold it suspended.
      this.ctx = this.makeContext();
      if (talk) {
        const getUserMedia = this.opts.getUserMedia ?? ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
        if (!this.opts.getUserMedia && !voiceSupported()) throw new VoiceError("Voice chat isn't supported in this browser", "unsupported");
        try {
          this.stream = await getUserMedia({
            audio: micConstraints(),
            video: false,
          });
        } catch (error) {
          const name = (error as { name?: string })?.name;
          if (name === "NotFoundError" || name === "OverconstrainedError") throw new VoiceError("No microphone found", "no-device");
          throw new VoiceError("Microphone access was blocked. Allow it in your browser's site settings to talk.", "denied");
        }
        if (this.destroyed) {
          this.stopStream();
          return;
        }
        const track = this.stream.getAudioTracks()[0];
        if (track) track.enabled = !this.muted;
        if (this.ctx) {
          const source = this.ctx.createMediaStreamSource(this.stream);
          this.localAnalyser = this.ctx.createAnalyser();
          this.localAnalyser.fftSize = 512;
          source.connect(this.localAnalyser);
        }
      }
      this.talk = talk;
      this.joined = true;
      this.session = randomId();
      this.say("hello");
      for (const userId of this.known.keys()) this.ensurePair(userId);
      this.meterTimer = setInterval(() => this.meter(), METER_MS);
    } catch (error) {
      this.closeContext();
      throw error;
    } finally {
      this.joining = false;
      this.emit();
    }
  }

  leave(): void {
    if (!this.joined) return;
    this.say("bye");
    this.hangUpAll();
    this.joined = false;
    this.talk = false;
    this.session = "";
    this.stopStream();
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.closeContext();
    this.speaking.clear();
    this.emit();
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    const track = this.stream?.getAudioTracks()[0];
    if (track) track.enabled = !muted;
    if (this.joined && this.talk) this.say("mute");
    this.emit();
  }

  /** Turn one person down on our side only. */
  setSilenced(userId: string, silenced: boolean): void {
    if (silenced) this.silenced.add(userId);
    else this.silenced.delete(userId);
    const audio = this.pairs.get(userId)?.audio;
    if (audio) audio.muted = silenced;
    this.emit();
  }

  /** Room presence changed: hang up on people who left; say hello to newcomers. */
  setPresent(userIds: Iterable<string>): void {
    const next = new Set(userIds);
    let newcomer = false;
    for (const id of next) if (id !== this.opts.selfId && !this.present.has(id)) newcomer = true;
    // Presence starts empty until the room syncs: only drop people once we've seen a roster.
    if (next.size > 0) {
      for (const id of [...this.known.keys()]) {
        if (!next.has(id)) this.forget(id);
      }
    }
    this.present = next;
    if (newcomer && this.joined) this.say("hello");
    this.emit();
  }

  /** A voice or rtc event from the room. */
  handle(event: VoiceEvent, from: string): void {
    if (this.destroyed || from === this.opts.selfId) return;
    if (event.to !== undefined && event.to !== this.opts.selfId) return;
    if (event.kind === "rtc") {
      void this.onRtc(event, from);
      return;
    }
    if (event.op === "bye") {
      this.forget(from);
      this.emit();
      return;
    }
    const prev = this.known.get(from);
    // A new session: they reloaded or rejoined, so start over. ("" is a placeholder from an early offer.)
    const fresh = !prev || (prev.session !== event.session && prev.session !== "");
    if (fresh && prev) this.hangUp(from);
    // They say they aren't connected to us while we think we are: they lost it, so redial.
    const pair = this.pairs.get(from);
    if (pair && pair.state === "connected" && event.linked && !event.linked.includes(this.opts.selfId)) this.hangUp(from);
    this.known.set(from, { session: event.session, talk: event.talk, muted: event.muted });
    if (this.joined) {
      if (event.op === "hello" && (fresh || !this.pairs.has(from))) this.say("here", from);
      if (event.op !== "mute") this.ensurePair(from);
    }
    this.emit();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.leave();
    this.destroyed = true;
    this.known.clear();
  }

  /* ------------------------------------------------------------ signaling */

  private say(op: VoiceRoomEvent["op"], to?: string): void {
    const event: VoiceRoomEvent = { kind: "voice", op, session: this.session, talk: this.talk, muted: this.muted || !this.talk };
    if (to) event.to = to;
    if (op === "hello" || op === "here") event.linked = [...this.pairs.keys()];
    this.opts.send(event);
  }

  private needsPair(k: Known): boolean {
    return k.talk || this.talk;
  }

  private ensurePair(userId: string): void {
    const k = this.known.get(userId);
    if (!this.joined || !k || !this.needsPair(k) || this.pairs.has(userId)) return;
    if (this.opts.selfId > userId) void this.dial(userId, 0);
  }

  private newPair(userId: string, link: string, dialer: boolean, retries: number): Pair {
    const pc = new RTCPeerConnection({ iceServers: this.opts.iceServers ?? iceServersFromEnv() });
    const pair: Pair = { pc, link, dialer, state: "connecting", audio: null, analyser: null, source: null, retries, retryTimer: null };
    this.pairs.set(userId, pair);
    pc.ontrack = (e) => this.attachAudio(userId, pair, e.streams[0] ?? new MediaStream([e.track]));
    pc.onconnectionstatechange = () => {
      if (this.pairs.get(userId) !== pair) return;
      const s = pc.connectionState;
      if (s === "connected") {
        pair.state = "connected";
        pair.retries = 0;
      } else if (s === "failed") {
        pair.state = "failed";
        if (pair.dialer) this.redial(userId, pair);
      } else if (s === "closed") {
        pair.state = "failed";
      }
      this.emit();
    };
    return pair;
  }

  private async dial(userId: string, retries: number): Promise<void> {
    const pair = this.newPair(userId, randomId(), true, retries);
    const { pc } = pair;
    const track = this.stream?.getAudioTracks()[0];
    if (track && this.stream) pc.addTransceiver(track, { direction: "sendrecv", streams: [this.stream] });
    else pc.addTransceiver("audio", { direction: "sendrecv" });
    this.emit();
    try {
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (this.pairs.get(userId) !== pair || !pc.localDescription) return;
      this.opts.send({ kind: "rtc", to: userId, link: pair.link, type: "offer", sdp: pc.localDescription.sdp });
    } catch (error) {
      console.warn("[voice] couldn't make an offer", error);
      this.redial(userId, pair);
    }
  }

  private redial(userId: string, pair: Pair): void {
    if (pair.retryTimer || pair.retries >= MAX_RETRIES) return;
    pair.retryTimer = setTimeout(
      () => {
        if (this.pairs.get(userId) !== pair) return;
        this.hangUp(userId);
        if (this.joined && this.known.has(userId)) void this.dial(userId, pair.retries + 1);
      },
      1500 * 2 ** pair.retries,
    );
  }

  private async onRtc(event: RtcRoomEvent, from: string): Promise<void> {
    if (!this.joined) return;
    if (event.type === "offer") {
      // Only the larger id dials; a stray offer the other way is ignored.
      if (from < this.opts.selfId) return;
      const existing = this.pairs.get(from);
      if (existing && existing.link === event.link) return; // a duplicate
      if (existing) this.hangUp(from);
      if (!this.known.has(from)) this.known.set(from, { session: "", talk: true, muted: false });
      const pair = this.newPair(from, event.link, false, 0);
      const { pc } = pair;
      this.emit();
      try {
        await pc.setRemoteDescription({ type: "offer", sdp: event.sdp });
        const transceiver = pc.getTransceivers()[0];
        const track = this.stream?.getAudioTracks()[0];
        if (transceiver) {
          transceiver.direction = "sendrecv";
          if (track) {
            await transceiver.sender.replaceTrack(track);
            if (this.stream) transceiver.sender.setStreams?.(this.stream);
          }
        }
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        if (this.pairs.get(from) !== pair || !pc.localDescription) return;
        this.opts.send({ kind: "rtc", to: from, link: event.link, type: "answer", sdp: pc.localDescription.sdp });
      } catch (error) {
        console.warn("[voice] couldn't answer", error);
        if (this.pairs.get(from) === pair) {
          pair.state = "failed";
          this.emit();
        }
      }
    } else {
      const pair = this.pairs.get(from);
      if (!pair || !pair.dialer || pair.link !== event.link || pair.pc.signalingState !== "have-local-offer") return;
      try {
        await pair.pc.setRemoteDescription({ type: "answer", sdp: event.sdp });
      } catch (error) {
        console.warn("[voice] couldn't take the answer", error);
        this.redial(from, pair);
      }
    }
  }

  /* ------------------------------------------------------------ audio */

  private makeContext(): AudioContext | null {
    const Ctor =
      typeof AudioContext !== "undefined"
        ? AudioContext
        : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
      return ctx;
    } catch {
      return null;
    }
  }

  private closeContext(): void {
    this.localAnalyser = null;
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
  }

  private attachAudio(userId: string, pair: Pair, stream: MediaStream): void {
    if (this.pairs.get(userId) !== pair) return;
    if (!pair.audio) {
      const audio = new Audio();
      audio.autoplay = true;
      pair.audio = audio;
    }
    pair.audio.srcObject = stream;
    pair.audio.muted = this.silenced.has(userId);
    void pair.audio.play().catch(() => undefined);
    if (this.ctx && !pair.analyser) {
      try {
        pair.source = this.ctx.createMediaStreamSource(stream);
        pair.analyser = this.ctx.createAnalyser();
        pair.analyser.fftSize = 512;
        pair.source.connect(pair.analyser);
      } catch {
        // Meters are a nicety.
      }
    }
  }

  private level(analyser: AnalyserNode): number {
    if (this.bins.length !== analyser.fftSize) this.bins = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    analyser.getByteTimeDomainData(this.bins);
    let sum = 0;
    for (const b of this.bins) {
      const v = (b - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.bins.length);
  }

  private meter(): void {
    const now = Date.now();
    if (this.localAnalyser && !this.muted && this.level(this.localAnalyser) > SPEAK_LEVEL) {
      this.speaking.set(this.opts.selfId, now + SPEAK_HOLD_MS);
    }
    for (const [userId, pair] of this.pairs) {
      if (pair.analyser && !this.known.get(userId)?.muted && this.level(pair.analyser) > SPEAK_LEVEL) {
        this.speaking.set(userId, now + SPEAK_HOLD_MS);
      }
    }
    this.emit();
  }

  /* ------------------------------------------------------------ teardown */

  private hangUp(userId: string): void {
    const pair = this.pairs.get(userId);
    if (!pair) return;
    this.pairs.delete(userId);
    if (pair.retryTimer) clearTimeout(pair.retryTimer);
    pair.pc.ontrack = null;
    pair.pc.onconnectionstatechange = null;
    pair.pc.close();
    pair.source?.disconnect();
    if (pair.audio) {
      pair.audio.pause();
      pair.audio.srcObject = null;
    }
    this.speaking.delete(userId);
  }

  private hangUpAll(): void {
    for (const userId of [...this.pairs.keys()]) this.hangUp(userId);
  }

  private forget(userId: string): void {
    this.hangUp(userId);
    this.known.delete(userId);
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Tells the page, only when something it shows changed. */
  private emit(): void {
    if (this.destroyed) return;
    const snap = this.snapshot();
    const fp = JSON.stringify(snap);
    if (fp === this.lastFp) return;
    this.lastFp = fp;
    this.opts.onChange(snap);
  }
}
