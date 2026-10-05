// HMI tab: the live DOP-107 screen (touch it like the real panel) and a DOPSoft-like screen
// designer — add objects, drag / resize them, link them to PLC devices, manage screens.
import { h, toast, Sheet, popupMenu, promptDialog, confirmDialog } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import { HMI_TYPES, HMI_W, HMI_H, newHmiElement, hmiId } from '../sim/hmi.js';
import { parseOperand, addrSortKey } from '../sim/address.js';
import { renderHmi, HMI_BTN_COLORS } from './hmi-render.js';

const SNAP = 10;
const COLORS = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#22d3ee', '#a855f7', '#e2e8f0', '#334155', '#0b1630', '#13223f', '#1e293b'];

const FIELDS = {
  button: [['text', 'Text'], ['bit', 'Bit device', 'bit'], ['mode', 'Action', 'sel', { momentary: 'Momentary', toggle: 'Toggle (alternate)', set: 'Set ON', reset: 'Reset OFF' }], ['color', 'Colour', 'sel', Object.fromEntries(HMI_BTN_COLORS.map((c) => [c, c]))]],
  lamp: [['bit', 'Bit device', 'bit'], ['text', 'Text'], ['shape', 'Shape', 'sel', { circle: 'Round', rect: 'Rectangle' }], ['onColor', 'ON colour', 'color'], ['offColor', 'OFF colour', 'color']],
  num: [['label', 'Label'], ['word', 'Word device', 'word'], ['dec', 'Decimals', 'num'], ['unit', 'Unit']],
  input: [['label', 'Label'], ['word', 'Word device', 'word'], ['dec', 'Decimals', 'num'], ['unit', 'Unit'], ['min', 'Minimum', 'num'], ['max', 'Maximum', 'num']],
  meter: [['label', 'Label'], ['word', 'Word device', 'word'], ['dec', 'Decimals', 'num'], ['unit', 'Unit'], ['min', 'Minimum', 'num'], ['max', 'Maximum', 'num']],
  bar: [['label', 'Label'], ['word', 'Word device', 'word'], ['dec', 'Decimals', 'num'], ['min', 'Minimum', 'num'], ['max', 'Maximum', 'num'], ['color', 'Colour', 'color']],
  text: [['text', 'Text'], ['size', 'Font size', 'num'], ['color', 'Colour', 'color'], ['align', 'Align', 'sel', { left: 'Left', center: 'Centre', right: 'Right' }], ['bold', 'Bold', 'bool']],
  motor: [['bit', 'Running bit', 'bit'], ['text', 'Text']],
  trend: [['label', 'Label'], ['word', 'Pen 1 (word)', 'word'], ['word2', 'Pen 2 (word, optional)', 'word'], ['dec', 'Decimals', 'num'], ['min', 'Minimum', 'num'], ['max', 'Maximum', 'num'], ['span', 'Time span (s)', 'num']],
  goto: [['text', 'Text'], ['screen', 'Go to screen', 'screen']],
  alarm: [['bit', 'Alarm bit', 'bit'], ['text', 'Message']],
  rect: [['title', 'Title'], ['fill', 'Fill', 'color'], ['stroke', 'Border', 'color'], ['radius', 'Corner radius', 'num']],
};

export class HmiView {
  constructor(lab) {
    this.lab = lab;
    this.designing = false;
    this.screen = 0;
    this.sel = null;
    this.el = h('section', { class: 'hmi-view' });
    this.designCanvas = document.createElement('canvas');
    this.designCanvas.width = HMI_W; this.designCanvas.height = HMI_H;
    this.designCanvas.className = 'hmi-canvas';
    this.build();
  }

  get hmi() { return this.lab.project.hmi; }
  get scr() { return this.hmi.screens[this.screen] || this.hmi.screens[0]; }

