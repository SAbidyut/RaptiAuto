// Diagrams of the Arduino part of the manual. Pictures are small inline SVGs in the app's dark colours; the parts
// themselves (breadboard, LED, resistor, sensors …) are drawn by the app's own component library, so a picture
// here looks like what the person sees in the editor. Nothing here touches the DOM (the pictures can be tested headless).
import { fig, K, T, R, L, P, AR, DOT, BADGE } from '../art.js';
import { getDef, pinsOf, partTransform, defaultProps, toWorld } from '../../components/index.js';
import { SHARED_DEFS } from '../../components/draw.js';
import { LED_COLORS, mix } from '../../components/basic.js';
import { icon } from '../../ui/icons.js';

export { fig, K, T, R, L, P, AR, DOT, BADGE };

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => +Number(n).toFixed(2);

/** Colours of the wires the app offers (canvas.js WIRE_COLORS) by short name. */
export const WC = { green: '#22c55e', blue: '#3b82f6', orange: '#f97316', yellow: '#eab308', purple: '#a855f7', cyan: '#06b6d4', pink: '#ec4899', white: '#f1f5f9', red: '#ef4444', black: '#111827', brown: '#8b5a2b', grey: '#9ca3af' };
const FIGBG = '#0a1226';

// ============================================================================================ real parts
/** A part as the project stores it. */
export const mkPart = (type, x = 0, y = 0, props = {}, rot = 0, extra = {}) => ({ id: 'x', type, x, y, rot, props, ...extra });
const fullProps = (p) => ({ ...defaultProps(getDef(p.type)), ...(p.props || {}) });
/** SVG of a part exactly as the editor draws it (world units: 10 = 0.1 inch). */
export function partSvg(p, mod) {
  const d = getDef(p.type);
  let s = d.render(fullProps(p));
  if (mod) s = mod(s);
  return `<g transform="${partTransform(p)}">${s}</g>`;
}
/** World position of a pin of a part. */
export function pinXY(p, pinId) {
  const pin = pinsOf({ ...p, props: p.props || {} }).find((q) => q.id === pinId);
  if (!pin) throw new Error(`no pin ${pinId} on ${p.type}`);
  return toWorld(p, pin.x, pin.y);
}
/** World box [x0,y0,x1,y1] of a part. */
export function boxOf(p) {
  const d = getDef(p.type);
  const b = typeof d.box === 'function' ? d.box(fullProps(p)) : d.box;
  const pts = [toWorld(p, b[0], b[1]), toWorld(p, b[2], b[1]), toWorld(p, b[0], b[3]), toWorld(p, b[2], b[3])];
  return [Math.min(...pts.map((q) => q[0])), Math.min(...pts.map((q) => q[1])), Math.max(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1]))];
}
/** Put a part so that its pin `pinId` lies on the world point (x, y). */
export function plugAt(type, pinId, x, y, props = {}, rot = 0, extra = {}) {
  const p = mkPart(type, 0, 0, props, rot, extra);
  const pin = pinsOf({ ...p, props }).find((q) => q.id === pinId);
  if (!pin) throw new Error(`no pin ${pinId} on ${type}`);
  const [rx, ry] = toWorld({ x: 0, y: 0, rot, flipX: extra.flipX, flipY: extra.flipY }, pin.x, pin.y);
  p.x = x - rx; p.y = y - ry;
  return p;
}

/** An LED that is on (glowing), or burnt (charred), made from the app's own LED drawing. */
export const ledMod = (color = 'red', mode = 'on', k = 0.95) => (s) => {
  const c = LED_COLORS[color] || LED_COLORS.red;
  if (mode === 'burnt') return s.split(c.off).join('#2a1d14');
  s = s.split(c.off).join(mix(c.off, c.on, k));
  return s.replace(/(class="led-glow"[^>]*?)opacity="0"/, `$1opacity="${k}"`).replace(/(class="led-core"[^>]*?)opacity="0"/, `$1opacity="${(k * 0.8).toFixed(2)}"`);
};

// ============================================================================================ breadboard
const BBTYPES = { half: 'breadboard-half', full: 'breadboard', mini: 'breadboard-mini' };
const bbCache = {};
/** World position of a breadboard hole ("a10", "tn.4", "bp.2"); the breadboard sits at (0, 0). */
export function holeXY(id, kind = 'half') {
  const key = BBTYPES[kind];
  if (!bbCache[key]) bbCache[key] = new Map(getDef(key).pins.map((p) => [p.id, [p.x, p.y]]));
  const h = bbCache[key].get(id);
  if (!h) throw new Error('no hole ' + id + ' on ' + key);
  return h;
}

// ============================================================================================ the scene builder
/** Wire path through points with rounded corners (like the editor's smooth wires). */
function wirePath(pts, r = 5) {
  if (pts.length < 2) return '';
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${f1(cx - ((cx - px) / (l1 || 1)) * rr)} ${f1(cy - ((cy - py) / (l1 || 1)) * rr)} Q${f1(cx)} ${f1(cy)} ${f1(cx + ((nx - cx) / (l2 || 1)) * rr)} ${f1(cy + ((ny - cy) / (l2 || 1)) * rr)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${f1(l[0])} ${f1(l[1])}`;
}
/** One wire as the editor draws it: dark outline, coloured core, a light shine, round ends. */
export function wireSvg(pts, color, o = {}) {
  const d = wirePath(pts);
  const w = o.w || 2.7;
  const a = pts[0], b = pts[pts.length - 1];
  if (o.dash) return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/><circle cx="${f1(a[0])}" cy="${f1(a[1])}" r="4.2" fill="none" stroke="${K.acc}" stroke-width="1.3"/>`;
  return (o.sel ? `<path d="${d}" fill="none" stroke="rgba(34,211,238,.55)" stroke-width="${w + 5.5}" stroke-linecap="round" stroke-linejoin="round"/>` : '') + (o.hi ? `<path d="${d}" fill="none" stroke="${K.acc}" stroke-opacity=".5" stroke-width="${w + 6}" stroke-linecap="round" stroke-linejoin="round"/>` : '') +
    `<path d="${d}" fill="none" stroke="rgba(3,6,14,.75)" stroke-width="${w + 1.6}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round" transform="translate(-.4 -.5)"/>` +
    `<circle cx="${f1(a[0])}" cy="${f1(a[1])}" r="1.9" fill="#c9d1df" stroke="rgba(3,6,14,.7)" stroke-width=".7"/><circle cx="${f1(b[0])}" cy="${f1(b[1])}" r="1.9" fill="#c9d1df" stroke="rgba(3,6,14,.7)" stroke-width=".7"/>` +
    (o.sel ? pts.slice(1, -1).map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="3.4" fill="#fff" fill-opacity=".92" stroke="${K.acc}" stroke-width="1.2"/>`).join('') +
      pts.slice(0, -1).map((p, i) => `<circle cx="${f1((p[0] + pts[i + 1][0]) / 2)}" cy="${f1((p[1] + pts[i + 1][1]) / 2)}" r="2.2" fill="${K.acc}" fill-opacity=".75"/>`).join('') : '');
}

const RIB_H = 26;
/** Colour of a pin name on the board strip. */
const pinInk = (id) => (/^(5V|3\.3V|3V3|VIN|Vin|VCC)$/.test(id) ? '#ffc9c9' : /^GND/.test(id) ? '#d1d5db' : '#eafcff');
const pinText = (id) => id.replace(/\.\d$/, '');

/**
 * A "wiring picture": the Arduino as a strip of the pins this project uses (teal bar with sockets, like the real board),
 * modules above or below it, a breadboard below it, and the parts and wires of the circuit. Everything but the strip is the
 * app's own artwork.
 *
 * o.cols [c0, c1]  breadboard columns shown · o.bb 'half' | 'mini' | 'full' | null · o.crop 'top' | 'full' · o.cropTo (world units below row a)
 * o.board  { name, pins: ['D13', 'GND', '5V'…], labels? }  (the pins that have a wire; the strip puts them where the wires want them)
 * o.up     modules above the strip (their pins point down): [{ id, type, props, x, rot }]
 * o.dn     modules below the strip (pins on top: LCDs …), used instead of a breadboard
 * o.parts  [{ id, type, props, pin, hole, rot, flipX, mod }]   plug a pin of a part into a breadboard hole
 * o.free   [{ id, type, props, x, y, rot }]                    loose parts at world positions (below the strip, x as in o.up)
 * o.wires  [{ a, b, color, hi, via, pts }]  endpoints: 'R/D13' (strip), 'B/a10' (breadboard hole), 'id/PIN' (a part's pin)
 * o.tags   [{ at, text, dx, dy, color, below }] small labels · o.bands [col…] · o.bandRails ['tn'…] · o.rings ['B/a10'…] · o.hi [ids] · o.show [ids] · o.showWires [indexes]
 */
let clipCount = 0;
export const bench = (o) => { const r = benchSvg(o); return fig(r.w, r.h, r.content, o.cap || ''); };
export function benchSvg(o) {
  const kind = o.bb === undefined ? 'half' : o.bb;
  const [c0, c1] = o.cols || [1, 24];
  const crop = o.crop || 'top';
  const wPx = o.w || 360;
  const bbX0 = -(c0 - 1) * 10 + 15;                      // breadboard x so that column c0 sits near x = 15
  const wUnits = o.ww || (kind ? (c1 - c0) * 10 + 30 : 260);
  const s = wPx / wUnits;
  // ---- the zones, top to bottom
  const ups = (o.up || []).map((m) => ({ ...m, part: mkPart(m.type, m.x ?? 0, 0, m.props || {}, m.rot || 0, m.flipX ? { flipX: true } : {}) }));
  const dns = (o.dn || []).map((m) => ({ ...m, part: mkPart(m.type, m.x ?? 0, 0, m.props || {}, m.rot || 0, m.flipX ? { flipX: true } : {}) }));
  const upH = ups.length ? Math.max(...ups.map((m) => -boxOf(m.part)[1])) : 0;
  const gapUp = ups.length ? (o.gapUp || 44) : 0;
  const yUpPins = 8 + upH;
  const yStrip = ups.length ? yUpPins + gapUp : 8;
  const yStripBot = o.board ? yStrip + RIB_H : yStrip;
  const gapDown = o.board ? (o.gapDown || (kind || dns.length ? 36 : 0)) : 0;
  const yBelow = yStripBot + gapDown;
  const rowA = yBelow + (kind === 'mini' ? 14 : 55);                               // world y of breadboard row "a"
  for (const m of ups) m.part.y = yUpPins;
  for (const m of dns) m.part.y = yBelow;
  const holeW = (id) => { const [x, y] = holeXY(id, kind); return [x + bbX0, y + rowA]; };
  // ---- parts
  const parts = new Map();
  for (const m of ups) { m.id = m.id || m.type; parts.set(m.id, m.part); }
  for (const m of dns) { m.id = m.id || m.type; parts.set(m.id, m.part); }
  const placed = [];
  for (const q of o.parts || []) {
    const [hx, hy] = holeW(q.hole);
    const p = plugAt(q.type, q.pin, hx, hy, q.props || {}, q.rot || 0, { flipX: q.flipX, flipY: q.flipY });
    placed.push({ ...q, part: p }); parts.set(q.id, p);
  }
  for (const q of o.free || []) { const p = mkPart(q.type, q.x, q.y ?? yBelow, q.props || {}, q.rot || 0, q.flipX ? { flipX: true } : {}); placed.push({ ...q, part: p, free: true }); parts.set(q.id, p); }
  const pinPos = (ref) => {
    const [k, id] = ref.split('/');
    if (k === 'B') return holeW(id);
    const p = parts.get(k);
    if (!p) throw new Error('unknown part ' + k);
    return pinXY(p, id);
  };
  // ---- the strip: every pin that has a wire gets its x from the wire ends, then they are spread out
  const strip = o.board ? { pins: o.board.pins.map((id) => ({ id, up: [], down: [] })) } : null;
  const wires = (o.wires || []).map((w) => ({ ...w }));
  const nameW = o.board ? (o.board.name === '' ? 4 : (o.board.name || 'Arduino Uno').length * 3.5 + 8) : 0;
  if (strip) {
    for (const w of wires) {
      for (const [mine, other] of [[w.a, w.b], [w.b, w.a]]) {
        if (!mine.startsWith('R/') || other.startsWith('R/')) continue;
        const pin = strip.pins.find((q) => q.id === mine.slice(2));
        if (!pin) throw new Error('board pin missing: ' + mine);
        const op = pinPos(other);
        (op[1] < yStrip ? pin.up : pin.down).push(op[0]);
      }
    }
    const gap = o.pinGap || 31, xl = 4, xr = wUnits - 4;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const items = strip.pins.map((q) => ({ q, want: q.down.length ? mean(q.down) : q.up.length ? mean(q.up) : (xl + xr) / 2 }));
    if (o.board.order) items.sort((a, b) => o.board.order.indexOf(a.q.id) - o.board.order.indexOf(b.q.id)); else items.sort((a, b) => a.want - b.want);
    const lo = xl + 10 + nameW + gap / 2 - 6, hi = xr - 14;
    let prev = lo - gap;
    for (const it of items) { it.x = Math.max(it.want, prev + gap, lo); prev = it.x; }
    let next = hi + gap;
    for (let i = items.length - 1; i >= 0; i--) { items[i].x = Math.min(items[i].x, next - gap); next = items[i].x; }
    for (const it of items) it.q.x = it.x;
    strip.x0 = xl; strip.x1 = xr;
  }
  // ---- route the wires
  const routed = wires.map((w) => {
    const ra = w.a.startsWith('R/'), rb = w.b.startsWith('R/');
    if (ra || rb) {
      const other = ra ? w.b : w.a, pin = strip.pins.find((q) => q.id === (ra ? w.a : w.b).slice(2));
      const op = pinPos(other), up = op[1] < yStrip;
      return { w, from: [pin.x, up ? yStrip : yStripBot], to: op, dir: up ? 'up' : 'down' };
    }
    return { w, from: pinPos(w.a), to: pinPos(w.b), dir: 'local' };
  });
  for (const dir of ['up', 'down']) {
    const list = routed.filter((q) => q.dir === dir && !q.w.pts);
    const right = list.filter((q) => q.to[0] - q.from[0] > 1).sort((a, b) => a.from[0] - b.from[0]);
    const left = list.filter((q) => q.to[0] - q.from[0] < -1).sort((a, b) => b.from[0] - a.from[0]);
    const span = dir === 'up' ? yStrip - (yUpPins + 4) : gapDown;
    const step = Math.min(6.2, (span - 12) / Math.max(1, right.length + left.length));
    const base = dir === 'up' ? yStrip - 8 : yStripBot + 8, sign = dir === 'up' ? -1 : 1;
    // the wire that goes right and starts leftmost runs farthest from the strip, so that no wire crosses another
    right.forEach((q, i) => { q.cy = base + sign * (right.length - 1 - i) * step; });
    left.forEach((q, i) => { q.cy = base + sign * (right.length + left.length - 1 - i) * step; });
  }
  for (const q of routed) {
    const [x1, y1] = q.from, [x2, y2] = q.to, w = q.w;
    if (w.pts) q.pts = [q.from, ...(typeof w.pts === 'function' ? w.pts({ from: q.from, to: q.to }) : w.pts), q.to];
    else if (q.dir === 'local') {
      if (Math.abs(x1 - x2) < 1 || Math.abs(y1 - y2) < 1) q.pts = [q.from, q.to];
      else if (w.hv) q.pts = [q.from, [x2, y1], q.to];
      else { const my = w.via ?? (y1 + y2) / 2; q.pts = [q.from, [x1, my], [x2, my], q.to]; }
    } else if (Math.abs(x1 - x2) <= 1) q.pts = [q.from, q.to];
    else q.pts = [q.from, [x1, w.via ?? q.cy], [x2, w.via ?? q.cy], q.to];
  }
  // ---- the picture
  const bbSvg = kind ? partSvg(mkPart(BBTYPES[kind], bbX0, rowA)) : '';
  let bandSvg = '';
  for (const c of o.bands || []) {
    const [bx] = holeW('a' + c);
    bandSvg += `<rect x="${f1(bx - 5.5)}" y="${f1(rowA - 6)}" width="11" height="56" rx="3" fill="${K.acc}" fill-opacity=".16" stroke="${K.acc}" stroke-opacity=".7" stroke-width=".9"/>`;
  }
  for (const c of o.bandsLow || []) {
    const [bx] = holeW('f' + c);
    bandSvg += `<rect x="${f1(bx - 5.5)}" y="${f1(rowA + 64)}" width="11" height="52" rx="3" fill="${K.vio}" fill-opacity=".16" stroke="${K.vio}" stroke-opacity=".7" stroke-width=".9"/>`;
  }
  for (const r of o.bandRails || []) {
    const [bx0, by] = holeW(r + '.1'), n = kind === 'full' ? 50 : 25;
    const lastId = [...Array(n).keys()].map((i) => r + '.' + (n - i)).find((id) => { try { holeW(id); return true; } catch (e) { return false; } });
    const [bx1] = holeW(lastId);
    const col = r.endsWith('p') ? K.err : K.blue;
    bandSvg += `<rect x="${f1(bx0 - 6)}" y="${f1(by - 5.5)}" width="${f1(bx1 - bx0 + 12)}" height="11" rx="3" fill="${col}" fill-opacity=".2" stroke="${col}" stroke-opacity=".8" stroke-width=".9"/>`;
  }
  const show = new Set(o.show || [...parts.keys()]);
  let partSvgs = '', hiSvg = '';
  for (const m of [...ups, ...dns, ...placed]) if (show.has(m.id)) partSvgs += partSvg(m.part, m.mod);
  for (const id of o.hi || []) {
    const p = parts.get(id);
    if (!p) continue;
    const b = boxOf(p);
    hiSvg += `<rect x="${f1(b[0] - 4)}" y="${f1(b[1] - 4)}" width="${f1(b[2] - b[0] + 8)}" height="${f1(b[3] - b[1] + 8)}" rx="5" fill="${K.acc}" fill-opacity=".07" stroke="${K.acc}" stroke-width="1.3" stroke-dasharray="4 3"/>`;
  }
  let wireSvgs = '';
  routed.forEach((q, i) => { if (!o.showWires || o.showWires.includes(i)) wireSvgs += wireSvg(q.pts, WC[q.w.color] || q.w.color || WC.green, { hi: q.w.hi, dash: q.w.dash, sel: q.w.sel }); });
  let ringSvg = '';
  for (const r of o.rings || []) { const p = pinPos(r); ringSvg += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="5.4" fill="none" stroke="${K.acc}" stroke-width="1.4"/>`; }
  const stripSvg = strip ? stripArt(strip, yStrip, s, o.board, nameW) : '';
  let badgeSvg = '';
  for (const b of o.badges || []) {
    const p = typeof b.at === 'string' ? pinPos(b.at) : b.at;
    const r = 8 / s;
    badgeSvg += `<circle cx="${f1(p[0] + (b.dx || 0) / s)}" cy="${f1(p[1] + (b.dy || 0) / s)}" r="${f1(r)}" fill="${K.acc}"/><text x="${f1(p[0] + (b.dx || 0) / s)}" y="${f1(p[1] + (b.dy || 0) / s + 3.7 / s)}" font-size="${f1(10.5 / s)}" font-weight="800" fill="#04121a" text-anchor="middle">${b.n}</text>`;
  }
  let tagSvg = '';
  for (const t of o.tags || []) {
    let x, y;
    if (typeof t.at === 'string' && parts.has(t.at)) { const b = boxOf(parts.get(t.at)); x = (b[0] + b[2]) / 2; y = t.below ? b[3] + 17 / s : b[1] - 2; }
    else if (typeof t.at === 'string') { const p = pinPos(t.at); x = p[0]; y = p[1]; }
    else { x = t.at[0]; y = t.at[1]; }
    tagSvg += pill(x + (t.dx || 0) / s, y + (t.dy ?? -8) / s, t.text, { s, color: t.color, fill: t.fill });
  }
  // ---- the window
  let yEnd;
  if (o.hh) yEnd = o.hh;
  else if (kind) yEnd = rowA + (o.cropTo ?? (crop === 'full' ? (kind === 'mini' ? 128 : 168) : 62));
  else if (dns.length) yEnd = yBelow + Math.max(...dns.map((m) => boxOf(m.part)[3])) + 8;
  else yEnd = Math.max(yStripBot + 14, ...placed.filter((q) => q.free).map((q) => boxOf(q.part)[3] + 8));
  const hBase = Math.round(yEnd * s), hPx = hBase + (o.extraPx || 0);
  const fade = kind && crop !== 'full' && o.cropTo === undefined ? `<rect x="0" y="${f1(yEnd - 9)}" width="${f1(wUnits)}" height="9" fill="url(#ardFade)"/>` : '';
  const cid = 'ardClip' + (++clipCount);
  const sc = f1(s * 1000) / 1000;
  const content = `<defs>${SHARED_DEFS}<linearGradient id="ardFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${FIGBG}" stop-opacity="0"/><stop offset="1" stop-color="${FIGBG}"/></linearGradient><clipPath id="${cid}"><rect x="0" y="0" width="${f1(wUnits)}" height="${f1(yEnd)}"/></clipPath></defs>` +
    `<g transform="scale(${sc})"><g clip-path="url(#${cid})">${bbSvg}${bandSvg}${partSvgs}${hiSvg}${wireSvgs}${stripSvg}${ringSvg}${fade}${tagSvg}${badgeSvg}</g>${o.over ? o.over({ s, holeW, rowA, yStrip, yStripBot, pinPos, parts, routed, wUnits, hBase, stripX: (id) => strip.pins.find((q) => q.id === id).x }) : ''}</g>`;
  return { content, w: wPx, h: hPx, s };
}

/** The strip that stands for the Arduino: teal bar, one socket per pin that has a wire, pin names in white. */
function stripArt(strip, y, s, board, nameW) {
  const { x0, x1 } = strip;
  let g = `<g filter="url(#softShadow)"><rect x="${x0}" y="${y}" width="${f1(x1 - x0)}" height="${RIB_H}" rx="4" fill="#008f95" stroke="rgba(0,0,0,.4)" stroke-width=".8"/></g>`;
  g += `<rect x="${x0 + 3}" y="${y + 3}" width="${f1(x1 - x0 - 6)}" height="${RIB_H - 6}" rx="2.5" fill="none" stroke="#e9fbff" stroke-opacity=".35" stroke-width=".5"/>`;
  if (board.name !== '') {
    const nm = (board.name || 'Arduino Uno').toUpperCase().split(' ');
    g += `<text x="${x0 + 9}" y="${f1(y + RIB_H / 2 - 0.6)}" font-size="${f1(8 / s)}" font-weight="800" fill="#eafcff">${esc(nm[0])}</text>`;
    g += `<text x="${x0 + 9}" y="${f1(y + RIB_H / 2 - 0.6 + 10 / s)}" font-size="${f1(8 / s)}" font-weight="800" fill="#eafcff">${esc(nm.slice(1).join(' '))}</text>`;
  }
  for (const q of strip.pins) {
    const lab = (board.labels && board.labels[q.id]) || pinText(q.id);
    g += `<text x="${f1(q.x)}" y="${f1(y + RIB_H / 2 + 3.4 / s)}" font-size="${f1(10 / s)}" font-weight="700" fill="${pinInk(q.id)}" text-anchor="middle">${esc(lab)}</text>`;
    const sock = (yy) => `<rect x="${f1(q.x - 3.4)}" y="${f1(yy - 3.4)}" width="6.8" height="6.8" rx=".8" fill="#0b0b0c" stroke="#3b3b3e" stroke-width=".6"/><rect x="${f1(q.x - 1.3)}" y="${f1(yy - 1.3)}" width="2.6" height="2.6" rx=".4" fill="url(#gold)"/>`;
    if (q.up.length) g += sock(y);
    if (q.down.length) g += sock(y + RIB_H);
  }
  return g;
}

/** A small rounded label (size given in pixels of the finished picture). */
function pill(x, y, text, { s, color = K.ink, fill = '#0b1226' } = {}) {
  const px = 9.5 / s, w = (String(text).length * 5.6 + 12) / s, h = 15 / s;
  return `<g><rect x="${f1(x - w / 2)}" y="${f1(y - h)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(h / 2)}" fill="${fill}" fill-opacity=".92" stroke="${color}" stroke-opacity=".8" stroke-width="${f1(0.9 / s)}"/>` +
    `<text x="${f1(x)}" y="${f1(y - h / 2 + px * 0.34)}" font-size="${f1(px)}" fill="${color}" text-anchor="middle" font-weight="700">${esc(text)}</text></g>`;
}

// ============================================================================================ projects of the app, drawn small
import { EXAMPLES } from '../../examples/index.js';
/** A whole example circuit (real parts, real wires) as world-unit SVG + its box; hide: part ids to leave out, mods: { partId: fn(svg) }. */
export function projectScene(id, { hide = [], mods = {}, wires = true } = {}) {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error('no example ' + id);
  const parts = ex.parts.filter((p) => getDef(p.type) && !hide.includes(p.id));
  const sorted = [...parts.filter((p) => getDef(p.type).layer === -1), ...parts.filter((p) => getDef(p.type).layer !== -1)];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, svg = '';
  for (const p of sorted) {
    const b = boxOf(p);
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    svg += partSvg(p, mods[p.id]);
  }
  const byId = new Map(parts.map((p) => [p.id, p]));
  if (wires) {
    for (const w of ex.wires) {
      const a = byId.get(w.from.part), b = byId.get(w.to.part);
      if (!a || !b) continue;
      const pts = [pinXY(a, w.from.pin), ...(w.points || []), pinXY(b, w.to.pin)];
      svg += wireSvg(pts, w.color || WC.green, { w: 3 });
      for (const [x, y] of pts) { x0 = Math.min(x0, x - 3); y0 = Math.min(y0, y - 3); x1 = Math.max(x1, x + 3); y1 = Math.max(y1, y + 3); }
    }
  }
  return { svg, box: [x0, y0, x1, y1], ex };
}
/** Fit a scene into the rectangle (x, y, w, h), centred. */
export function sceneIn(sc, x, y, w, h) {
  const bw = sc.box[2] - sc.box[0], bh = sc.box[3] - sc.box[1];
  const k = Math.min(w / bw, h / bh);
  const tx = x + (w - bw * k) / 2 - sc.box[0] * k, ty = y + (h - bh * k) / 2 - sc.box[1] * k;
  return `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${f1(k * 1000) / 1000})">${sc.svg}</g>`;
}
/** A single part drawn to fit a rectangle. */
export function partIn(type, x, y, w, h, props = {}, rot = 0, mod) {
  const p = mkPart(type, 0, 0, props, rot);
  const b = boxOf(p);
  const k = Math.min(w / (b[2] - b[0]), h / (b[3] - b[1]));
  const tx = x + (w - (b[2] - b[0]) * k) / 2 - b[0] * k, ty = y + (h - (b[3] - b[1]) * k) / 2 - b[1] * k;
  return `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${f1(k * 1000) / 1000})">${partSvg(p, mod)}</g>`;
}
const SHARED = `<defs>${SHARED_DEFS}</defs>`;
/** Light up the "L" LED of an Uno drawing. */
export const unoLit = (s) => s.replace(/fill="#d8cfb4"([^>]*?class="led-L")/, 'fill="#ffd24a"$1').replace(/opacity="0"( class="led-L-glow")/, 'opacity=".95"$1');

// ============================================================================================ user-interface mock-ups
const UIDEFS = `<defs><pattern id="ardGrid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".8" fill="rgba(148,163,184,.24)"/></pattern>
<linearGradient id="ardGreen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16a34a"/><stop offset="1" stop-color="#22c55e"/></linearGradient>
<linearGradient id="ardRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e11d48"/><stop offset="1" stop-color="#ef4444"/></linearGradient>
<linearGradient id="ardBrand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".55" stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>`;
const PHONE = '#070b16', CANVAS = '#0a1124', BAR = '#0b1226', LINE2 = 'rgba(148,163,184,.22)';
/** An icon of the app (stroke icons of ui/icons.js) at a place. */
const iconBody = (name) => icon(name, 24).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const ico = (name, x, y, size = 16, color = '#cbd5e1') => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(size / 24)})" style="color:${color}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconBody(name)}</g>`;
const pillBtn = (x, y, w, h, fill, label, o = {}) => R(x, y, w, h, { fill, stroke: o.stroke || 'none', rx: o.rx ?? h / 2, sw: o.sw || 1 }) + T(x + w / 2, y + h / 2 + (o.size || 9) * 0.36, label, { size: o.size || 9, anchor: 'middle', weight: o.weight || 700, fill: o.ink || '#fff' });
const runButton = (x, y, running, w = 66, h = 26) => R(x, y, w, h, { fill: running ? 'url(#ardRed)' : 'url(#ardGreen)', stroke: 'none', rx: 9 }) + ico(running ? 'stop' : 'play', x + 8, y + (h - 14) / 2, 14, '#fff') + T(x + 26, y + h / 2 + 3.4, running ? 'Stop' : 'Run', { size: 10.5, fill: '#fff', weight: 700 });
const navTab = (x, y, w, name, label, on) => (on ? `<rect x="${x + w / 2 - 11}" y="${y - 2}" width="22" height="2.4" rx="1.2" fill="url(#ardBrand)"/>` : '') + ico(name, x + w / 2 - 8, y + 4, 16, on ? K.acc : '#5d6c8c') + T(x + w / 2, y + 28, label, { size: 8.5, anchor: 'middle', fill: on ? '#e8eef9' : '#5d6c8c', weight: 600 });
const sideRail = (x, y, names, o = {}) => {
  const n = names.length, h = n * 22 + 8;
  let s = R(x, y, 28, h, { fill: 'rgba(10,16,32,.85)', stroke: LINE2, rx: 10 });
  names.forEach((nm, i) => { if (nm === '-') s += L(x + 6, y + 8 + i * 22 + 11, x + 22, y + 8 + i * 22 + 11, { stroke: LINE2, sw: 1 }); else s += ico(nm, x + 6, y + 4 + i * 22 + 2, 16, o.on === nm ? K.acc : '#c7d2e8'); });
  return s;
};
/** The shell of a phone screen. */
const phone = (x, y, w, h, o = {}) => R(x, y, w, h, { fill: PHONE, stroke: K.line, rx: o.rx ?? 16, sw: 1.3 });
/** Top bar of the editor at (x, y) with width w. */
const topBar = (x, y, w, name, board, running) => R(x + 1, y + 1, w - 2, 40, { fill: BAR, stroke: 'none', rx: 14 }) + L(x + 1, y + 41, x + w - 1, y + 41, { stroke: 'rgba(148,163,184,.13)', sw: 1 }) +
  ico('back', x + 8, y + 12, 18, '#cbd5e1') + T(x + 32, y + 18, name, { size: 11, weight: 700, fill: '#e8eef9' }) + T(x + 32, y + 31, board, { size: 8.5, fill: '#8fe9f7', weight: 600 }) +
  runButton(x + w - 94, y + 8, running) + ico('dots', x + w - 22, y + 11, 18, '#cbd5e1');

/** The circuit of the LED example without the board (for the little phone screens). */
const miniLed = (x, y, w, h, lit = false) => sceneIn(projectScene('led-resistor', { hide: ['uno'], mods: lit ? { led2: ledMod('red') } : {} }), x, y, w, h);

// ---------------------------------------------------------------------------------------------- A1
export const heroArd = () => {
  const sc = projectScene('led-resistor', { mods: { led2: ledMod('red'), uno: unoLit } });
  const chip = (x, n, name, label, c) => R(x, 12, 104, 34, { fill: 'rgba(15,23,43,.9)', stroke: c, rx: 12, sw: 1.2 }) + `<circle cx="${x + 18}" cy="29" r="11" fill="${c}" fill-opacity=".16"/>` + ico(name, x + 10, 21, 16, c) + T(x + 36, 26, n, { size: 8.5, fill: K.dim, weight: 700 }) + T(x + 36, 38, label, { size: 11.5, weight: 800, fill: K.ink });
  return fig(380, 262,
    SHARED + UIDEFS + `<defs><radialGradient id="ardHeroGlow"><stop offset="0" stop-color="#ff3b3b" stop-opacity=".5"/><stop offset="1" stop-color="#ff3b3b" stop-opacity="0"/></radialGradient></defs>` +
    `<ellipse cx="238" cy="106" rx="78" ry="46" fill="url(#ardHeroGlow)"/>` +
    chip(12, 'STEP 1', 'wire', 'Wire it', K.ok) + chip(138, 'STEP 2', 'code', 'Code it', K.blue) + chip(264, 'STEP 3', 'play', 'Run it', K.warn) +
    AR(118, 29, 136, 29, { m: 'mfa' }) + AR(244, 29, 262, 29, { m: 'mfa' }) +
    sceneIn(sc, 8, 58, 364, 140) +
    R(12, 206, 172, 44, { fill: '#08101f', stroke: K.line, rx: 10 }) +
    `<text x="22" y="224" font-size="10.5" font-family="JetBrains Mono, ui-monospace, monospace" fill="#c792ea">digitalWrite<tspan fill="#e6edf7">(</tspan><tspan fill="#f78c6c">13</tspan><tspan fill="#e6edf7">, </tspan><tspan fill="#f78c6c">HIGH</tspan><tspan fill="#e6edf7">);</tspan></text>` +
    `<text x="22" y="240" font-size="10.5" font-family="JetBrains Mono, ui-monospace, monospace" fill="#66789c" font-style="italic">// LED on</text>` +
    R(196, 206, 172, 44, { fill: '#08101f', stroke: K.line, rx: 10 }) + ico('terminal', 204, 212, 14, K.dim) +
    `<text x="224" y="221" font-size="9" fill="${K.dim}" font-weight="600">Serial Monitor</text><text x="204" y="238" font-size="10.5" font-family="JetBrains Mono, ui-monospace, monospace" fill="#a3e635">LED is ON</text>`,
    'The Arduino lab: wire real parts on a breadboard, write the sketch, press Run and watch it live.');
};

