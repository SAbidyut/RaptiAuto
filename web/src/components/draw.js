// Small SVG building helpers for component artwork (all coordinates in world units, 10 = 0.1").

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function rect(x, y, w, h, o = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}${o.op !== undefined ? ` opacity="${o.op}"` : ''}${o.extra || ''}/>`;
}

export function circle(cx, cy, r, o = {}) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}${o.op !== undefined ? ` opacity="${o.op}"` : ''}${o.extra || ''}/>`;
}

export function text(x, y, s, o = {}) {
  const size = o.size || 5;
  const tr = o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${o.fill || '#fff'}" text-anchor="${o.anchor || 'middle'}" font-family="${o.font || 'Inter, Roboto, sans-serif'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}${o.cls ? ` class="${o.cls}"` : ''} dominant-baseline="${o.baseline || 'middle'}"${tr}>${esc(s)}</text>`;
}

export function line(x1, y1, x2, y2, o = {}) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || '#000'}" stroke-width="${o.sw || 1}"${o.cap ? ` stroke-linecap="${o.cap}"` : ' stroke-linecap="round"'}${o.cls ? ` class="${o.cls}"` : ''}${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;
}

export function path(d, o = {}) {
  return `<path d="${d}" fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''}${o.lj ? ` stroke-linejoin="${o.lj}"` : ''}${o.cap ? ` stroke-linecap="${o.cap}"` : ''}${o.cls ? ` class="${o.cls}"` : ''}${o.op !== undefined ? ` opacity="${o.op}"` : ''}${o.extra || ''}/>`;
}

export const g = (inner, o = {}) => `<g${o.cls ? ` class="${o.cls}"` : ''}${o.tr ? ` transform="${o.tr}"` : ''}${o.op !== undefined ? ` opacity="${o.op}"` : ''}${o.extra || ''}>${inner}</g>`;

/** Female header strip with square holes. pins: array of x (or y if vertical) centres. */
export function femaleHeader(xs, y, o = {}) {
  const w = 9.6, h = 9.6;
  let s = '';
  if (o.vertical) {
    const x = y;
    const y0 = Math.min(...xs) - h / 2, y1 = Math.max(...xs) + h / 2;
    s += rect(x - w / 2 - 0.2, y0 - 0.2, w + 0.4, y1 - y0 + 0.4, { fill: '#1d1d1f', rx: 0.8 });
    for (const yy of xs) s += rect(x - 2.2, yy - 2.2, 4.4, 4.4, { fill: '#050505', stroke: '#3b3b3e', sw: 0.6 });
    return s;
  }
  const x0 = Math.min(...xs) - w / 2, x1 = Math.max(...xs) + w / 2;
  s += rect(x0 - 0.2, y - h / 2 - 0.2, x1 - x0 + 0.4, h + 0.4, { fill: '#1d1d1f', rx: 0.8 });
  for (const xx of xs) s += rect(xx - 2.2, y - 2.2, 4.4, 4.4, { fill: '#050505', stroke: '#3b3b3e', sw: 0.6 });
  return s;
}

/** Male pin header (pins seen from above). */
export function maleHeader(pts, o = {}) {
  let s = '';
  for (const [x, y] of pts) {
    s += rect(x - 4.6, y - 4.6, 9.2, 9.2, { fill: o.base || '#1f1f22', rx: 0.6 });
    s += rect(x - 1.6, y - 1.6, 3.2, 3.2, { fill: o.pin || 'url(#gold)', rx: 0.4 });
  }
  return s;
}

/** Gold through-hole pad (for breadboard friendly modules). */
export function pad(x, y, o = {}) {
  return circle(x, y, o.r || 3.4, { fill: o.fill || 'url(#gold)', stroke: o.stroke || '#9c7a2b', sw: 0.5 }) + circle(x, y, (o.r || 3.4) * 0.45, { fill: '#2a2216' });
}

/** Straight lead going from (x,y0) to (x,y1) */
export function lead(x, y0, y1, o = {}) {
  return line(x, y0, x, y1, { stroke: o.color || '#b8bcc4', sw: o.sw || 1.6, cap: 'round' });
}

export function smdLed(x, y, o = {}) {
  const w = o.w || 5, h = o.h || 3;
  return rect(x - w / 2, y - h / 2, w, h, { fill: '#e9e2c9', rx: 0.4 }) +
    rect(x - w / 2 + 0.8, y - h / 2 + 0.5, w - 1.6, h - 1, { fill: o.off || '#c9c3ad', cls: o.cls, rx: 0.3 }) +
    (o.cls ? `<circle cx="${x}" cy="${y}" r="${o.glowR || 7}" fill="${o.color || '#ffbf00'}" opacity="0" class="${o.cls}-glow" filter="url(#glow)"/>` : '');
}

export function chipDIP(x, y, n, o = {}) {
  // horizontal DIP package: n pins total, pins along top & bottom, pitch 10
  const per = n / 2;
  const w = per * 10, h = o.h || 26;
  let s = rect(x, y, w, h, { fill: o.fill || '#202124', rx: 1.5 });
  s += path(`M${x} ${y + h / 2 - 3} a3 3 0 0 1 0 6`, { fill: '#121214' });
  for (let i = 0; i < per; i++) {
    const px = x + 5 + i * 10;
    s += rect(px - 1.6, y - 3, 3.2, 3, { fill: '#c8ccd2' });
    s += rect(px - 1.6, y + h, 3.2, 3, { fill: '#c8ccd2' });
  }
  if (o.label) s += text(x + w / 2, y + h / 2, o.label, { size: o.size || 5, fill: '#cfd2d6', font: 'monospace' });
  return s;
}

export function chipQFP(cx, cy, size, o = {}) {
  const h = size / 2;
  let s = '';
  const n = o.pins || 12;
  const step = (size - 6) / (n - 1);
  for (let i = 0; i < n; i++) {
    const off = -h + 3 + i * step;
    s += rect(cx + off - 0.6, cy - h - 2.5, 1.2, 2.6, { fill: '#c8ccd2' });
    s += rect(cx + off - 0.6, cy + h - 0.1, 1.2, 2.6, { fill: '#c8ccd2' });
    s += rect(cx - h - 2.5, cy + off - 0.6, 2.6, 1.2, { fill: '#c8ccd2' });
    s += rect(cx + h - 0.1, cy + off - 0.6, 2.6, 1.2, { fill: '#c8ccd2' });
  }
  s += rect(cx - h, cy - h, size, size, { fill: o.fill || '#222326', rx: 1 });
  s += circle(cx - h + 3, cy - h + 3, 1, { fill: '#3a3b3f' });
  if (o.label) s += text(cx, cy, o.label, { size: o.size || 3.6, fill: '#bfc3c8', font: 'monospace' });
  return s;
}

export function screw(x, y, r = 3) {
  return circle(x, y, r, { fill: '#e8e8e8', stroke: '#9a9a9a', sw: 0.6 }) + line(x - r * 0.6, y, x + r * 0.6, y, { stroke: '#8a8a8a', sw: 0.8 });
}

export function mountHole(x, y, r = 5) {
  return circle(x, y, r + 1.6, { fill: '#e7d7a1', op: 0.9 }) + circle(x, y, r, { fill: 'var(--canvas-bg, #0b1020)' });
}

/** Module PCB with rounded corners */
export function pcb(x, y, w, h, color, o = {}) {
  return rect(x, y, w, h, { fill: color, rx: o.rx ?? 3, stroke: o.stroke || 'rgba(0,0,0,.35)', sw: 0.8 });
}

// ------------------------------------------------------------------ board detail (SMD parts, silkscreen)
const SILK = '#eafcff';

/** Silkscreen text: small, light, never mirrored away (see .tf in app.css). */
export function silk(x, y, str, o = {}) {
  return text(x, y, str, { size: o.size || 3.6, fill: o.fill || SILK, anchor: o.anchor, rot: o.rot, weight: o.weight || 600, font: o.font });
}

/** White silkscreen outline of a region. */
export function silkBox(x, y, w, h, o = {}) {
  return rect(x, y, w, h, { stroke: o.stroke || 'rgba(234,252,255,.75)', sw: o.sw || 0.5, rx: o.rx ?? 0.8 });
}

/** SMD resistor / ceramic cap (0805): body with silver ends. vertical = rotated 90°. */
export function smdRes(x, y, o = {}) {
  const w = o.vertical ? 3 : 5.2, h = o.vertical ? 5.2 : 3;
  const body = o.cap ? '#b8975a' : '#222326';
  return rect(x, y, w, h, { fill: body, rx: 0.4 }) +
    (o.vertical ? rect(x, y, w, 1.1, { fill: '#cfd2d7' }) + rect(x, y + h - 1.1, w, 1.1, { fill: '#cfd2d7' })
      : rect(x, y, 1.1, h, { fill: '#cfd2d7' }) + rect(x + w - 1.1, y, 1.1, h, { fill: '#cfd2d7' }));
}

/** A row / grid of SMD resistors and caps: [[x, y, 'r'|'c'|'rv'|'cv'], …]. */
export function smdRow(list) {
  let s = '';
  for (const [x, y, k = 'r'] of list) s += smdRes(x, y, { cap: k[0] === 'c', vertical: k.endsWith('v') });
  return s;
}

/** Surface-mount electrolytic capacitor (can with a dark top and a polarity bar). */
export function smdElec(x, y, r = 5) {
  return rect(x - r, y - r, r * 2, r * 2, { fill: '#2a2d33', rx: 1 }) + circle(x, y, r * 0.86, { fill: 'url(#silver)', stroke: '#6f757e', sw: 0.4 }) +
    path(`M${x - r * 0.55} ${y - r * 0.55} L${x + r * 0.55} ${y + r * 0.55} M${x + r * 0.55} ${y - r * 0.55} L${x - r * 0.55} ${y + r * 0.55}`, { stroke: '#8c929b', sw: 0.5 }) +
    rect(x + r * 0.55, y - r * 0.9, r * 0.45, r * 1.8, { fill: '#1b1d22' });
}

/** Voltage regulator in a SOT-223 package with its tab (label above). */
export function regulator(x, y, label = '') {
  return rect(x, y, 12, 9, { fill: '#26282d', rx: 0.8 }) + rect(x + 2, y - 4, 8, 4, { fill: '#c5c9cf' }) +
    [0, 1, 2].map((i) => rect(x + 1.5 + i * 4, y + 9, 2, 3.2, { fill: '#c5c9cf' })).join('') +
    (label ? text(x + 6, y + 4.6, label, { size: 2.6, fill: '#9ca3af', font: 'monospace' }) : '');
}

/** Metal can crystal / ceramic resonator with its frequency. */
export function crystal(x, y, w = 14, label = '') {
  return rect(x, y, w, 6, { fill: 'url(#silver)', rx: 3, stroke: '#6f757e', sw: 0.5 }) + (label ? text(x + w / 2, y + 3.1, label, { size: 2.8, fill: '#3d4148', font: 'monospace' }) : '');
}

/** Resettable fuse (yellow box). */
export function polyfuse(x, y) { return rect(x, y, 9, 5, { fill: '#c9b21f', rx: 0.8, stroke: '#8a7a12', sw: 0.4 }) + rect(x, y, 1.4, 5, { fill: '#cfd2d7' }) + rect(x + 7.6, y, 1.4, 5, { fill: '#cfd2d7' }); }

/** Round gold test pad / via. */
export function via(x, y, r = 1.3) { return circle(x, y, r, { fill: 'url(#gold)', stroke: '#9c7a2b', sw: 0.3 }) + circle(x, y, r * 0.4, { fill: '#10281c' }); }

/** Faint copper trace lines. */
export function traces(d, o = {}) { return path(d, { stroke: o.stroke || 'rgba(255,255,255,.16)', sw: o.sw || 1.4, cap: 'round', lj: 'round' }); }

/** Small black chip (SOIC / TSSOP) with its pins and a name. */
export function smallChip(x, y, w, h, label = '', o = {}) {
  let s = '';
  const n = Math.max(2, Math.floor(w / 3.4));
  for (let i = 0; i < n; i++) { const px = x + 1.2 + i * ((w - 2.4) / (n - 1)); s += rect(px - 0.5, y - 1.6, 1, 1.7, { fill: '#c8ccd2' }) + rect(px - 0.5, y + h - 0.1, 1, 1.7, { fill: '#c8ccd2' }); }
  s += rect(x, y, w, h, { fill: o.fill || '#1e1f23', rx: 0.8 }) + circle(x + 1.6, y + 1.6, 0.6, { fill: '#45474d' });
  if (label) s += text(x + w / 2, y + h / 2, label, { size: o.size || 2.6, fill: '#aab0b8', font: 'monospace' });
  return s;
}

/** Shared <defs> placed once in the editor SVG. */
export const SHARED_DEFS = `
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e27a"/><stop offset="0.5" stop-color="#d4a83a"/><stop offset="1" stop-color="#a87a1c"/></linearGradient>
<linearGradient id="silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2f3f5"/><stop offset="0.5" stop-color="#b9bec6"/><stop offset="1" stop-color="#8d939c"/></linearGradient>
<linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d838c"/><stop offset="0.5" stop-color="#e7eaee"/><stop offset="1" stop-color="#7d838c"/></linearGradient>
<linearGradient id="blackPlastic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3b40"/><stop offset="1" stop-color="#121316"/></linearGradient>
<radialGradient id="ledShine" cx="0.35" cy="0.3" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.15"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<radialGradient id="glowGrad"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.3" stop-color="#fff" stop-opacity="0.6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="glowBig" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="7"/></filter>
<filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity="0.45"/></filter>
<filter id="smoke" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>
<radialGradient id="scorch"><stop offset="0" stop-color="#000" stop-opacity=".78"/><stop offset=".55" stop-color="#1c120a" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<pattern id="bbHoles" x="-5" y="-5" width="10" height="10" patternUnits="userSpaceOnUse"><rect x="3.2" y="3.2" width="3.6" height="3.6" rx="0.6" fill="#2b2d31"/></pattern>
`;
