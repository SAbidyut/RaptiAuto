// Pictures of chapter P4: Thonny, running a file, the Output / Shell, errors, Python basics, MicroPython on the Pico.
import { K, T, R, L, P, AR, DOT, BADGE, fig, WC } from './art-pi-kit.js';
import { UI, placeScreen, screenThonny, screenOutput } from './art-pi-screens.js';

const CK = { kw: '#c792ea', fn: '#82aaff', num: '#f78c6c', str: '#c3e88d', cm: '#66789c', tx: '#e2e8f0', cls: '#ffcb6b' };
/** A line of coloured code text: parts = [[text, colour]…]. */
export const codeLine = (x, y, parts, size = 10) => { let cx = x, s = ''; for (const [t, c] of parts) { s += `<text x="${cx.toFixed(1)}" y="${y}" font-size="${size}" fill="${c}" font-family="JetBrains Mono, ui-monospace, monospace" xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`; cx += t.length * size * 0.6; } return s; };
const win = (x, y, w, h, title, c = '#475569') => R(x, y, w, h, { fill: '#0b1226', stroke: c, rx: 8 }) + `<rect x="${x}" y="${y}" width="${w}" height="16" rx="8" fill="#14213f"/><rect x="${x}" y="${y + 8}" width="${w}" height="8" fill="#14213f"/>` + T(x + 10, y + 11.5, title, { size: 8.6, fill: '#cbd5e1', weight: 700 });
const box = (x, y, w, h, t, sub, c = K.line, fill = K.box) => R(x, y, w, h, { fill, stroke: c, rx: 9 }) + T(x + w / 2, y + (sub ? h / 2 - 1 : h / 2 + 4), t, { size: 10.5, anchor: 'middle', weight: 800 }) + (sub ? T(x + w / 2, y + h / 2 + 12, sub, { size: 8.4, anchor: 'middle', fill: '#94a3b8' }) : '');
const diamond = (cx, cy, w, h, t, c = K.warn) => `<path d="M${cx} ${cy - h / 2} L${cx + w / 2} ${cy} L${cx} ${cy + h / 2} L${cx - w / 2} ${cy}z" fill="${K.box}" stroke="${c}" stroke-width="1.4"/>` + T(cx, cy + 3.5, t, { size: 9.6, anchor: 'middle', weight: 700 });

export function heroPython() {
  let s = `<defs><linearGradient id="hg4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14264a"/><stop offset="1" stop-color="#1b1442"/></linearGradient></defs><rect x="4" y="4" width="352" height="212" rx="18" fill="url(#hg4)" stroke="#1e3a5f"/>`;
  s += T(180, 30, 'Write it. Run it. See it.', { size: 18, anchor: 'middle', weight: 800 });
  s += win(18, 44, 170, 130, 'Thonny — blink.py');
  const ln = [[['from ', CK.kw], ['gpiozero ', CK.tx], ['import ', CK.kw], ['LED', CK.cls]], [['from ', CK.kw], ['time ', CK.tx], ['import ', CK.kw], ['sleep', CK.fn]], [['', '']], [['led = ', CK.tx], ['LED', CK.cls], ['(', CK.tx], ['17', CK.num], [')', CK.tx]], [['', '']], [['while ', CK.kw], ['True', CK.num], [':', CK.tx]], [['    led', CK.tx], ['.on', CK.fn], ['()', CK.tx]], [['    sleep', CK.fn], ['(', CK.tx], ['0.5', CK.num], [')', CK.tx]], [['    led', CK.tx], ['.off', CK.fn], ['()', CK.tx]]];
  ln.forEach((l, i) => { s += codeLine(28, 70 + i * 11.4, l.filter((p) => p[0]), 8.6); });
  s += `<circle cx="204" cy="109" r="14" fill="#22c55e"/>` + P('M199 102 L199 116 L211 109z', { fill: '#fff', stroke: '#fff', sw: 1 }) + AR(222, 109, 238, 109, { m: 'mfb', stroke: K.acc });
  s += win(244, 44, 98, 62, 'Output', '#475569') + T(252, 70, '%Run blink.py', { size: 7.6, fill: '#a78bfa', mono: true }) + T(252, 82, 'LED on', { size: 7.6, fill: CK.tx, mono: true }) + T(252, 94, 'LED off', { size: 7.6, fill: CK.tx, mono: true });
  s += `<circle cx="293" cy="150" r="20" fill="#ef4444" fill-opacity=".25"/><circle cx="293" cy="150" r="11" fill="#ef4444"/>` + T(293, 186, 'the LED really lights', { size: 9, anchor: 'middle', fill: '#fca5a5', weight: 700 });
  s += T(103, 196, 'Thonny', { size: 9.6, anchor: 'middle', fill: K.acc, weight: 800 }) + T(293, 100 + 0, '', {});
  return fig(360, 224, s, 'Python in the lab: you write the program in Thonny, Run starts it, the Output screen shows what it prints — and the circuit reacts.');
}

