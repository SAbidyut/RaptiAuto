// Code editor: CodeMirror 6 configured for Arduino C++ on touch screens.
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, Decoration, ViewPlugin } from '@codemirror/view';
import { EditorState, Compartment, StateEffect, StateField } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown, selectAll, toggleComment } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, indentUnit } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, snippetCompletion } from '@codemirror/autocomplete';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap, openSearchPanel } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { h } from './widgets.js';
import { icon } from './icons.js';

const ARDUINO_FUNCS = [
  ['pinMode', 'pinMode(${pin}, ${OUTPUT});', 'Configure a pin as INPUT / OUTPUT / INPUT_PULLUP'],
  ['digitalWrite', 'digitalWrite(${pin}, ${HIGH});', 'Set a digital pin HIGH or LOW'],
  ['digitalRead', 'digitalRead(${pin})', 'Read a digital pin (HIGH / LOW)'],
  ['analogRead', 'analogRead(${A0})', 'Read an analog voltage (0–1023)'],
  ['analogWrite', 'analogWrite(${pin}, ${128});', 'PWM output (0–255)'],
  ['delay', 'delay(${1000});', 'Pause for milliseconds'],
  ['delayMicroseconds', 'delayMicroseconds(${10});', 'Pause for microseconds'],
  ['millis', 'millis()', 'Milliseconds since start'],
  ['micros', 'micros()', 'Microseconds since start'],
  ['map', 'map(${value}, ${0}, ${1023}, ${0}, ${255})', 'Re-map a number between ranges'],
  ['constrain', 'constrain(${x}, ${0}, ${255})', 'Limit a number to a range'],
  ['tone', 'tone(${pin}, ${440}, ${200});', 'Play a tone on a buzzer'],
  ['noTone', 'noTone(${pin});', 'Stop tone'],
  ['pulseIn', 'pulseIn(${pin}, ${HIGH})', 'Measure a pulse length (µs)'],
  ['attachInterrupt', 'attachInterrupt(digitalPinToInterrupt(${2}), ${isr}, ${FALLING});', 'Run a function on a pin change'],
  ['random', 'random(${0}, ${100})', 'Random number'],
  ['randomSeed', 'randomSeed(analogRead(${A0}));', 'Seed the random generator'],
  ['shiftOut', 'shiftOut(${dataPin}, ${clockPin}, ${MSBFIRST}, ${value});', 'Shift a byte out (74HC595)'],
  ['Serial.begin', 'Serial.begin(${9600});', 'Start the serial port'],
  ['Serial.println', 'Serial.println(${"Hello"});', 'Print a line to the Serial Monitor'],
  ['Serial.print', 'Serial.print(${value});', 'Print to the Serial Monitor'],
  ['Serial.available', 'Serial.available()', 'Bytes waiting to be read'],
  ['Serial.read', 'Serial.read()', 'Read one byte'],
  ['Serial.readStringUntil', "Serial.readStringUntil('\\n')", 'Read text until newline'],
  ['Serial.parseInt', 'Serial.parseInt()', 'Read a number'],
];
const SNIPPETS = [
  ['setup', 'void setup() {\n\t${}\n}', 'setup() function'],
  ['loop', 'void loop() {\n\t${}\n}', 'loop() function'],
  ['for', 'for (int ${i} = 0; ${i} < ${10}; ${i}++) {\n\t${}\n}', 'for loop'],
  ['if', 'if (${condition}) {\n\t${}\n}', 'if statement'],
  ['ifelse', 'if (${condition}) {\n\t${}\n} else {\n\t\n}', 'if / else'],
  ['while', 'while (${condition}) {\n\t${}\n}', 'while loop'],
  ['switch', 'switch (${value}) {\n\tcase ${1}:\n\t\t${}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', 'switch / case'],
  ['millis-timer', 'unsigned long ${previous} = 0;\nconst long ${interval} = 1000;\n\nif (millis() - ${previous} >= ${interval}) {\n\t${previous} = millis();\n\t${}\n}', 'non-blocking timer'],
  ['include', '#include <${Servo.h}>', '#include library'],
  ['define', '#define ${NAME} ${value}', '#define constant'],
];
const KEYWORDS = ['HIGH', 'LOW', 'INPUT', 'OUTPUT', 'INPUT_PULLUP', 'LED_BUILTIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'true', 'false',
  'CHANGE', 'RISING', 'FALLING', 'MSBFIRST', 'LSBFIRST', 'DEC', 'HEX', 'BIN', 'int', 'long', 'unsigned', 'float', 'double', 'bool',
  'byte', 'char', 'String', 'const', 'void', 'return', 'break', 'continue', 'static', 'volatile', 'boolean', 'sizeof', 'struct', 'class', 'enum'];
