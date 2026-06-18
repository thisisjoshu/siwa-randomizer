"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import Link from "next/link";
import { pickRandomName } from "../lib/names";
import { useNames } from "../lib/store";

// Identical spin/stop logic to /spinner-2 — only the styling (driven by the
// "Spinner 3 — White Version" assets) differs: white textured background, the
// full-colour logo, a blue card with the Solomon-Islands flag corner, a blue
// outline frame, and a custom DRAW pill.
const ITEM_HEIGHT = 150;
const SPIN_SPEED_PX_PER_MS = 1.6;
const MIN_SPIN_MS = 1500;
const SLOWDOWN_POWER = 1.5;
const SLOWDOWN_DURATION_MS = 9000;
const CONFETTI_START_S = 0.47;
// Confetti burst rendered on a WHITE background — keyed to true transparency on
// the GPU (alpha = distance from white) so it shows clearly over the page AND
// the dark card. See the WebGL setup effect.
const CONFETTI_SRC = "/spinner3/confetti-white.mp4";

// Frame PNG is 3884×1969; its blue fill sits concentrically inside at 3811×1900.
const FRAME_RATIO = 3884 / 1969;
const WINDOW_INSET_X = `${((3884 - 3811) / 2 / 3884) * 100}%`; // ~0.94%
const WINDOW_INSET_Y = `${((1969 - 1900) / 2 / 1969) * 100}%`; // ~1.75%
const WINDOW_VISIBLE_FRACTION = 1 - (1969 - 1900) / 1969;

// No fade PNGs in this set, so the off-centre names are faded with a vertical
// mask (they go transparent toward the edges, revealing the card + flag behind —
// rather than painting blue over the flag corner).
const NAME_FADE_MASK =
  "linear-gradient(to bottom, transparent 2%, #000 34%, #000 66%, transparent 98%)";

const ASSET = "/spinner3";

type Phase = "idle" | "spinning" | "stopping" | "revealed";

