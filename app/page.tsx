"use client";

import dynamic from "next/dynamic";
import ReactDOM from "react-dom";
import { useTheme } from "./lib/store";

// Brief background shown while the theme resolves and the spinner chunk loads.
function Loader() {
  return (
    <div
      className="flex flex-1 bg-background"
      style={{
        backgroundImage: `url(/tank/bg.webp)`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    />
  );
}

// Lazy-load only the selected theme's component, so the page ships just that
// spinner's JS (not all three + the WebGL keying).
const SPINNERS = {
  "spinner-1": dynamic(() => import("./components/Spinner1"), { loading: Loader }),
  "spinner-2": dynamic(() => import("./components/Spinner2"), { loading: Loader }),
  "spinner-3": dynamic(() => import("./components/Spinner3"), { loading: Loader }),
} as const;

const THEME_BG: Record<string, string> = {
  "spinner-1": "/tank/bg.webp",
  "spinner-2": "/spinner2/bg-gradient.webp",
  "spinner-3": "/spinner3/bg.webp",
};

// The index shows whichever spinner the admin selected (default spinner-1). The
// theme is polled, so changing it in the admin switches the live display.
export default function Home() {
  const { theme, loaded } = useTheme();

  // Avoid flashing the default before the saved theme resolves.
  if (!loaded) return <Loader />;

  const key =
    theme === "spinner-2" || theme === "spinner-3" ? theme : "spinner-1";

  // Start fetching the active background immediately (in parallel with the lazy
  // spinner chunk) so it's the high-priority LCP image.
  ReactDOM.preload(THEME_BG[key], { as: "image", fetchPriority: "high" });

  const Spinner = SPINNERS[key];
  return <Spinner />;
}
