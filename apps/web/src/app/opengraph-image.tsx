import { ImageResponse } from "next/og";
import { VIBE_GRADIENT, VIBE_MARK_PATH, VIBE_TILE } from "@/components/ui/vibe-mark";
import { X_MARK_PATH } from "@/components/ui/x-logo";

export const alt = "Vibecade — the arcade where you challenge anyone on X";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const [cyan, violet, magenta] = VIBE_GRADIENT;

/** Social card for the site (no emoji or web fonts: rendered without network access). */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: `radial-gradient(circle at 85% 10%, ${violet} 0%, transparent 45%), radial-gradient(circle at 10% 100%, ${magenta} 0%, transparent 40%), linear-gradient(180deg, #07040f 55%, #1a0b2e 100%)`,
          color: "#f8f7fd",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="84" height="84" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="v" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor={cyan} />
                <stop offset="0.5" stopColor={violet} />
                <stop offset="1" stopColor={magenta} />
              </linearGradient>
            </defs>
            <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill={VIBE_TILE} stroke="url(#v)" />
            <path d={VIBE_MARK_PATH} fill="url(#v)" />
          </svg>
          <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: 10 }}>VIBECADE</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: 8, color: cyan }}>INSERT COIN</div>
          <div style={{ marginTop: 16, fontSize: 92, fontWeight: 900, letterSpacing: -3, lineHeight: 1 }}>Challenge anyone</div>
          <div style={{ display: "flex", alignItems: "flex-end", fontSize: 92, fontWeight: 900, letterSpacing: -3, lineHeight: 1, color: "#e9a6ff" }}>
            on
            <svg width="64" height="64" viewBox="0 0 24 24" style={{ marginLeft: 26, marginBottom: 6 }}>
              <path fill="#ffffff" d={X_MARK_PATH} />
            </svg>
            .
          </div>
          <div style={{ marginTop: 28, fontSize: 32, color: "#c3bedb" }}>
            Reflex duels · meme battles · pool · darts · robot brawls
          </div>
        </div>
      </div>
    ),
    size,
  );
}