export function thonnyAnatomy() {
  let s = placeScreen(screenThonny({}), 8, 8, 0.46, { H: 700, r: 28 });
  const f = (x, y) => [8 + 0.46 * x, 8 + 0.46 * y];
  const pts = [f(83, 124), f(183, 124), f(229, 124), f(310, 124), f(200, 172), f(200, 300), f(300, 612), f(352, 14)];
  s += pts.map(([x, y], i) => BADGE(x, y, i + 1)).join('');
  const items = [['New · Load · Save', 'a new tab, open a file, save'], ['Run', 'save and start the program'], ['Stop', 'stop it, release the pins'], ['Examples · Files', 'ready programs · your files'], ['File tabs', '× closes · * = not saved'], ['Editor', 'colours, line numbers, auto indent'], ['Status line', 'which Python runs your code'], ['Run (top bar)', 'same as Thonny’s Run']];
  items.forEach(([a, b], i) => { const y = 24 + i * 38; s += BADGE(194, y, i + 1) + T(208, y + 4, a, { size: 11, weight: 700 }) + T(208, y + 17, b, { size: 8.8, fill: K.dim }); });
  return fig(360, 332, s, 'Thonny on the phone: toolbar, file tabs, editor and status line. The Output screen is its own tab next to it.');
}

export function runFlow() {
  let s = '';
  const steps = [['Run', 'toolbar or top bar', K.ok], ['Save', 'if the file is new or changed', K.blue], ['Fresh Python', 'old variables and pins are gone', K.vio], ['%Run blink.py', 'shown in the Output', K.acc], ['Your program', 'prints, drives the pins', K.warn]];
  steps.forEach(([a, b, c], i) => { const y = 8 + i * 50; s += box(8, y, 150, 40, a, b, c) + BADGE(16, y + 6, i + 1); if (i < 4) s += AR(83, y + 40, 83, y + 50, { m: 'mfb', stroke: K.acc }); });
  s += R(190, 8, 162, 240, { fill: 'rgba(148,163,184,.05)', stroke: K.line, rx: 12, dash: '4 3' });
  s += T(271, 28, 'Meanwhile', { size: 11, anchor: 'middle', weight: 800, fill: K.acc });
  s += box(204, 40, 134, 40, 'Circuit powered', 'Run turns the circuit on', K.ok) + box(204, 96, 134, 40, 'Output opens', 'beside the code (landscape)', K.blue) + box(204, 152, 134, 40, 'Stop / Ctrl+C', 'program is interrupted', K.err) + box(204, 204, 134, 36, 'Fresh Python again', 'ready for the next Run', K.vio);
  s += AR(158, 28, 190, 60, { m: 'mfb', stroke: K.acc });
  return fig(360, 262, s, 'What happens when you press Run. Thonny always starts a clean Python, so a run never sees leftovers of the one before.');
}

