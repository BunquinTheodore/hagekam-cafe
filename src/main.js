import Lenis from 'lenis';
import { splitHeroTitle, splitWords, runSplash } from './text-fx.js';
import { initInteractions } from './interactions.js';
import { initStickers } from './stickers.js';
import { initReviews } from './reviews.js';

// The inline <head> script adds .js and removes it again if this module has not set .fx-ready
// within a few seconds, so a failed script never leaves content hidden. It is not re-added here, so content a
// visitor is already reading never re-hides; the pinned film is skipped in that fallback mode as well.
const root = document.documentElement;
const effectsActive = () => root.classList.contains('js');

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/* Text splitting comes first: every DOM write happens before the first layout read, so this task never forces a reflow. */
splitHeroTitle(document.querySelector('.hero__title'));
const headings = [...document.querySelectorAll('.h2')];
headings.forEach(splitWords);

/** Shared scroll state read by the render loop and the 3D scene. Scroll and height are filled in by measure(). */
const state = { scrollY: 0, vh: 0, pointerX: 0, pointerY: 0 };

/* Smooth scrolling. Lenis reads layout when constructed, so it is created after the first frame (see startLenis). */
let lenis = null;
let splashDone = false;
function startLenis() {
  if (prefersReducedMotion) {
    addEventListener('scroll', () => { state.scrollY = window.scrollY; }, { passive: true });
    return;
  }
  lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
  lenis.on('scroll', ({ scroll }) => { state.scrollY = scroll; });
  if (!splashDone) lenis.stop();
}

/** Smooth scrolls to a section, re-aiming while content-visibility sections above it settle their real size. */
const ANCHOR_OFFSET = 80;
const MAX_AIM_PASSES = 3;
function scrollToSection(target, pass = 0) {
  lenis.scrollTo(target, {
    offset: -ANCHOR_OFFSET,
    onComplete: () => {
      const miss = Math.abs(target.getBoundingClientRect().top - ANCHOR_OFFSET);
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      if (miss > 2 && !atBottom && pass < MAX_AIM_PASSES) scrollToSection(target, pass + 1);
    },
  });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    // Sections below the fold use content-visibility, so their height is an estimate until rendered;
    // aim again once the first scroll lands to correct for it.
    if (lenis) scrollToSection(target);
    else target.scrollIntoView({ behavior: 'auto' });
    if (target.id === 'top') return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
});

/* Reveal on enter */
const revealObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('is-in');
    revealObserver.unobserve(entry.target);
  }
}, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));

/* Text animations: letters in the hero, word masks on headings, tracking on eyebrows */
headings.forEach((heading) => revealObserver.observe(heading));
document.querySelectorAll('.eyebrow').forEach((label) => {
  if (!label.closest('.hero')) revealObserver.observe(label);
});

const HERO_MEDIA_DELAY_MS = 700;
/* Hero media waits for the splash, so it never competes with first paint. Reduced motion gets a still photo. */
const smallHero = matchMedia('(max-width: 919px)');
function heroMediaSrc(img) {
  if (prefersReducedMotion) return img.dataset.still;
  return (smallHero.matches && img.dataset.srcSmall) || img.dataset.src;
}
function loadHeroMedia() {
  document.querySelectorAll('.hero img[data-src]').forEach((img) => {
    img.addEventListener('load', () => img.classList.add('is-ready'), { once: true });
    img.src = heroMediaSrc(img);
    img.removeAttribute('data-src');
  });
}

/* Splash: hold smooth scrolling until it fades away */
runSplash(document.getElementById('splash'), {
  reducedMotion: prefersReducedMotion,
  onDone: () => {
    splashDone = true;
    lenis?.start();
    // After the entrance has started, in its own task, so decoding never lands on the intro frame.
    setTimeout(loadHeroMedia, HERO_MEDIA_DELAY_MS);
  },
});

