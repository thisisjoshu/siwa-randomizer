import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { cleanNames } from "../../lib/names";

// Needs the Node runtime and must never be statically cached — the list changes
// at runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel's filesystem is read-only (only /tmp, which is ephemeral), so in
// production we persist to Upstash Redis. Locally — where no Redis store is
// configured — we fall back to a JSON file so `npm run dev` works with no
// external setup. Accept either the Upstash-native env vars or the KV_*-prefixed
// ones the Vercel Marketplace integration injects.
const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    : null;
const KV_KEY = "siwa:names";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "names.json");

function toNameArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return cleanNames(value.filter((n): n is string => typeof n === "string"));
}

async function readNames(): Promise<string[]> {
  if (redis) {
    // @upstash/redis auto-deserializes JSON, so this comes back as an array.
    const value = await redis.get<unknown>(KV_KEY);
    return toNameArray(value);
  }
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return toNameArray(JSON.parse(raw));
  } catch {
    // Missing file or invalid JSON → treat as an empty list.
    return [];
  }
}

async function writeNames(names: string[]): Promise<string[]> {
  const cleaned = cleanNames(names);
  if (redis) {
    await redis.set(KV_KEY, cleaned);
    return cleaned;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Write to a temp file then rename so a crash mid-write can't corrupt the
  // list (rename is atomic on the same filesystem).
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cleaned, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
  return cleaned;
}

export async function GET() {
  try {
    const names = await readNames();
    return NextResponse.json({ names });
  } catch (err) {
    console.error("GET /api/names failed:", err);
    return NextResponse.json({ error: "Failed to read names" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = (body as { names?: unknown })?.names;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Expected { names: string[] }" },
      { status: 400 },
    );
  }

  try {
    const names = await writeNames(
      raw.filter((n): n is string => typeof n === "string"),
    );
    return NextResponse.json({ names });
  } catch (err) {
    console.error("PUT /api/names failed:", err);
    return NextResponse.json({ error: "Failed to save names" }, { status: 500 });
  }
}
