// Builds responsive AVIF/WebP from the curated source photos.
// Usage: node scripts/images.mjs <sourceDir>
import sharp from 'sharp';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) throw new Error('Pass the source photo directory as the first argument');
const OUT = 'public/img';
const WIDTHS = [480, 960, 1440];

const files = readdirSync(SRC).filter((f) => f.endsWith('.jpg') && !f.includes('(1)')).sort();
const PICK = {
  0: 'logo', 50: 'wordmark',
  23: 'artisan-coffee', 47: 'latte-art', 75: 'esmeringhoy-latte', 28: 'tara-kape', 15: 'matcha-series',
  6: 'coconut-cloud', 64: 'coffee-tiramisu', 82: 'tiramisu-trio', 84: 'creme-brulee', 11: 'mango-biscoff',
  43: 'frappe', 74: 'matcha-tiramisu', 34: 'frappe-croffle', 2: 'cups-display', 71: 'iced-latte-drive',
  24: 'clubhouse', 14: 'shrimp-pasta', 30: 'bolognese', 12: 'mama-rosa', 17: 'french-toast', 18: 'oreo-croffle',
  27: 'bruschetta', 33: 'nachos', 57: 'blackout-burger', 76: 'longaniza-burger', 31: 'tosilog', 36: 'hamsilog',
  37: 'sweet-sour-fish', 38: 'garlic-chicken', 19: 'greek-salad', 20: 'caesar-salad', 22: 'fries',
  16: 'grilled-cheese', 26: 'spread', 67: 'spread-outdoor', 79: 'sandwich-frappe',
  44: 'storefront', 52: 'storefront-open', 40: 'interior-day', 25: 'interior-night', 21: 'interior-glow',
  10: 'barista', 39: 'delivery',
};

mkdirSync(OUT, { recursive: true });
const manifest = {};
for (const [idx, name] of Object.entries(PICK)) {
  const input = join(SRC, files[Number(idx)]);
  const raw = await sharp(input).metadata();
  // EXIF orientations 5 to 8 rotate by 90 degrees, so width and height swap after .rotate().
  const swapped = (raw.orientation ?? 1) >= 5;
  const meta = swapped ? { width: raw.height, height: raw.width } : raw;
  const ratio = +(meta.height / meta.width).toFixed(4);
  manifest[name] = { ratio, widths: [] };
  for (const w of WIDTHS) {
    if (w > meta.width && w !== WIDTHS[0]) continue;
    const base = sharp(input).rotate().resize({ width: Math.min(w, meta.width) });
    await base.clone().avif({ quality: 48, effort: 6 }).toFile(join(OUT, `${name}-${w}.avif`));
    await base.clone().webp({ quality: 68 }).toFile(join(OUT, `${name}-${w}.webp`));
    manifest[name].widths.push(w);
  }
}
writeFileSync('src/images.json', JSON.stringify(manifest, null, 1));
console.log(`built ${Object.keys(manifest).length} images`);
