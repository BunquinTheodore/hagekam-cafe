/**
 * Pointer interaction layer for fine pointers: a custom cursor, a spotlight on glass surfaces,
 * magnetic buttons and card tilt. One delegated pointer handler feeds one rAF loop; element rects
 * are cached when the pointer enters a target (and on scroll), never read inside the loop.
 */

const CURSOR_RULES = [
  { selector: '.sticker', kind: 'sticker' },
  { selector: 'a[href], button', kind: 'link' },
  // Photos are not clickable, so the media state is a quiet outline ring with no call to action.
  { selector: '.card picture, .frame, .g, .panel__img, .delivery__img, .visit__img, .crest', kind: 'media' },
  { selector: '.glass, .items li, .chips li, .marquee, .hero__title', kind: 'soft' },
];
const MAGNET_SELECTOR = '.btn, [role="tab"]';
const MAGNET = { pull: 0.3, max: 10, tabMax: 4 };
const TILT = { rotateX: 7, rotateY: 9, lift: 6 };
const RING_EASE = 0.2;
const SETTLED_PX = 0.15;
const MARQUEE_SLOW_RATE = 0.25;
const PARALLAX_PX = 14;

const clamp = (value, max) => Math.max(-max, Math.min(max, value));

const s = {
  reducedMotion: false,
  onPointer: null,
  cursor: null,
  pointer: { x: 0, y: 0 },
  ring: { x: 0, y: 0 },
  visible: false,
  moved: false,
  frame: 0,
  rule: null,
  glass: null,
  magnet: null,
  tilt: null,
  marquee: null,
  parallax: [],
  rects: new WeakMap(),
};

function createCursor() {
  const root = document.createElement('div');
  root.className = 'cursor';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<span class="cursor__dot"></span><span class="cursor__follow"><span class="cursor__ring"></span></span>';
  document.body.append(root);
  return { root, dot: root.firstElementChild, follow: root.lastElementChild };
}

function measure() {
  for (const el of [s.glass, s.magnet, s.tilt]) if (el) s.rects.set(el, el.getBoundingClientRect());
}

function setCursorRule(rule) {
  if (rule === s.rule) return;
  s.rule = rule;
  s.cursor.root.dataset.kind = rule?.kind ?? '';
}

function setMarqueeRate(marquee, rate) {
  marquee?.querySelector('.marquee__track')?.getAnimations().forEach((animation) => animation.updatePlaybackRate(rate));
}

function swap(key, next, release) {
  if (s[key] === next) return;
  if (s[key]) release(s[key]);
  s[key] = next;
}

function releaseMagnet(el) {
  el.classList.remove('is-magnet');
  el.style.translate = '';
}

function releaseTilt(el) {
  el.classList.remove('is-tilting');
  el.style.transform = '';
}

function retarget(el) {
  const motion = !s.reducedMotion;
  const before = [s.glass, s.magnet, s.tilt];
  swap('glass', el?.closest('.glass') ?? null, () => {});
  swap('magnet', motion ? el?.closest(MAGNET_SELECTOR) ?? null : null, releaseMagnet);
  swap('tilt', motion ? el?.closest('[data-tilt]') ?? null : null, releaseTilt);
  const marquee = motion ? el?.closest('.marquee') ?? null : null;
  if (marquee !== s.marquee) {
    setMarqueeRate(s.marquee, 1);
    setMarqueeRate(marquee, MARQUEE_SLOW_RATE);
    s.marquee = marquee;
  }
  s.magnet?.classList.add('is-magnet');
  s.tilt?.classList.add('is-tilting');
  // Measure only newly entered targets: an element already under the pointer is displaced by its own effect.
  if ([s.glass, s.magnet, s.tilt].some((el, i) => el !== before[i])) measure();
  setCursorRule(CURSOR_RULES.find((rule) => el?.closest(rule.selector)) ?? null);
}

function applySpotlight({ x, y }) {
  const rect = s.glass && s.rects.get(s.glass);
  if (!rect) return;
  s.glass.style.setProperty('--mx', `${(x - rect.left).toFixed(1)}px`);
  s.glass.style.setProperty('--my', `${(y - rect.top).toFixed(1)}px`);
}

function applyMagnet({ x, y }) {
  const rect = s.magnet && s.rects.get(s.magnet);
  if (!rect) return;
  const max = s.magnet.getAttribute('role') === 'tab' ? MAGNET.tabMax : MAGNET.max;
  const dx = clamp((x - rect.left - rect.width / 2) * MAGNET.pull, max);
  const dy = clamp((y - rect.top - rect.height / 2) * MAGNET.pull, max);
  s.magnet.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
}

