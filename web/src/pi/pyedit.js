// CodeMirror 6 Python editor in the app's dark theme, completions for the Pi / Pico libraries and
// a symbol bar for phone keyboards.
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, cursorCharLeft, cursorCharRight, toggleComment, indentLess, indentMore } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, indentUnit } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap, openSearchPanel } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { h } from '../ui/widgets.js';
import { icon } from '../ui/icons.js';

const theme = EditorView.theme({
  '&': { color: '#e6edf7', backgroundColor: 'transparent', height: '100%', fontSize: 'var(--code-size, 14px)' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", "Fira Code", monospace', lineHeight: '1.55', overflow: 'auto' },
  '.cm-content': { caretColor: '#22d3ee', padding: '10px 0 30vh' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#22d3ee', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(34,211,238,.25) !important' },
  '.cm-gutters': { backgroundColor: 'rgba(8,13,28,.85)', color: '#4b5b7a', border: 'none', borderRight: '1px solid rgba(148,163,184,.08)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(34,211,238,.08)', color: '#9fb4d8' },
  '.cm-activeLine': { backgroundColor: 'rgba(148,163,184,.06)' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(34,211,238,.22)', outline: '1px solid rgba(34,211,238,.45)' },
  '.cm-tooltip': { backgroundColor: '#111a30', color: '#e6edf7', border: '1px solid rgba(148,163,184,.18)', borderRadius: '12px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '6px 10px !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(34,211,238,.18)', color: '#fff' },
  '.cm-completionDetail': { color: '#7c8db0', fontStyle: 'normal', marginLeft: '8px' },
  '.cm-panels': { backgroundColor: '#0d1528', color: '#e6edf7' },
  '.cm-searchMatch': { backgroundColor: 'rgba(245,158,11,.3)' },
  '.cm-err-line': { backgroundColor: 'rgba(239,68,68,.16)' },
}, { dark: true });

// the same colours as the Arduino editor
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword], color: '#c792ea' },
  { tag: [t.bool, t.null, t.self], color: '#f78c6c' },
  { tag: [t.string, t.special(t.string)], color: '#c3e88d' },
  { tag: t.comment, color: '#5c6f94', fontStyle: 'italic' },
  { tag: t.number, color: '#f78c6c' },
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.className)], color: '#ffb86c', fontWeight: '600' },
  { tag: t.function(t.variableName), color: '#ffb86c' },
  { tag: t.className, color: '#ffcb6b' },
  { tag: t.propertyName, color: '#82aaff' },
  { tag: t.meta, color: '#ff79c6' },
  { tag: t.operator, color: '#89ddff' },
]);

const WORDS = {
  module: ['gpiozero', 'RPi.GPIO', 'time', 'machine', 'utime', 'random', 'math', 'neopixel', 'dht', 'network', 'rp2', 'board', 'adafruit_dht', 'signal', 'os', 'sys', 'json', 'collections', 'datetime'],
  class: ['LED', 'PWMLED', 'Button', 'Buzzer', 'TonalBuzzer', 'RGBLED', 'Motor', 'Robot', 'Servo', 'AngularServo', 'DistanceSensor', 'MotionSensor', 'LightSensor', 'LineSensor', 'MCP3008', 'TrafficLights', 'LEDBoard', 'LEDBarGraph', 'OutputDevice', 'DigitalInputDevice', 'CPUTemperature',
    'Pin', 'PWM', 'ADC', 'Timer', 'I2C', 'SPI', 'UART', 'RTC', 'WDT', 'NeoPixel', 'DHT11', 'DHT22', 'WLAN', 'Signal'],
  function: ['print', 'input', 'range', 'len', 'int', 'float', 'str', 'list', 'dict', 'tuple', 'set', 'abs', 'min', 'max', 'sum', 'round', 'sorted', 'enumerate', 'zip', 'isinstance', 'open', 'help', 'dir', 'type',
    'sleep', 'sleep_ms', 'sleep_us', 'ticks_ms', 'ticks_us', 'ticks_diff', 'pause', 'setmode', 'setup', 'output', 'cleanup', 'setwarnings', 'add_event_detect', 'wait_for_edge', 'event_detected',
    'on', 'off', 'toggle', 'blink', 'pulse', 'value', 'when_pressed', 'when_released', 'when_held', 'when_motion', 'wait_for_press', 'wait_for_release', 'is_pressed', 'distance', 'forward', 'backward', 'stop',
    'freq', 'duty_u16', 'read_u16', 'irq', 'init', 'deinit', 'write', 'scan', 'measure', 'temperature', 'humidity', 'connect', 'isconnected', 'ifconfig'],
  constant: ['BCM', 'BOARD', 'OUT', 'IN', 'HIGH', 'LOW', 'PUD_UP', 'PUD_DOWN', 'RISING', 'FALLING', 'BOTH', 'IRQ_RISING', 'IRQ_FALLING', 'PULL_UP', 'PULL_DOWN', 'OUT', 'True', 'False', 'None'],
};
const SNIPPETS = [
  ['while True', 'while True:\n    ${}', 'loop forever'],
  ['for in range', 'for ${i} in range(${10}):\n    ${}', 'counted loop'],
  ['def', 'def ${name}(${}):\n    ${pass}', 'function'],
  ['if', 'if ${cond}:\n    ${}', 'if block'],
  ['try except', 'try:\n    ${}\nexcept KeyboardInterrupt:\n    ${pass}', 'stop with Ctrl+C'],
  ['from gpiozero import', 'from gpiozero import ${LED}', 'gpiozero'],
  ['import RPi.GPIO as GPIO', 'import RPi.GPIO as GPIO', 'RPi.GPIO'],
  ['from machine import Pin', 'from machine import Pin', 'Pico'],
];

