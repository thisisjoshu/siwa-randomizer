import Link from "next/link";

const displays = [
  {
    href: "/slot",
    title: "Slot Reel",
    blurb: "Names roll vertically then snap to the winner.",
    accent: "from-brand to-brand-cyan",
  },
  {
    href: "/scramble",
    title: "Name Scramble",
    blurb: "Letters scramble and resolve into the winner's name.",
    accent: "from-brand-cyan to-brand-light",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 bg-gradient-to-b from-[#f5fbfe] to-[#e3f2fb]">
      <header className="mb-12 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.4em] text-brand-dark">
          Solomon Water
        </p>
        <h1 className="font-display mt-3 text-6xl font-black tracking-tight text-brand-ink sm:text-7xl">
          Live Winner Randomizer
        </h1>
        <p className="mt-4 max-w-xl text-base text-brand-darker/70">
          Choose a display style for the livestream reveal. Each route is a
          full-screen scene built for streaming overlays.
        </p>
      </header>

      <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        {displays.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            className="group relative overflow-hidden rounded-2xl border border-brand/15 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
          >
            <div
              className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${d.accent}`}
            />
            <h2 className="font-display text-2xl font-bold tracking-tight text-brand-ink">
              {d.title}
            </h2>
            <p className="mt-2 text-sm text-brand-darker/70">{d.blurb}</p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand transition group-hover:gap-3">
              Open display
              <span aria-hidden>→</span>
            </span>
          </Link>
        ))}
      </div>

      <footer className="mt-16 text-xs text-brand-darker/50">
        Admin route coming soon · go fullscreen (F11) on display pages
      </footer>
    </div>
  );
}
