// The live list of names is entered in /admin and persisted to a JSON file on
// the server (data/names.json) via the /api/names route — see app/lib/store.ts
// and app/api/names/route.ts. There are no built-in defaults; the draw is based
// entirely on the data the user enters.

// Normalize a list: trim whitespace, drop empties, and de-duplicate
// case-insensitively (keeping the first spelling). Shared by the API route and
// the client so server and browser agree on the canonical list.
export function cleanNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

// Return a shuffled copy (Fisher–Yates). The spinner randomizes its reel order
// for presentation so the names don't scroll past (or rest beside the winner)
// in entered/alphabetical order. This is purely cosmetic — the winner is still
// chosen uniformly by pickRandomName, so it doesn't change anyone's odds.
export function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pick a random name from `names`. When possible, avoid repeating `exclude`
// (the immediately-previous winner) so we never draw the same person twice
// back-to-back — every spin is otherwise independent over the full list.
export function pickRandomName(names: string[], exclude?: string): string | null {
  if (names.length === 0) return null;
  const pool = exclude && names.length > 1 ? names.filter((n) => n !== exclude) : names;
  return pool[Math.floor(Math.random() * pool.length)];
}
