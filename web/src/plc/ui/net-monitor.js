// Monitor → Network: every communication line of the lab as it is cabled — the RS-485 bus as a
// daisy chain from the master to the last station with its 120 Ω ends, the RS-232 HMI link and the
// USB programming link — with the live state of every station (OK / no reply / idle), the last
// value it sent, and (tap a station) its register map with live values.
import { h } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { DEVICE_DEFS, findPort, busName } from '../devices/defs.js';
import { commLines, stationInfo, netName, stationState, BUS_FACTS } from './comm-info.js';

const VFD_REGS = [
  [0x2000, 'Command word', 'H'], [0x2001, 'Frequency command', 'Hz'], [0x2100, 'Fault code', ''], [0x2101, 'Status', 'H'],
  [0x2102, 'Frequency command (read)', 'Hz'], [0x2103, 'Output frequency', 'Hz'], [0x2104, 'Output current', 'A'], [0x2106, 'Output voltage', 'V'],
];
const hex4 = (a) => a.toString(16).toUpperCase().padStart(4, '0') + 'H';

export class NetMonitor {
  constructor(lab) {
    this.lab = lab;
    this.open = new Set(); // expanded stations
    this.el = h('div', { class: 'nw' });
    this.sig = '';
  }

  /** Build the cards when the cabling changed, then refresh the live parts. */
  render(full) {
    const P = this.lab.project;
    const lines = commLines(P);
    const sig = JSON.stringify(lines.map((l) => [l.bus, l.nodes.map((n) => n.key)])) + '|' + P.devices.map((d) => d.id + JSON.stringify(d.props)).join(',');
    if (full || sig !== this.sig) { this.sig = sig; this.build(lines); }
    this.update();
  }

  build(lines) {
    const P = this.lab.project, sys = this.lab.sys;
    this.el.innerHTML = '';
    this.rows = [];
    const top = h('div', { class: 'nw-top' },
      h('div', { class: 'nw-top-t' }, h('b', {}, 'Communication'), h('span', {}, sys ? 'live' : 'Simulate to see the stations answer')),
      h('button', { class: 'btn btn-ghost sm', html: `${icon('cube', 16)}<span>Network view</span>`, onclick: () => { this.lab.setTab('panel'); const pv = this.lab.views.panel; if (!pv.netView) pv.toggleNet(true); } }));
    this.el.appendChild(top);
    this.issuesEl = h('div', { class: 'nw-issues' });
    this.el.appendChild(this.issuesEl);
    if (!lines.length) {
      this.el.appendChild(h('div', { class: 'empty-state mv-empty' }, h('div', { class: 'empty-ic big', html: icon('network', 34) }), h('h2', {}, 'No communication cables'),
        h('p', {}, 'In the Lab tab choose ⚡ Wire and tap a COM / RS-485 / USB port, then the port on the other device. Add Modbus devices with ＋ (Modbus RS-485 devices).')));
      return;
    }
    // RS-485 first, then RS-232, then USB
    const rank = { rs485: 0, rs232: 1, usb: 2 };
    for (const line of lines.slice().sort((a, b) => rank[a.bus] - rank[b.bus])) {
      const card = h('div', { class: `nw-card bus-${line.bus}` });
      const head = h('div', { class: 'nw-head' }, h('span', { class: `nw-bus ${line.bus}` }, busName(line.bus)), h('b', { class: 'nw-title' }, ''), h('span', { class: 'nw-sub' }, ''));
      card.appendChild(head);
      const list = h('div', { class: 'nw-chain' + (line.bus === 'rs485' ? ' bus' : '') });
      line.nodes.forEach((n) => {
        const def = DEVICE_DEFS[n.dev.type];
        const port = findPort(n.dev, n.port);
        const row = h('div', { class: 'nw-node' + (n.end && line.bus === 'rs485' ? ' end' : '') });
        const dot = h('i', { class: 'nw-dot' });
        const id = h('span', { class: 'nw-id' }, '');
        const state = h('span', { class: 'nw-state' }, '');
        const last = h('div', { class: 'nw-last' }, '');
        const regs = h('div', { class: 'nw-regs hidden' });
        const main = h('button', { class: 'nw-main', onclick: () => { if (this.open.has(n.key)) this.open.delete(n.key); else this.open.add(n.key); regs.classList.toggle('hidden', !this.open.has(n.key)); this.update(); } },
          dot,
          h('div', { class: 'nw-name' }, h('b', {}, netName(P, n.dev)), h('small', {}, `${port ? port.label : n.port}`)),
          id, state);
        row.append(main, last, regs);
        if (n.end && line.bus === 'rs485') row.appendChild(h('span', { class: 'nw-term', title: 'End of the line: 120 Ω terminating resistor' }, '120 Ω'));
        if (this.open.has(n.key)) regs.classList.remove('hidden');
        list.appendChild(row);
        this.rows.push({ n, def, line, dot, id, state, last, regs, head });
      });
      card.appendChild(list);
      const facts = h('details', { class: 'nw-facts' }, h('summary', {}, `How ${busName(line.bus)} works`), h('ul', {}, ...(BUS_FACTS[line.bus] || []).map((t) => h('li', {}, t))));
      card.appendChild(facts);
      this.el.appendChild(card);
      card._line = line; card._head = head;
    }
    this.el.appendChild(h('button', { class: 'btn btn-ghost nw-log', html: `${icon('terminal', 16)}<span>Every frame: Comm log</span>`, onclick: () => this.lab.views.monitor.setSub('log') }));
  }

