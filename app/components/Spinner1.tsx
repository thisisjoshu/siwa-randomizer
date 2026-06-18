"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { pickRandomName } from "../lib/names";
import { useNames } from "../lib/store";

// Identical spin/stop logic to the other spinners — only the styling differs,
// driven by the "Spinner 1 — Tank Campaign" assets: blue wave background, the
// "WIN BIG WITH / SOLOMON WATER" headline, and a gold-framed card with palm
// leaves + water splash (all baked into one composite PNG).
// Slightly smaller than the other spinners' 150 because this gold frame is
// thicker — this makes the frame's OUTER size match spinner-2/3 (~922×467).
const ITEM_HEIGHT = 143;
const SPIN_SPEED_PX_PER_MS = 1.6;
const MIN_SPIN_MS = 1500;
const SLOWDOWN_POWER = 1.5;
const SLOWDOWN_DURATION_MS = 9000;
const CONFETTI_START_S = 0.47;
// Blue background, so the black-background confetti clip keys cleanly with
// mix-blend-mode: screen (same as /spinner-2). Shared clip — no duplicate file.
const CONFETTI_SRC = "/spinner2/confetti.mp4";

const ASSET = "/tank";

// The card composite is 6547×4546. The gold frame's outer bounds within it were
// measured (below) so the frame can be sized like spinner-2/3's card box, with
// the splash + leaves overflowing around it.
const FRAME_W_FRAC = 0.59294;
const FRAME_H_FRAC = 0.43247;
const FRAME_LEFT_FRAC = 0.1812;
const FRAME_TOP_FRAC = 0.3124;
const CARD_ASPECT = (FRAME_W_FRAC * 6547) / (FRAME_H_FRAC * 4546); // ≈1.975
const WINDOW_VISIBLE_FRACTION = 0.9184; // blue interior height ÷ frame height
// Composite size/offset expressed as % of the card box, so it scales with it.
const COMPOSITE_W_PCT = 100 / FRAME_W_FRAC;
const COMPOSITE_H_PCT = 100 / FRAME_H_FRAC;
const COMPOSITE_LEFT_PCT = -(FRAME_LEFT_FRAC / FRAME_W_FRAC) * 100;
const COMPOSITE_TOP_PCT = -(FRAME_TOP_FRAC / FRAME_H_FRAC) * 100;
// Names window inset within the card box (blue interior inside the gold frame).
const WIN_LEFT = 2.07;
const WIN_TOP = 4.08;
const WIN_W = 95.88;
const WIN_H = 91.84;

// Off-centre names dissolve into the card via a vertical mask (no fade PNGs).
const NAME_FADE_MASK =
  "linear-gradient(to bottom, transparent 2%, #000 34%, #000 66%, transparent 98%)";

// Headline sizing (fractions of the card height). LINE is set so SOLOMON WATER
// (aspect 5.52) spans ~the full frame width; GAP is negative so the two lines
// sit close together (the PNGs carry their own shadow padding).
const HEADLINE_LINE_FRAC = 0.35;
const HEADLINE_LINE_GAP_FRAC = -0.15;
// Gap between the headline and the frame (negative pulls the frame up closer,
// trimming the PNG's shadow padding).
const HEADLINE_BOTTOM_GAP_FRAC = -0.09;

type Phase = "idle" | "spinning" | "stopping" | "revealed";

