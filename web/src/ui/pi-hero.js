// The picture of the Raspberry Pi Lab (home banner and the top of the Pi page): the real Pi 5 board
// drawing seen at an angle, two jumper wires from GPIO17 / GND to a small breadboard whose LED blinks,
// and the Thonny window with the three lines of Python that blink it.
import { boardSVG, piPinXY } from '../pi/boards.js';

const W = 400, H = 190;
const deg = Math.PI / 180;
/** Affine "seen from above at an angle": rotate by `rot`, squash the height by `k`, scale `s`, move to (e, f). */
function view(rot, k, s, e, f) {
  const c = Math.cos(rot * deg), si = Math.sin(rot * deg);
  const m = [s * c, s * k * si, -s * si, s * k * c, e, f];
  return { m, p: (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]], attr: `matrix(${m.map((v) => +v.toFixed(4)).join(' ')})` };
}
const f1 = (v) => +v.toFixed(1);
const pts = (list) => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');

let seq = 0;
export function piHeroArt() {
  const id = 'ph' + (++seq) + '-';
  // the Pi 5 (850 × 560 board units)
  const B = view(24, 0.6, 0.27, 168, 26);
  const corners = [[0, 0], [850, 0], [850, 560], [0, 560]].map(([x, y]) => B.p(x, y));
  const side = corners.map(([x, y]) => [x, y + 6]);
  // the breadboard (300 × 120 units) behind it, on the left
  const P = view(24, 0.6, 0.36, 30, 20);
  const bb = [[0, 0], [300, 0], [300, 120], [0, 120]].map(([x, y]) => P.p(x, y));
  const holes = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 26; c++) holes.push(P.p(14 + c * 10.8, 30 + r * 10.5));
  for (let c = 0; c < 26; c++) { holes.push(P.p(14 + c * 10.8, 10)); holes.push(P.p(14 + c * 10.8, 108)); }
  const railA = [P.p(8, 4), P.p(292, 4)], railB = [P.p(8, 116), P.p(292, 116)];
  // LED (anode / cathode holes), resistor, and the two header pins
  const ledA = P.p(176, 51), ledK = P.p(186.8, 51);
  const resA = P.p(111, 72), resB = P.p(165, 72);
  const g17 = B.p(piPinXY(11).x, piPinXY(11).y), gnd = B.p(piPinXY(9).x, piPinXY(9).y);
  const end17 = P.p(100, 72), endG = P.p(197.6, 61.5);
  const arc = (a, b, lift) => `M${f1(a[0])} ${f1(a[1])} C${f1(a[0])} ${f1(a[1] - lift)} ${f1(b[0])} ${f1(b[1] - lift)} ${f1(b[0])} ${f1(b[1])}`;
  const wire = (a, b, lift, col) => `<path d="${arc(a, b, lift)}" stroke="#020617" stroke-width="4.6" fill="none" stroke-linecap="round" opacity=".55"/><path d="${arc(a, b, lift)}" stroke="${col}" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="${f1(a[0])}" cy="${f1(a[1])}" r="2.4" fill="${col}"/>`;
  // the LED standing in its holes
  const lx = (ledA[0] + ledK[0]) / 2, ly = Math.min(ledA[1], ledK[1]) - 13;
  const board = boardSVG('pi5', id).replace('<svg ', '<svg x="-30" y="-20" width="930" height="610" ');
  const code = [
    [['#c084fc', 'from'], ['#e2e8f0', ' gpiozero '], ['#c084fc', 'import'], ['#22d3ee', ' LED']],
    [['#e2e8f0', 'led = '], ['#22d3ee', 'LED'], ['#e2e8f0', '('], ['#fbbf24', '17'], ['#e2e8f0', ')']],
    [['#e2e8f0', 'led.'], ['#4ade80', 'blink'], ['#e2e8f0', '()']],
  ];
  const codeText = code.map((line, i) => `<text x="22" y="${139 + i * 11}" class="pih-code">${line.map(([c, t]) => `<tspan fill="${c}">${t.replace(/ /g, '&#160;')}</tspan>`).join('')}</text>`).join('');
  return `<svg class="pi-hero" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Raspberry Pi 5 with an LED on a breadboard and Python code">
  <defs>
    <radialGradient id="${id}g1"><stop offset="0" stop-color="#22c55e" stop-opacity=".28"/><stop offset="1" stop-color="#22c55e" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}g2"><stop offset="0" stop-color="#e11d48" stop-opacity=".3"/><stop offset="1" stop-color="#e11d48" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}led" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff6b6b" stop-opacity=".95"/><stop offset=".4" stop-color="#ef4444" stop-opacity=".45"/><stop offset="1" stop-color="#ef4444" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}dome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a8a"/><stop offset="1" stop-color="#b91c1c"/></linearGradient>
    <filter id="${id}sh" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>
  <ellipse cx="280" cy="100" rx="120" ry="80" fill="url(#${id}g1)"/><ellipse cx="80" cy="45" rx="90" ry="60" fill="url(#${id}g2)"/>
  <!-- breadboard -->
  <polygon points="${pts(bb.map(([x, y]) => [x, y + 3]))}" fill="#9ca3af"/>
  <polygon points="${pts(bb)}" fill="#f1f5f9" stroke="#cbd5e1" stroke-width=".6"/>
  <line x1="${f1(railA[0][0])}" y1="${f1(railA[0][1])}" x2="${f1(railA[1][0])}" y2="${f1(railA[1][1])}" stroke="#ef4444" stroke-width=".8"/>
  <line x1="${f1(railB[0][0])}" y1="${f1(railB[0][1])}" x2="${f1(railB[1][0])}" y2="${f1(railB[1][1])}" stroke="#3b82f6" stroke-width=".8"/>
  <g fill="#475569">${holes.map(([x, y]) => `<rect x="${f1(x - 0.9)}" y="${f1(y - 0.6)}" width="1.8" height="1.2" rx=".3"/>`).join('')}</g>
  <!-- resistor -->
  <path d="M${f1(resA[0])} ${f1(resA[1])} L${f1(resA[0])} ${f1(resA[1] - 4)} L${f1(resB[0])} ${f1(resB[1] - 4)} L${f1(resB[0])} ${f1(resB[1])}" stroke="#94a3b8" stroke-width="1" fill="none"/>
  <g transform="translate(${f1((resA[0] + resB[0]) / 2)} ${f1((resA[1] + resB[1]) / 2 - 4)}) rotate(${f1(Math.atan2(resB[1] - resA[1], resB[0] - resA[0]) / deg)})"><rect x="-8" y="-2.6" width="16" height="5.2" rx="2.4" fill="#e8c9a0"/><rect x="-5" y="-2.6" width="1.6" height="5.2" fill="#a16207"/><rect x="-1.5" y="-2.6" width="1.6" height="5.2" fill="#111"/><rect x="2" y="-2.6" width="1.6" height="5.2" fill="#a16207"/><rect x="5.2" y="-2.6" width="1" height="5.2" fill="#d4a017"/></g>
  <!-- LED -->
  <line x1="${f1(ledA[0])}" y1="${f1(ledA[1])}" x2="${f1(lx - 1.5)}" y2="${f1(ly + 7)}" stroke="#cbd5e1" stroke-width="1"/>
  <line x1="${f1(ledK[0])}" y1="${f1(ledK[1])}" x2="${f1(lx + 1.5)}" y2="${f1(ly + 7)}" stroke="#cbd5e1" stroke-width="1"/>
  <circle class="pih-glow" cx="${f1(lx)}" cy="${f1(ly)}" r="20" fill="url(#${id}led)"/>
  <path d="M${f1(lx - 4.5)} ${f1(ly + 7)} V${f1(ly)} a4.5 4.5 0 0 1 9 0 V${f1(ly + 7)} z" fill="url(#${id}dome)"/>
  <rect x="${f1(lx - 5.5)}" y="${f1(ly + 6.5)}" width="11" height="2" rx=".8" fill="#b91c1c"/>
  <ellipse class="pih-hot" cx="${f1(lx - 1.2)}" cy="${f1(ly - 1.5)}" rx="1.6" ry="2.4" fill="#fff" opacity=".85"/>
  <!-- the Pi 5 -->
  <ellipse cx="${f1((corners[0][0] + corners[2][0]) / 2)}" cy="${f1((corners[0][1] + corners[2][1]) / 2 + 22)}" rx="128" ry="34" fill="#000" opacity=".45" filter="url(#${id}sh)"/>
  <polygon points="${pts([corners[3], corners[2], corners[1], side[1], side[2], side[3]])}" fill="#0b3d1f"/>
  <g transform="${B.attr}">${board}</g>
  <!-- jumper wires: GPIO17 → resistor, GND → LED cathode -->
  ${wire(g17, end17, 34, '#f97316')}
  ${wire(gnd, endG, 22, '#64748b')}
  <g class="pih-tag" transform="translate(${f1(g17[0] - 2)} ${f1(g17[1] - 30)})"><rect x="-23" y="-8" width="46" height="14" rx="7" fill="#0f172a" stroke="#f97316" stroke-width=".8"/><text x="0" y="2.2" text-anchor="middle" class="pih-pin">GPIO 17</text></g>
  <!-- Thonny -->
  <g transform="translate(10 108)">
    <rect x="0" y="0" width="150" height="70" rx="9" fill="#0b1222" stroke="#334155" stroke-width=".8" opacity=".97"/>
    <path d="M0 9 a9 9 0 0 1 9 -9 H141 a9 9 0 0 1 9 9 V13 H0 z" fill="#1e293b"/>
    <circle cx="9" cy="7" r="2.2" fill="#f87171"/><circle cx="16" cy="7" r="2.2" fill="#fbbf24"/><circle cx="23" cy="7" r="2.2" fill="#4ade80"/>
    <text x="75" y="9.6" text-anchor="middle" class="pih-title">blink.py — Thonny</text>
    <g fill="#475569" class="pih-ln"><text x="6" y="31">1</text><text x="6" y="42">2</text><text x="6" y="53">3</text></g>
    <g transform="translate(-10 -108)">${codeText}</g>
    <rect class="pih-caret" x="${f1(12 + 11 * 4.95)}" y="47" width="1.2" height="8" fill="#e2e8f0"/>
    <rect x="108" y="56" width="36" height="10" rx="5" fill="#16a34a"/><text x="126" y="63.2" text-anchor="middle" class="pih-run">▶ Run</text>
  </g>
</svg>`;
}
