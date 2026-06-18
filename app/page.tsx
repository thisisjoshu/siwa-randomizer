import { getState } from "./lib/server-data";
import { THEME_BG } from "./lib/themes";
import Spinner1 from "./components/Spinner1";
import Spinner2 from "./components/Spinner2";
import Spinner3 from "./components/Spinner3";

// Read per-request so each (re)load reflects the latest saved theme + names.
export const dynamic = "force-dynamic";

// Server-rendered: the theme + names are read here and the matching spinner is
// returned in the initial HTML (no client round-trips, no background polling).
// Reload-only — a display picks up admin changes when it's reloaded/navigated.
export default async function Home() {
  const { theme, names } = await getState();

  const Spinner =
    theme === "spinner-2" ? Spinner2 : theme === "spinner-3" ? Spinner3 : Spinner1;

  return (
    <>
      {/* High-priority preload of the active background (the LCP image). */}
      <link
        rel="preload"
        as="image"
        href={THEME_BG[theme]}
        fetchPriority="high"
      />
      <Spinner initialNames={names} />
    </>
  );
}
