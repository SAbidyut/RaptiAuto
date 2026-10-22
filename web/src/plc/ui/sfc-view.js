// SFC view of a step-ladder (STL) program: the steps as boxes (initial steps double-framed), the
// transitions with their conditions, the actions of every step beside it, and — online — the active
// step and the conditions that are true now, live. Built from the ladder: a network that starts
// with STL Sn is step n; in it, SET Sm / OUT Sm on a row is the transition to step m with that row's
// contacts as its condition; every other output is an action of the step.

const SVGNS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isStep = (op) => /^S\d+$/.test(op || '');

/** Contact cell → text and a live test (null when it cannot be evaluated simply). */
function contactOf(c) {
  if (!c || c.t === 'H' || c.t === 'STL') return null;
  const a = c.a && c.a[0];
  if (c.t === 'NO') return { text: a, op: a, neg: false };
  if (c.t === 'NC') return { text: '/' + a, op: a, neg: true };
  if (c.t === 'P') return { text: '↑' + a, op: a, edge: true };
  if (c.t === 'F') return { text: '↓' + a, op: a, edge: true, neg: true };
  if (c.t === 'CC' || c.t === 'FCC') return { text: `${c.a[0]}${c.op}${c.a[1]}` };
  return { text: c.t + (a ? ' ' + a : '') };
}

/** Steps, transitions and actions of the program (null when it has no step ladder). */
export function sfcModel(prog) {
  const steps = new Map();
  const step = (n) => { if (!steps.has(n)) steps.set(n, { n, actions: [], next: [], initial: n < 10 }); return steps.get(n); };
  for (const r of prog.rungs || []) {
    const head = r.cells && r.cells[0] && r.cells[0][0];
    if (head && head.t === 'STL' && isStep(head.a[0])) {
      const s = step(+head.a[0].slice(1));
      r.cells.forEach((row, ri) => {
        const o = r.outs[ri];
        const conds = row.map(contactOf).filter(Boolean);
        if (!o) return;
        const target = o.a && o.a[0];
        if ((o.t === 'SET' || o.t === 'OUT') && isStep(target)) s.next.push({ to: +target.slice(1), conds });
        else s.actions.push({ text: `${o.t}${o.p ? 'P' : ''} ${(o.a || []).join(' ')}`.trim(), op: o.a && o.a[0], conds });
      });
    } else if (r.outs) {
      // initial steps are set outside the step ladder (SET S0 on M1002)
      for (const o of r.outs) if (o && o.t === 'SET' && isStep(o.a && o.a[0])) { const n = +o.a[0].slice(1); if (n < 10) step(n).initial = true; }
    }
  }
  return steps.size ? steps : null;
}

/** Column / row of every step: follow the transitions from the initial steps; a jump back is a label. */
function layout(steps) {
  const pos = new Map();
  let col = 0;
  const place = (n, c, r) => {
    let row = r;
    let cur = n;
    while (cur !== undefined && !pos.has(cur) && steps.has(cur)) {
      pos.set(cur, { col: c, row });
      const s = steps.get(cur);
      const fresh = s.next.filter((t) => !pos.has(t.to) && steps.has(t.to));
      // further branches go into new columns to the right
      for (const t of fresh.slice(1)) { col++; place(t.to, col, row + 1); }
      cur = fresh.length ? fresh[0].to : undefined;
      row++;
    }
  };
  const order = [...steps.values()].sort((a, b) => (b.initial - a.initial) || a.n - b.n);
  for (const s of order) if (!pos.has(s.n)) { if (pos.size) col++; place(s.n, col, 0); }
  return pos;
}

