"use client";

import { useEffect, useState } from "react";

// The list lives in a JSON file on the server, behind /api/names. The client
// never touches the file directly — it just reads/writes through the route.
const ENDPOINT = "/api/names";

function sameNames(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// How often the spinner re-checks the server for changes saved in the admin
// (in addition to refetching whenever the window regains focus).
const POLL_MS = 10000;

export async function loadNames(): Promise<string[]> {
  try {
    const res = await fetch(ENDPOINT, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.names) ? (data.names as string[]) : [];
  } catch {
    return [];
  }
}

export async function saveNames(names: string[]): Promise<string[]> {
  const res = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  if (!res.ok) throw new Error(`Failed to save names (${res.status})`);
  const data = await res.json();
  return Array.isArray(data?.names) ? (data.names as string[]) : [];
}

// ---- Display theme (which spinner the index shows) ----------------------
const THEME_ENDPOINT = "/api/theme";
export const DEFAULT_THEME = "spinner-1";

export async function loadTheme(): Promise<string> {
  try {
    const res = await fetch(THEME_ENDPOINT, { cache: "no-store" });
    if (!res.ok) return DEFAULT_THEME;
    const data = await res.json();
    return typeof data?.theme === "string" ? data.theme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function saveTheme(theme: string): Promise<string> {
  const res = await fetch(THEME_ENDPOINT, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
  });
  if (!res.ok) throw new Error(`Failed to save theme (${res.status})`);
  const data = await res.json();
  return typeof data?.theme === "string" ? data.theme : DEFAULT_THEME;
}

// Live-ish theme for the index display — same fetch/focus/poll pattern as
// useNames, so switching the theme in the admin updates the live display.
export function useTheme(): { theme: string; loaded: boolean } {
  const [theme, setTheme] = useState<string>(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const next = await loadTheme();
      if (!active) return;
      setTheme((prev) => (prev === next ? prev : next));
      setLoaded(true);
    };
    sync();

    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(sync, POLL_MS);

    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
    };
  }, []);

  return { theme, loaded };
}

// Live-ish list of names for the spinner. Fetches on mount, whenever the tab
// regains focus, and on a slow poll — so a Save in the admin shows up on the
// display without a manual refresh, even on a separate device. `loaded` flips
// true after the first fetch resolves, so the UI can tell "still loading" apart
// from "genuinely empty" (and avoid flashing the empty state on every load).
export function useNames(): { names: string[]; loaded: boolean } {
  const [names, setNames] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const next = await loadNames();
      if (!active) return;
      // Keep the SAME array reference when nothing changed, so a no-op poll
      // doesn't re-render consumers (which would rebuild the spinner reel and
      // hitch mid-spin). React bails out when state identity is unchanged.
      setNames((prev) => (sameNames(prev, next) ? prev : next));
      setLoaded(true);
    };
    sync();

    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(sync, POLL_MS);

    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
    };
  }, []);

  return { names, loaded };
}
