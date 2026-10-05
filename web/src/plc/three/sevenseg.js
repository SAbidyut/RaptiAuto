// 7-segment LED renderer (VFD keypad display).
//   a
//  f b
//   g
//  e c
//   d
const SEG = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  A: 'abcefg', a: 'abcefg', b: 'cdefg', B: 'cdefg', C: 'adef', c: 'deg', d: 'bcdeg', D: 'bcdeg', E: 'adefg', e: 'adefg', F: 'aefg', f: 'aefg',
  G: 'acdef', g: 'abcdfg', H: 'bcefg', h: 'cefg', I: 'ef', i: 'e', J: 'bcde', j: 'bcd', L: 'def', l: 'ef', n: 'ceg', N: 'abcef', o: 'cdeg', O: 'abcdef',
  P: 'abefg', p: 'abefg', q: 'abcfg', r: 'eg', R: 'eg', S: 'acdfg', s: 'acdfg', t: 'defg', T: 'defg', U: 'bcdef', u: 'cde', v: 'cde', V: 'bcdef', y: 'bcdfg', Y: 'bcdfg',
  '-': 'g', '_': 'd', ' ': '', '°': 'abfg',
};

/** Split "50.00" into [{ch:'5'},{ch:'0',dp:true},…] right-aligned to n digits. */
export function segCells(text, n = 5) {
  const cells = [];
  for (const ch of String(text)) {
    if (ch === '.' && cells.length) { cells[cells.length - 1].dp = true; continue; }
    cells.push({ ch, dp: false });
  }
  while (cells.length > n) cells.shift();
  while (cells.length < n) cells.unshift({ ch: ' ', dp: false });
  return cells;
}

export function drawSeg(g, x, y, w, h, cell, on = '#ff3b2f', off = 'rgba(255,60,40,.07)') {
  const segs = SEG[cell.ch] ?? '';
  const t = w * 0.17, sk = w * 0.12; // thickness, skew
  const P = (px, py) => [x + px + sk * (1 - py / h), y + py];
  const H = (y0, x0, x1) => [P(x0 + t / 2, y0), P(x0 + t, y0 - t / 2), P(x1 - t, y0 - t / 2), P(x1 - t / 2, y0), P(x1 - t, y0 + t / 2), P(x0 + t, y0 + t / 2)];
  const V = (x0, y0, y1) => [P(x0, y0 + t / 2), P(x0 + t / 2, y0 + t), P(x0 + t / 2, y1 - t), P(x0, y1 - t / 2), P(x0 - t / 2, y1 - t), P(x0 - t / 2, y0 + t)];
  const m = h / 2;
  const shapes = {
    a: H(t / 2, 0, w), g: H(m, 0, w), d: H(h - t / 2, 0, w),
    f: V(t / 2, 0, m), b: V(w - t / 2, 0, m), e: V(t / 2, m, h), c: V(w - t / 2, m, h),
  };
  for (const [k, pts] of Object.entries(shapes)) {
    const lit = segs.includes(k);
    g.fillStyle = lit ? on : off;
    if (lit) { g.shadowColor = on; g.shadowBlur = w * 0.35; } else g.shadowBlur = 0;
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.closePath();
    g.fill();
  }
  g.shadowBlur = cell.dp ? w * 0.35 : 0;
  g.fillStyle = cell.dp ? on : off;
  g.beginPath();
  g.arc(x + w + t * 0.55, y + h - t * 0.5, t * 0.55, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
}

/** Full display: n digits filling the canvas area. */
export function drawSegDisplay(g, W, H, text, { n = 5, on = '#ff3b2f', off = 'rgba(255,60,40,.08)', cursor = -1, blink = false } = {}) {
  const cells = segCells(text, n);
  const pad = H * 0.16;
  const cw = (W - pad * 2) / n;
  const dw = cw * 0.62, dh = H - pad * 2;
  cells.forEach((c, i) => {
    const x = pad + i * cw + (cw - dw) / 2 - cw * 0.06;
    drawSeg(g, x, pad, dw, dh, c, on, off);
    if (cursor >= 0 && n - 1 - i === cursor && blink) {
      g.fillStyle = on;
      g.fillRect(x, H - pad * 0.55, dw, pad * 0.25);
    }
  });
}
