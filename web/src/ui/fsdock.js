// The full-screen menu of the Arduino editor, the Raspberry Pi lab and the PLC lab: a round ☰ / ✕ button that opens and
// closes the menus, and the frosted-glass bar that opens beside it. Drag the button (or the empty edge of the bar) and it
// stays wherever you leave it — the spot is remembered per screen. The button never moves by itself.
const HS = 36;       // the round ☰ button
const GAP = 6;       // keep this far from the screen edge (plus the camera cut-out)
const MOVE = 7;      // pixels the finger must travel before a tap becomes a drag

export class FsDock {
  /**
   * @param {object} o  root: screen element, bar: the .fs-bar, handle: the ☰ button, key: settings key,
   *   orient: 'col' | 'row' (how the buttons of the bar run), home: {fx, fy} (or a function returning it) first position
   *   of the button as a fraction of the free space, settings/save: persistence, toggle(): open / close the menus
   */
  constructor(o) {
    Object.assign(this, o);
    this.row = o.orient === 'row';
    this.bar.classList.add('fs-dock', this.row ? 'dock-row' : 'dock-col');
    this.handle.classList.add('fs-handle');
    this.root.append(this.handle);
    this.probe = document.createElement('div');
    this.probe.className = 'fs-probe';
    this.root.append(this.probe);
    for (const el of [this.handle, this.bar]) {
      el.addEventListener('pointerdown', (e) => this.down(e, el));
      el.addEventListener('pointermove', (e) => this.move(e));
      el.addEventListener('pointerup', (e) => this.up(e));
      el.addEventListener('pointercancel', (e) => this.up(e, true));
    }
    // keyboard / assistive "click" (a real tap is handled on pointerup)
    this.handle.addEventListener('click', (e) => { if (e.detail === 0) this.toggle(); });
    this.ro = new ResizeObserver(() => this.place());
    this.ro.observe(this.root);
  }

  get pos() {
    const s = this.settings.fsDock && this.settings.fsDock[this.key];
    return s && Number.isFinite(s.fx) && Number.isFinite(s.fy) ? s : typeof this.home === 'function' ? this.home() : this.home;
  }

  insets() {
    const cs = getComputedStyle(this.probe);
    return { l: parseFloat(cs.paddingLeft) || 0, t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0 };
  }

  /** The area the menus may use, in root coordinates. */
  area() {
    const i = this.insets();
    return { x0: GAP + i.l, y0: GAP + i.t, x1: this.root.clientWidth - GAP - i.r, y1: this.root.clientHeight - GAP - i.b };
  }

  opened() { return !this.root.classList.contains('fs-clean'); }

  /** Where the round button sits (root coordinates). */
  handlePos(a = this.area()) {
    const { fx, fy } = this.pos;
    return { x: a.x0 + fx * Math.max(0, a.x1 - a.x0 - HS), y: a.y0 + fy * Math.max(0, a.y1 - a.y0 - HS) };
  }

  /**
   * Put the button where the saved spot says and, when the menus are open, the bar next to it — on the side
   * where it fits. The button itself never moves when the menus open or close, so a second tap on the same
   * spot always closes them again.
   */
  place() {
    if (!this.root.classList.contains('fs') || !this.root.clientWidth) return;
    const a = this.area(), h = this.handlePos(a);
    this.handle.style.left = `${Math.round(h.x)}px`;
    this.handle.style.top = `${Math.round(h.y)}px`;
    this.root.dataset.dockX = this.pos.fx < 0.3 ? 'l' : this.pos.fx > 0.7 ? 'r' : 'm';
    this.root.dataset.dockY = this.pos.fy < 0.3 ? 't' : this.pos.fy > 0.7 ? 'b' : 'm';
    if (!this.opened()) return;
    this.bar.style.maxWidth = `${Math.max(120, a.x1 - a.x0)}px`;
    const bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
    const cx = h.x + HS / 2, cy = h.y + HS / 2;
    const clampX = (x) => Math.min(Math.max(x, a.x0), Math.max(a.x0, a.x1 - bw));
    const clampY = (y) => Math.min(Math.max(y, a.y0), Math.max(a.y0, a.y1 - bh));
    const side = {
      below: { x: clampX(h.x), y: h.y + HS + GAP, ok: h.y + HS + GAP + bh <= a.y1 },
      above: { x: clampX(h.x), y: h.y - GAP - bh, ok: h.y - GAP - bh >= a.y0 },
      right: { x: h.x + HS + GAP, y: clampY(cy - HS / 2), ok: h.x + HS + GAP + bw <= a.x1 },
      left: { x: h.x - GAP - bw, y: clampY(cy - HS / 2), ok: h.x - GAP - bw >= a.x0 },
    };
    if (this.row) { side.left.y = clampY(cy - bh / 2); side.right.y = clampY(cy - bh / 2); }
    const order = this.row ? ['left', 'right', 'above', 'below'] : ['below', 'above', 'right', 'left'];
    const pick = order.find((k) => side[k].ok) || order[order.length - 1];
    const p = side[pick];
    this.bar.style.left = `${Math.round(Math.min(Math.max(p.x, a.x0), Math.max(a.x0, a.x1 - bw)))}px`;
    this.bar.style.top = `${Math.round(Math.min(Math.max(p.y, a.y0), Math.max(a.y0, a.y1 - bh)))}px`;
  }

  down(e, el) {
    if (e.button) return;
    // drag from the button, or from the empty edge of the bar — the other buttons keep their own taps
    if (el === this.bar && e.target !== this.bar) return;
    const h = this.handlePos();
    this.drag = { id: e.pointerId, el, x0: e.clientX, y0: e.clientY, hx: h.x, hy: h.y, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
  }

  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < MOVE) return;
      d.moved = true;
      this.root.classList.add('fs-dragging');
    }
    const a = this.area();
    const fx = Math.min(1, Math.max(0, (d.hx + dx - a.x0) / Math.max(1, a.x1 - a.x0 - HS)));
    const fy = Math.min(1, Math.max(0, (d.hy + dy - a.y0) / Math.max(1, a.y1 - a.y0 - HS)));
    if (!this.settings.fsDock) this.settings.fsDock = {};
    this.settings.fsDock[this.key] = { fx: +fx.toFixed(4), fy: +fy.toFixed(4) };
    this.place();
    e.preventDefault();
  }

  up(e, cancelled = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    try { d.el.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    this.root.classList.remove('fs-dragging');
    if (d.moved) { if (this.save) this.save(); return; }
    if (!cancelled && d.el === this.handle) this.toggle();
  }
}
