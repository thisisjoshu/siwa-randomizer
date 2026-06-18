"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { pickRandomName } from "../lib/names";
import { useNames } from "../lib/store";

// Row height drives both the visual size and the spin math. The card is sized
// so exactly three rows fill the framed window (matching the mockup), then the
// frame's fixed aspect ratio derives the overall card dimensions.
const ITEM_HEIGHT = 150; // px — one name row; tuned for broadcast presence
const SPIN_SPEED_PX_PER_MS = 1.6; // ≈7 rows/sec at full spin
const MIN_SPIN_MS = 1500; // ignore Stop presses before this
// Deceleration shape. The slowdown follows v(t) = v0·(1 − t/T)^POWER:
//   • 1   = constant deceleration (most even, linear-velocity glide)
//   • 1.5 = a touch back-loaded — eases a little longer near the end
const SLOWDOWN_POWER = 1.5;
// Fixed slow-down length for EVERY list size. We always travel the exact
// distance whose curve begins at the spin speed over this duration (seamless
// hand-off) and place the winner on whichever row lands centred — so the
// distance, and therefore the 7s duration and feel, never depend on list size.
const SLOWDOWN_DURATION_MS = 9000;
// The confetti clip opens with ~0.47s of black lead-in frames; park playback at
// the burst so revealing it starts the confetti instantly (and we skip the
// invisible lead-in entirely).
const CONFETTI_START_S = 0.47;

// The white frame PNG is 3885×1969; its blue fill sits concentrically inside at
// 3804×1888, so the reel window is inset by these fractions of the card box.
const FRAME_RATIO = 3885 / 1969;
const WINDOW_INSET_X = `${((3885 - 3804) / 2 / 3885) * 100}%`; // ~1.04%
const WINDOW_INSET_Y = `${((1969 - 1888) / 2 / 1969) * 100}%`; // ~2.06%
const WINDOW_VISIBLE_FRACTION = 1 - (1969 - 1888) / 1969; // window/card height

const ASSET = "/spinner2";

type Phase = "idle" | "spinning" | "stopping" | "revealed";

