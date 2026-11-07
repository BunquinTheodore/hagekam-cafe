/** Text animation helpers: split headings into animatable letters and words, and run the splash. */

const SPLASH_MIN_MS = 1200;
const SPLASH_MAX_MS = 3000;
const SPLASH_REMOVE_FALLBACK_MS = 1500;

function wrapLetters(textNode, counter) {
  const fragment = document.createDocumentFragment();
  for (const part of textNode.textContent.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) { fragment.append(' '); continue; }
    const word = document.createElement('span');
    word.className = 'word';
    for (const char of part) {
      const ch = document.createElement('span');
      ch.className = 'ch';
      ch.style.setProperty('--i', counter.value++);
      ch.textContent = char;
      word.append(ch);
    }
    fragment.append(word);
  }
  textNode.replaceWith(fragment);
}

/** Splits the hero title into per-letter spans, keeping words unbreakable and the accessible name intact. */
export function splitHeroTitle(title) {
  if (!title) return;
  title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim());
  const counter = { value: 0 };
  title.querySelectorAll('.line').forEach((line) => {
    line.setAttribute('aria-hidden', 'true');
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => wrapLetters(node, counter));
  });
}

/** Wraps each word of a heading in a mask so it can slide up into view. */
export function splitWords(heading) {
  heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim());
  let index = 0;
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const part of node.textContent.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { fragment.append(' '); continue; }
      const mask = document.createElement('span');
      mask.className = 'w';
      mask.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span');
      inner.className = 'wi';
      inner.style.setProperty('--i', index++);
      inner.textContent = part;
      mask.append(inner);
      fragment.append(mask);
    }
    node.replaceWith(fragment);
  }
}

/** Fades the splash out once the fonts are ready (bounded by a min and max duration). Lazy images and the 3D chunk never hold it. */
export function runSplash(splash, { reducedMotion, onDone }) {
  const root = document.documentElement;
  const finish = () => {
    if (root.classList.contains('is-loaded')) return;
    root.classList.add('is-loaded');
    if (splash) {
      const alreadyHidden = getComputedStyle(splash).visibility === 'hidden';
      splash.classList.add('is-done');
      if (alreadyHidden) splash.remove();
      else {
        splash.addEventListener('transitionend', () => splash.remove(), { once: true });
        setTimeout(() => splash.remove(), SPLASH_REMOVE_FALLBACK_MS);
      }
    }
    onDone?.();
  };
  if (!splash || reducedMotion) { finish(); return; }
  // Durations count from navigation start (performance.now() is 0 there), not from when this module ran,
  // so a slow script never holds a page the visitor can already see.
  const whenReady = () => setTimeout(finish, Math.max(0, SPLASH_MIN_MS - performance.now()));
  (document.fonts?.ready ?? Promise.resolve()).then(whenReady, whenReady);
  setTimeout(finish, Math.max(0, SPLASH_MAX_MS - performance.now()));
}
