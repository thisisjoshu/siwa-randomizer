"use client";

import { DEFAULT_THEME } from "./themes";

// Reload-only model: the index is server-rendered with the current theme +
// names, so the display does no background polling. These helpers are used by
// the admin (read on open, write on save); changes apply to a display when it's
// reloaded / navigated to.
const ENDPOINT = "/api/names";
const THEME_ENDPOINT = "/api/theme";

export { DEFAULT_THEME };

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

// The spinner reads names from the server-rendered list (no client fetch/poll).
export function useNames(initialNames?: string[]): {
  names: string[];
  loaded: boolean;
} {
  return { names: initialNames ?? [], loaded: initialNames != null };
}