export default function Spinner2Page({
  initialNames,
}: {
  initialNames?: string[];
}) {
  const { names, loaded } = useNames(initialNames);
  const [winner, setWinner] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showConfetti, setShowConfetti] = useState(false);
  // Row index in the reel that the slow-down lands on; we paint the winner there
  // so the travel distance can stay constant (independent of the list).
  const [landingIndex, setLandingIndex] = useState<number | null>(null);
  const [cardScale, setCardScale] = useState(1);
  const confettiVideoRef = useRef<HTMLVideoElement>(null);
  const reelInnerRef = useRef<HTMLDivElement>(null);
  const lastWinnerRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const spinStartRef = useRef<number>(0);
  // Start one row in so the idle reel shows three names (one above the centre,
  // not an empty slot at index 0). Driven imperatively (no per-frame React
  // re-render) so the slow-down stays smooth — see updateTranslate.
  const translateRef = useRef(-ITEM_HEIGHT);
  const phaseRef = useRef<Phase>("idle");

  // Repeat the names just enough to cover the longest possible slow-down travel
  // plus runway — keeps the DOM small (re-rendering thousands of rows is what
  // made the stop stutter).
  const reel = useMemo(() => {
    if (names.length === 0) return [];
    const reelH = names.length * ITEM_HEIGHT;
    const maxTravel =
      (SPIN_SPEED_PX_PER_MS * SLOWDOWN_DURATION_MS) / (SLOWDOWN_POWER + 1);
    const cycles = Math.ceil(maxTravel / reelH) + 8;
    const out: string[] = [];
    for (let i = 0; i < cycles; i++) out.push(...names);
    return out;
  }, [names]);

  const reelHeight = names.length * ITEM_HEIGHT;

  // Card height = three rows of window, scaled back up by the frame inset.
  const cardHeight = (ITEM_HEIGHT * 3) / WINDOW_VISIBLE_FRACTION;
  const cardWidth = cardHeight * FRAME_RATIO;

  // Scale the whole card down to fit the viewport (preserving aspect) rather
  // than squashing its width — keeps the frame proportional on mobile.
  useEffect(() => {
    const fit = () => {
      const s = Math.min(
        1,
        (window.innerWidth - 24) / cardWidth,
        (window.innerHeight - 200) / cardHeight,
      );
      setCardScale(s > 0 ? s : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [cardWidth, cardHeight]);

  const cancelRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  // Write the transform straight to the DOM node instead of through React
  // state, so spinning/decelerating doesn't re-render (and re-reconcile every
  // reel row) on every frame. The +ITEM_HEIGHT keeps the focus band centred.
  const updateTranslate = useCallback((value: number) => {
    translateRef.current = value;
    const el = reelInnerRef.current;
    if (el) el.style.transform = `translateY(${value + ITEM_HEIGHT}px)`;
  }, []);

  // Park the (paused, hidden) confetti clip on its first burst frame, skipping
  // the black lead-in. Done well before reveal so the seek + decode is finished
  // in time — this is what kills the intermittent "stop, then wait" delay.
  const armConfetti = useCallback(() => {
    const v = confettiVideoRef.current;
    if (!v) return;
    v.pause();
    if (v.readyState >= 1) v.currentTime = CONFETTI_START_S;
  }, []);

  // Reveal + play. The clip is already armed on the burst frame, so this starts
  // instantly with no seek. (Black background keyed out via mix-blend-mode.)
  const revealConfetti = useCallback(() => {
    setShowConfetti(true);
    const v = confettiVideoRef.current;
    if (v) void v.play().catch(() => {});
  }, []);

  const startSpinning = useCallback(() => {
    if (names.length === 0) return;
    const next = pickRandomName(names, lastWinnerRef.current ?? undefined);
    if (!next) return;
    lastWinnerRef.current = next;

    // Begin buffering the confetti now — it loads "metadata" only on page load,
    // so kicking off the full fetch at spin-start keeps it off the critical path
    // while leaving ample time to be ready by the reveal.
    const cv = confettiVideoRef.current;
    if (cv && cv.preload !== "auto") cv.preload = "auto";

    setWinner(null);
    setShowConfetti(false);
    setLandingIndex(null);
    updateTranslate(0);
    spinStartRef.current = performance.now();
    phaseRef.current = "spinning";
    setPhase("spinning");

    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
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

    const current = translateRef.current;
    const v0 = SPIN_SPEED_PX_PER_MS;
    const power = SLOWDOWN_POWER;
    const duration = SLOWDOWN_DURATION_MS;

    // Distance whose curve begins at exactly the spin speed over this fixed
    // duration — a seamless hand-off: ∫₀ᵀ v0·(1−t/T)^power dt = v0·T/(power+1).
    const idealDistance = (v0 * duration) / (power + 1);
    // Nudge the distance (by < half a row) so the landing lands exactly on a row
    // boundary, i.e. the winner ends up dead-centre. This keeps the distance
    // essentially constant — and so the duration and feel — for any list size.
    const remCurrent = ((current % ITEM_HEIGHT) + ITEM_HEIGHT) % ITEM_HEIGHT;
    const remIdeal = ((idealDistance % ITEM_HEIGHT) + ITEM_HEIGHT) % ITEM_HEIGHT;
    let adjust = remCurrent - remIdeal;
    if (adjust > ITEM_HEIGHT / 2) adjust -= ITEM_HEIGHT;
    if (adjust < -ITEM_HEIGHT / 2) adjust += ITEM_HEIGHT;
    const totalDistance = idealDistance + adjust;
    const target = current - totalDistance;

    // Paint the winner on the row that ends up centred (target is a whole number
    // of rows up, so −target/ITEM_HEIGHT is an integer index).
    setLandingIndex(Math.round(-target / ITEM_HEIGHT));

    phaseRef.current = "stopping";
    setPhase("stopping");
    // Arm now, at the start of the ~7s slow-down, so the seek/decode is long
    // finished before we reveal it at the lock.
    armConfetti();

    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      if (t >= duration) {
        updateTranslate(target);
        rafRef.current = null;
        phaseRef.current = "revealed";
        setPhase("revealed");
        setWinner(winnerName);
        // Already armed on the burst frame → fires in sync with the reel fade.
        revealConfetti();
        return;
      }
      const p = t / duration;
      const traveled = totalDistance * (1 - Math.pow(1 - p, power + 1));
      updateTranslate(current - traveled);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [armConfetti, revealConfetti, updateTranslate]);

  const handlePress = useCallback(() => {
    const current = phaseRef.current;
    if (current === "idle" || current === "revealed") {
      startSpinning();
    } else if (current === "spinning") {
      stopSpinning();
    }
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

  // Prime the confetti clip on mount: buffer it and decode the burst frame so
  // the very first draw reveals instantly too.
  useEffect(() => {
    const v = confettiVideoRef.current;
    if (!v) return;
    const prime = () => {
      v.currentTime = CONFETTI_START_S;
    };
    if (v.readyState >= 1) prime();
    else v.addEventListener("loadedmetadata", prime, { once: true });
  }, []);

  const buttonLabel =
    phase === "spinning"
      ? "Stop"
      : phase === "stopping"
        ? "Stopping…"
        : phase === "revealed"
          ? "Draw Again"
          : "Draw";

  const isEmpty = loaded && names.length === 0;
  const isReady = loaded && names.length > 0;

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8 text-white"
      style={{
        backgroundColor: "#1c4e9d", // gradient avg — fallback before the image loads
        backgroundImage: `url(${ASSET}/bg-gradient.webp)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Link
        href="/admin"
        className="eyebrow absolute right-4 top-4 z-20 text-[10px] text-white/55 transition hover:text-white sm:right-6 sm:top-6 sm:text-xs"
      >
        Admin →
      </Link>

      {/* Logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${ASSET}/sw-logo-white.png`}
        alt="Solomon Water"
        className="relative z-10 mb-8 h-auto w-40 sm:mb-12 sm:w-52"
      />

      {isEmpty ? (
        <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
          <h2 className="font-names text-4xl uppercase leading-none sm:text-5xl">
            No names to draw yet
          </h2>
          <p className="mt-4 max-w-sm text-sm text-white/70 sm:text-base">
            Add the entrants in the admin, then come back here to run the draw.
          </p>
          <Link
            href="/admin"
            className="mt-6 rounded-full bg-white px-8 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-brand-dark shadow-[0_15px_45px_-12px_rgba(0,0,0,0.45)] transition hover:scale-105 sm:px-10 sm:py-3 sm:text-base"
          >
            Add names
          </Link>
        </div>
      ) : (
        <>
          {/* Card stage — scaled (not squashed) to fit the viewport. The outer
              box reserves the scaled footprint so the button sits right below. */}
          <div
            className="relative z-10"
            style={{ width: cardWidth * cardScale, height: cardHeight * cardScale }}
          >
          <div
            className="relative"
            style={{
              width: cardWidth,
              height: cardHeight,
              transform: `scale(${cardScale})`,
              transformOrigin: "top left",
            }}
          >
            {/* Reel window — blue fill + scrolling names, clipped to the card
                shape by masking with the same fill PNG (rounded corners + edges). */}
            <div
              className="absolute overflow-hidden"
              style={{
                top: WINDOW_INSET_Y,
                bottom: WINDOW_INSET_Y,
                left: WINDOW_INSET_X,
                right: WINDOW_INSET_X,
                backgroundImage: `url(${ASSET}/reel-fill.webp)`,
                backgroundSize: "100% 100%",
                WebkitMaskImage: `url(${ASSET}/reel-fill.webp)`,
                WebkitMaskSize: "100% 100%",
                maskImage: `url(${ASSET}/reel-fill.webp)`,
                maskSize: "100% 100%",
              }}
            >
              {/* Names — the middle row sits in the focus band; one extra row
                  above keeps the band centered (offset by +ITEM_HEIGHT). */}
              <div
                ref={reelInnerRef}
                style={{
                  // Transform is written imperatively each frame (see
                  // updateTranslate); this initial value is re-read from the ref
                  // on the occasional React re-render, so it stays in sync.
                  transform: `translateY(${translateRef.current + ITEM_HEIGHT}px)`,
                  // Only opacity animates via CSS, so the reel fades out on
                  // reveal leaving the standalone winner label below.
                  transition: "opacity 450ms ease",
                  opacity: phase === "revealed" ? 0 : 1,
                  willChange: "transform",
                }}
              >
                {reel.map((name, i) => (
                  <div
                    key={i}
                    style={{
                      height: ITEM_HEIGHT,
                      // Bebas ships only in Book weight, so fake the extra heft
                      // with a stroke in the fill colour (scales with font size).
                      WebkitTextStroke: "0.022em currentColor",
                      paintOrder: "stroke fill",
                      // Tight, crisp shadow only — separates the white from the
                      // blue without blooming the glyph edges.
                      textShadow: "0 1px 6px rgba(11,32,48,0.35)",
                    }}
                    className="font-names flex items-center justify-center whitespace-nowrap px-6 text-center text-6xl uppercase leading-none text-white sm:text-7xl md:text-8xl"
                  >
                    {/* Paint the winner on the landing row so the stop always
                        settles on it, whatever the travel distance was. */}
                    {i === landingIndex ? lastWinnerRef.current ?? name : name}
                  </div>
                ))}
              </div>

              {/* Top + bottom fades — confined to the outer ~44% so their clear
                  ends meet in the middle, leaving the centre band fully clear
                  (the focused name stays true white). Off-centre names dissolve
                  into the blue card, matching the mockup. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${ASSET}/fade-top.png`}
                alt=""
                className="pointer-events-none absolute inset-x-0 top-0 w-full"
                style={{ height: "44%" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${ASSET}/fade-bottom.png`}
                alt=""
                className="pointer-events-none absolute inset-x-0 bottom-0 w-full"
                style={{ height: "44%" }}
              />

              {/* Winner-only label — cross-fades in as the reel fades out, so
                  the two neighbouring names dissolve and just the winner
                  remains centred (in sync with the confetti). */}
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center"
                style={{
                  opacity: phase === "revealed" ? 1 : 0,
                  transition: "opacity 450ms ease",
                }}
              >
                <span
                  style={{
                    WebkitTextStroke: "0.022em currentColor",
                    paintOrder: "stroke fill",
                    textShadow: "0 1px 6px rgba(11,32,48,0.35)",
                  }}
                  className="font-names whitespace-nowrap text-6xl uppercase leading-none text-white sm:text-7xl md:text-8xl"
                >
                  {winner}
                </span>
              </div>
            </div>

            {/* White frame + side notches on top of everything. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ASSET}/frame.webp`}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </div>
          </div>

          {/* Draw button */}
          {isReady && (
            <div className="relative z-10 mt-6 flex flex-col items-center gap-4 sm:mt-10 sm:gap-7">
              <button
                onClick={handlePress}
                disabled={phase === "stopping"}
                style={{
                  // Bebas is Book-weight only — thicken with a stroke in the
                  // text colour so the label reads bolder.
                  WebkitTextStroke: "0.03em currentColor",
                  paintOrder: "stroke fill",
                }}
                className="font-names cursor-pointer rounded-full bg-white px-10 py-1.5 text-xl uppercase leading-none tracking-[0.25em] text-brand shadow-[0_15px_45px_-12px_rgba(0,0,0,0.5)] transition hover:scale-105 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 sm:px-16 sm:py-2 sm:text-3xl sm:tracking-[0.3em]"
              >
                {buttonLabel}
              </button>
              {/* Keyboard hint is irrelevant on touch — show on sm+ only. */}
              <span className="hidden text-[11px] font-normal tracking-wide text-white/55 sm:block">
                or press{" "}
                <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-sans text-[10px] not-italic">
                  Space
                </kbd>
              </span>
            </div>
          )}
        </>
      )}

      {/* Winner confetti — black background keyed out with mix-blend-mode so the
          clip composites over the stage (H.264 has no alpha channel). */}
      <video
        ref={confettiVideoRef}
        src={`${ASSET}/confetti.mp4`}
        muted
        playsInline
        preload="metadata"
        onEnded={() => setShowConfetti(false)}
        className="pointer-events-none fixed inset-0 z-30 h-full w-full object-cover transition-opacity duration-200"
        style={{ mixBlendMode: "screen", opacity: showConfetti ? 1 : 0 }}
      />
    </div>
  );
}
