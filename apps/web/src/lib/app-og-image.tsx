import { ImageResponse } from "next/og";
import { brandMarkSrc } from "@/lib/brand-image";
import type { AppManifest } from "@/platform/types";

export const APP_IMAGE_SIZE = { width: 1200, height: 630 };

/** A game's share card (`og:image` of its app page and its challenge links). */
export async function appOpengraphImage(app: AppManifest | null): Promise<ImageResponse> {
  const mark = await brandMarkSrc();
  const [from, to] = app?.accent ?? ["#5b74ff", "#a35cff"];
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
          background: `radial-gradient(circle at 85% 15%, ${from} 0%, transparent 45%), radial-gradient(circle at 100% 100%, ${to} 0%, transparent 45%), #05060a`,
          color: "#f6f7fb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 30, fontWeight: 700, color: "#b8bfcf", letterSpacing: 6 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img */}
          <img src={mark} width={64} height={64} alt="" />
          VIBECADE · CHALLENGE ANYONE ON X
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 36,
              background: `linear-gradient(135deg, ${from}, ${to})`,
              marginBottom: 36,
            }}
          />
          <div style={{ fontSize: 110, fontWeight: 900, letterSpacing: -4, lineHeight: 1 }}>{app?.name ?? "VibeCade"}</div>
          <div style={{ marginTop: 20, fontSize: 38, color: "#dfe3ec" }}>{app?.tagline ?? "Head-to-head apps on X."}</div>
        </div>
      </div>
    ),
    APP_IMAGE_SIZE,
  );
}