/* Nav hides on scroll down, returns on scroll up */
const nav = document.querySelector('[data-nav]');
const sceneCanvas = document.getElementById('scene');
let lastNavY = 0;
nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
function updateNav(y) {
  sceneCanvas?.classList.toggle('is-dim', y > state.vh * 0.9);
  const goingDown = y > lastNavY + 4;
  const goingUp = y < lastNavY - 4;
  if (goingDown && y > state.vh * 0.6 && !nav.contains(document.activeElement)) nav.classList.add('is-hidden');
  else if (goingUp || y < 80) nav.classList.remove('is-hidden');
  if (goingDown || goingUp) lastNavY = y;
}

/* Scroll film: a sticky stage whose height equals the horizontal travel */
const film = document.querySelector('.film');
const filmTrack = document.querySelector('[data-film]');
const filmBar = document.querySelector('[data-film-bar]');
const film$ = { top: 0, travel: 0 };
function measureFilm() {
  if (!effectsActive()) { film$.travel = 0; film.style.height = ''; return; }
  film$.travel = Math.max(0, filmTrack.scrollWidth - root.clientWidth);
  film.style.height = `${film$.travel + state.vh}px`;
  film$.top = film.getBoundingClientRect().top + state.scrollY;
}
function updateFilm(y) {
  if (!film$.travel) {
    filmTrack.style.transform = '';
    filmBar.style.transform = 'scaleX(0)';
    return;
  }
  const progress = Math.min(1, Math.max(0, (y - film$.top) / film$.travel));
  filmTrack.style.transform = `translate3d(${-progress * film$.travel}px,0,0)`;
  filmBar.style.transform = `scaleX(${progress})`;
}

/* Accessible menu tabs */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const t of tabs) {
    const isActive = t === tab;
    t.setAttribute('aria-selected', String(isActive));
    t.tabIndex = isActive ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    panel.hidden = !isActive;
    if (isActive) {
      panel.classList.remove('is-entering');
      void panel.offsetWidth;
      panel.classList.add('is-entering');
    }
  }
  tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = tabs[event.key === 'Home' ? 0 : tabs.length - 1];
      next.focus(); selectTab(next);
      return;
    }
    if (!(event.key in keys)) return;
    event.preventDefault();
    const next = tabs[(i + keys[event.key] + tabs.length) % tabs.length];
    next.focus(); selectTab(next);
  });
});

/* Single render loop for DOM driven motion. Registered before the pointer layer and the scene,
   so Lenis sets the scroll position while layout is still clean, before their style writes. */
function frame(time) {
  requestAnimationFrame(frame);
  lenis?.raf(time);
  const y = state.scrollY;
  if (!measured || y === lastFrameY) return;
  lastFrameY = y;
  updateNav(y);
  updateDock(y);
  updateFilm(y);
}
requestAnimationFrame(frame);

/* Pointer layer (cursor, spotlight, magnets, tilt) also feeds the 3D scene's parallax. */
if (finePointer) {
  initInteractions({
    reducedMotion: prefersReducedMotion,
    onPointer: (x, y) => {
      state.pointerX = x / window.innerWidth - 0.5;
      state.pointerY = y / window.innerHeight - 0.5;
    },
  });
}

/* Mobile dock: highlights the section in view and slides its pill between items */
const dock = document.querySelector('[data-dock-nav]');
const dockPill = dock.querySelector('.dock__pill');
const dockLinks = [...dock.querySelectorAll('[data-dock]')];
const dockTargets = dockLinks.map((link) => ({ link, section: document.getElementById(link.dataset.dock), top: 0 }));
let activeDock = null;
function measureDock() {
  for (const t of dockTargets) t.top = t.section.getBoundingClientRect().top + state.scrollY;
  if (activeDock) placeDockPill(activeDock, false);
}
function placeDockPill(link, animate) {
  if (!dock.getClientRects().length) return; // dock is display:none above 980px
  dockPill.style.setProperty('--pill-x', `${link.offsetLeft}px`);
  dockPill.style.setProperty('--pill-w', `${link.offsetWidth}px`);
  if (!animate || prefersReducedMotion) return;
  dockPill.classList.remove('is-moving');
  void dockPill.offsetWidth;
  dockPill.classList.add('is-moving');
}
function setActiveDock(link) {
  if (link === activeDock) return;
  activeDock?.removeAttribute('aria-current');
  link.setAttribute('aria-current', 'true');
  placeDockPill(link, activeDock !== null);
  activeDock = link;
}
const DOCK_TAP_LOCK_MS = 1800;
let dockLockedUntil = 0;
function updateDock(y) {
  if (performance.now() < dockLockedUntil) return;
  const line = y + state.vh * 0.45;
  let current = dockTargets[0];
  for (const t of dockTargets) if (t.top <= line) current = t;
  setActiveDock(current.link);
}
dockLinks.forEach((link) => link.addEventListener('click', () => {
  setActiveDock(link);
  dockLockedUntil = performance.now() + DOCK_TAP_LOCK_MS;
}));

