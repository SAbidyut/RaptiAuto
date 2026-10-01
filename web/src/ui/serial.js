// Serial Monitor + Serial Plotter.
import { h } from './widgets.js';
import { icon } from './icons.js';

const MAX_LINES = 1500;
const PLOT_COLORS = ['#22d3ee', '#f97316', '#a3e635', '#e879f9', '#facc15', '#60a5fa', '#f87171', '#34d399'];

export class SerialMonitor {
  constructor(host, { onSend }) {
    this.onSend = onSend;
    this.lines = [''];
    this.pending = '';
    this.autoscroll = true;
    this.timestamps = false;
    this.ending = '\n';
    this.mode = 'monitor';
    this.series = new Map();
    this.plotX = 0;

    this.el = h('div', { class: 'serial' });
    const tb = h('div', { class: 'serial-toolbar' });
    this.tabMon = h('button', { class: 'seg active', html: `${icon('terminal', 17)}<span>Monitor</span>`, onclick: () => this.setMode('monitor') });
    this.tabPlot = h('button', { class: 'seg', html: `${icon('chart', 17)}<span>Plotter</span>`, onclick: () => this.setMode('plotter') });
    const segs = h('div', { class: 'segmented' }, this.tabMon, this.tabPlot);
    this.btnAuto = h('button', { class: 'icon-btn sm toggle-ic active', title: 'Auto-scroll', html: icon('arrowDown', 19), onclick: () => { this.autoscroll = !this.autoscroll; this.btnAuto.classList.toggle('active', this.autoscroll); } });
    this.btnTime = h('button', { class: 'icon-btn sm toggle-ic', title: 'Timestamps', html: icon('clock', 19), onclick: () => { this.timestamps = !this.timestamps; this.btnTime.classList.toggle('active', this.timestamps); this.redraw(); } });
    const clear = h('button', { class: 'icon-btn sm', title: 'Clear', html: icon('eraser', 19), onclick: () => this.clear() });
    tb.append(segs, h('div', { class: 'grow' }), this.btnAuto, this.btnTime, clear);

    this.out = h('pre', { class: 'serial-out' });
    this.empty = h('div', { class: 'serial-empty', html: `${icon('terminal', 42)}<p>Serial output will appear here.</p><small>Use <code>Serial.begin(9600)</code> and <code>Serial.println()</code> in your sketch.</small>` });
    this.plot = h('canvas', { class: 'serial-plot' });
    this.legend = h('div', { class: 'plot-legend' });
    this.plotWrap = h('div', { class: 'plot-wrap hidden' }, this.plot, this.legend);

    this.input = h('input', { class: 'input serial-input', placeholder: 'Send to Arduino…', enterkeyhint: 'send', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.send(); });
    this.endSel = h('select', { class: 'select', onchange: () => { this.ending = this.endSel.value; } },
      h('option', { value: '\n' }, 'Newline'), h('option', { value: '' }, 'No ending'), h('option', { value: '\r' }, 'CR'), h('option', { value: '\r\n' }, 'NL & CR'));
    const sendBtn = h('button', { class: 'btn btn-primary btn-icon', html: icon('send', 19), onclick: () => this.send() });
    const inRow = h('div', { class: 'serial-inrow' }, this.input, this.endSel, sendBtn);
    const outWrap = h('div', { class: 'serial-outwrap' }, this.out, this.empty);
    this.el.append(tb, outWrap, this.plotWrap, inRow);
    host.appendChild(this.el);
    this.outWrap = outWrap;
  }

  setMode(m) {
    this.mode = m;
    this.tabMon.classList.toggle('active', m === 'monitor');
    this.tabPlot.classList.toggle('active', m === 'plotter');
    this.outWrap.classList.toggle('hidden', m !== 'monitor');
    this.plotWrap.classList.toggle('hidden', m !== 'plotter');
    if (m === 'plotter') this.drawPlot();
  }

  send() {
    const v = this.input.value;
    if (!v && !this.ending) return;
    this.onSend(v + this.ending);
    this.input.value = '';
  }

  write(text) {
    this.pending += text;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }

  flush() {
    this.raf = null;
    const text = this.pending.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.pending = '';
    if (!text) return;
    const parts = text.split('\n');
    const stamp = this.stampText();
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        this.parsePlotLine(this.lines[this.lines.length - 1]);
        this.lines.push('');
        this.lineStamps = this.lineStamps || [];
      }
      if (this.lines[this.lines.length - 1] === '' && parts[i] !== '') this.setStamp(this.lines.length - 1, stamp);
      this.lines[this.lines.length - 1] += parts[i];
    }
    if (this.lines.length > MAX_LINES) {
      const cut = this.lines.length - MAX_LINES;
      this.lines.splice(0, cut);
      if (this.stamps) this.stamps.splice(0, cut);
    }
    this.redraw();
    if (this.mode === 'plotter') this.drawPlot();
  }

  stampText() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }

  setStamp(i, s) { this.stamps = this.stamps || []; this.stamps[i] = s; }

  redraw() {
    const hasText = this.lines.length > 1 || this.lines[0] !== '';
    this.empty.style.display = hasText ? 'none' : '';
    let txt;
    if (this.timestamps && this.stamps) txt = this.lines.map((l, i) => (this.stamps[i] ? `<span class="ts">${this.stamps[i]} →</span> ` : '') + esc(l)).join('\n');
    else txt = esc(this.lines.join('\n'));
    this.out.innerHTML = txt;
    if (this.autoscroll) this.outWrap.scrollTop = this.outWrap.scrollHeight;
  }

  clear() {
    this.lines = [''];
    this.stamps = [];
    this.series.clear();
    this.plotX = 0;
    this.redraw();
    this.drawPlot();
  }

  // ------------------------------------------------------------------ plotter
  parsePlotLine(line) {
    if (!line) return;
    const tokens = line.trim().split(/[\s,\t]+/).filter(Boolean);
    let idx = 0;
    let any = false;
    for (const tok of tokens) {
      let label, val;
      const m = /^([^:=]+)[:=](-?[\d.eE+-]+)$/.exec(tok);
      if (m) { label = m[1]; val = parseFloat(m[2]); } else { val = parseFloat(tok); label = 'value ' + (idx + 1); if (!/^-?[\d.]+([eE][+-]?\d+)?$/.test(tok)) continue; }
      if (!Number.isFinite(val)) continue;
      idx++;
      any = true;
      let s = this.series.get(label);
      if (!s) {
        if (this.series.size >= 8) continue;
        s = { data: [], color: PLOT_COLORS[this.series.size % PLOT_COLORS.length] };
        this.series.set(label, s);
      }
      s.data.push(val);
      if (s.data.length > 600) s.data.shift();
    }
    if (any) this.plotX++;
  }

  drawPlot() {
    const c = this.plot;
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    ctx.clearRect(0, 0, W, H);
    let min = Infinity, max = -Infinity, n = 0;
    for (const s of this.series.values()) for (const v of s.data) { if (v < min) min = v; if (v > max) max = v; n = Math.max(n, s.data.length); }
    const padL = 44, padR = 10, padT = 12, padB = 22;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#6b7a99';
    if (!Number.isFinite(min)) {
      ctx.textAlign = 'center';
      ctx.fillText('Print numbers with Serial.println(value) to plot them', W / 2, H / 2);
      this.legend.innerHTML = '';
      return;
    }
    if (max === min) { max += 1; min -= 1; }
    const span = max - min;
    max += span * 0.08; min -= span * 0.08;
    const X = (i, len) => padL + (W - padL - padR) * (len <= 1 ? 1 : i / (Math.max(len, 100) - 1));
    const Y = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
    ctx.strokeStyle = 'rgba(148,163,184,.12)';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    for (let k = 0; k <= 4; k++) {
      const v = min + ((max - min) * k) / 4;
      const y = Y(v);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillText(fmtNum(v), padL - 6, y + 4);
    }
    for (const s of this.series.values()) {
      const len = s.data.length;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const off = Math.max(len, 100) - len;
      s.data.forEach((v, i) => { const x = X(i + off, len); const y = Y(v); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    this.legend.innerHTML = [...this.series.entries()].map(([k, s]) => `<span><i style="background:${s.color}"></i>${esc(k)}: <b>${fmtNum(s.data[s.data.length - 1])}</b></span>`).join('');
  }
}

function fmtNum(v) {
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function esc(s) { return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