function completions(ctx) {
  const word = ctx.matchBefore(/[\w.]*/);
  if (!word || (word.from === word.to && !ctx.explicit)) return null;
  const options = [];
  for (const [label, tpl, info] of SNIPPETS) options.push(snippetCompletion(tpl, { label, detail: info, type: 'keyword', boost: 1 }));
  for (const [type, list] of Object.entries(WORDS)) for (const w of list) options.push({ label: w, type: type === 'module' ? 'namespace' : type });
  for (const k of ['import', 'from', 'def', 'class', 'return', 'while', 'for', 'in', 'if', 'elif', 'else', 'try', 'except', 'finally', 'with', 'as', 'pass', 'break', 'continue', 'lambda', 'global', 'nonlocal', 'and', 'or', 'not', 'is', 'yield', 'async', 'await', 'raise', 'assert', 'del']) options.push({ label: k, type: 'keyword' });
  // words already in the file
  const seen = new Set(options.map((o) => o.label));
  for (const m of ctx.state.doc.toString().matchAll(/\b[A-Za-z_]\w{2,}\b/g)) if (!seen.has(m[0])) { seen.add(m[0]); options.push({ label: m[0], type: 'variable' }); }
  return { from: word.from + (word.text.lastIndexOf('.') + 1), options, validFor: /^\w*$/ };
}

export class PyEditor {
  constructor(host, { code = '', onChange, fontSize = 14 } = {}) {
    this.onChange = onChange;
    this.ro = new Compartment();
    this.wrap = h('div', { class: 'code-wrap py-wrap' });
    this.cmHost = h('div', { class: 'code-cm py-cm' });
    this.wrap.append(this.cmHost, this.symbolBar());
    host.appendChild(this.wrap);
    this.setFontSize(fontSize);
    this.view = new EditorView({ parent: this.cmHost, state: this.makeState(code) });
  }

  makeState(code) {
    return EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(), highlightActiveLineGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
        autocompletion({ override: [completions], icons: false }), highlightActiveLine(), highlightSelectionMatches(),
        indentUnit.of('    '), EditorState.tabSize.of(4),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab, { key: 'Mod-/', run: toggleComment }]),
        python(), syntaxHighlighting(highlight), theme, EditorView.lineWrapping,
        this.ro.of(EditorState.readOnly.of(false)),
        EditorView.updateListener.of((u) => { if (u.docChanged && this.onChange && !this.silent) this.onChange(u.state.doc.toString()); }),
        EditorView.domEventHandlers({ focus: () => this.wrap.classList.add('focused'), blur: () => setTimeout(() => { if (!this.view.hasFocus) this.wrap.classList.remove('focused'); }, 150) }),
      ],
    });
  }

  symbolBar() {
    const bar = h('div', { class: 'symbol-bar' });
    const keep = (e) => e.preventDefault();
    const ins = (s) => () => { this.view.dispatch(this.view.state.replaceSelection(s)); this.view.focus(); };
    const btn = (label, fn, cls = '') => { const b = h('button', { class: 'sym ' + cls, onclick: fn }); if (label.startsWith('<svg')) b.innerHTML = label; else b.textContent = label; b.addEventListener('pointerdown', keep); b.addEventListener('mousedown', keep); return b; };
    bar.append(
      btn('⇥', () => { indentMore(this.view); this.view.focus(); }), btn('⇤', () => { indentLess(this.view); this.view.focus(); }),
      btn(icon('arrowLeft', 18), () => { cursorCharLeft(this.view); this.view.focus(); }, 'sym-icon'),
      btn(icon('forward', 18), () => { cursorCharRight(this.view); this.view.focus(); }, 'sym-icon'),
      ...[':', '(', ')', '"', "'", '=', '[', ']', '_', '.', ',', '#', '+', '-', '*', '/', '<', '>', '{', '}'].map((s) => btn(s, ins(s))),
      btn(icon('undo', 18), () => { undo(this.view); this.view.focus(); }, 'sym-icon'),
      btn(icon('redo', 18), () => { redo(this.view); this.view.focus(); }, 'sym-icon'));
    return bar;
  }

  get value() { return this.view.state.doc.toString(); }
  /** Replace the document (a fresh state: no undo into the previous file). */
  load(code) { this.silent = true; this.view.setState(this.makeState(code)); this.silent = false; }
  setFontSize(px) { this.wrap.style.setProperty('--code-size', px + 'px'); this.fontSize = px; }
  setReadOnly(ro) { this.view.dispatch({ effects: this.ro.reconfigure(EditorState.readOnly.of(ro)) }); }
  focus() { this.view.focus(); }
  search() { openSearchPanel(this.view); }
  undo() { undo(this.view); }
  redo() { redo(this.view); }
  gotoLine(n) {
    if (!(n > 0 && n <= this.view.state.doc.lines)) return;
    const line = this.view.state.doc.line(n);
    this.view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
  }
  refresh() { this.view.requestMeasure(); }
}
