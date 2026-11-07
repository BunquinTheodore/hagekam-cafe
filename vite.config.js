import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./src/images.json', import.meta.url), 'utf8'));
const DEFAULT_SIZES = '(max-width: 720px) 92vw, 40vw';

function readAttrs(raw) {
  const attrs = {};
  for (const m of raw.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) attrs[m[1]] = m[2] ?? true;
  return attrs;
}

function srcset(name, widths, ext) {
  return widths.map((w) => `/img/${name}-${w}.${ext} ${w}w`).join(', ');
}

/** Expands <x-pic name="" alt="" sizes="" class="" eager> into a responsive <picture>. */
function renderPicture(attrs) {
  const entry = manifest[attrs.name];
  if (!entry) throw new Error(`x-pic: unknown image "${attrs.name}"`);
  if (typeof attrs.alt !== 'string') throw new Error(`x-pic: "${attrs.name}" needs alt text`);
  const { widths, ratio } = entry;
  const fallbackW = widths.includes(960) ? 960 : widths[widths.length - 1];
  const sizes = attrs.sizes || DEFAULT_SIZES;
  const eager = Boolean(attrs.eager);
  const loading = eager ? 'eager" fetchpriority="high' : 'lazy';
  const cls = attrs.class ? ` class="${attrs.class}"` : '';
  return (
    `<picture${cls}>` +
    `<source type="image/avif" srcset="${srcset(attrs.name, widths, 'avif')}" sizes="${sizes}">` +
    `<source type="image/webp" srcset="${srcset(attrs.name, widths, 'webp')}" sizes="${sizes}">` +
    `<img src="/img/${attrs.name}-${fallbackW}.webp" alt="${attrs.alt}" width="960" height="${Math.round(960 * ratio)}" loading="${loading}" decoding="async">` +
    `</picture>`
  );
}

const pictures = () => ({
  name: 'hagekam-pictures',
  transformIndexHtml: (html) => html.replace(/<x-pic\s([^>]*?)\s*\/?>/g, (_, raw) => renderPicture(readAttrs(raw))),
});

export default defineConfig({
  plugins: [pictures()],
  build: {
    target: 'es2020',
    cssMinify: true,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