  build() {
    this.seg = h('div', { class: 'segmented' },
      h('button', { class: 'seg active', 'data-m': 'run', html: `${icon('hand', 15)}<span>Operate</span>`, onclick: () => this.setDesign(false) }),
      h('button', { class: 'seg', 'data-m': 'design', html: `${icon('edit', 15)}<span>Design</span>`, onclick: () => this.setDesign(true) }));
    this.screens = h('div', { class: 'hv-screens' });
    this.tools = h('div', { class: 'hv-tools' },
      h('button', { class: 'btn btn-primary sm', html: `${icon('plus', 16)}<span>Object</span>`, onclick: () => this.addObject() }),
      this.propBtn = h('button', { class: 'btn btn-ghost sm', html: `${icon('sliders', 16)}<span>Edit</span>`, onclick: () => this.sel && this.editProps(this.sel) }),
      this.dupBtn = h('button', { class: 'icon-btn sm', title: 'Duplicate', html: icon('copy', 18), onclick: () => this.duplicate() }),
      this.delBtn = h('button', { class: 'icon-btn sm', title: 'Delete', html: icon('trash', 18), onclick: () => this.deleteSel() }),
      h('button', { class: 'icon-btn sm', title: 'Screen settings', html: icon('settings', 18), onclick: (e) => this.screenMenu(e.currentTarget) }));
    this.bar = h('div', { class: 'hv-bar' }, this.seg, this.screens, this.tools);
    this.frameEl = h('div', { class: 'hv-device' });
    this.canvasWrap = h('div', { class: 'hv-screen' });
    this.overlay = h('div', { class: 'hv-overlay' });
    this.offMsg = h('div', { class: 'hv-off hidden' });
    this.canvasWrap.append(this.lab.hmiCanvas, this.designCanvas, this.overlay, this.offMsg);
    this.frameEl.append(this.canvasWrap, h('div', { class: 'hv-brand', html: '<b>▲ DELTA</b><span>DOP-107BV</span><i class="hv-led"></i>' }));
    this.stage = h('div', { class: 'hv-stage' }, this.frameEl);
    this.info = h('div', { class: 'hv-info' });
    this.el.append(this.bar, this.stage, this.info);
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.stage);
    // run-mode touch
    const cv = this.lab.hmiCanvas;
    cv.addEventListener('pointerdown', (e) => this.runDown(e));
    cv.addEventListener('pointerup', (e) => this.runUp(e));
    cv.addEventListener('pointercancel', (e) => this.runUp(e));
    // design-mode touch
    this.designCanvas.addEventListener('pointerdown', (e) => this.dDown(e));
    this.overlay.addEventListener('pointerdown', (e) => this.dDown(e));
    window.addEventListener('pointermove', (this.onPM = (e) => this.dMove(e)));
    window.addEventListener('pointerup', (this.onPU = (e) => this.dUp(e)));
    this.setDesign(false);
  }

  destroy() { this.ro.disconnect(); window.removeEventListener('pointermove', this.onPM); window.removeEventListener('pointerup', this.onPU); }

  onShow() { this.layout(); this.refresh(); }
  onBack() { if (this.sel) { this.select(null); return true; } if (this.designing) { this.setDesign(false); return true; } return false; }
  onSimStart() { this.refresh(); }
  onSimStop() { this.refresh(); }
  onHardwareChanged() { this.refresh(); }

  layout() {
    const r = this.stage.getBoundingClientRect();
    if (!r.width) return;
    const pad = 16;
    const k = Math.min((r.width - pad * 2 - 36) / HMI_W, (r.height - pad * 2 - 56) / HMI_H, 1.4);
    this.k = Math.max(0.2, k);
    this.canvasWrap.style.width = HMI_W * this.k + 'px';
    this.canvasWrap.style.height = HMI_H * this.k + 'px';
    this.drawOverlay();
  }

  setDesign(on) {
    this.designing = on;
    for (const b of this.seg.children) b.classList.toggle('active', (b.dataset.m === 'design') === on);
    this.el.classList.toggle('designing', on);
    this.lab.hmiCanvas.style.display = on ? 'none' : '';
    this.designCanvas.style.display = on ? '' : 'none';
    if (!on) this.select(null);
    this.refresh();
  }

  rt() { const s = this.lab.sys; return s && s.hmiRt ? s.hmiRt.hmi : null; }

  refresh() {
    // screen chips
    this.screens.innerHTML = '';
    const rt = this.rt();
    const cur = this.designing ? this.screen : rt ? rt.screen : this.screen;
    this.hmi.screens.forEach((s, i) => {
      this.screens.appendChild(h('button', { class: 'chip' + (i === cur ? ' active' : ''), onclick: () => { this.screen = i; if (rt && !this.designing) { rt.screen = i; rt.dirty = true; } this.select(null); this.refresh(); } }, `${i + 1} · ${s.name}`));
    });
    if (this.designing) this.screens.appendChild(h('button', { class: 'chip', html: icon('plus', 14), title: 'New screen', onclick: () => this.addScreen() }));
    const hasHmi = this.lab.project.devices.some((d) => d.type === 'dop-107bv');
    this.tools.classList.toggle('hidden', !this.designing);
    for (const b of [this.propBtn, this.dupBtn, this.delBtn]) b.disabled = !this.sel;
    // off message
    const showOff = !this.designing && (!rt || !rt.powered);
    this.offMsg.classList.toggle('hidden', !showOff);
    if (showOff) {
      this.offMsg.innerHTML = '';
      this.offMsg.append(h('div', { html: icon('screen', 34) }),
        h('b', {}, !hasHmi ? 'No HMI in this lab' : !this.lab.sys ? 'The HMI is off' : 'The HMI has no 24 V power'),
        h('p', {}, !hasHmi ? 'Add a Delta DOP-107BV from the 3D lab (＋), or design the screens now.' : !this.lab.sys ? 'Press Simulate to power the lab, or switch to Design to edit the screens.' : 'Wire HMI + and − to the 24 V supply in the 3D lab.'),
        !this.lab.sys && hasHmi ? h('button', { class: 'btn btn-primary sm', html: `${icon('play', 16)}<span>Simulate</span>`, onclick: () => this.lab.startSim() }) : h('button', { class: 'btn btn-ghost sm', html: `${icon('edit', 16)}<span>Design screens</span>`, onclick: () => this.setDesign(true) }));
    }
    if (this.designing) this.drawDesign();
    this.updateInfo();
  }

  updateInfo() {
    const sys = this.lab.sys;
    const hd = this.lab.project.devices.find((d) => d.type === 'dop-107bv');
    const port = hd ? (hd.props && hd.props.port) || 'COM1' : 'COM1';
    let st = '<span class="hv-st off">● offline</span>';
    if (sys && sys.hmiRt) st = sys.hmiLinkState.ok ? '<span class="hv-st ok">● online</span>' : sys.hmiRt.hmi.powered ? `<span class="hv-st err">● ${sys.hmiLinkState.reason || 'no response'}</span>` : '<span class="hv-st off">● no power</span>';
    const html = `<span>${port} · Delta DVP · ${port === 'COM1' ? 'RS-232' : 'RS-485'} 9600 7E1 · station ${hd && hd.props && hd.props.station !== undefined ? hd.props.station : 1}</span>${st}`;
    if (html !== this.lastInfo) { this.lastInfo = html; this.info.innerHTML = html; }
    this.frameEl.querySelector('.hv-led').classList.toggle('on', !!(sys && sys.hmiRt && sys.hmiRt.hmi.powered));
  }

  frame(dt) {
    this.acc = (this.acc || 0) + dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    this.updateInfo();
    const rt = this.rt();
    const off = !this.designing && (!rt || !rt.powered);
    if (off !== !this.offMsg.classList.contains('hidden')) this.refresh();
    if (rt && !this.designing && rt.screen !== this.lastScreen) { this.lastScreen = rt.screen; this.refresh(); }
  }

  // ------------------------------------------------------------------ run mode touch
  runPos(e) {
    const r = this.lab.hmiCanvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * HMI_W, ((e.clientY - r.top) / r.height) * HMI_H];
  }
  runDown(e) {
    if (this.designing) return;
    const rt = this.rt();
    if (!rt) return;
    e.preventDefault();
    const [x, y] = this.runPos(e);
    rt.pointerDown(x, y, e.pointerId);
    Native.vibrate(6);
  }
  runUp(e) {
    const rt = this.rt();
    if (!rt) return;
    const [x, y] = this.runPos(e);
    rt.pointerUp(x, y, e.pointerId);
  }

  // ------------------------------------------------------------------ design
  drawDesign() {
    renderHmi(this.designCanvas, null, this.scr, { design: true });
    this.drawOverlay();
  }

  drawOverlay() {
    this.overlay.innerHTML = '';
    if (!this.designing || !this.sel) return;
    const el = this.sel;
    const k = this.k || 1;
    const box = h('div', { class: 'hv-sel', style: { left: el.x * k + 'px', top: el.y * k + 'px', width: el.w * k + 'px', height: el.h * k + 'px' } },
      h('span', { class: 'hv-sel-tag' }, `${HMI_TYPES[el.type].name}${el.bit ? ' · ' + el.bit : el.word ? ' · ' + el.word : ''}`),
      h('i', { class: 'hv-handle', 'data-h': 'se' }));
    this.overlay.appendChild(box);
  }

  dPos(e) {
    const r = this.designCanvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * HMI_W, ((e.clientY - r.top) / r.height) * HMI_H];
  }

  dDown(e) {
    if (!this.designing) return;
    e.preventDefault();
    const [x, y] = this.dPos(e);
    const handle = e.target.dataset && e.target.dataset.h;
    if (handle && this.sel) { this.drag = { mode: 'resize', el: this.sel, x0: x, y0: y, w0: this.sel.w, h0: this.sel.h, id: e.pointerId }; return; }
    const els = this.scr.elements;
    let hit = null;
    for (let i = els.length - 1; i >= 0; i--) { const el = els[i]; if (x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h) { hit = el; break; } }
    if (hit && this.sel !== hit && hit.type === 'rect' && els.some((o) => o !== hit && o.type !== 'rect' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h)) hit = els.find((o) => o !== hit && o.type !== 'rect' && x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h);
    if (!hit) { this.select(null); return; }
    const again = this.sel === hit;
    this.select(hit);
    this.drag = { mode: 'move', el: hit, x0: x, y0: y, ex: hit.x, ey: hit.y, id: e.pointerId, moved: false, again, t: performance.now() };
  }

  dMove(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const [x, y] = this.dPos(e);
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(x - d.x0, y - d.y0) < 6) return;
      d.moved = true;
      d.el.x = Math.max(0, Math.min(HMI_W - d.el.w, Math.round((d.ex + x - d.x0) / SNAP) * SNAP));
      d.el.y = Math.max(0, Math.min(HMI_H - d.el.h, Math.round((d.ey + y - d.y0) / SNAP) * SNAP));
    } else {
      d.el.w = Math.max(30, Math.min(HMI_W - d.el.x, Math.round((d.w0 + x - d.x0) / SNAP) * SNAP));
      d.el.h = Math.max(24, Math.min(HMI_H - d.el.y, Math.round((d.h0 + y - d.y0) / SNAP) * SNAP));
    }
    this.drawDesign();
  }

  dUp(e) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    if (d.mode === 'move' && !d.moved && d.again && performance.now() - d.t < 450) { this.editProps(d.el); return; }
    if (d.moved || d.mode === 'resize') this.changed();
  }

  select(el) {
    this.sel = el;
    for (const b of [this.propBtn, this.dupBtn, this.delBtn]) b.disabled = !el;
    this.drawOverlay();
  }

  changed() {
    const rt = this.rt();
    if (rt) rt.dirty = true;
    this.lab.save();
    if (this.designing) this.drawDesign();
  }

  addObject() {
    const content = h('div', { class: 'hv-addlist' });
    for (const [type, t] of Object.entries(HMI_TYPES)) {
      content.appendChild(h('button', { class: 'ip-row', onclick: () => {
        sheet.close();
        const el = newHmiElement(type, 40, 90);
        const used = this.scr.elements;
        while (used.some((o) => o.x === el.x && o.y === el.y)) { el.x += 20; el.y += 20; }
        el.x = Math.min(el.x, HMI_W - el.w); el.y = Math.min(el.y, HMI_H - el.h);
        if (type === 'rect') used.unshift(el); else used.push(el);
        this.select(el);
        this.changed();
        this.editProps(el);
      } }, h('span', { class: 'ip-mn' }, t.name.split(' ')[0].slice(0, 6)), h('div', { class: 'ip-text' }, h('b', {}, t.name), h('small', {}, hint(type)))));
    }
    const sheet = new Sheet({ title: 'Add object', content, icon: 'plus', cls: 'sheet-tall' });
    sheet.open();
  }

  duplicate() {
    if (!this.sel) return;
    const c = { ...JSON.parse(JSON.stringify(this.sel)), id: hmiId(), x: Math.min(HMI_W - this.sel.w, this.sel.x + 20), y: Math.min(HMI_H - this.sel.h, this.sel.y + 20) };
    this.scr.elements.push(c);
    this.select(c);
    this.changed();
  }

  deleteSel() {
    if (!this.sel) return;
    this.scr.elements = this.scr.elements.filter((e) => e !== this.sel);
    this.select(null);
    this.changed();
  }

  usedAddrs(kind) {
    const prog = this.lab.project.program;
    const out = new Set(Object.keys(prog.comments));
    for (const r of prog.rungs) for (const row of [...r.cells, r.outs]) for (const el of row) if (el && el.a) for (const a of el.a) if (/^[XYMSTCD]\d/.test(a || '')) out.add(a);
    return [...out].filter((a) => (kind === 'word' ? /^[DTC]/.test(a) : /^[XYMSTC]/.test(a))).sort((a, b) => addrSortKey(a) - addrSortKey(b));
  }

  editProps(el) {
    const content = h('div', { class: 'props hv-props' });
    const set = (k, v) => { el[k] = v; this.changed(); };
    content.appendChild(h('div', { class: 'props-cat' }, HMI_TYPES[el.type].name));
    for (const [k, label, type, opts] of FIELDS[el.type] || []) {
      const row = h('div', { class: 'field' }, h('label', {}, label));
      if (type === 'sel') {
        const seg = h('div', { class: 'opt-grid' });
        for (const [v, l] of Object.entries(opts)) {
          const b = h('button', { class: 'opt' + (String(el[k]) === v ? ' active' : ''), onclick: () => { for (const x of seg.children) x.classList.remove('active'); b.classList.add('active'); set(k, v); } }, l);
          seg.appendChild(b);
        }
        row.appendChild(seg);
      } else if (type === 'screen') {
        const seg = h('div', { class: 'opt-grid' });
        this.hmi.screens.forEach((s, i) => { const b = h('button', { class: 'opt' + (el[k] === i ? ' active' : ''), onclick: () => { for (const x of seg.children) x.classList.remove('active'); b.classList.add('active'); set(k, i); } }, `${i + 1} · ${s.name}`); seg.appendChild(b); });
        row.appendChild(seg);
      } else if (type === 'color') {
        const seg = h('div', { class: 'color-grid' });
        for (const c of COLORS) seg.appendChild(h('button', { class: 'color-dot sm' + (el[k] === c ? ' active' : ''), style: { background: c }, onclick: (e) => { for (const x of seg.children) x.classList.remove('active'); e.currentTarget.classList.add('active'); set(k, c); } }));
        row.appendChild(seg);
      } else if (type === 'bool') {
        const tg = h('button', { class: 'toggle' + (el[k] ? ' on' : ''), onclick: () => { tg.classList.toggle('on'); set(k, tg.classList.contains('on')); } }, h('span'));
        row.appendChild(tg);
      } else if (type === 'num') {
        const inp = h('input', { class: 'input', type: 'number', value: el[k] ?? 0 });
        inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (Number.isFinite(v)) set(k, v); });
        row.appendChild(inp);
      } else if (type === 'bit' || type === 'word') {
        const inp = h('input', { class: 'input mono', value: el[k] || '', placeholder: type === 'bit' ? 'e.g. M10, Y0, X3' : 'e.g. D10, T0, C0', autocapitalize: 'characters' });
        const msg = h('small', { class: 'field-help' });
        const validate = () => {
          const v = inp.value.trim().toUpperCase();
          if (!v) { msg.textContent = k === 'word2' ? 'Optional' : 'Required'; return v; }
          const o = parseOperand(v);
          const ok = o && (type === 'bit' ? ['X', 'Y', 'M', 'S', 'T', 'C'] : ['D', 'T', 'C']).includes(o.dev);
          msg.textContent = ok ? (this.lab.project.program.comments[o.text] || '✓ valid') : 'Not a valid ' + (type === 'bit' ? 'bit device (X, Y, M, S, T, C)' : 'word device (D, T, C)');
          msg.classList.toggle('bad', !ok);
          return ok ? o.text : null;
        };
        inp.addEventListener('input', validate);
        inp.addEventListener('change', () => { const v = validate(); if (v !== null) set(k, v); });
        const chips = h('div', { class: 'chips-wrap' });
        for (const a of this.usedAddrs(type).slice(0, 18)) chips.appendChild(h('button', { class: 'chip sm', onclick: () => { inp.value = a; set(k, validate()); } }, a));
        row.append(inp, msg, chips);
        validate();
      } else {
        const inp = h('input', { class: 'input', value: el[k] ?? '' });
        inp.addEventListener('input', () => set(k, inp.value));
        row.appendChild(inp);
      }
      content.appendChild(row);
    }
    const geo = h('div', { class: 'hv-geo' });
    for (const k of ['x', 'y', 'w', 'h']) {
      const inp = h('input', { class: 'input', type: 'number', value: el[k] });
      inp.addEventListener('change', () => { const v = parseInt(inp.value, 10); if (Number.isFinite(v)) set(k, Math.max(0, v)); });
      geo.appendChild(h('label', {}, h('span', {}, k.toUpperCase()), inp));
    }
    content.append(h('div', { class: 'field' }, h('label', {}, 'Position & size'), geo),
      h('div', { class: 'props-actions' },
        h('button', { class: 'btn btn-ghost', html: `${icon('copy', 18)}<span>Duplicate</span>`, onclick: () => { sheet.close(); this.duplicate(); } }),
        h('button', { class: 'btn btn-danger-ghost', html: `${icon('trash', 18)}<span>Delete</span>`, onclick: () => { sheet.close(); this.deleteSel(); } })));
    const sheet = new Sheet({ title: HMI_TYPES[el.type].name, content, icon: 'sliders', cls: 'sheet-tall', onClose: () => this.drawDesign() });
    sheet.open();
  }

  async addScreen() {
    const name = await promptDialog('New screen', `Screen ${this.hmi.screens.length + 1}`);
    if (!name) return;
    this.hmi.screens.push({ id: hmiId(), name, bg: '#0b1630', elements: [] });
    this.screen = this.hmi.screens.length - 1;
    this.changed();
    this.refresh();
  }

  screenMenu(anchor) {
    const s = this.scr;
    popupMenu(anchor, [
      { icon: 'edit', label: 'Rename screen', action: async () => { const n = await promptDialog('Screen name', s.name); if (n) { s.name = n; this.changed(); this.refresh(); } } },
      { icon: 'home', label: this.hmi.start === this.screen ? 'Start screen ✓' : 'Make start screen', action: () => { this.hmi.start = this.screen; this.changed(); toast('Start screen set'); } },
      { icon: 'palette', label: 'Background colour', action: () => {
        const content = h('div', { class: 'color-grid' });
        const sh = new Sheet({ title: 'Background', content, icon: 'palette' });
        for (const c of ['#0b1630', '#0f172a', '#111827', '#14213d', '#1f2937', '#e5e7eb', '#f8fafc']) content.appendChild(h('button', { class: 'color-dot', style: { background: c }, onclick: () => { s.bg = c; sh.close(); this.changed(); } }));
        sh.open();
      } },
      { icon: 'plus', label: 'Add screen', action: () => this.addScreen() },
      '-',
      { icon: 'trash', label: 'Delete screen', danger: true, action: async () => {
        if (this.hmi.screens.length <= 1) { toast('The HMI needs at least one screen'); return; }
        if (!(await confirmDialog('Delete screen?', `“${s.name}” and its objects will be removed.`, 'Delete', true))) return;
        this.hmi.screens.splice(this.screen, 1);
        this.screen = 0; this.hmi.start = Math.min(this.hmi.start, this.hmi.screens.length - 1);
        this.changed(); this.refresh();
      } },
    ]);
  }
}

function hint(type) {
  return {
    button: 'Writes a bit (momentary, toggle, set, reset)', lamp: 'Shows a bit ON / OFF', num: 'Shows a word value', input: 'Operator enters a value (keypad)',
    meter: 'Analog gauge for a word', bar: 'Bar graph for a word', text: 'Static label', motor: 'Animated motor / fan for a bit', trend: 'Live chart of up to 2 words',
    goto: 'Switches to another screen', alarm: 'Flashing banner while a bit is ON', rect: 'Background panel / group box',
  }[type];
}