export const cycle = () => fig(360, 150,
  [['wire', 'Wire it', 'parts + pins', K.ok], ['code', 'Code it', 'the sketch', K.blue], ['play', 'Run it', 'press Run', K.warn], ['activity', 'Watch it', 'LEDs · Serial', K.acc]].map(([ic, a, b, c], i) =>
    R(8 + i * 88, 26, 76, 70, { fill: K.box, stroke: c, rx: 12, sw: 1.3 }) + `<circle cx="${46 + i * 88}" cy="49" r="14" fill="${c}" fill-opacity=".15"/>` + ico(ic, 36 + i * 88, 39, 20, c) +
    T(46 + i * 88, 76, a, { size: 11.5, anchor: 'middle', weight: 800 }) + T(46 + i * 88, 89, b, { size: 8.5, anchor: 'middle', fill: K.line }) + (i < 3 ? AR(87 + i * 88, 61, 95 + i * 88, 61) : '')).join('') +
  P('M346 100 V126 H22 V100', { stroke: K.acc, dash: '4 4' }) + `<path d="M22 100l-4 7h8z" fill="${K.acc}"/>` +
  T(184, 120, 'something is wrong?  Stop, change, Run again', { size: 10, anchor: 'middle', fill: K.acc, weight: 600 }) + T(180, 14, 'The working routine', { size: 10, anchor: 'middle', fill: K.dim, weight: 700 }),
  'Every project follows the same loop. Circuit changes need Stop first; code changes apply on the next Run.');

const boardThumb = (type, x, y, w, h) => partIn(type, x, y, w, h);
export const homeFlow = () => {
  const px = [10, 130, 250], pw = 100, ph = 190, py = 8;
  let s = SHARED + UIDEFS;
  // 1 home
  s += phone(px[0], py, pw, ph) +
    T(px[0] + 10, py + 26, 'Build circuits.', { size: 10.5, weight: 800 }) + T(px[0] + 10, py + 40, 'Code. Simulate.', { size: 10.5, weight: 800, fill: K.acc }) +
    T(px[0] + 10, py + 56, 'Wire real parts and', { size: 7.5, fill: K.line }) + T(px[0] + 10, py + 66, 'watch them run.', { size: 7.5, fill: K.line }) +
    R(px[0] + 10, py + 78, 80, 24, { fill: 'url(#ardBrand)', stroke: 'none', rx: 9 }) + ico('plus', px[0] + 15, py + 83, 14, '#04121a') + T(px[0] + 32, py + 93.5, 'New Project', { size: 8.5, weight: 800, fill: '#04121a' }) +
    R(px[0] + 10, py + 110, 38, 30, { fill: K.box, stroke: K.line, rx: 8 }) + ico('folder', px[0] + 21, py + 116, 16, '#8fe9f7') + R(px[0] + 52, py + 110, 38, 30, { fill: K.box, stroke: K.line, rx: 8 }) + ico('book', px[0] + 63, py + 116, 16, '#c4b5fd') +
    T(px[0] + 29, py + 152, 'My projects', { size: 7, anchor: 'middle', fill: K.line }) + T(px[0] + 71, py + 152, 'Examples', { size: 7, anchor: 'middle', fill: K.line });
  // 2 choose a board
  s += phone(px[1], py, pw, ph) + R(px[1] + 1, py + 40, pw - 2, ph - 41, { fill: '#0f172b', stroke: LINE2, rx: 14 }) + T(px[1] + 10, py + 56, 'Choose a board', { size: 9, weight: 800 });
  [['uno-r3', 'Uno R3'], ['nano', 'Nano'], ['mega2560', 'Mega'], ['esp32-devkit', 'ESP32'], ['nodemcu-esp8266', 'NodeMCU'], ['stm32-bluepill', 'Blue Pill']].forEach(([t, n], i) => {
    const cx = px[1] + 8 + (i % 2) * 44, cy = py + 64 + Math.floor(i / 2) * 40;
    s += R(cx, cy, 40, 36, { fill: K.box, stroke: i === 0 ? K.acc : K.line, rx: 7, sw: i === 0 ? 1.4 : 1 }) + boardThumb(t, cx + 3, cy + 3, 34, 20) + T(cx + 20, cy + 32, n, { size: 6.8, anchor: 'middle', fill: K.line });
  });
  s += R(px[1] + 1, py + 8, pw - 2, 30, { fill: 'rgba(7,11,22,.0)', stroke: 'none' }) + T(px[1] + pw / 2, py + 28, 'New Project', { size: 8.5, anchor: 'middle', fill: K.dim, weight: 700 });
  // 3 editor with the board only
  s += phone(px[2], py, pw, ph) + R(px[2] + 1, py + 1, pw - 2, 28, { fill: BAR, stroke: 'none', rx: 14 }) + T(px[2] + 26, py + 14, 'Project 1', { size: 7.5, weight: 700 }) + T(px[2] + 26, py + 23, 'Arduino Uno R3', { size: 6.3, fill: '#8fe9f7' }) +
    R(px[2] + pw - 38, py + 5, 32, 17, { fill: 'url(#ardGreen)', stroke: 'none', rx: 6 }) + T(px[2] + pw - 22, py + 17, 'Run', { size: 7.5, anchor: 'middle', fill: '#fff', weight: 700 }) +
    R(px[2] + 4, py + 32, pw - 8, 124, { fill: CANVAS, stroke: 'none', rx: 8 }) + `<rect x="${px[2] + 4}" y="${py + 32}" width="${pw - 8}" height="124" fill="url(#ardGrid)"/>` +
    partIn('uno-r3', px[2] + 10, py + 52, pw - 24, 80) + R(px[2] + 6, py + 34, 72, 14, { fill: 'rgba(8,47,73,.85)', stroke: 'rgba(34,211,238,.4)', rx: 5 }) + T(px[2] + 42, py + 44, 'Tap ＋ to add parts', { size: 6.3, anchor: 'middle', fill: '#dff9ff' }) +
    `<circle cx="${px[2] + pw - 22}" cy="${py + 136}" r="12" fill="url(#ardBrand)"/>` + ico('plus', px[2] + pw - 29, py + 129, 14, '#fff') +
    R(px[2] + 1, py + 160, pw - 2, 29, { fill: BAR, stroke: 'none', rx: 14 }) + [['circuit', 'Circuit', 1], ['code', 'Code', 0], ['terminal', 'Serial', 0]].map(([n, l, on], i) => ico(n, px[2] + 12 + i * 30, py + 164, 12, on ? K.acc : '#5d6c8c') + T(px[2] + 18 + i * 30, py + 183, l, { size: 6, anchor: 'middle', fill: on ? '#e8eef9' : '#5d6c8c' })).join('');
  s += AR(112, 100, 128, 100, { m: 'mfb', stroke: K.acc }) + AR(232, 100, 248, 100, { m: 'mfb', stroke: K.acc });
  [['① New Project', 0], ['② Pick the board', 1], ['③ Add parts, code, Run', 2]].forEach(([t, i]) => { s += T(px[i] + pw / 2, 214, t, { size: 9, anchor: 'middle', fill: K.ink, weight: 600 }); });
  return fig(360, 224, s, 'Starting a project: New Project, pick a board (the Uno is the easiest), and the editor opens with just the board on the canvas.');
};

