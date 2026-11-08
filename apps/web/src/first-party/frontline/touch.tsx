"use client";

/**
 * Twin-stick phone controls: a floating stick on the left half (it appears
 * wherever your thumb lands and follows it if you slide past the edge; push
 * it to the edge to sprint), drag anywhere on the right to look, and buttons
 * in the right thumb's reach: a big fire button, which aims down sights while
 * held (drag it to keep aiming while you shoot; the sniper scopes in while
 * held and fires on release), jump, crouch and grenade. A second fire button
 * sits up on the left so one thumb can shoot while the other aims. Reloading is
 * automatic when the magazine runs dry, and the ammo readout at the top
 * swaps weapons (hud.tsx). Every touch surface is gesture-locked so the page
 * never scrolls or zooms mid-fight.
 */

import { useGestureLock } from "vibecade-sdk/react";
import { ArrowUpFromLine, ChevronsDown, Crosshair } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Engine } from "./engine";
import type { HudState } from "./game";

const RADIUS = 52;
/** How far a resting thumb can slide before the stick is pushed (dead zone, px). */
const DEAD = 6;

export function TouchControls({ engine, hud }: { engine: Engine; hud: HudState }) {
  const root = useRef<HTMLDivElement>(null);
  useGestureLock(root);
  const [stick, setStick] = useState<{ ox: number; oy: number; x: number; y: number } | null>(null);
  const [crouch, setCrouch] = useState(false);
  /** The sniper's scope toggle: stay scoped in and look around, then fire. */
  const [scoped, setScoped] = useState(false);
  const stickId = useRef<number | null>(null);
  /** Fingers on a fire button. */
  const [firing] = useState(() => new Set<number>());

  const me = hud.me;
  const active = !!me && me.alive && hud.phase === "live";
  const input = engine.input;

  // A finger can still be down when the controls go away (death, round end,
  // pause): the browser never sends its pointerup here, so drop everything it
  // held. They remount fresh on every death, respawn and phase (see the key in hud.tsx).
  useEffect(() => {
    if (active) return;
    stickId.current = null;
    firing.clear();
    input.release();
  }, [active, input, firing]);
  useEffect(
    () => () => {
      stickId.current = null;
      firing.clear();
      input.release();
    },
    [input, firing],
  );
  // Out of rounds: reload on its own (no reload button to find mid-fight).
  const empty = !!me && me.alive && me.mag === 0 && me.reserve > 0 && !me.reloading;
  useEffect(() => {
    if (active && empty) input.setTouch({ reload: true });
  }, [active, empty, input]);

  const endStick = () => {
    stickId.current = null;
    setStick(null);
    input.setTouch({ mx: 0, my: 0 });
  };

  const capture = (e: ReactPointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events can't be captured
    }
  };

  const lookStart = (e: ReactPointerEvent) => {
    capture(e);
    input.lookStart(e.pointerId, e.clientX, e.clientY);
    engine.audio.resume();
  };
  const lookMove = (e: ReactPointerEvent) => input.lookMove(e.pointerId, e.clientX, e.clientY);
  const lookEnd = (e: ReactPointerEvent) => input.lookEnd(e.pointerId);

  const press = (on: (down: boolean) => void, look = false) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      capture(e);
      on(true);
      if (look) input.lookStart(e.pointerId, e.clientX, e.clientY);
      engine.audio.resume();
    },
    onPointerMove: look ? lookMove : undefined,
    onPointerUp: (e: ReactPointerEvent) => {
      on(false);
      lookEnd(e);
    },
    onPointerCancel: (e: ReactPointerEvent) => {
      on(false);
      lookEnd(e);
    },
  });

  // Fire aims too (mobile shooters' "ADS fire"): guns aim down sights and shoot while it's
  // held; the sniper scopes in while held and fires on release (a quick-scope).
  const sniper = me?.weapon === "sniper";
  const scopedIn = sniper && scoped;
  const aimFire = (down: boolean) => {
    if (down) input.setTouch({ ads: true, fire: !sniper });
    else if (sniper) input.pulseFire({ ads: scopedIn });
    else input.setTouch({ fire: false, ads: false });
  };
  // The scope follows the toggle: swapping away from the sniper lowers it, swapping back raises it again.
  useEffect(() => {
    input.setTouch({ ads: scopedIn });
  }, [scopedIn, input]);

  const tap = (fn: () => void) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    },
  });

  // The stick follows a thumb that slides past its edge, so turning around never
  // means lifting it and putting it back down.
  const stickMove = (e: ReactPointerEvent, origin: { ox: number; oy: number }) => {
    let ox = origin.ox;
    let oy = origin.oy;
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) {
      ox += (dx / d) * (d - RADIUS);
      oy += (dy / d) * (d - RADIUS);
      dx = (dx / d) * RADIUS;
      dy = (dy / d) * RADIUS;
    }
    setStick({ ox, oy, x: dx, y: dy });
    const k = d < DEAD ? 0 : 1 / RADIUS;
    input.setTouch({ mx: dx * k, my: -dy * k });
  };

  // Either fire button (or both at once): shooting stops when the last finger lifts.
  const fireBtn = (look: boolean) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      capture(e);
      if (firing.size === 0) aimFire(true);
      firing.add(e.pointerId);
      if (look) input.lookStart(e.pointerId, e.clientX, e.clientY);
      engine.audio.resume();
    },
    onPointerMove: look ? lookMove : undefined,
    onPointerUp: (e: ReactPointerEvent) => fireEnd(e),
    onPointerCancel: (e: ReactPointerEvent) => fireEnd(e),
  });
  const fireEnd = (e: ReactPointerEvent) => {
    lookEnd(e);
    if (!firing.delete(e.pointerId)) return;
    if (firing.size === 0) aimFire(false);
  };

  return (
    <div ref={root} className={cn("absolute inset-x-0 bottom-0 top-[22%] touch-none select-none", active ? "pointer-events-auto" : "pointer-events-none hidden")}>
      {me && active && (
        <>
      {/* Look: the right side. */}
      <div className="absolute inset-y-0 right-0 w-1/2" onPointerDown={lookStart} onPointerMove={lookMove} onPointerUp={lookEnd} onPointerCancel={lookEnd} />
      {/* Move: the whole left half; the stick appears wherever the thumb lands. */}
      <div
        className="absolute inset-y-0 left-0 w-1/2"
        onPointerDown={(e) => {
          // A new thumb always takes the stick (never locked out by a lost touch).
          stickId.current = e.pointerId;
          capture(e);
          setStick({ ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
          engine.audio.resume();
        }}
        onPointerMove={(e) => {
          if (e.pointerId !== stickId.current || !stick) return;
          stickMove(e, stick);
        }}
        onPointerUp={(e) => {
          if (e.pointerId === stickId.current) endStick();
        }}
        onPointerCancel={(e) => {
          if (e.pointerId === stickId.current) endStick();
        }}
        onLostPointerCapture={(e) => {
          if (e.pointerId === stickId.current) endStick();
        }}
      />
      {stick ? (
        <div className="pointer-events-none fixed" style={{ left: stick.ox, top: stick.oy }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25 bg-white/5" style={{ width: RADIUS * 2 + 28, height: RADIUS * 2 + 28 }} />
          <div
            className={cn("absolute size-14 rounded-full border border-white/40 backdrop-blur", Math.hypot(stick.x, stick.y) > RADIUS * 0.93 && stick.y < 0 ? "bg-[var(--accent-from)]/50" : "bg-white/25")}
            style={{ transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))` }}
          />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-6 flex flex-col items-center gap-1.5 text-white/35">
          <div className="flex size-28 items-center justify-center rounded-full border-2 border-dashed border-white/15 [@media(max-height:480px)]:size-20">
            <div className="size-12 rounded-full bg-white/10 [@media(max-height:480px)]:size-9" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Touch anywhere to move</span>
        </div>
      )}

      {/* Left fire: shoot with the left thumb while the right one aims. */}
      <Btn
        label="Fire (left hand)"
        size="md"
        {...fireBtn(false)}
        className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[12%] bg-[color-mix(in_oklab,var(--accent-to)_30%,transparent)]"
      >
        <Crosshair className="size-7" />
      </Btn>

      {/* Buttons: fire under the thumb with jump above it, crouch and the grenade beside them (and the sniper's scope). */}
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 grid grid-cols-[auto_auto_auto] items-center justify-items-center gap-x-3 gap-y-2 [@media(max-height:480px)]:gap-y-1.5">
        <div />
        <Btn
          label={`${hud.nade.name} (hold to aim, release to throw)`}
          size="sm"
          className={me.nades > 0 ? undefined : "opacity-35"}
          {...press((down) => input.setTouch({ grenade: down && me.nades > 0 }), true)}
        >
          <span className="text-[19px] leading-none">{hud.nade.icon}</span>
        </Btn>
        <Btn label="Jump" size="sm" {...tap(() => input.setTouch({ jump: true }))}>
          <ArrowUpFromLine className="size-5" />
        </Btn>
        {/* Only with the sniper: scope in to look around without shooting. */}
        {sniper ? (
          <Btn
            label={scopedIn ? "Aim: on (tap to lower the scope)" : "Aim: scope in"}
            size="sm"
            on={scopedIn}
            {...tap(() => {
              input.setTouch({ ads: !scopedIn });
              setScoped(!scopedIn);
            })}
          >
            <span className="text-[11px] font-black uppercase tracking-wider">Aim</span>
          </Btn>
        ) : (
          <div />
        )}
        <Btn
          label="Crouch"
          size="sm"
          on={crouch}
          {...tap(() => {
            input.setTouch({ crouch: !crouch });
            setCrouch(!crouch);
          })}
        >
          <ChevronsDown className="size-5" />
        </Btn>
        <Btn
          label={sniper ? (scopedIn ? "Fire" : "Fire: hold to scope in, release to fire") : "Fire: hold to aim down sights and shoot"}
          size="lg"
          {...fireBtn(true)}
          className="bg-[color-mix(in_oklab,var(--accent-to)_40%,transparent)]"
        >
          <Crosshair className="size-10" />
        </Btn>
      </div>
        </>
      )}
    </div>
  );
}

function Btn({
  label,
  size,
  on,
  className,
  children,
  ...handlers
}: {
  label: string;
  size: "sm" | "md" | "lg";
  on?: boolean;
  className?: string;
  children: ReactNode;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      {...handlers}
      className={cn(
        "flex items-center justify-center rounded-full border border-white/25 bg-ink-900/55 text-white backdrop-blur active:scale-95",
        // Short screens (a phone on its side, the post's card) get smaller buttons.
        size === "sm" ? "size-12 [@media(max-height:480px)]:size-10" : size === "md" ? "size-16 [@media(max-height:480px)]:size-13" : "size-28 [@media(max-height:480px)]:size-22",
        on && "border-[var(--accent-from)] bg-[color-mix(in_oklab,var(--accent-from)_35%,transparent)]",
        className,
      )}
    >
      {children}
    </button>
  );
}
