/**
 * The Vibecade mark: a pixel-art "V" on an arcade-cabinet tile. Shared by the
 * logo, the favicon and the social cards, so it lives outside any client module.
 */

/** Neon ramp the mark (and the brand) runs on: cyan → violet → magenta. */
export const VIBE_GRADIENT = ["#3fd0ff", "#b14dff", "#ff2bd6"] as const;
/** Cabinet-black tile behind the mark. */
export const VIBE_TILE = "#0c0818";

const V_PIXELS = [
  "XX....XX",
  "XX....XX",
  ".XX..XX.",
  ".XX..XX.",
  "..XXXX..",
  "...XX...",
];

/** One SVG path of square pixels, centered in a 32×32 viewBox. */
function pixelPath(rows: string[], cell: number) {
  const w = rows[0].length * cell;
  const h = rows.length * cell;
  const ox = (32 - w) / 2;
  const oy = (32 - h) / 2;
  let d = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "X") d += `M${ox + x * cell} ${oy + y * cell}h${cell}v${cell}h-${cell}z`;
    }
  });
  return d;
}

/** The pixel V (32×32 viewBox). */
export const VIBE_MARK_PATH = pixelPath(V_PIXELS, 2.75);