/* Layout measurement */
function measure() {
  state.vh = window.innerHeight;
  state.scrollY = lenis ? lenis.scroll : window.scrollY;
  measureFilm();
  measureDock();
}
let measureTimer = 0;
let lastFrameY = -1;
function scheduleMeasure() {
  clearTimeout(measureTimer);
  measureTimer = setTimeout(() => { measure(); lastFrameY = -1; }, 120);
}
addEventListener('resize', scheduleMeasure);
// Fonts, tab switches and image loads all reflow the page; re-measure when <main> changes size.
new ResizeObserver(scheduleMeasure).observe(document.getElementById('main'));
document.fonts?.ready.then(scheduleMeasure);
document.querySelectorAll('.film img').forEach((img) => img.addEventListener('load', scheduleMeasure, { once: true }));
// First measure after the browser's own first layout, so no layout is forced inside this script task.
let measured = false;
requestAnimationFrame(() => requestAnimationFrame(() => {
  startLenis();
  measure();
  measured = true;
  lastFrameY = -1;
}));

/* The WebGL scene loads after the page is interactive so it never competes with first paint. */
function loadScene() {
  const canvas = document.getElementById('scene');
  import('./scene.js')
    .then(({ startScene }) => startScene(canvas, state, { reducedMotion: prefersReducedMotion }))
    .catch((error) => {
      console.warn('3D scene unavailable, continuing without it.', error);
      canvas.remove();
    });
}
/* Defer the scene until the visitor engages, or until the page has been calm for a while. */
const SCENE_FALLBACK_DELAY_MS = 4000;
// Only genuine input counts: programmatic scroll events (Lenis, scroll restoration) must not start the heavy scene.
const engageEvents = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown'];
let sceneRequested = false;
function requestScene() {
  if (sceneRequested) return;
  sceneRequested = true;
  engageEvents.forEach((type) => removeEventListener(type, requestScene));
  if ('requestIdleCallback' in window) requestIdleCallback(loadScene, { timeout: 1500 });
  else setTimeout(loadScene, 200);
}
function armScene() {
  engageEvents.forEach((type) => addEventListener(type, requestScene, { passive: true, once: true }));
  // Touch visitors always scroll or tap first, so only desktop needs the timed fallback.
  if (finePointer) setTimeout(requestScene, SCENE_FALLBACK_DELAY_MS);
}
if (document.readyState === 'complete') armScene();
else addEventListener('load', armScene, { once: true });

/* Draggable GIF stickers in the menu, delivery and visit sections */
// Below the fold extras wait for an idle moment so they never add to startup blocking time.
const runWhenIdle = (task) => ('requestIdleCallback' in window ? requestIdleCallback(task, { timeout: 2000 }) : setTimeout(task, 600));
runWhenIdle(() => initStickers());
runWhenIdle(() => initReviews({ reducedMotion: prefersReducedMotion }));

/* Logo sheen only runs while its wordmark is on screen */
const sheenObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) entry.target.classList.toggle('is-paused', !entry.isIntersecting);
});
document.querySelectorAll('.sheen').forEach((el) => sheenObserver.observe(el));

root.classList.add('fx-ready'); // everything is wired: the head failsafe stands down
