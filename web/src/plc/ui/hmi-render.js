// Draws the DOP HMI screen (800 × 480) to a canvas: boot screen, objects, comm error box,
// on-screen keypad. Used for the 3D touch screen texture and the HMI tab.
import { HMI_W, HMI_H, parseStates } from '../sim/hmi.js';

const F = "'Inter', system-ui, sans-serif";
const FM = "'JetBrains Mono', ui-monospace, monospace";
const FD = "'Space Grotesk', 'Inter', sans-serif";

const BTN = {
  green: ['#22c55e', '#15803d'], red: ['#ef4444', '#b91c1c'], blue: ['#3b82f6', '#1d4ed8'], yellow: ['#facc15', '#ca8a04'],
  gray: ['#64748b', '#334155'], cyan: ['#22d3ee', '#0e7490'], orange: ['#fb923c', '#c2410c'],
};

function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function text(g, s, x, y, size, color, { weight = 700, align = 'center', base = 'middle', font = F } = {}) {
  g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y);
}
const scaled = (v, dec) => (v === null || v === undefined ? null : v / 10 ** (dec || 0));
const fmtNum = (v, dec) => (v === null || v === undefined ? '----' : (v / 10 ** (dec || 0)).toFixed(dec || 0));

/**
 * rt: HmiRuntime (may be null in design mode); screen: screen object; opts: {design, sample}
 */
export function renderHmi(canvas, rt, screen, { design = false } = {}) {
  const g = canvas.getContext('2d');
  const W = HMI_W, H = HMI_H;
  g.save();
  g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  if (!design && (!rt || !rt.powered)) { g.fillStyle = '#020305'; g.fillRect(0, 0, W, H); g.restore(); return; }
  if (!design && rt.bootT > 0) { boot(g, W, H, rt.bootT); g.restore(); return; }
  g.fillStyle = screen.bg || '#0b1630';
  g.fillRect(0, 0, W, H);
  const t = rt ? rt.time : performance.now() / 1000;
  const val = (addr, word) => (design ? sample(addr, word) : rt.value(addr, word));
  for (const el of screen.elements) drawEl(g, el, val, rt, t, design);
  if (!design && rt) {
    if (!rt.commOk) commError(g, W, rt, t);
    if (rt.keypad) keypad(g, rt);
    if (rt.sysMenu) sysMenu(g, rt);
    if (rt.bright < 1) { g.fillStyle = `rgba(0,0,0,${(1 - rt.bright).toFixed(2)})`; g.fillRect(0, 0, W, H); }
  }
  g.restore();
}

function sample(addr, word) { return word ? 1234 : 1; }

function boot(g, W, H, left) {
  g.fillStyle = '#0a0f1c'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2 - 30);
  g.fillStyle = '#e8eef9';
  g.beginPath(); g.moveTo(-108, 18); g.lineTo(-86, -22); g.lineTo(-64, 18); g.closePath(); g.fill();
  g.fillStyle = '#0a0f1c'; g.beginPath(); g.moveTo(-96, 10); g.lineTo(-86, -8); g.lineTo(-76, 10); g.closePath(); g.fill();
  text(g, 'DELTA', 20, 0, 52, '#e8eef9', { weight: 800, font: FD });
  g.restore();
  text(g, 'DOP-107BV · HMI', W / 2, H / 2 + 34, 20, '#7f8ea8', { weight: 600 });
  const k = Math.max(0, Math.min(1, 1 - left / 1.6));
  g.fillStyle = '#1e293b'; rr(g, W / 2 - 150, H / 2 + 74, 300, 8, 4); g.fill();
  g.fillStyle = '#22d3ee'; rr(g, W / 2 - 150, H / 2 + 74, 300 * k, 8, 4); g.fill();
  text(g, 'Loading project…', W / 2, H / 2 + 104, 15, '#64748b', { weight: 600 });
}

