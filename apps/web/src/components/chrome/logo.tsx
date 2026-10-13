"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { spring } from "@/lib/motion";

/** The VibeCade mark: two rivals facing off, forming the X we play on. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <motion.img
      src="/brand/vibecade-mark.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 select-none"
      style={{ width: size, height: size }}
      whileHover={{ scale: 1.08, rotate: -6 }}
      whileTap={{ scale: 0.94 }}
      transition={spring.bouncy}
    />
  );
}

export function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2" aria-label="VibeCade home">
      <LogoMark size={32} />
      <span className="font-display text-[19px] font-extrabold tracking-tight text-ink-50">VibeCade</span>
    </Link>
  );
}
