/**
 * Testimonial marquee: clones each review row once so the CSS animation (left to right)
 * can loop seamlessly. Clones are hidden from assistive tech and from keyboard focus.
 */
export function initReviews({ reducedMotion }) {
  if (reducedMotion) return; // rows stay as plain horizontally scrollable lists
  document.querySelectorAll('[data-reviews-track]').forEach((track) => {
    const originals = [...track.children];
    for (const item of originals) {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      track.append(clone);
    }
    track.classList.add('is-looping');
  });
}
