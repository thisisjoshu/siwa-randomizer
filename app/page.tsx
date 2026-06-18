"use client";

import { useTheme } from "./lib/store";
import Spinner1 from "./components/Spinner1";
import Spinner2 from "./components/Spinner2";
import Spinner3 from "./components/Spinner3";

// The index shows whichever spinner the admin selected (default spinner-1). The
// theme is polled, so changing it in the admin switches the live display.
export default function Home() {
  const { theme, loaded } = useTheme();

  // Avoid flashing the default before the saved theme resolves.
  if (!loaded) return <div className="flex flex-1 bg-brand-darker" />;

  if (theme === "spinner-2") return <Spinner2 />;
  if (theme === "spinner-3") return <Spinner3 />;
  return <Spinner1 />;
}