export function outputAnatomy() {
  const lines = [[['%Run blink.py', '#a78bfa']], [['LED on', '#e2e8f0']], [['LED off', '#e2e8f0']], [['>>> ', '#fbbf24']]];
  let s = placeScreen(screenOutput({ lines }), 8, 8, 0.46, { H: 700, r: 28 });
  const f = (x, y) => [8 + 0.46 * x, 8 + 0.46 * y];
  const pts = [f(100, 84), f(374, 84), f(260, 128), f(260, 152), f(260, 176), f(180, 600)];
  s += pts.map(([x, y], i) => BADGE(x, y, i + 1)).join('');
  [['Output · Shell', 'one console for everything'], ['Clear', 'wipe the text'], ['%Run line', 'Thonny starting your file'], ['print() text', 'what your program writes'], ['>>> prompt', 'type Python, press Enter'], ['Key bar', 'Ctrl+C stop · Ctrl+D restart · arrows · Tab · : ( ) …']].forEach(([a, b], i) => { const y = 28 + i * 44; s += BADGE(194, y, i + 1) + T(208, y + 4, a, { size: 11, weight: 700 }) + T(208, y + 17, b, { size: 8.6, fill: K.dim }).replace(/>(Ctrl[^<]*)</, (m, t) => `>${t.length > 38 ? t.slice(0, 38) : t}<`); });
  return fig(360, 332, s, 'The Output screen: the Shell of Thonny. Program output and the >>> prompt live in the same place.');
}

export function shellRepl() {
  let s = win(8, 8, 250, 176, 'Output · Shell');
  const l = [[['>>> ', '#fbbf24'], ['2 + 3', CK.tx]], [['5', '#cbd5e1']], [['>>> ', '#fbbf24'], ['name = ', CK.tx], ['"Pi"', CK.str]], [['>>> ', '#fbbf24'], ['print', CK.fn], ['(', CK.tx], ['"Hello", name', CK.str], [')', CK.tx]], [['Hello Pi', '#cbd5e1']], [['>>> ', '#fbbf24'], ['for ', CK.kw], ['i ', CK.tx], ['in ', CK.kw], ['range', CK.fn], ['(', CK.tx], ['3', CK.num], ['):', CK.tx]], [['...     ', '#fbbf24'], ['print', CK.fn], ['(i)', CK.tx]], [['... ', '#fbbf24']], [['0', '#cbd5e1']], [['1', '#cbd5e1']], [['2', '#cbd5e1']], [['>>> ', '#fbbf24']]];
  l.forEach((p, i) => { s += codeLine(18, 38 + i * 11.8, p.filter((q) => q[0]), 8.8); });
  s += R(272, 20, 80, 40, { fill: K.box, stroke: K.ok, rx: 8 }) + T(312, 37, 'one line', { size: 9.4, anchor: 'middle', weight: 800, fill: K.ok }) + T(312, 50, 'runs at once', { size: 8, anchor: 'middle', fill: '#cbd5e1' });
  s += R(272, 68, 80, 52, { fill: K.box, stroke: K.warn, rx: 8 }) + T(312, 85, 'a block', { size: 9.4, anchor: 'middle', weight: 800, fill: K.warn }) + T(312, 98, 'ends with ":" →', { size: 8, anchor: 'middle', fill: '#cbd5e1' }) + T(312, 110, 'prompt "..."', { size: 8, anchor: 'middle', fill: '#cbd5e1' });
  s += R(272, 128, 80, 56, { fill: K.box, stroke: K.vio, rx: 8 }) + T(312, 145, 'empty line', { size: 9.4, anchor: 'middle', weight: 800, fill: K.vio }) + T(312, 158, 'ends the block', { size: 8, anchor: 'middle', fill: '#cbd5e1' }) + T(312, 170, '↑ ↓ history', { size: 8, anchor: 'middle', fill: '#cbd5e1' });
  return fig(360, 196, s, 'The Shell is a Python calculator and test bench: type a line, press Enter, see the answer. Lines that open a block (if, for, def …) continue with "...".');
}

