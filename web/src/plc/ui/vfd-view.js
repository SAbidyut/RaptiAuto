// VFD tab: a large Delta MS300 keypad (same behaviour as in 3D), live drive status with a trend
// chart, the parameter table (edit online or offline) and a Modbus register reference.
import { h, toast, Sheet } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import { VFD_PARAMS, PARAM_GROUPS, GROUP_NAMES, VfdMS300, FAULTS, paramAddr, defaultParams, faultName } from '../sim/vfd.js';
import { drawSegDisplay } from '../three/sevenseg.js';
import { deviceProps } from '../devices/defs.js';

// the six keys of the MS300 keypad, in the drive's order (◀/▼ is one key: tap ▼, hold ◀)
const KEYS = [['RUN', 'RUN'], ['UP', '▲'], ['MODE', 'MODE'], ['STOP', 'STOP<br>RESET'], ['LD', '&lt;/▼'], ['ENTER', 'ENTER']];

export class VfdView {
  constructor(lab) {
    this.lab = lab;
    this.idx = 0;
    this.trend = [];
    this.q = '';
    this.el = h('section', { class: 'vfd-view' });
    this.build();
  }

  vfdDevs() { return this.lab.project.devices.filter((d) => d.type === 'ms300'); }
  dev() { const l = this.vfdDevs(); return l[Math.min(this.idx, l.length - 1)] || null; }
  rt() { const d = this.dev(); return d && this.lab.sys ? this.lab.sys.rts.get(d.id) : null; }

  build() {
    this.picker = h('div', { class: 'vv-pick' });
    this.disp = document.createElement('canvas');
    this.disp.width = 400; this.disp.height = 120;
    this.disp.className = 'vv-disp';
    const ledEl = (t) => h('span', { 'data-led': t }, h('i'), t);
    this.leds = h('div', { class: 'vv-leds-l' }, ...['RUN', 'FWD', 'REV'].map(ledEl));
    this.leds2 = h('div', { class: 'vv-leds-r' }, ...['STOP', 'PLC'].map(ledEl));
    this.knob = h('div', { class: 'vv-knob', title: 'Speed dial (Pr.00-20 = 7)' }, h('i'));
    this.knobVal = h('small', { class: 'vv-knob-val' }, '');
    this.bindKnob();
    const keys = h('div', { class: 'vv-keys' });
    for (const [k, label] of KEYS) {
      const b = h('button', { class: 'vv-key k-' + k.toLowerCase(), html: label });
      this.bindKey(b, k);
      keys.appendChild(b);
    }
    this.pad = h('div', { class: 'vv-pad' },
      h('div', { class: 'vv-face' },
        h('div', { class: 'vv-logo', html: '<svg viewBox="0 0 20 18" width="15" height="13"><path d="M10 1 19 17H1Z" fill="currentColor"/><path d="M10 7 13.6 13.6H6.4Z" fill="#101114"/></svg><b>DELTA</b>' }),
        h('div', { class: 'vv-top' }, this.leds, h('div', { class: 'vv-window' }, this.disp), this.leds2, h('div', { class: 'vv-dial' }, this.knob, this.knobVal)),
        keys),
      h('div', { class: 'vv-cover' },
        h('div', { class: 'vv-cover-logo', html: '<svg viewBox="0 0 20 18" width="22" height="20"><path d="M10 1 19 17H1Z" fill="currentColor"/><path d="M10 7 13.6 13.6H6.4Z" fill="#45484e"/></svg><b>DELTA</b>' }),
        h('div', { class: 'vv-cover-model' }, 'MS300'),
        h('div', { class: 'vv-model' }, 'VFD7A5MS21ANSAA · 1.5 kW · 1~230 V')),
      h('div', { class: 'vv-help', html: '<b>MODE</b> F → H → U → parameters → Frd/rEv · <b>▲</b> / <b>▼</b> (tap &lt;/▼) frequency, value or direction · hold <b>&lt;/▼</b> = ◀ next digit · <b>ENTER</b> confirm / open parameters · <b>RUN</b> / <b>STOP</b> work when Pr.00-21 = 0; STOP also stops terminal / RS-485 control (Pr.00-32) and resets a fault · the <b>dial</b> sets the speed when Pr.00-20 = 7' }));
    this.cards = h('div', { class: 'vv-cards' });
    this.chart = document.createElement('canvas');
    this.chart.className = 'vv-chart';
    this.paramsEl = h('div', { class: 'vv-params' });
    this.search = h('input', { class: 'input', type: 'search', placeholder: 'Search parameters (e.g. 00-20, accel, RS-485)', autocomplete: 'off' });
    this.search.addEventListener('input', () => { this.q = this.search.value.trim().toLowerCase(); this.drawParams(); });
    this.right = h('div', { class: 'vv-right' },
      this.cards,
      h('div', { class: 'vv-sec' }, h('h4', {}, 'Live trend · output Hz & current'), this.chart),
      h('div', { class: 'vv-sec' }, h('h4', {}, 'Parameters'), h('div', { class: 'search-box', html: icon('search', 18) }, this.search), this.paramsEl),
      h('div', { class: 'vv-sec' }, h('h4', {}, 'Modbus registers (RS-485)'), modbusRef()),
      h('div', { class: 'vv-sec' }, h('h4', {}, 'Fault codes (Pr.06-17 ~ 06-22)'), faultRef()));
    this.empty = h('div', { class: 'empty-state vv-empty hidden' },
      h('div', { class: 'empty-ic big', html: icon('gauge', 36) }), h('h2', {}, 'No VFD in this lab'),
      h('p', {}, 'Add a Delta MS300 drive and a motor from the Lab tab (＋).'),
      h('button', { class: 'btn btn-primary', html: `${icon('cube', 18)}<span>Open the lab</span>`, onclick: () => this.lab.setTab('panel') }));
    this.body = h('div', { class: 'vv-body' }, h('div', { class: 'vv-left' }, this.picker, this.pad), this.right);
    this.el.append(this.empty, this.body);
  }