function commError(g, W, rt, t) {
  const blink = Math.floor(t * 2) % 2 === 0;
  g.fillStyle = 'rgba(2,6,14,.45)'; g.fillRect(0, 0, W, 480);
  const w = 470, h = 120, x = (W - w) / 2, y = 150;
  g.fillStyle = '#f8fafc'; rr(g, x, y, w, h, 10); g.fill();
  g.fillStyle = blink ? '#dc2626' : '#991b1b'; rr(g, x, y, w, 38, 10); g.fill(); g.fillRect(x, y + 20, w, 18);
  text(g, 'Communication Error', x + 16, y + 19, 18, '#fff', { align: 'left', weight: 800 });
  text(g, 'PLC No Response', x + w / 2, y + 66, 24, '#111827', { weight: 800 });
  text(g, 'Check the cable, PLC power and the COM settings', x + w / 2, y + 96, 14, '#475569', { weight: 600 });
}

const pad2 = (n) => String(n).padStart(2, '0');
function clockText(d, fmt) {
  const date = `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return fmt === 'time' ? time : fmt === 'date' ? date : `${date}  ${time}`;
}

function sysMenu(g, rt) {
  const L = rt.sysMenuLayout();
  const m = rt.sysMenu;
  g.fillStyle = 'rgba(2,6,14,.6)'; g.fillRect(0, 0, HMI_W, HMI_H);
  g.fillStyle = '#e5e9f0'; rr(g, L.x, L.y, L.w, L.h, 12); g.fill();
  g.fillStyle = '#334155'; rr(g, L.x, L.y, L.w, 42, 12); g.fill(); g.fillRect(L.x, L.y + 28, L.w, 14);
  text(g, 'System Setting', L.x + 16, L.y + 22, 18, '#fff', { align: 'left', weight: 800 });
  text(g, 'DOP-107BV', L.x + L.w - 16, L.y + 22, 13, '#cbd5e1', { align: 'right', weight: 700 });
  const rows = [
    ['Firmware', 'V2.00.12'], ['Resolution', '800 × 480'], ['COM1', '9600 7E1'], ['Date', clockText(new Date(), 'date')],
    ['Time', clockText(new Date(), 'time')], ['Alarms', `${rt.alarmLog.filter((a) => a.off === null).length} active · ${rt.alarmLog.length} logged`], ['Backlight', `${Math.round(rt.bright * 100)} %`],
  ];
  rows.forEach(([k, v], i) => {
    text(g, k, L.x + 20, L.y + 72 + i * 36, 14, '#64748b', { align: 'left', weight: 700 });
    text(g, v, L.x + 120, L.y + 72 + i * 36, 15, '#0f172a', { align: 'left', weight: 700, font: FM });
  });
  for (const b of L.keys) {
    const flash = m.flash === b.k && rt.time - m.flashT < 0.12;
    g.fillStyle = flash ? '#93c5fd' : b.k === 'exit' ? '#2563eb' : '#ffffff';
    rr(g, b.x, b.y, b.w, b.h, 8); g.fill();
    g.strokeStyle = 'rgba(15,23,42,.2)'; g.lineWidth = 1.5; g.stroke();
    text(g, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, 16, b.k === 'exit' ? '#fff' : '#0f172a', { weight: 800 });
  }
  text(g, 'Hold the top-left corner to open this menu', L.x + 20, L.y + L.h - 40, 12, '#64748b', { align: 'left', weight: 600 });
}

function keypad(g, rt) {
  const L = rt.keypadLayout();
  const kp = rt.keypad;
  g.fillStyle = 'rgba(2,6,14,.55)'; g.fillRect(0, 0, HMI_W, HMI_H);
  g.fillStyle = '#e5e9f0'; rr(g, L.x, L.y, L.w, L.h, 14); g.fill();
  g.fillStyle = '#1e3a8a'; rr(g, L.x, L.y, L.w, 40, 14); g.fill(); g.fillRect(L.x, L.y + 26, L.w, 14);
  text(g, kp.el.label || 'Input', L.x + 16, L.y + 21, 17, '#fff', { align: 'left', weight: 800 });
  text(g, `${kp.el.min} ~ ${kp.el.max}`, L.x + L.w - 16, L.y + 21, 14, '#bfdbfe', { align: 'right', weight: 700 });
  g.fillStyle = '#0f172a'; rr(g, L.x + 18, L.y + 54, L.w - 36, 50, 8); g.fill();
  text(g, kp.text || (kp.error ? '' : '0'), L.x + L.w - 32, L.y + 80, 30, kp.text ? '#a5f3fc' : '#475569', { align: 'right', font: FM, weight: 600 });
  if (kp.error) text(g, kp.error, L.x + 32, L.y + 80, 14, '#f87171', { align: 'left', weight: 700 });
  for (const b of L.keys) {
    const special = ['BS', 'CLR', 'ESC', 'ENT', '-'].includes(b.k);
    const flash = kp.flash === b.k && rt.time - kp.flashT < 0.12;
    g.fillStyle = flash ? '#93c5fd' : b.k === 'ENT' ? '#2563eb' : b.k === 'ESC' ? '#94a3b8' : special ? '#cbd5e1' : '#ffffff';
    rr(g, b.x, b.y, b.w, b.h, 9); g.fill();
    g.strokeStyle = 'rgba(15,23,42,.18)'; g.lineWidth = 1.5; g.stroke();
    const label = { BS: '⌫', CLR: 'CLR', ESC: 'ESC', ENT: 'ENT', '-': '±' }[b.k] || b.k;
    text(g, label, b.x + b.w / 2, b.y + b.h / 2 + 1, special ? 18 : 26, b.k === 'ENT' ? '#fff' : '#0f172a', { weight: 800 });
  }
}

function drawEl(g, el, val, rt, t, design) {
  const { x, y, w, h } = el;
  const pressed = rt && rt.pressed && rt.pressed.has(el.id);
  switch (el.type) {
    case 'rect': {
      g.fillStyle = el.fill || '#13223f'; rr(g, x, y, w, h, el.radius ?? 12); g.fill();
      g.strokeStyle = el.stroke || '#2b4470'; g.lineWidth = 1.5; g.stroke();
      if (el.title) {
        text(g, el.title, x + 16, y + 18, 13, '#7dd3fc', { align: 'left', weight: 800 });
        g.fillStyle = 'rgba(125,211,252,.18)'; g.fillRect(x + 16, y + 30, w - 32, 1);
      }
      break;
    }
    case 'text': {
      const ax = el.align === 'center' ? x + w / 2 : el.align === 'right' ? x + w : x;
      text(g, el.text || '', ax, y + h / 2, el.size || 24, el.color || '#e2e8f0', { align: el.align || 'left', weight: el.bold ? 800 : 500, font: el.bold ? FD : F });
      break;
    }
    case 'button': case 'goto': {
      const [c1, c2] = BTN[el.color] || BTN.blue;
      const on = el.type === 'button' && el.mode === 'toggle' && val(el.bit, false);
      const py = pressed ? 3 : 0;
      if (!pressed) { g.fillStyle = 'rgba(0,0,0,.35)'; rr(g, x, y + 5, w, h, 12); g.fill(); }
      const gr = g.createLinearGradient(0, y, 0, y + h);
      if (el.type === 'goto') { gr.addColorStop(0, '#1e3a6e'); gr.addColorStop(1, '#162b52'); }
      else { gr.addColorStop(0, pressed ? c2 : c1); gr.addColorStop(1, c2); }
      g.fillStyle = gr; rr(g, x, y + py, w, h - 2, 12); g.fill();
      g.strokeStyle = el.type === 'goto' ? '#3b82f6' : on ? '#fef08a' : 'rgba(255,255,255,.28)'; g.lineWidth = on ? 4 : 1.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.14)'; rr(g, x + 4, y + py + 3, w - 8, (h - 2) * 0.42, 9); g.fill();
      text(g, el.text || '', x + w / 2, y + py + h / 2, Math.min(28, h * 0.4), '#fff', { weight: 800, font: FD });
      break;
    }
    case 'lamp': {
      const on = !!val(el.bit, false);
      const col = on ? el.onColor || '#22c55e' : el.offColor || '#334155';
      if (el.shape === 'rect') {
        if (on) { g.shadowColor = col; g.shadowBlur = 22; }
        g.fillStyle = col; rr(g, x, y, w, h, 10); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5; g.stroke();
        text(g, el.text || '', x + w / 2, y + h / 2 + 1, Math.min(22, h * 0.45), on ? '#04110a' : '#94a3b8', { weight: 800 });
      } else {
        const r = Math.min(w, h - 22) / 2;
        const cx = x + w / 2, cy = y + r + 2;
        g.fillStyle = '#0b1222'; g.beginPath(); g.arc(cx, cy, r + 4, 0, Math.PI * 2); g.fill();
        const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
        gr.addColorStop(0, on ? '#ffffff' : '#475569'); gr.addColorStop(0.35, col); gr.addColorStop(1, on ? col : '#1e293b');
        if (on) { g.shadowColor = col; g.shadowBlur = 26; }
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
        text(g, el.text || '', cx, y + h - 9, 14, '#cbd5e1', { weight: 800 });
      }
      break;
    }
    case 'num': case 'input': {
      const v = val(el.word, true);
      text(g, el.label || '', x + 4, y + 10, 13, '#7dd3fc', { align: 'left', weight: 800 });
      g.fillStyle = '#050b18'; rr(g, x, y + 22, w, h - 22, 8); g.fill();
      g.strokeStyle = el.type === 'input' ? '#22d3ee' : '#1f3a63'; g.lineWidth = el.type === 'input' ? 2 : 1.5; g.stroke();
      const unitW = el.unit ? 14 + el.unit.length * 9 : 10;
      const size = Math.min(34, (h - 22) * 0.66);
      text(g, fmtNum(v, el.dec), x + w - unitW, y + 22 + (h - 22) / 2 + 1, size, el.type === 'input' ? '#a5f3fc' : '#f8fafc', { align: 'right', font: FM, weight: 600 });
      if (el.unit) text(g, el.unit, x + w - 8, y + 22 + (h - 22) / 2 + 2, 15, '#64748b', { align: 'right', weight: 700 });
      if (el.type === 'input') text(g, '✎', x + 14, y + 22 + (h - 22) / 2, 16, '#22d3ee', { weight: 700 });
      break;
    }
    case 'meter': {
      const v = scaled(val(el.word, true), el.dec);
      const min = el.min ?? 0, max = el.max ?? 100;
      const k = v === null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
      const cx = x + w / 2, cy = y + h - 30, r = Math.min(w / 2 - 12, h - 44);
      const a0 = Math.PI * 0.85, a1 = Math.PI * 2.15;
      g.lineCap = 'round';
      g.strokeStyle = '#1e293b'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
      const gr = g.createLinearGradient(cx - r, 0, cx + r, 0);
      gr.addColorStop(0, '#22d3ee'); gr.addColorStop(0.6, '#3b82f6'); gr.addColorStop(1, '#a855f7');
      g.strokeStyle = gr; g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * k); g.stroke();
      g.lineCap = 'butt';
      for (let i = 0; i <= 10; i++) {
        const a = a0 + (a1 - a0) * i / 10;
        g.strokeStyle = '#64748b'; g.lineWidth = i % 5 ? 1.5 : 2.5;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - 14), cy + Math.sin(a) * (r - 14)); g.lineTo(cx + Math.cos(a) * (r - (i % 5 ? 20 : 24)), cy + Math.sin(a) * (r - (i % 5 ? 20 : 24))); g.stroke();
      }
      const an = a0 + (a1 - a0) * k;
      g.strokeStyle = '#f8fafc'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * (r - 18), cy + Math.sin(an) * (r - 18)); g.stroke();
      g.fillStyle = '#f8fafc'; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
      text(g, v === null ? '----' : v.toFixed(el.dec || 0), cx, cy + 20, 22, '#f8fafc', { font: FM, weight: 600 });
      text(g, `${el.label || ''}${el.unit ? ' · ' + el.unit : ''}`, cx, y + 10, 13, '#7dd3fc', { weight: 800 });
      text(g, String(min), cx - r + 4, cy + 22, 11, '#64748b', { weight: 700 });
      text(g, String(max), cx + r - 4, cy + 22, 11, '#64748b', { weight: 700 });
      break;
    }
    case 'bar': {
      const v = scaled(val(el.word, true), el.dec);
      const min = el.min ?? 0, max = el.max ?? 100;
      const k = v === null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
      text(g, el.label || '', x + w / 2, y + 8, 12, '#7dd3fc', { weight: 800 });
      const by = y + 20, bh = h - 44;
      g.fillStyle = '#050b18'; rr(g, x + 6, by, w - 12, bh, 8); g.fill();
      g.strokeStyle = '#1f3a63'; g.lineWidth = 1.5; g.stroke();
      const gr = g.createLinearGradient(0, by + bh, 0, by);
      gr.addColorStop(0, el.color || '#22d3ee'); gr.addColorStop(1, '#a855f7');
      g.fillStyle = gr; rr(g, x + 10, by + 4 + (bh - 8) * (1 - k), w - 20, (bh - 8) * k, 5); g.fill();
      text(g, v === null ? '--' : v.toFixed(el.dec || 0), x + w / 2, y + h - 11, 15, '#f8fafc', { font: FM, weight: 600 });
      break;
    }
    case 'motor': {
      const on = !!val(el.bit, false);
      const cx = x + w / 2, cy = y + h / 2 - (el.text ? 8 : 0), r = Math.min(w, h) / 2 - (el.text ? 12 : 4);
      g.fillStyle = on ? '#0e3b2a' : '#1e293b'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = on ? '#22c55e' : '#475569'; g.lineWidth = 4; g.stroke();
      const ang = on ? t * 9 : 0.4;
      g.fillStyle = on ? '#4ade80' : '#64748b';
      for (let i = 0; i < 3; i++) {
        const a = ang + i * Math.PI * 2 / 3;
        g.beginPath(); g.moveTo(cx, cy);
        g.quadraticCurveTo(cx + Math.cos(a - 0.5) * r * 0.9, cy + Math.sin(a - 0.5) * r * 0.9, cx + Math.cos(a + 0.25) * r * 0.8, cy + Math.sin(a + 0.25) * r * 0.8);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#0b1222'; g.beginPath(); g.arc(cx, cy, r * 0.16, 0, Math.PI * 2); g.fill();
      if (el.text) text(g, el.text, cx, y + h - 8, 13, '#cbd5e1', { weight: 800 });
      break;
    }
    case 'trend': {
      text(g, el.label || '', x + 6, y + 9, 12, '#7dd3fc', { align: 'left', weight: 800 });
      const px = x + 34, py = y + 22, pw = w - 44, ph = h - 40;
      g.fillStyle = '#050b18'; rr(g, x, y + 18, w, h - 18, 8); g.fill();
      g.strokeStyle = 'rgba(148,163,184,.12)'; g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { const yy = py + ph * i / 4; g.beginPath(); g.moveTo(px, yy); g.lineTo(px + pw, yy); g.stroke(); }
      const min = el.min ?? 0, max = el.max ?? 100;
      text(g, String(max), px - 6, py, 10, '#64748b', { align: 'right', weight: 700 });
      text(g, String(min), px - 6, py + ph, 10, '#64748b', { align: 'right', weight: 700 });
      const data = design ? Array.from({ length: 40 }, (_, i) => [i, 10 ** (el.dec || 0) * (min + (max - min) * (0.5 + 0.35 * Math.sin(i / 5))), 10 ** (el.dec || 0) * (min + (max - min) * 0.6)]) : (rt && rt.trends.get(el.id)) || [];
      if (data.length > 1) {
        const t1 = data[data.length - 1][0], span = design ? 40 : el.span || 30;
        for (const [k, color] of [[1, '#22d3ee'], [2, '#f59e0b']]) {
          g.strokeStyle = color; g.lineWidth = 2.2; g.beginPath();
          let first = true;
          for (const d of data) {
            if (d[k] === null || d[k] === undefined) continue;
            const xx = px + pw * (1 - (t1 - d[0]) / span);
            const v = d[k] / 10 ** (el.dec || 0);
            const yy = py + ph * (1 - Math.max(0, Math.min(1, (v - min) / (max - min || 1))));
            if (first) { g.moveTo(xx, yy); first = false; } else g.lineTo(xx, yy);
          }
          g.stroke();
        }
      }
      break;
    }
    case 'state': {
      const v = el.word ? val(el.word, true) : el.bit ? (val(el.bit, false) ? 1 : 0) : null;
      const states = parseStates(el.states);
      const st = states.find((x) => x.v === v) || { text: v === null ? '----' : `? ${v}`, color: '#334155' };
      const top = el.label ? 18 : 0;
      if (el.label) text(g, el.label, x + 4, y + 8, 12, '#7dd3fc', { align: 'left', weight: 800 });
      g.fillStyle = st.color; rr(g, x, y + top, w, h - top, 8); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.12)'; rr(g, x + 3, y + top + 3, w - 6, (h - top) * 0.4, 6); g.fill();
      text(g, st.text, x + w / 2, y + top + (h - top) / 2 + 1, Math.min(22, (h - top) * 0.5), '#fff', { weight: 800, font: FD });
      break;
    }
    case 'setval': {
      const [c1, c2] = BTN[el.color] || BTN.blue;
      const py = pressed ? 3 : 0;
      if (!pressed) { g.fillStyle = 'rgba(0,0,0,.35)'; rr(g, x, y + 4, w, h, 10); g.fill(); }
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, pressed ? c2 : c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; rr(g, x, y + py, w, h - 2, 10); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.5; g.stroke();
      text(g, el.text || (el.mode === 'dec' ? '−' : el.mode === 'inc' ? '+' : 'SET'), x + w / 2, y + py + h / 2, Math.min(30, h * 0.48), '#fff', { weight: 800, font: FD });
      break;
    }
    case 'slider': {
      const v = scaled(val(el.word, true), el.dec);
      const min = el.min ?? 0, max = el.max ?? 100;
      const k = v === null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
      const x0 = x + 18, x1 = x + w - 18, ty = y + h - 22;
      text(g, el.label || '', x + 4, y + 10, 13, '#7dd3fc', { align: 'left', weight: 800 });
      text(g, `${v === null ? '----' : v.toFixed(el.dec || 0)}${el.unit ? ' ' + el.unit : ''}`, x + w - 4, y + 10, 15, '#f8fafc', { align: 'right', font: FM, weight: 600 });
      g.fillStyle = '#050b18'; rr(g, x0 - 6, ty - 7, x1 - x0 + 12, 14, 7); g.fill();
      g.fillStyle = '#22d3ee'; rr(g, x0 - 6, ty - 7, (x1 - x0) * k + 12, 14, 7); g.fill();
      for (let i = 0; i <= 10; i++) { g.fillStyle = '#334155'; g.fillRect(x0 + (x1 - x0) * i / 10 - 1, ty + 10, 2, i % 5 ? 5 : 9); }
      const kx = x0 + (x1 - x0) * k;
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(kx, ty + 3, 15, 0, Math.PI * 2); g.fill();
      const kg = g.createLinearGradient(0, ty - 14, 0, ty + 14); kg.addColorStop(0, '#f8fafc'); kg.addColorStop(1, '#94a3b8');
      g.fillStyle = kg; g.beginPath(); g.arc(kx, ty, 14, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#0e7490'; g.lineWidth = 3; g.stroke();
      break;
    }
    case 'selsw': {
      const on = !!val(el.bit, false);
      const cx = x + w / 2, r = Math.min(w, h - 26) / 2 - 6, cy = y + 24 + r;
      text(g, el.off || 'OFF', cx - r * 0.75, y + 10, 13, on ? '#64748b' : '#f8fafc', { weight: 800 });
      text(g, el.on || 'ON', cx + r * 0.75, y + 10, 13, on ? '#4ade80' : '#64748b', { weight: 800 });
      g.fillStyle = '#0b1222'; g.beginPath(); g.arc(cx, cy, r + 4, 0, Math.PI * 2); g.fill();
      const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 2, cx, cy, r);
      gr.addColorStop(0, '#475569'); gr.addColorStop(1, '#111827');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(cx, cy); g.rotate(on ? Math.PI / 4 : -Math.PI / 4);
      g.fillStyle = '#e2e8f0'; rr(g, -r * 0.22, -r * 0.9, r * 0.44, r * 1.8, r * 0.2); g.fill();
      g.fillStyle = on ? '#22c55e' : '#64748b'; g.fillRect(-2, -r * 0.82, 4, r * 0.5);
      g.restore();
      break;
    }
    case 'tank': {
      const v = scaled(val(el.word, true), el.dec);
      const min = el.min ?? 0, max = el.max ?? 100;
      const k = v === null ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min || 1)));
      const tx = x + 8, tw = w - 16, ty = y + 20, th = h - 46, rad = Math.min(18, tw / 4);
      text(g, el.label || '', x + w / 2, y + 8, 12, '#7dd3fc', { weight: 800 });
      g.fillStyle = '#0b1222'; rr(g, tx, ty, tw, th, rad); g.fill();
      g.save(); rr(g, tx, ty, tw, th, rad); g.clip();
      const lh = th * k, wave = 2.5 * Math.sin(t * 3);
      const gr = g.createLinearGradient(0, ty + th - lh, 0, ty + th);
      gr.addColorStop(0, el.color || '#38bdf8'); gr.addColorStop(1, '#1e3a8a');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(tx, ty + th - lh + wave); g.quadraticCurveTo(tx + tw / 2, ty + th - lh - wave, tx + tw, ty + th - lh + wave); g.lineTo(tx + tw, ty + th); g.lineTo(tx, ty + th); g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = '#94a3b8'; g.lineWidth = 3; rr(g, tx, ty, tw, th, rad); g.stroke();
      for (let i = 1; i < 4; i++) { g.fillStyle = '#64748b'; g.fillRect(tx + tw - 14, ty + th * i / 4, 10, 2); }
      text(g, `${v === null ? '--' : v.toFixed(el.dec || 0)}${el.unit ? ' ' + el.unit : ''}`, x + w / 2, y + h - 12, 16, '#f8fafc', { font: FM, weight: 600 });
      break;
    }
    case 'pipe': {
      const on = !!val(el.bit, false);
      const vert = h > w, th = vert ? w : h;
      g.fillStyle = '#475569'; rr(g, x, y, w, h, th / 2); g.fill();
      g.fillStyle = on ? el.color || '#38bdf8' : '#1e293b'; rr(g, x + 4, y + 4, w - 8, h - 8, (th - 8) / 2); g.fill();
      if (on) {
        g.save(); rr(g, x + 4, y + 4, w - 8, h - 8, (th - 8) / 2); g.clip();
        g.fillStyle = 'rgba(255,255,255,.55)';
        const off = (t * 60) % 30;
        if (vert) for (let yy = y - 30 + off; yy < y + h; yy += 30) g.fillRect(x + th / 2 - 2, yy, 4, 12);
        else for (let xx = x - 30 + off; xx < x + w; xx += 30) g.fillRect(xx, y + th / 2 - 2, 12, 4);
        g.restore();
      }
      break;
    }
    case 'valve': {
      const on = !!val(el.bit, false);
      const cx = x + w / 2, cy = y + (h - (el.text ? 16 : 0)) / 2 + 6, s2 = Math.min(w / 2, (h - 16) / 2) - 4;
      g.fillStyle = on ? '#22c55e' : '#475569'; g.strokeStyle = '#0b1222'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - s2, cy - s2 * 0.6); g.lineTo(cx + s2, cy + s2 * 0.6); g.lineTo(cx + s2, cy - s2 * 0.6); g.lineTo(cx - s2, cy + s2 * 0.6); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#94a3b8'; g.fillRect(cx - 2, cy - s2 * 0.95, 4, s2 * 0.95);
      g.fillStyle = on ? '#4ade80' : '#64748b'; rr(g, cx - s2 * 0.45, cy - s2 * 1.15, s2 * 0.9, 8, 3); g.fill();
      if (el.text) text(g, el.text, cx, y + h - 7, 12, '#cbd5e1', { weight: 800 });
      break;
    }
    case 'clock': {
      const d = new Date();
      const ax = el.align === 'left' ? x : el.align === 'center' ? x + w / 2 : x + w;
      text(g, clockText(d, el.fmt), ax, y + h / 2 + 1, el.size || 20, el.color || '#e2e8f0', { align: el.align || 'right', font: FM, weight: 600 });
      break;
    }
    case 'alarmlist': {
      text(g, el.label || 'ALARM HISTORY', x + 8, y + 10, 12, '#7dd3fc', { align: 'left', weight: 800 });
      g.fillStyle = '#050b18'; rr(g, x, y + 20, w, h - 20, 8); g.fill();
      g.strokeStyle = '#1f3a63'; g.lineWidth = 1.5; g.stroke();
      const cols = [x + 10, x + 100, x + 190];
      g.fillStyle = '#10224a'; g.fillRect(x + 1, y + 21, w - 2, 24);
      text(g, 'TIME', cols[0], y + 33, 11, '#94a3b8', { align: 'left', weight: 800 });
      text(g, 'STATE', cols[1], y + 33, 11, '#94a3b8', { align: 'left', weight: 800 });
      text(g, 'MESSAGE', cols[2], y + 33, 11, '#94a3b8', { align: 'left', weight: 800 });
      const list = design ? [{ text: 'Motor overload', t: Date.now(), off: null, ack: false }, { text: 'COM2 time-out', t: Date.now() - 60000, off: Date.now() - 30000, ack: true }] : (rt && rt.alarmLog) || [];
      const rowH = 26, n = Math.floor((h - 50) / rowH);
      list.slice(0, n).forEach((a, i) => {
        const yy = y + 48 + i * rowH;
        const active = a.off === null;
        if (i % 2) { g.fillStyle = 'rgba(148,163,184,.06)'; g.fillRect(x + 1, yy, w - 2, rowH); }
        const col = active ? (a.ack ? '#f59e0b' : '#ef4444') : '#64748b';
        text(g, clockText(new Date(a.t), 'time'), cols[0], yy + rowH / 2, 13, '#cbd5e1', { align: 'left', font: FM, weight: 500 });
        text(g, active ? (a.ack ? 'ACK' : 'ACTIVE') : 'CLEARED', cols[1], yy + rowH / 2, 12, col, { align: 'left', weight: 800 });
        text(g, a.text, cols[2], yy + rowH / 2, 14, active ? '#f8fafc' : '#94a3b8', { align: 'left', weight: 700 });
      });
      if (!list.length) text(g, 'No alarms', x + w / 2, y + 20 + (h - 20) / 2 + 10, 14, '#475569', { weight: 700 });
      else text(g, 'Tap the list to acknowledge', x + w - 8, y + 10, 11, '#64748b', { align: 'right', weight: 600 });
      break;
    }
    case 'alarm': {
      const on = !!val(el.bit, false);
      if (!on && !design) break;
      const blink = Math.floor(t * 2.5) % 2 === 0;
      g.fillStyle = design ? 'rgba(239,68,68,.35)' : blink ? '#dc2626' : '#7f1d1d';
      rr(g, x, y, w, h, 8); g.fill();
      text(g, '⚠  ' + (el.text || 'ALARM'), x + w / 2, y + h / 2 + 1, Math.min(20, h * 0.48), '#fff', { weight: 800 });
      break;
    }
    default: break;
  }
}

export const HMI_BTN_COLORS = Object.keys(BTN);
