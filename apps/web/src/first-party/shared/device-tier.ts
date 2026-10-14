/**
 * The first guess at render quality, shared by the 3D games (each maps it to
 * its own tiers). It errs on the side of looking good: Frontline and Wedge
 * Wars watch real frame times and step down when a device can't keep up;
 * Nova Rally, which can't, only uses it for phones and the small frame.
 */

export type DeviceTier = "high" | "medium" | "low";

export interface DeviceInfo {
  /** The GPU as WebGL reports it (lowercase), or "software" without WebGL. */
  renderer: string;
  /** A phone or tablet (coarse pointer). */
  touch: boolean;
  cores: number;
  /** CSS pixels the game draws into (the frame's viewport). */
  area: number;
}

/** A canvas this small (the X post's card, a docked window) costs a fraction of a full screen to draw. */
export const SMALL_AREA = 640 * 640;

const SOFTWARE = /swiftshader|llvmpipe|software|mesa offscreen|microsoft basic/;
const DISCRETE = /nvidia|geforce|rtx|quadro|radeon (rx|pro)|amd radeon|apple m\d|apple gpu/;
/** Recent phone and tablet GPUs: every iPhone iOS still runs on, Adreno 640+, Mali-G77+, Immortalis, Xclipse. */
const CAPABLE_MOBILE = /apple|adreno \(tm\) (6[4-9]\d|[7-9]\d\d)|adreno (6[4-9]\d|[7-9]\d\d)|mali-g(7[7-9]|[6-9]\d\d)|immortalis|xclipse/;

export function guessTier({ renderer, touch, cores, area }: DeviceInfo): DeviceTier {
  if (SOFTWARE.test(renderer)) return "low";
  if (touch) return CAPABLE_MOBILE.test(renderer) ? "medium" : "low";
  const tier: DeviceTier = DISCRETE.test(renderer) ? "high" : /intel/.test(renderer) ? (cores >= 8 ? "medium" : "low") : cores >= 8 ? "high" : "medium";
  // Far fewer pixels to fill: a computer can afford a step up.
  if (area <= SMALL_AREA) return tier === "low" ? "medium" : "high";
  return tier;
}

export function deviceInfo(): DeviceInfo {
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return { renderer: gpuRenderer().toLowerCase(), touch, cores: navigator.hardwareConcurrency ?? 4, area: window.innerWidth * window.innerHeight };
}

/** The device's guess (`fallback` where the browser won't say). */
export function detectDeviceTier(fallback: DeviceTier = "medium"): DeviceTier {
  try {
    return guessTier(deviceInfo());
  } catch {
    return fallback;
  }
}

function gpuRenderer(): string {
  const c = document.createElement("canvas");
  const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
  if (!gl) return "software";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const name = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return name ?? "";
}
