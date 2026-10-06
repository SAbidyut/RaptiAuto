// MicroPython hardware modules on top of the simulation engine: machine (Pin, ADC, PWM, Timer, I2C, UART, ...),
// neopixel, dht, hcsr04, onewire / ds18x20 and ssd1306.
import {
  hooks, Fl, mkf, isNum, toNum, tuple, PyDict, PyBytes, NativeFn, NativeClass, NativeObj, PyModule, PyInstance, EXC, newExc, PyError, pyErr, toList, toInt, typeName, pyStr, iterate,
} from './values.js';
import { glyph } from '../../components/font5x7.js';

const fn = (name, f, gen = false) => new NativeFn(name, f, gen);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const kwGet = (kw, name, dflt) => (kw && name in kw && kw[name] !== undefined ? kw[name] : dflt);
const callSync = (...a) => hooks.callSync(...a);

/** Thrown by machine.reset() / soft_reset(); the runner restarts the program. */
export class ResetSignal { constructor(hard) { this.hard = hard; } }

function oserr(code, text) { return new PyError(newExc(EXC.OSError, [code, text])); }

/** Methods table -> getAttr. */
function withMethods(obj, table, typeName_) {
  obj.typeName = typeName_;
  obj.getAttr = function (name) {
    const m = table[name];
    if (!m) return undefined;
    if (m.gen) return new NativeFn(name, (a, kw) => m.fn.call(this, a, kw), true);
    return new NativeFn(name, (a, kw) => m.call(this, a, kw));
  };
  return obj;
}

