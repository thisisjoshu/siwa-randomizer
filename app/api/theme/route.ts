import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";

// Same persistence approach as /api/names: Upstash Redis in production (the
// Vercel filesystem is read-only), a local JSON file for `npm run dev`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    : null;
const KV_KEY = "siwa:theme";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "theme.json");

// The display picks one of these spinners; spinner-1 is the default.
const THEMES = ["spinner-1", "spinner-2", "spinner-3"] as const;
const DEFAULT_THEME = "spinner-1";

function normalize(value: unknown): string {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value)
    ? value
    : DEFAULT_THEME;
}

async function readTheme(): Promise<string> {
  if (redis) {
    return normalize(await redis.get<unknown>(KV_KEY));
  }
  try {
    return normalize(JSON.parse(await fs.readFile(DATA_FILE, "utf8")));
  } catch {
    return DEFAULT_THEME;
  }
}

async function writeTheme(theme: string): Promise<string> {
  const value = normalize(theme);
  if (redis) {
    await redis.set(KV_KEY, value);
    return value;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value), "utf8");
  await fs.rename(tmp, DATA_FILE);
  return value;
}

export async function GET() {
  try {
    return NextResponse.json({ theme: await readTheme() });
  } catch (err) {
    console.error("GET /api/theme failed:", err);
    return NextResponse.json({ error: "Failed to read theme" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = (body as { theme?: unknown })?.theme;
  try {
    return NextResponse.json({ theme: await writeTheme(raw as string) });
  } catch (err) {
    console.error("PUT /api/theme failed:", err);
    return NextResponse.json({ error: "Failed to save theme" }, { status: 500 });
  }
}