  update() {
    const P = this.lab.project, sys = this.lab.sys;
    const now = sys ? sys.time : 0;
    // issues about the buses
    const iss = sys ? sys.issues.filter((i) => /RS-485|station|Format mismatch|cannot read the frames|COM2/.test(i.text)) : [];
    const ih = iss.map((i) => `<div class="nw-issue ${i.level}">${icon('warning', 15)}<span>${esc(i.text)}</span></div>`).join('');
    if (this.issuesEl && this.issuesEl._h !== ih) { this.issuesEl._h = ih; this.issuesEl.innerHTML = ih; }
    const heads = new Map();
    for (const r of this.rows || []) {
      const { n, def, line } = r;
      const info = stationInfo(P, n.dev, sys);
      let idText = '', st = 'idle', stText = sys ? 'idle' : '—', last = '';
      if (line.bus === 'rs485') {
        if (def.sim === 'plc' && info.master) { idText = 'MASTER'; st = 'master'; stText = info.fmt; if (!heads.has(line)) heads.set(line, `Modbus ${info.fmt}`); }
        else if (info.station) idText = `ID ${info.station}`;
        if (!(def.sim === 'plc' && info.master) && sys) {
          const s = stationState(sys, n.dev.id);
          const fresh = (t) => t >= 0 && now - t < 2;
          if (fresh(s.rep) && (!fresh(s.err) || s.rep >= s.err)) { st = 'ok'; stText = `OK · ${Math.max(0, now - s.rep).toFixed(1)} s`; last = s.data || s.lastInfo; }
          else if (fresh(s.err) || (fresh(s.req) && !fresh(s.rep))) { st = 'err'; stText = /time-out/.test(s.lastErr) || !s.lastErr ? 'no reply' : 'exception'; last = s.lastErr || 'The master asks, the station does not answer'; }
          else { stText = info.fmt; }
        } else if (!sys && def.sim !== 'plc') stText = info.fmt;
      } else if (line.bus === 'rs232') {
        idText = def.sim === 'hmi' ? 'HMI' : 'PLC';
        const ok = sys && sys.hmiLinkState.ok;
        st = !sys ? 'idle' : ok ? 'ok' : 'err';
        stText = !sys ? '—' : ok ? 'polling' : 'no link';
        last = sys && !ok ? sys.hmiLinkState.reason : def.sim === 'hmi' ? 'Delta DVP protocol · 9600 7E1 ASCII' : '';
        heads.set(line, 'HMI ↔ PLC');
      } else {
        idText = def.sim === 'laptop' ? 'PC' : 'PLC';
        const ok = sys && sys.pcLink().ok;
        st = !sys ? 'idle' : ok ? 'ok' : 'err';
        stText = !sys ? '—' : ok ? 'online' : 'offline';
        last = sys && !ok ? sys.pcLink().reason : def.sim === 'laptop' ? 'ISPSoft: download / monitor' : '';
        heads.set(line, 'Programming link');
      }
      if (r.id.textContent !== idText) r.id.textContent = idText;
      if (r.state.textContent !== stText) r.state.textContent = stText;
      const cls = 'nw-dot ' + st;
      if (r.dot.className !== cls) r.dot.className = cls;
      if (r.last.textContent !== last) r.last.textContent = last;
      if (this.open.has(n.key)) this.renderRegs(r, sys);
    }
    for (const card of this.el.querySelectorAll('.nw-card')) {
      const line = card._line;
      const t = heads.get(line) || (line.bus === 'rs485' ? 'Modbus (no master running)' : '');
      const title = card._head.querySelector('.nw-title');
      if (title.textContent !== t) title.textContent = t;
      const sub = card._head.querySelector('.nw-sub');
      const s = line.bus === 'rs485' ? `${line.nodes.length} devices · daisy chain` : '';
      if (sub.textContent !== s) sub.textContent = s;
    }
  }

  /** Register map of an expanded station with live values. */
  renderRegs(r, sys) {
    const rt = sys && sys.rts.get(r.n.dev.id);
    let rows = [];
    if (rt && rt.mb) rows = rt.mb.table().map((x) => [x.addr, x.kind, x.name + (x.note && x.note !== x.name ? ` — ${x.note}` : ''), x.text, x.rw ? 'R/W' : 'R']);
    else if (rt && rt.vfd) rows = VFD_REGS.map(([a, name, unit]) => { const v = rt.vfd.readReg(a); return [hex4(a), 'FC03/06', name, v === null ? '—' : unit === 'H' ? hex4(v).replace('H', '') + 'H' : unit === 'Hz' || unit === 'A' ? (v / 100).toFixed(2) + ' ' + unit : unit === 'V' ? (v / 10).toFixed(1) + ' V' : String(v), a < 0x2100 ? 'R/W' : 'R']; });
    else if (rt && rt.cpu) rows = [['1000H +n', 'FC03/06/16', 'D0 … D4095 (D n = 1000H + n)', '', 'R/W'], ['0800H +n', 'FC01/05', 'M0 … M1535', '', 'R/W'], ['0600H / 0E00H', 'FC03', 'T / C present values', '', 'R/W']];
    const html = rows.length ? `<table><thead><tr><th>Address</th><th>Register</th><th>Value</th><th></th></tr></thead><tbody>${rows.map((x) => `<tr><td class="a">${esc(x[0])}<small>${esc(x[1])}</small></td><td>${esc(x[2])}</td><td class="v">${esc(x[3])}</td><td class="rw">${x[4]}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted small">${sys ? 'No Modbus registers.' : 'Simulate to read the registers.'}</p>`;
    if (r.regs._h !== html) { r.regs._h = html; r.regs.innerHTML = html; }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
