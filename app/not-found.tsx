import Link from "next/link";

// Themed 404 — Solomon Water is a water utility, so the copy leans into water
// puns. Mirrors the spinner styling (wave bg, white logo, Newake/Bebas type).
export default function NotFound() {
  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12 text-center text-white"
      style={{
        backgroundColor: "#185fa9",
        backgroundImage: `url(/tank/bg.webp)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/spinner2/sw-logo-white.png"
        alt="Solomon Water"
        className="mb-8 h-auto w-36 sm:mb-10 sm:w-52"
      />

      <p
        style={{ WebkitTextStroke: "0.01em currentColor", paintOrder: "stroke fill" }}
        className="font-display text-7xl leading-none text-white/95 sm:text-9xl"
      >
        404
      </p>

      <h1 className="font-names mt-3 text-2xl uppercase tracking-wide text-white/90 sm:mt-4 sm:text-4xl">
        This page ran dry
      </h1>

      <p className="mt-3 max-w-md text-sm text-white/70 sm:text-base">
        We couldn&apos;t find what you&apos;re after... it must&apos;ve evaporated
        or gone down the drain. Let&apos;s get you back on tap.
      </p>

      <Link
        href="/"
        className="mt-8 cursor-pointer rounded-full bg-white px-8 py-2.5 text-sm font-bold uppercase tracking-[0.2em] text-brand-darker shadow-[0_15px_45px_-12px_rgba(0,0,0,0.5)] ring-1 ring-white/40 transition hover:scale-105 sm:px-10 sm:py-3 sm:text-base"
      >
        Back to the draw
      </Link>
    </div>
  );
}
