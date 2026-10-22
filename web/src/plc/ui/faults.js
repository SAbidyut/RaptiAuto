// Fault finding in the Lab tab: a multimeter that measures between any two terminals (V AC / DC with
// the simulation running, Ω and continuity with the power off) and the troubleshooting challenge —
// the lab hides a fault (a broken wire, a burnt lamp, an open coil, a dead PLC input …), the student
// finds it by measuring and reports it; time, measurements and wrong guesses give the score.
import { h, toast, Sheet, dialog } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import { findPort } from '../devices/defs.js';
import { LabSystem } from '../sim/system.js';
import { faultCandidates, pickFaults, sameFault, measure } from '../sim/faults.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ====================================================================== the UI (Lab tab)
export class FaultTools {
  constructor(panel) {
    this.panel = panel;
    this.lab = panel.lab;
    this.meter = { on: false, mode: 'V', red: null, black: null, next: 'red' };
    this.reportPick = false;
    this.card = h('div', { class: 'meter-card hidden' });
    this.bar = h('div', { class: 'fault-bar hidden' });
    panel.el.append(this.bar, this.card);
    this.updateBar();
  }

  get P() { return this.lab.project; }
  get fault() { const f = this.P.fault; return f && f.active ? f : null; }
  name(dev) { return this.lab.deviceName(dev); }

  // ------------------------------------------------------------------ multimeter
  toggleMeter(on = !this.meter.on) {
    this.meter.on = on;
    if (on) {
      this.panel.cancelWiring();
      if (!this.lab.settings.meterHinted) { this.lab.settings.meterHinted = true; this.lab.app.saveSettings(); this.panel.hint('Multimeter: tap a terminal for the red probe, then another for the black probe (COM). V measures with the simulation running; Ω needs the power OFF.', 7500); }
    }
    this.card.classList.toggle('hidden', !on);
    this.panel.el.classList.toggle('meter-on', on);
    if (this.panel.meterBtn) this.panel.meterBtn.classList.toggle('on', on);
    this.drawMarkers();
    this.render();
    Native.vibrate(8);
  }

  /** Probe a terminal (taps alternate red, black). */
  probe(dev, port) {
    const m = this.meter, end = { dev: dev.id, port: port.id };
    if (m.next === 'red') { m.red = end; m.next = 'black'; } else { m.black = end; m.next = 'red'; }
    if (m.red && m.black && this.fault) { this.fault.measures = (this.fault.measures || 0) + 1; this.updateBar(); }
    this.drawMarkers();
    this.render(true);
    Native.vibrate(6);
  }

  drawMarkers() {
    const m = this.meter, list = [];
    if (m.on && m.red) list.push({ devId: m.red.dev, portId: m.red.port, color: '#ef4444', pulse: m.next === 'red' });
    if (m.on && m.black) list.push({ devId: m.black.dev, portId: m.black.port, color: '#e2e8f0', pulse: m.next === 'black' });
    this.panel.scene.setMarkers(list);
  }

  /** A system without power for Ω readings while the simulation is stopped (rebuilt when the lab changes). */
  dead() {
    const key = JSON.stringify([this.P.devices, this.P.conns, this.P.fault]);
    if (!this.deadSys || this.deadKey !== key) {
      this.deadSys = new LabSystem(JSON.parse(JSON.stringify({ ...this.P, devices: this.P.devices, conns: this.P.conns })), { dead: true });
      this.deadSys.solve();
      this.deadKey = key;
    }
    return this.deadSys;
  }

