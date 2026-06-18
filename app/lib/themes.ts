// Shared (server + client) theme constants. Plain data only — safe to import
// from server components, route handlers, and client components alike.

export const THEMES = ["spinner-1", "spinner-2", "spinner-3"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "spinner-1";

// Each theme's background image (used for the high-priority preload).
export const THEME_BG: Record<Theme, string> = {
  "spinner-1": "/tank/bg.webp",
  "spinner-2": "/spinner2/bg-gradient.webp",
  "spinner-3": "/spinner3/bg.webp",
};

export function normalizeTheme(value: unknown): Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value)
    ? (value as Theme)
    : DEFAULT_THEME;
}
