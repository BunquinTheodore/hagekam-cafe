/**
 * Draggable animated stickers. Each .sticker can be dragged with mouse or touch (pointer events with
 * capture), stays inside its section, springs part of the way back toward its resting spot on release,
 * and a double click or double tap sends it home. Only the `translate` property is written.
 */

const DRAG_THRESHOLD_PX = 4;
const SPRING_KEEP = 0.82; // share of the drag offset kept after the spring back on release
const DOUBLE_TAP_MS = 320;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readBounds(sticker, offset) {
  const bounds = sticker.closest('section').getBoundingClientRect();
  const rect = sticker.getBoundingClientRect();
  // Offsets are relative to the resting spot, so the allowed range is measured from there.
  const restLeft = rect.left - offset.x;
  const restTop = rect.top - offset.y;
  return {
    minX: bounds.left - restLeft,
    maxX: bounds.right - (restLeft + rect.width),
    minY: bounds.top - restTop,
    maxY: bounds.bottom - (restTop + rect.height),
  };
}

function place(sticker, { x, y }) {
  sticker.style.translate = x || y ? `${x.toFixed(1)}px ${y.toFixed(1)}px` : '';
}

function makeDraggable(sticker) {
  const s = { offset: { x: 0, y: 0 }, start: null, bounds: null, moved: false, lastTap: 0 };

  function onDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    sticker.setPointerCapture(event.pointerId);
    s.start = { px: event.clientX, py: event.clientY, x: s.offset.x, y: s.offset.y, id: event.pointerId };
    s.bounds = readBounds(sticker, s.offset);
    s.moved = false;
    sticker.classList.add('is-dragging');
  }

  function onMove(event) {
    if (!s.start || event.pointerId !== s.start.id) return;
    const dx = event.clientX - s.start.px;
    const dy = event.clientY - s.start.py;
    if (!s.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    s.moved = true;
    const { minX, maxX, minY, maxY } = s.bounds;
    s.offset = { x: clamp(s.start.x + dx, minX, maxX), y: clamp(s.start.y + dy, minY, maxY) };
    place(sticker, s.offset);
  }

  function onTap(time) {
    const isDouble = time - s.lastTap < DOUBLE_TAP_MS;
    s.lastTap = isDouble ? 0 : time;
    if (isDouble) s.offset = { x: 0, y: 0 };
  }

  function onUp(event) {
    if (!s.start || event.pointerId !== s.start.id) return;
    s.start = null;
    sticker.classList.remove('is-dragging');
    if (s.moved) s.offset = { x: s.offset.x * SPRING_KEEP, y: s.offset.y * SPRING_KEEP };
    else onTap(event.timeStamp);
    place(sticker, s.offset);
  }

  sticker.addEventListener('pointerdown', onDown);
  sticker.addEventListener('pointermove', onMove);
  sticker.addEventListener('pointerup', onUp);
  sticker.addEventListener('pointercancel', onUp);
  sticker.addEventListener('dragstart', (event) => event.preventDefault());
}

function revealWhenLoaded(sticker) {
  const show = () => sticker.classList.add('is-ready');
  if (sticker.complete && sticker.naturalWidth) show();
  else sticker.addEventListener('load', show, { once: true });
}

/** Wires every .sticker on the page. */
export function initStickers() {
  document.querySelectorAll('.sticker').forEach((sticker) => {
    revealWhenLoaded(sticker);
    makeDraggable(sticker);
  });
}
