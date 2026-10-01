// Arduino core API (pins, time, math, Serial, EEPROM) bound to a hardware interface `hw`.
import { RuntimeError, Ref, Ptr, cstr, formatPrintable, sprintf, AStr } from './values.js';
import { makeStringNatives } from './stringlib.js';

export const PRINT_META = {
  print: { ret: 'uint', print: true },
  println: { ret: 'uint', print: true },
};

/** Mixin for classes that implement Arduino's Print (requires this._write(str) & this._f32). */
export const PrintMixin = {
  print(v, kind, fmt) {
    if (kind === -1) return 0;
    return this._write(formatPrintable(v, kind, fmt, this._f32));
  },
  println(v, kind, fmt) {
    const s = kind === -1 ? '' : formatPrintable(v, kind, fmt, this._f32);
    return this._write(s + '\r\n');
  },
};

class LCG {
  constructor(seed = 1) { this.seed(seed); }
  seed(s) { this.s = (s >>> 0) || 1; }
  next() {
    // avr-libc random(): Park-Miller "minimal standard" generator
    let x = this.s;
    const hi = Math.floor(x / 127773), lo = x % 127773;
    x = 16807 * lo - 2836 * hi;
    if (x < 0) x += 0x7fffffff;
    this.s = x;
    return x % 0x7fffffff;
  }
}

export class HardwareSerial {
  constructor(rt, hw, port, board) {
    this.rt = rt;
    this.hw = hw;
    this.port = port;
    this.board = board;
    this.rx = [];
    this.baud = 0;
    this.begun = false;
    this.timeout = 1000;
    this.txFree = 0;
    this._f32 = board.arch === 'avr';
    this.rxMax = board.arch === 'avr' ? 64 : 256;
  }

  begin(baud) { this.baud = baud || 9600; this.begun = true; this.rt.t += 20; }
  end() { this.begun = false; }
  setTimeout(ms) { this.timeout = ms; }
  getTimeout() { return this.timeout; }
  availableForWrite() {
    const rt = this.rt;
    const byteTime = this.byteTime();
    const queued = Math.max(0, Math.ceil((this.txFree - rt.t) / byteTime));
    return Math.max(0, 63 - queued);
  }
  byteTime() { return 1e7 / (this.baud || 9600); }

  _write(s) {
    const rt = this.rt;
    if (!this.begun) {
      rt.warnOnce('serial-begin:' + this.port, `${this.port}.begin() was not called — nothing is sent to the Serial Monitor. Add ${this.port}.begin(9600); in setup().`);
      return 0;
    }
    const n = s.length;
    if (!n) return 0;
    // UART timing model: 64 byte TX buffer drained at the baud rate
    const bt = this.byteTime();
    const bufBytes = 64;
    if (this.txFree < rt.t) this.txFree = rt.t;
    const queued = (this.txFree - rt.t) / bt;
    if (queued + n > bufBytes) {
      const waitUntil = this.txFree - (bufBytes - n) * bt;
      if (waitUntil > rt.t) rt.t = waitUntil;
    }
    this.txFree += n * bt;
    rt.t += n * (this.board.arch === 'avr' ? 1.5 : 0.2);
    this.hw.serialOut(this.port, s);
    return n;
  }

  write(v, len) {
    if (typeof v === 'number') return this._write(String.fromCharCode(v & 255));
    if (len !== undefined) {
      const a = v instanceof Ptr ? v.a : v;
      const off = v instanceof Ptr ? v.i : 0;
      let s = '';
      for (let i = 0; i < len; i++) {
        const c = typeof a === 'string' ? a.charCodeAt(off + i) : a[off + i];
        s += String.fromCharCode((c | 0) & 255);
      }
      return this._write(s);
    }
    return this._write(cstr(v));
  }

  printf(fmt, ...args) { return this._write(sprintf(fmt, args, this.board.arch === 'avr')); }