export const editorTour = () => {
  const X = 8, Y = 20, W = 244, H = 366;
  const cx = X + 4, cy = Y + 46, cw = W - 8, ch = H - 46 - 52;
  let s = SHARED + UIDEFS + phone(X, Y, W, H, { rx: 24 }) + topBar(X, Y, W, 'LED + Resistor', 'Arduino Uno R3', false);
  s += R(cx, cy, cw, ch, { fill: CANVAS, stroke: 'none', rx: 4 }) + `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" fill="url(#ardGrid)"/>`;
  s += miniLed(cx + 6, cy + 30, cw - 56, 130, false);
  s += sideRail(X + W - 40, cy + 8, ['undo', 'redo', '-', 'select', 'zoomIn', 'zoomOut', 'fit', 'fullscreen']);
  s += `<rect x="${X + W - 66}" y="${cy + ch - 70}" width="52" height="52" rx="18" fill="url(#ardBrand)"/>` + ico('plus', X + W - 54, cy + ch - 58, 28, '#fff');
  s += R(X + 1, Y + H - 50, W - 2, 49, { fill: BAR, stroke: 'none', rx: 22 }) + [['circuit', 'Circuit', 1], ['code', 'Code', 0], ['terminal', 'Serial', 0], ['globe', 'IoT', 0]].map(([n, l, on], i) => navTab(X + 6 + i * 58, Y + H - 44, 58, n, l, on)).join('');
  // badges
  s += BADGE(X + 17, Y - 6, 1) + BADGE(X + 70, Y - 6, 2) + BADGE(X + W - 60, Y - 6, 3) + BADGE(X + W - 14, Y - 6, 4) + BADGE(X + W - 44, cy + 8, 5) + BADGE(X + W - 66, cy + ch - 68, 6) + BADGE(X + 12, Y + H - 50, 7) + BADGE(cx + 14, cy + 22, 8);
  const lg = [['Back (saves)'], ['Name · board'], ['Run / Stop'], ['⋮ Menu'], ['Side tools'], ['＋ Add part'], ['Tabs'], ['Canvas']];
  lg.forEach(([t], i) => { s += BADGE(274, 40 + i * 38, i + 1) + T(288, 44 + i * 38, t, { size: 10, fill: K.ink, weight: 600 }); });
  return fig(360, 396, s, 'The editor held upright. 1 Back · 2 project name and board (tap the board for its data sheet) · 3 Run / Stop · 4 menu · 5 side tools · 6 add a part · 7 the tabs Circuit, Code, Serial and IoT · 8 the canvas.');
};

export const fourTabs = () => {
  const pw = 168, ph = 188;
  const pos = [[8, 6], [184, 6], [8, 206], [184, 206]];
  const frame = (i, title, sub) => phone(pos[i][0], pos[i][1], pw, ph) + T(pos[i][0] + 10, pos[i][1] + 15, title, { size: 10, weight: 800 }) + T(pos[i][0] + 10, pos[i][1] + 27, sub, { size: 7.5, fill: K.line });
  const nav = (i, active) => { const [x, y] = pos[i]; return R(x + 1, y + ph - 28, pw - 2, 27, { fill: BAR, stroke: 'none', rx: 14 }) + [['circuit', 'Circuit'], ['code', 'Code'], ['terminal', 'Serial'], ['globe', 'IoT']].map(([n, l], k) => ico(n, x + 12 + k * 39, y + ph - 25, 12, k === active ? K.acc : '#5d6c8c') + T(x + 18 + k * 39, y + ph - 6, l, { size: 6.3, anchor: 'middle', fill: k === active ? '#e8eef9' : '#5d6c8c' })).join(''); };
  let s = SHARED + UIDEFS;
  // circuit
  let [x, y] = pos[0];
  s += frame(0, 'Circuit', 'parts, wires, buttons') + R(x + 5, y + 34, pw - 10, ph - 66, { fill: CANVAS, stroke: 'none', rx: 6 }) + `<rect x="${x + 5}" y="${y + 34}" width="${pw - 10}" height="${ph - 66}" fill="url(#ardGrid)"/>` + sceneIn(projectScene('button-led', { hide: ['uno'] }), x + 8, y + 40, pw - 44, ph - 80) +
    sideRail(x + pw - 31, y + 38, ['select', 'zoomIn', 'zoomOut', 'fit']) + nav(0, 0);
  // code
  [x, y] = pos[1];
  const code = [['c', '// Blink'], ['k', 'void setup() {'], ['n', '  pinMode(13, OUTPUT);'], ['k', '}'], ['k', 'void loop() {'], ['n', '  digitalWrite(13, HIGH);'], ['n', '  delay(1000);'], ['k', '}']];
  s += frame(1, 'Code', 'sketch.ino · symbols bar') + R(x + 5, y + 34, pw - 10, ph - 82, { fill: '#08101f', stroke: 'none', rx: 6 });
  code.forEach(([c, t], i) => { s += `<text x="${x + 24}" y="${y + 48 + i * 11.5}" font-size="7.6" font-family="JetBrains Mono, ui-monospace, monospace" fill="${c === 'c' ? '#66789c' : c === 'k' ? '#c792ea' : '#e6edf7'}">${esc(t)}</text><text x="${x + 11}" y="${y + 48 + i * 11.5}" font-size="6.5" fill="#4b5b7a" font-family="JetBrains Mono, monospace">${i + 1}</text>`; });
  s += R(x + 5, y + ph - 46, pw - 10, 17, { fill: '#0d1528', stroke: LINE2, rx: 5 }) + ['{', '}', '(', ')', ';', '=', '<', '>', '#', '"'].map((c, i) => T(x + 13 + i * 15, y + ph - 34, c, { size: 8.5, fill: '#cbd5e1', anchor: 'middle', weight: 700, mono: true })).join('') + nav(1, 1);
  // serial
  [x, y] = pos[2];
  s += frame(2, 'Serial', 'Monitor · Plotter') + R(x + 5, y + 31, pw - 10, 14, { fill: '#0d1528', stroke: 'none', rx: 7 }) + pillBtn(x + 8, y + 33, 52, 10, 'rgba(34,211,238,.18)', 'Monitor', { size: 7, ink: K.acc }) + T(x + 82, y + 40.5, 'Plotter', { size: 7, fill: K.dim, weight: 700 }) +
    R(x + 5, y + 50, pw - 10, ph - 94, { fill: '#08101f', stroke: 'none', rx: 6 });
  ['Pressed', 'Released', 'Pressed', 'Released', 'Pressed'].forEach((t, i) => { s += `<text x="${x + 12}" y="${y + 64 + i * 12}" font-size="8" font-family="JetBrains Mono, ui-monospace, monospace" fill="#a3e635">${t}</text>`; });
  s += R(x + 5, y + ph - 40, pw - 66, 12, { fill: '#0d1528', stroke: LINE2, rx: 5 }) + T(x + 11, y + ph - 31, 'Send to Arduino…', { size: 6.5, fill: K.dim }) + R(x + pw - 58, y + ph - 40, 30, 12, { fill: '#0d1528', stroke: LINE2, rx: 5 }) + T(x + pw - 43, y + ph - 31, 'Newline', { size: 6, anchor: 'middle', fill: K.line }) +
    R(x + pw - 24, y + ph - 40, 18, 12, { fill: 'url(#ardBrand)', stroke: 'none', rx: 5 }) + nav(2, 2);
  // iot
  [x, y] = pos[3];
  s += frame(3, 'IoT', 'only with a Wi-Fi board') + R(x + 5, y + 31, pw - 10, 13, { fill: 'rgba(34,197,94,.1)', stroke: 'none', rx: 6 }) + ico('wifi', x + 9, y + 32, 10, K.ok) + T(x + 22, y + 41, 'RaptiNet', { size: 7, fill: K.ok, weight: 700 }) + T(x + 62, y + 41, 'ESP32 · 192.168.1.50', { size: 6.3, fill: K.line }) +
    R(x + 5, y + 48, pw - 10, ph - 82, { fill: '#f8fafc', stroke: 'none', rx: 6 }) + R(x + 5, y + 48, pw - 10, 14, { fill: '#e2e8f0', stroke: 'none', rx: 6 }) + T(x + 12, y + 58, 'http://192.168.1.50/', { size: 6.8, fill: '#334155' }) +
    T(x + pw / 2, y + 84, 'LED switch', { size: 10, anchor: 'middle', fill: '#0f172a', weight: 800 }) + R(x + pw / 2 - 28, y + 94, 56, 22, { fill: '#22c55e', stroke: 'none', rx: 11 }) + T(x + pw / 2, y + 108, 'ON', { size: 9, anchor: 'middle', fill: '#fff', weight: 800 }) + nav(3, 3);
  return fig(360, 402, s, 'The four tabs. Circuit: build and play. Code: write the sketch. Serial: read what the sketch prints. IoT: the phone browser on the simulated Wi-Fi (only when the circuit has an ESP32, NodeMCU or Uno R4 WiFi).');
};

export const runStates = () => {
  let s = UIDEFS;
  const row = (y, running, extra) => R(8, y, 344, 40, { fill: BAR, stroke: K.line, rx: 12 }) + ico('back', 14, y + 11, 18) + T(38, y + 17, 'LED + Resistor', { size: 11, weight: 700 }) + T(38, y + 30, 'Arduino Uno R3', { size: 8.5, fill: '#8fe9f7', weight: 600 }) + runButton(238, y + 7, running, 70, 26) + ico('dots', 326, y + 11, 18) + (extra || '');
  s += T(12, 12, '① Stopped — you can edit', { size: 9.5, fill: K.dim, weight: 700 }) + row(18, false);
  s += T(12, 78, '② Running — the status bar appears', { size: 9.5, fill: K.dim, weight: 700 }) + row(84, true) +
    R(8, 128, 344, 28, { fill: 'rgba(34,197,94,.1)', stroke: 'rgba(34,197,94,.3)', rx: 8 }) + `<circle cx="22" cy="142" r="4" fill="${K.ok}"/>` + `<text x="34" y="146" font-size="11" font-weight="700" fill="#e8eef9" font-family="JetBrains Mono, monospace">00:12.4</text>` + T(92, 146, '100% speed', { size: 10, fill: K.line }) +
    R(296, 133, 48, 18, { fill: 'rgba(245,158,11,.18)', stroke: 'none', rx: 9 }) + ico('warning', 302, 135, 14, '#fcd34d') + T(326, 146, '2', { size: 10, fill: '#fcd34d', weight: 800 });
  s += T(12, 178, '③ You changed something while it runs', { size: 9.5, fill: K.dim, weight: 700 }) + R(66, 186, 228, 26, { fill: 'rgba(245,158,11,.92)', stroke: 'none', rx: 13 }) + ico('restart', 76, 192, 14, '#1c1203') + T(96, 203, 'Circuit changed — restart to apply', { size: 10.5, fill: '#1c1203', weight: 700 });
  return fig(360, 224, s, 'Run compiles the sketch and starts it. The status bar shows the simulated time and speed; ⚠ counts the messages. A change made while it runs shows a banner — tap it to restart.');
};
/** A little landscape phone with the screens that are open. panes: ['circuit', 'code', 'serial'…] (one or two). */
function miniLandscape(x, y, w, h, panes, tabsOn, label) {
  let s = R(x, y, w, h, { fill: PHONE, stroke: K.line, rx: 9, sw: 1.2 });
  const bodyH = h - 22, n = panes.length, pw = (w - 8 - (n - 1) * 3) / n;
  panes.forEach((p, i) => {
    const px = x + 4 + i * (pw + 3), py = y + 4;
    s += R(px, py, pw, bodyH, { fill: p === 'code' ? '#08101f' : p === 'serial' ? '#08101f' : CANVAS, stroke: LINE2, rx: 4 });
    if (p === 'circuit') s += miniLed(px + 3, py + 3, pw - 6, bodyH - 6);
    if (p === 'code') for (let k = 0; k < 5; k++) s += `<rect x="${px + 6}" y="${py + 8 + k * 9}" width="${[26, 38, 30, 20, 34][k] * (pw / 60)}" height="3.4" rx="1.7" fill="${k % 2 ? '#7dd3fc' : '#c792ea'}" opacity=".85"/>`;
    if (p === 'serial') for (let k = 0; k < 4; k++) s += `<rect x="${px + 6}" y="${py + 8 + k * 9}" width="${[30, 22, 30, 22][k] * (pw / 60)}" height="3.4" rx="1.7" fill="#a3e635" opacity=".8"/>`;
  });
  const tabs = ['circuit', 'code', 'serial', 'iot'], tn = ['Circuit', 'Code', 'Serial', 'IoT'];
  tabs.forEach((t, i) => {
    const on = tabsOn.includes(t);
    s += R(x + 6 + i * ((w - 12) / 4), y + h - 16, (w - 12) / 4 - 3, 12, { fill: on ? 'rgba(34,211,238,.14)' : 'none', stroke: on ? K.acc : K.dim, rx: 4, sw: on ? 1 : .6 }) + T(x + 6 + i * ((w - 12) / 4) + ((w - 12) / 4 - 3) / 2, y + h - 7, tn[i], { size: 6, anchor: 'middle', fill: on ? K.acc : K.dim, weight: 700 });
  });
  return s + T(x + w / 2, y + h + 15, label, { size: 9, anchor: 'middle', fill: K.ink, weight: 600 });
}
export const twoPaneArd = () => fig(360, 128,
  UIDEFS + SHARED + miniLandscape(8, 6, 108, 78, ['circuit'], ['circuit'], '① one screen') +
  miniLandscape(126, 6, 108, 78, ['circuit', 'code'], ['circuit', 'code'], '② tap Code: two') +
  miniLandscape(244, 6, 108, 78, ['circuit', 'serial'], ['circuit', 'serial'], '③ tap Serial: swapped') +
  AR(117, 45, 125, 45, { m: 'mfb', stroke: K.acc }) + AR(235, 45, 243, 45, { m: 'mfb', stroke: K.acc }),
  'Landscape: tap a tab to open that screen beside the one you have. Tap an open tab to close it. A third tab replaces the second screen; the first stays.');