export function inputFlow() {
  let s = '';
  s += win(8, 8, 160, 100, 'hello.py') + codeLine(18, 40, [['name = ', CK.tx], ['input', CK.fn], ['(', CK.tx], ['"Your name? "', CK.str], [')', CK.tx]], 7.6) + codeLine(18, 54, [['print', CK.fn], ['(', CK.tx], ['f"Hello {name}"', CK.str], [')', CK.tx]], 7.6) + T(18, 84, 'the program stops at input()', { size: 8.4, fill: K.warn, weight: 700 }) + T(18, 96, 'and waits …', { size: 8.4, fill: K.warn, weight: 700 });
  s += AR(170, 58, 196, 58, { m: 'mfb', stroke: K.acc });
  s += win(198, 8, 154, 100, 'Output · Shell') + codeLine(206, 40, [['%Run hello.py', '#a78bfa']], 7.8) + codeLine(206, 54, [['Your name? ', CK.tx], ['Asha', '#fbbf24']], 7.8) + `<rect x="${206 + 11 * 4.7 + 22}" y="46" width="5" height="10" fill="#fbbf24"/>` + R(206, 76, 138, 22, { fill: '#0a1020', stroke: '#2a3858', rx: 6 }) + T(212, 90, 'type here, press Enter ⏎', { size: 8.4, fill: K.dim });
  s += AR(275, 110, 275, 130, { m: 'mfb', stroke: K.acc });
  s += win(198, 132, 154, 56, 'Output · Shell') + codeLine(206, 160, [['Your name? ', CK.tx], ['Asha', '#fbbf24']], 7.8) + codeLine(206, 174, [['Hello Asha', CK.tx]], 7.8);
  s += T(88, 150, 'The lab brings the Output', { size: 9.4, anchor: 'middle', fill: K.ink, weight: 700 }) + T(88, 164, 'screen up by itself', { size: 9.4, anchor: 'middle', fill: K.ink, weight: 700 }) + T(88, 178, 'when input() asks.', { size: 9.4, anchor: 'middle', fill: K.ink, weight: 700 });
  return fig(360, 200, s, 'input() pauses the program until you type an answer in the Output screen and press Enter.');
}

export function tracebackFig() {
  let s = win(8, 8, 344, 104, 'Output · Shell');
  s += codeLine(18, 40, [['%Run blink.py', '#a78bfa']], 9.4);
  s += codeLine(18, 56, [['Traceback (most recent call last):', '#fca5a5']], 9.4);
  s += codeLine(18, 72, [['  File "/home/pi/blink.py", ', '#fca5a5'], ['line 5', '#fde68a'], [', in <module>', '#fca5a5']], 9.4);
  s += codeLine(18, 88, [["NameError", '#f87171'], [": name 'LEd' isn't defined", '#fca5a5']], 9.4);
  s += BADGE(330, 66, 1) + BADGE(330, 83, 2) + BADGE(330, 100, 3);
  s += win(8, 124, 344, 74, 'Thonny — blink.py');
  s += `<rect x="9" y="152" width="342" height="14" fill="rgba(250,204,21,.16)"/><rect x="9" y="152" width="3" height="14" fill="#facc15"/>`;
  s += codeLine(18, 148, [['from ', CK.kw], ['gpiozero ', CK.tx], ['import ', CK.kw], ['LED', CK.cls]], 9.4) + codeLine(18, 163, [['led = ', CK.tx], ['LEd', CK.cls], ['(', CK.tx], ['17', CK.num], [')', CK.tx]], 9.4) + codeLine(18, 178, [['led', CK.tx], ['.on', CK.fn], ['()', CK.tx]], 9.4);
  s += AR(300, 112, 300, 150, { m: 'mfb', stroke: K.acc }) + T(290, 133, 'Thonny jumps to the line', { size: 8.8, anchor: 'end', fill: K.acc, weight: 700 });
  s += T(18, 218, '① the place: file and line  ② the kind of error  ③ what is wrong', { size: 9, fill: K.ink });
  return fig(360, 230, s, 'Reading an error: read from the bottom. The last line says what is wrong, the line above says where.');
}