  available() { return this.rx.length; }
  read() { return this.rx.length ? this.rx.shift() : -1; }
  peek() { return this.rx.length ? this.rx[0] : -1; }
  flush() { if (this.txFree > this.rt.t) this.rt.t = this.txFree; }
  // input from the Serial Monitor
  feed(text) {
    for (let i = 0; i < text.length; i++) {
      if (this.rx.length >= this.rxMax) break;
      this.rx.push(text.charCodeAt(i) & 255);
    }
  }

  * timedRead() {
    const deadline = this.rt.t + this.timeout * 1000;
    const ok = yield* this.rt.waitFor(() => this.rx.length > 0, deadline);
    return ok ? this.rx.shift() : -1;
  }

  * timedPeek() {
    const deadline = this.rt.t + this.timeout * 1000;
    const ok = yield* this.rt.waitFor(() => this.rx.length > 0, deadline);
    return ok ? this.rx[0] : -1;
  }

  * peekNextDigit(detectDecimal) {
    for (;;) {
      const c = yield* this.timedPeek();
      if (c < 0) return c;
      if (c === 45 || (c >= 48 && c <= 57) || (detectDecimal && c === 46)) return c;
      this.rx.shift();
    }
  }

  * parseInt() {
    let isNeg = false, value = 0;
    let c = yield* this.peekNextDigit(false);
    if (c < 0) return 0;
    do {
      if (c === 45) isNeg = true;
      else if (c >= 48 && c <= 57) value = value * 10 + c - 48;
      this.rx.shift();
      c = yield* this.timedPeek();
    } while ((c >= 48 && c <= 57));
    if (isNeg) value = -value;
    return this.board.arch === 'avr' ? value | 0 : value | 0;
  }

  * parseFloat() {
    let isNeg = false, isFraction = false, value = 0, fraction = 1;
    let c = yield* this.peekNextDigit(true);
    if (c < 0) return 0;
    do {
      if (c === 45) isNeg = true;
      else if (c === 46) isFraction = true;
      else if (c >= 48 && c <= 57) {
        value = value * 10 + c - 48;
        if (isFraction) fraction *= 0.1;
      }
      this.rx.shift();
      c = yield* this.timedPeek();
    } while ((c >= 48 && c <= 57) || (c === 46 && !isFraction));
    if (isNeg) value = -value;
    return isFraction ? value * fraction : value;
  }

  * readString() {
    let s = '';
    for (;;) {
      const c = yield* this.timedRead();
      if (c < 0) break;
      s += String.fromCharCode(c);
    }
    return new AStr(s);
  }

  * readStringUntil(term) {
    let s = '';
    for (;;) {
      const c = yield* this.timedRead();
      if (c < 0 || c === term) break;
      s += String.fromCharCode(c);
    }
    return new AStr(s);
  }

  * readBytes(buf, len) {
    const a = buf instanceof Ptr ? buf.a : buf;
    const off = buf instanceof Ptr ? buf.i : 0;
    let n = 0;
    while (n < len) {
      const c = yield* this.timedRead();
      if (c < 0) break;
      a[off + n++] = c;
    }
    return n;
  }

  * readBytesUntil(term, buf, len) {
    const a = buf instanceof Ptr ? buf.a : buf;
    const off = buf instanceof Ptr ? buf.i : 0;
    let n = 0;
    while (n < len) {
      const c = yield* this.timedRead();
      if (c < 0 || c === term) break;
      a[off + n++] = c;
    }
    return n;
  }

  * find(target) {
    const t = cstr(target);
    let idx = 0;
    for (;;) {
      const c = yield* this.timedRead();
      if (c < 0) return 0;
      if (c === t.charCodeAt(idx)) { idx++; if (idx >= t.length) return 1; } else idx = c === t.charCodeAt(0) ? 1 : 0;
    }
  }

  * findUntil(target, term) {
    const t = cstr(target), tm = cstr(term);
    let idx = 0, tidx = 0;
    for (;;) {
      const c = yield* this.timedRead();
      if (c < 0) return 0;
      if (c === t.charCodeAt(idx)) { idx++; if (idx >= t.length) return 1; } else idx = 0;
      if (tm.length && c === tm.charCodeAt(tidx)) { tidx++; if (tidx >= tm.length) return 0; } else tidx = 0;
    }
  }

