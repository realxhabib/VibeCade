import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { appImageSrc } from "@/lib/app-images";

const FETCH_TIMEOUT_MS = 4000;
const MAX_BYTES = 8_000_000;

/**
 * A game's uploaded banner (`coverImage`) as a PNG of `size`, center-cropped,
 * for share cards. Null when the game has no banner or it can't be read, so the
 * caller falls back to the generated card. Server only.
 */
export async function appBannerPng(
  coverImage: string | null | undefined,
  size: { width: number; height: number },
  origin: string | null = process.env.NEXT_PUBLIC_SITE_URL ?? null,
): Promise<Buffer | null> {
  const src = appImageSrc(coverImage);
  if (!src) return null;
  try {
    const bytes = await loadImage(src, origin);
    if (!bytes) return null;
    return await sharp(bytes).resize(size.width, size.height, { fit: "cover", position: "centre" }).png().toBuffer();
  } catch {
    return null;
  }
}

async function loadImage(src: string, origin: string | null): Promise<Buffer | null> {
  if (src.startsWith("data:")) return Buffer.from(src.slice(src.indexOf(",") + 1), "base64");
  if (src.startsWith("/")) {
    // Showcase art ships in public/: on disk at build time, over HTTP when the function bundle lacks it.
    try {
      return await readFile(join(process.cwd(), "public", src));
    } catch {
      if (!origin) return null;
      return fetchImage(`${origin.replace(/\/+$/, "")}${src}`);
    }
  }
  return fetchImage(src);
}

async function fetchImage(url: string): Promise<Buffer | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > MAX_BYTES ? null : buf;
}
