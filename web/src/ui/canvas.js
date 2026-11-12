// Touch-first circuit canvas (SVG): pan / pinch zoom, part placement with breadboard snapping,
// wiring (tap pin → tap pin, or drag), selection (tap, or an AutoCAD-style window / crossing box),
// Google-Maps-style double-tap-and-slide zoom, and live simulation visuals.
import {
  getDef, pinsOf, toWorld, toLocal, worldBox, partTransform, partProps, newId, PITCH, textCounterScale,
} from '../components/registry.js';
import { SHARED_DEFS } from '../components/draw.js';
import { pluggedPins } from '../sim/netlist.js';
import { h } from './widgets.js';
import { Native } from '../native.js';
import { TapTracker, SelectBox, slideZoomFactor, boxInSelection, polylineInSelection } from './gestures.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

export const WIRE_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#eab308', '#a855f7', '#06b6d4', '#ec4899', '#f1f5f9', '#ef4444', '#111827', '#8b5a2b', '#9ca3af'];
const POWER_RE = /^(5V|3\.3V|3V3|VIN|VCC|VBUS|VSYS|\+|tp|bp|IOREF)/i;
const GND_RE = /^(GND|AGND|-|−|COM|tn|bn|VSS|K)/i;

const markupCache = new Map();
function partMarkup(def, props) {
  const key = def.type + '|' + JSON.stringify(props);
  let m = markupCache.get(key);
  if (!m) {
    // every label sits in its own <g class="tf">: on a mirrored part it is mirrored back around its
    // own centre (see .part.flip .tf in app.css), so the lettering stays readable
    m = def.render(props).replace(/<text\b[\s\S]*?<\/text>/g, (t) => `<g class="tf">${t}</g>`);
    markupCache.set(key, m);
    if (markupCache.size > 400) markupCache.delete(markupCache.keys().next().value);
  }
  return m;
}

