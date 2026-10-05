// The programming laptop's screen in the 3D lab: an ISPSoft-like window that mirrors the
// ladder program and, when online, its live power flow.
import { INSTR, elementText, mnemonic } from '../sim/ladder.js';

const F = "'Inter', system-ui, sans-serif";
const FM = "'JetBrains Mono', ui-monospace, monospace";

export function renderLaptop(canvas, { project, plc, online, simTime, compiledLive }) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.fillStyle = '#eef1f5'; g.fillRect(0, 0, W, H);
  // title bar
  g.fillStyle = '#1e3a6e'; g.fillRect(0, 0, W, 34);
  g.fillStyle = '#fff'; g.font = `700 16px ${F}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.fillText(`ISPSoft  —  [Ladder] ${project.name}`, 14, 17);
  for (let i = 0; i < 3; i++) { g.fillStyle = i === 2 ? '#ef4444' : '#93a6c8'; g.fillRect(W - 30 - i * 34, 10, 22, 14); }
  // menu
  g.fillStyle = '#f8fafc'; g.fillRect(0, 34, W, 26);
  g.fillStyle = '#1f2937'; g.font = `500 14px ${F}`;
  let x = 12;
  for (const m of ['File', 'Edit', 'View', 'Compile', 'PLC', 'Tools', 'Window', 'Help']) { g.fillText(m, x, 47); x += g.measureText(m).width + 22; }
  // toolbar
  g.fillStyle = '#e2e8f0'; g.fillRect(0, 60, W, 34);
  const tools = ['#2563eb', '#16a34a', '#dc2626', '#64748b', '#64748b', '#f59e0b', '#64748b', '#0ea5e9', '#64748b', '#64748b'];
  tools.forEach((c, i) => { g.fillStyle = c; g.fillRect(12 + i * 32, 67, 22, 20); });
  g.fillStyle = online ? '#16a34a' : '#64748b';
  g.fillRect(W - 170, 66, 156, 22);
  g.fillStyle = '#fff'; g.font = `700 13px ${F}`; g.textAlign = 'center';
  g.fillText(online ? 'ONLINE · MONITOR' : 'OFFLINE', W - 92, 77);
  // project tree
  g.fillStyle = '#ffffff'; g.fillRect(0, 94, 190, H - 124);
  g.strokeStyle = '#cbd5e1'; g.strokeRect(0.5, 94.5, 190, H - 124);
  g.fillStyle = '#0f172a'; g.textAlign = 'left'; g.font = `700 13px ${F}`;
  const tree = [['▾ ' + (plc ? plc.short : 'PLC'), 0], ['▾ Programs', 1], ['▪ Main (LD)', 2], ['▸ Device comments', 1], ['▸ Device monitor', 1], ['▸ COM settings', 1]];
  tree.forEach(([t, d], i) => { g.font = `${i === 2 ? 700 : 500} 13px ${F}`; g.fillStyle = i === 2 ? '#1d4ed8' : '#334155'; g.fillText(t, 10 + d * 14, 112 + i * 22); });
  // ladder area
  const lx = 198, ly = 100, lw = W - lx - 8, lh = H - ly - 34;
  g.fillStyle = '#fff'; g.fillRect(lx, ly, lw, lh);
  g.save(); g.beginPath(); g.rect(lx, ly, lw, lh); g.clip();
  const prog = project.program;
  const cols = prog.cols;
  const cw = Math.min(70, (lw - 60 - 120) / cols);
  const rh = 46;
  let y = ly + 12;
  prog.rungs.forEach((r, ri) => {
    if (y > ly + lh) return;
    const live = compiledLive ? compiledLive(ri) : null;
    g.fillStyle = '#16a34a'; g.font = `600 12px ${FM}`; g.textAlign = 'left';
    if (r.comment) { g.fillStyle = '#15803d'; g.font = `500 12px ${F}`; g.fillText('// ' + r.comment.slice(0, 80), lx + 34, y + 6); y += 18; }
    const x0 = lx + 34;
    g.fillStyle = '#64748b'; g.font = `600 11px ${FM}`; g.fillText(String(ri + 1).padStart(3, '0'), lx + 4, y + 22);
    r.cells.forEach((row, rr) => {
      const yy = y + rr * rh + 22;
      row.forEach((el, c) => {
        if (!el) return;
        const lit = live && live.cells[rr] && (live.cells[rr][c] & 2);
        const cx = x0 + c * cw;
        drawEl(g, el, cx, yy, cw, lit, online);
      });
      const o = r.outs[rr];
      if (o) {
        const lit = live && live.rows[rr];
        drawOut(g, o, x0 + cols * cw, yy, lw - (x0 - lx) - cols * cw - 16, lit, online);
      }
    });
    // left rail + links
    g.strokeStyle = '#334155'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y + 8); g.lineTo(x0, y + r.cells.length * rh + 8); g.stroke();
    r.vl.forEach((links, rr) => links.forEach((on, c) => {
      if (!on) return;
      g.strokeStyle = '#334155'; g.lineWidth = 1.5;
      const xx = x0 + (c + 1) * cw;
      g.beginPath(); g.moveTo(xx, y + rr * rh + 22); g.lineTo(xx, y + (rr + 1) * rh + 22); g.stroke();
    }));
    y += r.cells.length * rh + 12;
  });
  g.restore();
  // status bar
  g.fillStyle = '#1e3a6e'; g.fillRect(0, H - 26, W, 26);
  g.fillStyle = '#e2e8f0'; g.font = `600 13px ${F}`; g.textAlign = 'left';
  g.fillText(`${plc ? plc.short : 'PLC'}  ·  USB  ·  ${online ? 'Online' : 'Offline'}${plc && online ? '  ·  ' + plc.mode : ''}${simTime ? '  ·  ' + simTime : ''}`, 12, H - 13);
}

function drawEl(g, el, x, y, w, lit, online) {
  const on = online && lit;
  g.strokeStyle = '#334155'; g.lineWidth = 1.5;
  const mid = x + w / 2;
  if (el.t === 'H') { g.strokeStyle = on ? '#16a34a' : '#334155'; g.lineWidth = on ? 3 : 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke(); return; }
  g.beginPath(); g.moveTo(x, y); g.lineTo(mid - 7, y); g.moveTo(mid + 7, y); g.lineTo(x + w, y); g.stroke();
  if (on) { g.fillStyle = '#22c55e'; g.fillRect(mid - 7, y - 10, 14, 20); }
  g.strokeStyle = '#0f172a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(mid - 7, y - 10); g.lineTo(mid - 7, y + 10); g.moveTo(mid + 7, y - 10); g.lineTo(mid + 7, y + 10); g.stroke();
  if (el.t === 'NC') { g.beginPath(); g.moveTo(mid - 9, y + 10); g.lineTo(mid + 9, y - 10); g.stroke(); }
  if (el.t === 'P' || el.t === 'F') { g.fillStyle = '#0f172a'; g.font = `700 11px ${F}`; g.textAlign = 'center'; g.fillText(el.t === 'P' ? '↑' : '↓', mid, y + 1); }
  g.fillStyle = '#1d4ed8'; g.font = `600 11px ${FM}`; g.textAlign = 'center';
  g.fillText(elementText(el).slice(0, 10), mid, y - 17);
}

function drawOut(g, el, x, y, w, lit, online) {
  const on = online && lit;
  const d = INSTR[el.t];
  g.strokeStyle = on ? '#16a34a' : '#334155'; g.lineWidth = on ? 3 : 1.5;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18, y); g.stroke();
  g.textAlign = 'center';
  if (d.kind === 'out') {
    g.strokeStyle = '#0f172a'; g.lineWidth = 2;
    if (on) { g.fillStyle = 'rgba(34,197,94,.35)'; g.beginPath(); g.arc(x + 32, y, 11, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(x + 32, y, 11, -1.2, 1.2); g.stroke();
    g.beginPath(); g.arc(x + 32, y, 11, Math.PI - 1.2, Math.PI + 1.2); g.stroke();
    g.fillStyle = '#0f172a'; g.font = `700 10px ${F}`;
    if (el.t !== 'OUT') g.fillText(el.t[0], x + 32, y + 1);
    g.fillStyle = '#1d4ed8'; g.font = `600 11px ${FM}`; g.fillText(el.a[0] || '', x + 32, y - 17);
  } else {
    const bw = Math.min(w - 22, 150);
    g.fillStyle = on ? 'rgba(34,197,94,.18)' : '#f8fafc'; g.fillRect(x + 18, y - 13, bw, 26);
    g.strokeStyle = '#0f172a'; g.lineWidth = 1.5; g.strokeRect(x + 18, y - 13, bw, 26);
    g.fillStyle = '#0f172a'; g.font = `700 11px ${FM}`; g.textAlign = 'left';
    g.fillText(`${mnemonic(el)} ${el.a.join(' ')}`.slice(0, 22), x + 24, y + 1);
  }
}