  onShow() { this.refresh(); }
  onHardwareChanged() { this.refresh(); }
  onSimStart() { this.trend = []; this.refresh(); }
  onSimStop() { this.refresh(); }

  refresh() {
    const devs = this.vfdDevs();
    this.empty.classList.toggle('hidden', devs.length > 0);
    this.body.classList.toggle('hidden', !devs.length);
    if (!devs.length) return;
    this.picker.innerHTML = '';
    if (devs.length > 1) devs.forEach((d, i) => this.picker.appendChild(h('button', { class: 'chip' + (i === this.idx ? ' active' : ''), onclick: () => { this.idx = i; this.trend = []; this.refresh(); } }, `VFD ${i + 1} · station ${(d.state.params && d.state.params['09-00']) || 1}`)));
    this.drawDisplay();
    this.drawCards();
    this.drawParams();
    this.drawChart();
  }

  /** Touch behaviour of a key: ▲ repeats while held, ◀/▼ is ▼ on a tap and ◀ when held. */
  bindKey(b, k) {
    let timer = null, held = false;
    const stop = (fire) => {
      clearTimeout(timer); timer = null;
      if (k === 'LD' && fire && !held) this.press('DOWN');
      b.classList.remove('down');
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      held = false;
      b.classList.add('down');
      if (k === 'LD') { timer = setTimeout(() => { held = true; this.press('LEFT'); }, 550); return; }
      this.press(k);
      if (k === 'UP') {
        const rep = () => { this.press('UP', true); timer = setTimeout(rep, 90); };
        timer = setTimeout(rep, 450);
      }
    });
    b.addEventListener('pointerup', () => stop(true));
    b.addEventListener('pointercancel', () => stop(false));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Drag the dial round (−135° … +135° = 0 … Pr.01-00). */
  bindKnob() {
    let hinted = false;
    const setFrom = (e) => {
      const r = this.knob.getBoundingClientRect();
      const a = Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
      const v = Math.max(0, Math.min(1, (a + 135) / 270));
      const dev = this.dev();
      if (!dev) return;
      const rt = this.rt();
      let hint = null;
      if (rt) hint = this.lab.sys.act(dev.id, 'vfdKnob', v); else dev.state.knob = v;
      if (hint && !hinted) { hinted = true; toast(hint, 'info', 4200); }
      this.drawKnob();
      if (this.lab.scene) this.lab.scene.dirty = true;
    };
    this.knob.addEventListener('pointerdown', (e) => { e.preventDefault(); hinted = false; try { this.knob.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } this.knobDrag = true; setFrom(e); });
    this.knob.addEventListener('pointermove', (e) => { if (this.knobDrag) setFrom(e); });
    const end = () => { if (this.knobDrag) { this.knobDrag = false; this.lab.save(); } };
    this.knob.addEventListener('pointerup', end);
    this.knob.addEventListener('pointercancel', end);
  }

