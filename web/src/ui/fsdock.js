// The full-screen menu of the Arduino editor, the Raspberry Pi lab and the PLC lab: one frosted-glass capsule that
// floats over the work area. Its ☰ / ✕ button opens and closes the menus; drag the capsule (by the button or by its
// empty edge) and it stays wherever you leave it — the spot is remembered per screen.
const HS = 36;       // the round ☰ button
const GAP = 6;       // keep this far from the screen edge (plus the camera cut-out)
const MOVE = 7;      // pixels the finger must travel before a tap becomes a drag

export class FsDock {
  /**
   * @param {object} o  root: screen element, bar: the .fs-bar, handle: the ☰ button, key: settings key,
   *   orient: 'col' (button on top, buttons below) | 'row' (buttons, then the button at the end),
   *   home: {fx, fy} (or a function returning it) first position as a fraction of the free space, settings/save: persistence, toggle(): open/close
   */
  constructor(o) {
    Object.assign(this, o);
    this.row = o.orient === 'row';
    this.bar.classList.add('fs-dock', this.row ? 'dock-row' : 'dock-col');
    this.handle.classList.add('fs-handle');
    if (this.row) this.bar.append(this.handle); else this.bar.prepend(this.handle);
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

  /** The area the capsule may use, in root coordinates. */
  area() {
    const i = this.insets();
    return { x0: GAP + i.l, y0: GAP + i.t, x1: this.root.clientWidth - GAP - i.r, y1: this.root.clientHeight - GAP - i.b };
  }

  opened() { return !this.root.classList.contains('fs-clean'); }

  /** Put the capsule where the saved spot says (call after anything that changes its size or the screen). */
  place() {
    if (!this.root.classList.contains('fs') || !this.root.clientWidth) return;
    const a = this.area(), { fx, fy } = this.pos;
    const hx = a.x0 + fx * Math.max(0, a.x1 - a.x0 - HS), hy = a.y0 + fy * Math.max(0, a.y1 - a.y0 - HS);
    let x = hx, y = hy;
    if (this.opened()) {
      const pad = parseFloat(getComputedStyle(this.bar).paddingLeft) || 0;
      this.bar.style.maxWidth = `${Math.max(120, a.x1 - a.x0)}px`;
      const bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
      x = this.row ? hx + HS + pad - bw : hx - pad;
      y = hy - pad;
      x = Math.min(Math.max(x, a.x0 - 2), Math.max(a.x0 - 2, a.x1 + 2 - bw));
      y = Math.min(Math.max(y, a.y0 - 2), Math.max(a.y0 - 2, a.y1 + 2 - bh));
    }
    this.bar.style.left = `${Math.round(x)}px`;
    this.bar.style.top = `${Math.round(y)}px`;
    this.root.dataset.dockX = fx < 0.3 ? 'l' : fx > 0.7 ? 'r' : 'm';
    this.root.dataset.dockY = fy < 0.3 ? 't' : fy > 0.7 ? 'b' : 'm';
  }

  /** Remember where the button is now (derived from where the capsule actually sits). */
  remember() {
    const a = this.area(), r = this.root.getBoundingClientRect(), b = this.bar.getBoundingClientRect(), hr = this.handle.getBoundingClientRect();
    const hx = hr.left - r.left, hy = hr.top - r.top;
    const free = (v, lo, hi) => (hi - lo - HS > 1 ? Math.min(1, Math.max(0, (v - lo) / (hi - lo - HS))) : 0);
    const fx = free(hx, a.x0, a.x1), fy = free(hy, a.y0, a.y1);
    if (!this.settings.fsDock) this.settings.fsDock = {};
    this.settings.fsDock[this.key] = { fx: +fx.toFixed(4), fy: +fy.toFixed(4) };
    if (this.save) this.save();
    return b;
  }

  down(e, el) {
    if (e.button) return;
    // drag from the button, or from the empty edge of the capsule — the other buttons keep their own taps
    if (el === this.bar && e.target !== this.bar) return;
    const b = this.bar.getBoundingClientRect();
    this.drag = { id: e.pointerId, el, x0: e.clientX, y0: e.clientY, left: b.left, top: b.top, moved: false };
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
    // the capsule follows the finger; the button position is derived from it afterwards
    const r = this.root.getBoundingClientRect(), a = this.area();
    const bw = this.bar.offsetWidth, bh = this.bar.offsetHeight;
    const x = Math.min(Math.max(d.left + dx - r.left, a.x0 - 2), Math.max(a.x0 - 2, a.x1 + 2 - bw));
    const y = Math.min(Math.max(d.top + dy - r.top, a.y0 - 2), Math.max(a.y0 - 2, a.y1 + 2 - bh));
    this.bar.style.left = `${Math.round(x)}px`;
    this.bar.style.top = `${Math.round(y)}px`;
    e.preventDefault();
  }

  up(e, cancelled = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    try { d.el.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
    this.root.classList.remove('fs-dragging');
    if (d.moved) { this.remember(); this.place(); return; }
    if (!cancelled && d.el === this.handle) this.toggle();
  }
}
