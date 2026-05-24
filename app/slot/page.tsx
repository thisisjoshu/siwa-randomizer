"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAMES, pickRandomName } from "../lib/names";

const ITEM_HEIGHT = 88; // px — sized for mobile-first
const SPIN_DURATION_MS = 4200;

export default function SlotPage() {
  const [winner, setWinner] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [translate, setTranslate] = useState(0);
  const [transition, setTransition] = useState("none");
  const lastWinnerRef = useRef<string | null>(null);

  // Build a long reel of names so the spin has enough runway.
  const reel = useMemo(() => {
    const cycles = 30;
    const out: string[] = [];
    for (let i = 0; i < cycles; i++) out.push(...NAMES);
    return out;
  }, []);

  const spin = () => {
    if (spinning) return;
    const next = pickRandomName(lastWinnerRef.current ?? undefined);
    lastWinnerRef.current = next;

    // Reset to top with no transition (reel sits hidden behind the placeholder
    // on the very first spin, so there's no flash of names).
    setTransition("none");
    setTranslate(0);
    setWinner(null);
    setSpinning(true);

    const targetCycle = 24;
    const indexInNames = NAMES.indexOf(next);
    const targetIndex = targetCycle * NAMES.length + indexInNames;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setHasStarted(true); // remove the placeholder in the same frame the spin starts
        setTransition(
          `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        );
        setTranslate(-targetIndex * ITEM_HEIGHT);
      });
    });

    window.setTimeout(() => {
      setWinner(next);
      setSpinning(false);
    }, SPIN_DURATION_MS + 80);
  };

  const spinRef = useRef(spin);
  spinRef.current = spin;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        spinRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-darker via-brand-dark to-brand px-4 py-8 text-white sm:px-6">
      <BackLink />

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
          {/* Reel — always mounted so the placeholder can hide it cleanly */}
          <div
            style={{
              transform: `translateY(${translate + ITEM_HEIGHT}px)`,
              transition,
              visibility: hasStarted ? "visible" : "hidden",
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

          {/* Placeholder — covers the reel until the first spin starts */}
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
          <div className="absolute inset-0 bg-brand-cyan/10" />
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 sm:mt-10 sm:flex-row sm:gap-4">
        <button
          onClick={spin}
          disabled={spinning}
          className="rounded-full bg-white px-8 py-3 text-base font-bold uppercase tracking-widest text-brand-darker shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 sm:px-10 sm:py-4 sm:text-lg"
        >
          {spinning ? "Spinning…" : winner ? "Draw Again" : "Start"}
        </button>
        <span className="text-[10px] uppercase tracking-widest text-white/60 sm:text-xs">
          or press space
        </span>
      </div>

      {winner && !spinning && (
        <div
          className="font-display mt-6 px-4 text-center text-2xl font-bold italic tracking-tight text-brand-light sm:mt-8 sm:text-3xl"
          style={{ animation: "brand-glow 2s ease-in-out infinite" }}
        >
          🏆 {winner}
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="absolute left-4 top-4 text-[10px] font-semibold uppercase tracking-widest text-white/60 hover:text-white sm:left-6 sm:top-6 sm:text-xs"
    >
      ← Back
    </Link>
  );
}