const LIB_SNIPPETS = [
  ['Servo', '#include <Servo.h>\nServo ${myServo};', 'Servo motor library'],
  ['LiquidCrystal_I2C', '#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27, 16, 2);', 'I2C LCD 16×2'],
  ['LiquidCrystal', '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);', 'Parallel LCD'],
  ['DHT', '#include <DHT.h>\nDHT dht(${2}, DHT22);', 'DHT temperature / humidity'],
  ['Adafruit_NeoPixel', '#include <Adafruit_NeoPixel.h>\nAdafruit_NeoPixel strip(${16}, ${6}, NEO_GRB + NEO_KHZ800);', 'NeoPixel LEDs'],
  ['Adafruit_SSD1306', '#include <Adafruit_SSD1306.h>\nAdafruit_SSD1306 display(128, 64, &Wire, -1);', 'OLED display'],
];

function arduinoCompletions(context) {
  const word = context.matchBefore(/[\w.#<]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const options = [];
  for (const [label, tpl, info] of ARDUINO_FUNCS) options.push(snippetCompletion(tpl, { label, detail: info, type: 'function', boost: 3 }));
  for (const [label, tpl, info] of SNIPPETS) options.push(snippetCompletion(tpl, { label, detail: info, type: 'keyword', boost: 1 }));
  for (const [label, tpl, info] of LIB_SNIPPETS) options.push(snippetCompletion(tpl, { label, detail: info, type: 'class' }));
  for (const k of KEYWORDS) options.push({ label: k, type: /^[A-Z]/.test(k) ? 'constant' : 'keyword' });
  return { from: word.from, options, validFor: /^[\w.]*$/ };
}

const theme = EditorView.theme({
  '&': { color: '#e6edf7', backgroundColor: 'transparent', height: '100%', fontSize: 'var(--code-size, 14px)' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", "Fira Code", monospace', lineHeight: '1.55', overflow: 'auto' },
  '.cm-content': { caretColor: '#22d3ee', padding: '10px 0 40vh' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#22d3ee', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'rgba(34,211,238,.25) !important' },
  '.cm-gutters': { backgroundColor: 'rgba(8,13,28,.85)', color: '#4b5b7a', border: 'none', borderRight: '1px solid rgba(148,163,184,.08)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(34,211,238,.08)', color: '#9fb4d8' },
  '.cm-activeLine': { backgroundColor: 'rgba(148,163,184,.06)' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(34,211,238,.22)', outline: '1px solid rgba(34,211,238,.45)' },
  '.cm-tooltip': { backgroundColor: '#111a30', border: '1px solid rgba(148,163,184,.18)', borderRadius: '12px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '6px 10px !important' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(34,211,238,.18)', color: '#fff' },
  '.cm-completionDetail': { color: '#7c8db0', fontStyle: 'normal', marginLeft: '8px' },
  '.cm-foldGutter span': { color: '#3f4d6b' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy #ef4444', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy #f59e0b', textUnderlineOffset: '3px' },
  '.cm-panels': { backgroundColor: '#0d1528', color: '#e6edf7' },
  '.cm-searchMatch': { backgroundColor: 'rgba(245,158,11,.3)' },
  '.cm-exec-line': { backgroundColor: 'rgba(34,197,94,.10)' },
}, { dark: true });

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c792ea' },
  { tag: [t.typeName, t.standard(t.typeName)], color: '#4fd1c5' },
  { tag: t.controlKeyword, color: '#c792ea', fontWeight: '600' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#ffb86c' },
  { tag: t.propertyName, color: '#82aaff' },
  { tag: t.variableName, color: '#e6edf7' },
  { tag: [t.number, t.bool, t.null], color: '#f78c6c' },
  { tag: [t.string, t.character], color: '#c3e88d' },
  { tag: t.comment, color: '#5c6f94', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta], color: '#ff79c6' },
  { tag: t.operator, color: '#89ddff' },
  { tag: t.macroName, color: '#ff79c6' },
  { tag: t.className, color: '#ffcb6b' },
  { tag: t.constant(t.variableName), color: '#f78c6c' },
]);

// Arduino constants (HIGH, LOW, OUTPUT...) shown in orange like the Arduino IDE
const constDeco = Decoration.mark({ class: 'cm-ard-const' });
const fnDeco = Decoration.mark({ class: 'cm-ard-fn' });
const CONST_RE = /\b(HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|LED_BUILTIN|A[0-9]{1,2}|CHANGE|RISING|FALLING|MSBFIRST|LSBFIRST|DEC|HEX|BIN|OCT|true|false|NULL)\b/g;
const FN_RE = /\b(setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|delay|delayMicroseconds|millis|micros|tone|noTone|map|constrain|pulseIn|Serial|attachInterrupt)\b/g;
const arduinoHighlighter = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = this.build(view); }
  update(u) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view); }
  build(view) {
    const marks = [];
    for (const { from, to } of view.visibleRanges) {
      const text = view.state.doc.sliceString(from, to);
      for (const m of text.matchAll(CONST_RE)) marks.push(constDeco.range(from + m.index, from + m.index + m[0].length));
      for (const m of text.matchAll(FN_RE)) marks.push(fnDeco.range(from + m.index, from + m.index + m[0].length));
    }
    marks.sort((a, b) => a.from - b.from);
    return Decoration.set(marks, true);
  }
}, { decorations: (v) => v.decorations });

