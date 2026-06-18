import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { cleanNames } from "./names";
import { DEFAULT_THEME, normalizeTheme, type Theme } from "./themes";

// Server-side reads of the same data the /api routes expose, so Server
// Components (the index page) can render with the theme + names already
// resolved — no client round-trip. Mirrors the route handlers' storage:
// Upstash Redis in production, a local JSON file in dev.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    : null;

const NAMES_KEY = "siwa:names";
const THEME_KEY = "siwa:theme";

const DATA_DIR = path.join(process.cwd(), "data");
const NAMES_FILE = path.join(DATA_DIR, "names.json");
const THEME_FILE = path.join(DATA_DIR, "theme.json");

function toNameArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return cleanNames(value.filter((n): n is string => typeof n === "string"));
}

export async function getTheme(): Promise<Theme> {
  try {
    if (redis) return normalizeTheme(await redis.get<unknown>(THEME_KEY));
    return normalizeTheme(JSON.parse(await fs.readFile(THEME_FILE, "utf8")));
  } catch {
    return DEFAULT_THEME;
  }
}

export async function getNames(): Promise<string[]> {
  try {
    if (redis) return toNameArray(await redis.get<unknown>(NAMES_KEY));
    return toNameArray(JSON.parse(await fs.readFile(NAMES_FILE, "utf8")));
  } catch {
    return [];
  }
}

// Theme + names in a SINGLE Redis round-trip (MGET) — used by the server-
// rendered index so each page load makes one Redis call, not two.
export async function getState(): Promise<{ theme: Theme; names: string[] }> {
  if (redis) {
    try {
      const [t, n] = await redis.mget<[unknown, unknown]>(THEME_KEY, NAMES_KEY);
      return { theme: normalizeTheme(t), names: toNameArray(n) };
    } catch {
      return { theme: DEFAULT_THEME, names: [] };
    }
  }
  // Local dev (file fallback): two small reads, but off-network so it's cheap.
  const [theme, names] = await Promise.all([getTheme(), getNames()]);
  return { theme, names };
}