// ---------------------------------------------------------------- Python basics
export function pyVariables() {
  let s = '';
  const row = (y, code, name, val, type, c) => codeLine(12, y + 17, code, 10.5) + AR(150, y + 13, 172, y + 13, { m: 'mfb', stroke: '#475569' }) + R(176, y, 64, 26, { fill: K.box, stroke: c, rx: 6 }) + T(208, y + 17, name, { size: 10, anchor: 'middle', weight: 700, fill: c }) + R(244, y, 70, 26, { fill: K.box2, stroke: c, rx: 6 }) + T(279, y + 17, val, { size: 11, anchor: 'middle', weight: 800 }) + T(348, y + 17, type, { size: 9, anchor: 'end', fill: K.dim });
  s += T(176, 12, 'name', { size: 8.5, fill: K.dim }) + T(244, 12, 'value', { size: 8.5, fill: K.dim }) + T(348, 12, 'type', { size: 8.5, anchor: 'end', fill: K.dim });
  s += row(18, [['count = ', CK.tx], ['3', CK.num]], 'count', '3', 'int', K.acc);
  s += row(54, [['temp = ', CK.tx], ['21.5', CK.num]], 'temp', '21.5', 'float', K.ok);
  s += row(90, [['name = ', CK.tx], ['"Pi"', CK.str]], 'name', '"Pi"', 'str', K.warn);
  s += row(126, [['lit = ', CK.tx], ['True', CK.num]], 'lit', 'True', 'bool', K.vio);
  s += T(180, 174, 'a variable is a name stuck on a value', { size: 10, anchor: 'middle', fill: K.ink, weight: 700 });
  return fig(360, 186, s, 'Variables: a name that points to a value. Whole numbers are int, decimals float, text str, yes / no bool.');
}

export function pyIf() {
  let s = '';
  s += box(110, 8, 140, 28, 'temp = 24', null, K.line);
  s += AR(180, 36, 180, 54, { m: 'mfb', stroke: K.acc });
  s += diamond(180, 84, 150, 54, 'temp > 30 ?');
  s += AR(255, 84, 296, 84, { m: 'mfb', stroke: K.ok }) + T(274, 78, 'yes', { size: 9.4, anchor: 'middle', fill: K.ok, weight: 800 }) + box(262, 134, 90, 28, 'fan.on()', null, K.ok).replace('y="134"', 'y="134"');
  s += P('M296 84 V134', { stroke: K.ok }) + `<path d="M296 134l-4-7h8z" fill="${K.ok}"/>`;
  s += AR(105, 84, 64, 84, { m: 'mfa', stroke: K.err }) + T(86, 78, 'no', { size: 9.4, anchor: 'middle', fill: K.err, weight: 800 }) + P('M64 84 V134', { stroke: K.err }) + `<path d="M64 134l-4-7h8z" fill="${K.err}"/>` + box(8, 134, 110, 28, 'fan.off()', null, K.err);
  s += P('M64 162 V184 H296 V162', { stroke: '#475569' }) + AR(180, 184, 180, 196, { m: 'mfb', stroke: K.acc }) + box(110, 196, 140, 24, 'go on …', null, K.line);
  s += codeLine(112, 150 + 12, [], 9);
  return fig(360, 230, s, 'if / else: the program takes one of two roads, depending on a question that is True or False.');
}

export function pyFor() {
  let s = '';
  s += box(120, 8, 120, 28, 'for i in range(3):', null, K.vio);
  s += AR(180, 36, 180, 54, { m: 'mfb', stroke: K.acc });
  s += box(120, 54, 120, 40, 'print(i)', 'i = 0, then 1, then 2', K.acc);
  s += P('M240 74 H290 V22 H240', { stroke: K.vio }) + `<path d="M240 22l7-4v8z" fill="${K.vio}"/>` + T(298, 52, 'next', { size: 9, fill: K.vio, weight: 700 }) + T(298, 64, 'value', { size: 9, fill: K.vio, weight: 700 });
  s += AR(180, 94, 180, 118, { m: 'mfb', stroke: K.ok }) + T(190, 112, 'no more values', { size: 8.8, fill: K.ok });
  s += box(120, 118, 120, 26, 'after the loop', null, K.line);
  [0, 1, 2].forEach((i) => { s += R(12 + i * 32, 60, 26, 26, { fill: K.box2, stroke: K.acc, rx: 6 }) + T(25 + i * 32, 78, String(i), { size: 12, anchor: 'middle', weight: 800 }); });
  s += T(54, 52, 'range(3)', { size: 9.4, anchor: 'middle', fill: K.dim });
  return fig(360, 156, s, 'for: repeat a block once for every value. range(3) gives 0, 1, 2.');
}