// highlight of the line currently executing (optional)
const setExecLine = StateEffect.define();
const execLineField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setExecLine)) {
        if (!e.value || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none;
        const line = tr.state.doc.line(e.value);
        return Decoration.set([Decoration.line({ class: 'cm-exec-line' }).range(line.from)]);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const SYMBOLS = ['{', '}', '(', ')', ';', '[', ']', '<', '>', '=', '"', "'", '+', '-', '*', '/', '&', '|', '!', '#', ',', '.', ':', '_', '%', '\\'];

export class CodeEditor {
  constructor(host, { code, onChange, fontSize = 14, readOnly = false }) {
    this.host = host;
    this.onChange = onChange;
    this.readOnly = new Compartment();
    this.wrap = h('div', { class: 'code-wrap' });
    this.cmHost = h('div', { class: 'code-cm' });
    this.symbolBar = this.makeSymbolBar();
    this.wrap.append(this.cmHost, this.symbolBar);
    host.appendChild(this.wrap);
    this.setFontSize(fontSize);
    this.view = new EditorView({
      parent: this.cmHost,
      state: EditorState.create({
        doc: code,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), foldGutter(), history(), drawSelection(), indentOnInput(), bracketMatching(),
          closeBrackets(), autocompletion({ override: [arduinoCompletions], activateOnTyping: true, icons: false }), highlightActiveLine(),
          highlightSelectionMatches(), lintGutter(), indentUnit.of('  '), EditorState.tabSize.of(2),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...completionKeymap, indentWithTab,
            { key: 'Mod-/', run: toggleComment }]),
          cpp(), syntaxHighlighting(highlight), arduinoHighlighter, theme, execLineField,
          EditorView.lineWrapping,
          this.readOnly.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((u) => { if (u.docChanged && this.onChange) this.onChange(u.state.doc.toString()); }),
          EditorView.domEventHandlers({ focus: () => this.wrap.classList.add('focused'), blur: () => setTimeout(() => { if (!this.view.hasFocus) this.wrap.classList.remove('focused'); }, 150) }),
        ],
      }),
    });
  }

  makeSymbolBar() {
    const bar = h('div', { class: 'symbol-bar' });
    const ins = (txt) => () => {
      const v = this.view;
      if (txt === '\t') { v.dispatch(v.state.replaceSelection('  ')); v.focus(); return; }
      v.dispatch(v.state.replaceSelection(txt));
      v.focus();
    };
    const keep = (e) => e.preventDefault(); // keep editor focus / keyboard open
    const btn = (label, fn, cls = '') => {
      const b = h('button', { class: 'sym ' + cls, onmousedown: keep, ontouchstart: (e) => { /* allow */ void e; }, onclick: fn });
      if (label.startsWith('<svg')) b.innerHTML = label; else b.textContent = label;
      b.addEventListener('pointerdown', keep);
      return b;
    };
    bar.appendChild(btn(icon('tab', 18), ins('\t'), 'sym-icon'));
    bar.appendChild(btn(icon('arrowLeft', 18), () => { cursorCharLeft(this.view); this.view.focus(); }, 'sym-icon'));
    bar.appendChild(btn(icon('arrowRight', 18), () => { cursorCharRight(this.view); this.view.focus(); }, 'sym-icon'));
    bar.appendChild(btn(icon('arrowUp', 18), () => { cursorLineUp(this.view); this.view.focus(); }, 'sym-icon'));
    bar.appendChild(btn(icon('arrowDown', 18), () => { cursorLineDown(this.view); this.view.focus(); }, 'sym-icon'));
    for (const s of SYMBOLS) bar.appendChild(btn(s, ins(s)));
    bar.appendChild(btn('//', () => { toggleComment(this.view); this.view.focus(); }));
    bar.appendChild(btn(icon('undo', 18), () => { undo(this.view); this.view.focus(); }, 'sym-icon'));
    bar.appendChild(btn(icon('redo', 18), () => { redo(this.view); this.view.focus(); }, 'sym-icon'));
    return bar;
  }

  get value() { return this.view.state.doc.toString(); }
  set value(v) {
    if (v === this.value) return;
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: v } });
  }

  setFontSize(px) { this.wrap.style.setProperty('--code-size', px + 'px'); this.fontSize = px; }
  setReadOnly(ro) { this.view.dispatch({ effects: this.readOnly.reconfigure(EditorState.readOnly.of(ro)) }); }
  focus() { this.view.focus(); }
  undo() { undo(this.view); }
  redo() { redo(this.view); }
  search() { openSearchPanel(this.view); }
  selectAll() { selectAll(this.view); }

  setError(err) {
    const diags = [];
    if (err && err.line > 0 && err.line <= this.view.state.doc.lines) {
      const line = this.view.state.doc.line(err.line);
      let from = line.from, to = line.to;
      if (err.col > 0) {
        from = Math.min(line.to, line.from + err.col - 1);
        const rest = line.text.slice(err.col - 1);
        const m = /^[\w.]+|^./.exec(rest);
        to = Math.min(line.to, from + (m ? m[0].length : 1));
      }
      if (to <= from) to = Math.min(line.to, from + 1);
      if (from === to && line.to > line.from) { from = line.from; to = line.to; }
      diags.push({ from, to, severity: err.severity || 'error', message: err.message });
    }
    this.view.dispatch(setDiagnostics(this.view.state, diags));
    if (err && err.line > 0 && err.line <= this.view.state.doc.lines) {
      const pos = this.view.state.doc.line(err.line).from;
      this.view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    }
  }

  clearError() { this.view.dispatch(setDiagnostics(this.view.state, [])); }

  setExecLine(line) { this.view.dispatch({ effects: setExecLine.of(line) }); }

  insertAtCursor(text) {
    this.view.dispatch(this.view.state.replaceSelection(text));
    this.view.focus();
  }
}
