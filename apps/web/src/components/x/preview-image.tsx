import { ImageResponse } from "next/og";
import { brandMarkSrc } from "@/lib/brand-image";
import { PREVIEW_SIZE, playsInPost } from "@/lib/x-player";
import type { AppManifest } from "@/platform/types";

/**
 * The still X shows for a playable post before the player loads, and in the
 * mobile apps (no emoji or web fonts: rendered without network access).
 */
export async function xPreviewImage(app?: AppManifest, more: AppManifest[] = []): Promise<ImageResponse> {
  const mark = await brandMarkSrc();
  const [from, to] = app?.accent ?? ["#00a8e8", "#e600e6"];
  const games = more.filter(playsInPost);
  const title = app ? app.name : "Play VibeCade right here";
  const subtitle = app ? app.tagline : `${games.length} games you can play inside this post.`;
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
          background: `radial-gradient(circle at 85% 10%, ${from} 0%, transparent 50%), radial-gradient(circle at 10% 100%, ${to} 0%, transparent 45%), #05060a`,
          color: "#f6f7fb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img */}
          <img src={mark} width={100} height={100} alt="" />
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>VibeCade</div>
        </div>

        {!app && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            {games.slice(0, 10).map((a) => (
              <div
                key={a.slug}
                style={{
                  display: "flex",
                  padding: "14px 26px",
                  borderRadius: 999,
                  fontSize: 30,
                  fontWeight: 700,
                  background: `linear-gradient(135deg, ${a.accent[0]}, ${a.accent[1]})`,
                }}
              >
                {a.name}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: app ? 120 : 104, fontWeight: 900, letterSpacing: -4, lineHeight: 1 }}>{title}</div>
          <div style={{ fontSize: 40, color: "#b8bfcf", lineHeight: 1.25 }}>{subtitle}</div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              alignItems: "center",
              gap: 16,
              padding: "20px 40px",
              borderRadius: 999,
              background: "#f6f7fb",
              color: "#05060a",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24">
              <path fill="#05060a" d="M7 4.5v15l13-7.5z" />
            </svg>
            {app ? "Play now" : "Tap to play"}
          </div>
        </div>
      </div>
    ),
    {
      ...PREVIEW_SIZE,
      // X caches the card for about a week anyway; refresh daily in case the catalog changes.
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