export function makeHwModules(ctx) {
  const { hw, board, rt } = ctx;
  const out = {};
  const needHw = () => { if (!hw || !board) throw pyErr('RuntimeError', 'no board in this circuit'); return hw; };
  const fam = board ? board.family : '';
  const rp2 = fam === 'rp2040';
  const IRQ_RISING = rp2 ? 8 : 1, IRQ_FALLING = rp2 ? 4 : 2;

  // ------------------------------------------------------------------ Pin
  const reverse = {};
  if (board) for (const [num, id] of Object.entries(board.pinMap || {})) reverse[id] = +num;
  const pinNum = (v) => {
    if (v instanceof PinObj) return v.n;
    if (typeof v === 'number' && Number.isInteger(v)) return v;
    if (typeof v === 'string') {
      if (v === 'LED') return board.ledBuiltin;
      if (/^GP\d+$/.test(v)) return +v.slice(2);
      if (v in reverse) return reverse[v];
      if (/^\d+$/.test(v)) return +v;
    }
    throw pyErr('ValueError', `invalid pin ${pyStr(v)}`);
  };

  function applyMode(n, mode, pull, value) {
    const h = needHw();
    if (mode === 1) { // OUT
      h.pinMode(n, 1);
      if (value !== undefined && value !== null) h.digitalWrite(n, value ? 1 : 0);
    } else if (mode === 2) { // OPEN_DRAIN
      h.pinMode(n, 4);
      if (value !== undefined && value !== null) h.digitalWrite(n, value ? 1 : 0);
    } else if (mode === 0) { // IN
      h.pinMode(n, pull === 1 ? 2 : pull === 2 ? 3 : 0);
    } else if (pull !== undefined && pull !== null && pull >= 0) {
      const st = h.pin(n);
      if (st && st.mode !== 1) h.pinMode(n, pull === 1 ? 2 : pull === 2 ? 3 : 0);
    }
  }

  const PIN_METHODS = {
    value(a) {
      const h = needHw();
      if (a.length && a[0] !== null) {
        const st = h.pin(this.n);
        if (st && st.mode !== 1 && st.mode !== 4) { st.out = a[0] ? 1 : 0; return null; }
        h.digitalWrite(this.n, a[0] ? 1 : 0);
        rt.t += 8;
        return null;
      }
      rt.t += 10;
      return h.digitalRead(this.n);
    },
    on() { needHw().digitalWrite(this.n, 1); return null; },
    off() { needHw().digitalWrite(this.n, 0); return null; },
    high() { needHw().digitalWrite(this.n, 1); return null; },
    low() { needHw().digitalWrite(this.n, 0); return null; },
    toggle() { const h = needHw(); const st = h.pin(this.n); h.digitalWrite(this.n, st && st.out ? 0 : 1); return null; },
    init(a, kw) {
      applyMode(this.n, kwGet(kw, 'mode', a[0] ?? -1), kwGet(kw, 'pull', a[1] ?? -1), kwGet(kw, 'value', undefined));
      return null;
    },
    irq(a, kw) {
      const h = needHw();
      const handler = kwGet(kw, 'handler', a[0] ?? null);
      const trigger = kwGet(kw, 'trigger', a[1] ?? (IRQ_RISING | IRQ_FALLING));
      if (handler === null) { h.detachInterrupt(this.n); return null; }
      const rising = (trigger & IRQ_RISING) !== 0, falling = (trigger & IRQ_FALLING) !== 0;
      const mode = rising && falling ? 1 : rising ? 3 : 2;
      const fi = { pyfn: handler, args: [this] };
      h.attachInterrupt(this.n, fi, mode);
      return null;
    },
    mode() { return 0; },
    pull() { return null; },
  };
  class PinObj extends NativeObj {
    constructor(n) { super(); this.n = n; }
    getAttr(name) {
      const m = PIN_METHODS[name];
      return m ? new NativeFn(name, (a, kw) => m.call(this, a, kw)) : undefined;
    }
    call(a, kw) { return PIN_METHODS.value.call(this, a, kw); }
    repr() { return `Pin(${this.n})`; }
  }
  PinObj.prototype.typeName = 'Pin';
  const Pin = new NativeClass('Pin', (a, kw) => {
    if (!a.length && !kw.id) throw pyErr('TypeError', 'Pin() missing required argument: id');
    const n = pinNum(a.length ? a[0] : kw.id);
    const h = needHw();
    if (!h.pin(n)) throw pyErr('ValueError', `invalid pin ${n}`);
    const p = new PinObj(n);
    p.cls = Pin;
    const mode = kwGet(kw, 'mode', a[1] ?? -1), pull = kwGet(kw, 'pull', a[2] ?? -1), value = kwGet(kw, 'value', undefined);
    if (mode !== -1 || (pull !== -1 && pull !== null) || value !== undefined) applyMode(n, mode, pull, value);
    return p;
  }, {
    IN: 0, OUT: 1, OPEN_DRAIN: 2, PULL_UP: 1, PULL_DOWN: 2, IRQ_RISING, IRQ_FALLING, IRQ_LOW_LEVEL: 4, IRQ_HIGH_LEVEL: 8,
  });

  // ------------------------------------------------------------------ ADC
  const ATTN_FS = [1.1, 1.5, 2.2, 3.3];
  const adcBits = fam === 'esp32' ? 12 : fam === 'esp8266' ? 10 : 16;
  const ADC = new NativeClass('ADC', (a) => {
    const arg = a[0];
    let n;
    if (arg instanceof PinObj) n = arg.n;
    else if (typeof arg === 'number') {
      if (rp2 && arg >= 0 && arg <= 3) n = 26 + arg;
      else if (rp2 && arg === 4) n = 'temp';
      else if (fam === 'esp8266' && arg === 0) n = +Object.keys(board.pinMap).find((k) => board.pinMap[k] === 'A0');
      else n = arg;
    } else n = pinNum(arg);
    const o = new NativeObj();
    o.cls = ADC;
    o.atten = fam === 'esp32' ? 0 : 3;
    o.n = n;
    const volts = () => {
      if (n === 'temp') return 0.706 - (27 - 27) * 0.001721; // ~27 °C
      rt.t += 20;
      const h = needHw();
      const st = h.pin(n);
      if (!st) throw pyErr('ValueError', `invalid pin ${n}`);
      return h.analogRead(n);
    };
    const frac = () => clamp(volts() / (fam === 'esp32' ? ATTN_FS[o.atten] : board.vcc), 0, 1);
    withMethods(o, {
      read_u16() { return Math.round(frac() * 65535); },
      read() { return Math.round(frac() * (fam === 'esp32' ? 4095 : 1023)); },
      read_uv() { return Math.round(Math.min(volts(), fam === 'esp32' ? ATTN_FS[o.atten] : board.vcc) * 1e6); },
      atten(aa) { o.atten = clamp(toInt(aa[0] ?? 0), 0, 3); return null; },
      width() { return null; },
    }, 'ADC');
    return o;
  }, { ATTN_0DB: 0, ATTN_2_5DB: 1, ATTN_6DB: 2, ATTN_11DB: 3, WIDTH_9BIT: 9, WIDTH_10BIT: 10, WIDTH_11BIT: 11, WIDTH_12BIT: 12 });

  // ------------------------------------------------------------------ PWM
  const maxDuty = fam === 'rp2040' ? 65535 : 1023;
  const PWM = new NativeClass('PWM', (a, kw) => {
    const n = pinNum(a[0]);
    needHw();
    const st = { freq: kwGet(kw, 'freq', a[1] ?? 1000), frac: 0, on: true };
    const o = new NativeObj();
    o.cls = PWM;
    const apply = () => {
      const h = needHw();
      const f = toNum(st.freq) || 1;
      const frac = st.on ? clamp(st.frac, 0, 1) : 0;
      if (f >= 40 && f <= 60) { h.setServo(n, frac > 0 ? frac * 1e6 / f : null); return; }
      const buzzers = h.partsOnPin(n, (r) => r.def && r.def.type === 'buzzer');
      if (buzzers.length) { if (frac > 0.02) h.tone(n, Math.round(f), 0); else h.noTone(n); return; }
      h.analogWrite(n, frac, Math.round(frac * 255), 255, f);
    };
    const setDuty = (v, max) => { st.frac = clamp(toNum(v) / max, 0, 1); apply(); };
    withMethods(o, {
      freq(aa) { if (aa.length) { st.freq = toNum(aa[0]); apply(); return null; } return Math.round(toNum(st.freq)); },
      duty(aa) { if (aa.length) { setDuty(aa[0], 1023); return null; } return Math.round(st.frac * 1023); },
      duty_u16(aa) { if (aa.length) { setDuty(aa[0], 65535); return null; } return Math.round(st.frac * 65535); },
      duty_ns(aa) { if (aa.length) { st.frac = clamp((toNum(aa[0]) / 1e9) * toNum(st.freq), 0, 1); apply(); return null; } return Math.round((st.frac / toNum(st.freq)) * 1e9); },
      init(aa, k) { if ('freq' in k) st.freq = toNum(k.freq); if ('duty' in k) st.frac = clamp(toNum(k.duty) / 1023, 0, 1); if ('duty_u16' in k) st.frac = clamp(toNum(k.duty_u16) / 65535, 0, 1); st.on = true; apply(); return null; },
      deinit() { st.on = false; apply(); return null; },
    }, 'PWM');
    if ('duty' in kw) st.frac = clamp(toNum(kw.duty) / 1023, 0, 1);
    if ('duty_u16' in kw) st.frac = clamp(toNum(kw.duty_u16) / 65535, 0, 1);
    if ('duty_ns' in kw) st.frac = clamp((toNum(kw.duty_ns) / 1e9) * toNum(st.freq), 0, 1);
    if (st.frac > 0 || 'freq' in kw || 'duty' in kw) apply();
    return o;
  });
  void maxDuty;

  // ------------------------------------------------------------------ Timer
  const Timer = new NativeClass('Timer', (a, kw) => {
    const o = new NativeObj();
    o.cls = Timer;
    let token = 0;
    const init = (k) => {
      const h = needHw();
      const mode = kwGet(k, 'mode', 1);
      const cb = kwGet(k, 'callback', null);
      const period = k.freq !== undefined ? 1000 / toNum(k.freq) : toNum(kwGet(k, 'period', 1000));
      const my = ++token;
      const fire = (t) => {
        if (token !== my) return;
        if (cb) rt.queueIsr({ pyfn: cb, args: [o] });
        if (mode === 1) h.schedule(t + period * 1000, fire);
      };
      h.schedule(rt.t + period * 1000, fire);
    };
    withMethods(o, {
      init(aa, k) { init(k); return null; },
      deinit() { token++; return null; },
      value() { return 0; },
    }, 'Timer');
    if (Object.keys(kw).length) init(kw);
    return o;
  }, { ONE_SHOT: 0, PERIODIC: 1 });

  // ------------------------------------------------------------------ I2C
  const i2cDefault = () => (board && board.i2c) || { sda: 21, scl: 22 };
  function makeI2C(a, kw, name) {
    const o = new NativeObj();
    const dflt = i2cDefault();
    const sdaA = kwGet(kw, 'sda', null), sclA = kwGet(kw, 'scl', null);
    const sdaN = sdaA !== null ? pinNum(sdaA) : dflt.sda, sclN = sclA !== null ? pinNum(sclA) : dflt.scl;
    const devices = () => {
      const h = needHw();
      const sda = h.pinNode(sdaN), scl = h.pinNode(sclN);
      const out = [];
      if (sda < 0 || scl < 0) return out;
      for (const r of h.parts.values()) {
        if (!r.i2c) continue;
        const pa = r.def.i2cPins || { sda: 'SDA', scl: 'SCL' };
        if (h.nodeOf(r.part.id, pa.sda) === sda && h.nodeOf(r.part.id, pa.scl) === scl && (!r.powered || r.powered())) out.push(r);
      }
      return out;
    };
    o.devices = devices;
    const dev = (addr) => { const d = devices().find((r) => r.i2c.address === addr); if (!d) throw oserr(19, 'ENODEV'); return d; };
    const bytesOf = (b) => (b instanceof PyBytes ? b.a : toList(b).map((x) => toInt(x) & 255));
    withMethods(o, {
      scan() { rt.t += 4000; return devices().map((r) => r.i2c.address).sort((x, y) => x - y); },
      writeto(aa) { const d = dev(toInt(aa[0])); rt.t += 400; if (d.i2cWrite) d.i2cWrite(bytesOf(aa[1])); return bytesOf(aa[1]).length; },
      readfrom(aa) { const d = dev(toInt(aa[0])); rt.t += 400; return new PyBytes(d.i2cRead ? d.i2cRead(toInt(aa[1])) : new Array(toInt(aa[1])).fill(0)); },
      writeto_mem(aa) { const d = dev(toInt(aa[0])); if (d.i2cWrite) d.i2cWrite([toInt(aa[1]) & 255, ...bytesOf(aa[2])]); return null; },
      readfrom_mem(aa) { const d = dev(toInt(aa[0])); if (d.i2cWrite) d.i2cWrite([toInt(aa[1]) & 255]); return new PyBytes(d.i2cRead ? d.i2cRead(toInt(aa[2])) : new Array(toInt(aa[2])).fill(0)); },
      init() { return null; },
      deinit() { return null; },
    }, name);
    return o;
  }
  const I2C = new NativeClass('I2C', (a, kw) => makeI2C(a, kw, 'I2C'));
  const SoftI2C = new NativeClass('SoftI2C', (a, kw) => makeI2C(a, kw, 'SoftI2C'));

  // ------------------------------------------------------------------ UART / SPI (data goes nowhere, but the API exists)
  const UART_DEFAULTS = rp2 ? [{ tx: 0, rx: 1 }, { tx: 4, rx: 5 }] : [{ tx: 1, rx: 3 }, { tx: 10, rx: 9 }, { tx: 17, rx: 16 }];
  const UART = new NativeClass('UART', (a, kw) => {
    const id = a.length ? toInt(a[0]) : 0;
    const d = UART_DEFAULTS[id] || {};
    const st = { tx: d.tx ?? -1, rx: d.rx ?? -1, buf: '', baud: 9600 };
    const o = new NativeObj();
    o.cls = UART;
    const configure = (aa, k) => {
      const baud = kwGet(k, 'baudrate', aa[0]);
      if (baud !== undefined && baud !== null) st.baud = toNum(baud);
      if (k.tx !== undefined && k.tx !== null) st.tx = pinNum(k.tx);
      if (k.rx !== undefined && k.rx !== null) st.rx = pinNum(k.rx);
    };
    configure(a.slice(1), kw);
    if (hw && hw.registerUart) hw.registerUart({ get rxPin() { return st.rx; }, feed(text) { st.buf += text; } });
    const text = (b) => (b instanceof PyBytes ? String.fromCharCode(...b.a) : pyStr(b));
    const bytes = (s) => new PyBytes([...s].map((c) => c.charCodeAt(0) & 255));
    withMethods(o, {
      init(aa, k) { configure(aa, k); return null; },
      deinit() { return null; },
      any() { return st.buf.length; },
      read(aa) {
        if (!st.buf.length) return null;
        const n = aa.length && aa[0] !== null ? toInt(aa[0]) : st.buf.length;
        const out = st.buf.slice(0, n);
        st.buf = st.buf.slice(out.length);
        return bytes(out);
      },
      readline() {
        const i = st.buf.indexOf('\n');
        if (i < 0) return null;
        const out = st.buf.slice(0, i + 1);
        st.buf = st.buf.slice(i + 1);
        return bytes(out);
      },
      write(aa) {
        const s = text(aa[0]);
        rt.t += s.length * (1e7 / st.baud);
        needHw().uartSend(st.tx, s);
        return s.length;
      },
      flush() { return null; },
      sendbreak() { return null; },
      txdone() { return true; },
    }, 'UART');
    return o;
  }, { RTS: 1, CTS: 2 });
  const SPI = new NativeClass('SPI', () => {
    const o = new NativeObj();
    withMethods(o, { init() { return null; }, deinit() { return null; }, write() { return null; }, read(aa) { return new PyBytes(new Array(toInt(aa[0])).fill(0)); }, write_readinto() { return null; } }, 'SPI');
    return o;
  }, { MSB: 0, LSB: 1 });

  const WDT = new NativeClass('WDT', () => { const o = new NativeObj(); withMethods(o, { feed() { return null; } }, 'WDT'); return o; });
  const RTC = new NativeClass('RTC', () => {
    const o = new NativeObj();
    withMethods(o, {
      datetime(aa) { if (aa.length) return null; const t = ctx.modules.time.attrs.localtime.fn([], {}); const l = toList(t); return tuple([l[0], l[1], l[2], l[6], l[3], l[4], l[5], 0]); },
      init() { return null; },
    }, 'RTC');
    return o;
  });

  out.machine = new PyModule('machine', {
    Pin, ADC, PWM, Timer, I2C, SoftI2C, UART, SPI, SoftSPI: SPI, WDT, RTC,
    freq: fn('freq', (a) => (a.length ? null : Math.round((board ? board.mhz : 160) * 1e6))),
    reset: fn('reset', () => { throw new ResetSignal(true); }),
    soft_reset: fn('soft_reset', () => { throw new ResetSignal(false); }),
    unique_id: fn('unique_id', () => new PyBytes([0xde, 0xad, 0xbe, 0xef, 0x52, 0x41])),
    idle: fn('idle', () => null),
    disable_irq: fn('disable_irq', () => 0), enable_irq: fn('enable_irq', () => null),
    lightsleep: fn('lightsleep', function* (a) { yield* rt.waitUntil(rt.t + (a.length ? toNum(a[0]) : 0) * 1000); return null; }, true),
    deepsleep: fn('deepsleep', function* (a) { yield* rt.waitUntil(rt.t + (a.length ? toNum(a[0]) : 0) * 1000); throw new ResetSignal(true); }, true),
    time_pulse_us: fn('time_pulse_us', function* (a) {
      const h = needHw();
      const n = pinNum(a[0]);
      const level = toNum(a[1]) ? 1 : 0;
      const timeout = a.length > 2 ? toNum(a[2]) : 1000000;
      const r = h.pulseIn(n, level, timeout);
      if (!r) { yield* rt.waitUntil(rt.t + timeout); return -2; }
      yield* rt.waitUntil(rt.t + r.start + r.width);
      return Math.round(r.width);
    }, true),
    mem8: new NativeObj(), mem32: new NativeObj(),
  });

  // ------------------------------------------------------------------ neopixel
  out.neopixel = new PyModule('neopixel', {
    NeoPixel: new NativeClass('NeoPixel', (a, kw) => {
      const n = pinNum(a[0]);
      const count = toInt(a[1]);
      const bpp = kwGet(kw, 'bpp', a[2] ?? 3);
      needHw().pinMode(n, 1);
      const px = Array.from({ length: count }, () => [0, 0, 0]);
      const o = new NativeObj();
      o.typeName = 'NeoPixel';
      o.len = () => count;
      o.getItem = (k) => { const i = toInt(k); const c = px[i < 0 ? i + count : i]; if (!c) throw pyErr('IndexError', 'index out of range'); return tuple(c.slice(0, bpp)); };
      o.setItem = (k, v) => {
        const i = toInt(k);
        const idx = i < 0 ? i + count : i;
        if (idx < 0 || idx >= count) throw pyErr('IndexError', 'index out of range');
        const l = toList(v).map((x) => toInt(x) & 255);
        px[idx] = [l[0] || 0, l[1] || 0, l[2] || 0];
      };
      o.iter = () => iterate(px.map((c) => tuple(c.slice(0, bpp))));
      withMethods(o, {
        write() {
          needHw().sendWs2812(n, px.map(([r, g, b]) => ((r << 16) | (g << 8) | b) >>> 0));
          rt.t += 30 * count + 50;
          return null;
        },
        fill(aa) { const l = toList(aa[0]).map((x) => toInt(x) & 255); for (let i = 0; i < count; i++) px[i] = [l[0] || 0, l[1] || 0, l[2] || 0]; return null; },
      }, 'NeoPixel');
      return o;
    }),
  });

  // ------------------------------------------------------------------ dht
  const dhtClass = (model) => new NativeClass('DHT' + model, (a) => {
    const n = pinNum(a[0]);
    const o = new NativeObj();
    let last = null;
    withMethods(o, {
      measure() {
        const h = needHw();
        rt.t += 5000;
        const found = h.partsOnPin(n, (r) => !!r.dht, 'DATA');
        if (!found.length) throw oserr(110, 'ETIMEDOUT');
        const s = found[0].rt;
        if (!s.powered()) throw oserr(110, 'ETIMEDOUT');
        last = s.read();
        return null;
      },
      temperature() { if (!last) throw pyErr('RuntimeError', 'call measure() first'); return mkf(model === 11 ? Math.round(last.t) : Math.round(last.t * 10) / 10); },
      humidity() { if (!last) throw pyErr('RuntimeError', 'call measure() first'); return mkf(model === 11 ? Math.round(last.h) : Math.round(last.h * 10) / 10); },
    }, 'DHT' + model);
    return o;
  });
  out.dht = new PyModule('dht', { DHT11: dhtClass(11), DHT22: dhtClass(22), DHT21: dhtClass(22) });

  // ------------------------------------------------------------------ hcsr04 (common helper driver)
  out.hcsr04 = new PyModule('hcsr04', {
    HCSR04: new NativeClass('HCSR04', (a, kw) => {
      const trig = pinNum(kwGet(kw, 'trigger_pin', a[0]));
      const echo = pinNum(kwGet(kw, 'echo_pin', a[1]));
      const o = new NativeObj();
      const pulse = () => {
        const h = needHw();
        const found = h.partsOnPin(echo, (r) => typeof r.measure === 'function', 'ECHO');
        if (!found.length) throw oserr(110, 'ETIMEDOUT');
        rt.t += 20000;
        const us = found[0].rt.measure();
        if (!us) throw oserr(110, 'ETIMEDOUT');
        return us;
      };
      void trig;
      withMethods(o, {
        distance_cm() { return mkf((pulse() / 2) / 29.1); },
        distance_mm() { return Math.round((pulse() / 2) / 2.91); },
        pulse_time() { return Math.round(pulse()); },
      }, 'HCSR04');
      return o;
    }),
  });

  // ------------------------------------------------------------------ onewire + ds18x20
  out.onewire = new PyModule('onewire', {
    OneWire: new NativeClass('OneWire', (a) => {
      const n = pinNum(a[0]);
      const o = new NativeObj();
      o.pin = n;
      withMethods(o, { reset() { return true; }, scan() { return needHw().partsOnPin(n, (r) => !!r.onewire, 'DQ').map((x, i) => new PyBytes([0x28, 0xff, 0x64, 0x1e, 0x0f, 0x00, 0x00, i])); } }, 'OneWire');
      return o;
    }),
  });
  out.ds18x20 = new PyModule('ds18x20', {
    DS18X20: new NativeClass('DS18X20', (a) => {
      const ow = a[0];
      const o = new NativeObj();
      const sensors = () => needHw().partsOnPin(ow.pin, (r) => !!r.onewire, 'DQ').map((x) => x.rt);
      withMethods(o, {
        scan() { return sensors().map((s, i) => new PyBytes([0x28, 0xff, 0x64, 0x1e, 0x0f, 0x00, 0x00, i])); },
        convert_temp() { rt.t += 750000; return null; },
        read_temp(aa) {
          const i = aa[0] instanceof PyBytes ? aa[0].a[7] : 0;
          const s = sensors()[i];
          if (!s) throw oserr(110, 'ETIMEDOUT');
          const st = s.status();
          if (!st.ok) {
            if (st.powered && !st.pulled) needHw().warn('DS18B20 does not answer: add a 4.7 kΩ pull-up between DQ and VCC.', null, 'dspull');
            throw pyErr('RuntimeError', 'onewire device error');
          }
          return mkf(Math.round(s.temp * 16) / 16);
        },
      }, 'DS18X20');
      return o;
    }),
  });

  // ------------------------------------------------------------------ ssd1306 (framebuf API)
  const F57 = (c) => glyph(c);
  out.ssd1306 = new PyModule('ssd1306', {
    SSD1306_I2C: new NativeClass('SSD1306_I2C', (a, kw) => {
      const w = toInt(a[0]), hgt = toInt(a[1]);
      const i2c = a[2];
      const addr = toInt(kwGet(kw, 'addr', a[3] ?? 0x3c));
      const fb = new Uint8Array(w * hgt);
      const o = new NativeObj();
      const find = () => (i2c && i2c.devices ? i2c.devices().find((r) => r.ssd1306 && r.i2c.address === addr) : null);
      const px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < w && y < hgt) fb[y * w + x] = c ? 1 : 0; };
      const hline = (x, y, l, c) => { for (let i = 0; i < l; i++) px(x + i, y, c); };
      const vline = (x, y, l, c) => { for (let i = 0; i < l; i++) px(x, y + i, c); };
      const line = (x0, y0, x1, y1, c) => {
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 4096; guard++) {
          px(x0, y0, c);
          if (x0 === x1 && y0 === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      };
      const fillRect = (x, y, rw, rh, c) => { for (let j = 0; j < rh; j++) hline(x, y + j, rw, c); };
      const col = (aa, i, d = 1) => (aa.length > i ? toInt(aa[i]) : d);
      withMethods(o, {
        fill(aa) { fb.fill(toInt(aa[0]) ? 1 : 0); return null; },
        pixel(aa) { if (aa.length > 2) { px(toInt(aa[0]), toInt(aa[1]), toInt(aa[2])); return null; } const x = toInt(aa[0]), y = toInt(aa[1]); return x >= 0 && y >= 0 && x < w && y < hgt ? fb[y * w + x] : null; },
        hline(aa) { hline(toInt(aa[0]), toInt(aa[1]), toInt(aa[2]), col(aa, 3)); return null; },
        vline(aa) { vline(toInt(aa[0]), toInt(aa[1]), toInt(aa[2]), col(aa, 3)); return null; },
        line(aa) { line(toInt(aa[0]), toInt(aa[1]), toInt(aa[2]), toInt(aa[3]), col(aa, 4)); return null; },
        rect(aa) { const [x, y, rw, rh] = aa.map(toInt); const c = col(aa, 4); hline(x, y, rw, c); hline(x, y + rh - 1, rw, c); vline(x, y, rh, c); vline(x + rw - 1, y, rh, c); return null; },
        fill_rect(aa) { fillRect(toInt(aa[0]), toInt(aa[1]), toInt(aa[2]), toInt(aa[3]), col(aa, 4)); return null; },
        text(aa) {
          const s = pyStr(aa[0]);
          let x = toInt(aa[1]);
          const y = toInt(aa[2]);
          const c = col(aa, 3);
          for (const ch of s) {
            const g = F57(ch.charCodeAt(0));
            for (let cx = 0; cx < 5; cx++) for (let ry = 0; ry < 7; ry++) if ((g[cx] >> ry) & 1) px(x + 1 + cx, y + ry, c);
            x += 8;
          }
          return null;
        },
        scroll(aa) {
          const dx = toInt(aa[0]), dy = toInt(aa[1]);
          const copy = fb.slice();
          fb.fill(0);
          for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < hgt) fb[ny * w + nx] = copy[y * w + x]; }
          return null;
        },
        show() {
          rt.t += 9000;
          const d = find();
          if (!d) { needHw().warn('OLED display not found on I²C — check SDA / SCL and power.', null, 'oledi2c'); return null; }
          d.ssd1306.on = true;
          d.ssd1306.load(fb);
          return null;
        },
        invert(aa) { const d = find(); if (d) { d.ssd1306.invert = !!toNum(aa[0]); d.ssd1306.version++; } return null; },
        contrast(aa) { const d = find(); if (d) { d.ssd1306.contrast = toInt(aa[0]) / 255; d.ssd1306.version++; } return null; },
        poweroff() { const d = find(); if (d) { d.ssd1306.on = false; d.ssd1306.version++; } return null; },
        poweron() { const d = find(); if (d) { d.ssd1306.on = true; d.ssd1306.version++; } return null; },
      }, 'SSD1306_I2C');
      o.width = w; o.height = hgt;
      const base = o.getAttr;
      o.getAttr = (name) => (name === 'width' ? w : name === 'height' ? hgt : base.call(o, name));
      return o;
    }),
  });

  void Fl; void isNum; void PyDict; void PyInstance; void typeName;
  return out;
}

