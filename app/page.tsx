"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import { pickRandomName } from "./lib/names";
import { useNames } from "./lib/store";

const ITEM_HEIGHT = 104; // px — row height; sized for broadcast presence
const SPIN_SPEED_PX_PER_MS = 2.4; // continuous-spin velocity
const MIN_SPIN_MS = 1500; // ignore Stop presses before this many ms
// The slow-down always lasts exactly STOP_DURATION_MS, regardless of how many
// names are in the list. Deceleration starts at full spin speed and decays
// smoothly to 0 at the winner; rather than fixing the decay power, we derive it
// from the travel distance so the motion stays C0/C1 continuous with the spin
// (no jerk) AND the winner lands exactly on time — see stopSpinning.
const STOP_DURATION_MS = 7000; // fixed 10s glide to the winner
// Distance we'd ideally cover during the slow-down, chosen so the derived decay
// power lands around this value (a nicely back-loaded "will it land?" crawl).
const STOP_IDEAL_DECAY_POWER = 2.5;
const PRE_LOCK_FLASH_MS = 280; // band flash right before lock

type Phase = "idle" | "spinning" | "stopping" | "revealed";

const BRAND_CONFETTI_COLORS = ["#218acc", "#00a8e6", "#56ade4", "#ffffff"];

export default function SlotPage() {
  const { names, loaded } = useNames();
  const [winner, setWinner] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [translate, setTranslate] = useState(0);
  const [transition, setTransition] = useState("none");
  const [bandFlash, setBandFlash] = useState(false);
  const lastWinnerRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const spinStartRef = useRef<number>(0);
  const translateRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");

  // Build a long reel of names so the spin has enough runway.
  const reel = useMemo(() => {
    const cycles = 60;
    const out: string[] = [];
    for (let i = 0; i < cycles; i++) out.push(...names);
    return out;
  }, [names]);

  const reelHeight = names.length * ITEM_HEIGHT;

  const cancelRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const updateTranslate = useCallback((value: number) => {
    translateRef.current = value;
    setTranslate(value);
  }, []);

  const fireConfetti = useCallback(() => {
    const baseOpts = {
      colors: BRAND_CONFETTI_COLORS,
      startVelocity: 55,
      spread: 70,
      ticks: 220,
      gravity: 0.9,
      scalar: 1.1,
    };
    confetti({
      ...baseOpts,
      particleCount: 90,
      angle: 60,
      origin: { x: 0, y: 0.95 },
    });
    confetti({
      ...baseOpts,
      particleCount: 90,
      angle: 120,
      origin: { x: 1, y: 0.95 },
    });
    // Top-burst follow-up for extra drama.
    window.setTimeout(() => {
      confetti({
        colors: BRAND_CONFETTI_COLORS,
        particleCount: 140,
        spread: 110,
        startVelocity: 45,
        origin: { x: 0.5, y: 0.35 },
        scalar: 1.2,
      });
    }, 260);
  }, []);

  const startSpinning = useCallback(() => {
    if (names.length === 0) return;
    const next = pickRandomName(names, lastWinnerRef.current ?? undefined);
    if (!next) return;
    lastWinnerRef.current = next;

    setWinner(null);
    setTransition("none");
    updateTranslate(0);
    spinStartRef.current = performance.now();
    phaseRef.current = "spinning";
    setPhase("spinning");

    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      // Keep translate negative, wrap within a single names cycle so the
      // visual position stays the same as we cross the cycle boundary.
      let nextTranslate = translateRef.current - dt * SPIN_SPEED_PX_PER_MS;
      if (nextTranslate <= -reelHeight) nextTranslate += reelHeight;
      updateTranslate(nextTranslate);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [names, reelHeight, updateTranslate]);

  const stopSpinning = useCallback(() => {
    const elapsed = performance.now() - spinStartRef.current;
    if (elapsed < MIN_SPIN_MS) return;

    cancelRaf();

    const winnerName = lastWinnerRef.current;
    if (!winnerName) return;

    // Current translate is in (-reelHeight, 0]. Land the winner at the same
    // visual band position after STOP_EXTRA_CYCLES additional cycles.
    const winnerIndex = names.indexOf(winnerName);
    const current = translateRef.current;
    // Distance to next aligned winner position (continuing downward / more
    // negative). winnerIndex * ITEM_HEIGHT is how far below the cycle origin
    // the winner sits.
    const winnerOffset = winnerIndex * ITEM_HEIGHT;
    const v0 = SPIN_SPEED_PX_PER_MS;
    const duration = STOP_DURATION_MS; // fixed glide, independent of list size

    // Valid landing distances (that drop the winner in the band) are
    // d0 + k*reelHeight for integer k >= 0, where d0 is the smallest such.
    const d0 = (((current + winnerOffset) % reelHeight) + reelHeight) % reelHeight;
    // Aim for a travel distance that makes the derived decay power land near
    // STOP_IDEAL_DECAY_POWER, then snap to a whole number of winner-aligned
    // cycles (k >= 1 so there's always at least one full visible pass).
    const idealDistance = (v0 * duration) / (STOP_IDEAL_DECAY_POWER + 1);
    let k = Math.max(1, Math.round((idealDistance - d0) / reelHeight));
    let totalDistance = d0 + k * reelHeight;
    // The curve can cover at most v0*duration in this time; back off cycles if
    // we'd exceed that (would otherwise need a non-physical decay power).
    while (totalDistance >= v0 * duration && k > 0) {
      k -= 1;
      totalDistance = d0 + k * reelHeight;
    }
    const target = current - totalDistance;

    // Derive the decay power so v(0) exactly equals the spin speed (no jerk) and
    // the winner lands precisely at t = duration:
    //   v(t) = v0 * (1 - t/T)^n,  integral over [0,T] = v0*T/(n+1) = totalDistance
    //   ⇒ n + 1 = v0*T / totalDistance.
    const n = (v0 * duration) / totalDistance - 1;

    phaseRef.current = "stopping";
    setPhase("stopping");
    setTransition("none"); // rAF drives the slowdown — no CSS handoffs

    const start = performance.now();
    let preLockFlashed = false;
    const tick = (now: number) => {
      const t = now - start;
      if (t >= duration) {
        updateTranslate(target);
        rafRef.current = null;
        phaseRef.current = "revealed";
        setPhase("revealed");
        setWinner(winnerName);
        setBandFlash(true);
        window.setTimeout(() => setBandFlash(false), 700);
        fireConfetti();
        return;
      }
      const p = t / duration;
      // Position = integral of v from 0 to t / total → 1 - (1-p)^(n+1)
      const traveled = totalDistance * (1 - Math.pow(1 - p, n + 1));
      updateTranslate(current - traveled);
      if (!preLockFlashed && duration - t < PRE_LOCK_FLASH_MS) {
        preLockFlashed = true;
        setBandFlash(true);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [names, fireConfetti, reelHeight, updateTranslate]);

  const handlePress = useCallback(() => {
    const current = phaseRef.current;
    if (current === "idle" || current === "revealed") {
      startSpinning();
    } else if (current === "spinning") {
      stopSpinning();
    }
    // "stopping" — ignore presses while decelerating.
  }, [startSpinning, stopSpinning]);

  const pressRef = useRef(handlePress);
  useEffect(() => {
    pressRef.current = handlePress;
  }, [handlePress]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        pressRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => cancelRaf(), []);

  const hasStarted = phase !== "idle";
  const buttonLabel =
    phase === "spinning"
      ? "Stop"
      : phase === "stopping"
        ? "Stopping…"
        : phase === "revealed"
          ? "Draw Again"
          : "Start";

  // Three render states, distinguished so we never flash the empty CTA while
  // the server list is still loading on first paint.
  const isEmpty = loaded && names.length === 0;
  const isReady = loaded && names.length > 0;

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-darker via-brand-dark to-brand px-4 py-10 text-white sm:px-6">
      {/* Ambient stage glow */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[120vmin] w-[120vmin]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(0,168,230,0.35), rgba(86,173,228,0.12) 45%, transparent 70%)",
          animation: "aurora 18s linear infinite",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(11,32,48,0.7))]" />

      <Link
        href="/admin"
        className="eyebrow absolute right-4 top-4 z-20 text-[10px] text-white/45 transition hover:text-brand-light sm:right-6 sm:top-6 sm:text-xs"
      >
        Admin →
      </Link>

      {/* Brand lockup + headline */}
      <header className="relative z-10 mb-8 flex flex-col items-center text-center sm:mb-12">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-cyan/15 text-base ring-1 ring-brand-cyan/40 sm:h-9 sm:w-9">
            💧
          </span>
          <span className="eyebrow text-[11px] text-brand-light sm:text-sm">
            Solomon Water
          </span>
        </div>
        {!isEmpty && (
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white/90 sm:text-5xl md:text-6xl">
            And the winner is<span className="text-brand-cyan">…</span>
          </h1>
        )}
      </header>

      {isEmpty ? (
        /* Empty state — list loaded but no names entered yet */
        <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
          <span
            className="grid h-20 w-20 place-items-center rounded-3xl bg-brand-cyan/10 text-4xl ring-1 ring-brand-cyan/30 sm:h-24 sm:w-24 sm:text-5xl"
            style={{ animation: "float-bob 3s ease-in-out infinite" }}
          >
            💧
          </span>
          <h2 className="font-display mt-6 text-4xl uppercase leading-none sm:text-5xl">
            No names to draw yet
          </h2>
          <p className="mt-4 max-w-sm text-sm text-white/60 sm:text-base">
            Add the entrants in the admin, then come back here to run the draw.
          </p>
          <Link
            href="/admin"
            className="mt-8 rounded-full bg-white px-10 py-4 text-base font-bold uppercase tracking-[0.2em] text-brand-darker shadow-[0_15px_45px_-12px_rgba(0,168,230,0.7)] ring-1 ring-white/40 transition hover:scale-105 sm:px-12 sm:py-5 sm:text-lg"
          >
            Add names →
          </Link>
        </div>
      ) : (
        <>
      {/* Stage */}
      <div
        className="relative z-10 w-full max-w-3xl"
        style={{ height: ITEM_HEIGHT * 3 }}
      >
        {/* Reel window */}
        <div className="absolute inset-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-black/40 to-black/25 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur">
          <div
            style={{
              transform: `translateY(${translate + ITEM_HEIGHT}px)`,
              transition,
              visibility: hasStarted ? "visible" : "hidden",
              willChange: "transform",
            }}
          >
            {reel.map((name, i) => (
              <div
                key={i}
                style={{ height: ITEM_HEIGHT }}
                className="font-names flex items-center justify-center whitespace-nowrap px-6 text-center text-4xl uppercase leading-none sm:px-10 sm:text-5xl md:text-6xl"
              >
                {name}
              </div>
            ))}
          </div>

          {!hasStarted && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-white/45">
                <span
                  className="text-5xl sm:text-6xl"
                  style={{ animation: "float-bob 3s ease-in-out infinite" }}
                >
                  💧
                </span>
                <span className="eyebrow text-center text-xs sm:text-sm">
                  {loaded ? "Ready to draw" : "Loading…"}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top + bottom fades */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-3xl bg-gradient-to-b from-brand-darker via-brand-darker/80 to-transparent"
          style={{ height: ITEM_HEIGHT }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-3xl bg-gradient-to-t from-brand-darker via-brand-darker/80 to-transparent"
          style={{ height: ITEM_HEIGHT }}
        />

        {/* Selection band */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y-2 border-brand-cyan/70"
          style={{
            height: ITEM_HEIGHT,
            boxShadow:
              "0 0 30px rgba(0,168,230,0.35), inset 0 0 30px rgba(0,168,230,0.12)",
          }}
        >
          <div
            className={`absolute inset-0 transition-colors duration-500 ${
              bandFlash ? "bg-white/60" : "bg-brand-cyan/10"
            }`}
          />
        </div>

        {/* Caret indicators pointing at the band */}
        <span
          className="pointer-events-none absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-2xl text-brand-cyan drop-shadow-[0_0_8px_rgba(0,168,230,0.8)] sm:text-3xl"
          style={{ ["--caret-shift" as string]: "6px", animation: "caret-pulse 1.4s ease-in-out infinite" }}
        >
          ▶
        </span>
        <span
          className="pointer-events-none absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-1/2 text-2xl text-brand-cyan drop-shadow-[0_0_8px_rgba(0,168,230,0.8)] sm:text-3xl"
          style={{ ["--caret-shift" as string]: "-6px", animation: "caret-pulse 1.4s ease-in-out infinite" }}
        >
          ◀
        </span>

        {/* Winner overlay card */}
        {phase === "revealed" && winner && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ animation: "winner-pop 600ms cubic-bezier(0.2, 1.4, 0.4, 1) both" }}
          >
            <div className="relative mx-2 w-full max-w-2xl rounded-3xl border-2 border-brand-cyan bg-brand-darker/95 px-6 py-7 text-center shadow-[0_30px_100px_-15px_rgba(0,168,230,0.65)] sm:px-12 sm:py-10">
              <div
                className="pointer-events-none absolute -inset-1 rounded-3xl"
                style={{
                  boxShadow: "0 0 70px 8px rgba(0, 168, 230, 0.55)",
                  animation: "brand-glow 2s ease-in-out infinite",
                }}
              />
              <p className="eyebrow text-[11px] text-brand-light sm:text-xs">
                🏆 Winner · Customer Draw
              </p>
              <p className="font-display mt-3 break-words text-5xl uppercase leading-[0.9] text-white sm:text-7xl md:text-8xl">
                {winner}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {isReady && (
        <div className="relative z-10 mt-8 flex flex-col items-center gap-3 sm:mt-12">
          <button
            onClick={handlePress}
            disabled={phase === "stopping"}
            className="group relative rounded-full bg-white px-10 py-4 text-base font-bold uppercase tracking-[0.2em] text-brand-darker shadow-[0_15px_45px_-12px_rgba(0,168,230,0.7)] ring-1 ring-white/40 transition hover:scale-105 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 sm:px-14 sm:py-5 sm:text-lg"
          >
            {buttonLabel}
          </button>
          <span className="eyebrow text-[10px] text-white/55 sm:text-xs">
            or press{" "}
            <kbd className="rounded border border-white/25 bg-white/5 px-1.5 py-0.5 font-sans text-[10px] not-italic tracking-normal">
              Space
            </kbd>
          </span>
        </div>
      )}
        </>
      )}
    </div>
  );
}