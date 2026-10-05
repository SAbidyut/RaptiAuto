// One "scene" for the lab that is either the 3D view (three.js) or the 2D wiring schematic.
// Both views implement the same API; project / system / selection changes go to every view
// that exists so switching is instant, picking and camera calls go to the visible one.
// The 3D scene is only created the first time it is shown (slow phones may never need WebGL).
import { LabScene, NullScene } from '../three/scene.js';
import { LabSchematic, deviceThumbnail } from './schematic.js';

export class SceneSwitch {
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.s2 = null;
    this.s3 = null;
    this.mode = null;
    this._visible = true;
    this._system = null;
    this._running = false;
    this._markers = [];
    this._sel = { devs: [], conns: [] };
    this.project = null;
    this.onLost = null; // called when the 3D view loses its GPU context
  }

  get active() { return this.mode === '3d' ? this.s3 : this.s2; }
  get all() { return [this.s2, this.s3].filter(Boolean); }
  get has3d() { return !!this.s3 && !this.s3.failed; }
  get failed3d() { return !!this.s3 && this.s3.failed; }
  get lost3d() { return !!this.s3 && !!this.s3.lost; }

  /** Show '2d' or '3d'. Returns the mode actually shown ('2d' when 3D could not be created). */
  setMode(mode) {
    // a 3D view whose GPU context was lost is thrown away and built again
    if (mode === '3d' && this.s3 && !this.s3.failed && this.s3.lost) { try { this.s3.dispose(); } catch (e) { /* ignore */ } this.s3 = null; }
    if (mode === '3d' && !this.s3) {
      try {
        this.s3 = new LabScene(this.host, this.opts);
        this.prime(this.s3);
        this.s3.onLost = (lost) => { if (lost && this.onLost) this.onLost(); };
      } catch (e) {
        console.warn('3D unavailable', e);
        if (this.s3 && this.s3.dispose) { try { this.s3.dispose(); } catch (err) { /* ignore */ } }
        this.s3 = new NullScene(this.host);
      }
    }
    if (mode === '3d' && this.s3.failed) mode = '2d';
    if (mode === '2d' && !this.s2) {
      this.s2 = new LabSchematic(this.host, this.opts);
      try { this.prime(this.s2); } catch (e) { console.warn('2D view', e); }
    }
    this.mode = mode;
    this.host.classList.toggle('view-2d', mode === '2d');
    this.host.classList.toggle('view-3d', mode === '3d');
    for (const s of this.all) { s.visible = s === this.active && this._visible; s.controls.enabled = true; }
    const a = this.active;
    a.dirty = true;
    a.hmiDirty = true; a.laptopDirty = true;
    a.resize();
    requestAnimationFrame(() => { if (this.active === a) a.resize(); });
    return mode;
  }

  /** Bring a freshly created view up to the current state. */
  prime(s) {
    if (!this.project) return;
    s.setProject(this.project);
    if (this._system) s.setSystem(this._system);
    s.setRunning(this._running);
    if (this._sel.devs.length + this._sel.conns.length > 1) s.selectMany(this._sel.devs, this._sel.conns);
    else { s.selectDevice(this._sel.devs[0] || null); s.selectCable(this._sel.conns[0] || null); }
    s.setMarkers(this._markers);
  }

  // ---------------------------------------------------------------- state → every view
  setProject(p) { this.project = p; for (const s of this.all) s.setProject(p); }
  syncDevices(f) { for (const s of this.all) s.syncDevices(f); }
  syncCables() { for (const s of this.all) s.syncCables(); }
  setSystem(sys) { this._system = sys; for (const s of this.all) s.setSystem(sys); }
  get system() { return this._system; }
  setRunning(on) { this._running = on; for (const s of this.all) s.setRunning(on); }
  setMarkers(list) { this._markers = list || []; for (const s of this.all) s.setMarkers(this._markers); }
  selectDevice(id) { this._sel.devs = id ? [id] : []; for (const s of this.all) s.selectDevice(id); }
  selectCable(id) { this._sel.conns = id ? [id] : []; for (const s of this.all) s.selectCable(id); }
  selectMany(devs, conns) { this._sel = { devs: [...devs], conns: [...conns] }; for (const s of this.all) s.selectMany(devs, conns); }
  set hmiDirty(v) { for (const s of this.all) s.hmiDirty = v; }
  set laptopDirty(v) { for (const s of this.all) s.laptopDirty = v; }
  set dirty(v) { for (const s of this.all) s.dirty = v; }
  get visible() { return this._visible; }
  set visible(v) { this._visible = v; for (const s of this.all) s.visible = v && s === this.active; }
  dispose() { for (const s of this.all) s.dispose(); }

  // ---------------------------------------------------------------- the visible view
  get controls() { return this.active.controls; }
  get renderer() { return this.active.renderer || { shadowMap: {} }; }
  get camera() { return this.active.camera; }
  updateFlows(a, b) { this.active.updateFlows(a, b); }
  focus(t, anim, dur) { this.active.focus(t, anim, dur); }
  resize() { if (this.active) this.active.resize(); }
  portsNear(...a) { return this.active.portsNear(...a); }
  pickControl(x, y) { return this.active.pickControl(x, y); }
  pickDevice(x, y) { return this.active.pickDevice(x, y); }
  pickCable(x, y) { return this.active.pickCable(x, y); }
  itemsInRect(r, m) { return this.active.itemsInRect(r, m); }
  modelOf(id) { return this.active.modelOf(id); }
  zoomStart(x, y) { this.active.zoomStart(x, y); }
  zoomTo(f) { this.active.zoomTo(f); }
  zoomAt(f, x, y) { this.active.zoomAt(f, x, y); }
  snapshot(w, h) { return this.active.snapshot(w, h); }
  // 3D-only helpers (used by the screenshot harness)
  portWorld(dev, port) { return this.active.portWorld ? this.active.portWorld(dev, port) : null; }
  toScreen(p) { return this.active.toScreen(...(Array.isArray(p) && this.mode === '2d' ? p : [p])); }
  /** Device picture for the library: rendered in 3D when the 3D view exists, else the 2D symbol. */
  thumbnail(dev) { return this.has3d ? this.s3.thumbnail(dev) : deviceThumbnail(dev); }

  /** Saved camera views: {view (3D), view2d}. */
  views() { return { view: this.has3d ? this.s3.getView() : null, view2d: this.s2 ? this.s2.getView() : null }; }
}
