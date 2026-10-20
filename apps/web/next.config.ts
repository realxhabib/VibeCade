import type { NextConfig } from "next";
import { X_FRAME_ANCESTORS } from "./src/lib/x-player";

// Vibras embeds VibeCade inline, so it may frame the whole site (and the apps framed inside it).
const VIBRAS_FRAME_ANCESTORS = "https://vibras.si https://www.vibras.si";

// Playable posts (src/lib/x-player.ts): X frames the player, and the app frames inside it
// (frame-ancestors checks every ancestor). No X-Frame-Options anywhere: it would override this.
const xFrameable = [{ key: "Content-Security-Policy", value: `frame-ancestors ${X_FRAME_ANCESTORS} ${VIBRAS_FRAME_ANCESTORS}` }];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pbs.twimg.com" },
      { protocol: "https", hostname: "abs.twimg.com" },
    ],
  },
  async headers() {
    return [
      {
        // The marketplace may only be framed by itself and Vibras (first-party apps run in /embed/*).
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${VIBRAS_FRAME_ANCESTORS}` },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // The SDK bundle is meant to be imported by apps hosted anywhere.
        source: "/sdk/:file*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
        ],
      },
      // After the site-wide rule, so these win (the player is never cached: see app/x/play/layout.tsx).
      { source: "/x/play/:path*", headers: xFrameable },
      { source: "/embed/:path*", headers: xFrameable },
    ];
  },
};

export default nextConfig;