  drawKnob() {
    const dev = this.dev();
    if (!dev) return;
    const k = Math.max(0, Math.min(1, dev.state.knob ?? 0));
    this.knob.style.setProperty('--a', (-135 + 270 * k).toFixed(1) + 'deg');
    const rt = this.rt();
    const P = rt ? rt.vfd.params : { ...defaultParams(), ...(dev.state.params || {}) };
    this.knobVal.textContent = (k * P['01-00']).toFixed(1) + ' Hz' + (P['00-20'] === 7 ? '' : ' ·off');
    this.knobVal.classList.toggle('off', P['00-20'] !== 7);
  }

  press(k, quiet = false) {
    const rt = this.rt();
    if (!rt) { toast(this.lab.sys ? 'The drive has no power — check R/L1 and S/L2' : 'Press Simulate to power the drive', 'info'); return; }
    if (!rt.vfd.powered) { toast('The drive has no power — check R/L1 and S/L2', 'warn'); return; }
    const hint = this.lab.sys.act(rt.dev.id, 'vfdKey', k);
    const m = this.lab.scene && this.lab.scene.modelOf(rt.dev.id);
    if (m && m.press) m.press(k);
    if (!quiet) Native.vibrate(8);
    if (hint && !quiet) toast(hint, 'info', 4200);
    this.drawDisplay();
    this.drawCards();
    this.drawParams();
  }

  drawDisplay() {
    const rt = this.rt();
    const g = this.disp.getContext('2d');
    g.fillStyle = '#0b0303'; g.fillRect(0, 0, this.disp.width, this.disp.height);
    const d = rt ? rt.vfd.display(rt.vfd.time) : { off: true, leds: {} };
    if (!d.off) drawSegDisplay(g, this.disp.width, this.disp.height, d.text, { n: 5, cursor: d.cursor ?? -1, blink: Math.floor(performance.now() / 330) % 2 === 0 });
    for (const s of [...this.leds.children, ...this.leds2.children]) s.classList.toggle('on', !!d.leds[s.dataset.led]);
    this.pad.classList.toggle('off', !!d.off);
    this.drawKnob();
  }

  drawCards() {
    const rt = this.rt();
    const v = rt && rt.vfd;
    const dev = this.dev();
    const P = v ? v.params : { ...defaultParams(), ...(dev.state.params || {}) };
    const src = (id) => { const p = VFD_PARAMS.find((x) => x.id === id); return p.opts[P[id]] || P[id]; };
    const card = (label, val, unit = '', cls = '') => h('div', { class: 'vv-card ' + cls }, h('small', {}, label), h('b', {}, val, unit ? h('span', {}, unit) : null));
    this.cards.innerHTML = '';
    const motor = v && rt.motorId ? this.lab.sys.rts.get(rt.motorId) : null;
    const state = !v ? 'OFF' : !v.powered ? 'NO POWER' : v.fault ? 'FAULT ' + v.fault : v.runCmd ? (Math.abs(v.f) < Math.abs(v.fcmd) - 0.05 ? 'ACCEL' : 'RUN') : v.f !== 0 ? 'DECEL' : 'STOP';
    this.cards.append(
      card('Status', state, '', v && v.fault ? 'err' : v && v.runCmd ? 'ok' : ''),
      card('Frequency command', v && v.powered ? v.fcmd.toFixed(2) : '—', 'Hz'),
      card('Output frequency', v && v.powered ? Math.abs(v.f).toFixed(2) : '—', 'Hz', 'hz'),
      card('Output current', v && v.powered ? v.I.toFixed(2) : '—', 'A'),
      card('Motor speed', motor ? Math.round(Math.abs(motor.rpm)) + (motor.rpm < -1 ? ' ⟲' : '') : '—', 'rpm'),
      card('DC bus / output', v && v.powered ? `${v.dc.toFixed(0)} / ${v.V.toFixed(0)}` : '—', 'V'),
      card('Max. frequency Pr.01-00', Number(P['01-00']).toFixed(2), 'Hz'),
      card('Accel / decel time', `${P['01-12']} / ${P['01-13']}`, 's'),
      card('Run command from', src('00-21'), '', 'wide'),
      card('Frequency from', src('00-20'), '', 'wide'));
    if (v && v.stall) this.cards.appendChild(h('div', { class: 'vv-note' }, v.stall === 'oc' ? 'Over-current stall prevention (Pr.06-03): the drive holds its frequency until the current drops, so the acceleration takes longer.' : 'Over-voltage stall prevention (Pr.06-01): the drive slows its deceleration to keep the DC bus below the limit.'));
    if (v && v.standby) this.cards.appendChild(h('div', { class: 'vv-note' }, `Standby: the frequency command is below the start-up frequency Pr.01-09 (${P['01-09']} Hz).`));
    const rec = ['06-17', '06-18', '06-19'].map((id) => P[id]).filter(Boolean);
    if (rec.length) this.cards.appendChild(h('div', { class: 'vv-note' }, 'Fault record (newest first): ' + rec.map(faultName).join(', ')));
    if (v && v.fault) this.cards.appendChild(h('div', { class: 'vv-fault' }, h('b', {}, v.fault), FAULTS[v.fault].text, ' — press STOP/RESET.'));
  }

