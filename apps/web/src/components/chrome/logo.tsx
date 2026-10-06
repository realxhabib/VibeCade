"use client";

import Link from "next/link";
import { useId } from "react";
import { motion } from "motion/react";
import { VIBE_GRADIENT, VIBE_MARK_PATH, VIBE_TILE } from "@/components/ui/vibe-mark";
import { spring } from "@/lib/motion";

/** The pixel V on its cabinet tile, lit in the neon ramp. */
export function LogoMark({ size = 30 }: { size?: number }) {
  const id = useId();
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      whileHover={{ scale: 1.08, rotate: -6 }}
      whileTap={{ scale: 0.94 }}
      transition={spring.bouncy}
      style={{ filter: `drop-shadow(0 0 ${Math.max(2, size / 10)}px rgb(177 77 255 / 0.55))` }}
    >
      <defs>
        <linearGradient id={`${id}-v`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={VIBE_GRADIENT[0]} />
          <stop offset="0.5" stopColor={VIBE_GRADIENT[1]} />
          <stop offset="1" stopColor={VIBE_GRADIENT[2]} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" fill={VIBE_TILE} stroke={`url(#${id}-v)`} strokeOpacity="0.7" />
      <path d={VIBE_MARK_PATH} fill={`url(#${id}-v)`} shapeRendering="crispEdges" />
    </motion.svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="Vibecade home">
      <LogoMark />
      <span className="neon-text font-arcade text-[11px] leading-none tracking-[0.06em] text-ink-50 sm:text-[13px]">VIBECADE</span>
    </Link>
  );
}
