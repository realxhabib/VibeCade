"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { XLogo } from "@/components/ui/x-logo";
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";
import { play } from "@/lib/sfx";
import { copyText, postOnX, setShareHost, type ShareRequest } from "@/lib/share";

/**
 * The X player's share sheet. Inside a post, X's composer can't be opened the
 * usual way: a game shares after an await (a popup that late is blocked), and
 * X's in-app browsers often refuse popups altogether. So every share in the
 * card comes here (`openXIntent` → `setShareHost`), and each way out starts
 * from a fresh tap: copy the link (works everywhere), the phone's share menu
 * (where the browser has one), or X's composer.
 */
export function XShareSheet() {
  const [request, setRequest] = useState<ShareRequest | null>(null);
  useEffect(() => setShareHost(setRequest), []);
  return <AnimatePresence>{request && <Sheet key={`${request.text}|${request.url}`} request={request} onClose={() => setRequest(null)} />}</AnimatePresence>;
}

function Sheet({ request, onClose }: { request: ShareRequest; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [copied, setCopied] = useState<boolean | null>(null);
  // The phone's share menu, where the browser has one (never inside an iframe X didn't allow it in).
  const [canShare] = useState(() => {
    try {
      return typeof navigator.share === "function" && (navigator.canShare?.({ text: request.text, url: request.url }) ?? true);
    } catch {
      return false;
    }
  });

  const copy = async () => {
    const ok = await copyText(request.url ?? request.text);
    setCopied(ok);
    if (ok) {
      play("pop");
      haptic("success");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ text: request.text, url: request.url });
      onClose();
    } catch (error) {
      // Cancelled (fine), or not allowed here after all: copying still works.
      if (!(error instanceof DOMException && error.name === "AbortError")) void copy();
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink-950/70 p-3 backdrop-blur-sm sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-label="Share"
        className="w-full max-w-[440px] rounded-3xl glass-strong p-4"
        initial={reduced ? { opacity: 0 } : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { y: 40, opacity: 0 }}
        transition={spring.soft}
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-[15px] font-extrabold text-ink-50">Share</p>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-ink-300 hover:bg-white/[0.06] hover:text-ink-50">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2 line-clamp-3 select-text rounded-2xl bg-white/[0.05] px-3 py-2 text-[13px] leading-snug text-ink-200">
          {request.text}
          {request.url && <span className="mt-1 block truncate font-mono text-[12px] text-ink-400">{request.url}</span>}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-white/10 text-sm font-semibold text-ink-50 transition hover:bg-white/15"
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            {copied ? "Link copied" : request.url ? "Copy link" : "Copy"}
          </button>
          {canShare ? (
            <button
              type="button"
              onClick={() => void share()}
              className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-white/10 text-sm font-semibold text-ink-50 transition hover:bg-white/15"
            >
              <Share2 className="size-4" /> Share…
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                postOnX(request.text, request.url);
                onClose();
              }}
              className="flex h-11 items-center justify-center gap-1.5 rounded-full bg-ink-50 text-sm font-semibold text-ink-950 transition hover:bg-white"
            >
              <XLogo className="size-3.5" /> Post on X
            </button>
          )}
        </div>
        {canShare && (
          <button
            type="button"
            onClick={() => {
              postOnX(request.text, request.url);
              onClose();
            }}
            className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ink-50 text-sm font-semibold text-ink-950 transition hover:bg-white"
          >
            <XLogo className="size-3.5" /> Post on X
          </button>
        )}
        <AnimatePresence>
          {copied !== null && (
            <motion.p
              key={String(copied)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-center text-xs text-ink-300"
            >
              {copied ? "Paste it into a post or a reply." : "Couldn't copy here. Press and hold the text above to copy it."}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