function applyTilt({ x, y }) {
  const rect = s.tilt && s.rects.get(s.tilt);
  if (!rect) return;
  const px = (x - rect.left) / rect.width - 0.5;
  const py = (y - rect.top) / rect.height - 0.5;
  s.tilt.style.transform = `perspective(900px) translate3d(0,${-TILT.lift}px,0) rotateX(${(-py * TILT.rotateX).toFixed(2)}deg) rotateY(${(px * TILT.rotateY).toFixed(2)}deg)`;
}

function moveCursor() {
  const { pointer, ring, cursor } = s;
  const ease = s.reducedMotion ? 1 : RING_EASE;
  ring.x += (pointer.x - ring.x) * ease;
  ring.y += (pointer.y - ring.y) * ease;
  cursor.dot.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0)`;
  cursor.follow.style.transform = `translate3d(${ring.x.toFixed(2)}px,${ring.y.toFixed(2)}px,0)`;
  return Math.abs(pointer.x - ring.x) > SETTLED_PX || Math.abs(pointer.y - ring.y) > SETTLED_PX;
}

/** Hero layers drift with the eased ring, each by its data-depth, while the hero is on screen. */
function applyParallax() {
  if (!s.parallax.length || window.scrollY > window.innerHeight) return;
  const nx = s.ring.x / window.innerWidth - 0.5;
  const ny = s.ring.y / window.innerHeight - 0.5;
  for (const { el, depth } of s.parallax) {
    el.style.translate = `${(nx * depth * PARALLAX_PX).toFixed(1)}px ${(ny * depth * PARALLAX_PX).toFixed(1)}px`;
  }
}

function tick() {
  s.frame = 0;
  const moving = moveCursor();
  applyParallax();
  if (s.moved) {
    s.moved = false;
    applySpotlight(s.pointer);
    applyMagnet(s.pointer);
    applyTilt(s.pointer);
  }
  if (moving) requestTick();
}

function requestTick() {
  if (!s.frame) s.frame = requestAnimationFrame(tick);
}

function show(x, y) {
  s.visible = true;
  s.ring.x = x;
  s.ring.y = y;
  document.documentElement.classList.add('has-cursor');
}

function hide() {
  if (!s.visible) return;
  s.visible = false;
  retarget(null);
  document.documentElement.classList.remove('has-cursor');
}

function onPointerMove(event) {
  if (event.pointerType !== 'mouse') return;
  s.pointer.x = event.clientX;
  s.pointer.y = event.clientY;
  if (!s.visible) show(event.clientX, event.clientY);
  s.moved = true;
  s.onPointer?.(event.clientX, event.clientY);
  requestTick();
}

function onPointerOver(event) {
  if (event.pointerType === 'mouse') retarget(event.target);
}

function onPointerDown(event) {
  if (event.pointerType !== 'mouse') { hide(); return; }
  s.cursor.root.classList.add('is-down');
}

const FIXED_SELECTOR = '.nav, .dock';
let lastScrollY = 0; // read lazily: a layout read at import time would force a full page reflow
function onScroll() {
  const dy = window.scrollY - lastScrollY;
  lastScrollY = window.scrollY;
  if (!s.glass && !s.magnet && !s.tilt) return;
  // Targets are displaced by their own magnet/tilt offsets, so shift the cached rects instead of re-reading them.
  // Elements inside the fixed nav or dock do not move with the page, so their rects stay as they are.
  for (const el of new Set([s.glass, s.magnet, s.tilt])) {
    const rect = el && s.rects.get(el);
    if (!rect || el.closest(FIXED_SELECTOR)) continue;
    s.rects.set(el, DOMRectReadOnly.fromRect({ x: rect.x, y: rect.y - dy, width: rect.width, height: rect.height }));
  }
  s.moved = true;
  requestTick();
}

/** Starts the pointer layer. Call only for fine, hover capable pointers. */
export function initInteractions({ reducedMotion = false, onPointer = null } = {}) {
  s.reducedMotion = reducedMotion;
  lastScrollY = window.scrollY;
  s.onPointer = onPointer;
  s.cursor = createCursor();
  s.parallax = reducedMotion ? [] : [...document.querySelectorAll('[data-depth]')].map((el) => ({ el, depth: Number(el.dataset.depth) || 0 }));
  addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('pointerout', (event) => { if (!event.relatedTarget) hide(); }, { passive: true });
  addEventListener('pointerdown', onPointerDown, { passive: true });
  addEventListener('pointerup', () => s.cursor.root.classList.remove('is-down'), { passive: true });
  addEventListener('blur', hide);
  addEventListener('scroll', onScroll, { passive: true });
}