  frame(dt) {
    this.acc = (this.acc || 0) + dt;
    this.dispAcc = (this.dispAcc || 0) + dt;
    if (this.dispAcc > 0.1) { this.dispAcc = 0; this.drawDisplay(); }
    if (this.acc < 0.25) return;
    this.acc = 0;
    const rt = this.rt();
    if (rt) {
      const motor = rt.motorId ? this.lab.sys.rts.get(rt.motorId) : null;
      this.trend.push([this.lab.sys.time, Math.abs(rt.vfd.f), rt.vfd.I, motor ? Math.abs(motor.rpm) : 0]);
      while (this.trend.length && this.trend[0][0] < this.lab.sys.time - 30) this.trend.shift();
    }
    this.drawCards();
    this.drawChart();
  }

  drawChart() {
    const c = this.chart;
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(148,163,184,.12)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = 8 + (H - 26) * i / 4; g.beginPath(); g.moveTo(30, y); g.lineTo(W - 6, y); g.stroke(); }
    const dev = this.dev();
    const fmax = (this.rt() ? this.rt().vfd.params['01-00'] : (dev && dev.state.params && dev.state.params['01-00'])) || 50;
    g.fillStyle = '#64748b'; g.font = '600 10px Inter, sans-serif'; g.textAlign = 'right';
    g.fillText(String(fmax), 26, 12); g.fillText('0', 26, H - 16);
    const d = this.trend;
    if (d.length > 1) {
      const t1 = d[d.length - 1][0];
      const X = (t) => 30 + (W - 36) * (1 - (t1 - t) / 30);
      const Y = (v, max) => 8 + (H - 26) * (1 - Math.max(0, Math.min(1, v / max)));
      for (const [k, col, max] of [[1, '#22d3ee', fmax], [2, '#f59e0b', 8]]) {
        g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
        d.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[k], max)) : g.moveTo(X(p[0]), Y(p[k], max))));
        g.stroke();
      }
    }
    g.textAlign = 'left'; g.font = '700 11px Inter, sans-serif';
    g.fillStyle = '#22d3ee'; g.fillText('■ Hz', 34, H - 3);
    g.fillStyle = '#f59e0b'; g.fillText('■ A (0–8)', 80, H - 3);
    if (d.length < 2) { g.fillStyle = '#475569'; g.textAlign = 'center'; g.fillText(this.lab.sys ? 'collecting…' : 'Simulate to see the trend', W / 2, H / 2); }
  }

  drawParams() {
    const dev = this.dev();
    if (!dev) return;
    const rt = this.rt();
    const P = rt ? rt.vfd.params : { ...defaultParams(), ...(dev.state.params || {}) };
    const q = this.q;
    this.paramsEl.innerHTML = '';
    for (const grp of PARAM_GROUPS) {
      const list = VFD_PARAMS.filter((p) => p.id.startsWith(grp + '-') && (!q || (p.id + ' ' + p.name + ' ' + Object.values(p.opts || {}).join(' ')).toLowerCase().includes(q)));
      if (!list.length) continue;
      this.paramsEl.appendChild(h('div', { class: 'vp-group' }, `${grp} · ${GROUP_NAMES[grp]}`));
      for (const p of list) {
        const v = P[p.id];
        const changed = v !== p.def;
        const shown = p.opts && p.opts[v] !== undefined ? `${fmtV(v, p)} · ${p.opts[v]}` : `${fmtV(v, p)}${p.unit ? ' ' + p.unit : ''}`;
        this.paramsEl.appendChild(h('button', { class: 'vp-row' + (changed ? ' changed' : '') + (p.ro ? ' ro' : ''), onclick: () => this.editParam(p) },
          h('span', { class: 'vp-id' }, p.id), h('span', { class: 'vp-name' }, p.name), h('span', { class: 'vp-val' }, shown)));
      }
    }
  }

  editParam(p) {
    if (p.ro) { toast(`${p.id} is read-only`); return; }
    const dev = this.dev();
    const rt = this.rt();
    const P = rt ? rt.vfd.params : { ...defaultParams(), ...(dev.state.params || {}) };
    const content = h('div', { class: 'props' });
    content.appendChild(h('p', { class: 'muted small' }, `Modbus address ${paramAddr(p.id).toString(16).toUpperCase().padStart(4, '0')}H · default ${fmtV(p.def, p)}${p.unit ? ' ' + p.unit : ''}${p.min !== undefined ? ` · range ${p.min}–${p.max}` : ''}`));
    const apply = (val) => {
      let err;
      if (rt && rt.vfd.powered) { err = rt.vfd.setParam(p.id, val); if (!err) this.lab.sys.persistVfd(rt); }
      else {
        const tmp = new VfdMS300(dev.state.params || {});
        err = tmp.setParam(p.id, val);
        if (!err) dev.state.params = tmp.snapshotParams();
      }
      if (err) { toast(err, 'warn'); return false; }
      this.lab.save();
      this.drawParams(); this.drawCards();
      toast(`${p.id} = ${fmtV(val, p)}${p.unit ? ' ' + p.unit : ''}`, 'ok');
      return true;
    };
    if (p.opts) {
      for (const [v, label] of Object.entries(p.opts)) {
        content.appendChild(h('button', { class: 'vp-opt' + (String(P[p.id]) === v ? ' active' : ''), onclick: () => { if (apply(+v)) sheet.close(); } }, h('b', {}, v), h('span', {}, label)));
      }
    } else {
      const inp = h('input', { class: 'input', type: 'number', value: P[p.id], step: 10 ** -p.dec, min: p.min, max: p.max, inputmode: 'decimal' });
      content.append(h('div', { class: 'field' }, h('label', {}, `Value${p.unit ? ' (' + p.unit + ')' : ''}`), inp),
        h('div', { class: 'props-actions' }, h('button', { class: 'btn btn-ghost', onclick: () => { inp.value = p.def; } }, 'Default'), h('button', { class: 'btn btn-primary', html: `${icon('check', 18)}<span>Set</span>`, onclick: () => { const v = parseFloat(inp.value); if (Number.isFinite(v) && apply(v)) sheet.close(); } })));
      setTimeout(() => inp.focus(), 250);
    }
    const sheet = new Sheet({ title: `Pr.${p.id} · ${p.name}`, content, icon: 'gauge' });
    sheet.open();
    void deviceProps;
  }
}

