import Lenis from 'lenis';

const root = document.documentElement;
root.classList.add('js'); // also set inline in <head> to avoid a reveal flash

const prefersReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Shared scroll state read by the render loop and the 3D scene. */
const state = { scrollY: window.scrollY, vh: window.innerHeight, pointerX: 0, pointerY: 0 };

/* Smooth scrolling */
const lenis = prefersReducedMotion ? null : new Lenis({ lerp: 0.11, smoothWheel: true });
if (lenis) {
  lenis.on('scroll', ({ scroll }) => { state.scrollY = scroll; });
} else {
  addEventListener('scroll', () => { state.scrollY = window.scrollY; }, { passive: true });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    if (lenis) lenis.scrollTo(target, { offset: -80 });
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

/* Gentle parallax for gallery photos */
const parallaxItems = [...document.querySelectorAll('[data-parallax]')].map((el) => ({
  el, pic: el.querySelector('picture'), factor: Number(el.dataset.parallax), top: 0, height: 0,
}));
function measureParallax() {
  for (const item of parallaxItems) {
    const rect = item.el.getBoundingClientRect();
    item.top = rect.top + state.scrollY;
    item.height = rect.height;
  }
}
function updateParallax(y) {
  for (const item of parallaxItems) {
    const center = item.top + item.height / 2 - (y + state.vh / 2);
    if (!item.pic || Math.abs(center) > state.vh * 1.5) continue;
    item.pic.style.transform = `translate3d(0,${center * item.factor * -0.5}px,0)`;
  }
}

/* Pointer driven 3D tilt on glass cards */
if (finePointer && !prefersReducedMotion) {
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg) translateZ(0)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  });
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

if (finePointer) {
  addEventListener('pointermove', (event) => {
    state.pointerX = event.clientX / window.innerWidth - 0.5;
    state.pointerY = event.clientY / window.innerHeight - 0.5;
  }, { passive: true });
}

/* Layout measurement */
function measure() {
  state.vh = window.innerHeight;
  measureFilm();
  measureParallax();
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
measure();

/* Single render loop for DOM driven motion */
function frame(time) {
  requestAnimationFrame(frame);
  lenis?.raf(time);
  const y = state.scrollY;
  if (y === lastFrameY) return;
  lastFrameY = y;
  updateNav(y);
  updateFilm(y);
  if (!prefersReducedMotion) updateParallax(y);
}
requestAnimationFrame(frame);

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
const engageEvents = ['pointermove', 'pointerdown', 'wheel', 'touchstart', 'keydown', 'scroll'];
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
  setTimeout(requestScene, SCENE_FALLBACK_DELAY_MS);
}
if (document.readyState === 'complete') armScene();
else addEventListener('load', armScene, { once: true });