  valueOf() { return 1; }
}
Object.assign(HardwareSerial.prototype, PrintMixin);

export function serialClassMeta(arch) {
  const methods = {
    begin: { ret: 'void' },
    end: { ret: 'void' },
    ...PRINT_META,
    write: { ret: 'uint', args: ['raw', 'num'] },
    available: { ret: 'int' },
    availableForWrite: { ret: 'int' },
    read: { ret: 'int' },
    peek: { ret: 'int' },
    flush: { ret: 'void' },
    setTimeout: { ret: 'void' },
    getTimeout: { ret: 'ulong' },
    parseInt: { ret: 'long', gen: true },
    parseFloat: { ret: 'float', gen: true },
    readString: { ret: 'String', gen: true },
    readStringUntil: { ret: 'String', gen: true },
    readBytes: { ret: 'uint', gen: true, args: ['raw', 'num'] },
    readBytesUntil: { ret: 'uint', gen: true, args: ['num', 'raw', 'num'] },
    find: { ret: 'bool', gen: true, args: ['str'] },
    findUntil: { ret: 'bool', gen: true, args: ['str', 'str'] },
  };
  if (arch !== 'avr') methods.printf = { ret: 'uint', printf: 1, args: ['str'] };
  return { name: 'HardwareSerial', methods, create: () => { throw new Error('Serial cannot be constructed'); } };
}

class EEPROMClass {
  constructor(rt, hw, size) {
    this.rt = rt;
    this.hw = hw;
    this.size = size;
    this.data = hw.eepromData ? hw.eepromData(size) : new Array(size).fill(255);
  }
  begin() { return 1; }
  commit() { if (this.hw.eepromCommit) this.hw.eepromCommit(this.data); return 1; }
  end() { this.commit(); }
  length() { return this.size; }
  read(a) { return a >= 0 && a < this.size ? this.data[a] : 0; }
  write(a, v) {
    if (a >= 0 && a < this.size) {
      this.data[a] = v & 255;
      this.rt.t += 3300; // ~3.3ms per byte on AVR
      if (this.hw.eepromCommit) this.hw.eepromCommit(this.data);
    }
  }
  update(a, v) { if (this.read(a) !== (v & 255)) this.write(a, v); }
  at(i) { return this.read(i); }
  setAt(i, v) { this.write(i, v); }
}

function typedToBytes(t, v, avr) {
  const bytes = [];
  if (t.k === 'float') {
    const buf = new DataView(new ArrayBuffer(8));
    if (t.bits === 32 || avr) { buf.setFloat32(0, v, true); for (let i = 0; i < 4; i++) bytes.push(buf.getUint8(i)); }
    else { buf.setFloat64(0, v, true); for (let i = 0; i < 8; i++) bytes.push(buf.getUint8(i)); }
    return bytes;
  }
  if (t.k === 'int') {
    const n = t.isBool ? 1 : t.bits / 8;
    for (let i = 0; i < n; i++) bytes.push(Math.floor(v / 2 ** (8 * i)) & 255);
    return bytes;
  }
  return null;
}

function bytesToTyped(t, bytes, avr) {
  if (t.k === 'float') {
    const buf = new DataView(new ArrayBuffer(8));
    bytes.forEach((b, i) => buf.setUint8(i, b));
    return (t.bits === 32 || avr) ? buf.getFloat32(0, true) : buf.getFloat64(0, true);
  }
  let v = 0;
  for (let i = 0; i < bytes.length; i++) v += bytes[i] * 2 ** (8 * i);
  if (!t.uns && !t.isBool && v >= 2 ** (t.bits - 1)) v -= 2 ** t.bits;
  return v;
}