function fmtV(v, p) { return p.dec ? Number(v).toFixed(p.dec) : String(v); }

function modbusRef() {
  const rows = [
    ['2000H', 'W', 'Command: H1 = STOP, H12 = RUN FWD, H22 = RUN REV'],
    ['2001H', 'W', 'Frequency command, 0.01 Hz (5000 = 50.00 Hz)'],
    ['2002H', 'W', 'bit0 = EF (external fault), bit1 = fault reset'],
    ['2100H', 'R', 'Low byte: fault code (0 = none, 1 = ocA, 8 = ovd, 49 = EF …), high byte: warning (58 = CE10)'],
    ['2101H', 'R', 'Status: bit0–1 run state, bit3–4 direction'],
    ['2102H', 'R', 'Frequency command (0.01 Hz)'],
    ['2103H', 'R', 'Output frequency (0.01 Hz)'],
    ['2104H', 'R', 'Output current (0.01 A)'],
    ['2105H', 'R', 'DC bus voltage (0.1 V)'],
    ['2106H', 'R', 'Output voltage (0.1 V)'],
    ['2107H', 'R', 'Multi-step speed step in use'],
    ['210CH', 'R', 'Motor speed (rpm)'],
    ['GGnnH', 'R/W', 'Parameter GG-nn, e.g. 010CH = Pr.01-12'],
  ];
  return h('div', { class: 'mb-ref' }, ...rows.map(([a, rw, t]) => h('div', { class: 'mb-row' }, h('code', {}, a), h('span', { class: 'mb-rw' }, rw), h('span', {}, t))),
    h('p', { class: 'muted small' }, 'Set Pr.00-21 = 2 (run) and Pr.00-20 = 1 (frequency) so the drive obeys RS-485. Match Pr.09-01 / 09-04 with the PLC (D1120, M1143).'));
}

function faultRef() {
  return h('div', { class: 'mb-ref' }, ...Object.entries(FAULTS).map(([k, f]) => h('div', { class: 'mb-row' + (f.sim ? ' sim' : '') }, h('code', {}, k), h('span', { class: 'mb-rw' }, String(f.n)), h('span', {}, f.text, f.sim ? h('em', {}, ' · simulated') : null))),
    h('p', { class: 'muted small' }, 'The drive shows the code blinking; STOP/RESET (or an MI set to 5, or 2002H bit 1) clears it. Codes marked "simulated" can happen in this lab.'));
}
