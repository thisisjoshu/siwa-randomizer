"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAMES, pickRandomName } from "../lib/names";

const ITEM_HEIGHT = 120; // px
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

    // Reset to top with no transition.
    setTransition("none");
    setTranslate(0);
    setWinner(null);
    setSpinning(true);
    setHasStarted(true);

    // Find a target index near the end of the reel that matches the winner.
    const targetCycle = 24; // land deep in the reel
    const indexInNames = NAMES.indexOf(next);
    const targetIndex = targetCycle * NAMES.length + indexInNames;

    // Next frame, apply the eased transition.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        spin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-brand-darker via-brand-dark to-brand text-white">
      <BackLink />

      <header className="mb-10 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.5em] text-brand-light">
          Solomon Water
        </p>
        <h1 className="font-display mt-2 text-5xl font-black italic tracking-tight sm:text-6xl">
          And the winner is…
        </h1>
      </header>

      <div
        className="relative w-full max-w-3xl"
        style={{ height: ITEM_HEIGHT * 3 }}
      >
        {/* Reel window */}
        <div
          className="absolute inset-0 overflow-hidden rounded-3xl border-2 border-white/15 bg-black/30 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur"
        >
          {hasStarted ? (
            <div
              style={{
                transform: `translateY(${translate + ITEM_HEIGHT}px)`,
                transition,
              }}
            >
              {reel.map((name, i) => (
                <div
                  key={i}
                  style={{ height: ITEM_HEIGHT }}
                  className="font-display flex items-center justify-center px-6 text-center text-5xl font-bold tracking-tight sm:text-6xl"
                >
                  {name}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="flex items-center gap-4 text-white/40">
                <span className="text-5xl">💧</span>
                <span className="text-xl font-semibold uppercase tracking-[0.4em]">
                  Ready to draw
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top + bottom fades */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[120px] rounded-t-3xl bg-gradient-to-b from-brand-darker to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[120px] rounded-b-3xl bg-gradient-to-t from-brand-darker to-transparent" />

        {/* Selection band */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 border-y-2 border-brand-cyan/80"
          style={{ height: ITEM_HEIGHT }}
        >
          <div className="absolute inset-0 bg-brand-cyan/10" />
        </div>
      </div>

      <div className="mt-10 flex items-center gap-4">
        <button
          onClick={spin}
          disabled={spinning}
          className="rounded-full bg-white px-10 py-4 text-lg font-bold uppercase tracking-widest text-brand-darker shadow-lg transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {spinning ? "Spinning…" : winner ? "Draw Again" : "Start"}
        </button>
        <span className="text-xs uppercase tracking-widest text-white/60">
          or press space
        </span>
      </div>

      {winner && !spinning && (
        <div
          className="font-display mt-8 text-3xl font-bold italic tracking-tight text-brand-light"
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
      className="absolute left-6 top-6 text-xs font-semibold uppercase tracking-widest text-white/60 hover:text-white"
    >
      ← Back
    </Link>
  );
}