export const fullScreenFig = () => {
  const w = 108, h = 94, xs = [8, 126, 244], y = 6;
  const base = (x) => R(x, y, w, h, { fill: PHONE, stroke: K.line, rx: 9, sw: 1.2 }) + R(x + 4, y + 4, w - 8, h - 8, { fill: CANVAS, stroke: 'none', rx: 5 }) + `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="url(#ardGrid)"/>` + miniLed(x + 22, y + 10, w - 44, h - 26);
  const handle = (x, y0, open) => `<circle cx="${x}" cy="${y0}" r="8.5" fill="rgba(10,16,32,.9)" stroke="${K.acc}" stroke-width="1.2"/>` + ico(open ? 'close' : 'menu', x - 5.5, y0 - 5.5, 11, K.acc);
  const bar = (x, y0, dir) => {
    const names = ['fullscreenExit', 'play', 'circuit', 'code', 'terminal', 'globe'];
    let s = '';
    if (dir === 'up') { s += R(x - 8, y0 - 62, 16, 54, { fill: 'rgba(10,16,32,.9)', stroke: LINE2, rx: 6 }); names.forEach((n, i) => { s += ico(n, x - 4.5, y0 - 59 + i * 8.6, 9, i === 1 ? K.ok : i === 2 ? K.acc : '#9fb0cf'); }); }
    else { s += R(x - 62, y0 - 8, 54, 16, { fill: 'rgba(10,16,32,.9)', stroke: LINE2, rx: 6 }); names.forEach((n, i) => { s += ico(n, x - 59 + i * 8.6, y0 - 4.5, 9, i === 1 ? K.ok : i === 2 ? K.acc : '#9fb0cf'); }); }
    return s;
  };
  let s = UIDEFS + SHARED;
  s += base(xs[0]) + handle(xs[0] + 14, y + h - 14, false);
  s += base(xs[1]) + handle(xs[1] + 14, y + h - 14, true) + bar(xs[1] + 14, y + h - 24, 'up');
  s += base(xs[2]) + handle(xs[2] + w - 14, y + 30, true) + bar(xs[2] + w - 24, y + 30, 'left') + `<path d="M${xs[2] + 20} ${y + h - 14} C${xs[2] + 50} ${y + h - 6} ${xs[2] + 70} ${y + 50} ${xs[2] + w - 25} ${y + 36}" fill="none" stroke="${K.acc}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  [['① menus hidden', 0], ['② tap ☰ (it turns ✕)', 1], ['③ drag ☰ anywhere', 2]].forEach(([t, i]) => { s += T(xs[i] + w / 2, y + h + 15, t, { size: 9, anchor: 'middle', fill: K.ink, weight: 600 }); });
  s += AR(117, 54, 125, 54, { m: 'mfb', stroke: K.acc }) + AR(235, 54, 243, 54, { m: 'mfb', stroke: K.acc });
  return fig(360, 146, s, 'Full screen hides every bar. The round ☰ button brings them back; drag it where it suits you, the app remembers the place. The bar has: exit full screen, Run / Stop, and the Circuit, Code, Serial and IoT screens.');
};

export const menuShot = () => {
  const items = [['save', 'Save'], ['edit', 'Rename'], ['download', 'Export project (.rapti)'], ['code', 'Export sketch (.ino)'], ['share', 'Share code'], ['-'], ['chip', 'Board info'], ['wire', 'Straight wires'], ['bolt', 'Show current flow'], ['grid', 'Show grid'], ['-'], ['trash', 'Clear circuit (keep board)', 1]];
  let s = '', y = 12;
  s += R(10, 4, 210, 12 + items.reduce((a, it) => a + (it[0] === '-' ? 9 : 23), 0) + 6, { fill: '#121a30', stroke: LINE2, rx: 14 });
  const ys = [];
  for (const it of items) {
    if (it[0] === '-') { s += L(20, y + 3, 210, y + 3, { stroke: 'rgba(148,163,184,.18)', sw: 1 }); y += 9; continue; }
    ys.push(y);
    s += ico(it[0], 20, y + 3, 15, it[2] ? K.err : '#9fb0cf') + T(44, y + 15, it[1], { size: 10.5, weight: 600, fill: it[2] ? K.err : K.ink });
    y += 23;
  }
  const note = (yy, ty, a, b) => L(222, ty, 244, ty, { stroke: K.acc, sw: 1 }) + DOT(222, ty, K.acc) + T(250, ty - 2, a, { size: 9.5, weight: 700, fill: K.acc }) + T(250, ty + 10, b, { size: 9, fill: K.line });
  s += note(0, ys[2] + 10, 'a .rapti file', 'whole project') + note(0, ys[3] + 10, 'a .ino file', 'just the sketch') + note(0, ys[7] + 10, 'moving dots', 'show the current') + note(0, ys[9] + 10, 'removes parts', 'and wires');
  return fig(360, y + 14, s, 'The ⋮ menu of the editor. Export project keeps parts, wires and code; Export sketch gives the code only.');
};

export const examplesPage = () => {
  const cats = [['all', 'All', EXAMPLES.length], ['basics', 'Basics'], ['sensors', 'Sensors'], ['displays', 'Displays'], ['motors', 'Motors'], ['iot', 'IoT & Wi-Fi'], ['electrical', 'Electrical'], ['multi', 'Master–Slave']].map(([id, n, c]) => [n, c ?? EXAMPLES.filter((e) => e.category === id).length]);
  let s = SHARED + UIDEFS + R(8, 6, 344, 30, { fill: '#0f172b', stroke: LINE2, rx: 15 }) + ico('search', 18, 13, 16, K.dim) + T(42, 25, 'Search all examples: weather, MQTT, LCD …', { size: 10, fill: K.dim });
  let x = 8, y = 46;
  for (const [n, c] of cats) {
    const w = n.length * 5.7 + 38;
    if (x + w > 352) { x = 8; y += 28; }
    s += R(x, y, w, 22, { fill: n === 'All' ? 'rgba(34,211,238,.16)' : '#0f172b', stroke: n === 'All' ? K.acc : LINE2, rx: 11 }) + T(x + 11, y + 15, n, { size: 9.5, weight: 700, fill: n === 'All' ? K.acc : K.ink }) + T(x + w - 10, y + 15, String(c), { size: 8.5, anchor: 'end', fill: K.dim, weight: 700 });
    x += w + 6;
  }
  y += 34;
  const card = (cx, id, tag) => {
    const ex = EXAMPLES.find((e) => e.id === id);
    return R(cx, y, 168, 124, { fill: '#0f172b', stroke: LINE2, rx: 14 }) + R(cx + 6, y + 6, 156, 52, { fill: CANVAS, stroke: 'none', rx: 8 }) + sceneIn(projectScene(id), cx + 10, y + 9, 148, 46) +
      pillBtn(cx + 8, y + 64, 52, 13, 'rgba(34,197,94,.16)', ex.level || 'beginner', { size: 7.5, ink: '#86efac' }) + pillBtn(cx + 64, y + 64, 40, 13, 'rgba(148,163,184,.14)', tag, { size: 7.5, ink: K.line }) +
      T(cx + 8, y + 92, ex.name, { size: 10, weight: 800 }) + T(cx + 8, y + 105, ex.description.slice(0, 31) + '…', { size: 7.8, fill: K.line }) + T(cx + 8, y + 116, 'Tap: a copy opens in My projects', { size: 7, fill: K.dim });
  };
  s += card(8, 'blink', 'Uno R3') + card(184, 'traffic-light', 'Uno R3');
  return fig(360, y + 134, s, 'Examples: filter by category or search. Opening an example copies it into My projects, so you can change it freely.');
};
// ---------------------------------------------------------------------------------------------- A2
const pxLayer = (s, inner) => `<g transform="scale(${(1 / s).toFixed(5)})">${inner}</g>`;
const sheetFrame = (x, y, w, h, title, ic) => R(x, y, w, h, { fill: '#0f172b', stroke: LINE2, rx: 18 }) + `<rect x="${x + w / 2 - 16}" y="${y + 6}" width="32" height="3.4" rx="1.7" fill="rgba(148,163,184,.4)"/>` + ico(ic, x + 14, y + 18, 16, K.acc) + T(x + 36, y + 31, title, { size: 12.5, weight: 800 });
const libCard = (x, y, w, h, type, name, o = {}) => R(x, y, w, h, { fill: o.on ? 'rgba(34,211,238,.1)' : '#131d36', stroke: o.on ? K.acc : LINE2, rx: 11, sw: o.on ? 1.4 : 1 }) + partIn(type, x + 8, y + 6, w - 16, h - 28, o.props || {}) + T(x + w / 2, y + h - 7, name, { size: o.size || 8.5, anchor: 'middle', fill: K.ink, weight: 600 });

export const libSheet = () => {
  let s = SHARED + UIDEFS + sheetFrame(8, 4, 344, 330, 'Add component', 'plus');
  s += R(20, 46, 320, 26, { fill: '#0a1020', stroke: LINE2, rx: 13 }) + ico('search', 30, 51, 16, K.dim) + T(54, 63, 'Search components (LED, servo, sensor…)', { size: 9.5, fill: K.dim });
  const chips = [['grid', 'All', 1], ['chip', 'Microcontrollers'], ['resistor', 'Basic & Passive'], ['bulb', 'LEDs']];
  let x = 20;
  for (const [ic, n, on] of chips) { const w = n.length * 5.4 + 34; s += R(x, 80, w, 22, { fill: on ? 'rgba(34,211,238,.16)' : '#131d36', stroke: on ? K.acc : LINE2, rx: 11 }) + ico(ic, x + 7, 84, 13, on ? K.acc : '#9fb0cf') + T(x + 24, 95, n, { size: 9, weight: 700, fill: on ? K.acc : K.ink }); x += w + 6; }
  s += T(x + 4, 95, '…', { size: 12, fill: K.dim, weight: 700 });
  const head = (y, ic, t) => ico(ic, 22, y, 14, K.line) + T(42, y + 11, t, { size: 10, weight: 800, fill: K.line });
  s += head(110, 'resistor', 'Basic & Passive');
  [['resistor', 'Resistor'], ['capacitor', 'Capacitor'], ['diode', 'Diode 1N4007']].forEach(([t, n], i) => { s += libCard(20 + i * 108, 130, 100, 70, t, n); });
  s += head(210, 'bulb', 'LEDs & Output');
  [['led', 'LED', 1], ['rgb-led', 'RGB LED'], ['buzzer', 'Buzzer']].forEach(([t, n, on], i) => { s += libCard(20 + i * 108, 230, 100, 70, t, n, { on }); });
  s += `<rect x="12" y="302" width="336" height="30" fill="#0f172b" opacity=".0"/>` + T(180, 322, '…and 8 more groups: displays, sensors, motors, power …', { size: 9, anchor: 'middle', fill: K.dim });
  return fig(360, 342, s, 'The parts library (the ＋ button). Search by name, or pick a group. Tap a part and it lands in the middle of the canvas.');
};

export const addSteps = () => {
  const pw = 108, ph = 184, xs = [8, 126, 244], y = 6;
  const nav = (x) => R(x + 1, y + ph - 27, pw - 2, 26, { fill: BAR, stroke: 'none', rx: 14 }) + [['circuit', 1], ['code', 0], ['terminal', 0]].map(([n, on], i) => ico(n, x + 14 + i * 30, y + ph - 22, 13, on ? K.acc : '#5d6c8c')).join('');
  let s = SHARED + UIDEFS;
  // 1
  s += phone(xs[0], y, pw, ph) + R(xs[0] + 4, y + 8, pw - 8, ph - 40, { fill: CANVAS, stroke: 'none', rx: 8 }) + `<rect x="${xs[0] + 4}" y="${y + 8}" width="${pw - 8}" height="${ph - 40}" fill="url(#ardGrid)"/>` + partIn('uno-r3', xs[0] + 10, y + 30, pw - 20, 80) +
    `<circle cx="${xs[0] + pw - 24}" cy="${y + ph - 54}" r="15" fill="url(#ardBrand)"/>` + ico('plus', xs[0] + pw - 33, y + ph - 63, 18, '#fff') + `<circle cx="${xs[0] + pw - 24}" cy="${y + ph - 54}" r="20" fill="none" stroke="${K.acc}" stroke-width="1.4" stroke-dasharray="3 3"/>` + nav(xs[0]);
  // 2
  s += phone(xs[1], y, pw, ph) + R(xs[1] + 1, y + 46, pw - 2, ph - 47, { fill: '#0f172b', stroke: LINE2, rx: 14 }) + ico('plus', xs[1] + 9, y + 54, 12, K.acc) + T(xs[1] + 25, y + 64, 'Add component', { size: 8, weight: 800 }) +
    R(xs[1] + 8, y + 72, pw - 16, 17, { fill: '#0a1020', stroke: LINE2, rx: 8 }) + T(xs[1] + 14, y + 84, 'led', { size: 8, fill: K.ink }) + `<rect x="${xs[1] + 24}" y="${y + 76}" width="1" height="9" fill="${K.acc}"/>` +
    libCard(xs[1] + 8, y + 96, 44, 62, 'led', 'LED', { on: 1, size: 7.5 }) + libCard(xs[1] + 56, y + 96, 44, 62, 'rgb-led', 'RGB LED', { size: 7 });
  // 3
  s += phone(xs[2], y, pw, ph) + R(xs[2] + 4, y + 8, pw - 8, ph - 40, { fill: CANVAS, stroke: 'none', rx: 8 }) + `<rect x="${xs[2] + 4}" y="${y + 8}" width="${pw - 8}" height="${ph - 40}" fill="url(#ardGrid)"/>` + partIn('uno-r3', xs[2] + 10, y + 16, pw - 20, 52) +
    partIn('led', xs[2] + 38, y + 76, 32, 46, { color: 'red' }) + `<rect x="${xs[2] + 32}" y="${y + 72}" width="44" height="54" rx="6" fill="rgba(34,211,238,.06)" stroke="${K.acc}" stroke-width="1.3" stroke-dasharray="4 3"/>` +
    R(xs[2] + 6, y + ph - 70, pw - 12, 34, { fill: 'rgba(10,16,32,.92)', stroke: LINE2, rx: 10 }) + ['rotate', 'mirror', 'flipv', 'sliders', 'copy', 'trash'].map((n, i) => ico(n, xs[2] + 11 + i * 15, y + ph - 61, 11, n === 'trash' ? K.err : '#c7d2e8')).join('') + T(xs[2] + 10, y + ph - 44, 'LED · Red', { size: 7.5, fill: K.line, weight: 600 }) + nav(xs[2]);
  s += AR(117, 96, 125, 96, { m: 'mfb', stroke: K.acc }) + AR(235, 96, 243, 96, { m: 'mfb', stroke: K.acc });
  [['① tap ＋', 0], ['② pick the LED', 1], ['③ it appears, selected', 2]].forEach(([t, i]) => { s += T(xs[i] + pw / 2, y + ph + 16, t, { size: 9, anchor: 'middle', fill: K.ink, weight: 600 }); });
  return fig(360, 214, s, 'Adding a part in three taps: ＋, choose the part, and it appears in the middle of the screen with its action bar.');
};

const barBtn = (x, y, ic, label, color = '#c7d2e8') => ico(ic, x + 10, y + 5, 18, color) + T(x + 19, y + 36, label, { size: 8, anchor: 'middle', fill: color === '#c7d2e8' ? K.line : color, weight: 600 });
export const selBar = () => {
  let s = UIDEFS;
  const panel = (y, h) => R(8, y, 344, h, { fill: 'rgba(10,16,32,.92)', stroke: LINE2, rx: 16 });
  s += T(12, 14, 'Tap a part → its bar', { size: 9.5, fill: K.dim, weight: 700 }) + panel(20, 52) + T(20, 42, 'LED', { size: 11, weight: 800 }) + T(20, 55, 'Red', { size: 8.5, fill: K.dim });
  [['rotate', 'Rotate'], ['mirror', 'Mirror'], ['flipv', 'Flip'], ['sliders', 'Edit'], ['copy', 'Copy'], ['trash', 'Delete']].forEach(([ic, l], i) => { s += barBtn(76 + i * 44, 22, ic, l, ic === 'trash' ? K.err : '#c7d2e8'); });
  s += ico('close', 334, 38, 14, K.dim);
  s += T(12, 94, 'Tap a wire → its bar', { size: 9.5, fill: K.dim, weight: 700 }) + panel(100, 52) + T(20, 122, 'Wire', { size: 11, weight: 800 }) + T(20, 135, 'D13 → a10', { size: 8.5, fill: K.dim });
  s += `<circle cx="100" cy="124" r="8" fill="${WC.green}" stroke="rgba(255,255,255,.4)"/>` + T(100, 148, 'Colour', { size: 8, anchor: 'middle', fill: K.line, weight: 600 }) + barBtn(142, 102, 'eraser', 'Straight') + barBtn(190, 102, 'trash', 'Delete', K.err) + ico('close', 334, 118, 14, K.dim);
  s += T(12, 174, 'Press and hold a part → more', { size: 9.5, fill: K.dim, weight: 700 });
  const items = [['rotate', 'Rotate'], ['mirror', 'Mirror (left ↔ right)'], ['flipv', 'Flip (up ↕ down)'], ['sliders', 'Properties'], ['copy', 'Duplicate'], ['wire', 'Delete connected wires'], ['-'], ['trash', 'Delete', 1]];
  let y = 182;
  s += R(8, y, 212, 190, { fill: '#121a30', stroke: LINE2, rx: 14 });
  y += 6;
  for (const it of items) { if (it[0] === '-') { s += L(18, y + 3, 210, y + 3, { stroke: 'rgba(148,163,184,.18)' }); y += 8; continue; } s += ico(it[0], 18, y + 4, 14, it[2] ? K.err : '#9fb0cf') + T(40, y + 16, it[1], { size: 9.8, weight: 600, fill: it[2] ? K.err : K.ink }); y += 22; }
  s += T(232, 214, 'Edit = the part\'s', { size: 9, fill: K.line }) + T(232, 226, 'values: resistance,', { size: 9, fill: K.line }) + T(232, 238, 'LED colour, sensor', { size: 9, fill: K.line }) + T(232, 250, 'options. Parts without', { size: 9, fill: K.line }) + T(232, 262, 'values show Info.', { size: 9, fill: K.line });
  return fig(360, 380, s, 'The bars of the editor. A part has Rotate, Mirror, Flip, Edit, Copy, Delete; a wire has Colour, Straight, Delete. Press and hold for the full menu.');
};

export const rotMirror = () => {
  const cells = [['Original', 0, false, false], ['Rotate', 90, false, false], ['Mirror', 0, true, false], ['Flip', 0, false, true]];
  let s = SHARED + UIDEFS;
  cells.forEach(([t, rot, fx, fy], i) => {
    const x = 6 + i * 88, y = 6, w = 82, h = 118;
    s += R(x, y, w, h, { fill: CANVAS, stroke: LINE2, rx: 10 }) + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#ardGrid)" opacity=".7"/>`;
    const p = mkPart('led', 0, 0, { color: 'red' }, rot, { flipX: fx, flipY: fy });
    const b = boxOf(p), k = 2.1, ox = x + w / 2 - ((b[0] + b[2]) / 2) * k, oy = y + h / 2 + 4 - ((b[1] + b[3]) / 2) * k;
    s += `<g transform="translate(${f1(ox)} ${f1(oy)}) scale(${k})">${partSvg(p)}</g>`;
    for (const [pn, c] of [['A', K.ok], ['C', K.dim]]) { const [px, py] = pinXY(p, pn); s += `<circle cx="${f1(ox + px * k)}" cy="${f1(oy + py * k)}" r="6" fill="#0a1226" stroke="${c}" stroke-width="1.2"/>` + T(ox + px * k, oy + py * k + 3.2, pn, { size: 8, anchor: 'middle', fill: c, weight: 800 }); }
    s += T(x + w / 2, y + h + 15, t, { size: 10, anchor: 'middle', weight: 700 });
  });
  return fig(360, 146, s, 'Rotate turns a part by 90°. Mirror swaps left and right, Flip swaps top and bottom — the legs change sides (A = anode +, C = cathode −), the lettering stays readable.');
};

export const bbInside = () => bench({
  bb: 'half', cols: [1, 24], cropTo: 120, w: 360,
  bands: [6], bandsLow: [6], bandRails: ['tp', 'tn'],
  badges: [{ at: 'B/a6', n: 1, dy: -2, dx: 16 }, { at: 'B/f6', n: 2, dy: 0, dx: 16 }, { at: [40, 118], n: 3 }, { at: 'B/tp.10', n: 4, dy: -14 }, { at: 'B/tn.10', n: 5, dy: 14 }],
  over: ({ s, holeW, rowA }) => {
    const [x0] = holeW('a1'), [x1] = holeW('a24');
    return `<rect x="${f1(x0 - 12)}" y="${f1(rowA + 49)}" width="${f1(x1 - x0 + 24)}" height="12" rx="2" fill="none" stroke="${K.warn}" stroke-width="1" stroke-dasharray="4 3"/>`;
  },
  cap: '① the five holes a–e of one column are one connection · ② the five holes f–j of a column are another · ③ nothing connects across the centre channel · ④ the + rail and ⑤ the − rail run the whole length.',
});

export const bbRules = () => {
  const common = { bb: 'half', cols: [8, 20], cropTo: 52, w: 176, parts: [{ id: 'r', type: 'resistor', props: { value: 220 }, pin: '1', hole: 'e9' }] };
  const L1 = benchSvg({ ...common, parts: [...common.parts, { id: 'd', type: 'led', props: { color: 'red' }, pin: 'A', hole: 'c13' }], bands: [13] });
  const L2 = benchSvg({ ...common, parts: [...common.parts, { id: 'd', type: 'led', props: { color: 'red' }, pin: 'A', hole: 'c14' }], bands: [13, 14] });
  const h = Math.max(L1.h, L2.h);
  let s = `<g transform="translate(0 22)">${L1.content}</g><g transform="translate(184 22)">${L2.content}</g>` +
    T(88, 14, '✓ same column', { size: 11, anchor: 'middle', fill: K.ok, weight: 800 }) + T(272, 14, '✗ next column', { size: 11, anchor: 'middle', fill: K.err, weight: 800 });
  s += T(88, h + 38, 'resistor end and LED leg touch', { size: 9.5, anchor: 'middle', fill: K.line }) + T(272, h + 38, 'one column apart: no contact', { size: 9.5, anchor: 'middle', fill: K.line });
  return fig(368, h + 48, s, 'Holes in the same column (a–e) are connected, so a resistor leg and an LED leg in column 13 touch. One column further and they do not.');
};

export const bbSizes = () => {
  const k = 0.52;
  const draw = (kind, x, y) => `<g transform="translate(${x} ${y}) scale(${k})">${partSvg(mkPart(BBTYPES[kind], 0, 0))}</g>`;
  const fullBox = [-15, -55, 635, 165], halfBox = [-15, -55, 305, 165], miniBox = [-15, -14, 175, 124];
  let s = SHARED + draw('full', 8 + 15 * k, 4 + 55 * k) + draw('half', 8 + 15 * k, 140 + 55 * k) + draw('mini', 190 + 15 * k, 140 + 14 * k);
  s += T(180, 132, 'Full  ·  830 holes  ·  63 columns  ·  4 rails', { size: 10, anchor: 'middle', weight: 700 }) + T(90, 272, 'Half  ·  400 holes', { size: 10, anchor: 'middle', weight: 700 }) + T(90, 285, '30 columns · 4 rails', { size: 9, anchor: 'middle', fill: K.line }) +
    T(266, 272, 'Mini  ·  170 holes', { size: 10, anchor: 'middle', weight: 700 }) + T(266, 285, '17 columns · no rails', { size: 9, anchor: 'middle', fill: K.line });
  void fullBox; void halfBox; void miniBox;
  return fig(360, 296, s, 'The three breadboards of the library, drawn to the same scale. The half board is the one the examples use.');
};

const WIRE_DOTS = ['#22c55e', '#3b82f6', '#f97316', '#eab308', '#ef4444', '#111827', '#a855f7', '#f1f5f9'];
/** The bar that appears while a wire is being drawn (pixels). */
const wireBarPx = (y, active = 0) => R(8, y, 344, 54, { fill: 'rgba(10,16,32,.92)', stroke: LINE2, rx: 14 }) + ico('wire', 18, y + 7, 15, K.acc) + T(40, y + 19, 'Tap a pin to connect · tap empty space to bend', { size: 9.3, fill: K.ink }) +
  WIRE_DOTS.map((c, i) => `<circle cx="${28 + i * 22}" cy="${y + 38}" r="7" fill="${c}" stroke="${i === active ? '#fff' : 'rgba(255,255,255,.25)'}" stroke-width="${i === active ? 2 : 1}"/>`).join('') +
  pillBtn(214, y + 28, 60, 20, 'rgba(148,163,184,.14)', 'Point', { size: 9, ink: K.ink }) + pillBtn(282, y + 28, 62, 20, 'rgba(148,163,184,.14)', 'Cancel', { size: 9, ink: K.ink });