  render(fresh = false) {
    if (!this.meter.on) return;
    const m = this.meter, P = this.P;
    const sys = this.lab.sys;
    let r;
    try { r = measure(P, sys, m.mode, m.red, m.black, () => this.dead()); } catch (e) { r = { text: 'Err', unit: '', sub: String(e.message || e) }; }
    if (fresh && r.beep) Native.vibrate(40);
    const label = (e) => { if (!e) return '—'; const d = P.devices.find((x) => x.id === e.dev), p = d && findPort(d, e.port); return d && p ? `${esc(this.name(d))} · <b>${esc(p.label)}</b>` : '—'; };
    const sig = JSON.stringify([r, m.mode, m.red, m.black, m.next]);
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    this.card.innerHTML = '';
    const lcd = h('div', { class: 'mm-lcd' + (r.warn ? ' warn' : '') }, h('span', { class: 'mm-val' }, r.text), h('span', { class: 'mm-unit' }, r.unit));
    const modes = h('div', { class: 'mm-modes' },
      h('button', { class: 'mm-mode' + (m.mode === 'V' ? ' on' : ''), onclick: () => { m.mode = 'V'; this.lastSig = null; this.render(); } }, 'V ~⎓'),
      h('button', { class: 'mm-mode' + (m.mode === 'R' ? ' on' : ''), onclick: () => { m.mode = 'R'; this.lastSig = null; this.render(true); } }, 'Ω ♪'));
    const probes = h('div', { class: 'mm-probes' },
      h('div', { class: 'mm-probe red' + (m.next === 'red' ? ' next' : ''), html: `<i></i><span>${label(m.red)}</span>` }),
      h('div', { class: 'mm-probe com' + (m.next === 'black' ? ' next' : ''), html: `<i></i><span>${label(m.black)}</span>` }));
    this.card.append(
      h('div', { class: 'mm-head', html: `${icon('meter', 16)}<span>Multimeter</span>` }),
      lcd, h('div', { class: 'mm-sub' }, r.sub || ''), modes, probes,
      h('div', { class: 'mm-actions' },
        h('button', { class: 'chip', html: `${icon('restart', 13)}<span>Clear</span>`, onclick: () => { m.red = m.black = null; m.next = 'red'; this.drawMarkers(); this.lastSig = null; this.render(); } }),
        h('button', { class: 'chip', html: `${icon('flip', 13)}<span>Swap</span>`, onclick: () => { [m.red, m.black] = [m.black, m.red]; this.drawMarkers(); this.lastSig = null; this.render(); } })),
      h('button', { class: 'sel-close', html: icon('close', 18), onclick: () => this.toggleMeter(false) }));
  }

  // ------------------------------------------------------------------ taps (from PanelView.tap)
  /** Handles a tap while the meter or a report is active. Returns true when it used it. */
  onTap(x, y) {
    const sc = this.panel.scene;
    if (this.reportPick) {
      const cable = sc.pickCable(x, y);
      const dev = cable ? null : sc.pickDevice(x, y);
      if (cable || dev) { this.reportPick = false; this.updateBar(); this.askWhat(cable ? { conn: cable } : { dev }); }
      else this.panel.hint('Tap the faulty wire or the faulty device');
      return true;
    }
    if (!this.meter.on) return false;
    const near = sc.portsNear(x, y, 34);
    if (!near.length) return false;
    const amb = near.filter((p) => p.d <= near[0].d * 1.4 + 7).slice(0, 6);
    if (amb.length > 1 && near[0].d > 6) this.panel.showChooser(amb, x, y, (dev, port) => this.probe(dev, port));
    else this.probe(near[0].dev, near[0].port);
    return true;
  }

  /** While probing, a finger on a terminal probes it instead of pressing a control under it. */
  wantsPort(x, y) { return this.meter.on && this.panel.scene.portsNear(x, y, 16).length > 0; }

  frame() {
    if (this.meter.on) this.render();
    if (this.fault) this.updateBar();
  }

