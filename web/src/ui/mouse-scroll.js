// A PC mouse: rows that scroll sideways (chips, tab bars, tool bars) can be dragged with the mouse
// like a finger drags them on a phone, and the mouse wheel scrolls them sideways. Fingers and pens
// keep the browser's own scrolling; canvases, editors and inputs are left alone.
const SKIP = 'input, textarea, select, [contenteditable], .cm-editor, svg.circuit-svg, canvas';

/** The nearest ancestor of el that scrolls sideways (and has more to show). */
function sideScroller(el) {
  for (; el && el !== document.body && el.nodeType === 1; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.touchAction === 'none') return null; // a surface with its own dragging (canvas, handle, HMI …)
    if (el.scrollWidth <= el.clientWidth + 2) continue;
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return el;
  }
  return null;
}

export function installMouseScroll(doc = document) {
  let drag = null, swallowClick = false;
  doc.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    if (e.pointerType !== 'mouse' || e.button !== 0 || !e.target.closest || e.target.closest(SKIP)) return;
    const box = sideScroller(e.target);
    if (box) drag = { box, x: e.clientX, left: box.scrollLeft, moved: false };
  }, true);
  doc.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!(e.buttons & 1)) { drag = null; return; }
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    drag.moved = true;
    drag.box.scrollLeft = drag.left - dx;
    e.preventDefault();
  }, true);
  const end = () => { if (drag && drag.moved) swallowClick = true; drag = null; };
  doc.addEventListener('pointerup', end, true);
  doc.addEventListener('pointercancel', () => { drag = null; }, true);
  // the release after a drag is not a click on the chip / tab under the mouse
  doc.addEventListener('click', (e) => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  // the wheel turns sideways in a row that cannot scroll up and down
  doc.addEventListener('wheel', (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.target.closest || e.target.closest(SKIP)) return;
    const box = sideScroller(e.target);
    if (!box || box.scrollHeight > box.clientHeight + 2) return;
    const before = box.scrollLeft;
    box.scrollLeft += e.deltaY;
    if (box.scrollLeft !== before) e.preventDefault();
  }, { capture: true, passive: false });
}
