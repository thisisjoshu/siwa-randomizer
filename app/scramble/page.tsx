"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { pickRandomName } from "../lib/names";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*";
const SCRAMBLE_TICK_MS = 45;
const REVEAL_PER_CHAR_MS = 110;

export default function ScramblePage() {
  const [display, setDisplay] = useState<string>("·  ·  ·  ·  ·");
  const [scrambling, setScrambling] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const lastWinnerRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const stopTicker = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const start = () => {
    if (scrambling) return;
    stopTicker();

    const next = pickRandomName(lastWinnerRef.current ?? undefined);
    lastWinnerRef.current = next;
    setWinner(next);
    setRevealed(false);
    setScrambling(true);

    const target = next;
    const revealedFlags = target.split("").map(() => false);

    // Phase 1: scramble everything for ~1.4s.
    const scrambleStart = performance.now();
    const lockStart = scrambleStart + 1400;

    intervalRef.current = window.setInterval(() => {
      const now = performance.now();
      const elapsedSinceLock = Math.max(0, now - lockStart);
      const charsToReveal = Math.floor(elapsedSinceLock / REVEAL_PER_CHAR_MS);

      // Reveal characters left-to-right (skip spaces — they reveal instantly).
      let revealedCount = 0;
      for (let i = 0; i < target.length; i++) {
        if (target[i] === " ") {
          revealedFlags[i] = true;
          continue;
        }
        if (revealedCount < charsToReveal) {
          revealedFlags[i] = true;
          revealedCount++;
        } else {
          revealedFlags[i] = false;
        }
      }

      const next = target
        .split("")
        .map((c, i) => {
          if (revealedFlags[i]) return c;
          if (c === " ") return " ";
          return SCRAMBLE_CHARS[
            Math.floor(Math.random() * SCRAMBLE_CHARS.length)
          ];
        })
        .join("");

      setDisplay(next);

      if (revealedFlags.every(Boolean)) {
        stopTicker();
        setDisplay(target);
        setScrambling(false);
        setRevealed(true);
      }
    }, SCRAMBLE_TICK_MS);
  };

  const startRef = useRef(start);
  startRef.current = start;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        startRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => stopTicker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-[#06121d] text-white">
      <GridBackdrop />
      <BackLink />

      <header className="z-10 mb-8 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.5em] text-brand-cyan">
          Solomon Water · Live Reveal
        </p>
        <h1 className="font-display mt-2 text-4xl font-black italic tracking-tight text-white/90 sm:text-5xl">
          Decoding the winner…
        </h1>
      </header>

      <div className="z-10 flex min-h-[180px] w-full max-w-5xl items-center justify-center px-6">
        <div
          className="font-mono text-5xl font-black tracking-[0.15em] sm:text-7xl"
          style={{
            color: revealed ? "#ffffff" : "#56ade4",
            textShadow: revealed
              ? "0 0 30px rgba(33,138,204,0.8), 0 0 70px rgba(0,168,230,0.6)"
              : "0 0 12px rgba(0,168,230,0.5)",
            transition: "color 0.4s ease",
            wordBreak: "break-word",
            textAlign: "center",
            animation: revealed
              ? "brand-glow 2.4s ease-in-out infinite"
              : undefined,
          }}
        >
          {display || " "}
        </div>
      </div>

      {revealed && winner && (
        <p className="z-10 mt-6 text-sm font-semibold uppercase tracking-[0.4em] text-brand-light">
          🏆 Congratulations
        </p>
      )}

      <div className="z-10 mt-12 flex items-center gap-4">
        <button
          onClick={start}
          disabled={scrambling}
          className="rounded-full bg-brand-cyan px-10 py-4 text-lg font-bold uppercase tracking-widest text-brand-darker shadow-[0_0_40px_rgba(0,168,230,0.5)] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {scrambling ? "Decoding…" : revealed ? "Decode Again" : "Decode"}
        </button>
        <span className="text-xs uppercase tracking-widest text-white/60">
          or press space
        </span>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="absolute left-6 top-6 z-20 text-xs font-semibold uppercase tracking-widest text-white/60 hover:text-white"
    >
      ← Back
    </Link>
  );
}

function GridBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-40"
      style={{
        backgroundImage:
          "linear-gradient(rgba(33,138,204,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(33,138,204,0.18) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
        maskImage:
          "radial-gradient(ellipse at center, black 30%, transparent 75%)",
      }}
    />
  );
}
