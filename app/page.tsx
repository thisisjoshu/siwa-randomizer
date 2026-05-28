"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { NAMES, pickRandomName } from "./lib/names";

const ITEM_HEIGHT = 88; // px — sized for mobile-first
const SPIN_SPEED_PX_PER_MS = 2.4; // continuous-spin velocity
const MIN_SPIN_MS = 1500; // ignore Stop presses before this many ms
// Continuous deceleration: starts at full spin speed, decays smoothly to 0 at
// the winner. STOP_DECAY_POWER controls how dramatic the tail crawl is —
// higher = longer slow-mo at the end. Total stop duration is derived so the
// motion is C0/C1 continuous with the spin (no visible pause).
const STOP_EXTRA_CYCLES = 3;
const STOP_DECAY_POWER = 2.5;
const PRE_LOCK_FLASH_MS = 280; // band flash right before lock

type Phase = "idle" | "spinning" | "stopping" | "revealed";

const BRAND_CONFETTI_COLORS = ["#218acc", "#00a8e6", "#56ade4", "#ffffff"];

export default function SlotPage() {
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
    for (let i = 0; i < cycles; i++) out.push(...NAMES);
    return out;
  }, []);

  const reelHeight = NAMES.length * ITEM_HEIGHT;

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
    const next = pickRandomName(lastWinnerRef.current ?? undefined);
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
  }, [reelHeight, updateTranslate]);

  const stopSpinning = useCallback(() => {
    const elapsed = performance.now() - spinStartRef.current;
    if (elapsed < MIN_SPIN_MS) return;

    cancelRaf();

    const winnerName = lastWinnerRef.current;
    if (!winnerName) return;

    // Current translate is in (-reelHeight, 0]. Land the winner at the same
    // visual band position after STOP_EXTRA_CYCLES additional cycles.
    const winnerIndex = NAMES.indexOf(winnerName);
    const current = translateRef.current;
    // Distance to next aligned winner position (continuing downward / more
    // negative). winnerIndex * ITEM_HEIGHT is how far below the cycle origin
    // the winner sits.
    const winnerOffset = winnerIndex * ITEM_HEIGHT;
    // Target is current minus (extra cycles * reelHeight) and aligned to land
    // on the winner row. We solve: target ≡ -winnerOffset (mod reelHeight),
    // and target <= current - STOP_EXTRA_CYCLES * reelHeight.
    const minTarget = current - STOP_EXTRA_CYCLES * reelHeight;
    // Bring -winnerOffset into the same modular class <= minTarget.
    const mod = ((minTarget + winnerOffset) % reelHeight + reelHeight) % reelHeight;
    const target = minTarget - mod;

    const totalDistance = current - target; // positive (we travel downward)
    const v0 = SPIN_SPEED_PX_PER_MS; // continuity: matches spin velocity exactly
    const n = STOP_DECAY_POWER;
    // Quadratic-ish velocity decay: v(t) = v0 * (1 - t/T)^n
    // Integrated distance = v0 * T / (n + 1) → solve T for our distance.
    const duration = ((n + 1) * totalDistance) / v0;

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
  }, [fireConfetti, reelHeight, updateTranslate]);

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

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-darker via-brand-dark to-brand px-4 py-8 text-white sm:px-6">
      <header className="mb-6 text-center sm:mb-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-brand-light sm:text-xs">
          Solomon Water
        </p>
        <h1 className="font-display mt-2 text-3xl font-black italic tracking-tight sm:text-5xl md:text-6xl">
          And the winner is…
        </h1>
      </header>

      <div
        className="relative w-full max-w-2xl"
        style={{ height: ITEM_HEIGHT * 3 }}
      >
        {/* Reel window */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl border-2 border-white/15 bg-black/30 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur sm:rounded-3xl">
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
                className="font-display flex items-center justify-center px-4 text-center text-3xl font-bold tracking-tight sm:px-6 sm:text-4xl md:text-5xl"
              >
                {name}
              </div>
            ))}
          </div>

          {!hasStarted && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-white/40 sm:flex-row sm:gap-4">
                <span className="text-4xl sm:text-5xl">💧</span>
                <span className="text-sm font-semibold uppercase tracking-[0.4em] sm:text-lg">
                  Ready to draw
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top + bottom fades */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 rounded-t-2xl bg-gradient-to-b from-brand-darker to-transparent sm:rounded-t-3xl"
          style={{ height: ITEM_HEIGHT }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-brand-darker to-transparent sm:rounded-b-3xl"
          style={{ height: ITEM_HEIGHT }}
        />

        {/* Selection band */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y-2 border-brand-cyan/80"
          style={{ height: ITEM_HEIGHT }}
        >
          <div
            className={`absolute inset-0 transition-colors duration-500 ${
              bandFlash ? "bg-white/60" : "bg-brand-cyan/10"
            }`}
          />
        </div>

        {/* Winner overlay card */}
        {phase === "revealed" && winner && (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            style={{ animation: "winner-pop 600ms cubic-bezier(0.2, 1.4, 0.4, 1) both" }}
          >
            <div className="relative mx-4 w-full max-w-xl rounded-2xl border-2 border-brand-cyan bg-brand-darker/95 px-6 py-6 text-center shadow-[0_20px_80px_-10px_rgba(0,168,230,0.6)] sm:rounded-3xl sm:px-10 sm:py-8">
              <div
                className="pointer-events-none absolute -inset-1 rounded-2xl sm:rounded-3xl"
                style={{
                  boxShadow: "0 0 60px 6px rgba(0, 168, 230, 0.55)",
                  animation: "brand-glow 2s ease-in-out infinite",
                }}
              />
              <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-brand-light sm:text-xs">
                Solomon Water · Customer Draw
              </p>
              <p className="font-display mt-3 text-3xl font-black italic tracking-tight text-white sm:text-5xl md:text-6xl">
                🏆 {winner}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 sm:mt-10 sm:flex-row sm:gap-4">
        <button
          onClick={handlePress}
          disabled={phase === "stopping"}
          className="rounded-full bg-white px-8 py-3 text-base font-bold uppercase tracking-widest text-brand-darker shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 sm:px-10 sm:py-4 sm:text-lg"
        >
          {buttonLabel}
        </button>
        <span className="text-[10px] uppercase tracking-widest text-white/60 sm:text-xs">
          or press space
        </span>
      </div>
    </div>
  );
}