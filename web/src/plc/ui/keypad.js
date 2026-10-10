// Operand entry keypad for ladder instructions: device keys (X Y M S T C D K H), digits
// (8/9 disabled for the octal X/Y devices), compare operator, pulse option, device comment.
import { h, Sheet } from '../../ui/widgets.js';
import { icon } from '../../ui/icons.js';
import { Native } from '../../native.js';
import { INSTR, INSTR_GROUPS, INSTR_FILTERS, CMP_OPS, OPERAND_DEVS, mnemonic } from '../sim/ladder.js';
import { parseOperand, DEVICES, SPECIAL } from '../sim/address.js';

const DEV_KEYS = ['X', 'Y', 'M', 'S', 'T', 'C', 'D', 'K', 'H', 'E', 'F'];
const INDEXABLE = /^(?:[XYMSTCD]\d+|K-?\d+|K\d[XYMS]\d+)$/;
const PTR_KEYS = ['N', 'P']; // shown only for MC / MCR (N) and CJ / CALL (P)

/**
 * Open the keypad. el = existing element ({t, a, op, p}). Resolves via onDone(newEl) or nothing on cancel.
 */
export function openKeypad({ el, program, recent = [], onDone, title }) {
  const d = INSTR[el.t];
  const vals = d.ops.map((_, i) => (el.a && el.a[i]) || '');
  let op = el.op || (d.cmpOps ? d.cmpOps[3] : '>');
  let pulse = !!el.p;
  let dbl = !!el.d;
  const mn = () => mnemonic({ ...el, op, p: pulse, d: dbl });
  let field = 0;
  let fresh = true; // first key press replaces the default value
  const content = h('div', { class: 'kp' });
  const head = h('div', { class: 'kp-head' },
    h('span', { class: 'kp-mn' }, mn()),
    h('span', { class: 'kp-name' }, d.name));
  const fieldsRow = h('div', { class: 'kp-fields' });
  const err = h('div', { class: 'kp-err' });
  const info = h('div', { class: 'kp-info' });
  const comment = h('input', { class: 'input kp-comment', placeholder: 'Device comment (e.g. START button)', maxlength: 40 });
  const devRow = h('div', { class: 'kp-devs' });
  const digits = h('div', { class: 'kp-digits' });
  const quick = h('div', { class: 'kp-quick' });
  const opRow = d.cmp ? h('div', { class: 'kp-ops' }) : null;
  const pulseRow = d.pulse ? h('button', { class: 'kp-pulse', onclick: () => { pulse = !pulse; draw(); } }) : null;
  const dblRow = d.dbl ? h('button', { class: 'kp-pulse kp-dbl', onclick: () => { dbl = !dbl; draw(); } }) : null;
  const optRow = pulseRow || dblRow ? h('div', { class: 'kp-opts' }, pulseRow, dblRow) : null;

  const cls = () => d.ops[field];
  const allowed = () => OPERAND_DEVS[cls()] || [];
  const isOct = () => /^(?:K\d)?[XY]\d*$/.test(vals[field] || '');
  const isHex = () => /^H/.test(vals[field] || '');
  const isFloat = () => /^F/.test(vals[field] || '') && (allowed().includes('FL'));
  const keyOn = (k) => {
    const al = allowed(), v = vals[field] || '';
    if (al.includes(k)) return true;
    if (k === 'K') return al.some((x) => x.length === 2 && x[0] === 'K');
    if ('XYMS'.includes(k) && /^K[1-8]$/.test(v)) return al.includes('K' + k);
    if (k === 'F' && al.includes('FL')) return true;
    if ((k === 'E' || k === 'F') && !fresh && INDEXABLE.test(v)) return true;
    return false;
  };

  function commentKey() {
    const o = parseOperand(vals[field]);
    return o && o.dev !== 'K' && o.dev !== 'H' ? o.text : null;
  }

  function draw() {
    head.firstChild.textContent = mn();
    fieldsRow.innerHTML = '';
    d.ops.forEach((c, i) => {
      const o = parseOperand(vals[i]);
      const ok = o && (OPERAND_DEVS[c] || []).includes(o.dev);
      fieldsRow.appendChild(h('button', { class: 'kp-field' + (i === field ? ' active' : '') + (vals[i] && !ok ? ' bad' : ''), onclick: () => { field = i; fresh = true; draw(); } },
        h('small', {}, d.labels[i] || 'Operand'),
        h('b', {}, vals[i] || '—')));
    });
    if (opRow) {
      opRow.innerHTML = '';
      for (const o of d.cmpOps || CMP_OPS) opRow.appendChild(h('button', { class: 'kp-op' + (o === op ? ' active' : ''), onclick: () => { op = o; draw(); } }, o));
    }
    if (pulseRow) { pulseRow.className = 'kp-pulse' + (pulse ? ' active' : ''); pulseRow.innerHTML = `${icon(pulse ? 'check' : 'bolt', 15)}<span>${pulse ? 'Pulse (P): runs once on the rising edge' : 'Continuous: every scan while ON — tap for P (pulse)'}</span>`; }
    if (dblRow) { dblRow.className = 'kp-pulse kp-dbl' + (dbl ? ' active' : ''); dblRow.innerHTML = `${icon(dbl ? 'check' : 'layers', 15)}<span>${dbl ? '32-bit (D…): two registers, ±2 147 483 647' : '16-bit — tap for the 32-bit (D…) form'}</span>`; }
    devRow.innerHTML = '';
    const al = allowed();
    const devKeys = al.some((k) => PTR_KEYS.includes(k)) ? PTR_KEYS.filter((k) => al.includes(k)) : DEV_KEYS;
    devRow.classList.toggle('few', devKeys.length < DEV_KEYS.length);
    const cur = vals[field] || '';
    const curDev = (parseOperand(cur) || {}).bdev || cur.replace(/^K\d(?=[XYMS])/, '')[0];
    for (const k of devKeys) {
      devRow.appendChild(h('button', { class: 'kp-key dev' + (curDev === k ? ' active' : ''), disabled: !keyOn(k), onclick: () => setDev(k) }, k));
    }
    digits.innerHTML = '';
    const keys = isHex() ? ['7', '8', '9', 'A', '4', '5', '6', 'B', '1', '2', '3', 'C', '0', 'D', 'E', 'F'] : ['7', '8', '9', '⌫', '4', '5', '6', '±', '1', '2', '3', '.', '0'];
    digits.classList.toggle('hex', isHex());
    for (const k of keys) {
      const dis = (isOct() && (k === '8' || k === '9')) || (k === '±' && !/^(?:K-?\d*|F-?[\d.]*)$/.test(cur)) || (k === '.' && (!isFloat() || cur.includes('.')));
      digits.appendChild(h('button', { class: 'kp-key' + (k === '⌫' ? ' back' : '') + (k === '0' && !isHex() ? ' wide' : ''), disabled: dis, onclick: () => press(k) }, k));
    }
    if (isHex()) digits.appendChild(h('button', { class: 'kp-key back wide', onclick: () => press('⌫') }, '⌫'));
    // validation / info
    const o = parseOperand(vals[field]);
    err.textContent = '';
    info.textContent = '';
    if (vals[field] && !o) err.textContent = /^[XY]\d*[89]/.test(vals[field]) ? 'X / Y are numbered in octal: 0–7, 10–17, 20–27 …' : 'Not a valid device yet';
    else if (o && !al.includes(o.dev)) err.textContent = `${o.dev} cannot be used here — allowed: ${al.join(', ')}`;
    else if (o && o.dev === 'P') info.textContent = `Pointer ${o.text}: long-press a network number → Pointer label to mark the target network`;
    else if (o && o.dev === 'N') info.textContent = `Nesting level ${o.text} (N0 outermost … N7)`;
    else if (o) {
      const sp = SPECIAL[o.text];
      const ix = o.ix ? ` · indexed: the device number + ${o.ix.dev}${o.ix.idx}` : '';
      info.textContent = (sp ? `${o.text}: ${sp}` : o.dev === 'K' ? `Decimal constant ${o.val}` : o.dev === 'H' ? `Hex constant = ${o.raw ?? o.val}` : o.dev === 'FL' ? `Floating-point constant ${o.val}` : o.n ? `${o.text} = ${o.n * 4} bits of ${o.bdev} as one number` : o.dev === 'F' && al.includes('FL') ? `Index register ${o.text} — a floating-point constant needs a decimal point (F${o.idx}.0)` : `${DEVICES[o.dev].name}${o.dev === 'T' ? timerHint(o.idx) : ''}`) + ix;
    }
    const ck = commentKey();
    comment.disabled = !ck;
    comment.value = ck ? (program.comments[ck] || '') : '';
    comment.placeholder = ck ? `Comment for ${ck}` : 'Constants have no comment';
    // quick picks
    quick.innerHTML = '';
    const picks = [...new Set(recent.filter((r) => { const p = parseOperand(r); return p && al.includes(p.dev); }))].slice(0, 14);
    for (const r of picks) quick.appendChild(h('button', { class: 'chip kp-chip', onclick: () => { vals[field] = r; fresh = true; draw(); } }, r, program.comments[r] ? h('small', {}, program.comments[r].slice(0, 12)) : null));
  }

  function setDev(k) {
    Native.vibrate(4);
    const v = vals[field] || '';
    if (/^K[1-8]$/.test(v) && 'XYMS'.includes(k)) vals[field] = v + k; // K4 + M → K4M…
    else if ((k === 'E' || k === 'F') && !fresh && INDEXABLE.test(v) && !(k === 'F' && v === 'F')) vals[field] = v + k; // D10 + E → D10E…
    else vals[field] = k;
    fresh = false;
    draw();
  }

  function press(k) {
    Native.vibrate(4);
    let v = vals[field] || '';
    if (k === '⌫') { v = v.length > 1 ? v.slice(0, -1) : v.slice(0, 1); fresh = false; }
    else if (k === '±') v = /^[KF]-/.test(v) ? v[0] + v.slice(2) : v[0] + '-' + v.slice(1);
    else if (k === '.') { if (!v.includes('.')) v += /\d$/.test(v) ? '.' : '0.'; fresh = false; }
    else {
      if (fresh && v.length > 1) v = v[0] || '';
      fresh = false;
      if (!v) v = allowed()[0] === 'FL' ? 'F' : allowed()[0];
      const konst = /^[KHF]-?[\d.]*$/.test(v);
      const tail = (/\d[\d.]*$/.exec(v) || [''])[0];
      if (tail.length < (konst ? 11 : 5)) v += k;
      v = v.replace(/^([XYMSTCD])0+(?=\d)/, '$1');
    }
    vals[field] = v;
    draw();
  }

  comment.addEventListener('input', () => { const ck = commentKey(); if (ck) { if (comment.value.trim()) program.comments[ck] = comment.value.trim(); else delete program.comments[ck]; } });

  const okBtn = h('button', { class: 'btn btn-primary', html: `${icon('check', 18)}<span>OK</span>`, onclick: () => finish() });
  const nextBtn = d.ops.length > 1 ? h('button', { class: 'btn btn-ghost', html: `<span>Next</span>${icon('forward', 18)}`, onclick: () => { field = (field + 1) % d.ops.length; fresh = true; draw(); } }) : null;

  function finish() {
    for (let i = 0; i < d.ops.length; i++) {
      const o = parseOperand(vals[i]);
      if (!o || !(OPERAND_DEVS[d.ops[i]] || []).includes(o.dev)) { field = i; draw(); err.textContent = err.textContent || `${d.labels[i]}: enter a valid device`; Native.vibrate(30); return; }
      vals[i] = o.text;
    }
    const out = { t: el.t, a: vals.slice() };
    if (d.cmp) out.op = op;
    if (d.pulse && pulse) out.p = true;
    if (d.dbl && dbl) out.d = true;
    sheet.close();
    onDone(out);
  }

  content.append(...[head, opRow, optRow, fieldsRow, err, info, devRow, digits, quick, comment, h('div', { class: 'kp-actions' }, nextBtn, okBtn)].filter(Boolean));
  // physical keyboard
  const onKey = (e) => {
    const k = e.key.toUpperCase();
    if (document.activeElement === comment) { if (e.key === 'Enter') finish(); return; }
    if (e.key === 'Enter') { e.preventDefault(); finish(); return; }
    if (e.key === 'Tab') { e.preventDefault(); field = (field + 1) % Math.max(1, d.ops.length); fresh = true; draw(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); return; }
    if (/^[0-9]$/.test(k) || (isHex() && /^[A-F]$/.test(k))) { press(k); return; }
    if (k === '.' && isFloat()) { press('.'); return; }
    if (k === '-') { press('±'); return; }
    if ((DEV_KEYS.includes(k) || PTR_KEYS.includes(k)) && keyOn(k)) setDev(k);
  };
  const sheet = new Sheet({ title: title || 'Instruction', content, icon: 'ladder', cls: 'kp-sheet', onClose: () => window.removeEventListener('keydown', onKey) });
  window.addEventListener('keydown', onKey);
  sheet.open();
  draw();
  return sheet;
}

