// Monitor tab: online device monitor (X / Y / M / T / C / D), a watch list, and a communication
// analyser that shows the real Modbus frames on COM1 (HMI) and COM2 (VFD).
import { h, toast, promptDialog, popupMenu } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { parseOperand, fmtAddr, addrSortKey, SPECIAL } from '../sim/address.js';

export class MonitorView {
  constructor(lab) {
    this.lab = lab;
    this.sub = 'devices';
    this.filter = 'all';
    this.paused = false;
    this.el = h('section', { class: 'monitor-view' });
    this.seg = h('div', { class: 'segmented mv-seg' },
      ...[['devices', 'cpu', 'Devices'], ['watch', 'target', 'Watch'], ['log', 'terminal', 'Comm log']].map(([id, ic, label]) =>
        h('button', { class: 'seg' + (id === this.sub ? ' active' : ''), 'data-s': id, html: `${icon(ic, 15)}<span>${label}</span>`, onclick: () => { this.sub = id; for (const b of this.seg.children) b.classList.toggle('active', b.dataset.s === id); this.render(true); } })));
    this.head = h('div', { class: 'mv-head' }, this.seg);
    this.body = h('div', { class: 'mv-body' });
    this.el.append(this.head, this.body);
  }

  onShow() { this.render(true); }
  onSimStart() { this.render(true); }
  onSimStop() { this.render(true); }

  frame(dt) {
    this.acc = (this.acc || 0) + dt;
    if (this.acc < (this.sub === 'log' ? 0.3 : 0.2)) return;
    this.acc = 0;
    this.render(false);
  }

  cpu() {
    const s = this.lab.sys;
    if (!s || !s.plc || !s.plc.cpu.powered) return null;
    return s.pcLink().ok ? s.plc.cpu : null;
  }

  usedDevices() {
    const prog = this.lab.project.program;
    const set = new Set(Object.keys(prog.comments));
    for (const r of prog.rungs) for (const row of [...r.cells, r.outs]) for (const el of row) if (el && el.a) for (const a of el.a) if (/^[XYMSTCD]\d/.test(a || '')) set.add(a);
    return [...set];
  }

  render(full) {
    if (!this.visible) return;
    if (this.sub === 'log') { this.renderLog(full); return; }
    const sys = this.lab.sys;
    const cpu = this.cpu();
    if (!sys || !cpu) {
      const reason = !sys ? 'Press Simulate to power the lab.' : !sys.plc ? 'There is no PLC in this lab.' : !sys.plc.cpu.powered ? 'The PLC has no power.' : sys.pcLink().reason + '.';
      const key = 'off|' + reason;
      if (this.lastKey === key) return;
      this.lastKey = key;
      this.body.innerHTML = '';
      this.body.appendChild(h('div', { class: 'empty-state mv-empty' }, h('div', { class: 'empty-ic big', html: icon('activity', 34) }), h('h2', {}, 'Device monitor offline'), h('p', {}, reason),
        !sys ? h('button', { class: 'btn btn-primary', html: `${icon('play', 18)}<span>Simulate</span>`, onclick: () => this.lab.startSim() }) : null));
      return;
    }
    this.lastKey = null;
    if (this.sub === 'watch') this.renderWatch(cpu, full);
    else this.renderDevices(cpu, full);
  }