  // ------------------------------------------------------------------ the challenge
  openChallenge() {
    if (this.fault) { this.showStatus(); return; }
    const cands = faultCandidates(this.P, (d) => this.name(d));
    if (!cands.length) { toast('Wire the lab first: the faults hide in wires and devices that are in use', 'warn', 3600); return; }
    let level = 'normal', mode = 'random';
    const content = h('div', { class: 'fault-start' });
    const best = this.P.faultBest;
    content.append(
      h('p', { class: 'muted' }, 'The lab hides a fault — a broken wire, a burnt lamp, an open coil, a damaged PLC input or output, a faulty sensor … Run the machine, watch what does not work, then find the fault with the multimeter and report it.'),
      best ? h('p', { class: 'fault-best', html: `${icon('award', 15)}<span>Best score in this lab: <b>${best.score}</b> (${fmtTime(best.secs)}, ${best.measures} measurements)</span>` }) : null);
    const seg = (title, opts, get, set) => {
      const g = h('div', { class: 'opt-grid' });
      for (const [v, label] of opts) {
        const b = h('button', { class: 'opt' + (get() === v ? ' active' : ''), onclick: () => { set(v); for (const x of g.children) x.classList.toggle('active', x === b); pick.classList.toggle('hidden', mode !== 'teacher'); } }, label);
        g.appendChild(b);
      }
      return h('div', { class: 'field' }, h('label', {}, title), g);
    };
    const chosen = new Set();
    const pick = h('div', { class: 'fault-pick hidden' }, ...cands.map((c, i) => {
      const cb = h('input', { type: 'checkbox', onchange: () => { if (cb.checked) chosen.add(i); else chosen.delete(i); } });
      return h('label', { class: 'fault-opt' }, cb, h('span', {}, c.label));
    }));
    content.append(
      seg('Level', [['easy', 'Easy · 1 fault + hint'], ['normal', 'Normal · 1 fault'], ['hard', 'Hard · 2 faults']], () => level, (v) => { level = v; }),
      seg('Who picks the fault', [['random', 'Random (practice)'], ['teacher', 'Teacher picks']], () => mode, (v) => { mode = v; }),
      pick,
      h('div', { class: 'props-actions' }, h('button', { class: 'btn btn-primary', html: `${icon('play', 17)}<span>Start</span>`, onclick: () => {
        const items = mode === 'teacher' ? [...chosen].map((i) => cands[i]) : pickFaults(cands, level === 'hard' ? 2 : 1);
        if (!items.length) { toast('Tick at least one fault', 'warn'); return; }
        sheet.close();
        this.start(items, level, mode);
      } })));
    const sheet = new Sheet({ title: 'Fault finding', content, icon: 'target', cls: 'sheet-tall' });
    sheet.open();
  }

  start(items, level, mode) {
    this.P.fault = { active: true, items: items.map(({ label, hint, ...it }) => ({ ...it, label, hint })), found: [], level, mode, t0: Date.now(), measures: 0, wrong: 0 };
    this.lab.save();
    if (!this.lab.sys) this.lab.startSim();
    this.toggleMeter(true);
    this.updateBar();
    const hint = level === 'easy' ? ` Hint: look at ${items.map((i) => i.hint).join(' and ')}.` : '';
    dialog({ title: 'The fault is in!', body: `<p>${items.length > 1 ? 'Two faults are' : 'A fault is'} hidden in this lab. Operate the machine and see what does not work, then measure: <b>V</b> with the power on, <b>Ω</b> with it off.${esc(hint)}</p><p class="muted">When you have found it, press <b>Report</b> and tap the faulty wire or device.</p>`, actions: [{ label: 'Go', value: true, cls: 'btn-primary' }] });
  }

  updateBar() {
    const f = this.fault;
    this.bar.classList.toggle('hidden', !f);
    if (!f) return;
    const secs = Math.round((Date.now() - f.t0) / 1000);
    const left = f.items.length - f.found.length;
    const html = this.reportPick
      ? `<span class="fb-t">${icon('target', 15)} Tap the faulty wire or device</span>`
      : `<span class="fb-t">${icon('target', 15)} <b>${fmtTime(secs)}</b> · ${f.measures || 0} measurements${left > 1 ? ` · ${left} faults left` : ''}</span>`;
    const sig = html + this.reportPick;
    if (sig === this.barSig) return;
    this.barSig = sig;
    this.bar.innerHTML = html;
    if (this.reportPick) this.bar.appendChild(h('button', { class: 'chip', onclick: () => { this.reportPick = false; this.updateBar(); } }, 'Cancel'));
    else {
      this.bar.appendChild(h('button', { class: 'chip fb-report', html: `${icon('check', 14)}<span>Report</span>`, onclick: () => { this.reportPick = true; this.panel.cancelWiring(); this.updateBar(); this.panel.hint('Tap the faulty wire or the faulty device'); } }));
      this.bar.appendChild(h('button', { class: 'chip', html: `${icon('dots', 14)}`, 'aria-label': 'More', onclick: () => this.showStatus() }));
    }
  }