export class CircuitCanvas {
  constructor(host, ed) {
    this.host = host;
    this.ed = ed; // editor controller: { project, commit(), selectionChanged(), openProps(), simActive(), engine, settings }
    this.view = { x: 0, y: 0, z: 1 };
    this.selection = null;
    this.wiring = null;
    this.pointers = new Map();
    this.down = null;
    this.mode = 'edit';
    this.partEls = new Map();
    this.wireEls = new Map();
    this.flowPhase = 0;
    this.taps = new TapTracker();
    this.selectTool = false; // "Select" tool: one-finger drag draws a selection box instead of panning

    this.svg = svgEl('svg', { class: 'circuit-svg', width: '100%', height: '100%' });
    this.svg.innerHTML = `<defs>${SHARED_DEFS}
      <pattern id="gridDots" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="0.7" fill="var(--grid-dot)"/></pattern>
      <pattern id="gridMajor" width="50" height="50" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="1.2" fill="var(--grid-dot-major)"/></pattern></defs>`;
    this.vp = svgEl('g', { class: 'viewport' });
    this.gridRect = svgEl('rect', { fill: 'url(#gridDots)' });
    this.gridRect2 = svgEl('rect', { fill: 'url(#gridMajor)' });
    this.layerBottom = svgEl('g', { class: 'layer-bottom' });
    this.layerParts = svgEl('g', { class: 'layer-parts' });
    this.layerWires = svgEl('g', { class: 'layer-wires' });
    this.layerOverlay = svgEl('g', { class: 'layer-overlay' });
    this.vp.append(this.gridRect, this.gridRect2, this.layerBottom, this.layerParts, this.layerWires, this.layerOverlay);
    this.svg.appendChild(this.vp);
    this.tip = h('div', { class: 'pin-tip' });
    this.host.append(this.svg, this.tip);
    this.box = new SelectBox(this.host);

    const opts = { passive: false };
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    this.svg.addEventListener('pointermove', (e) => this.onMove(e), opts);
    this.svg.addEventListener('pointerup', (e) => this.onUp(e), opts);
    this.svg.addEventListener('pointercancel', (e) => this.onUp(e, true), opts);
    this.svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.pointers.size) this.hideTip(); });
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), opts);
    this.svg.addEventListener('contextmenu', (e) => { e.preventDefault(); this.mouseMenu(e); });
    this.ro = new ResizeObserver(() => this.onResize());
    this.ro.observe(this.host);
  }

  /** Re-fit when auto-fitting; otherwise keep the point at the centre of the view in place. */
  onResize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return; // hidden pane
    if (this.autoFit) this.fit(false);
    else {
      if (this.lastSize) {
        this.view.x += (r.width - this.lastSize.w) / 2;
        this.view.y += (r.height - this.lastSize.h) / 2;
      }
      this.applyView();
    }
    this.lastSize = { w: r.width, h: r.height };
  }

  get project() { return this.ed.project; }

  destroy() { this.ro.disconnect(); }

  // ------------------------------------------------------------------ view
  applyView() {
    const { x, y, z } = this.view;
    this.vp.setAttribute('transform', `translate(${x} ${y}) scale(${z})`);
    const r = this.host.getBoundingClientRect();
    const w0 = -x / z, h0 = -y / z;
    const ww = r.width / z, hh = r.height / z;
    for (const g of [this.gridRect, this.gridRect2]) {
      g.setAttribute('x', Math.floor(w0 / 50) * 50 - 50);
      g.setAttribute('y', Math.floor(h0 / 50) * 50 - 50);
      g.setAttribute('width', ww + 150);
      g.setAttribute('height', hh + 150);
    }
    this.gridRect.style.display = z < 0.45 || !this.ed.settings.showGrid ? 'none' : '';
    this.gridRect2.style.display = this.ed.settings.showGrid ? '' : 'none';
    this.svg.style.setProperty('--z', z);
  }

  screenToWorld(cx, cy) {
    const r = this.svg.getBoundingClientRect();
    return [(cx - r.left - this.view.x) / this.view.z, (cy - r.top - this.view.y) / this.view.z];
  }

  worldToScreen(wx, wy) {
    const r = this.svg.getBoundingClientRect();
    return [wx * this.view.z + this.view.x + r.left, wy * this.view.z + this.view.y + r.top];
  }

  contentBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of this.project.parts) {
      if (!getDef(p.type)) continue;
      const b = worldBox(p);
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    for (const w of this.project.wires) for (const [x, y] of w.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (!Number.isFinite(x0)) return [-100, -100, 300, 250];
    return [x0, y0, x1, y1];
  }

  fit(animate = true, pad = 28) {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) { requestAnimationFrame(() => this.fit(animate, pad)); return; }
    const [x0, y0, x1, y1] = this.contentBox();
    // Keep the content clear of the floating tool column on the right and, in full screen,
    // of the tool rail on the left.
    const tools = this.host.parentElement && this.host.parentElement.querySelector('.side-tools');
    const tw = tools && tools.offsetParent ? tools.getBoundingClientRect().width + 8 : 0;
    const editor = this.host.closest('.editor');
    const rail = editor && editor.querySelector('.fs-bar');
    let lw = 0;
    if (rail && rail.offsetParent) {
      const b = rail.getBoundingClientRect();
      if (b.left < r.left + 40 && b.right > r.left) lw = b.right - r.left + 8;
    }
    const w = Math.max(80, r.width - tw - lw);
    const z = Math.max(0.15, Math.min(4, Math.min((w - pad * 2) / (x1 - x0 || 1), (r.height - pad * 2) / (y1 - y0 || 1))));
    const target = { z, x: lw + w / 2 - ((x0 + x1) / 2) * z, y: r.height / 2 - ((y0 + y1) / 2) * z };
    this.autoFit = true;
    this.animateTo(target, animate);
  }

  animateTo(target, animate = true) {
    if (!animate) { this.view = target; this.applyView(); return; }
    const from = { ...this.view };
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 260);
      const e = 1 - Math.pow(1 - k, 3);
      this.view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: from.z + (target.z - from.z) * e };
      this.applyView();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  zoomBy(f, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    if (cx === undefined) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const z = Math.max(0.12, Math.min(10, this.view.z * f));
    const k = z / this.view.z;
    const px = cx - r.left, py = cy - r.top;
    this.autoFit = false;
    this.view = { z, x: px - (px - this.view.x) * k, y: py - (py - this.view.y) * k };
    this.applyView();
  }

  /** Animated zoom by f around a screen point (double tap). */
  zoomAt(f, cx, cy) {
    const r = this.svg.getBoundingClientRect();
    const z = Math.max(0.12, Math.min(10, this.view.z * f));
    const k = z / this.view.z;
    const px = cx - r.left, py = cy - r.top;
    this.autoFit = false;
    this.animateTo({ z, x: px - (px - this.view.x) * k, y: py - (py - this.view.y) * k });
  }

  onWheel(e) {
    e.preventDefault();
    this.autoFit = false;
    if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
      if (e.ctrlKey || e.deltaMode === 1 || Math.abs(e.deltaY) >= 50) this.zoomBy(Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY);
      else { this.view.x -= e.deltaX; this.view.y -= e.deltaY; this.applyView(); }
    }
  }

  // ------------------------------------------------------------------ rendering
  render() {
    const proj = this.project;
    const seen = new Set();
    const orderBottom = [], orderTop = [];
    const nBoards = proj.parts.filter((p) => getDef(p.type) && getDef(p.type).board).length;
    for (const p of proj.parts) {
      const def = getDef(p.type);
      if (!def) continue;
      (def.layer === -1 ? orderBottom : orderTop).push(p);
    }
    for (const [layer, list] of [[this.layerBottom, orderBottom], [this.layerParts, orderTop]]) {
      for (const p of list) {
        seen.add(p.id);
        let el = this.partEls.get(p.id);
        const def = getDef(p.type);
        const props = partProps(p);
        // several boards in one circuit: each carries its name ("Master", "Slave") above it
        const tag = def.board && !def.piBoard && nBoards > 1 ? (p.title || 'Board 1') : '';
        const key = def.type + JSON.stringify(props) + tag;
        if (!el || el._key !== key) {
          if (el) el.remove();
          el = svgEl('g', { class: 'part', 'data-id': p.id });
          el.innerHTML = partMarkup(def, props) + (tag ? boardTag(def, tag) : '');
          el._key = key;
          el._def = def;
          el._props = props;
          this.partEls.set(p.id, el);
        }
        el.setAttribute('transform', partTransform(p));
        this.applyFlip(el, p);
        layer.appendChild(el); // keeps z-order
      }
    }
    for (const [id, el] of this.partEls) if (!seen.has(id)) { el.remove(); this.partEls.delete(id); }
    this.renderWires();
    this.buildPinIndex();
    this.renderOverlay();
    this.applyView();
  }

  /** Mirrored parts: tell the labels how to flip back. */
  applyFlip(el, part) {
    const flipped = !!(part.flipX || part.flipY);
    if (flipped !== el.classList.contains('flip')) el.classList.toggle('flip', flipped);
    if (flipped) {
      const [cx, cy] = textCounterScale(part);
      el.style.setProperty('--cfx', cx);
      el.style.setProperty('--cfy', cy);
    }
  }

  pinPos(ref) {
    const part = this.project.parts.find((p) => p.id === ref.part);
    if (!part) return null;
    const pin = pinsOf(part).find((p) => p.id === ref.pin);
    if (!pin) return null;
    return toWorld(part, pin.x, pin.y);
  }

  wirePath(pts) {
    if (pts.length < 2) return '';
    const smooth = this.ed.settings.wireStyle !== 'straight';
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    if (!smooth || pts.length === 2) {
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i][0]} ${pts[i][1]}`;
      return d;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
      const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
      const r = Math.min(8, l1 / 2, l2 / 2);
      const ax = cx - ((cx - px) / (l1 || 1)) * r, ay = cy - ((cy - py) / (l1 || 1)) * r;
      const bx = cx + ((nx - cx) / (l2 || 1)) * r, by = cy + ((ny - cy) / (l2 || 1)) * r;
      d += ` L${ax.toFixed(2)} ${ay.toFixed(2)} Q${cx} ${cy} ${bx.toFixed(2)} ${by.toFixed(2)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L${last[0]} ${last[1]}`;
    return d;
  }

  wirePoints(w) {
    const a = this.pinPos(w.from), b = this.pinPos(w.to);
    if (!a || !b) return null;
    return [a, ...w.points, b];
  }

  renderWires() {
    const seen = new Set();
    for (const w of this.project.wires) {
      const pts = this.wirePoints(w);
      if (!pts) continue;
      seen.add(w.id);
      let el = this.wireEls.get(w.id);
      if (!el) {
        el = svgEl('g', { class: 'wire', 'data-id': w.id });
        el.innerHTML = '<path class="wire-outline"/><path class="wire-core"/><path class="wire-shine"/><path class="wire-flow"/><circle class="wire-end" r="2.2"/><circle class="wire-end" r="2.2"/>';
        this.wireEls.set(w.id, el);
        this.layerWires.appendChild(el);
      }
      const d = this.wirePath(pts);
      for (const p of el.querySelectorAll('path')) p.setAttribute('d', d);
      el.querySelector('.wire-core').setAttribute('stroke', w.color || '#22c55e');
      const ends = el.querySelectorAll('.wire-end');
      ends[0].setAttribute('cx', pts[0][0]); ends[0].setAttribute('cy', pts[0][1]);
      ends[1].setAttribute('cx', pts[pts.length - 1][0]); ends[1].setAttribute('cy', pts[pts.length - 1][1]);
      el.classList.toggle('selected', this.isWireSelected(w.id));
    }
    for (const [id, el] of this.wireEls) if (!seen.has(id)) { el.remove(); this.wireEls.delete(id); }
  }

  updateWiresFor(partIds) {
    for (const w of this.project.wires) {
      if (!partIds.has(w.from.part) && !partIds.has(w.to.part)) continue;
      const el = this.wireEls.get(w.id);
      const pts = this.wirePoints(w);
      if (!el || !pts) continue;
      const d = this.wirePath(pts);
      for (const p of el.querySelectorAll('path')) p.setAttribute('d', d);
      const ends = el.querySelectorAll('.wire-end');
      ends[0].setAttribute('cx', pts[0][0]); ends[0].setAttribute('cy', pts[0][1]);
      ends[1].setAttribute('cx', pts[pts.length - 1][0]); ends[1].setAttribute('cy', pts[pts.length - 1][1]);
    }
  }

  renderOverlay() {
    const ov = this.layerOverlay;
    ov.innerHTML = '';
    const sel = this.selection;
    if (sel && sel.kind === 'part') {
      const part = this.project.parts.find((p) => p.id === sel.id);
      if (part) {
        const [x0, y0, x1, y1] = worldBox(part);
        ov.appendChild(svgEl('rect', { class: 'sel-box', x: x0 - 4, y: y0 - 4, width: x1 - x0 + 8, height: y1 - y0 + 8, rx: 6 }));
        if (this.mode === 'edit' && getDef(part.type).layer !== -1) {
          for (const pin of pinsOf(part)) {
            const [x, y] = toWorld(part, pin.x, pin.y);
            ov.appendChild(svgEl('circle', { class: 'pin-dot', cx: x, cy: y, r: 2.4 }));
          }
        }
      }
    }
    if (sel && sel.kind === 'multi') {
      for (const id of sel.parts) {
        const part = this.project.parts.find((p) => p.id === id);
        if (!part) continue;
        const [x0, y0, x1, y1] = worldBox(part);
        ov.appendChild(svgEl('rect', { class: 'sel-box multi', x: x0 - 4, y: y0 - 4, width: x1 - x0 + 8, height: y1 - y0 + 8, rx: 6 }));
      }
    }
    if (sel && sel.kind === 'wire') {
      const w = this.project.wires.find((x) => x.id === sel.id);
      if (w) {
        w.points.forEach(([x, y], i) => ov.appendChild(svgEl('circle', { class: 'wire-handle', cx: x, cy: y, r: 5, 'data-i': i })));
        const pts = this.wirePoints(w);
        if (pts) {
          for (let i = 0; i < pts.length - 1; i++) {
            const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
            ov.appendChild(svgEl('circle', { class: 'wire-mid', cx: mx, cy: my, r: 3.6, 'data-seg': i }));
          }
        }
      }
    }
    if (this.wiring) {
      const wr = this.wiring;
      const a = this.pinPos(wr.from);
      if (a) {
        const pts = [a, ...wr.points];
        if (wr.cursor) pts.push(wr.cursor);
        ov.appendChild(svgEl('path', { class: 'wire-ghost', d: this.wirePath(pts), stroke: wr.color }));
        ov.appendChild(svgEl('circle', { class: 'wire-start', cx: a[0], cy: a[1], r: 4.5 }));
        for (const [x, y] of wr.points) ov.appendChild(svgEl('circle', { class: 'wire-bend', cx: x, cy: y, r: 2.6 }));
      }
      // show all connectable pins (excluding plain breadboard holes) to make targeting easy
      for (const p of this.pinIndex) {
        if (p.bb) continue;
        ov.appendChild(svgEl('circle', { class: 'pin-target', cx: p.x, cy: p.y, r: 2.6 }));
      }
    }
    if (this.hoverPin) {
      ov.appendChild(svgEl('circle', { class: 'pin-hover', cx: this.hoverPin.x, cy: this.hoverPin.y, r: 5 }));
      if (this.hoverPin.bb) this.highlightStrip(this.hoverPin);
    }
  }

  highlightStrip(hp) {
    // highlight the breadboard strip / rail that the hovered hole belongs to
    const part = this.project.parts.find((p) => p.id === hp.part);
    const def = getDef(part.type);
    if (!def.internal) return;
    const group = def.internal.find((g) => g.includes(hp.pin));
    if (!group) return;
    for (const pid of group) {
      const pin = pinsOf(part).find((x) => x.id === pid);
      if (!pin) continue;
      const [x, y] = toWorld(part, pin.x, pin.y);
      this.layerOverlay.appendChild(svgEl('circle', { class: 'strip-dot', cx: x, cy: y, r: 2.6 }));
    }
  }

  // ------------------------------------------------------------------ pins / hit testing
  buildPinIndex() {
    const idx = [];
    const grid = new Map();
    for (const part of this.project.parts) {
      const def = getDef(part.type);
      if (!def) continue;
      for (const pin of pinsOf(part)) {
        const [x, y] = toWorld(part, pin.x, pin.y);
        const e = { part: part.id, pin: pin.id, x, y, bb: !!def.connectorOnly, label: pin.label || pin.id, partName: def.name };
        idx.push(e);
        const k = Math.floor(x / 20) + ',' + Math.floor(y / 20);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(e);
      }
    }
    this.pinIndex = idx;
    this.pinGrid = grid;
  }

  pinAt(wx, wy, radiusPx = 16, exclude = null) {
    const r = Math.max(4, radiusPx / this.view.z);
    const r2 = Math.min(r, 14);
    let best = null, bd = Infinity;
    const cx = Math.floor(wx / 20), cy = Math.floor(wy / 20);
    const span = Math.ceil(r2 / 20);
    for (let i = cx - span; i <= cx + span; i++) {
      for (let j = cy - span; j <= cy + span; j++) {
        const list = this.pinGrid.get(i + ',' + j);
        if (!list) continue;
        for (const p of list) {
          if (exclude && exclude(p)) continue;
          let d = Math.hypot(p.x - wx, p.y - wy);
          if (p.bb) d += 1.5; // prefer component pins over breadboard holes underneath
          if (d < r2 && d < bd) { bd = d; best = p; }
        }
      }
    }
    return best;
  }

  partAt(wx, wy) {
    const parts = this.project.parts;
    const tops = parts.filter((p) => getDef(p.type) && getDef(p.type).layer !== -1);
    const bottoms = parts.filter((p) => getDef(p.type) && getDef(p.type).layer === -1);
    for (const list of [tops, bottoms]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        const [x0, y0, x1, y1] = worldBox(p);
        const pad = 2 / this.view.z;
        if (wx >= x0 - pad && wx <= x1 + pad && wy >= y0 - pad && wy <= y1 + pad) return p;
      }
    }
    return null;
  }

  wireAt(wx, wy) {
    const tol = Math.max(3, 9 / this.view.z);
    let best = null, bd = tol;
    for (const w of this.project.wires) {
      const pts = this.wirePoints(w);
      if (!pts) continue;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = segDist(wx, wy, pts[i], pts[i + 1]);
        if (d < bd) { bd = d; best = w; }
      }
    }
    return best;
  }

  hit(wx, wy, forWiring = false) {
    const sel = this.selection;
    if (sel && sel.kind === 'wire') {
      const w = this.project.wires.find((x) => x.id === sel.id);
      if (w) {
        const tol = Math.max(5, 14 / this.view.z);
        for (let i = 0; i < w.points.length; i++) {
          if (Math.hypot(w.points[i][0] - wx, w.points[i][1] - wy) < tol) return { kind: 'handle', wire: w, i };
        }
        const pts = this.wirePoints(w);
        if (pts) for (let i = 0; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
          if (Math.hypot(mx - wx, my - wy) < tol) return { kind: 'mid', wire: w, seg: i };
        }
      }
    }
    const pin = this.pinAt(wx, wy, forWiring ? 22 : 15);
    const part = this.partAt(wx, wy);
    const wire = this.wireAt(wx, wy);
    if (wire && !forWiring && (!pin || pin.bb)) {
      // a wire lying above a breadboard / part is the more likely target
      if (!part || getDef(part.type).layer === -1 || !this.insideNonBB(part, wx, wy)) return { kind: 'wire', wire };
    }
    if (pin) {
      // only treat as pin hit if it is a breadboard hole or the touch is close to the pin
      return { kind: 'pin', pin, part };
    }
    if (wire) return { kind: 'wire', wire };
    if (part) return { kind: 'part', part };
    return { kind: 'none' };
  }

  insideNonBB(part, wx, wy) {
    const [x0, y0, x1, y1] = worldBox(part);
    return wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1;
  }

  // ------------------------------------------------------------------ pointer handling
  onDown(e) {
    e.preventDefault();
    this.svg.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      this.cancelLongPress();
      if (this.down && this.down.dragging === 'part') this.finishPartDrag(true); // keep the move (saved, undoable)
      if (this.down && this.down.simPointer) this.releaseSimPointer(this.down.simPointer);
      this.box.cancel();
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, view: { ...this.view } };
      this.down = null;
      return;
    }
    if (this.pointers.size > 2) return;
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    // second press of a double tap: sliding it zooms (Google Maps)
    const first = this.taps.second(e.clientX, e.clientY);
    if (this.mode === 'sim') {
      this.simDown(e, wx, wy);
      const sp = this.down.simPointer;
      if (first && !sp) this.down.zoomCand = first;
      return;
    }
    const hit = this.hit(wx, wy, !!this.wiring);
    const d = { id: e.pointerId, sx: e.clientX, sy: e.clientY, wx, wy, hit, t: performance.now(), dragging: null, view: { ...this.view }, zoomCand: first, mouse: e.pointerType === 'mouse', button: e.button, boxKey: e.shiftKey || e.ctrlKey || e.metaKey };
    this.down = d;
    if (hit.kind === 'pin' && !this.wiring) this.showTip(hit.pin, e.clientX, e.clientY);
    // a mouse: the right button opens the menu (contextmenu), the right / middle button drags the view
    if (d.mouse && d.button !== 0) return;
    if (hit.kind === 'part' || hit.kind === 'wire' || (hit.kind === 'pin' && hit.part && !getDef(hit.part.type).connectorOnly)) {
      if (this.selectTool && this.boxable(hit)) return;
      this.longPress = setTimeout(() => {
        if (!this.down || this.down.dragging) return;
        Native.vibrate(18);
        const target = hit.kind === 'wire' ? { kind: 'wire', id: hit.wire.id } : { kind: 'part', id: (hit.part || {}).id };
        if (!target.id) return;
        this.select(target);
        this.down = null;
        this.ed.contextMenu && this.ed.contextMenu(target, e.clientX, e.clientY);
      }, 520);
    } else if (hit.kind === 'none' && !this.wiring && !first && !d.mouse) {
      // press and hold on empty space, then drag: selection box
      this.longPress = setTimeout(() => {
        if (this.down !== d || d.dragging) return;
        d.boxArmed = true;
        this.box.start(d.sx, d.sy);
        Native.vibrate(14);
      }, 380);
    }
  }

  /** Right click on a part or wire (a PC mouse): its menu at once, like a long press on a phone. */
  mouseMenu(e) {
    if (this.mode !== 'edit' || this.wiring || !this.ed.contextMenu || (this.down && this.down.dragging)) return;
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    const hit = this.hit(wx, wy, false);
    const target = hit.kind === 'wire' ? { kind: 'wire', id: hit.wire.id } : hit.part ? { kind: 'part', id: hit.part.id } : null;
    if (!target) return;
    this.cancelLongPress();
    this.down = null;
    this.select(target);
    this.ed.contextMenu(target, e.clientX, e.clientY);
  }

  /** Can a drag that starts on this hit draw a selection box (with the Select tool on)? */
  boxable(hit) {
    if (hit.kind === 'none') return true;
    if (hit.kind === 'pin') return hit.pin.bb && !(hit.part && this.isPartSelected(hit.part.id) && getDef(hit.part.type).layer !== -1);
    if (hit.kind === 'part') return getDef(hit.part.type).layer === -1 && !this.isPartSelected(hit.part.id);
    return false;
  }

  cancelLongPress() { if (this.longPress) { clearTimeout(this.longPress); this.longPress = null; } }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && this.mode === 'edit') this.hover(e);
      return;
    }
    e.preventDefault();
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const p = this.pinch;
      const z = Math.max(0.12, Math.min(10, p.view.z * (d / (p.d || 1))));
      const r = this.svg.getBoundingClientRect();
      const k = z / p.view.z;
      const px = p.mx - r.left, py = p.my - r.top;
      this.autoFit = false;
      this.view = { z, x: px - (px - p.view.x) * k + (mx - p.mx), y: py - (py - p.view.y) * k + (my - p.my) };
      this.applyView();
      return;
    }
    const d = this.down;
    if (!d || d.id !== e.pointerId) {
      if (this.wiring) this.updateWiringCursor(e);
      return;
    }
    const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
    if (d.zoomCand && !d.dragging && dist > 7) this.startSlideZoom(d);
    if (d.dragging === 'zoom') {
      const z = Math.max(0.12, Math.min(10, d.view.z * slideZoomFactor(e.clientY - d.sy)));
      const r = this.svg.getBoundingClientRect();
      const k = z / d.view.z;
      const px = d.sx - r.left, py = d.sy - r.top;
      this.view = { z, x: px - (px - d.view.x) * k, y: py - (py - d.view.y) * k };
      this.applyView();
      return;
    }
    if (d.simPointer) { this.simMove(e, d); return; }
    if (!d.dragging && dist > (e.pointerType === 'mouse' ? 3 : 7)) {
      this.cancelLongPress();
      const hit = d.hit;
      if (this.wiring || (d.mouse && d.button !== 0)) d.dragging = 'pan';
      else if (this.mode === 'edit' && (d.boxArmed || (this.selectTool && this.boxable(hit)) || (d.mouse && d.button === 0 && hit.kind === 'none' && d.boxKey))) {
        d.dragging = 'box';
        if (!this.box.active) this.box.start(d.sx, d.sy);
        this.hideTip();
      } else if (hit.kind === 'pin') {
        // dragging from a pin draws a wire
        this.startWiring({ part: hit.pin.part, pin: hit.pin.pin });
        d.dragging = 'wire';
      } else if (hit.kind === 'handle') d.dragging = 'handle';
      else if (hit.kind === 'mid') {
        hit.wire.points.splice(hit.seg, 0, [d.wx, d.wy]);
        d.hit = { kind: 'handle', wire: hit.wire, i: hit.seg };
        d.dragging = 'handle';
      } else if (hit.kind === 'part') this.startPartDrag(hit.part, d);
      else d.dragging = 'pan';
    }
    if (!d.dragging) return;
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    if (d.dragging === 'pan') {
      this.autoFit = false;
      this.view = { ...this.view, x: d.view.x + (e.clientX - d.sx), y: d.view.y + (e.clientY - d.sy) };
      this.applyView();
      if (this.wiring) this.updateWiringCursor(e);
    } else if (d.dragging === 'box') {
      this.box.update(e.clientX, e.clientY);
    } else if (d.dragging === 'part') {
      this.dragPart(d, wx, wy);
    } else if (d.dragging === 'wire') {
      const target = this.pinAt(wx, wy, 22, (p) => p.part === this.wiring.from.part && p.pin === this.wiring.from.pin);
      this.wiring.cursor = target ? [target.x, target.y] : [wx, wy];
      this.hoverPin = target;
      if (target) this.showTip(target, e.clientX, e.clientY); else this.hideTip();
      this.renderOverlay();
      this.autoScroll(e);
    } else if (d.dragging === 'handle') {
      const g = 5;
      d.hit.wire.points[d.hit.i] = [Math.round(wx / g) * g, Math.round(wy / g) * g];
      this.renderWires();
      this.renderOverlay();
    }
  }

  /** The second press of a double tap started to slide: zoom instead, and undo what the first tap began. */
  startSlideZoom(d) {
    this.cancelLongPress();
    this.hideTip();
    this.box.cancel();
    const ex = d.zoomCand.extra || {};
    if (this.wiring && ex.wiringStarted) this.cancelWiring();
    else if (this.wiring && ex.bend) { this.wiring.points.pop(); this.renderOverlay(); }
    d.simPointer = null;
    d.dragging = 'zoom';
    d.view = { ...this.view };
    this.autoFit = false;
  }

  onUp(e, cancelled = false) {
    this.pointers.delete(e.pointerId);
    try { this.svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    this.cancelLongPress();
    const d = this.down;
    if (!d || d.id !== e.pointerId) return;
    this.down = null;
    if (d.dragging === 'zoom') return;
    const still = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= 7;
    if (this.mode === 'sim') {
      if (d.simPointer) this.releaseSimPointer(d.simPointer);
      if (cancelled || !still || d.dragging) return;
      if (d.zoomCand) { this.taps.clear(); this.zoomAt(2, e.clientX, e.clientY); return; }
      if (!d.simPointer) this.taps.tap(e.clientX, e.clientY);
      return;
    }
    if (cancelled) { if (d.dragging === 'part') this.finishPartDrag(true); if (d.dragging === 'box' || d.boxArmed) this.box.cancel(); this.hideTip(); return; }
    if (d.mouse && d.button !== 0 && !d.dragging) return; // a right / middle click is not a tap
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    if (!d.dragging) {
      if (d.boxArmed) this.box.cancel();
      const wasWiring = this.wiring, nPts = wasWiring ? wasWiring.points.length : 0;
      this.onTap(d, wx, wy, e);
      if (d.zoomCand) this.taps.clear();
      else this.taps.tap(e.clientX, e.clientY, { wiringStarted: !wasWiring && !!this.wiring, bend: !!wasWiring && this.wiring === wasWiring && wasWiring.points.length > nPts });
      return;
    }
    if (d.dragging === 'box') this.boxSelect(this.box.end());
    else if (d.dragging === 'part') this.finishPartDrag(true);
    else if (d.dragging === 'wire') {
      const target = this.pinAt(wx, wy, 22, (p) => p.part === this.wiring.from.part && p.pin === this.wiring.from.pin);
      if (target) this.finishWiring(target);
      else {
        // released in empty space: keep wiring in tap mode with a bend point
        const g = 5;
        this.wiring.points.push([Math.round(wx / g) * g, Math.round(wy / g) * g]);
        this.wiring.cursor = null;
        this.renderOverlay();
        this.ed.wiringChanged && this.ed.wiringChanged(this.wiring);
      }
      this.hideTip();
    } else if (d.dragging === 'handle') {
      this.ed.commit('Move wire point');
    }
  }

  onTap(d, wx, wy, e) {
    const hit = this.hit(wx, wy, !!this.wiring);
    if (this.wiring) {
      if (hit.kind === 'pin' && !(hit.pin.part === this.wiring.from.part && hit.pin.pin === this.wiring.from.pin)) {
        this.finishWiring(hit.pin);
      } else if (hit.kind === 'pin') {
        this.cancelWiring();
      } else {
        const g = 5;
        this.wiring.points.push([Math.round(wx / g) * g, Math.round(wy / g) * g]);
        this.wiring.cursor = null;
        Native.vibrate(5);
        this.renderOverlay();
        this.ed.wiringChanged && this.ed.wiringChanged(this.wiring);
      }
      return;
    }
    this.hideTip();
    const now = performance.now();
    const dbl = this.lastTap && now - this.lastTap.t < 320 && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < 25;
    this.lastTap = { t: now, x: e.clientX, y: e.clientY };
    if (this.selectTool && hit.kind !== 'none' && !this.boxable(hit)) {
      // Select tool: a tap adds the object to the selection, or removes it again
      const part = hit.part || (hit.pin && this.project.parts.find((p) => p.id === hit.pin.part));
      if (hit.wire) this.toggleInSelection([], [hit.wire.id]);
      else if (part) this.toggleInSelection([part.id], []);
      return;
    }
    if (hit.kind === 'pin') {
      // tapping a pin of the selected part / any pin starts a wire
      this.startWiring({ part: hit.pin.part, pin: hit.pin.pin });
      Native.vibrate(8);
      return;
    }
    if (hit.kind === 'part') {
      if (dbl && this.selection && this.selection.id === hit.part.id) { this.ed.openProps && this.ed.openProps(hit.part); return; }
      this.select({ kind: 'part', id: hit.part.id });
      return;
    }
    if (hit.kind === 'wire' || hit.kind === 'handle' || hit.kind === 'mid') {
      const w = hit.wire;
      if (hit.kind === 'handle' && dbl) {
        w.points.splice(hit.i, 1);
        this.ed.commit('Remove wire point');
        return;
      }
      this.select({ kind: 'wire', id: w.id });
      return;
    }
    // double tap on empty space zooms in
    if (d.zoomCand) { this.zoomAt(2, e.clientX, e.clientY); return; }
    this.select(null);
  }

  // ------------------------------------------------------------------ selection box / multi selection
  /** Select what the box caught: window = completely inside, crossing = touching. */
  boxSelect(res) {
    if (!res) return;
    const { rect, mode } = res;
    const parts = [], wires = [];
    for (const p of this.project.parts) {
      const def = getDef(p.type);
      if (!def) continue;
      const [x0, y0, x1, y1] = worldBox(p);
      const [sx0, sy0] = this.worldToScreen(x0, y0), [sx1, sy1] = this.worldToScreen(x1, y1);
      // a breadboard is only taken when it lies completely inside — a crossing box over the parts
      // plugged into it should not grab the board underneath
      if (boxInSelection(rect, { x0: sx0, y0: sy0, x1: sx1, y1: sy1 }, def.layer === -1 ? 'window' : mode)) parts.push(p.id);
    }
    for (const w of this.project.wires) {
      const pts = this.wirePoints(w);
      if (pts && polylineInSelection(rect, pts.map(([x, y]) => this.worldToScreen(x, y)), mode)) wires.push(w.id);
    }
    // with the Select tool every new box adds to the selection, as in AutoCAD
    if (this.selectTool) { const cur = this.selectedIds(); parts.unshift(...cur.parts.filter((id) => !parts.includes(id))); wires.unshift(...cur.wires.filter((id) => !wires.includes(id))); }
    this.select(makeSelection(parts, wires));
    Native.vibrate(8);
  }

  /** {parts:[ids], wires:[ids]} of the current selection. */
  selectedIds() {
    const s = this.selection;
    if (!s) return { parts: [], wires: [] };
    if (s.kind === 'multi') return { parts: [...s.parts], wires: [...s.wires] };
    return s.kind === 'part' ? { parts: [s.id], wires: [] } : { parts: [], wires: [s.id] };
  }

  toggleInSelection(partIds, wireIds) {
    const cur = this.selectedIds();
    const flip = (arr, ids) => { for (const id of ids) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); } };
    flip(cur.parts, partIds); flip(cur.wires, wireIds);
    this.select(makeSelection(cur.parts, cur.wires));
    Native.vibrate(6);
  }

  isPartSelected(id) { const s = this.selection; return !!s && (s.kind === 'multi' ? s.parts.includes(id) : s.kind === 'part' && s.id === id); }
  isWireSelected(id) { const s = this.selection; return !!s && (s.kind === 'multi' ? s.wires.includes(id) : s.kind === 'wire' && s.id === id); }

  setSelectTool(on) {
    this.selectTool = on;
    this.svg.classList.toggle('select-tool', on);
    if (on) this.cancelWiring();
  }


  hover(e) {
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    if (this.wiring) { this.updateWiringCursor(e); return; }
    const pin = this.pinAt(wx, wy, 12);
    if ((pin && pin.part + pin.pin) !== (this.hoverPin && this.hoverPin.part + this.hoverPin.pin)) {
      this.hoverPin = pin;
      this.renderOverlay();
      if (pin) this.showTip(pin, e.clientX, e.clientY); else this.hideTip();
    }
    this.svg.style.cursor = pin ? 'crosshair' : 'default';
  }

  autoScroll(e) {
    const r = this.svg.getBoundingClientRect();
    const m = 36;
    let dx = 0, dy = 0;
    if (e.clientX < r.left + m) dx = 8; else if (e.clientX > r.right - m) dx = -8;
    if (e.clientY < r.top + m) dy = 8; else if (e.clientY > r.bottom - m) dy = -8;
    this.autoFit = false;
    if (dx || dy) { this.view.x += dx; this.view.y += dy; this.applyView(); }
  }

  // ------------------------------------------------------------------ tips
  showTip(pin, cx, cy) {
    const r = this.host.getBoundingClientRect();
    this.tip.innerHTML = `<b>${escapeHtml(pin.label)}</b><span>${escapeHtml(pin.bb ? 'Breadboard ' + pin.pin : pin.partName)}</span>`;
    this.tip.style.left = Math.max(60, Math.min(r.width - 60, cx - r.left)) + 'px';
    this.tip.style.top = Math.max(30, cy - r.top - 58) + 'px';
    this.tip.classList.add('show');
  }
  hideTip() { this.tip.classList.remove('show'); if (this.hoverPin) { this.hoverPin = null; this.renderOverlay(); } }

  // ------------------------------------------------------------------ wiring
  startWiring(from) {
    const pinName = from.pin;
    const color = POWER_RE.test(pinName) ? '#ef4444' : GND_RE.test(pinName) ? '#111827' : WIRE_COLORS[(this.project.wires.length) % 7];
    this.wiring = { from, points: [], cursor: null, color };
    this.select(null, true);
    this.renderOverlay();
    this.ed.wiringChanged && this.ed.wiringChanged(this.wiring);
  }

  updateWiringCursor(e) {
    if (!this.wiring || e.pointerType !== 'mouse') return;
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    const target = this.pinAt(wx, wy, 14);
    this.wiring.cursor = target ? [target.x, target.y] : [wx, wy];
    this.hoverPin = target;
    this.renderOverlay();
  }

  finishWiring(target) {
    const wr = this.wiring;
    this.wiring = null;
    this.hoverPin = null;
    const to = { part: target.part, pin: target.pin };
    if (to.part === wr.from.part && to.pin === wr.from.pin) { this.renderOverlay(); this.ed.wiringChanged && this.ed.wiringChanged(null); return; }
    let color = wr.color;
    if (POWER_RE.test(to.pin) && !GND_RE.test(wr.from.pin)) color = '#ef4444';
    if (GND_RE.test(to.pin) && !POWER_RE.test(wr.from.pin)) color = '#111827';
    const w = { id: newId('w'), from: wr.from, to, points: wr.points, color };
    this.project.wires.push(w);
    Native.vibrate(14);
    this.ed.wiringChanged && this.ed.wiringChanged(null);
    this.ed.commit('Add wire');
    this.select({ kind: 'wire', id: w.id }, true);
  }

  cancelWiring() {
    this.wiring = null;
    this.hoverPin = null;
    this.renderOverlay();
    this.ed.wiringChanged && this.ed.wiringChanged(null);
  }

  undoWirePoint() {
    if (!this.wiring) return;
    if (this.wiring.points.length) this.wiring.points.pop();
    else { this.cancelWiring(); return; }
    this.renderOverlay();
  }

  // ------------------------------------------------------------------ part dragging
  startPartDrag(part, d) {
    d.dragging = 'part';
    // dragging one part of a multi selection moves the whole selection
    const multi = this.selection && this.selection.kind === 'multi' && this.selection.parts.includes(part.id);
    if (!multi) this.select({ kind: 'part', id: part.id }, true);
    const roots = multi ? this.selection.parts.map((id) => this.project.parts.find((p) => p.id === id)).filter(Boolean) : [part];
    const group = [part, ...roots.filter((p) => p !== part)];
    let plugged = null;
    for (const root of roots) {
      const def = getDef(root.type);
      if (!def.socket) continue;
      // carry parts that are plugged into this one (components on a breadboard)
      plugged = plugged || pluggedPins(this.project);
      for (const other of this.project.parts) {
        if (group.includes(other) || getDef(other.type).layer === -1) continue;
        if (getDef(other.type).socket && getDef(other.type).layer !== -1 && def.layer !== -1) continue;
        const pins = pinsOf(other);
        let pluggedHere = false;
        for (const pin of pins) {
          const key = other.id + ':' + pin.id;
          if (!plugged.has(key)) continue;
          const [x, y] = toWorld(other, pin.x, pin.y);
          if (this.pinIndex.some((p) => p.part === root.id && Math.abs(p.x - x) < 1 && Math.abs(p.y - y) < 1)) { pluggedHere = true; break; }
        }
        if (pluggedHere) group.push(other);
      }
    }
    const ids = new Set(group.map((p) => p.id));
    d.group = group.map((p) => ({ part: p, x: p.x, y: p.y }));
    d.groupIds = ids;
    d.wireMoves = this.project.wires.filter((w) => ids.has(w.from.part) && ids.has(w.to.part)).map((w) => ({ w, pts: w.points.map((p) => [...p]) }));
    d.snapTargets = this.pinIndex.filter((p) => !ids.has(p.part));
    for (const g0 of d.group) { const el = this.partEls.get(g0.part.id); if (el) el.classList.add('dragging'); }
    Native.vibrate(10);
  }

  dragPart(d, wx, wy) {
    const main = d.group[0];
    let dx = wx - d.wx, dy = wy - d.wy;
    const part = main.part;
    const nx = main.x + dx, ny = main.y + dy;
    // magnetic snap: bring one of the pins onto a nearby socket / hole
    let snapped = false;
    const def = getDef(part.type);
    if (!def.connectorOnly) {
      const pins = pinsOf(part);
      let best = null, bd = 7;
      const tmp = { ...part, x: nx, y: ny };
      const targets = d.snapTargets;
      for (const pin of pins) {
        const [px, py] = toWorld(tmp, pin.x, pin.y);
        const cand = nearestIn(targets, px, py, bd);
        if (cand && cand.d < bd) { bd = cand.d; best = { dx: cand.p.x - px, dy: cand.p.y - py }; }
      }
      if (best) { dx += best.dx; dy += best.dy; snapped = true; }
    }
    if (!snapped) {
      const gx = Math.round((main.x + dx) / PITCH) * PITCH, gy = Math.round((main.y + dy) / PITCH) * PITCH;
      dx = gx - main.x; dy = gy - main.y;
    }
    for (const g0 of d.group) {
      g0.part.x = g0.x + dx;
      g0.part.y = g0.y + dy;
      const el = this.partEls.get(g0.part.id);
      if (el) el.setAttribute('transform', partTransform(g0.part));
    }
    for (const wm of d.wireMoves) wm.w.points = wm.pts.map(([x, y]) => [x + dx, y + dy]);
    this.updateWiresFor(d.groupIds);
    if (snapped !== d.snapped) { d.snapped = snapped; if (snapped) Native.vibrate(6); }
    this.renderOverlay();
  }

  finishPartDrag(commit) {
    for (const el of this.partEls.values()) el.classList.remove('dragging');
    if (commit) this.ed.commit('Move part');
    else this.render();
  }

  // ------------------------------------------------------------------ selection
  select(sel, silent = false) {
    this.selection = sel;
    this.renderWires();
    this.renderOverlay();
    if (this.ed.selectionChanged) this.ed.selectionChanged(sel);
  }

  // ------------------------------------------------------------------ simulation mode
  setMode(mode) {
    this.mode = mode;
    this.cancelWiring();
    this.svg.classList.toggle('sim-mode', mode === 'sim');
    if (mode === 'edit') {
      for (const [id, el] of this.partEls) {
        // re-render to reset visuals
        const part = this.project.parts.find((p) => p.id === id);
        if (!part) continue;
        el._key = null;
      }
      this.render();
      for (const el of this.wireEls.values()) { el.classList.remove('active'); el.style.removeProperty('--flow'); }
    }
    this.renderOverlay();
  }

  simDown(e, wx, wy) {
    const part = this.partAt(wx, wy);
    this.down = { id: e.pointerId, sx: e.clientX, sy: e.clientY, wx, wy, view: { ...this.view }, dragging: null, hit: { kind: part ? 'part' : 'none', part } };
    if (!part) return;
    const def = getDef(part.type);
    const it = def.interact;
    const eng = this.ed.engine;
    const rt = eng && eng.parts.get(part.id);
    if (!rt) return;
    const [lx, ly] = toLocal(part, wx, wy);
    if (it === 'press') {
      eng.input(part.id, 'press', true);
      Native.vibrate(10);
      this.down.simPointer = { part, rt, kind: 'press' };
    } else if (it === 'keypad' && def.keyAt) {
      const key = def.keyAt(lx, ly, partProps(part));
      if (key) { eng.input(part.id, 'key', key, true); Native.vibrate(10); this.down.simPointer = { part, rt, kind: 'key', key }; }
    } else if (it === 'knob' || it === 'slider' || it === 'joystick' || it === 'encoder') {
      this.down.simPointer = { part, rt, kind: it, start: rt.visual ? { ...rt.visual } : {}, lx, ly, moved: false };
      if (it === 'joystick' && def.knobHit && !def.knobHit(lx, ly)) {
        // tap on joystick body: press its button
      }
    } else if (it === 'toggle') {
      this.down.simPointer = { part, rt, kind: 'toggle' };
    } else {
      this.down.simPointer = { part, rt, kind: 'tap' };
    }
  }

  simMove(e, d) {
    const sp = d.simPointer;
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    const [lx, ly] = toLocal(sp.part, wx, wy);
    const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6;
    if (moved) sp.moved = true;
    if (sp.kind === 'knob') {
      const delta = ((e.clientX - d.sx) - (e.clientY - d.sy)) / 180;
      this.ed.engine && this.ed.engine.input(sp.part.id, 'knob', Math.max(0, Math.min(1, (sp.start.pos ?? 0.5) + delta)));
    } else if (sp.kind === 'slider') {
      const def = getDef(sp.part.type);
      const len = def.sliderLength || 60;
      this.ed.engine && this.ed.engine.input(sp.part.id, 'knob', Math.max(0, Math.min(1, lx / len)));
    } else if (sp.kind === 'joystick') {
      const def = getDef(sp.part.type);
      const c = def.knobCenter || [0, 0];
      const R = def.knobRange || 14;
      const x = Math.max(-1, Math.min(1, (lx - c[0]) / R)), y = Math.max(-1, Math.min(1, (ly - c[1]) / R));
      this.ed.engine && this.ed.engine.input(sp.part.id, 'xy', [x, y]);
    } else if (sp.kind === 'encoder') {
      const step = Math.round(((e.clientX - d.sx) - (e.clientY - d.sy)) / 24);
      if (step !== (sp.lastStep || 0)) {
        const diff = step - (sp.lastStep || 0);
        sp.lastStep = step;
        for (let i = 0; i < Math.abs(diff); i++) this.ed.engine && this.ed.engine.input(sp.part.id, 'rotate', Math.sign(diff));
        Native.vibrate(4);
      }
    } else if (!sp.moved) {
      return;
    } else if (sp.kind === 'tap' || sp.kind === 'toggle') {
      // convert to pan
      d.simPointer = null;
      d.dragging = 'pan';
    }
    if (d.dragging === 'pan') {
      this.autoFit = false;
      this.view = { ...this.view, x: d.view.x + (e.clientX - d.sx), y: d.view.y + (e.clientY - d.sy) };
      this.applyView();
    }
  }

  releaseSimPointer(sp) {
    if (sp.kind === 'press') this.ed.engine && this.ed.engine.input(sp.part.id, 'press', false);
    else if (sp.kind === 'key') this.ed.engine && this.ed.engine.input(sp.part.id, 'key', sp.key, false);
    else if (sp.kind === 'toggle') { this.ed.engine && this.ed.engine.input(sp.part.id, 'toggle'); Native.vibrate(10); }
    else if (sp.kind === 'joystick') {
      if (!sp.moved) this.ed.engine && this.ed.engine.input(sp.part.id, 'press', true), setTimeout(() => this.ed.engine && this.ed.engine.input(sp.part.id, 'press', false), 180);
      this.ed.engine && this.ed.engine.input(sp.part.id, 'xy', [0, 0]);
    } else if (sp.kind === 'encoder') {
      if (!sp.moved) { this.ed.engine && this.ed.engine.input(sp.part.id, 'press', true); setTimeout(() => this.ed.engine && this.ed.engine.input(sp.part.id, 'press', false), 150); }
    } else if (sp.kind === 'tap' || (sp.kind === 'knob' && !sp.moved)) {
      this.ed.openSimControls && this.ed.openSimControls(sp.part);
    }
  }

  /**
   * Parts that burnt: a flash, a scorch mark and a few seconds of smoke (once, not for ever), at the
   * part's own spot (def.burnAt) or, for a board, at each burnt pin.
   */
  burnFrame() {
    const eng = this.ed.engine;
    if (!eng) return;
    for (const [id, el] of this.partEls) {
      const rt = eng.parts.get(id);
      const v = rt && rt.visual;
      if (!v || !(v.burnt || (v.burnAt && v.burnAt.length))) continue;
      const nDead = (v.burnAt || []).length;
      let fx = el._fx;
      if (fx && fx.n === nDead && fx.done) continue;
      const now = performance.now();
      if (!fx || fx.n !== nDead) {
        if (fx) fx.g.remove();
        const def = el._def;
        const box = typeof def.box === 'function' ? def.box(el._props) : def.box;
        const spots = (v.burnAt && v.burnAt.length ? v.burnAt : [def.burnAt || [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]]);
        const r = v.burnAt && v.burnAt.length ? 9 : Math.max(7, Math.min(26, Math.min(box[2] - box[0], box[3] - box[1]) / 3));
        const g = svgEl('g', { class: 'burn-fx', 'pointer-events': 'none' });
        let html = '';
        for (const [x, y] of spots) {
          html += `<circle class="burn-flash" cx="${x}" cy="${y}" r="${r * 1.6}" fill="#fff6d0"/>` +
            `<ellipse class="burn-scorch" cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.8}" fill="url(#scorch)"/>` +
            `<g class="burn-smoke">${[0, 1, 2].map((k) => `<circle class="smoke-puff" cx="${x + (k - 1) * 2}" cy="${y - 2}" r="${3 + k}" fill="#9aa0a6" style="animation-delay:${k * 0.45}s" filter="url(#smoke)"/>`).join('')}</g>`;
        }
        g.innerHTML = html;
        el.appendChild(g);
        fx = el._fx = { g, t0: now, n: nDead, done: false };
      }
      // smoke for about six seconds, then only the scorch mark stays
      if (!fx.done && now - fx.t0 > 6000) {
        fx.done = true;
        for (const sm of fx.g.querySelectorAll('.burn-smoke, .burn-flash')) sm.remove();
      }
    }
  }

  /** Called every animation frame while simulating. */
  frame(dt) {
    const eng = this.ed.engine;
    if (!eng) return;
    for (const [id, el] of this.partEls) {
      const def = el._def;
      if (!def.update) continue;
      const rt = eng.parts.get(id);
      if (!rt || !rt.visual) continue;
      try { def.update(el, rt.visual, el._props, dt); } catch (err) { /* keep animating others */ }
    }
    this.burnFrame();
    // wire current flow
    if (!this.ed.settings.flow) return;
    const act = eng.nodeActivity;
    if (!act) return;
    this.flowPhase += dt;
    for (const w of this.project.wires) {
      const el = this.wireEls.get(w.id);
      if (!el) continue;
      const node = eng.nodeOf(w.from.part, w.from.pin);
      const i = node >= 0 ? act[node] || 0 : 0;
      const on = i > 0.0002;
      if (el._on !== on) { el._on = on; el.classList.toggle('active', on); }
      if (!on) continue;
      const speed = 14 + 22 * Math.log10(1 + i * 1000);
      const dir = eng.flowDirection ? eng.flowDirection(w) : 1;
      el._off = ((el._off || 0) - dir * speed * dt) % 1000;
      const fl = el.querySelector('.wire-flow');
      fl.style.strokeDashoffset = el._off.toFixed(1);
      fl.style.opacity = Math.min(1, 0.45 + Math.log10(1 + i * 1000) / 3).toFixed(2);
    }
  }
}

