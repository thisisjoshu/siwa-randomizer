"use client";

import { useEffect, useState } from "react";

// The list lives in a JSON file on the server, behind /api/names. The client
// never touches the file directly — it just reads/writes through the route.
const ENDPOINT = "/api/names";

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

// Live-ish list of names for the spinner. Fetches on mount, whenever the tab
// regains focus, and on a slow poll — so a Save in the admin shows up on the
// display without a manual refresh, even on a separate device.
export function useNames(): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const next = await loadNames();
      if (active) setNames(next);
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

  return names;
}