const wireSelPx = (y) => R(8, y, 344, 54, { fill: 'rgba(10,16,32,.92)', stroke: LINE2, rx: 14 }) + T(20, y + 24, 'Wire', { size: 11, weight: 800 }) + T(20, y + 38, 'D13 → a10', { size: 8.5, fill: K.dim }) +
  `<circle cx="116" cy="${y + 22}" r="8" fill="${WC.green}" stroke="rgba(255,255,255,.4)"/>` + T(116, y + 44, 'Colour', { size: 8, anchor: 'middle', fill: K.line, weight: 600 }) + barBtn(160, y + 2, 'eraser', 'Straight').replace(/y="/g, 'y="') + barBtn(214, y + 2, 'trash', 'Delete', K.err) + ico('close', 326, y + 19, 16, K.dim);
export const wireStep = (n) => {
  const base = { cols: [4, 24], board: { pins: ['D13'] }, gapDown: 30, cropTo: 14, extraPx: 66, wires: [{ a: 'R/D13', b: 'B/a10', color: 'green' }] };
  const ring = (x, y, r = 6.5) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="none" stroke="${K.acc}" stroke-width="1.5"/>`;
  if (n === 1) return bench({ ...base, showWires: [], cap: 'Step 1 · tap a pin. Its name pops up and a wire starts from it.',
    over: ({ s, stripX, yStripBot, hBase }) => ring(stripX('D13'), yStripBot) + pill(stripX('D13') + 20 / s, yStripBot + 30 / s, '13 · Arduino Uno R3', { s, color: K.acc }) + pxLayer(s, wireBarPx(hBase + 6)) });
  if (n === 2) return bench({ ...base, showWires: [], cap: 'Step 2 · tap empty space to add a bend, or just carry on to the target hole.',
    over: ({ s, stripX, yStripBot, holeW, hBase }) => { const x = stripX('D13'), [tx] = holeW('a10'); const by = yStripBot + 14; return `<path d="M${f1(x)} ${f1(yStripBot)} V${f1(by)} H${f1(tx - 10)}" fill="none" stroke="${WC.green}" stroke-width="2.7" stroke-dasharray="5 4" stroke-linecap="round"/>` + ring(x, yStripBot, 4.5) + `<circle cx="${f1(x)}" cy="${f1(by)}" r="2.8" fill="${WC.green}"/>` + ring(...holeW('a10'), 6) + pxLayer(s, wireBarPx(hBase + 6)); } });
  return bench({ ...base, wires: [{ a: 'R/D13', b: 'B/a10', color: 'green', sel: true }], rings: ['B/a10'], cap: 'Step 3 · tap the hole. The wire is made and selected: change its colour, straighten it or delete it.',
    over: ({ s, hBase }) => pxLayer(s, wireSelPx(hBase + 6)) });
};

export const wireBend = () => bench({
  cols: [4, 24], board: { pins: ['D13'] }, gapDown: 38, cropTo: 14,
  wires: [{ a: 'R/D13', b: 'B/a10', color: 'green', sel: true, pts: ({ from, to }) => [[from[0], from[1] + 12], [to[0] + 44, from[1] + 12], [to[0] + 44, to[1] - 14], [to[0], to[1] - 14]] }],
  cap: 'A selected wire shows round handles at its bends: drag one to move it, double-tap it to remove it. Drag a small dot on a segment to make a new bend. "Straight" removes all bends.',
});

export const wireColors = () => {
  const names = Object.keys(WC);
  let s = '';
  names.forEach((n, i) => { const x = 22 + (i % 6) * 56, y = 20 + Math.floor(i / 6) * 46; s += `<circle cx="${x + 14}" cy="${y + 10}" r="12" fill="${WC[n]}" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/>` + T(x + 14, y + 36, n, { size: 8.5, anchor: 'middle', fill: K.line, weight: 600 }); });
  const row = (y, c, label, sub) => `<g>${wireSvg([[24, y], [96, y]], c, { w: 5 })}</g>` + T(112, y - 1, label, { size: 10.5, weight: 800 }) + T(112, y + 12, sub, { size: 9, fill: K.line });
  s += T(180, 128, 'Colour code: it makes a circuit readable at a glance', { size: 10, anchor: 'middle', fill: K.dim, weight: 700 });
  s += row(150, WC.red, 'Red = power (+)', 'a wire that touches 5V, 3.3V, Vin, VCC or a + rail starts red') + row(184, WC.black, 'Black = ground (GND)', 'a wire that touches GND, COM or a − rail starts black') + row(218, WC.green, 'Any other colour = a signal', 'green, blue, yellow, orange … one colour per signal');
  return fig(360, 238, s, 'The twelve wire colours of the app (tap a wire → Colour). New wires pick red or black on their own when they touch a power or ground pin.');
};

export const selectBox = () => {
  const panel = (x, mode) => {
    const col = mode === 'window' ? '#3b82f6' : '#22c55e';
    let s = R(x, 6, 172, 152, { fill: CANVAS, stroke: LINE2, rx: 12 }) + `<rect x="${x}" y="6" width="172" height="152" fill="url(#ardGrid)" opacity=".7" rx="12"/>`;
    s += partIn('led', x + 14, 36, 26, 38, { color: 'red' }) + partIn('resistor', x + 54, 50, 44, 14) + partIn('pushbutton', x + 112, 38, 40, 34, { color: 'blue' }) + partIn('potentiometer', x + 46, 92, 40, 38) + partIn('led', x + 112, 94, 26, 36, { color: 'green' });
    if (mode === 'window') {
      s += `<rect x="${x + 6}" y="16" width="108" height="72" rx="3" fill="rgba(59,130,246,.14)" stroke="#3b82f6" stroke-width="1.6"/>` + pill2(x + 8, 8, 'Window', '#3b82f6') + `<path d="M${x + 14} 52 H${x + 100}" stroke="#60a5fa" stroke-width="1" stroke-dasharray="2 3" opacity="0"/>` + AR(x + 8, 148, x + 112, 148, { stroke: '#60a5fa', m: 'mfb' }) + T(x + 62, 142, 'drag to the right', { size: 8.5, anchor: 'middle', fill: '#93c5fd' });
      [[14, 36, 26, 38], [54, 46, 44, 22]].forEach(([a, b, w, h]) => { s += `<rect x="${x + a - 3}" y="${b - 3}" width="${w + 6}" height="${h + 6}" rx="5" fill="none" stroke="${K.acc}" stroke-width="1.2" stroke-dasharray="4 3"/>`; });
    } else {
      s += `<rect x="${x + 50}" y="30" width="112" height="86" rx="3" fill="rgba(34,197,94,.1)" stroke="#22c55e" stroke-width="1.6" stroke-dasharray="6 4"/>` + pill2(x + 52, 22, 'Crossing', '#22c55e') + AR(x + 160, 148, x + 52, 148, { stroke: '#4ade80', m: 'mfc' }) + T(x + 106, 142, 'drag to the left', { size: 8.5, anchor: 'middle', fill: '#86efac' });
      [[54, 46, 44, 22], [112, 34, 40, 38], [46, 92, 40, 38], [112, 94, 26, 36]].forEach(([a, b, w, h]) => { s += `<rect x="${x + a - 3}" y="${b - 3}" width="${w + 6}" height="${h + 6}" rx="5" fill="none" stroke="${K.acc}" stroke-width="1.2" stroke-dasharray="4 3"/>`; });
    }
    return s;
  };
  return fig(360, 168, SHARED + UIDEFS + panel(6, 'window') + panel(182, 'crossing'), 'The Select tool (or press and hold on empty space, then drag). Right = Window: only what lies completely inside. Left = Crossing: everything the box touches.');
};
const pill2 = (x, y, t, c) => R(x, y, t.length * 5.5 + 12, 13, { fill: c, stroke: 'none', rx: 6.5 }) + T(x + 6, y + 9.6, t, { size: 8, fill: '#fff', weight: 800 });

export const powerRails = () => bench({
  cols: [1, 24], board: { pins: ['5V', 'GND'] }, gapDown: 40, bandRails: ['tp', 'tn'], cropTo: 8,
  wires: [{ a: 'R/5V', b: 'B/tp.3', color: 'red' }, { a: 'R/GND', b: 'B/tn.8', color: 'black' }],
  tags: [{ at: 'B/tp.16', text: '+  = 5 V', color: K.err, dy: -8 }, { at: 'B/tn.16', text: '−  = GND', color: K.blue, dy: 26 }],
  cap: 'Power on the breadboard: the Uno\'s 5V goes to the red + rail, GND to the blue − rail. Every hole of a rail is then 5 V (or GND) — plug the parts in anywhere along it.',
});

export const shortCircuit = () => {
  const b = benchSvg({ cols: [1, 16], board: { pins: ['5V', 'GND'] }, gapDown: 34, cropTo: 6, w: 176, bandRails: ['tp', 'tn'],
    wires: [{ a: 'R/5V', b: 'B/tp.3', color: 'red' }, { a: 'R/GND', b: 'B/tn.3', color: 'black' }, { a: 'B/tp.8', b: 'B/tn.8', color: 'yellow', hi: true, via: 66 }] });
  let s = `<g transform="translate(0 8)">${b.content}</g>` + T(88, b.h + 24, 'a wire joins + and −', { size: 9.5, anchor: 'middle', fill: K.warn, weight: 700 });
  s += R(190, 14, 164, 150, { fill: '#121a30', stroke: LINE2, rx: 14 }) + T(202, 36, '⚡ Simulation stopped', { size: 11, weight: 800 });
  ['Short circuit on the 5V pin!', '100.0 A flowing — the board\'s', 'protection shut it down.', 'Check that 5V is not wired', 'directly to GND.'].forEach((t, i) => { s += T(202, 58 + i * 15, t, { size: 9.6, fill: i === 0 ? '#fca5a5' : K.ink, weight: i === 0 ? 700 : 500 }); });
  s += pillBtn(290, 134, 56, 22, 'url(#ardBrand)', 'OK', { size: 10, ink: '#04121a', rx: 8 });
  return fig(360, Math.max(b.h + 40, 176), UIDEFS + s, 'Joining 5V and GND is a short circuit: the simulation stops at once and the message names the pin. Remove the wire and Run again.');
};

export const warnList = () => {
  let s = UIDEFS + T(12, 14, 'While it runs, the ⚠ pill counts the messages', { size: 9.5, fill: K.dim, weight: 700 }) +
    R(8, 20, 344, 28, { fill: 'rgba(34,197,94,.1)', stroke: 'rgba(34,197,94,.3)', rx: 8 }) + `<circle cx="22" cy="34" r="4" fill="${K.ok}"/><text x="34" y="38" font-size="11" font-weight="700" fill="#e8eef9" font-family="JetBrains Mono, monospace">00:03.2</text>` + T(92, 38, '100% speed', { size: 10, fill: K.line }) +
    R(292, 25, 52, 18, { fill: 'rgba(245,158,11,.18)', stroke: K.warn, rx: 9 }) + ico('warning', 298, 27, 14, '#fcd34d') + T(322, 38, '3', { size: 10, fill: '#fcd34d', weight: 800 }) + AR(318, 62, 318, 50, { m: 'mfb', stroke: K.acc });
  s += R(8, 68, 344, 218, { fill: '#121a30', stroke: LINE2, rx: 16 }) + T(22, 92, 'Simulation messages', { size: 12, weight: 800 });
  const msgs = [['Pin D13 is supplying 91 mA — more than the 40 mA', 'maximum! Use a resistor or a transistor/driver.'], ['💥 red LED burned out — 91 mA is far above its 20 mA', 'limit. Put a current-limiting resistor (220 Ω – 1 kΩ)', 'in series with every LED'], ['Pin D2 is floating (not connected to anything) and', 'reads random values. Use INPUT_PULLUP or a', 'pull-down resistor.']];
  let y = 112;
  msgs.forEach((m) => { s += `<circle cx="22" cy="${y - 3}" r="2" fill="${K.warn}"/>`; m.forEach((t, i) => { s += T(32, y + i * 12.5, t, { size: 9, fill: K.ink }); }); y += m.length * 12.5 + 12; });
  s += pillBtn(290, 254, 54, 22, 'url(#ardBrand)', 'OK', { size: 10, ink: '#04121a', rx: 8 });
  return fig(360, 296, s, 'The app has no "check my circuit" button. Instead it tells you while the sketch runs: a toast pops up for each message and the ⚠ pill keeps the list.');
};
export const heroCanvas = () => {
  let s = SHARED + UIDEFS + R(8, 8, 364, 216, { fill: CANVAS, stroke: LINE2, rx: 18 }) + `<rect x="8" y="8" width="364" height="216" rx="18" fill="url(#ardGrid)"/>`;
  s += sceneIn(projectScene('traffic-light'), 16, 42, 296, 132);
  s += sideRail(340, 18, ['undo', 'redo', '-', 'select', 'zoomIn', 'zoomOut', 'fit', 'fullscreen']);
  s += R(20, 182, 300, 34, { fill: 'rgba(10,16,32,.92)', stroke: LINE2, rx: 12 }) + T(30, 203, 'LED · Red', { size: 9.5, weight: 800 }) + ['rotate', 'mirror', 'flipv', 'sliders', 'copy', 'trash'].map((n, i) => ico(n, 100 + i * 34, 191, 16, n === 'trash' ? K.err : '#c7d2e8')).join('');
  s += R(110, 16, 150, 20, { fill: 'rgba(8,47,73,.85)', stroke: 'rgba(34,211,238,.4)', rx: 8 }) + T(185, 30, 'Tap a pin, then another pin', { size: 9.5, anchor: 'middle', fill: '#dff9ff', weight: 600 });
  return fig(380, 232, s, 'The circuit canvas: parts and wires on a dotted board, tools on the right, the bar of the selected part at the bottom.');
};

export const gestures = () => {
  const finger = (x, y, o = {}) => `<circle cx="${x}" cy="${y}" r="9" fill="rgba(255,255,255,.28)" stroke="${o.c || K.acc}" stroke-width="1.6"/>`;
  const cell = (i, title, sub, inner) => R(6 + i * 88, 6, 82, 120, { fill: CANVAS, stroke: LINE2, rx: 10 }) + `<rect x="${6 + i * 88}" y="6" width="82" height="120" rx="10" fill="url(#ardGrid)" opacity=".7"/>` + inner + T(47 + i * 88, 142, title, { size: 9.5, anchor: 'middle', weight: 800 }) + T(47 + i * 88, 154, sub, { size: 8.5, anchor: 'middle', fill: K.line });
  let s = UIDEFS;
  s += cell(0, 'Drag', 'move the view', finger(30, 80) + AR(38, 74, 70, 44, { m: 'mfb', stroke: K.acc }) + `<circle cx="30" cy="80" r="2" fill="${K.acc}"/>` + partIn('led', 40, 30, 20, 30, { color: 'red' }));
  s += cell(1, 'Pinch', 'zoom in / out', finger(126, 90) + finger(166, 50) + AR(120, 96, 108, 108, { m: 'mfb', stroke: K.acc }) + AR(172, 44, 184, 32, { m: 'mfb', stroke: K.acc }));
  s += cell(2, 'Double-tap, slide', 'zoom like a map', finger(236, 58) + `<circle cx="236" cy="58" r="14" fill="none" stroke="${K.acc}" stroke-width="1" stroke-dasharray="2 3"/>` + AR(236, 74, 236, 112, { m: 'mfb', stroke: K.acc }) + T(262, 96, '↓ in', { size: 8, fill: K.line }) + T(262, 40, '↑ out', { size: 8, fill: K.line }));
  s += cell(3, 'Press, hold, drag', 'selection box', finger(300, 40, { c: '#3b82f6' }) + `<rect x="300" y="40" width="52" height="62" fill="rgba(59,130,246,.14)" stroke="#3b82f6" stroke-width="1.5"/>` + AR(304, 112, 340, 112, { m: 'mfb', stroke: '#60a5fa' }));
  return fig(360, 164, s, 'The four gestures of the canvas. Double-tap on empty space zooms in one step; the ± and Fit tools do the same with a tap.');
};
// ---------------------------------------------------------------------------------------------- A3
const KWRE = /\b(void|int|long|float|double|bool|boolean|byte|char|unsigned|const|static|String|if|else|for|while|do|switch|case|break|continue|return|true|false|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|LED_BUILTIN|setup|loop|A[0-5])\b/g;
const MONO = 'JetBrains Mono, ui-monospace, monospace';
/** One line of Arduino code as coloured <tspan>s. */
export function hlSvg(l) {
  let body = l, tail = '';
  const cm = l.indexOf('//');
  if (cm >= 0) { tail = l.slice(cm); body = l.slice(0, cm); }
  let out = '';
  for (const piece of body.split(/("(?:[^"\\]|\\.)*")/)) {
    if (/^"/.test(piece)) out += `<tspan fill="#c3e88d">${esc(piece)}</tspan>`;
    else out += esc(piece).replace(KWRE, '<tspan fill="#c792ea">$&</tspan>').replace(/(?<![\w#;&])(\d+(?:\.\d+)?)(?![\w;])/g, '<tspan fill="#f78c6c">$1</tspan>');
  }
  if (tail) out += `<tspan fill="#66789c" font-style="italic">${esc(tail)}</tspan>`;
  return out;
}
/** Lines of code as SVG text at (x, y) (the first baseline); `nums` prints line numbers. */
export function codeSvg(lines, x, y, { size = 10, lh = 14.5, nums = true } = {}) {
  return lines.map((l, i) => (nums ? `<text x="${x}" y="${f1(y + i * lh)}" font-size="${size - 1.5}" fill="#4b5b7a" font-family="${MONO}">${i + 1}</text>` : '') +
    `<text x="${x + (nums ? 18 : 0)}" y="${f1(y + i * lh)}" font-size="${size}" fill="#e6edf7" font-family="${MONO}" xml:space="preserve" style="white-space:pre">${hlSvg(l)}</text>`).join('');
}
const codeCard = (x, y, w, h) => R(x, y, w, h, { fill: '#08101f', stroke: K.line, rx: 10 });

export const heroCode = () => {
  const lines = ['void setup() {', '  pinMode(13, OUTPUT);', '}', '', 'void loop() {', '  digitalWrite(13, HIGH);', '  delay(500);', '  digitalWrite(13, LOW);', '  delay(500);', '}'];
  let s = codeCard(8, 8, 192, 168) + codeSvg(lines, 16, 28, { size: 9.5, lh: 15 });
  s += `<rect x="12" y="92" width="184" height="15" rx="3" fill="rgba(250,204,21,.13)"/><rect x="12" y="92" width="2.4" height="15" fill="#facc15"/>`;
  // pin 13 as a waveform
  const x0 = 224, w = 128;
  s += T(x0, 22, 'pin 13', { size: 9.5, fill: K.dim, weight: 700 }) + T(x0 - 6, 48, '5 V', { size: 8.5, fill: K.line, anchor: 'end' }) + T(x0 - 6, 92, '0 V', { size: 8.5, fill: K.line, anchor: 'end' });
  s += P(`M${x0} 90 V46 H${x0 + 32} V90 H${x0 + 64} V46 H${x0 + 96} V90 H${x0 + w}`, { stroke: K.ok, sw: 2 }) + L(x0, 90, x0 + w, 90, { stroke: K.dim, sw: 0.8, dash: '3 3' });
  s += T(x0 + 16, 40, 'HIGH', { size: 8.5, fill: K.ok, anchor: 'middle', weight: 700 }) + T(x0 + 48, 106, 'LOW', { size: 8.5, fill: K.line, anchor: 'middle', weight: 700 }) + L(x0 + 32, 96, x0 + 64, 96, { stroke: K.warn, sw: 1.2 }) + T(x0 + 48, 118, '500 ms', { size: 8.5, fill: K.warn, anchor: 'middle' });
  s += `<g transform="translate(${x0 + 6} 130)">${partIn('led', 0, 0, 22, 34, { color: 'red' }, 0, ledMod('red'))}</g>` + `<g transform="translate(${x0 + 76} 130)">${partIn('led', 0, 0, 22, 34, { color: 'red' })}</g>` + T(x0 + 17, 176, 'on', { size: 9, anchor: 'middle', fill: K.ok }) + T(x0 + 87, 176, 'off', { size: 9, anchor: 'middle', fill: K.line });
  return fig(380, 190, SHARED + s, 'A sketch is a list of instructions. Each line moves a pin up or down; delay() decides how long it stays there.');
};

export const sketchAnatomy = () => {
  const lines = ['// Blink with a name', 'const int LED = 13;', '', 'void setup() {', '  pinMode(LED, OUTPUT);', '}', '', 'void loop() {', '  digitalWrite(LED, HIGH);', '  delay(500);', '  digitalWrite(LED, LOW);', '  delay(500);', '}'];
  const y0 = 30, lh = 17;
  let s = codeCard(8, 8, 236, 238) + codeSvg(lines, 16, y0, { size: 10, lh });
  const region = (a, b, c, n) => `<rect x="5" y="${f1(y0 - 11 + a * lh)}" width="3.6" height="${f1((b - a + 1) * lh)}" rx="1.8" fill="${c}"/>` + BADGE(256, y0 - 4 + ((a + b) / 2) * lh, n);
  s += region(0, 0, K.dim, 1) + region(1, 1, K.blue, 2) + region(3, 5, K.ok, 3) + region(7, 12, K.warn, 4);
  const tx = 270;
  s += T(tx, y0 - 0.5, 'a comment', { size: 10, weight: 700 });
  s += T(tx, y0 + lh + 0.5, "a name for", { size: 10, weight: 700, fill: K.blue }) + T(tx, y0 + lh + 13, "pin 13", { size: 9, fill: K.line });
  s += T(tx, y0 + 4 * lh - 4, 'setup()', { size: 10.5, weight: 800, fill: K.ok }) + T(tx, y0 + 4 * lh + 8, 'runs once', { size: 9, fill: K.line });
  s += T(tx, y0 + 9 * lh - 4, 'loop()', { size: 10.5, weight: 800, fill: K.warn }) + T(tx, y0 + 9 * lh + 8, 'again and', { size: 9, fill: K.line }) + T(tx, y0 + 9 * lh + 19, 'again, for ever', { size: 9, fill: K.line });
  return fig(360, 254, s, 'The anatomy of a sketch: names at the top, setup() once, loop() for ever.');
};

export const programFlow = () => {
  const box = (y, h, c, t, sub) => R(40, y, 170, h, { fill: K.box, stroke: c, rx: 12, sw: 1.4 }) + T(125, y + 22, t, { size: 13, anchor: 'middle', weight: 800, fill: c }) + (sub ? T(125, y + 38, sub, { size: 9, anchor: 'middle', fill: K.line }) : '');
  let s = R(40, 6, 170, 30, { fill: 'url(#ardGreen)', stroke: 'none', rx: 15 }) + ico('play', 66, 12, 18, '#fff') + T(94, 26, 'Press Run', { size: 12, weight: 800, fill: '#fff' });
  s += AR(125, 38, 125, 54) + box(56, 50, K.ok, 'setup()', 'runs once: pinMode, begin …') + AR(125, 108, 125, 124) + box(126, 74, K.warn, 'loop()', 'read · decide · write') + T(125, 188, '', {});
  s += P('M210 163 H246 V126 H212', { stroke: K.warn, dash: '4 4' }) + `<path d="M212 126l7-4v8z" fill="${K.warn}"/>` + T(262, 142, 'and again,', { size: 10, weight: 700, fill: K.warn }) + T(262, 156, 'and again …', { size: 10, weight: 700, fill: K.warn }) + T(262, 172, 'thousands of', { size: 9, fill: K.line }) + T(262, 184, 'times a second', { size: 9, fill: K.line });
  s += T(262, 40, 'Stop', { size: 11, weight: 800, fill: K.err }) + T(262, 54, 'ends it any', { size: 9, fill: K.line }) + T(262, 66, 'time', { size: 9, fill: K.line });
  return fig(360, 208, UIDEFS + s, 'What the board does with your sketch: setup() once, then loop() without end.');
};

export const pinLevels = () => {
  const gx = 28, top = 18, bot = 168, h = bot - top;
  const yV = (v) => bot - (v / 5) * h;
  let s = `<rect x="${gx}" y="${yV(5)}" width="30" height="${f1(yV(3) - yV(5))}" rx="4" fill="${K.ok}" fill-opacity=".3" stroke="${K.ok}"/>` +
    `<rect x="${gx}" y="${f1(yV(3))}" width="30" height="${f1(yV(1.5) - yV(3))}" rx="0" fill="${K.warn}" fill-opacity=".18" stroke="${K.warn}" stroke-dasharray="3 3"/>` +
    `<rect x="${gx}" y="${f1(yV(1.5))}" width="30" height="${f1(yV(0) - yV(1.5))}" rx="4" fill="${K.blue}" fill-opacity=".25" stroke="${K.blue}"/>`;
  s += T(gx + 15, yV(4) + 3, 'HIGH', { size: 9, anchor: 'middle', weight: 800, fill: '#86efac' }) + T(gx + 15, yV(2.25) + 3, '?', { size: 11, anchor: 'middle', weight: 800, fill: '#fcd34d' }) + T(gx + 15, yV(0.75) + 3, 'LOW', { size: 9, anchor: 'middle', weight: 800, fill: '#93c5fd' });
  for (const v of [0, 1.5, 3, 5]) s += L(gx + 30, yV(v), gx + 40, yV(v), { stroke: K.line, sw: 1 }) + T(gx + 44, yV(v) + 3, `${v} V`, { size: 9, fill: K.line });
  s += T(gx + 15, 10, 'what an input reads', { size: 9, anchor: 'middle', fill: K.dim, weight: 700 });
  const rx = 120;
  s += T(rx, 24, 'INPUT (digitalRead)', { size: 11, weight: 800 }) + T(rx, 40, 'above 3 V (60 % of 5 V) → HIGH', { size: 9.5, fill: '#86efac' }) + T(rx, 54, 'below 1.5 V (30 %) → LOW', { size: 9.5, fill: '#93c5fd' }) + T(rx, 68, 'in between → the last value', { size: 9.5, fill: '#fcd34d' });
  s += T(rx, 96, 'OUTPUT (digitalWrite)', { size: 11, weight: 800 }) + T(rx, 112, 'HIGH → the pin gives 5 V', { size: 9.5, fill: K.ink }) + T(rx, 126, 'LOW → the pin is 0 V (ground)', { size: 9.5, fill: K.ink });
  s += T(rx, 152, '3.3 V boards (ESP32, NodeMCU):', { size: 9.5, fill: K.dim, weight: 700 }) + T(rx, 166, 'the same percentages of 3.3 V.', { size: 9.5, fill: K.dim });
  return fig(360, 182, s, 'A digital pin only knows two states. As an input it reads the voltage and decides HIGH or LOW; as an output it gives 5 V or 0 V.');
};

export const waveforms = () => {
  const x0 = 58, x1 = 348, wd = x1 - x0;
  const hi = 24, lo = 66;
  const frame = (y, title, sub, extra) => T(10, y + 10, title, { size: 11.5, weight: 800 }) + T(10 + title.length * 7 + 8, y + 10, sub, { size: 9, fill: K.line }) + L(x0, y + lo, x1, y + lo, { stroke: K.dim, sw: 0.8, dash: '3 3' }) +
    T(x0 - 6, y + hi + 3, '5 V', { size: 8.5, anchor: 'end', fill: K.line }) + T(x0 - 6, y + lo + 3, '0 V', { size: 8.5, anchor: 'end', fill: K.line }) + (extra || '');
  let s = '';
  let y = 4;
  s += frame(y, 'Digital', 'two states only') + P(`M${x0} ${y + lo} V${y + hi} H${x0 + 58} V${y + lo} H${x0 + 116} V${y + hi} H${x0 + 190} V${y + lo} H${x0 + 238} V${y + hi} H${x1}`, { stroke: K.ok, sw: 2.2 });
  y = 100;
  s += frame(y, 'Analog', 'every value in between', T(x1, y + 10, 'analogRead → 0 … 1023', { size: 8.5, anchor: 'end', fill: K.acc }));
  let d = '';
  for (let i = 0; i <= 60; i++) { const t = i / 60; const v = 0.5 + 0.42 * Math.sin(t * Math.PI * 2.4 - 1.2) * (0.6 + 0.4 * t); d += `${i ? ' L' : 'M'}${f1(x0 + t * wd)} ${f1(y + lo - v * (lo - hi))}`; }
  s += P(d, { stroke: K.acc, sw: 2.2 });
  y = 196;
  s += frame(y, 'PWM', 'on and off, very fast', T(x1, y + 10, 'analogWrite(pin, 0 … 255)', { size: 8.5, anchor: 'end', fill: K.warn }));
  const duty = [0.25, 0.5, 0.75], seg = wd / 3, per = 24;
  let pd = `M${x0} ${y + lo}`;
  duty.forEach((dc, k) => {
    const a = x0 + k * seg, b = a + seg;
    for (let t = a; t < b - 2; t += per) { const on = Math.min(per * dc, b - t); pd += ` H${f1(t)} V${y + hi} H${f1(t + on)} V${y + lo}`; }
    pd += ` H${f1(b)}`;
  });
  s += P(pd, { stroke: K.warn, sw: 2 });
  duty.forEach((dc, k) => { const a = x0 + k * seg; s += T(a + seg / 2, y + lo + 15, `${dc * 100} % on`, { size: 9, anchor: 'middle', fill: K.warn, weight: 700 }) + L(a + 3, y + lo - dc * (lo - hi), a + seg - 3, y + lo - dc * (lo - hi), { stroke: '#fff', sw: 1.2, dash: '2 3' }); });
  return fig(360, 296, s, 'Digital: only 0 V or 5 V. Analog: every value between. PWM: a digital pin switched on and off so fast that the average voltage (dotted line) is what counts.');
};

export const millisTimeline = () => {
  const x0 = 24, sc = 100, y1 = 52, y2 = 148;
  let s = '';
  for (let t = 0; t <= 3; t++) s += L(x0 + t * sc, 28, x0 + t * sc, 190, { stroke: 'rgba(148,163,184,.18)', sw: 1 }) + T(x0 + t * sc, 202, `${t} s`, { size: 9, anchor: 'middle', fill: K.dim });
  s += T(10, 20, 'delay(1000): the board waits', { size: 10.5, weight: 800, fill: K.err });
  s += R(x0, y1, sc, 22, { fill: 'rgba(74,222,128,.22)', stroke: K.ok, rx: 5 }) + T(x0 + sc / 2, y1 + 15, 'LED on · asleep', { size: 9, anchor: 'middle', fill: '#86efac' }) + R(x0 + sc, y1, sc, 22, { fill: 'rgba(148,163,184,.14)', stroke: K.dim, rx: 5 }) + T(x0 + sc * 1.5, y1 + 15, 'LED off · asleep', { size: 9, anchor: 'middle', fill: K.line }) + R(x0 + 2 * sc, y1, sc, 22, { fill: 'rgba(74,222,128,.22)', stroke: K.ok, rx: 5 }) + T(x0 + sc * 2.5, y1 + 15, 'LED on · asleep', { size: 9, anchor: 'middle', fill: '#86efac' });
  s += AR(x0 + 40, 42, x0 + 40, 51, { stroke: K.err }) + T(x0 + 40, 40, 'press', { size: 8.5, anchor: 'middle', fill: K.err }) + T(x0 + 160, 40, 'press', { size: 8.5, anchor: 'middle', fill: K.err }) + AR(x0 + 160, 42, x0 + 160, 51, { stroke: K.err });
  s += T(x0 + 150, 94, '✗ the button is not read until the delay ends', { size: 9, anchor: 'middle', fill: '#fca5a5' });
  s += T(10, 120, 'millis(): the board keeps looking', { size: 10.5, weight: 800, fill: K.ok });
  for (let i = 0; i < 60; i++) s += L(x0 + 4 + i * 5, y2 + 6, x0 + 4 + i * 5, y2 + 22, { stroke: K.blue, sw: 1.2 });
  s += `<circle cx="${x0 + sc}" cy="${y2 + 14}" r="7" fill="${K.warn}"/>` + `<circle cx="${x0 + 2 * sc}" cy="${y2 + 14}" r="7" fill="${K.warn}"/>` + T(x0 + sc, y2 + 40, 'toggle LED', { size: 8.5, anchor: 'middle', fill: '#fcd34d' }) + T(x0 + 2 * sc, y2 + 40, 'toggle LED', { size: 8.5, anchor: 'middle', fill: '#fcd34d' });
  s += AR(x0 + 40, y2 - 10, x0 + 40, y2 + 4, { stroke: K.ok }) + T(x0 + 40, y2 - 12, 'press ✓', { size: 8.5, anchor: 'middle', fill: '#86efac' }) + AR(x0 + 160, y2 - 10, x0 + 160, y2 + 4, { stroke: K.ok }) + T(x0 + 160, y2 - 12, 'press ✓', { size: 8.5, anchor: 'middle', fill: '#86efac' });
  s += T(x0 + 296, y2 + 40, 'each tick asks: time yet?', { size: 8.5, anchor: 'end', fill: K.line });
  return fig(340, 212, s, 'delay() stops the sketch for the whole time. With millis() the loop keeps running and only checks the clock — so buttons and sensors stay alive.');
};

export const controlFlow = () => {
  const dia = (cx, cy, w, h, t, c = K.warn) => `<path d="M${cx} ${cy - h / 2} L${cx + w / 2} ${cy} L${cx} ${cy + h / 2} L${cx - w / 2} ${cy} Z" fill="${K.box}" stroke="${c}" stroke-width="1.4"/>` + T(cx, cy + 3.5, t, { size: 9.5, anchor: 'middle', weight: 700 });
  const bx = (cx, cy, w, t, c = K.line) => R(cx - w / 2, cy - 12, w, 24, { fill: K.box, stroke: c, rx: 7 }) + T(cx, cy + 3.5, t, { size: 9.2, anchor: 'middle' });
  let s = T(90, 14, 'if … else', { size: 11, anchor: 'middle', weight: 800 }) + T(270, 14, 'for loop', { size: 11, anchor: 'middle', weight: 800 });
  s += AR(90, 20, 90, 29) + dia(90, 52, 124, 44, 'pressed?');
  s += P('M28 52 H40 V102', { stroke: K.ok }) + `<path d="M40 104l-4-7h8z" fill="${K.ok}"/>` + T(30, 44, 'yes', { size: 8.5, fill: K.ok }) + bx(40, 116, 70, 'LED on', K.ok) + P('M152 52 H140 V102', { stroke: K.err }) + `<path d="M140 104l-4-7h8z" fill="${K.err}"/>` + T(150, 44, 'no', { size: 8.5, fill: K.err }) + bx(140, 116, 70, 'LED off', K.err);
  s += L(40, 128, 40, 148, { stroke: K.line }) + L(140, 128, 140, 148, { stroke: K.line }) + L(40, 148, 140, 148, { stroke: K.line }) + AR(90, 148, 90, 164) + T(90, 178, 'go on', { size: 9, anchor: 'middle', fill: K.line });
  // for
  s += bx(270, 34, 120, 'int i = 0', K.blue) + AR(270, 46, 270, 62) + dia(270, 80, 110, 38, 'i < 5 ?') + T(340, 76, 'no', { size: 8.5, fill: K.err }) + P('M325 80 H344 V170 H280', { stroke: K.err, dash: '3 3' }) + `<path d="M280 170l7-4v8z" fill="${K.err}"/>` +
    AR(270, 99, 270, 116) + T(278, 110, 'yes', { size: 8.5, fill: K.ok }) + bx(270, 128, 120, 'blink the LED', K.ok) + AR(270, 140, 270, 152) + bx(270, 164, 70, 'i++', K.blue) + P('M235 164 H206 V80 H214', { stroke: K.blue }) + `<path d="M216 80l-7-4v8z" fill="${K.blue}"/>`;
  return fig(360, 190, UIDEFS + s, 'The two decisions of every sketch: if/else chooses one of two ways; for repeats a block a known number of times.');
};

export const intRange = () => {
  const row = (y, name, range, note, c, bits) => T(10, y + 12, name, { size: 11, weight: 800, fill: c, mono: true }) + R(104, y, 246, 17, { fill: K.box, stroke: K.line, rx: 8.5 }) +
    `<rect x="104" y="${y}" width="${f1(246 * bits / 32)}" height="17" rx="8.5" fill="${c}" fill-opacity=".35"/>` + T(110, y + 12.5, range, { size: 8.8, fill: K.ink, mono: true }) + T(104, y + 31, note, { size: 8.5, fill: K.line });
  let s = row(8, 'byte', '0 … 255', '8 bits · small numbers, pin values', K.ok, 8);
  s += row(50, 'int', '−32,768 … 32,767', '16 bits on Uno, Nano, Mega · 32 bits on ESP32, R4', K.blue, 16);
  s += row(92, 'long', '−2,147,483,648 … 2,147,483,647', '32 bits · big counts', K.vio, 32);
  s += row(134, 'unsigned long', '0 … 4,294,967,295', 'what millis() gives: about 49 days, then 0 again', K.warn, 32);
  s += R(8, 178, 344, 40, { fill: 'rgba(245,158,11,.1)', stroke: 'rgba(245,158,11,.4)', rx: 10 }) + T(18, 195, 'On an Uno:  int x = 32767;  x = x + 1;', { size: 10, mono: true }) + T(18, 210, '→ x is now −32768 (the number wraps round, like an odometer)', { size: 9.5, fill: '#fcd34d' });
  return fig(360, 228, s, 'How big a number can be (the bar is the size in bits). Pick the smallest type that is big enough — and watch the int of the Uno.');
};

export const libMap = () => {
  const groups = [
    ['display', 'Displays', K.vio, ['LiquidCrystal', 'LiquidCrystal_I2C', 'Adafruit_SSD1306', 'Adafruit_GFX', 'TM1637Display', 'LedControl', 'Adafruit_NeoPixel', 'Arduino_LED_Matrix']],
    ['sensors', 'Sensors', K.ok, ['DHT', 'DHTesp', 'NewPing', 'OneWire', 'DallasTemperature', 'Adafruit_MPU6050', 'MPU6050', 'RTClib', 'IRremote', 'Keypad']],
    ['motors', 'Motors & memory', K.warn, ['Servo', 'Stepper', 'AccelStepper', 'EEPROM', 'Wire']],
    ['wifi', 'Wi-Fi boards only', K.acc, ['WiFi', 'WiFiClient', 'WebServer', 'HTTPClient', 'PubSubClient', 'ArduinoJson', 'ThingSpeak', 'Blynk', 'UniversalTelegramBot', 'NTPClient', 'Preferences', 'BluetoothSerial', 'ESPmDNS', 'WiFiMulti']],
  ];
  let s = '', y = 8;
  for (const [ic, name, c, libs] of groups) {
    s += R(8, y, 344, 4, { fill: 'none', stroke: 'none' }) + ico(ic === 'wifi' ? 'wifi' : ic === 'display' ? 'display' : ic === 'sensors' ? 'sensor' : 'motor', 12, y + 2, 16, c) + T(34, y + 14, name, { size: 11, weight: 800, fill: c });
    let x = 12, yy = y + 24;
    for (const l of libs) {
      const w = l.length * 5.9 + 14;
      if (x + w > 352) { x = 12; yy += 22; }
      s += R(x, yy, w, 18, { fill: 'rgba(15,23,43,.9)', stroke: c, rx: 9, sw: 1 }) + T(x + w / 2, yy + 12.5, l, { size: 9, anchor: 'middle', fill: K.ink, mono: true });
      x += w + 6;
    }
    y = yy + 34;
  }
  return fig(360, y, s, 'The libraries you can #include. Names are the real Arduino ones, so the same sketch works on a real board.');
};

export const errorShot = () => {
  const lines = ['const int LED = 13;', '', 'void setup() {', '  pinMode(LED, OUTPUT)', '}', '', 'void loop() {', '  digitalWrite(LED, HIGH);', '  delay(500)', '}'];
  let s = UIDEFS + R(8, 6, 344, 34, { fill: 'rgba(239,68,68,.12)', stroke: 'rgba(239,68,68,.45)', rx: 10 }) + ico('warning', 16, 14, 18, K.err) + T(42, 21, 'Line 4', { size: 10.5, weight: 800, fill: '#fca5a5' }) + T(42, 33, "expected ';' at end of line", { size: 10, fill: K.ink });
  s += codeCard(8, 46, 344, 168) + codeSvg(lines, 16, 66, { size: 10, lh: 14.5 });
  s += `<rect x="12" y="${f1(66 - 11 + 3 * 14.5)}" width="336" height="14.5" rx="2" fill="rgba(239,68,68,.14)"/><path d="M${f1(16 + 18 + 22 * 6)} ${f1(66 + 3 * 14.5 + 3)} q3 -3 6 0 t6 0 t6 0 t6 0 t6 0 t6 0" fill="none" stroke="${K.err}" stroke-width="1.3"/>`;
  s += pillBtn(130, 226, 100, 22, 'rgba(239,68,68,.9)', 'Compilation failed', { size: 9.5 });
  s += T(180, 266, 'The Code tab opens by itself, the line is marked', { size: 9.5, anchor: 'middle', fill: K.line });
  return fig(360, 280, s, 'A compile error: Run stops, the Code tab opens, the faulty line is underlined and the red bar names the line and the problem.');
};
// ---------------------------------------------------------------------------------------------- A4: electronics
import { ledStress } from '../../sim/damage.js';
const SC = K.ink;            // schematic ink
const sg = (x, y, rot, inner) => `<g transform="translate(${x} ${y}) rotate(${rot})" fill="none" stroke="${SC}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
/** Schematic symbols, centred at (x, y), 48 long, rotated by rot degrees. */
const sch = {
  res: (x, y, rot = 0) => sg(x, y, rot, '<path d="M-24 0 H-15 L-11 -7 L-5 7 L1 -7 L7 7 L11 -7 L15 0 H24"/>'),
  led: (x, y, rot = 0, c = K.warn) => sg(x, y, rot, `<path d="M-24 0 H-6 M-6 -9 V9 L8 0 Z M8 -9 V9 M8 0 H24"/><g stroke="${c}" stroke-width="1.4"><path d="M0 -12 L7 -19 M4 -19 H7 V-16 M6 -8 L13 -15 M10 -15 H13 V-12"/></g>`),
  bat: (x, y, rot = 0) => sg(x, y, rot, '<path d="M-24 0 H-4 M-4 -12 V12 M4 -6 V6 M4 0 H24"/><path d="M-14 -12 v6 M-17 -9 h6" stroke-width="1.2"/>'),
  gnd: (x, y) => `<g transform="translate(${x} ${y})" fill="none" stroke="${SC}" stroke-width="1.8" stroke-linecap="round"><path d="M0 -8 V2 M-10 2 H10 M-6 7 H6 M-2 12 H2"/></g>`,
  sw: (x, y, rot = 0) => sg(x, y, rot, '<path d="M-24 0 H-10 M10 0 H24 M-10 0 L8 -11 M0 -16 V-6 M-7 -16 H7"/><circle cx="-10" cy="0" r="1.8" fill="#0a1226"/><circle cx="10" cy="0" r="1.8" fill="#0a1226"/>'),
  pot: (x, y, rot = 0) => sg(x, y, rot, `<path d="M-24 0 H-15 L-11 -7 L-5 7 L1 -7 L7 7 L11 -7 L15 0 H24"/><path d="M0 -24 V-9 M-3 -13 L0 -8 L3 -13"/>`),
  ldr: (x, y, rot = 0) => sg(x, y, rot, `<path d="M-24 0 H-15 L-11 -7 L-5 7 L1 -7 L7 7 L11 -7 L15 0 H24"/><path d="M-18 -24 L-8 -14 M-12 -24 L-2 -14" stroke="${K.warn}" stroke-width="1.4"/>`),
};
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="2.8" fill="${SC}"/>`;
const wr = (d, c = SC) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
const lbl = (x, y, t, o = {}) => T(x, y, t, { size: o.size || 10.5, anchor: o.anchor || 'middle', fill: o.fill || K.ink, weight: o.weight || 700, mono: o.mono });
const vTag = (x, y, t, c) => R(x - t.length * 3.3 - 6, y - 9, t.length * 6.6 + 12, 17, { fill: 'rgba(15,23,43,.95)', stroke: c, rx: 8.5, sw: 1.1 }) + T(x, y + 3.5, t, { size: 9.5, anchor: 'middle', fill: c, weight: 800 });

export const heroOhm = () => {
  let s = SHARED + UIDEFS;
  // real parts on the left
  s += R(8, 8, 150, 150, { fill: CANVAS, stroke: LINE2, rx: 14 }) + partIn('resistor', 28, 82, 110, 28, { value: 220 }) + `<g>${partIn('led', 62, 22, 44, 56, { color: 'red' }, 0, ledMod('red'))}</g>` + T(83, 140, '220 Ω + red LED', { size: 9.5, anchor: 'middle', fill: K.line, weight: 600 });
  // schematic on the right
  s += lbl(256, 20, 'D13 = HIGH = 5 V', { fill: '#fca5a5', size: 10 }) + R(166, 32, 30, 24, { fill: '#008f95', stroke: 'rgba(0,0,0,.4)', rx: 5 }) + T(181, 48, 'D13', { size: 9.5, anchor: 'middle', fill: '#eafcff', weight: 800 }) + wr('M196 44 H196') + sch.res(220, 44) + wr('M244 44 H268') + sch.led(292, 44) + wr('M316 44 H336 V96') + sch.gnd(336, 108);
  s += lbl(220, 72, '220 Ω', { fill: K.ink }) + vTag(220, 92, '3.2 V', K.err) + lbl(292, 72, 'LED', { fill: K.ink }) + vTag(292, 92, '1.8 V', K.warn);
  s += T(256, 128, 'I = 12.5 mA', { size: 14, anchor: 'middle', weight: 800, fill: K.ok }) + T(256, 146, 'bright, and safe for ever', { size: 9.5, anchor: 'middle', fill: K.line });
  s += R(8, 168, 344, 38, { fill: 'rgba(34,211,238,.08)', stroke: 'rgba(34,211,238,.3)', rx: 12 }) + T(180, 184, 'Voltage × current × resistance:  the three numbers behind every circuit.', { size: 9.8, anchor: 'middle', fill: K.ink, weight: 600 }) + T(180, 198, 'This chapter explains them with an LED.', { size: 9.3, anchor: 'middle', fill: K.line });
  return fig(360, 214, s, 'The simplest real circuit: a pin, a resistor, an LED. The resistor takes the voltage the LED does not need.');
};

export const waterAnalogy = () => {
  let s = T(100, 14, 'Water', { size: 11.5, anchor: 'middle', weight: 800, fill: K.blue }) + T(272, 14, 'Electricity', { size: 11.5, anchor: 'middle', weight: 800, fill: K.warn });
  // water: tank, pipe with a narrow part
  s += R(24, 26, 58, 70, { fill: 'rgba(59,130,246,.12)', stroke: K.blue, rx: 6 }) + `<rect x="25" y="46" width="56" height="49" rx="5" fill="rgba(59,130,246,.45)"/>` + T(53, 74, 'tank', { size: 9.5, anchor: 'middle', fill: '#dbeafe', weight: 700 });
  s += `<path d="M82 88 H116" stroke="${K.blue}" stroke-width="10" stroke-linecap="butt" opacity=".55"/><path d="M116 88 H146" stroke="${K.blue}" stroke-width="3.5" opacity=".9"/><path d="M146 88 H176" stroke="${K.blue}" stroke-width="10" stroke-linecap="butt" opacity=".55"/>` + AR(96, 74, 164, 74, { stroke: K.blue });
  s += T(53, 112, 'height = pressure', { size: 9, anchor: 'middle', fill: K.line }) + T(131, 106, 'narrow pipe', { size: 9, anchor: 'middle', fill: K.line }) + T(130, 68, 'flow', { size: 9, anchor: 'middle', fill: K.blue });
  // electricity: a loop with a battery and a resistor
  s += wr('M214 52 V46 H262') + sch.res(286, 46) + wr('M310 46 H336 V118 H214 V106') + sch.bat(214, 78, 90);
  s += T(205, 82, 'V', { size: 12, anchor: 'end', weight: 800, fill: K.warn }) + T(286, 30, 'R', { size: 12, anchor: 'middle', weight: 800 }) + AR(224, 38, 250, 38, { stroke: K.ok }) + T(237, 31, 'I', { size: 11, anchor: 'middle', weight: 800, fill: K.ok });
  s += T(272, 134, 'battery = push · resistor = hold-back', { size: 9, anchor: 'middle', fill: K.line });
  s += R(8, 146, 344, 66, { fill: 'rgba(15,23,43,.9)', stroke: K.line, rx: 12 });
  [['Voltage (V)', 'the push', 'volts, V', K.warn], ['Current (I)', 'the flow', 'amperes, A  (1 A = 1000 mA)', K.ok], ['Resistance (R)', 'the hold-back', 'ohms, Ω', K.err]].forEach(([a, b, c, col], i) => { s += T(18, 164 + i * 19, a, { size: 10.5, weight: 800, fill: col }) + T(112, 164 + i * 19, b, { size: 9.5, fill: K.ink }) + T(344, 164 + i * 19, c, { size: 9.5, fill: K.line, anchor: 'end' }); });
  return fig(360, 222, s, 'Picture the circuit as water: a tank pushes water (voltage) through a pipe; a narrow pipe (resistance) lets less flow (current) through.');
};

export const ohmTriangle = () => {
  const tri = (cx, cy) => {
    const w = 72, h = 62;
    const cells = { V: [cx, cy - h * 0.2], I: [cx - w * 0.28, cy + h * 0.32], R: [cx + w * 0.28, cy + h * 0.32] };
    let g = `<path d="M${cx} ${cy - h / 2} L${cx + w / 2} ${cy + h / 2} H${cx - w / 2} Z" fill="${K.box}" stroke="${K.line}" stroke-width="1.5"/>` + L(cx - w * 0.38, cy + h * 0.1, cx + w * 0.38, cy + h * 0.1, { stroke: K.line, sw: 1 }) + L(cx, cy + h * 0.1, cx, cy + h / 2, { stroke: K.line, sw: 1 });
    for (const [k, [px, py]] of Object.entries(cells)) g += T(px, py + 6, k, { size: 19, anchor: 'middle', weight: 800, fill: k === 'V' ? K.warn : k === 'I' ? K.ok : K.err });
    return g;
  };
  let s = tri(58, 68) + T(58, 118, 'cover the letter', { size: 9, anchor: 'middle', fill: K.line }) + T(58, 130, 'you want to find', { size: 9, anchor: 'middle', fill: K.line });
  s += T(116, 44, 'V = I × R', { size: 13.5, weight: 800, fill: K.warn }) + T(116, 70, 'I = V ÷ R', { size: 13.5, weight: 800, fill: K.ok }) + T(116, 96, 'R = V ÷ I', { size: 13.5, weight: 800, fill: K.err });
  s += R(236, 16, 116, 118, { fill: 'rgba(15,23,43,.95)', stroke: K.line, rx: 12 }) + T(294, 34, 'Our LED circuit', { size: 9.8, anchor: 'middle', weight: 800 }) + T(294, 52, 'V = 3.2 V', { size: 10, anchor: 'middle', fill: K.warn, mono: true }) + T(294, 68, 'R = 220 Ω', { size: 10, anchor: 'middle', fill: K.err, mono: true }) + L(250, 76, 338, 76, { stroke: K.line, sw: 1 }) + T(294, 94, 'I = 3.2 ÷ 220', { size: 10, anchor: 'middle', fill: K.ok, mono: true }) + T(294, 114, '= 14.5 mA', { size: 11.5, anchor: 'middle', fill: K.ok, mono: true, weight: 800 });
  return fig(360, 146, s, 'Ohm\'s law: the voltage across a resistor equals the current through it times its resistance. Work in volts, amperes and ohms; 0.0145 A is 14.5 mA.');
};

export const ledCalc = () => {
  let s = R(10, 8, 52, 30, { fill: '#008f95', stroke: 'rgba(0,0,0,.4)', rx: 6 }) + T(36, 22, 'D13', { size: 10.5, anchor: 'middle', fill: '#eafcff', weight: 800 }) + T(36, 33, 'HIGH', { size: 8, anchor: 'middle', fill: '#ffc9c9', weight: 700 }) + wr('M62 23 H82') + sch.res(106, 23) + wr('M130 23 H158') + sch.led(182, 23) + wr('M206 23 H236 V52') + sch.gnd(236, 62);
  s += T(106, 52, '220 Ω', { size: 10, anchor: 'middle', weight: 800 }) + T(182, 56, 'LED', { size: 10, anchor: 'middle', weight: 800 }) + vTag(106, 74, '5 V − 1.8 V = 3.2 V', K.err) + vTag(188, 94, 'LED: 1.8 V', K.warn);
  s += AR(76, 14, 92, 14, { stroke: K.ok, m: 'mfc' }) + T(84, 8, 'I', { size: 9.5, anchor: 'middle', fill: K.ok, weight: 800 });
  s += R(8, 110, 344, 118, { fill: 'rgba(15,23,43,.95)', stroke: K.line, rx: 12 }) + T(20, 128, 'How to choose the resistor', { size: 10.5, weight: 800 });
  const rows = [['R = (V', 'supply', ' − V', 'LED', ') ÷ I'], ];
  s += T(20, 148, 'R  =  (V_supply − V_LED) ÷ I', { size: 11, mono: true, fill: K.acc, weight: 700 }) + T(20, 168, 'R  =  (5 V − 1.8 V) ÷ 0.020 A  =  160 Ω', { size: 10.2, mono: true }) + T(20, 188, 'take the next value you can buy:  220 Ω', { size: 10, fill: '#86efac', weight: 700 }) + T(20, 206, 'then  I = 3.2 V ÷ 220 Ω ≈ 14.5 mA   ✓ below 20 mA', { size: 10, mono: true, fill: K.ok }) + T(20, 221, '(the app shows 12.5 mA: the pin itself adds about 25 Ω)', { size: 8.8, fill: K.dim });
  void rows;
  return fig(360, 236, s, 'Choosing the resistor of an LED. The LED keeps about 1.8 V (red); the resistor takes the rest and decides the current.');
};

export const resistorColors = () => {
  const bands = ['#111', '#8a4b1f', '#e01b1b', '#ff8a1f', '#ffd21f', '#1fae4b', '#1f5fe0', '#8a2be2', '#8a8a8a', '#f5f5f5'];
  const names = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
  let s = SHARED;
  [[220, 'red · red · brown', 'first digit 2, second digit 2, then × 10'], [1000, 'brown · black · red', '1 0 × 100 = 1 kΩ'], [10000, 'brown · black · orange', '1 0 × 1000 = 10 kΩ']].forEach(([v, a, b], i) => {
    s += partIn('resistor', 14, 8 + i * 36, 90, 20, { value: v }) + T(118, 20 + i * 36, v >= 1000 ? `${v / 1000} kΩ` : `${v} Ω`, { size: 12, weight: 800 }) + T(176, 20 + i * 36, a, { size: 9.5, fill: K.ink }) + T(118, 34 + i * 36, b, { size: 8.8, fill: K.line });
  });
  s += T(14, 128, 'Digits:', { size: 10, weight: 800, fill: K.dim });
  bands.forEach((c, i) => { s += `<rect x="${14 + i * 34}" y="136" width="30" height="20" rx="4" fill="${c}" stroke="rgba(255,255,255,.25)"/>` + T(29 + i * 34, 170, String(i), { size: 11, anchor: 'middle', weight: 800 }) + T(29 + i * 34, 183, names[i], { size: 7, anchor: 'middle', fill: K.line }); });
  s += `<rect x="14" y="192" width="30" height="14" rx="4" fill="#d4af37"/>` + T(52, 203, 'gold at the end = tolerance ±5 %', { size: 9, fill: K.line });
  return fig(360, 214, s, 'The colour bands of a resistor: the first two give the digits, the third the number of zeros. In the app the colours change when you edit the value.');
};

export const schemVsBoard = () => {
  const b = benchSvg({ w: 360, cols: [6, 21], board: { pins: ['D13', 'GND'] }, gapDown: 34, cropTo: 54,
    parts: [{ id: 'r', type: 'resistor', props: { value: 220 }, pin: '1', hole: 'e9' }, { id: 'd', type: 'led', props: { color: 'red' }, pin: 'A', hole: 'c13', mod: ledMod('red') }],
    wires: [{ a: 'R/D13', b: 'B/a9', color: 'green' }, { a: 'B/a14', b: 'B/tn.9', color: 'black' }, { a: 'R/GND', b: 'B/tn.12', color: 'black' }] });
  let s = T(10, 16, 'Schematic: a map of the connections', { size: 10.5, weight: 800 });
  s += R(8, 24, 344, 84, { fill: 'rgba(15,23,43,.9)', stroke: K.line, rx: 12 }) + R(20, 42, 40, 24, { fill: '#008f95', stroke: 'rgba(0,0,0,.4)', rx: 6 }) + T(40, 58, 'D13', { size: 10.5, anchor: 'middle', fill: '#eafcff', weight: 800 }) +
    wr('M60 54 H92') + sch.res(116, 54) + wr('M140 54 H172') + sch.led(196, 54) + wr('M220 54 H252 V78') + sch.gnd(252, 88) + T(116, 78, '220 Ω', { size: 9.5, anchor: 'middle', weight: 700 }) + T(196, 82, 'LED', { size: 9.5, anchor: 'middle', weight: 700 });
  s += T(10, 130, 'Breadboard: the same circuit with real parts', { size: 10.5, weight: 800 });
  s += `<g transform="translate(0 138)">${b.content}</g>`;
  return fig(360, b.h + 144, SHARED + s, 'A schematic is a map of connections; the breadboard picture is the same circuit built with real parts. Follow D13 → resistor → LED → GND in both.');
};

export const pullups = () => {
  const x0s = [6, 126, 246];
  const frame = (x, title, sub) => R(x, 6, 114, 232, { fill: 'rgba(15,23,43,.9)', stroke: K.line, rx: 12 }) + T(x + 57, 24, title, { size: 10.5, anchor: 'middle', weight: 800 }) + T(x + 57, 37, sub, { size: 8.5, anchor: 'middle', fill: K.line });
  const chain = (x, top, mid, bottom, pinLabel = true) => {
    const cx = x + 44;
    return T(cx, 54, '5 V', { size: 9.5, anchor: 'middle', fill: '#fca5a5', weight: 800 }) + wr(`M${cx} 58 V62`, K.err) + top(cx, 86) + wr(`M${cx} 110 V110`) + dot(cx, 110) + wr(`M${cx} 110 H${x + 84}`) + (pinLabel ? T(x + 98, 114, 'pin', { size: 8.5, anchor: 'middle', fill: K.line }) : '') + bottom(cx, 134) + wr(`M${cx} 158 V166`) + sch.gnd(cx, 176);
  };
  const res = (cx, cy) => sch.res(cx, cy, 90);
  const btn = (cx, cy) => sch.sw(cx, cy, 90);
  const res2 = (x, title, sub, top, bottom, a, b, extra = '') => frame(x, title, sub) + chain(x, top, null, bottom) + extra + T(x + 57, 204, a, { size: 9.5, anchor: 'middle', fill: '#93c5fd', weight: 700 }) + T(x + 57, 220, b, { size: 9.5, anchor: 'middle', fill: '#86efac', weight: 700 });
  let s = res2(x0s[0], 'No resistor', 'a floating input', () => `<path d="M${x0s[0] + 44} 62 V110" stroke="${K.dim}" stroke-width="1.4" stroke-dasharray="3 4" fill="none"/>` + T(x0s[0] + 44, 90, '?', { size: 20, anchor: 'middle', weight: 800, fill: K.warn }), btn, 'open: random', 'pressed: LOW');
  s += res2(x0s[1], 'INPUT_PULLUP', 'a resistor inside the chip', res, btn, 'open: HIGH', 'pressed: LOW', `<rect x="${x0s[1] + 20}" y="62" width="48" height="48" rx="8" fill="rgba(0,143,149,.18)" stroke="#008f95" stroke-dasharray="3 3"/>` + T(x0s[1] + 92, 82, 'in the', { size: 8, anchor: 'middle', fill: '#5eead4' }) + T(x0s[1] + 92, 92, 'chip', { size: 8, anchor: 'middle', fill: '#5eead4' }));
  s += res2(x0s[2], 'Pull-down', 'a resistor outside', btn, res, 'open: LOW', 'pressed: HIGH');
  return fig(366, 246, s, 'A button needs a defined level when it is open. INPUT_PULLUP does it for you (button to GND); a pull-down does the opposite (button to 5 V). With neither, the pin floats.');
};

export const voltageDivider = () => {
  let s = T(60, 16, 'two resistors in a row', { size: 10, anchor: 'middle', fill: K.dim, weight: 700 });
  const cx = 72;
  s += T(cx, 36, 'Vin = 9 V', { size: 11, anchor: 'middle', weight: 800, fill: '#fca5a5' }) + wr(`M${cx} 40 V50`, K.err) + sch.res(cx, 76, 90) + T(cx - 20, 80, 'R1', { size: 10.5, anchor: 'end', weight: 800 }) + T(cx + 20, 80, '10 kΩ', { size: 9.5, anchor: 'start', fill: K.line }) +
    wr(`M${cx} 100 V124`) + dot(cx, 124) + wr(`M${cx} 124 H116`) + T(122, 128, 'Vout = 2.9 V', { size: 11, anchor: 'start', weight: 800, fill: K.acc }) + sch.res(cx, 150, 90) + T(cx - 20, 154, 'R2', { size: 10.5, anchor: 'end', weight: 800 }) + T(cx + 20, 154, '4.7 kΩ', { size: 9.5, anchor: 'start', fill: K.line }) + wr(`M${cx} 174 V186`) + sch.gnd(cx, 196);
  // formula
  s += R(206, 20, 146, 196, { fill: 'rgba(15,23,43,.95)', stroke: K.line, rx: 12 }) + T(279, 38, 'Vout = Vin × R2', { size: 10, anchor: 'middle', fill: K.acc, weight: 800, mono: true }) + T(279, 50, '÷ (R1 + R2)', { size: 10, anchor: 'middle', fill: K.acc, weight: 800, mono: true }) +
    T(279, 62, '= 9 V × 4.7 ÷ (10 + 4.7)', { size: 9.3, anchor: 'middle', mono: true }) + T(279, 80, '= 9 V × 0.32', { size: 9.3, anchor: 'middle', mono: true }) + T(279, 98, '≈ 2.9 V', { size: 12, anchor: 'middle', weight: 800, fill: K.ok, mono: true });
  // bars
  s += T(279, 126, 'where the 9 V goes', { size: 9, anchor: 'middle', fill: K.dim, weight: 700 }) + R(224, 134, 110, 16, { fill: K.box, stroke: K.line, rx: 8 }) + `<rect x="224" y="134" width="${f1(110 * 6.1 / 9)}" height="16" rx="8" fill="${K.err}" fill-opacity=".6"/><rect x="${f1(224 + 110 * 6.1 / 9)}" y="134" width="${f1(110 * 2.9 / 9)}" height="16" rx="8" fill="${K.acc}" fill-opacity=".6"/>` +
    T(224 + 110 * 3.05 / 9, 146, 'R1: 6.1 V', { size: 8.5, anchor: 'middle', weight: 700 }) + T(224 + 110 * (6.1 + 1.45) / 9 + 2, 164, 'R2: 2.9 V', { size: 8.5, anchor: 'middle', fill: K.acc, weight: 700 }) +
    T(279, 190, 'Open the example and measure', { size: 9, anchor: 'middle', fill: K.line }) + T(279, 203, 'with the multimeter', { size: 9, anchor: 'middle', fill: K.line });
  return fig(360, 224, s, 'A voltage divider: two resistors share the voltage in proportion to their values. The middle point gives a smaller voltage.');
};

export const potDivider = () => {
  let s = '';
  // potentiometer
  s += T(90, 16, 'Potentiometer', { size: 11, anchor: 'middle', weight: 800 }) + T(90, 30, 'a divider you can turn', { size: 8.5, anchor: 'middle', fill: K.line });
  s += T(54, 52, '5 V', { size: 9.5, anchor: 'middle', fill: '#fca5a5', weight: 800 }) + wr('M54 56 V66', K.err) + sch.res(54, 92, 90) + wr('M54 116 V128') + sch.gnd(54, 138) + wr('M54 92 H0', 'none') + `<path d="M118 92 H68" stroke="${SC}" stroke-width="1.8" fill="none" marker-end="url(#mfa)"/>` + T(124, 88, 'wiper', { size: 9, anchor: 'start', fill: K.acc, weight: 700 }) + T(124, 101, '→ A0', { size: 9.5, anchor: 'start', weight: 800, fill: K.acc });
  s += partIn('potentiometer', 46, 152, 90, 52, {});
  // ldr
  s += T(270, 16, 'Light sensor (LDR)', { size: 11, anchor: 'middle', weight: 800 }) + T(270, 30, 'resistance falls in the light', { size: 8.5, anchor: 'middle', fill: K.line });
  s += T(234, 52, '5 V', { size: 9.5, anchor: 'middle', fill: '#fca5a5', weight: 800 }) + wr('M234 56 V66', K.err) + sch.ldr(234, 92, 90) + wr('M234 116 V132') + dot(234, 132) + wr('M234 132 H290') + T(296, 136, '→ A0', { size: 9.5, anchor: 'start', weight: 800, fill: K.acc }) + sch.res(234, 158, 90) + T(212, 162, '10 kΩ', { size: 9, anchor: 'end', fill: K.line }) + wr('M234 182 V190') + sch.gnd(234, 200);
  s += T(292, 76, 'dark: LDR big', { size: 8.5, anchor: 'start', fill: K.line }) + T(292, 88, '→ A0 low', { size: 8.5, anchor: 'start', fill: '#93c5fd', weight: 700 }) + T(292, 160, 'bright: LDR small', { size: 8.5, anchor: 'start', fill: K.line }) + T(292, 172, '→ A0 high', { size: 8.5, anchor: 'start', fill: '#86efac', weight: 700 });
  return fig(360, 212, SHARED + s, 'Two dividers you will use a lot. Turning the knob moves the middle point; light changes the LDR, so the voltage on A0 follows.');
};

export const pwmAverage = () => {
  const duty = [0, 25, 50, 75, 100];
  let s = SHARED;
  duty.forEach((d, i) => {
    const x = 8 + i * 70, w = 62;
    s += R(x, 6, w, 188, { fill: 'rgba(15,23,43,.9)', stroke: K.line, rx: 10 });
    // waveform
    let p = `M${x + 6} 64`;
    for (let t = 0; t < 4; t++) { const a = x + 6 + t * 12.5, on = 12.5 * d / 100; if (d > 0) p += ` V28 H${f1(a + on)}`; p += ` V64 H${f1(a + 12.5)}`; }
    s += P(p, { stroke: K.warn, sw: 1.8 }) + L(x + 6, 64 - d * 0.36, x + w - 6, 64 - d * 0.36, { stroke: '#fff', sw: 1, dash: '2 3' });
    s += T(x + w / 2, 20, `${d} %`, { size: 11, anchor: 'middle', weight: 800, fill: K.warn });
    s += `<g>${partIn('led', x + 14, 80, 34, 56, { color: 'red' }, 0, d === 0 ? null : ledMod('red', 'on', Math.min(0.95, 0.15 + d / 120)))}</g>`;
    s += T(x + w / 2, 156, `${(5 * d / 100).toFixed(2).replace(/\.?0+$/, '')} V`, { size: 10, anchor: 'middle', weight: 800, fill: K.ink }) + T(x + w / 2, 169, 'average', { size: 8, anchor: 'middle', fill: K.dim }) + T(x + w / 2, 185, `value ${Math.round(d * 2.55)}`, { size: 7.6, anchor: 'middle', fill: K.line, mono: true });
  });
  return fig(360, 204, s, 'PWM at five settings. The longer the pin stays HIGH, the higher the average voltage and the brighter the LED (a value of 128 is about 50 %).');
};

export const burnTimeline = () => {
  const stage = (x, mod, label, sub, c, extra = '') => R(x, 6, 82, 154, { fill: 'rgba(15,23,43,.9)', stroke: c, rx: 12 }) + `<g>${partIn('led', x + 20, 24, 42, 66, { color: 'red' }, 0, mod)}</g>` + extra + T(x + 41, 112, label, { size: 10, anchor: 'middle', weight: 800, fill: c }) + T(x + 41, 126, sub[0], { size: 8.2, anchor: 'middle', fill: K.line }) + T(x + 41, 138, sub[1], { size: 8.2, anchor: 'middle', fill: K.line }) + T(x + 41, 150, sub[2] || '', { size: 8.2, anchor: 'middle', fill: K.line });
  const smoke = (x) => [0, 1, 2].map((i) => `<circle cx="${x + 41 + (i - 1) * 7}" cy="${22 - i * 6}" r="${5 + i * 1.5}" fill="#9aa0a6" opacity="${0.5 - i * 0.12}"/>`).join('');
  let s = SHARED + stage(6, ledMod('red', 'on', 0.8), '① glows', ['normal brightness', 'about 12 mA', 'for ever'], K.ok) + stage(94, ledMod('red', 'on', 1), '② glares', ['too much current', 'white-hot core', 'a few seconds'], K.warn) +
    stage(182, null, '③ flash', ['it pops!', 'a pop sound', 'at 2.3 s'], K.err, `<circle cx="${182 + 41}" cy="46" r="26" fill="#fff6d0" opacity=".85"/>`) + stage(270, ledMod('red', 'burnt'), '④ burnt', ['black, smoke', 'a scorch mark', 'dead for the run'], K.dim, `<g transform="translate(0 0)">${smoke(270)}</g>`);
  s += AR(90, 82, 96, 82) + AR(178, 82, 184, 82) + AR(266, 82, 272, 82);
  s += R(8, 168, 344, 26, { fill: 'rgba(245,158,11,.1)', stroke: 'rgba(245,158,11,.35)', rx: 10 }) + T(180, 185, 'Press Stop and Run again: a fresh LED is fitted.', { size: 10, anchor: 'middle', fill: '#fcd34d', weight: 600 });
  return fig(360, 202, s, 'What happens to an LED wired straight to a pin (about 91 mA): it glares, flashes, smokes and stays black — all within about three seconds.');
};

export const burnChart = () => {
  const x0 = 50, x1 = 346, y0 = 14, y1 = 168;
  const tMin = 0.001, tMax = 36000;
  const mA = (v) => x0 + ((Math.log10(v) - 1) / (Math.log10(400) - 1)) * (x1 - x0);
  const sec = (t) => y1 - ((Math.log10(Math.min(tMax, Math.max(tMin, t))) - Math.log10(tMin)) / (Math.log10(tMax) - Math.log10(tMin))) * (y1 - y0);
  let s = '';
  for (const [t, n] of [[0.001, '1 ms'], [1, '1 s'], [60, '1 min'], [3600, '1 h']]) s += L(x0, sec(t), x1, sec(t), { stroke: 'rgba(148,163,184,.18)', sw: 1 }) + T(x0 - 6, sec(t) + 3, n, { size: 8.5, anchor: 'end', fill: K.line });
  for (const v of [10, 20, 40, 100, 300]) s += L(mA(v), y1, mA(v), y1 + 4, { stroke: K.line }) + T(mA(v), y1 + 15, `${v}`, { size: 8.5, anchor: 'middle', fill: K.line });
  let d = '';
  for (let i = 12; i <= 400; i += 4) { const t = 1 / ledStress(i / 1000); if (!isFinite(t)) continue; d += `${d ? ' L' : 'M'}${f1(mA(i))} ${f1(sec(t))}`; }
  s += P(d, { stroke: K.err, sw: 2.4 }) + T(x1, y1 + 29, 'current through the LED (mA)', { size: 9, anchor: 'end', fill: K.dim }) + T(x0, 9, 'time until it burns', { size: 9, fill: K.dim });
  s += L(mA(40), y0, mA(40), y1, { stroke: K.warn, sw: 1.4, dash: '4 3' }) + T(mA(40) - 4, y1 - 6, 'pin limit 40 mA', { size: 8.5, anchor: 'end', fill: K.warn });
  const pts = [[20, K.ok, '20 mA: lasts an hour or more'], [60, K.warn, '60 mA: about 20 s'], [91, K.err, '91 mA: about 2 s (no resistor)'], [300, K.err, '300 mA: milliseconds (across 5 V)']];
  pts.forEach(([v, c, t], i) => {
    const px = mA(v), py = sec(1 / ledStress(v / 1000));
    s += `<circle cx="${f1(px)}" cy="${f1(py)}" r="5" fill="${c}" stroke="#0a1226" stroke-width="1.2"/>` + T(px, py + 3, String(i + 1), { size: 7.5, anchor: 'middle', fill: '#04121a', weight: 800 });
    s += `<circle cx="${x0 + 124}" cy="${28 + i * 16}" r="5.5" fill="${c}"/>` + T(x0 + 124, 31 + i * 16, String(i + 1), { size: 7.5, anchor: 'middle', fill: '#04121a', weight: 800 }) + T(x0 + 134, 31 + i * 16, t, { size: 8.6, fill: K.ink });
  });
  return fig(360, 206, s, 'How long an LED lasts at a given current, from the app\'s wear model (both axes are logarithmic). A resistor keeps the current far below the curve.');
};

/** Break a text into lines of at most n characters (at spaces). */
export function wrapText(text, n) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(' ')) {
    if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}
export const etiquette = () => {
  const items = [
    ['power', 'Stop before you wire', 'Edit the circuit only while the simulation is stopped.', K.ok],
    ['plug', 'Power rails first', 'Red wire to +, black wire to −, then the parts.', K.err],
    ['bolt', 'One ground for all', 'Every supply and the board share GND.', K.blue],
    ['resistor', 'Legs in different strips', 'Both legs in one strip means a short.', K.warn],
    ['wire', 'Short, tidy wires', 'One colour per job, easy to follow.', K.vio],
    ['warning', '3.3 V pins hate 5 V', 'On an ESP32 never feed 5 V into a pin.', '#fb7185'],
  ];
  let s = '';
  items.forEach(([ic, a, b, c], i) => {
    const x = 8 + (i % 2) * 174, y = 8 + Math.floor(i / 2) * 74;
    s += R(x, y, 166, 66, { fill: 'rgba(15,23,43,.9)', stroke: c, rx: 12, sw: 1.2 }) + `<circle cx="${x + 24}" cy="${y + 33}" r="14" fill="${c}" fill-opacity=".16"/>` + ico(ic, x + 15, y + 24, 18, c) + T(x + 46, y + 25, a, { size: 10, weight: 800 });
    wrapText(b, 26).forEach((ln, k) => { s += T(x + 46, y + 40 + k * 11, ln, { size: 8.4, fill: K.line }); });
  });
  return fig(360, 232, s, 'Six habits of a tidy breadboard. They save more time than any trick.');
};
// ---------------------------------------------------------------------------------------------- projects
/** Id of the rail hole of `which` ('tp' 'tn' 'bp' 'bn') that lies at breadboard column `col` (half and full boards). */
export function railId(which, col) {
  let i = col - 3;
  if (i < 0) i = 0;
  if (i % 6 === 5) i -= 1;
  let k = 0;
  for (let j = 0; j <= i; j++) if (j % 6 !== 5) k++;
  return `${which}.${k}`;
}
/** The wiring pictures of a project: `defs` say, for each picture, what is shown (cumulative lists written out). */
export const wiringSteps = (base, defs) => defs.map((d) => bench({ ...base, show: d.show, showWires: d.wires, hi: d.hi, bands: d.bands, rings: d.rings, tags: d.tags, over: d.over, cap: d.cap }));

/** An example circuit of the app, cropped to a rectangle of its world, as a picture of the given width. */
export function exampleView(id, { crop, w = 360, hide = [], mods = {}, over, cap = '' } = {}) {
  const sc = projectScene(id, { hide, mods });
  const [x0, y0, x1, y1] = crop || sc.box;
  const k = w / (x1 - x0), h = Math.round((y1 - y0) * k);
  const cid = 'ardClip' + (++clipCount);
  const inner = `<defs>${SHARED_DEFS}<clipPath id="${cid}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/></clipPath></defs><g transform="scale(${k.toFixed(4)}) translate(${-x0} ${-y0})"><g clip-path="url(#${cid})">${sc.svg}</g>${over ? over({ k, x0, y0 }) : ''}</g>`;
  return fig(w, h, inner, cap);
}

/** The real Uno with its "L" LED lit (pin 13), and a pointer to it. */
export const unoBlink = () => {
  const k = 1.3;
  const [lx, ly] = [128, 54];
  let s = SHARED + `<g transform="translate(14 8) scale(${k})">${partSvg(mkPart('uno-r3', 0, 0), unoLit)}</g>`;
  const px = 14 + lx * k, py = 8 + ly * k;
  s += `<circle cx="${px}" cy="${py}" r="11" fill="none" stroke="${K.acc}" stroke-width="1.6"/>` + L(px + 11, py, 292, py, { stroke: K.acc, sw: 1.2 }) + R(292, py - 25, 62, 50, { fill: 'rgba(8,47,73,.9)', stroke: K.acc, rx: 8 }) + T(323, py - 8, 'LED "L"', { size: 9.5, anchor: 'middle', fill: '#dff9ff', weight: 800 }) + T(323, py + 5, 'is wired to', { size: 8.5, anchor: 'middle', fill: K.line }) + T(323, py + 18, 'pin 13', { size: 10, anchor: 'middle', fill: K.ok, weight: 800 });
  s += BADGE(14 + 124 * k, 8 + 10 * k - 12, 1);
  s += T(14 + 124 * k + 14, 8 + 10 * k - 9, 'pin 13', { size: 9, fill: K.ok, weight: 700 });
  return fig(372, 292, s, 'The Uno has a small LED next to pin 13 on the board itself, marked L. Blink needs no wires at all.');
};
export const holeNames = () => bench({
  cols: [4, 24], board: { pins: ['D13'] }, gapDown: 30, cropTo: 46,
  wires: [{ a: 'R/D13', b: 'B/a10', color: 'green' }], rings: ['B/e14'],
  bands: [10], badges: [{ at: 'B/a10', n: 1, dx: 17, dy: 2 }, { at: 'B/e14', n: 2, dx: 17, dy: 0 }],
  over: ({ s, holeW, rowA, stripX, yStripBot }) => {
    const [x10] = holeW('a10'), [xa] = holeW('a4');
    return pill(x10 + 20 / s, rowA - 17 / s, 'column 10', { s, color: K.acc }) + pill(xa + 6, rowA + 11 / s - 4, 'row a', { s, color: K.acc }) + pill(xa + 6, rowA + 38, 'row e', { s, color: K.acc }) +
      pill(holeW('e14')[0] + 4, rowA + 66, 'hole e14', { s, color: K.warn });
  },
  cap: 'How the projects name holes: a letter for the row (a – e at the top, f – j below the channel) and a number for the column. ① is hole a10, ② is e14.',
});

export const buttonStates = () => {
  const panel = (x, title, pressed) => {
    let s = R(x, 6, 170, 190, { fill: 'rgba(15,23,43,.9)', stroke: pressed ? K.ok : K.line, rx: 12 }) + T(x + 85, 24, title, { size: 11, anchor: 'middle', weight: 800, fill: pressed ? K.ok : K.ink });
    const cx = x + 60;
    s += T(cx, 46, '5 V', { size: 9.5, anchor: 'middle', fill: '#fca5a5', weight: 800 }) + wr(`M${cx} 50 V54`, K.err) + sch.res(cx, 76, 90) + T(cx - 16, 80, 'pull-up', { size: 8, anchor: 'end', fill: K.line }) + wr(`M${cx} 100 V104`) + dot(cx, 104) + wr(`M${cx} 104 H${x + 120}`) + T(x + 144, 108, 'pin D2', { size: 9, anchor: 'middle', weight: 700, fill: K.acc });
    // button: closed when pressed
    const by = 128;
    s += wr(`M${cx} 104 V${by - 24}`) + (pressed ? `<g transform="translate(${cx} ${by}) rotate(90)" fill="none" stroke="${K.ok}" stroke-width="2.4" stroke-linecap="round"><path d="M-24 0 H24 M0 -16 V-6 M-7 -16 H7"/></g>` : sch.sw(cx, by, 90)) + wr(`M${cx} ${by + 24} V${by + 32}`) + sch.gnd(cx, by + 42);
    s += T(x + 85, 190, pressed ? 'reads LOW → LED on' : 'reads HIGH → LED off', { size: 10, anchor: 'middle', weight: 800, fill: pressed ? '#86efac' : K.line });
    return s;
  };
  return fig(360, 204, panel(6, 'Released', false) + panel(184, 'Pressed', true), 'With INPUT_PULLUP the pin is held HIGH by a resistor inside the chip. Pressing the button connects the pin to GND and the pin reads LOW.');
};

export const blinkTiming = () => {
  const x0 = 40, sc = 80;
  let s = T(10, 16, 'pin 13', { size: 10, weight: 800, fill: K.dim }) + T(34, 36, 'HIGH', { size: 8.5, anchor: 'end', fill: K.ok }) + T(34, 76, 'LOW', { size: 8.5, anchor: 'end', fill: K.line });
  s += P(`M${x0} 72 V32 H${x0 + sc} V72 H${x0 + 2 * sc} V32 H${x0 + 3 * sc} V72 H${x0 + 3.8 * sc}`, { stroke: K.ok, sw: 2.4 });
  for (let t = 0; t <= 3; t++) s += L(x0 + t * sc, 22, x0 + t * sc, 88, { stroke: 'rgba(148,163,184,.2)', sw: 1 }) + T(x0 + t * sc, 102, `${t} s`, { size: 9, anchor: 'middle', fill: K.dim });
  s += R(x0, 110, sc, 18, { fill: 'rgba(74,222,128,.2)', stroke: K.ok, rx: 6 }) + T(x0 + sc / 2, 123, 'LED on', { size: 9, anchor: 'middle', fill: '#86efac', weight: 700 }) + R(x0 + sc, 110, sc, 18, { fill: 'rgba(148,163,184,.12)', stroke: K.dim, rx: 6 }) + T(x0 + sc * 1.5, 123, 'off', { size: 9, anchor: 'middle', fill: K.line, weight: 700 }) + R(x0 + 2 * sc, 110, sc, 18, { fill: 'rgba(74,222,128,.2)', stroke: K.ok, rx: 6 }) + T(x0 + sc * 2.5, 123, 'LED on', { size: 9, anchor: 'middle', fill: '#86efac', weight: 700 });
  s += T(x0 + sc * 0.5, 22, 'delay(1000)', { size: 8.5, anchor: 'middle', fill: K.warn }) + T(x0 + sc * 1.5, 22, 'delay(1000)', { size: 8.5, anchor: 'middle', fill: K.warn });
  return fig(340, 138, s, 'The pin of the Blink sketch: one second HIGH, one second LOW, for ever. Change the numbers in delay() and the rhythm changes.');
};

export const trafficTiming = () => {
  const x0 = 50, u = 36;           // 36 px per second
  const lane = (y, c, name, a, b) => T(10, y + 13, name, { size: 10, weight: 800, fill: c }) + R(x0, y, 8 * u, 18, { fill: 'rgba(148,163,184,.08)', stroke: 'rgba(148,163,184,.2)', rx: 4 }) + R(x0 + a * u, y, (b - a) * u, 18, { fill: c, stroke: 'none', rx: 4 }).replace('fill="' + c + '"', `fill="${c}" fill-opacity=".7"`);
  let s = lane(10, K.err, 'RED', 0, 3) + lane(36, K.ok, 'GREEN', 3, 6) + lane(62, K.warn, 'YELLOW', 6, 7);
  for (let t = 0; t <= 7; t++) s += L(x0 + t * u, 6, x0 + t * u, 86, { stroke: 'rgba(148,163,184,.15)', sw: 1 }) + T(x0 + t * u, 100, `${t}`, { size: 8.5, anchor: 'middle', fill: K.dim });
  s += T(x0 + 7.4 * u, 100, 's', { size: 8.5, fill: K.dim }) + T(x0 + 3.5 * u, 118, 'STOP 3 s  ·  GO 3 s  ·  WAIT 1 s  ·  then again', { size: 9.5, anchor: 'middle', fill: K.line });
  return fig(360, 126, s, 'The sequence of the traffic light. Only one lamp is on at any moment.');
};

export const rgbMix = () => {
  const c = (x, y, col) => `<circle cx="${x}" cy="${y}" r="38" fill="${col}" style="mix-blend-mode:screen" opacity=".9"/>`;
  let s = `<rect x="8" y="8" width="170" height="150" rx="12" fill="#05070d"/>` + c(66, 62, '#ff0000') + c(112, 62, '#00ff00') + c(89, 100, '#0000ff') +
    T(40, 40, 'R', { size: 12, weight: 800, fill: '#fff' }) + T(138, 40, 'G', { size: 12, weight: 800, fill: '#fff' }) + T(89, 138, 'B', { size: 12, weight: 800, fill: '#fff' }) + T(89, 86, 'white', { size: 8.5, anchor: 'middle', fill: '#111', weight: 800 });
  s += T(196, 30, 'setColor(r, g, b)', { size: 10.5, weight: 800, mono: true }) + [['255, 0, 0', 'red', '#ff3030'], ['0, 255, 0', 'green', '#34ff6a'], ['0, 0, 255', 'blue', '#4d9bff'], ['255, 255, 0', 'yellow', '#ffe83a'], ['255, 0, 255', 'magenta', '#e879f9'], ['0, 255, 255', 'cyan', '#22d3ee'], ['255, 255, 255', 'white', '#ffffff']].map(([v, n, col], i) => `<circle cx="204" cy="${50 + i * 16}" r="5" fill="${col}"/>` + T(216, 53 + i * 16, v, { size: 9.2, mono: true }) + T(310, 53 + i * 16, n, { size: 9, fill: K.line })).join('');
  return fig(360, 168, s, 'Light mixes by addition. Three PWM values (0 … 255 each) give any colour.');
};
// @@END