function timerHint(n) {
  if (n >= 250) return ' · 100 ms accumulative';
  if (n >= 246) return ' · 1 ms accumulative';
  if (n >= 240) return ' · 10 ms accumulative';
  if (n >= 200) return ' · 10 ms base (K100 = 1 s)';
  return ' · 100 ms base (K10 = 1 s)';
}

/** Instruction picker: every instruction by group, with filter chips and a search field. */
export function openInstrPicker({ onPick, filter = 'All' }) {
  const content = h('div', { class: 'instr-picker' });
  const search = h('input', { class: 'input ip-search', type: 'search', placeholder: 'Search: DADD, float, sin, shift, clock, PID …', autocomplete: 'off' });
  const chips = h('div', { class: 'ip-chips' });
  const list = h('div', { class: 'ip-list' });
  let cur = INSTR_FILTERS.find((x) => x[0] === filter) || INSTR_FILTERS[0];
  const shown = (t) => t !== 'H' && t !== 'NO' && t !== 'NC' && t !== 'OUT';
  const label = (t) => (t === 'CC' ? 'LD>' : t === 'FCC' ? 'FLD>' : t);
  const drawChips = () => {
    chips.innerHTML = '';
    for (const f of INSTR_FILTERS) chips.appendChild(h('button', { class: 'chip' + (f === cur ? ' active' : ''), onclick: () => { cur = f; drawChips(); draw(); list.scrollTop = 0; } }, f[0]));
  };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = '';
    let count = 0;
    for (const [cat, title] of INSTR_GROUPS) {
      if (cur[1] && !cur[1].includes(cat)) continue;
      const ts = Object.keys(INSTR).filter((t) => {
        const d = INSTR[t];
        if (d.cat !== cat || !shown(t)) return false;
        if (!q) return true;
        const names = [t, label(t), d.dbl ? d.dname || 'D' + t : '', d.name, title].join(' ').toLowerCase();
        return names.includes(q);
      });
      if (!ts.length) continue;
      list.appendChild(h('div', { class: 'lib-cat' }, title));
      for (const t of ts) {
        const d = INSTR[t];
        count++;
        const sub = [d.api !== undefined ? `API ${d.api}` : 'Basic', d.labels.length ? d.labels.join(', ') : d.kind === 'contact' ? 'Contact' : 'No operand', d.dbl ? `D = 32-bit (${d.dname || 'D' + t})` : '', d.pulse ? 'P = pulse' : ''].filter(Boolean).join(' · ');
        list.appendChild(h('button', { class: 'ip-row ip-' + d.kind + (d.flow ? ' ip-flow' : ''), onclick: () => { sheet.close(); onPick(t); } },
          h('span', { class: 'ip-mn' }, label(t)),
          h('div', { class: 'ip-text' }, h('b', {}, d.name), h('small', {}, sub))));
      }
    }
    if (!count) list.appendChild(h('p', { class: 'muted center' }, 'No instruction matches'));
  };
  search.addEventListener('input', draw);
  content.append(search, chips, list);
  drawChips();
  draw();
  const total = Object.keys(INSTR).filter(shown).length;
  const sheet = new Sheet({ title: `Instructions · ${total}`, content, icon: 'ladder', cls: 'sheet-tall' });
  sheet.open();
}
