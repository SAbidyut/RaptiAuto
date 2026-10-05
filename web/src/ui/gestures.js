// Gestures shared by the Arduino circuit canvas, the 2D PLC schematic and the 3D PLC lab.
//
//  • Double-tap zoom (Google Maps style): tap, then touch again and hold — sliding down zooms in,
//    sliding up zooms out. A plain double tap on empty space zooms in one step.
//  • Selection box (AutoCAD style): dragging to the RIGHT draws a solid blue *window* that selects
//    what lies completely inside it; dragging to the LEFT draws a dashed green *crossing* box that
//    selects everything it touches.
import { h } from './widgets.js';

export const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 32;

/** Remembers the last tap so a following press can be recognised as the second tap of a double tap. */
export class TapTracker {
  constructor() { this.last = null; }
  /** Call when a tap (press + release without moving) ended. */
  tap(x, y, extra = null) { this.last = { x, y, t: performance.now(), extra }; }
  /** Is a press at (x, y) now the second tap? Returns the first tap (with its extra) or null. */
  second(x, y) {
    const l = this.last;
    if (!l || performance.now() - l.t > DOUBLE_TAP_MS || Math.hypot(x - l.x, y - l.y) > DOUBLE_TAP_PX) return null;
    return l;
  }
  clear() { this.last = null; }
}

/** Zoom factor for a double-tap slide: drag down = zoom in, up = zoom out (×2 per ~58 px). */
export function slideZoomFactor(dy) { return Math.exp(dy * 0.012); }

/**
 * The rubber-band rectangle. Lives in a positioned host element; coordinates are client (page) px.
 */
export class SelectBox {
  constructor(host) {
    this.host = host;
    this.el = h('div', { class: 'select-box hidden' }, this.tag = h('span', { class: 'select-box-tag' }));
    host.appendChild(this.el);
    this.active = false;
  }

  start(x, y) {
    this.x0 = x; this.y0 = y; this.x1 = x; this.y1 = y;
    this.active = true;
    this.el.classList.remove('hidden');
    this.draw();
  }

  update(x, y) { if (!this.active) return; this.x1 = x; this.y1 = y; this.draw(); }

  /** 'window' when dragged to the right, 'crossing' when dragged to the left (AutoCAD). */
  get mode() { return this.x1 >= this.x0 ? 'window' : 'crossing'; }

  get rect() {
    return { x0: Math.min(this.x0, this.x1), y0: Math.min(this.y0, this.y1), x1: Math.max(this.x0, this.x1), y1: Math.max(this.y0, this.y1) };
  }

  draw() {
    const r = this.host.getBoundingClientRect();
    const b = this.rect;
    Object.assign(this.el.style, { left: b.x0 - r.left + 'px', top: b.y0 - r.top + 'px', width: b.x1 - b.x0 + 'px', height: b.y1 - b.y0 + 'px' });
    const crossing = this.mode === 'crossing';
    this.el.classList.toggle('crossing', crossing);
    this.tag.textContent = crossing ? 'Crossing' : 'Window';
  }

  /** Hide the box; returns {rect, mode} or null when it was too small to mean anything. */
  end() {
    if (!this.active) return null;
    this.active = false;
    this.el.classList.add('hidden');
    const rect = this.rect;
    if (rect.x1 - rect.x0 < 6 && rect.y1 - rect.y0 < 6) return null;
    return { rect, mode: this.mode };
  }

  cancel() { this.active = false; this.el.classList.add('hidden'); }
}

/** Does a box {x0,y0,x1,y1} match the selection rectangle (window: inside, crossing: overlapping)? */
export function boxInSelection(sel, box, mode) {
  if (mode === 'window') return box.x0 >= sel.x0 && box.x1 <= sel.x1 && box.y0 >= sel.y0 && box.y1 <= sel.y1;
  return box.x1 >= sel.x0 && box.x0 <= sel.x1 && box.y1 >= sel.y0 && box.y0 <= sel.y1;
}

/** Does a polyline [[x,y]…] match the selection rectangle? */
export function polylineInSelection(sel, pts, mode) {
  if (!pts || !pts.length) return false;
  const inside = ([x, y]) => x >= sel.x0 && x <= sel.x1 && y >= sel.y0 && y <= sel.y1;
  if (mode === 'window') return pts.every(inside);
  if (pts.some(inside)) return true;
  for (let i = 0; i < pts.length - 1; i++) if (segmentHitsRect(pts[i], pts[i + 1], sel)) return true;
  return false;
}

function segmentHitsRect(a, b, r) {
  // Liang–Barsky clip
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const p = [-dx, dx, -dy, dy];
  const q = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