/** Selection object for lists of part / wire ids: null, a single part or wire, or 'multi'. */
export function makeSelection(parts, wires) {
  if (parts.length + wires.length === 0) return null;
  if (parts.length + wires.length === 1) return parts.length ? { kind: 'part', id: parts[0] } : { kind: 'wire', id: wires[0] };
  return { kind: 'multi', parts, wires };
}

function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function nearestIn(list, x, y, max) {
  let best = null, bd = max;
  for (const p of list) {
    const dx = p.x - x;
    if (dx > max || dx < -max) continue;
    const dy = p.y - y;
    if (dy > max || dy < -max) continue;
    const d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Name pill on the left side of a board (reading upwards) when the circuit has several boards. */
function boardTag(def, name) {
  const box = typeof def.box === 'function' ? def.box({}) : def.box;
  const t = String(name).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const w = Math.min(box[3] - box[1] - 10, Math.max(50, t.length * 8.6 + 24));
  const cx = box[0] - 14, cy = (box[1] + box[3]) / 2;
  return `<g class="board-tag" pointer-events="none" transform="rotate(-90 ${cx} ${cy})"><rect x="${cx - w / 2}" y="${cy - 10}" width="${w}" height="20" rx="10" fill="#0e7490" stroke="#67e8f9" stroke-width="1"/><text x="${cx}" y="${cy + 4.5}" font-size="12" font-weight="800" fill="#ecfeff" text-anchor="middle" font-family="Inter, sans-serif">${t}</text></g>`;
}
