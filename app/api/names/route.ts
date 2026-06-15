import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { cleanNames } from "../../lib/names";

// Needs the Node runtime (filesystem) and must never be statically cached —
// the list changes at runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "names.json");

async function readNames(): Promise<string[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return cleanNames(parsed.filter((n): n is string => typeof n === "string"));
  } catch {
    // Missing file or invalid JSON → treat as an empty list.
    return [];
  }
}

async function writeNames(names: string[]): Promise<string[]> {
  const cleaned = cleanNames(names);
  await fs.mkdir(DATA_DIR, { recursive: true });
  // Write to a temp file then rename so a crash mid-write can't corrupt the
  // list (rename is atomic on the same filesystem).
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(cleaned, null, 2), "utf8");
  await fs.rename(tmp, DATA_FILE);
  return cleaned;
}

export async function GET() {
  const names = await readNames();
  return NextResponse.json({ names });
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

  const names = await writeNames(
    raw.filter((n): n is string => typeof n === "string"),
  );
  return NextResponse.json({ names });
}
