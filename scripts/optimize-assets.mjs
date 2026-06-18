// One-off asset optimizer: resize the oversized theme PNGs and emit WebP at
// high quality (visually identical), so the deploy ships ~0.5MB of images
// instead of ~5MB. Run: `npm run optimize:assets`. Favicons are left untouched.
//
// Shape/alpha-critical art (frames + the reel/card masks that define the clip
// shape) is encoded lossless so edges stay crisp; backgrounds use high-quality
// lossy; everything else is near-lossless.
import sharp from "sharp";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd(), "public");
const DIRS = ["tank", "spinner2", "spinner3"];

const CONFIG = {
  // backgrounds — large photographic/gradient, lossy is fine
  "tank/bg.png": { max: 2560, quality: 84 },
  "tank/card.png": { max: 2560, quality: 88 },
  "spinner3/bg.png": { max: 2560, quality: 84 },
  "spinner2/bg-gradient.png": { max: 2560, quality: 86 },
  // shape/alpha-critical — keep crisp, lossless
  "spinner2/reel-fill.png": { max: 1920, lossless: true },
  "spinner2/frame.png": { max: 1920, lossless: true },
  "spinner3/card-fill.png": { max: 1920, lossless: true },
  "spinner3/frame.png": { max: 1920, lossless: true },
};
const DEFAULT = { max: 1920, quality: 92 };

let before = 0;
let after = 0;

for (const dir of DIRS) {
  const abs = path.join(ROOT, dir);
  for (const f of await readdir(abs)) {
    if (!f.endsWith(".png")) continue;
    const rel = `${dir}/${f}`;
    const cfg = { ...DEFAULT, ...(CONFIG[rel] ?? {}) };
    const src = path.join(abs, f);
    const out = src.replace(/\.png$/, ".webp");
    const b = (await stat(src)).size;
    await sharp(src)
      .resize({ width: cfg.max, height: cfg.max, fit: "inside", withoutEnlargement: true })
      .webp(cfg.lossless ? { lossless: true, effort: 6 } : { quality: cfg.quality, effort: 6 })
      .toFile(out);
    const a = (await stat(out)).size;
    before += b;
    after += a;
    console.log(
      `${rel.padEnd(30)} ${(b / 1024).toFixed(0).padStart(5)}KB → ${(a / 1024).toFixed(0).padStart(5)}KB`,
    );
  }
}
console.log(
  `\nTOTAL  ${(before / 1024 / 1024).toFixed(2)}MB → ${(after / 1024 / 1024).toFixed(2)}MB`,
);