export function pyWhile() {
  let s = '';
  s += diamond(150, 40, 150, 50, 'while True ?', K.warn);
  s += AR(150, 65, 150, 84, { m: 'mfb', stroke: K.ok }) + T(160, 79, 'always', { size: 8.8, fill: K.ok });
  s += box(60, 84, 180, 28, 'led.on(); sleep(0.5)', null, K.ok) + AR(150, 112, 150, 124, { m: 'mfb', stroke: K.acc }) + box(60, 124, 180, 28, 'led.off(); sleep(0.5)', null, K.err);
  s += P('M60 138 H30 V40 H75', { stroke: K.acc }) + `<path d="M75 40l-7-4v8z" fill="${K.acc}"/>`;
  s += R(262, 24, 90, 76, { fill: 'rgba(239,68,68,.1)', stroke: 'rgba(239,68,68,.5)', rx: 10 }) + T(307, 44, 'The way out', { size: 9.8, anchor: 'middle', weight: 800, fill: '#fca5a5' }) + T(307, 60, 'Stop button', { size: 8.8, anchor: 'middle', fill: '#e2e8f0' }) + T(307, 73, 'Ctrl+C', { size: 8.8, anchor: 'middle', fill: '#e2e8f0', mono: true }) + T(307, 86, '(KeyboardInterrupt)', { size: 7.6, anchor: 'middle', fill: K.dim });
  return fig(360, 164, s, 'while: repeat as long as the question is True. "while True" repeats for ever until you press Stop.');
}

export function pyFunction() {
  let s = '';
  s += R(8, 10, 170, 92, { fill: K.box, stroke: K.vio, rx: 10 }) + T(18, 28, 'define it once', { size: 9, fill: K.vio, weight: 800 });
  s += codeLine(18, 46, [['def ', CK.kw], ['blink', CK.fn], ['(n):', CK.tx]], 10) + codeLine(18, 60, [['    for ', CK.kw], ['i ', CK.tx], ['in ', CK.kw], ['range', CK.fn], ['(n):', CK.tx]], 10) + codeLine(18, 74, [['        led', CK.tx], ['.toggle', CK.fn], ['()', CK.tx]], 10) + codeLine(18, 88, [['        sleep', CK.fn], ['(', CK.tx], ['0.2', CK.num], [')', CK.tx]], 10);
  s += R(190, 10, 162, 92, { fill: K.box, stroke: K.ok, rx: 10 }) + T(200, 28, 'use it as often as you like', { size: 9, fill: K.ok, weight: 800 });
  s += codeLine(200, 48, [['blink', CK.fn], ['(', CK.tx], ['3', CK.num], [')', CK.tx]], 10.5) + codeLine(200, 66, [['blink', CK.fn], ['(', CK.tx], ['10', CK.num], [')', CK.tx]], 10.5) + T(200, 90, 'the value in () becomes n', { size: 8.6, fill: K.dim });
  s += P('M178 40 H190', { stroke: K.acc, sw: 2 });
  return fig(360, 112, s, 'A function packs steps under one name. Define it with def, call it by its name with the values it needs in brackets.');
}

export function pyIndent() {
  let s = '';
  const L1 = [[0, [['while ', CK.kw], ['True', CK.num], [':', CK.tx]], K.vio], [1, [['led', CK.tx], ['.on', CK.fn], ['()', CK.tx]], K.acc], [1, [['if ', CK.kw], ['button.is_pressed', CK.tx], [':', CK.tx]], K.acc], [2, [['print', CK.fn], ['(', CK.tx], ['"pressed"', CK.str], [')', CK.tx]], K.ok], [1, [['sleep', CK.fn], ['(', CK.tx], ['0.5', CK.num], [')', CK.tx]], K.acc]];
  L1.forEach(([lv, parts, c], i) => { const y = 14 + i * 24; s += `<rect x="${14 + lv * 26}" y="${y}" width="${200 - lv * 26}" height="20" rx="5" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-opacity=".6"/>` + codeLine(20 + lv * 26, y + 14, parts, 10); });
  s += T(240, 34, 'level 0: the loop', { size: 9.4, fill: K.vio, weight: 700 }) + T(240, 82, 'level 1: 4 spaces in', { size: 9.4, fill: K.acc, weight: 700 }) + T(240, 106, 'level 2: 8 spaces in', { size: 9.4, fill: K.ok, weight: 700 });
  s += T(180, 148, 'A line ending with ":" opens a block. Everything indented belongs to it.', { size: 9, anchor: 'middle', fill: K.dim });
  return fig(360, 158, s, 'Indentation is the structure of Python. The editor indents for you after a ":" line.');
}