  // ------------------------------------------------------------------ devices
  renderDevices(cpu, full) {
    const model = this.lab.plcModel();
    if (full || !this.devEls) {
      this.body.innerHTML = '';
      this.devEls = {};
      const comments = this.lab.project.program.comments;
      const bits = (dev, n, title) => {
        const grid = h('div', { class: 'mv-bits' });
        const els = [];
        for (let i = 0; i < n; i++) {
          const a = fmtAddr(dev, i);
          const b = h('button', { class: 'mv-bit', title: comments[a] || a, onclick: (e) => this.bitMenu(e.currentTarget, dev, i) }, h('b', {}, a), comments[a] ? h('small', {}, comments[a].slice(0, 10)) : null);
          els.push(b);
          grid.appendChild(b);
        }
        this.devEls[dev] = els;
        return h('div', { class: 'mv-sec' }, h('h4', {}, title), grid);
      };
      this.body.append(bits('X', model.inputs, `Inputs X0–${fmtAddr('X', model.inputs - 1)}`), bits('Y', model.outputs, `Outputs Y0–${fmtAddr('Y', model.outputs - 1)}`));
      // M bits used in the program (or M0–M15)
      const used = this.usedDevices();
      const ms = [...new Set([...used.filter((a) => /^M/.test(a)), ...Array.from({ length: 8 }, (_, i) => 'M' + i)])].sort((a, b) => addrSortKey(a) - addrSortKey(b)).slice(0, 32);
      const mgrid = h('div', { class: 'mv-bits' });
      this.devEls.M = ms.map((a) => {
        const op = parseOperand(a);
        const b = h('button', { class: 'mv-bit', onclick: (e) => this.bitMenu(e.currentTarget, 'M', op.idx) }, h('b', {}, a), comments[a] ? h('small', {}, comments[a].slice(0, 10)) : SPECIAL[a] ? h('small', {}, SPECIAL[a].slice(0, 10)) : null);
        b.dataset.idx = op.idx;
        mgrid.appendChild(b);
        return b;
      });
      this.body.appendChild(h('div', { class: 'mv-sec' }, h('h4', {}, 'Auxiliary relays M'), mgrid));
      // words: T, C, D used
      const words = used.filter((a) => /^[TCD]/.test(a)).sort((a, b) => addrSortKey(a) - addrSortKey(b));
      for (const sp of ['D1010', 'D1120', 'M1129']) if (!words.includes(sp) && /^D/.test(sp)) words.push(sp);
      const table = h('div', { class: 'mv-words' });
      this.devEls.words = words.map((a) => {
        const op = parseOperand(a);
        const val = h('b', { class: 'mv-val' });
        const bit = /^[TC]/.test(a) ? h('i', { class: 'mv-led' }) : null;
        const row = h('button', { class: 'mv-word', onclick: () => this.wordEdit(op) }, h('span', { class: 'mv-addr' }, a), bit, h('span', { class: 'mv-cm' }, comments[a] || SPECIAL[a] || ''), val);
        table.appendChild(row);
        return { op, val, bit };
      });
      if (words.length) this.body.appendChild(h('div', { class: 'mv-sec' }, h('h4', {}, 'Timers, counters & data registers'), table));
      this.body.appendChild(h('p', { class: 'muted small center' }, 'Tap an input to force it, an output / relay to set it, a register to change its value.'));
    }
    const set = (els, dev) => els && els.forEach((b, i) => {
      const idx = dev === 'M' ? +b.dataset.idx : i;
      const on = !!cpu.read(dev, idx);
      if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
      const f = dev === 'X' ? cpu.forceX.get(idx) : dev === 'Y' ? cpu.forceY.get(idx) : undefined;
      b.classList.toggle('forced', f !== undefined);
    });
    set(this.devEls.X, 'X'); set(this.devEls.Y, 'Y'); set(this.devEls.M, 'M');
    for (const w of this.devEls.words || []) {
      const { op } = w;
      const v = op.dev === 'T' ? cpu.TV[op.idx] : op.dev === 'C' ? cpu.CV[op.idx] : cpu.D[op.idx];
      const t = op.text === 'D1120' ? '0x' + (v & 0xFFFF).toString(16).toUpperCase() : String(v);
      if (w.val.textContent !== t) w.val.textContent = t;
      if (w.bit) w.bit.classList.toggle('on', !!(op.dev === 'T' ? cpu.T[op.idx] : cpu.C[op.idx]));
    }
  }

  bitMenu(anchor, dev, idx) {
    const cpu = this.cpu();
    if (!cpu) return;
    const a = fmtAddr(dev, idx);
    if (dev === 'X' || dev === 'Y') {
      const map = dev === 'X' ? cpu.forceX : cpu.forceY;
      popupMenu(anchor, [
        { icon: 'bolt', label: `Force ${a} ON`, action: () => cpu.setForce(dev, idx, 1) },
        { icon: 'power', label: `Force ${a} OFF`, action: () => cpu.setForce(dev, idx, 0) },
        map.has(idx) ? { icon: 'close', label: `Release ${a}`, action: () => cpu.setForce(dev, idx, null) } : null,
      ]);
    } else {
      cpu.write(dev, idx, cpu.read(dev, idx) ? 0 : 1);
      toast(`${a} → ${cpu.read(dev, idx) ? 'ON' : 'OFF'}`);
    }
  }

  async wordEdit(op) {
    const cpu = this.cpu();
    if (!cpu) return;
    const cur = op.dev === 'T' ? cpu.TV[op.idx] : op.dev === 'C' ? cpu.CV[op.idx] : cpu.D[op.idx];
    const v = await promptDialog(`New value for ${op.text}`, String(cur));
    if (v === null || v === undefined || v === '') return;
    const n = /^0x/i.test(v) ? parseInt(v, 16) : parseInt(v, 10);
    if (!Number.isFinite(n)) return;
    cpu.write(op.dev === 'T' ? 'TV' : op.dev === 'C' ? 'CV' : 'D', op.idx, n);
  }