export default function Spinner1Page() {
  const { names, loaded } = useNames();
  const [winner, setWinner] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showConfetti, setShowConfetti] = useState(false);
  const [landingIndex, setLandingIndex] = useState<number | null>(null);
  const [contentScale, setContentScale] = useState(1);
  const confettiVideoRef = useRef<HTMLVideoElement>(null);
  const reelInnerRef = useRef<HTMLDivElement>(null);
  const lastWinnerRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const spinStartRef = useRef<number>(0);
  const translateRef = useRef(-ITEM_HEIGHT);
  const phaseRef = useRef<Phase>("idle");

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

  // Card box = the gold frame, sized like spinner-2/3 (three rows of names tall
  // inside the frame). The splash + leaves overflow around this box.
  const cardHeight = (ITEM_HEIGHT * 3) / WINDOW_VISIBLE_FRACTION;
  const cardWidth = cardHeight * CARD_ASPECT;

  // Natural size of the whole content group (headline + card + button), derived
  // from the layout constants: headline block (0.55×) minus its negative bottom
  // gap (0.09×), the card (1×), plus the button block (~90px on mobile).
  // Natural height of the SCALED part (headline + card). The button renders
  // full-size below and isn't scaled, so it's excluded here and reserved
  // separately via BUTTON_BLOCK in the fit calc.
  const cardGroupHeight = cardHeight * (1 + 0.55 + HEADLINE_BOTTOM_GAP_FRAC);
  const BUTTON_BLOCK = 90; // approx full-size button + gap (unscaled)

  // Scale the headline + card down to fit the viewport (preserving aspect)
  // instead of letting the frame/splash run off the edges on mobile.
  useEffect(() => {
    const fit = () => {
      const s = Math.min(
        1,
        (window.innerWidth - 24) / cardWidth,
        (window.innerHeight - 24 - BUTTON_BLOCK) / cardGroupHeight,
      );
      setContentScale(s > 0 ? s : 1);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [cardWidth, cardGroupHeight]);

  const cancelRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const updateTranslate = useCallback((value: number) => {
    translateRef.current = value;
    const el = reelInnerRef.current;
    if (el) el.style.transform = `translateY(${value + ITEM_HEIGHT}px)`;
  }, []);

  const armConfetti = useCallback(() => {
    const v = confettiVideoRef.current;
    if (!v) return;
    v.pause();
    if (v.readyState >= 1) v.currentTime = CONFETTI_START_S;
  }, []);

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

    const idealDistance = (v0 * duration) / (power + 1);
    const remCurrent = ((current % ITEM_HEIGHT) + ITEM_HEIGHT) % ITEM_HEIGHT;
    const remIdeal = ((idealDistance % ITEM_HEIGHT) + ITEM_HEIGHT) % ITEM_HEIGHT;
    let adjust = remCurrent - remIdeal;
    if (adjust > ITEM_HEIGHT / 2) adjust -= ITEM_HEIGHT;
    if (adjust < -ITEM_HEIGHT / 2) adjust += ITEM_HEIGHT;
    const totalDistance = idealDistance + adjust;
    const target = current - totalDistance;

    setLandingIndex(Math.round(-target / ITEM_HEIGHT));

    phaseRef.current = "stopping";
    setPhase("stopping");
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
        backgroundColor: "#185fa9", // wave avg — fallback before the image loads
        backgroundImage: `url(${ASSET}/bg.webp)`,
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
            className="mt-8 rounded-full bg-white px-10 py-4 text-base font-bold uppercase tracking-[0.2em] text-brand-dark shadow-[0_15px_45px_-12px_rgba(0,0,0,0.45)] transition hover:scale-105 sm:px-12 sm:py-5 sm:text-lg"
          >
            Add names →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center">
        {/* Only the headline + card scale to fit; the button stays full-size
            below (so it remains tappable on mobile). Outer box reserves the
            scaled footprint. */}
        <div
          style={{
            width: contentScale < 1 ? cardWidth * contentScale : cardWidth,
            height: contentScale < 1 ? cardGroupHeight * contentScale : undefined,
          }}
        >
        <div
          className="relative flex flex-col items-center"
          style={{
            width: cardWidth,
            transform: `scale(${contentScale})`,
            transformOrigin: "top left",
          }}
        >
          {/* Headline — sits just above the gold frame; z-20 so it stays on top
              of any splash that overflows up from the card. */}
          <div
            className="relative z-20 flex flex-col items-center"
            style={{ marginBottom: cardHeight * HEADLINE_BOTTOM_GAP_FRAC }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ASSET}/winbig.webp`}
              alt="Win big with"
              className="w-auto"
              style={{ height: cardHeight * HEADLINE_LINE_FRAC }}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ASSET}/solomonwater.webp`}
              alt="Solomon Water"
              className="w-auto"
              style={{
                height: cardHeight * HEADLINE_LINE_FRAC,
                marginTop: cardHeight * HEADLINE_LINE_GAP_FRAC,
              }}
            />
          </div>

          {/* Card box = the gold frame. The composite is larger and offset so its
              frame lands here; the splash + leaves overflow around (the page root
              clips them, so they never add scroll). */}
          <div
            className="relative z-10"
            style={{ width: cardWidth, height: cardHeight }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ASSET}/card.webp`}
              alt=""
              className="pointer-events-none absolute max-w-none"
              style={{
                width: `${COMPOSITE_W_PCT}%`,
                height: `${COMPOSITE_H_PCT}%`,
                left: `${COMPOSITE_LEFT_PCT}%`,
                top: `${COMPOSITE_TOP_PCT}%`,
              }}
            />

            {/* Names window — positioned over the blue interior, scrolling names
                clipped + faded; the composite behind provides the blue fill. */}
            <div
              className="absolute overflow-hidden"
              style={{
                left: `${WIN_LEFT}%`,
                top: `${WIN_TOP}%`,
                width: `${WIN_W}%`,
                height: `${WIN_H}%`,
                borderRadius: "4%",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  WebkitMaskImage: NAME_FADE_MASK,
                  maskImage: NAME_FADE_MASK,
                }}
              >
                <div
                  ref={reelInnerRef}
                  style={{
                    transform: `translateY(${translateRef.current + ITEM_HEIGHT}px)`,
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
                        WebkitTextStroke: "0.022em currentColor",
                        paintOrder: "stroke fill",
                        textShadow: "0 1px 6px rgba(11,32,48,0.35)",
                      }}
                      className="font-names flex items-center justify-center whitespace-nowrap px-6 text-center text-6xl uppercase leading-none text-white sm:text-7xl md:text-8xl"
                    >
                      {i === landingIndex ? lastWinnerRef.current ?? name : name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Winner-only label — cross-fades in as the reel fades out. */}
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
          </div>
        </div>
        </div>

        {/* Draw button — full size below the scaled card (not scaled, so it
            stays tappable on mobile); z-20 to sit over any lower splash. */}
        {isReady && (
          <div className="relative z-20 mt-6 flex flex-col items-center gap-4 sm:mt-10 sm:gap-7">
            <button
              onClick={handlePress}
              disabled={phase === "stopping"}
              style={{
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
        </div>
      )}

      {/* Winner confetti — black background keyed out with mix-blend-mode:
          screen (H.264 has no alpha channel), same approach as spinner-2. */}
      <video
        ref={confettiVideoRef}
        src={CONFETTI_SRC}
        muted
        playsInline
        preload="auto"
        onEnded={() => setShowConfetti(false)}
        className="pointer-events-none fixed inset-0 z-30 h-full w-full object-cover transition-opacity duration-200"
        style={{ mixBlendMode: "screen", opacity: showConfetti ? 1 : 0 }}
      />
    </div>
  );
}