export function picoThonny() {
  let s = '';
  s += win(8, 14, 120, 120, 'Thonny') + codeLine(16, 44, [['from ', CK.kw], ['machine ', CK.tx], ['import ', CK.kw], ['Pin', CK.cls]], 7.4) + codeLine(16, 56, [['led = ', CK.tx], ['Pin', CK.cls], ['(15, Pin.OUT)', CK.tx]], 7.4) + codeLine(16, 68, [['led', CK.tx], ['.toggle', CK.fn], ['()', CK.tx]], 7.4) + T(68, 100, '[ main.py ]', { size: 8.6, anchor: 'middle', fill: K.dim, mono: true }) + T(68, 124, 'MicroPython (Pico)', { size: 7.8, anchor: 'middle', fill: '#94a3b8' });
  s += R(240, 40, 112, 70, { fill: '#166534', stroke: '#22c55e', rx: 8 }) + R(232, 52, 14, 18, { fill: '#cbd5e1', stroke: 'none', rx: 2 }) + T(300, 66, 'Pico', { size: 13, anchor: 'middle', weight: 800, fill: '#dcfce7' }) + T(300, 82, 'runs MicroPython', { size: 8.4, anchor: 'middle', fill: '#bbf7d0' }) + T(300, 98, 'main.py in its flash', { size: 8, anchor: 'middle', fill: '#bbf7d0' });
  s += AR(130, 52, 238, 52, { m: 'mfb', stroke: K.acc }) + T(184, 46, 'Run: the editor text', { size: 8.4, anchor: 'middle', fill: K.acc, weight: 700 });
  s += AR(238, 84, 130, 84, { m: 'mfa', stroke: K.ok }) + T(184, 98, 'print() text back', { size: 8.4, anchor: 'middle', fill: K.ok, weight: 700 });
  s += box(8, 150, 110, 40, 'Stop', 'soft reboot', K.err) + box(125, 150, 110, 40, 'Ctrl+D', 'soft reboot, runs main.py', K.vio) + box(242, 150, 110, 40, 'Ctrl+C', 'interrupt the program', K.warn);
  return fig(360, 202, s, 'On a Pico, Thonny uses the "MicroPython (Raspberry Pi Pico)" interpreter: Run sends the text of the editor to the board and shows what the board prints.');
}

export function tabStates() {
  let s = '';
  const tab = (x, y, w, t, st) => R(x, y, w, 30, { fill: st === 'on' ? '#0f1a33' : '#0b1226', stroke: st === 'on' ? K.acc : '#1e293b', rx: 8 }) + T(x + 10, y + 19, t, { size: 10.5, fill: st === 'on' ? '#fff' : '#94a3b8', mono: true }) + T(x + w - 12, y + 20, '×', { size: 13, anchor: 'middle', fill: '#64748b' });
  s += tab(8, 10, 108, 'blink.py', 'on') + T(62, 56, 'saved', { size: 9.4, anchor: 'middle', fill: K.ok, weight: 700 });
  s += tab(126, 10, 108, 'blink.py *', 'on') + T(180, 56, 'changed — Save or Run', { size: 9, anchor: 'middle', fill: K.warn, weight: 700 });
  s += tab(244, 10, 108, '<untitled>', 'off') + T(298, 56, 'new, no file yet', { size: 9.4, anchor: 'middle', fill: K.dim, weight: 700 });
  s += tab(8, 80, 140, '[ main.py ]', 'on') + T(78, 126, 'Pico: a file on the board', { size: 9, anchor: 'middle', fill: K.vio, weight: 700 });
  s += R(160, 80, 192, 56, { fill: '#0f1a33', stroke: '#334155', rx: 10 }) + T(256, 98, 'Save to /home/pi as', { size: 9, anchor: 'middle', fill: K.dim }) + R(172, 106, 168, 22, { fill: '#0b1226', stroke: '#334155', rx: 6 }) + T(180, 121, 'blink2.py', { size: 10, fill: '#fff', mono: true });
  return fig(360, 148, s, 'The file tabs: a * means unsaved changes. Save asks for a file name the first time and stores the file in /home/pi (on a Pico: in the board’s flash).');
}
