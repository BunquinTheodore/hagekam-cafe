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

/** Width / height of a manifest image, so layout CSS can follow the real photo ratios. */
function aspect(name) {
  const entry = manifest[name];
  if (!entry) throw new Error(`aspect: unknown image "${name}"`);
  return 1 / entry.ratio;
}

/** Names of the photos inside the film track, read from its <x-pic> tags. */
function filmNames(html) {
  const start = html.indexOf('data-film');
  if (start < 0) return [];
  const track = html.slice(start, html.indexOf('</ol>', start));
  return [...track.matchAll(/<x-pic\s[^>]*name="([a-z0-9-]+)"/g)].map((m) => m[1]);
}

function fillRatioTokens(html) {
  const film = filmNames(html);
  return html
    .replace('{{film-ratio}}', film.reduce((sum, name) => sum + aspect(name), 0).toFixed(3))
    .replace('{{film-frames}}', String(film.length))
    .replace(/\{\{aspect:([a-z0-9-]+)\}\}/g, (_, name) => aspect(name).toFixed(4))
    .replace(/\{\{aspect-sum:([a-z0-9,-]+)\}\}/g, (_, list) => list.split(',').reduce((sum, name) => sum + aspect(name), 0).toFixed(3));
}

const pictures = () => ({
  name: 'hagekam-pictures',
  transformIndexHtml: (html) => fillRatioTokens(html).replace(/<x-pic\s([^>]*?)\s*\/?>/g, (_, raw) => renderPicture(readAttrs(raw))),
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