  /** What is wrong with the wire / device the student tapped? */
  askWhat(sel) {
    const P = this.P, f = this.fault;
    if (!f) return;
    const cands = faultCandidates(P, (d) => this.name(d)).filter((c) => (sel.conn ? c.conn === sel.conn : c.dev === sel.dev));
    const what = sel.conn ? 'this wire' : this.name(P.devices.find((d) => d.id === sel.dev));
    const content = h('div', { class: 'fault-what' });
    if (!cands.length) content.appendChild(h('p', { class: 'muted' }, 'This part is not in a circuit that is in use — the fault is somewhere else.'));
    for (const c of cands) {
      content.appendChild(h('button', { class: 'fault-choice', onclick: () => { sheet.close(); this.judge(c); } }, c.label.replace(/^[^:]*: /, '')));
    }
    content.appendChild(h('button', { class: 'btn btn-ghost', onclick: () => sheet.close() }, 'Cancel'));
    const sheet = new Sheet({ title: `What is wrong with ${what}?`, content, icon: 'target' });
    sheet.open();
  }

  judge(c) {
    const f = this.fault;
    const hit = f.items.find((it) => sameFault(it, c) && !f.found.some((x) => sameFault(x, it)));
    if (!hit) {
      f.wrong = (f.wrong || 0) + 1;
      this.lab.save();
      Native.vibrate([30, 60, 30]);
      toast('Not this one — measure again', 'warn', 3000);
      return;
    }
    f.found.push(hit);
    this.lab.save();
    Native.vibrate(40);
    if (f.found.length < f.items.length) { toast('Found one! One more fault is hidden…', 'ok', 3500); this.updateBar(); return; }
    this.finish(true);
  }

  showStatus() {
    const f = this.fault;
    if (!f) return;
    dialog({
      title: 'Fault finding',
      body: `<p>${fmtTime(Math.round((Date.now() - f.t0) / 1000))} · ${f.measures || 0} measurements · ${f.wrong || 0} wrong reports.</p><p class="muted">Give up to see where the fault was.</p>`,
      actions: [{ label: 'Give up', value: 'up' }, { label: 'Continue', value: null, cls: 'btn-primary' }],
    }).then((v) => { if (v === 'up') this.finish(false); });
  }

  finish(won) {
    const f = this.fault;
    const secs = Math.round((Date.now() - f.t0) / 1000);
    const score = won ? Math.max(10, Math.round(100 - 3 * Math.max(0, (f.measures || 0) - 12) - 20 * (f.wrong || 0) - 2 * Math.max(0, Math.floor((secs - 180) / 30)))) : 0;
    const stars = score >= 85 ? 3 : score >= 60 ? 2 : score > 0 ? 1 : 0;
    const list = f.items.map((it) => `<li>${esc(it.label)}</li>`).join('');
    f.active = false;
    if (won && (!this.P.faultBest || score > this.P.faultBest.score)) this.P.faultBest = { score, secs, measures: f.measures || 0 };
    this.lab.save();
    this.updateBar();
    // point at the fault
    const first = f.items[0];
    if (first.conn) this.panel.select({ kind: 'conn', id: first.conn }); else if (first.dev) this.panel.select({ kind: 'dev', id: first.dev });
    dialog({
      title: won ? `Fault found! ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}` : 'The fault was …',
      body: `<ul class="fault-list">${list}</ul>${won ? `<p>Score <b>${score}</b> · ${fmtTime(secs)} · ${f.measures || 0} measurements · ${f.wrong || 0} wrong reports.</p>` : ''}<p class="muted">The lab is repaired. Start a new challenge from the tool rail any time.</p>`,
      actions: [{ label: 'OK', value: true, cls: 'btn-primary' }],
    });
  }
}

function fmtTime(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
