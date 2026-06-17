import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { kv } from "@vercel/kv";
import { cleanNames } from "../../lib/names";

// Needs the Node runtime and must never be statically cached — the list changes
// at runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel's filesystem is read-only (only /tmp, which is ephemeral), so on Vercel
// we persist to Vercel KV. Locally — where no KV store is configured — we fall
// back to a JSON file so `npm run dev` keeps working with no external setup.
const USE_KV = Boolean(process.env.KV_REST_API_URL);
const KV_KEY = "siwa:names";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "names.json");

function toNameArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return cleanNames(value.filter((n): n is string => typeof n === "string"));
}

async function readNames(): Promise<string[]> {
  if (USE_KV) {
    // @vercel/kv stores/returns JSON, so this comes back as an array already.
    const value = await kv.get<unknown>(KV_KEY);
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
  if (USE_KV) {
    await kv.set(KV_KEY, cleaned);
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