  // ------------------------------------------------------------------ watch
  renderWatch(cpu, full) {
    const P = this.lab.project;
    P.watch = P.watch || ['X0', 'Y0', 'M0', 'D0', 'T0'];
    if (full || !this.watchEls) {
      this.body.innerHTML = '';
      const inp = h('input', { class: 'input mono', placeholder: 'Add device: X0, M10, D20, T0, C0…', autocapitalize: 'characters' });
      const add = () => {
        const o = parseOperand(inp.value);
        if (!o || o.dev === 'K' || o.dev === 'H') { toast('Enter a device like D10 or M5', 'warn'); return; }
        if (!P.watch.includes(o.text)) P.watch.push(o.text);
        this.lab.save();
        this.render(true);
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      this.body.appendChild(h('div', { class: 'mv-add' }, inp, h('button', { class: 'btn btn-primary btn-icon', html: icon('plus', 20), onclick: add })));
      const list = h('div', { class: 'mv-words' });
      this.watchEls = P.watch.map((a) => {
        const op = parseOperand(a);
        const val = h('b', { class: 'mv-val' });
        const row = h('div', { class: 'mv-word' },
          h('span', { class: 'mv-addr' }, a), h('span', { class: 'mv-cm' }, P.program.comments[a] || SPECIAL[a] || ''), val,
          h('button', { class: 'icon-btn sm', html: icon('edit', 16), onclick: () => (/^[XYMS]/.test(a) ? this.bitMenu(row, op.dev, op.idx) : this.wordEdit(op)) }),
          h('button', { class: 'icon-btn sm', html: icon('close', 16), onclick: () => { P.watch = P.watch.filter((x) => x !== a); this.lab.save(); this.render(true); } }));
        list.appendChild(row);
        return { op, val };
      });
      this.body.appendChild(list);
    }
    for (const w of this.watchEls) {
      const { op } = w;
      let t;
      if (op.dev === 'D') t = String(cpu.D[op.idx]);
      else if (op.dev === 'T') t = `${cpu.TV[op.idx]} · ${cpu.T[op.idx] ? 'ON' : 'OFF'}`;
      else if (op.dev === 'C') t = `${cpu.CV[op.idx]} · ${cpu.C[op.idx] ? 'ON' : 'OFF'}`;
      else t = cpu.read(op.dev, op.idx) ? 'ON' : 'OFF';
      if (w.val.textContent !== t) { w.val.textContent = t; w.val.classList.toggle('on', t === 'ON' || /ON$/.test(t)); }
    }
  }

  // ------------------------------------------------------------------ comm log
  renderLog(full) {
    const sys = this.lab.sys;
    if (full || !this.logEls) {
      this.body.innerHTML = '';
      const chips = h('div', { class: 'chips-row mv-filter' },
        ...[['all', 'All'], ['COM1', 'COM1 · HMI'], ['COM2', 'COM2 · RS-485'], ['ERR', 'Errors']].map(([id, label]) => h('button', { class: 'chip' + (this.filter === id ? ' active' : ''), onclick: () => { this.filter = id; this.render(true); } }, label)),
        h('button', { class: 'chip', html: `${icon(this.paused ? 'play' : 'pause', 14)}<span>${this.paused ? 'Resume' : 'Pause'}</span>`, onclick: () => { this.paused = !this.paused; this.render(true); } }),
        h('button', { class: 'chip', html: `${icon('trash', 14)}<span>Clear</span>`, onclick: () => { if (sys) { sys.log.length = 0; } this.render(true); } }));
      this.logList = h('div', { class: 'mv-log' });
      this.body.append(chips, this.logList);
      this.logEls = true;
      this.lastSeq = -1;
    }
    if (!sys) {
      if (this.lastSeq !== -2) { this.logList.innerHTML = ''; this.logList.appendChild(h('div', { class: 'empty-state mv-empty' }, h('div', { class: 'empty-ic big', html: icon('terminal', 34) }), h('h2', {}, 'Communication analyser'), h('p', {}, 'Simulate the lab to see the Modbus frames between the HMI, PLC and VFD.'))); this.lastSeq = -2; }
      return;
    }
    if (this.paused) return;
    const seq = sys.logSeq;
    if (seq === this.lastSeq) return;
    this.lastSeq = seq;
    const rows = sys.log.filter((l) => this.filter === 'all' || (this.filter === 'ERR' ? l.dir === 'ERR' : l.link.startsWith(this.filter))).slice(-80).reverse();
    this.logList.innerHTML = '';
    if (!rows.length) this.logList.appendChild(h('p', { class: 'muted center' }, 'No frames yet. The HMI polls COM1; MODRW instructions use COM2.'));
    for (const l of rows) {
      this.logList.appendChild(h('div', { class: 'ml-row ' + l.dir.toLowerCase() },
        h('div', { class: 'ml-top' },
          h('span', { class: 'ml-t' }, l.t.toFixed(3) + ' s'),
          h('span', { class: 'ml-link' }, l.link),
          h('span', { class: 'ml-dir' }, l.dir),
          h('span', { class: 'ml-who' }, `${l.from} → ${l.to}`),
          h('span', { class: 'ml-info' }, l.info)),
        l.frame ? h('code', { class: 'ml-frame' }, l.frame) : null));
    }
  }
}