export class SfcView {
  constructor(host) {
    this.host = host;
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'sfc-svg');
    host.appendChild(this.svg);
  }

  /** Draw the chart; cpu (optional) and comments give the live state and the device names. */
  render(prog, cpu, comments = {}) {
    const steps = sfcModel(prog);
    if (!steps) { this.svg.innerHTML = '<text x="20" y="40" class="sfc-empty">No step ladder (STL) in this program</text>'; this.svg.setAttribute('viewBox', '0 0 360 80'); return; }
    const pos = layout(steps);
    const bit = (op) => {
      if (!cpu || !op) return null;
      const m = /^([XYMSTC])(\d+)$/.exec(op);
      if (!m) return null;
      const i = m[1] === 'X' || m[1] === 'Y' ? parseInt(m[2], 8) : +m[2];
      return cpu.read ? !!cpu.read(m[1], i) : null;
    };
    const condOn = (c) => { const b = bit(c.op); return b === null || c.edge ? null : c.neg ? !b : b; };
    const W = 150, H = 44, colW = 330, rowH = 128, x0 = 24, y0 = 24;
    let maxCol = 0, maxRow = 0;
    for (const p of pos.values()) { maxCol = Math.max(maxCol, p.col); maxRow = Math.max(maxRow, p.row); }
    // room for the branches (and their conditions) of a selection in the last column
    let extra = 0;
    for (const [n, p] of pos) if (p.col === maxCol) extra = Math.max(extra, W / 2 + (steps.get(n).next.length - 1) * 170 + 150 - colW);
    const out = [];
    const actives = [];
    const cx = (p) => x0 + p.col * colW + W / 2, cy = (p) => y0 + p.row * rowH;
    for (const s of steps.values()) {
      const p = pos.get(s.n);
      if (!p) continue;
      const active = !!(cpu && cpu.S && cpu.S[s.n]);
      const x = cx(p) - W / 2, y = cy(p);
      if (active) actives.push({ n: s.n, x, y });
      // transitions out of this step; several = a selection branch: a single line, then one branch each
      const k = s.next.length, gap = 170;
      if (k > 1) out.push(`<line class="sfc-link" x1="${cx(p)}" y1="${y + H}" x2="${cx(p)}" y2="${y + H + 14}"/><line class="sfc-link" x1="${cx(p)}" y1="${y + H + 14}" x2="${cx(p) + (k - 1) * gap}" y2="${y + H + 14}"/>`);
      s.next.forEach((t, i) => {
        const q = pos.get(t.to);
        const on = t.conds.length ? t.conds.every((c) => condOn(c) === true) : true;
        const tx = cx(p) + i * gap, ty = y + H + 34;
        const text = t.conds.map((c) => c.text).join(' · ') || '(always)';
        const name = t.conds.length === 1 && comments[t.conds[0].op] ? ` — ${comments[t.conds[0].op]}` : '';
        const lit = active && on;
        out.push(`<line class="sfc-link" x1="${tx}" y1="${k > 1 ? y + H + 14 : y + H}" x2="${tx}" y2="${ty}"/>`);
        out.push(`<line class="sfc-tr${lit ? ' on' : ''}" x1="${tx - 16}" y1="${ty}" x2="${tx + 16}" y2="${ty}"/>`);
        out.push(`<text class="sfc-cond${lit ? ' on' : ''}" x="${tx + 24}" y="${ty + 5}">${esc(text)}<tspan class="sfc-cmt">${esc(name)}</tspan></text>`);
        if (q && q.row === p.row + 1 && q.col === p.col && i === 0) out.push(`<line class="sfc-link" x1="${tx}" y1="${ty}" x2="${tx}" y2="${cy(q)}"/><path class="sfc-arrow" d="M${tx - 5} ${cy(q) - 9} L${tx} ${cy(q) - 1} L${tx + 5} ${cy(q) - 9} Z"/>`);
        else if (q && q.col !== p.col && q.row === p.row + 1) {
          out.push(`<path class="sfc-link" d="M${tx} ${ty} L${tx} ${ty + 12} L${cx(q)} ${ty + 12} L${cx(q)} ${cy(q)}" fill="none"/><path class="sfc-arrow" d="M${cx(q) - 5} ${cy(q) - 9} L${cx(q)} ${cy(q) - 1} L${cx(q) + 5} ${cy(q) - 9} Z"/>`);
        } else {
          // a jump (back to an earlier step, or elsewhere): an arrow with the step it goes to
          out.push(`<line class="sfc-link" x1="${tx}" y1="${ty}" x2="${tx}" y2="${ty + 10}"/><path class="sfc-arrow" d="M${tx - 5} ${ty + 6} L${tx} ${ty + 14} L${tx + 5} ${ty + 6} Z"/><text class="sfc-jump" x="${tx}" y="${ty + 32}" text-anchor="middle">S${t.to}</text>`);
        }
      });
      // the step box
      const label = comments['S' + s.n] || '';
      out.push(`<g class="sfc-step${active ? ' on' : ''}">`);
      out.push(`<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6"/>`);
      if (s.initial) out.push(`<rect class="inner" x="${x + 4}" y="${y + 4}" width="${W - 8}" height="${H - 8}" rx="4"/>`);
      out.push(`<text class="sfc-n" x="${x + 12}" y="${y + 27}">S${s.n}</text><text class="sfc-name" x="${x + W - 10}" y="${y + 27}" text-anchor="end">${esc(label)}</text></g>`);
      // actions
      if (s.actions.length) {
        const ax = x + W + 22, ah = 20 * s.actions.length + 8;
        out.push(`<line class="sfc-link" x1="${x + W}" y1="${y + H / 2}" x2="${ax}" y2="${y + H / 2}"/>`);
        out.push(`<rect class="sfc-act${active ? ' on' : ''}" x="${ax}" y="${y + H / 2 - ah / 2}" width="148" height="${ah}" rx="5"/>`);
        s.actions.forEach((a, i) => {
          const c = comments[a.op] ? ` ${comments[a.op]}` : '';
          out.push(`<text class="sfc-acttxt${active ? ' on' : ''}" x="${ax + 8}" y="${y + H / 2 - ah / 2 + 18 + i * 20}">${esc(a.text)}<tspan class="sfc-cmt">${esc(c.slice(0, 16))}</tspan></text>`);
        });
      }
    }
    const wv = x0 * 2 + (maxCol + 1) * colW + Math.max(0, extra), hv = y0 * 2 + (maxRow + 1) * rowH + 40;
    this.svg.setAttribute('viewBox', `0 0 ${wv} ${hv}`);
    this.svg.style.width = Math.max(wv, 340) + 'px';
    this.svg.style.height = hv + 'px';
    this.svg.innerHTML = out.join('');
    this.follow(actives, W, H);
  }

  /** When the active step changes, scroll the chart so that it is in sight. */
  follow(live, W, H) {
    const key = live.map((a) => a.n).join(',');
    if (key === this.lastLive) return;
    this.lastLive = key;
    const a = live[0];
    const box = this.host;
    if (!a || !box.clientHeight) return;
    const top = box.scrollTop, left = box.scrollLeft;
    const inY = a.y >= top + 4 && a.y + H <= top + box.clientHeight - 4;
    const inX = a.x >= left && a.x + W <= left + box.clientWidth;
    if (inY && inX) return;
    box.scrollTo({ top: inY ? top : Math.max(0, a.y - box.clientHeight / 3), left: inX ? left : Math.max(0, a.x - 24), behavior: 'smooth' });
  }
}