export function makeCore(rt, hw, board) {
  const avr = board.arch === 'avr';
  const T_DW = avr ? 4 : 0.5; // digitalWrite cost (µs)
  const rng = new LCG(1);
  let adcBits = board.adcBits || 10;
  let pwmBits = 8;
  const vref = () => board.vcc || 5;
  const analogPins = board.analogPins || [];

  const toAnalogPin = (p) => {
    if (board.analogChannelBase !== undefined && p >= 0 && p < analogPins.length && !board.gpioAnalog) return analogPins[p];
    return p;
  };

  const intToPin = (n) => (board.interruptPins ? (board.interruptPins[n] ?? -1) : n);

  const ledcChannels = new Map();

  const functions = {
    pinMode: { ret: 'void', fn: (p, m) => { rt.t += T_DW; hw.pinMode(p, m); } },
    digitalWrite: { ret: 'void', fn: (p, v) => { rt.t += T_DW; hw.digitalWrite(p, v ? 1 : 0); } },
    digitalRead: { ret: 'int', fn: (p) => { rt.t += T_DW; return hw.digitalRead(p); } },
    analogRead: {
      ret: 'int',
      fn: (p) => {
        rt.t += avr ? 112 : 20;
        const pin = toAnalogPin(p);
        const v = hw.analogRead(pin);
        const max = 2 ** adcBits;
        const val = Math.floor((v / vref()) * max);
        return Math.max(0, Math.min(max - 1, val));
      },
    },
    analogWrite: {
      ret: 'void',
      fn: (p, v) => {
        rt.t += T_DW * 2;
        const max = 2 ** pwmBits - 1;
        v = Math.max(0, Math.min(max, v | 0));
        hw.analogWrite(p, v / max, v, max);
      },
    },
    analogReference: { ret: 'void', fn: () => {} },
    delay: { ret: 'void', gen: true, fn: function* (ms) { yield* rt.waitUntil(rt.t + Math.max(0, ms >>> 0) * 1000); } },
    delayMicroseconds: { ret: 'void', gen: true, fn: function* (us) { yield* rt.waitUntil(rt.t + Math.max(0, us & 0xffffffff)); } },
    millis: { ret: 'ulong', fn: () => Math.floor(rt.t / 1000) >>> 0 },
    micros: { ret: 'ulong', fn: () => (avr ? Math.floor(rt.t / 4) * 4 : Math.floor(rt.t)) >>> 0 },
    yield: { ret: 'void', gen: true, fn: function* () { if (rt.t >= rt.limit) yield 0; } },
    pulseIn: {
      ret: 'ulong', gen: true,
      fn: function* (pin, state, timeout = 1000000) {
        const r = hw.pulseIn(pin, state ? 1 : 0, timeout);
        if (!r) { yield* rt.waitUntil(rt.t + timeout); return 0; }
        yield* rt.waitUntil(rt.t + r.start + r.width);
        return Math.round(r.width) >>> 0;
      },
    },
    tone: { ret: 'void', fn: (pin, freq, dur) => hw.tone(pin, freq, dur || 0) },
    noTone: { ret: 'void', fn: (pin) => hw.noTone(pin) },
    shiftOut: {
      ret: 'void',
      fn: (dataPin, clockPin, bitOrder, val) => {
        for (let i = 0; i < 8; i++) {
          const bit = bitOrder === 0 ? (val >> i) & 1 : (val >> (7 - i)) & 1;
          hw.digitalWrite(dataPin, bit);
          hw.digitalWrite(clockPin, 1);
          hw.digitalWrite(clockPin, 0);
        }
        rt.t += T_DW * 24;
      },
    },
    shiftIn: {
      ret: 'u8',
      fn: (dataPin, clockPin, bitOrder) => {
        let value = 0;
        for (let i = 0; i < 8; i++) {
          hw.digitalWrite(clockPin, 1);
          const b = hw.digitalRead(dataPin);
          if (bitOrder === 0) value |= b << i; else value |= b << (7 - i);
          hw.digitalWrite(clockPin, 0);
        }
        rt.t += T_DW * 24;
        return value;
      },
    },
    attachInterrupt: {
      ret: 'void', args: ['num', 'raw', 'num'],
      fn: (num, fn, mode) => {
        const pin = intToPin(num);
        if (pin < 0) { rt.warnOnce('int:' + num, `attachInterrupt: interrupt ${num} is not available on this board. Use digitalPinToInterrupt(pin).`); return; }
        hw.attachInterrupt(pin, fn, mode);
      },
    },
    detachInterrupt: { ret: 'void', fn: (num) => hw.detachInterrupt(intToPin(num)) },
    digitalPinToInterrupt: {
      ret: 'int',
      fn: (p) => {
        if (!board.interruptPins) return p;
        const i = board.interruptPins.indexOf(p);
        return i;
      },
    },
    interrupts: { ret: 'void', fn: () => { rt.interruptsEnabled = true; } },
    noInterrupts: { ret: 'void', fn: () => { rt.interruptsEnabled = false; } },
    sei: { ret: 'void', fn: () => { rt.interruptsEnabled = true; } },
    cli: { ret: 'void', fn: () => { rt.interruptsEnabled = false; } },

    // math
    abs: { ret: 'arg0', fn: (x) => (x < 0 ? -x : x) },
    fabs: { ret: 'double', fn: Math.abs },
    labs: { ret: 'long', fn: Math.abs },
    min: { ret: 'common', fn: (a, b) => (a < b ? a : b) },
    max: { ret: 'common', fn: (a, b) => (a > b ? a : b) },
    fmin: { ret: 'double', fn: Math.min },
    fmax: { ret: 'double', fn: Math.max },
    constrain: { ret: 'common', fn: (x, a, b) => (x < a ? a : x > b ? b : x) },
    map: {
      ret: 'long',
      fn: (x, inMin, inMax, outMin, outMax) => {
        if (inMax === inMin) { rt.warnOnce('map0', 'map(): in_min equals in_max (division by zero)'); return -1; }
        const num = (x - inMin) * (outMax - outMin);
        return (Math.trunc(num / (inMax - inMin)) + outMin) | 0;
      },
    },
    sq: { ret: 'arg0', fn: (x) => x * x },
    sqrt: { ret: 'double', fn: Math.sqrt },
    sqrtf: { ret: 'float', fn: Math.sqrt },
    cbrt: { ret: 'double', fn: Math.cbrt },
    pow: { ret: 'double', fn: Math.pow },
    powf: { ret: 'float', fn: Math.pow },
    exp: { ret: 'double', fn: Math.exp },
    log: { ret: 'double', fn: Math.log },
    log10: { ret: 'double', fn: Math.log10 },
    log2: { ret: 'double', fn: Math.log2 },
    sin: { ret: 'double', fn: Math.sin },
    cos: { ret: 'double', fn: Math.cos },
    tan: { ret: 'double', fn: Math.tan },
    asin: { ret: 'double', fn: Math.asin },
    acos: { ret: 'double', fn: Math.acos },
    atan: { ret: 'double', fn: Math.atan },
    atan2: { ret: 'double', fn: Math.atan2 },
    sinh: { ret: 'double', fn: Math.sinh },
    cosh: { ret: 'double', fn: Math.cosh },
    tanh: { ret: 'double', fn: Math.tanh },
    hypot: { ret: 'double', fn: Math.hypot },
    floor: { ret: 'double', fn: Math.floor },
    ceil: { ret: 'double', fn: Math.ceil },
    trunc: { ret: 'double', fn: Math.trunc },
    fmod: { ret: 'double', fn: (a, b) => a % b },
    round: { ret: 'long', fn: (x) => (x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5)) },
    lround: { ret: 'long', fn: (x) => (x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5)) },
    roundf: { ret: 'float', fn: (x) => (x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5)) },
    isnan: { ret: 'int', fn: (x) => (Number.isNaN(x) ? 1 : 0) },
    isinf: { ret: 'int', fn: (x) => (x === Infinity ? 1 : x === -Infinity ? -1 : 0) },
    radians: { ret: 'double', fn: (d) => (d * Math.PI) / 180 },
    degrees: { ret: 'double', fn: (r) => (r * 180) / Math.PI },
    random: {
      ret: 'long',
      fn: (a, b) => {
        if (b === undefined) { if (a === 0 || a === undefined) return 0; return rng.next() % a; }
        if (a >= b) return a;
        return (rng.next() % (b - a)) + a;
      },
    },
    randomSeed: { ret: 'void', fn: (s) => { if (s !== 0) rng.seed(s); } },
    rand: { ret: 'int', fn: () => rng.next() & 0x7fff },
    srand: { ret: 'void', fn: (s) => rng.seed(s) },
    lowByte: { ret: 'u8', fn: (w) => w & 255 },
    highByte: { ret: 'u8', fn: (w) => (w >> 8) & 255 },
    bitRead: { ret: 'int', fn: (v, b) => (Math.floor(v / 2 ** b) & 1) },
    bit: { ret: 'ulong', fn: (b) => (2 ** b) >>> 0 },
    bitSet: { ret: 'void', lvalueArgs: [0], fn: (r, b) => r.set(r.get() | (1 << b)) },
    bitClear: { ret: 'void', lvalueArgs: [0], fn: (r, b) => r.set(r.get() & ~(1 << b)) },
    bitWrite: { ret: 'void', lvalueArgs: [0], fn: (r, b, v) => r.set(v ? r.get() | (1 << b) : r.get() & ~(1 << b)) },
    bitToggle: { ret: 'void', lvalueArgs: [0], fn: (r, b) => r.set(r.get() ^ (1 << b)) },
    word: { ret: 'uint', fn: (h, l) => (l === undefined ? h & 0xffff : ((h & 255) << 8) | (l & 255)) },
    makeWord: { ret: 'uint', fn: (h, l) => ((h & 255) << 8) | (l & 255) },
    // flash helpers (identity on the simulator)
    F: { ret: 'cstr', args: ['raw'], fn: (s) => s },
    PSTR: { ret: 'cstr', args: ['raw'], fn: (s) => s },
    pgm_read_byte: { ret: 'u8', args: ['raw'], fn: (p) => readPtr(p, rt) & 255 },
    pgm_read_byte_near: { ret: 'u8', args: ['raw'], fn: (p) => readPtr(p, rt) & 255 },
    pgm_read_word: { ret: 'uint', args: ['raw'], fn: (p) => readPtr(p, rt) & 0xffff },
    pgm_read_word_near: { ret: 'uint', args: ['raw'], fn: (p) => readPtr(p, rt) & 0xffff },
    pgm_read_dword: { ret: 'ulong', args: ['raw'], fn: (p) => readPtr(p, rt) >>> 0 },
    pgm_read_float: { ret: 'float', args: ['raw'], fn: (p) => readPtr(p, rt) },
    pgm_read_ptr: { ret: 'any', args: ['raw'], fn: (p) => readPtr(p, rt) },
    abort: { ret: 'void', fn: () => { throw new RuntimeError('abort() called', rt.line); } },
    exit: { ret: 'void', fn: () => { throw new RuntimeError('exit() called — the program stopped', rt.line); } },
    freeMemory: { ret: 'int', fn: () => board.ram ? Math.floor(board.ram * 0.7) : 1500 },
    availableMemory: { ret: 'int', fn: () => board.ram ? Math.floor(board.ram * 0.7) : 1500 },
  };

  if (!avr) {
    functions.analogReadResolution = { ret: 'void', fn: (b) => { adcBits = Math.max(1, Math.min(16, b)); } };
    functions.analogWriteResolution = { ret: 'void', fn: (b) => { pwmBits = Math.max(1, Math.min(16, b)); } };
  }
  if (board.family === 'esp32') {
    functions.ledcSetup = { ret: 'double', fn: (ch, freq, res) => { ledcChannels.set(ch, { freq, res, pins: new Set() }); return freq; } };
    functions.ledcAttachPin = {
      ret: 'void',
      fn: (pin, ch) => {
        if (!ledcChannels.has(ch)) ledcChannels.set(ch, { freq: 5000, res: 8, pins: new Set() });
        ledcChannels.get(ch).pins.add(pin);
        hw.pinMode(pin, 1);
      },
    };
    functions.ledcAttach = { ret: 'bool', fn: (pin, freq, res) => { ledcChannels.set('p' + pin, { freq, res, pins: new Set([pin]) }); hw.pinMode(pin, 1); return 1; } };
    functions.ledcAttachChannel = { ret: 'bool', fn: (pin, freq, res, ch) => { ledcChannels.set(ch, { freq, res, pins: new Set([pin]) }); hw.pinMode(pin, 1); return 1; } };
    functions.ledcDetachPin = { ret: 'void', fn: (pin) => { for (const c of ledcChannels.values()) c.pins.delete(pin); } };
    functions.ledcDetach = { ret: 'bool', fn: (pin) => { ledcChannels.delete('p' + pin); return 1; } };
    functions.ledcWrite = {
      ret: 'void',
      fn: (chOrPin, duty) => {
        let c = ledcChannels.get(chOrPin);
        if (!c) c = ledcChannels.get('p' + chOrPin);
        if (!c) return;
        const max = 2 ** c.res - 1;
        for (const pin of c.pins) hw.analogWrite(pin, Math.min(1, duty / max), duty, max);
      },
    };
    functions.ledcWriteTone = {
      ret: 'double',
      fn: (ch, freq) => {
        let c = ledcChannels.get(ch) || ledcChannels.get('p' + ch);
        if (!c) return 0;
        for (const pin of c.pins) { if (freq > 0) hw.tone(pin, freq, 0); else hw.noTone(pin); }
        return freq;
      },
    };
    functions.dacWrite = { ret: 'void', fn: (pin, v) => hw.analogOut ? hw.analogOut(pin, (v & 255) / 255 * 3.3) : null };
    functions.touchRead = { ret: 'u16', fn: (pin) => (hw.touchRead ? hw.touchRead(pin) : 60) };
    functions.hallRead = { ret: 'int', fn: () => 0 };
    functions.temperatureRead = { ret: 'float', fn: () => 45.5 };
    functions.esp_random = { ret: 'u32', fn: () => (Math.random() * 2 ** 32) >>> 0 };
    functions.vTaskDelay = { ret: 'void', gen: true, fn: function* (ticks) { yield* rt.waitUntil(rt.t + ticks * 1000); } };
  }

  Object.assign(functions, makeStringNatives(rt, avr));

  // ---- global objects
  const globals = {};
  const classes = {};
  const serialMeta = serialClassMeta(board.arch);
  classes.HardwareSerial = serialMeta;
  const serials = [];
  for (const port of board.serialPorts || ['Serial']) {
    const s = new HardwareSerial(rt, hw, port, board);
    serials.push(s);
    globals[port] = { cls: 'HardwareSerial', value: s };
  }

  // EEPROM
  const eeprom = new EEPROMClass(rt, hw, board.eeprom || 1024);
  classes.EEPROMClass = {
    name: 'EEPROMClass',
    create: () => eeprom,
    methods: {
      begin: { ret: 'bool' },
      commit: { ret: 'bool' },
      end: { ret: 'void' },
      length: { ret: 'uint' },
      read: { ret: 'u8' },
      write: { ret: 'void' },
      update: { ret: 'void' },
      put: {
        ret: 'void', typed: true,
        fnWithThis: (o, types, addr, val) => {
          const bytes = typedToBytes(types[1], val, avr);
          if (bytes) bytes.forEach((b, i) => o.update(addr + i, b));
          else if (Array.isArray(val)) val.forEach((b, i) => o.update(addr + i, b & 255));
          return val;
        },
      },
      get: {
        ret: 'void', lvalueArgs: [1],
        compile: (c, args, node, retT, thisE) => {
          const target = args[1];
          const t = target.t;
          const O = thisE.fn, A = args[0].fn, R = target.fn;
          if (thisE.gen || args[0].gen || target.gen) throw c.err('EEPROM.get arguments cannot block', node);
          return { t: c.T.void, gen: false, fn: (f) => {
            const o = O(f), addr = A(f), ref = R(f);
            const n = t.k === 'float' ? (t.bits === 32 || avr ? 4 : 8) : t.k === 'int' ? Math.max(1, t.bits / 8) : 0;
            if (!n) return;
            const bytes = [];
            for (let i = 0; i < n; i++) bytes.push(o.read(addr + i));
            ref.set(bytesToTyped(t, bytes, avr));
          } };
        },
      },
    },
  };
  globals.EEPROM = { cls: 'EEPROMClass', value: eeprom };

  const constants = {
    HIGH: 1, LOW: 0, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, INPUT_PULLDOWN: 3, OUTPUT_OPEN_DRAIN: 4,
    LSBFIRST: 0, MSBFIRST: 1, CHANGE: 1, FALLING: 2, RISING: 3,
    DEC: 10, HEX: 16, OCT: 8, BIN: 2,
    PI: { value: Math.PI, type: 'double' }, HALF_PI: { value: Math.PI / 2, type: 'double' }, TWO_PI: { value: Math.PI * 2, type: 'double' },
    DEG_TO_RAD: { value: Math.PI / 180, type: 'double' }, RAD_TO_DEG: { value: 180 / Math.PI, type: 'double' },
    EULER: { value: Math.E, type: 'double' }, M_PI: { value: Math.PI, type: 'double' }, M_E: { value: Math.E, type: 'double' },
    SQRT2: { value: Math.SQRT2, type: 'double' },
    DEFAULT: 1, INTERNAL: 3, EXTERNAL: 0, INTERNAL1V1: 2, INTERNAL2V56: 3, AR_DEFAULT: 1,
    NOT_AN_INTERRUPT: -1,
    SERIAL_8N1: 6, SERIAL_8N2: 14, SERIAL_7E1: 36, SERIAL_8E1: 38,
    INT_MAX: avr ? 32767 : 2147483647, INT_MIN: avr ? -32768 : -2147483648,
    UINT_MAX: avr ? 65535 : { value: 4294967295, type: 'ulong' },
    LONG_MAX: { value: 2147483647, type: 'long' }, LONG_MIN: { value: -2147483648, type: 'long' },
    ULONG_MAX: { value: 4294967295, type: 'ulong' },
    INT8_MAX: 127, INT8_MIN: -128, UINT8_MAX: 255, INT16_MAX: 32767, INT16_MIN: -32768, UINT16_MAX: 65535,
    INT32_MAX: { value: 2147483647, type: 'long' }, UINT32_MAX: { value: 4294967295, type: 'ulong' },
    FLT_MAX: { value: 3.4028235e38, type: 'float' }, FLT_MIN: { value: 1.17549435e-38, type: 'float' },
    DBL_MAX: { value: avr ? 3.4028235e38 : Number.MAX_VALUE, type: 'double' },
    RAND_MAX: 0x7fff,
    LED_BUILTIN: board.ledBuiltin,
    NUM_DIGITAL_PINS: board.numDigital || 20, NUM_ANALOG_INPUTS: analogPins.length,
    F_CPU: { value: board.mhz * 1e6, type: 'ulong' },
    NAN: { value: NaN, type: 'double' }, INFINITY: { value: Infinity, type: 'double' },
  };
  (board.analogPins || []).forEach((p, i) => { constants['A' + i] = p; });
  if (board.constants) Object.assign(constants, board.constants);

  return {
    functions, classes, globals, constants, serials,
    serialAvailable: () => serials.some((s) => s.rx.length > 0),
  };
}

function readPtr(p, rt) {
  if (p instanceof Ptr) {
    if (typeof p.a === 'string') return p.a.charCodeAt(p.i) || 0;
    return p.a[p.i] ?? 0;
  }
  if (p instanceof Ref) return p.get();
  if (Array.isArray(p)) return p[0] ?? 0;
  if (typeof p === 'string') return p.charCodeAt(0) || 0;
  if (typeof p === 'number') return p;
  throw new RuntimeError('Invalid pointer for pgm_read', rt.line);
}