export default function Spinner3Page({
  initialNames,
}: {
  initialNames?: string[];
}) {
  const { names, loaded } = useNames(initialNames);
  const [winner, setWinner] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [showConfetti, setShowConfetti] = useState(false);
  const [landingIndex, setLandingIndex] = useState<number | null>(null);
  const [cardScale, setCardScale] = useState(1);
  const confettiVideoRef = useRef<HTMLVideoElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<{ gl: WebGLRenderingContext; tex: WebGLTexture } | null>(
    null,
  );
  const keyRafRef = useRef<number | null>(null);
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

  const updateTranslate = useCallback((value: number) => {
    translateRef.current = value;
    const el = reelInnerRef.current;
    if (el) el.style.transform = `translateY(${value + ITEM_HEIGHT}px)`;
  }, []);

  const stopKeying = useCallback(() => {
    if (keyRafRef.current !== null) {
      cancelAnimationFrame(keyRafRef.current);
      keyRafRef.current = null;
    }
    const ctx = glRef.current;
    if (ctx) {
      ctx.gl.clearColor(0, 0, 0, 0);
      ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
    }
  }, []);

  const armConfetti = useCallback(() => {
    const v = confettiVideoRef.current;
    if (!v) return;
    v.pause();
    if (v.readyState >= 1) v.currentTime = CONFETTI_START_S;
  }, []);

  // Play the white-background clip and key it on the GPU: alpha = how far each
  // pixel is from white, so the white drops out and the coloured confetti stays
  // at full colour — composites clearly over BOTH the white page and the dark
  // card (which neither screen nor multiply can do).
  const revealConfetti = useCallback(() => {
    setShowConfetti(true);
    const v = confettiVideoRef.current;
    if (!v) return;
    void v.play().catch(() => {});

    const render = () => {
      const ctx = glRef.current;
      if (!ctx || v.paused || v.ended) {
        keyRafRef.current = null;
        return;
      }
      if (v.readyState >= 2) {
        const { gl, tex } = ctx;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      keyRafRef.current = requestAnimationFrame(render);
    };
    keyRafRef.current = requestAnimationFrame(render);
  }, []);

  const handleConfettiEnded = useCallback(() => {
    setShowConfetti(false);
    stopKeying();
  }, [stopKeying]);

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
    stopKeying();
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
  }, [names, reelHeight, updateTranslate, stopKeying]);

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

  useEffect(
    () => () => {
      cancelRaf();
      if (keyRafRef.current !== null) cancelAnimationFrame(keyRafRef.current);
    },
    [],
  );

  // One-time WebGL setup for the confetti white-key (full-screen quad + shader
  // that turns the clip's white background transparent, keeping confetti colour).
  useEffect(() => {
    const canvas = confettiCanvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      premultipliedAlpha: true,
      alpha: true,
    });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const vs = compile(
      gl.VERTEX_SHADER,
      "attribute vec2 p;varying vec2 uv;void main(){uv=vec2((p.x+1.0)*0.5,(1.0-p.y)*0.5);gl_Position=vec4(p,0.0,1.0);}",
    );
    const fs = compile(
      gl.FRAGMENT_SHADER,
      // Alpha = distance from white (boosted): white bg → 0 (transparent),
      // coloured confetti → opaque at full colour. Premultiplied output.
      "precision mediump float;varying vec2 uv;uniform sampler2D tex;void main(){vec4 c=texture2D(tex,uv);float a=clamp((1.0-min(min(c.r,c.g),c.b))*1.4,0.0,1.0);gl_FragColor=vec4(c.rgb*a,a);}",
    );
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.viewport(0, 0, canvas.width, canvas.height);
    glRef.current = { gl, tex };
  }, []);

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

  // Raise priority on this theme's CSS-background images (otherwise they're
  // fetched late/low-priority and can be starved on a busy connection).
  ReactDOM.preload(`${ASSET}/card-fill.webp`, { as: "image" });
  ReactDOM.preload(`${ASSET}/frame.webp`, { as: "image" });
  ReactDOM.preload(`${ASSET}/draw-bg.png`, { as: "image" });

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8 text-brand-ink"
      style={{
        backgroundColor: "#fafafa", // near-white — fallback before the image loads
        backgroundImage: `url(${ASSET}/bg.webp)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Link
        href="/admin"
        className="eyebrow absolute right-4 top-4 z-20 text-[10px] text-brand-dark/60 transition hover:text-brand sm:right-6 sm:top-6 sm:text-xs"
      >
        Admin →
      </Link>

      {/* Full-colour logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${ASSET}/logo-color.png`}
        alt="Solomon Water"
        className="relative z-10 mb-8 h-auto w-44 sm:mb-12 sm:w-56"
      />

      {isEmpty ? (
        <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
          <h2 className="font-names text-4xl uppercase leading-none text-brand-dark sm:text-5xl">
            No names to draw yet
          </h2>
          <p className="mt-4 max-w-sm text-sm text-brand-dark/70 sm:text-base">
            Add the entrants in the admin, then come back here to run the draw.
          </p>
          <Link
            href="/admin"
            className="mt-6 rounded-full bg-brand px-8 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-white shadow-[0_15px_45px_-12px_rgba(33,138,204,0.6)] transition hover:scale-105 sm:px-10 sm:py-3 sm:text-base"
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
            {/* Reel window — blue fill (with flag corner) + scrolling names,
                clipped to the card shape by masking with the same fill PNG. */}
            <div
              className="absolute overflow-hidden"
              style={{
                top: WINDOW_INSET_Y,
                bottom: WINDOW_INSET_Y,
                left: WINDOW_INSET_X,
                right: WINDOW_INSET_X,
                backgroundImage: `url(${ASSET}/card-fill.webp)`,
                backgroundSize: "100% 100%",
                WebkitMaskImage: `url(${ASSET}/card-fill.webp)`,
                WebkitMaskSize: "100% 100%",
                maskImage: `url(${ASSET}/card-fill.webp)`,
                maskSize: "100% 100%",
              }}
            >
              {/* Vertical fade mask: off-centre names dissolve to transparent at
                  the edges (revealing the card + flag), centre stays solid. */}
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

            {/* Blue outline frame + side notches on top of everything. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ASSET}/frame.webp`}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </div>
          </div>

          {/* Draw button — custom pill image with the flag accent. */}
          {isReady && (
            <div className="relative z-10 mt-6 flex flex-col items-center gap-4 sm:mt-10 sm:gap-7">
              <button
                onClick={handlePress}
                disabled={phase === "stopping"}
                style={{
                  // Fallback fill so the pill never shows blank while the (low
                  // priority) flag-accent image loads.
                  backgroundColor: "#1763a8",
                  backgroundImage: `url(${ASSET}/draw-bg.png)`,
                  backgroundSize: "100% 100%",
                  backgroundRepeat: "no-repeat",
                  WebkitTextStroke: "0.03em currentColor",
                  paintOrder: "stroke fill",
                }}
                className="font-names cursor-pointer rounded-full px-10 py-2 text-xl uppercase leading-none tracking-[0.25em] text-white drop-shadow-[0_12px_30px_rgba(8,82,168,0.45)] transition hover:scale-105 active:scale-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 sm:px-16 sm:py-2.5 sm:text-3xl sm:tracking-[0.3em]"
              >
                {buttonLabel}
              </button>
              {/* Keyboard hint is irrelevant on touch — show on sm+ only. */}
              <span className="hidden text-[11px] font-normal tracking-wide text-brand-dark/60 sm:block">
                or press{" "}
                <kbd className="rounded border border-brand/25 bg-brand/10 px-1.5 py-0.5 font-sans text-[10px] not-italic text-brand-dark">
                  Space
                </kbd>
              </span>
            </div>
          )}
        </>
      )}

      {/* Hidden source video — frames are uploaded to the WebGL canvas below.
          Kept tiny + invisible (not display:none, so it keeps decoding). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <video
        ref={confettiVideoRef}
        src={CONFETTI_SRC}
        muted
        playsInline
        preload="metadata"
        onEnded={handleConfettiEnded}
        className="pointer-events-none fixed left-0 top-0 -z-10 h-px w-px opacity-0"
      />

      {/* Winner confetti — white background keyed to true transparency on the
          GPU, so the colours show clearly over both the page and the card. */}
      <canvas
        ref={confettiCanvasRef}
        width={1920}
        height={1080}
        className="pointer-events-none fixed inset-0 z-30 h-full w-full object-cover transition-opacity duration-200"
        style={{ opacity: showConfetti ? 1 : 0 }}
      />
    </div>
  );
}
