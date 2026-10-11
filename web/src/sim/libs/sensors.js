// Sensor & input libraries: DHT, DHTesp, NewPing, IRremote, OneWire/DallasTemperature, Wire,
// Adafruit_MPU6050, MPU6050, RTClib, Keypad.
import { addLibrary, defineClass } from './registry.js';
import { cstr, Ptr, AStr } from '../lang/values.js';

const NAN = NaN;

// ------------------------------------------------------------------ DHT
class DHTLib {
  constructor(rt, hw, [pin, type = 22]) { this.rt = rt; this.hw = hw; this.pin = pin; this.type = type; this.last = -1e12; this.t = NAN; this.h = NAN; }
  begin() { this.hw.pinMode(this.pin, 2); }
  sensor() {
    const found = this.hw.partsOnPin(this.pin, (r) => !!r.dht, 'DATA');
    if (!found.length) { this.hw.warn(`DHT sensor not found on pin ${this.pin} — connect its DATA (SDA) pin.`, null, 'dht' + this.pin); return null; }
    const s = found[0].rt;
    if (!s.powered()) { this.hw.warn('DHT sensor has no power (VCC / GND).', null, 'dhtpow'); return null; }
    return s;
  }
  read(force = false) {
    const now = this.rt.t;
    const minGap = this.type === 11 ? 1e6 : 2e6;
    if (!force && now - this.last < minGap && this.last > 0) return !Number.isNaN(this.t);
    this.last = now;
    this.rt.t += 5000;
    const s = this.sensor();
    if (!s) { this.t = NAN; this.h = NAN; return false; }
    if ((s.dht.model === 11) !== (this.type === 11)) {
      this.hw.warn(`DHT type mismatch: the code says DHT${this.type} but the sensor is a DHT${s.dht.model}.`, null, 'dhttype');
      this.t = NAN; this.h = NAN; return false;
    }
    const v = s.read();
    if (this.type === 11) { this.t = Math.round(v.t); this.h = Math.round(v.h); } else { this.t = Math.round(v.t * 10) / 10; this.h = Math.round(v.h * 10) / 10; }
    return true;
  }
  readTemperature(f = 0, force = 0) { this.read(force); return f ? this.t * 1.8 + 32 : this.t; }
  readHumidity(force = 0) { this.read(force); return this.h; }
  convertCtoF(c) { return c * 1.8 + 32; }
  convertFtoC(f) { return (f - 32) / 1.8; }
  computeHeatIndex(t, h, isF = 1) {
    let T = isF ? t : t * 1.8 + 32;
    let hi = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (h * 0.094));
    if (hi > 79) {
      hi = -42.379 + 2.04901523 * T + 10.14333127 * h - 0.22475541 * T * h - 0.00683783 * T * T - 0.05481717 * h * h + 0.00122874 * T * T * h + 0.00085282 * T * h * h - 0.00000199 * T * T * h * h;
      if (h < 13 && T >= 80 && T <= 112) hi -= ((13 - h) * 0.25) * Math.sqrt((17 - Math.abs(T - 95)) * 0.05882);
      else if (h > 85 && T >= 80 && T <= 87) hi += ((h - 85) * 0.1) * ((87 - T) * 0.2);
    }
    return isF ? hi : (hi - 32) / 1.8;
  }
  // DHTesp API
  setup(pin, model = 2) { this.pin = pin; this.type = model === 1 ? 11 : 22; this.begin(); }
  getTemperature() { return this.readTemperature(); }
  getHumidity() { return this.readHumidity(); }
  getTempAndHumidity() { this.read(); return { temperature: this.t, humidity: this.h }; }
  getStatusString() { return Number.isNaN(this.t) ? 'TIMEOUT' : 'OK'; }
  getMinimumSamplingPeriod() { return this.type === 11 ? 1000 : 2000; }
}
const DHT_METHODS = {
  begin: { ret: 'void' }, read: { ret: 'bool' }, readTemperature: { ret: 'float' }, readHumidity: { ret: 'float' },
  computeHeatIndex: { ret: 'float' }, convertCtoF: { ret: 'float' }, convertFtoC: { ret: 'float' },
  setup: { ret: 'void' }, getTemperature: { ret: 'float' }, getHumidity: { ret: 'float' }, getTempAndHumidity: { ret: 'TempAndHumidity' },
  getStatusString: { ret: 'cstr' }, getMinimumSamplingPeriod: { ret: 'int' },
};

// ------------------------------------------------------------------ NewPing
class NewPing {
  constructor(rt, hw, [trig, echo, max = 500]) { this.rt = rt; this.hw = hw; this.trig = trig; this.echo = echo === undefined ? trig : echo; this.max = max; }
  sensor() {
    const s = [...this.hw.parts.values()].find((r) => r.measure && this.hw.connected(r, 'TRIG', this.trig) && this.hw.connected(r, 'ECHO', this.echo));
    if (!s) this.hw.warn(`NewPing: no HC-SR04 found with TRIG=${this.trig} and ECHO=${this.echo}.`, null, 'np');
    return s;
  }
  * ping(max) {
    const s = this.sensor();
    const lim = (max || this.max) * 57 + 450;
    let us = s ? s.measure() : 0;
    if (us > lim) us = 0;
    yield* this.rt.waitUntil(this.rt.t + (us || lim) + 500);
    return Math.round(us);
  }
  * ping_cm(max) { const us = yield* this.ping(max); return Math.round(us / 57); }
  * ping_in(max) { const us = yield* this.ping(max); return Math.round(us / 146); }
  * ping_median(n = 5, max) {
    const vals = [];
    for (let i = 0; i < n; i++) { vals.push(yield* this.ping(max)); yield* this.rt.waitUntil(this.rt.t + 29000); }
    vals.sort((a, b) => a - b);
    return vals[Math.floor(n / 2)];
  }
  convert_cm(us) { return Math.round(us / 57); }
  convert_in(us) { return Math.round(us / 146); }
}

// ------------------------------------------------------------------ IRremote
function rev8(b) { let r = 0; for (let i = 0; i < 8; i++) if (b & (1 << i)) r |= 1 << (7 - i); return r; }
class IRReceiverLib {
  constructor(rt, hw, [pin = -1] = []) {
    this.rt = rt; this.hw = hw; this.pin = pin;
    this.decodedIRData = { command: 0, address: 0, protocol: 0, decodedRawData: 0, flags: 0, numberOfBits: 0 };
    this.results = null;
  }
  begin(pin, fb) { if (pin !== undefined) this.pin = pin; void fb; this.hw.pinMode(this.pin, 0); }
  enableIRIn() { this.begin(this.pin); }
  start() {}
  stop() {}
  isIdle() { return 1; }
  receiver() {
    const r = this.hw.partsOnPin(this.pin, (x) => !!x.ir, 'OUT');
    if (!r.length) this.hw.warn(`IR receiver not found on pin ${this.pin}.`, null, 'irpin');
    return r.length ? r[0].rt : null;
  }
  decode(res) {
    const r = this.receiver();
    if (!r || !r.queue.length) return 0;
    const ev = r.queue.shift();
    const cmd = ev.command & 255;
    const raw = ((((~cmd) & 255) << 24) | (cmd << 16) | (0xff << 8) | 0x00) >>> 0;
    Object.assign(this.decodedIRData, { command: cmd, address: 0, protocol: 8, decodedRawData: raw, numberOfBits: 32, flags: 0 });
    const old = ((0xff << 16) | (rev8(cmd) << 8) | ((~rev8(cmd)) & 255)) >>> 0;
    if (res && typeof res === 'object') { res.value = old; res.decode_type = 3; res.bits = 32; res.command = cmd; }
    this.lastOld = old;
    return 1;
  }
  resume() {}
  printIRResultShort(s) {
    const d = this.decodedIRData;
    const txt = `Protocol=NEC Address=0x${d.address.toString(16).toUpperCase()} Command=0x${d.command.toString(16).toUpperCase()} Raw-Data=0x${d.decodedRawData.toString(16).toUpperCase()} 32 bits LSB first\r\n`;
    if (s && s._write) s._write(txt);
  }
  printIRSendUsage() {}
}

// ------------------------------------------------------------------ OneWire / DallasTemperature
class OneWire { constructor(rt, hw, [pin]) { this.pin = pin; this.hw = hw; } reset() { return 1; } }
class DallasTemperature {
  constructor(rt, hw, [ow]) { this.rt = rt; this.hw = hw; this.ow = ow; this.res = 12; }
  sensors() { return this.ow ? this.hw.partsOnPin(this.ow.pin, (r) => !!r.onewire, 'DQ').map((x) => x.rt) : []; }
  begin() { if (this.ow) this.hw.pinMode(this.ow.pin, 0); const n = this.sensors().length; if (!n) this.hw.warn('DS18B20 not found on the OneWire pin.', null, 'ds18'); }
  getDeviceCount() { return this.sensors().filter((s) => s.status().powered).length; }
  getDS18Count() { return this.getDeviceCount(); }
  setResolution(r) { this.res = r || 12; }
  getResolution() { return this.res; }
  setWaitForConversion() {}
  * requestTemperatures() { yield* this.rt.waitUntil(this.rt.t + [94, 188, 375, 750][Math.max(0, Math.min(3, this.res - 9))] * 1000); return 1; }
  getTempCByIndex(i) {
    const s = this.sensors()[i];
    if (!s) return -127;
    const st = s.status();
    if (!st.ok) { if (st.powered && !st.pulled) this.hw.warn('DS18B20 reads -127 °C: add a 4.7 kΩ pull-up resistor between DQ and VCC.', null, 'dspull'); return -127; }
    const step = [0.5, 0.25, 0.125, 0.0625][Math.max(0, Math.min(3, this.res - 9))];
    return Math.round(s.temp / step) * step;
  }
  getTempFByIndex(i) { const c = this.getTempCByIndex(i); return c === -127 ? -196.6 : c * 1.8 + 32; }
  getTempC() { return this.getTempCByIndex(0); }
  getTempF() { return this.getTempFByIndex(0); }
  getAddress(addr, i) { return this.sensors()[i] ? 1 : 0; }
  isParasitePowerMode() { return 0; }
}

// ------------------------------------------------------------------ Wire (I2C)
class TwoWire {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.tx = []; this.rx = []; this.addr = 0; this.begun = false; this.clock = 100000; }
  begin(addr) {
    this.begun = true;
    // Wire.begin(address): this board is an I²C slave at that address
    if (typeof addr === 'number' && this.hw.i2cSlave) { this.slaveAddr = addr & 127; this.hw.i2cSlave(addr, this); }
  }
  end() { this.begun = false; }
  setClock(hz) { this.clock = hz; }
  setPins() { return 1; }
  byteTime() { return 9e6 / this.clock; }
  beginTransmission(a) { this.addr = a & 127; this.tx = []; }
  write(v, len) {
    // inside an onRequest handler the bytes are the slave's answer to the master
    const out = this.slaveTx || this.tx;
    if (typeof v === 'number') { out.push(v & 255); return 1; }
    if (len !== undefined) { const a = v instanceof Ptr ? v.a : v; const o = v instanceof Ptr ? v.i : 0; for (let i = 0; i < len; i++) out.push((typeof a === 'string' ? a.charCodeAt(o + i) : a[o + i]) & 255); return len; }
    const s = cstr(v);
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 255);
    return s.length;
  }
  dev() { return this.hw.i2cDevice(this.addr); }
  endTransmission() {
    if (!this.begun) this.hw.warn('Wire.begin() was not called before using I²C.', null, 'wirebegin');
    this.rt.t += this.byteTime() * (this.tx.length + 1);
    const d = this.dev();
    if (!d) return 2;
    if (d.i2cWrite) d.i2cWrite(this.tx.slice());
    return 0;
  }
  requestFrom(a, n) {
    this.addr = a & 127;
    this.rt.t += this.byteTime() * (n + 1);
    const d = this.dev();
    if (!d) { this.rx = []; return 0; }
    this.rx = d.i2cRead ? d.i2cRead(n) : new Array(n).fill(0);
    return this.rx.length;
  }
  available() { return this.rx.length; }
  read() { return this.rx.length ? this.rx.shift() : -1; }
  peek() { return this.rx.length ? this.rx[0] : -1; }
  onReceive(fn) { this.onRecv = fn; }
  onRequest(fn) { this.onReq = fn; }
  flush() {}
}

// ------------------------------------------------------------------ MPU6050 libraries
class AdafruitMPU {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.dev = null; }
  begin(addr = 0x68) {
    const d = this.hw.i2cDevice(addr);
    if (!d || !d.regs) return 0;
    this.dev = d;
    d.regs[0x6b] = 0; // wake up
    this.rt.t += 100000;
    return 1;
  }
  setAccelerometerRange(r) { if (this.dev) this.dev.regs[0x1c] = (r & 3) << 3; }
  getAccelerometerRange() { return this.dev ? (this.dev.regs[0x1c] >> 3) & 3 : 0; }
  setGyroRange(r) { if (this.dev) this.dev.regs[0x1b] = (r & 3) << 3; }
  getGyroRange() { return this.dev ? (this.dev.regs[0x1b] >> 3) & 3 : 0; }
  setFilterBandwidth() {}
  getFilterBandwidth() { return 0; }
  setSampleRateDivisor() {}
  enableSleep(s) { if (this.dev) this.dev.regs[0x6b] = s ? 0x40 : 0; }
  getEvent(a, g, t) {
    this.rt.t += 1500;
    const d = this.dev;
    const v = d && !(d.regs[0x6b] & 0x40) ? d.values : { ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0, temp: 0 };
    const G = 9.80665, D = Math.PI / 180;
    if (a) { a.acceleration.x = v.ax * G; a.acceleration.y = v.ay * G; a.acceleration.z = v.az * G; }
    if (g) { g.gyro.x = v.gx * D; g.gyro.y = v.gy * D; g.gyro.z = v.gz * D; }
    if (t) t.temperature = v.temp;
    return 1;
  }
}
class JrMPU {
  constructor(rt, hw, [addr = 0x68] = []) { this.rt = rt; this.hw = hw; this.addr = addr; }
  dev() { return this.hw.i2cDevice(this.addr); }
  initialize() { const d = this.dev(); if (d && d.regs) d.regs[0x6b] = 0; this.rt.t += 50000; }
  testConnection() { const d = this.dev(); return d && d.regs ? 1 : 0; }
  raw() { const d = this.dev(); if (!d || !d.regs) return [0, 0, 0, 0, 0, 0, 0]; const b = d.i2cRead ? (d.i2cWrite([0x3b]), d.i2cRead(14)) : []; const w = (i) => { const x = (b[i] << 8) | b[i + 1]; return x >= 32768 ? x - 65536 : x; }; return [w(0), w(2), w(4), w(6), w(8), w(10), w(12)]; }
  getMotion6(ax, ay, az, gx, gy, gz) { const r = this.raw(); ax.set(r[0]); ay.set(r[1]); az.set(r[2]); gx.set(r[4]); gy.set(r[5]); gz.set(r[6]); }
  getAcceleration(ax, ay, az) { const r = this.raw(); ax.set(r[0]); ay.set(r[1]); az.set(r[2]); }
  getRotation(gx, gy, gz) { const r = this.raw(); gx.set(r[4]); gy.set(r[5]); gz.set(r[6]); }
  getTemperature() { return this.raw()[3]; }
  getAccelerationX() { return this.raw()[0]; }
  getAccelerationY() { return this.raw()[1]; }
  getAccelerationZ() { return this.raw()[2]; }
}

// ------------------------------------------------------------------ RTClib
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
class DateTime {
  constructor(args = []) {
    if (args.length >= 3 && typeof args[0] === 'number' && typeof args[1] === 'number') {
      const [y, m, d, hh = 0, mm = 0, ss = 0] = args;
      this.d = new Date(y < 100 ? 2000 + y : y, m - 1, d, hh, mm, ss);
    } else if (args.length === 2 && (typeof args[0] === 'string' || args[0] instanceof Ptr || Array.isArray(args[0]))) {
      const ds = cstr(args[0]), ts = cstr(args[1]);
      const m = /(\w{3})\s+(\d+)\s+(\d+)/.exec(ds) || [];
      const t = /(\d+):(\d+):(\d+)/.exec(ts) || [];
      this.d = new Date(+m[3] || 2026, Math.max(0, MONTHS.indexOf(m[1])), +m[2] || 1, +t[1] || 0, +t[2] || 0, +t[3] || 0);
    } else if (args.length === 1 && typeof args[0] === 'number') {
      this.d = new Date(args[0] * 1000 + new Date(args[0] * 1000).getTimezoneOffset() * 60000);
    } else if (args.length === 1 && args[0] instanceof DateTime) {
      this.d = new Date(args[0].d.getTime());
    } else this.d = new Date(2000, 0, 1);
  }
  year() { return this.d.getFullYear(); }
  month() { return this.d.getMonth() + 1; }
  day() { return this.d.getDate(); }
  hour() { return this.d.getHours(); }
  minute() { return this.d.getMinutes(); }
  second() { return this.d.getSeconds(); }
  dayOfTheWeek() { return this.d.getDay(); }
  twelveHour() { const h = this.d.getHours() % 12; return h === 0 ? 12 : h; }
  isPM() { return this.d.getHours() >= 12 ? 1 : 0; }
  unixtime() { return Math.floor((this.d.getTime() - this.d.getTimezoneOffset() * 60000) / 1000) >>> 0; }
  secondstime() { return (this.unixtime() - 946684800) >>> 0; }
  isValid() { return 1; }
  timestamp() {
    const p = (n) => String(n).padStart(2, '0');
    return new AStr(`${this.year()}-${p(this.month())}-${p(this.day())}T${p(this.hour())}:${p(this.minute())}:${p(this.second())}`);
  }
  toString(buf) {
    // RTClib format: hh mm ss YYYY YY MM DD DDD MMM AP ap
    const fmt = cstr(buf);
    const p = (n) => String(n).padStart(2, '0');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const out = fmt.replace(/YYYY/g, String(this.year())).replace(/YY/g, p(this.year() % 100)).replace(/MMM/g, MONTHS[this.month() - 1])
      .replace(/MM/g, p(this.month())).replace(/DDD/g, days[this.dayOfTheWeek()]).replace(/DD/g, p(this.day()))
      .replace(/hh/g, p(this.hour())).replace(/mm/g, p(this.minute())).replace(/ss/g, p(this.second()))
      .replace(/AP/g, this.isPM() ? 'PM' : 'AM').replace(/ap/g, this.isPM() ? 'pm' : 'am');
    if (Array.isArray(buf)) { for (let i = 0; i < out.length && i < buf.length; i++) buf[i] = out.charCodeAt(i); if (out.length < buf.length) buf[out.length] = 0; return buf; }
    return out;
  }
  printTo() { return this.timestamp().s; }
  valueOf() { return this.unixtime(); }
}
class RTC {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.dev = null; }
  begin() {
    const d = this.hw.i2cBus().find((x) => x.nowMs && x.i2c.address === 0x68);
    if (!d) { const b = this.hw.board; this.hw.warn(`RTC module not found on I²C (SDA → ${b.pinMap[b.i2c.sda]}, SCL → ${b.pinMap[b.i2c.scl]}).`, null, 'rtc'); return 0; }
    this.dev = d;
    return d.powered() ? 1 : 0;
  }
  isrunning() { return this.dev ? 1 : 0; }
  lostPower() { return 0; }
  adjust(dt) { if (this.dev && dt && dt.d) this.dev.adjust(dt.d.getTime()); }
  now() { const dt = new DateTime(); dt.d = new Date(this.dev ? this.dev.nowMs() : Date.now()); return dt; }
  getTemperature() { return 25.25; }
}

// ------------------------------------------------------------------ Keypad
class KeypadLib {
  constructor(rt, hw, [map, rows, cols, nr, nc]) {
    this.rt = rt; this.hw = hw;
    this.map = map; this.rows = Array.from(rows instanceof Ptr ? rows.a : rows); this.cols = Array.from(cols instanceof Ptr ? cols.a : cols);
    this.nr = nr; this.nc = nc;
    this.reported = new Set();
    this.state = 0; // IDLE
    this.lastKey = 0;
  }
  keyAt(i, j) {
    const m = this.map;
    if (Array.isArray(m) && Array.isArray(m[0])) return m[i] && m[i][j] !== undefined ? m[i][j] : 0;
    const flat = Array.isArray(m) ? m : (m instanceof Ptr ? m.a.slice(m.i) : cstr(m).split('').map((c) => c.charCodeAt(0)));
    return flat[i * this.nc + j] || 0;
  }
  /** Characters of the keys currently held down (decoded through the actual wiring). */
  held() {
    const hw = this.hw;
    const out = [];
    for (const r of hw.parts.values()) {
      if (!r.keypad || !r.pressed || !r.pressed.size) continue;
      for (const phys of r.pressed) {
        let pr = -1, pc = -1;
        r.keypad.keys.forEach((row, ri) => { const ci = row.indexOf(phys); if (ci >= 0) { pr = ri; pc = ci; } });
        const pinR = 'R' + (pr + 1), pinC = 'C' + (pc + 1);
        const mcuR = this.rows.find((p) => hw.connected(r, pinR, p));
        const mcuC = this.cols.find((p) => hw.connected(r, pinC, p));
        let i = this.rows.indexOf(mcuR), j = this.cols.indexOf(mcuC);
        if (i < 0 || j < 0) {
          const mr2 = this.rows.find((p) => hw.connected(r, pinC, p)), mc2 = this.cols.find((p) => hw.connected(r, pinR, p));
          i = this.rows.indexOf(mr2); j = this.cols.indexOf(mc2);
        }
        if (i >= 0 && j >= 0 && i < this.nr && j < this.nc) out.push(this.keyAt(i, j));
      }
    }
    return out;
  }
  getKey() {
    this.rt.t += 30;
    const held = this.held();
    for (const k of [...this.reported]) if (!held.includes(k)) this.reported.delete(k);
    for (const k of held) {
      if (!this.reported.has(k)) { this.reported.add(k); this.state = 1; this.lastKey = k; return k; }
    }
    this.state = held.length ? 2 : 0;
    return 0;
  }
  * waitForKey() {
    for (;;) {
      const k = this.getKey();
      if (k) return k;
      yield* this.rt.waitUntil(this.rt.t + 5000);
    }
  }
  getState() { return this.state; }
  isPressed(c) { return this.held().includes(c) ? 1 : 0; }
  keyStateChanged() { return 0; }
  getKeys() { return this.held().length ? 1 : 0; }
  setDebounceTime() {}
  setHoldTime() {}
  addEventListener() { this.hw.warn('Keypad.addEventListener() is not supported in the simulator — use getKey().', null, 'kpev'); }
}

addLibrary((natives, rt, hw) => {
  defineClass(natives, 'DHT', { create: (r, args) => new DHTLib(r, hw, args), methods: DHT_METHODS });
  Object.assign(natives.constants, { DHT11: 11, DHT12: 12, DHT21: 21, DHT22: 22, AM2301: 21 });
  defineClass(natives, 'DHTesp', { create: (r) => new DHTLib(r, hw, [-1, 22]), methods: DHT_METHODS, constants: { DHT11: 1, DHT22: 2, AM2302: 3, AUTO_DETECT: 0 } });
  defineClass(natives, 'TempAndHumidity', { create: () => ({ temperature: 0, humidity: 0 }), methods: {}, fields: { temperature: 'float', humidity: 'float' } });
  defineClass(natives, 'NewPing', {
    create: (r, args) => new NewPing(r, hw, args),
    methods: { ping: { ret: 'ulong', gen: true }, ping_cm: { ret: 'ulong', gen: true }, ping_in: { ret: 'ulong', gen: true }, ping_median: { ret: 'ulong', gen: true }, convert_cm: { ret: 'uint' }, convert_in: { ret: 'uint' } },
  });
  const irMethods = {
    begin: { ret: 'void' }, enableIRIn: { ret: 'void' }, start: { ret: 'void' }, stop: { ret: 'void' }, isIdle: { ret: 'bool' },
    decode: { ret: 'bool', args: ['raw'] }, resume: { ret: 'void' }, printIRResultShort: { ret: 'void', args: ['raw'] }, printIRSendUsage: { ret: 'void', args: ['raw'] },
  };
  defineClass(natives, 'IRrecv', { create: (r, args) => new IRReceiverLib(r, hw, args), methods: irMethods, fields: { decodedIRData: 'any' } });
  defineClass(natives, 'decode_results', { create: () => ({ value: 0, decode_type: 0, bits: 0, command: 0 }), methods: {}, fields: { value: 'ulong', decode_type: 'int', bits: 'int', command: 'int' } });
  natives.globals.IrReceiver = { cls: 'IRrecv', value: new IRReceiverLib(rt, hw, []) };
  Object.assign(natives.constants, { NEC: 8, UNKNOWN: 0, ENABLE_LED_FEEDBACK: 1, DISABLE_LED_FEEDBACK: 0, USE_DEFAULT_FEEDBACK_LED_PIN: 0, IRDATA_FLAGS_IS_REPEAT: 1 });

  defineClass(natives, 'OneWire', { create: (r, args) => new OneWire(r, hw, args), methods: { reset: { ret: 'u8' } } });
  defineClass(natives, 'DallasTemperature', {
    create: (r, args) => new DallasTemperature(r, hw, args),
    methods: {
      begin: { ret: 'void' }, getDeviceCount: { ret: 'u8' }, getDS18Count: { ret: 'u8' }, setResolution: { ret: 'void' }, getResolution: { ret: 'u8' },
      setWaitForConversion: { ret: 'void' }, requestTemperatures: { ret: 'void', gen: true }, getTempCByIndex: { ret: 'float' },
      getTempFByIndex: { ret: 'float' }, getTempC: { ret: 'float', args: ['raw'] }, getTempF: { ret: 'float', args: ['raw'] },
      getAddress: { ret: 'bool', args: ['raw'] }, isParasitePowerMode: { ret: 'bool' },
    },
  });
  Object.assign(natives.constants, { DEVICE_DISCONNECTED_C: -127, DEVICE_DISCONNECTED_F: -196.6 });

  const wire = new TwoWire(rt, hw);
  defineClass(natives, 'TwoWire', {
    create: () => wire,
    methods: {
      begin: { ret: 'void', args: ['num'] }, end: { ret: 'void' }, setClock: { ret: 'void' }, setPins: { ret: 'bool' }, beginTransmission: { ret: 'void' },
      write: { ret: 'uint', args: ['raw', 'num'] }, endTransmission: { ret: 'u8' }, requestFrom: { ret: 'u8' }, available: { ret: 'int' },
      read: { ret: 'int' }, peek: { ret: 'int' }, onReceive: { ret: 'void', args: ['raw'] }, onRequest: { ret: 'void', args: ['raw'] }, flush: { ret: 'void' },
    },
  });
  natives.globals.Wire = { cls: 'TwoWire', value: wire };

  defineClass(natives, 'sensors_event_t', {
    create: () => ({ acceleration: { x: 0, y: 0, z: 0 }, gyro: { x: 0, y: 0, z: 0 }, temperature: 0, magnetic: { x: 0, y: 0, z: 0 }, pressure: 0, relative_humidity: 0, light: 0 }),
    methods: {}, fields: { acceleration: 'any', gyro: 'any', temperature: 'float', magnetic: 'any', pressure: 'float', relative_humidity: 'float', light: 'float' },
  });
  defineClass(natives, 'Adafruit_MPU6050', {
    create: (r) => new AdafruitMPU(r, hw),
    methods: {
      begin: { ret: 'bool', args: ['num', 'raw'] }, setAccelerometerRange: { ret: 'void' }, getAccelerometerRange: { ret: 'int' }, setGyroRange: { ret: 'void' },
      getGyroRange: { ret: 'int' }, setFilterBandwidth: { ret: 'void' }, getFilterBandwidth: { ret: 'int' }, setSampleRateDivisor: { ret: 'void' },
      enableSleep: { ret: 'void' }, getEvent: { ret: 'bool', args: ['raw', 'raw', 'raw'] },
    },
  });
  Object.assign(natives.constants, {
    MPU6050_RANGE_2_G: 0, MPU6050_RANGE_4_G: 1, MPU6050_RANGE_8_G: 2, MPU6050_RANGE_16_G: 3,
    MPU6050_RANGE_250_DEG: 0, MPU6050_RANGE_500_DEG: 1, MPU6050_RANGE_1000_DEG: 2, MPU6050_RANGE_2000_DEG: 3,
    MPU6050_BAND_260_HZ: 0, MPU6050_BAND_184_HZ: 1, MPU6050_BAND_94_HZ: 2, MPU6050_BAND_44_HZ: 3, MPU6050_BAND_21_HZ: 4, MPU6050_BAND_10_HZ: 5, MPU6050_BAND_5_HZ: 6,
  });
  defineClass(natives, 'MPU6050', {
    create: (r, args) => new JrMPU(r, hw, args),
    methods: {
      initialize: { ret: 'void' }, testConnection: { ret: 'bool' }, getMotion6: { ret: 'void', lvalueArgs: [0, 1, 2, 3, 4, 5] },
      getAcceleration: { ret: 'void', lvalueArgs: [0, 1, 2] }, getRotation: { ret: 'void', lvalueArgs: [0, 1, 2] }, getTemperature: { ret: 'i16' },
      getAccelerationX: { ret: 'i16' }, getAccelerationY: { ret: 'i16' }, getAccelerationZ: { ret: 'i16' },
    },
  });

  const dtMethods = {
    year: { ret: 'u16' }, month: { ret: 'u8' }, day: { ret: 'u8' }, hour: { ret: 'u8' }, minute: { ret: 'u8' }, second: { ret: 'u8' },
    dayOfTheWeek: { ret: 'u8' }, twelveHour: { ret: 'u8' }, isPM: { ret: 'u8' }, unixtime: { ret: 'u32' }, secondstime: { ret: 'u32' },
    isValid: { ret: 'bool' }, timestamp: { ret: 'String' }, toString: { ret: 'cstr', args: ['raw'] },
  };
  defineClass(natives, 'DateTime', { create: (r, args) => new DateTime(args), methods: dtMethods, ctorArgs: ['raw', 'raw'] });
  const rtcMethods = { begin: { ret: 'bool', args: ['raw'] }, isrunning: { ret: 'bool' }, lostPower: { ret: 'bool' }, adjust: { ret: 'void', args: ['raw'] }, now: { ret: 'DateTime' }, getTemperature: { ret: 'float' } };
  for (const n of ['RTC_DS1307', 'RTC_DS3231', 'RTC_PCF8523', 'RTC_PCF8563']) defineClass(natives, n, { create: (r) => new RTC(r, hw), methods: rtcMethods });

  defineClass(natives, 'Keypad', {
    create: (r, args) => new KeypadLib(r, hw, args),
    ctorArgs: ['raw', 'raw', 'raw', 'num', 'num'],
    methods: {
      getKey: { ret: 'char' }, waitForKey: { ret: 'char', gen: true }, getState: { ret: 'int' }, isPressed: { ret: 'bool' },
      keyStateChanged: { ret: 'bool' }, getKeys: { ret: 'bool' }, setDebounceTime: { ret: 'void' }, setHoldTime: { ret: 'void' },
      addEventListener: { ret: 'void', args: ['raw'] },
    },
  });
  natives.functions.makeKeymap = { ret: 'any', args: ['raw'], fn: (x) => x };
  Object.assign(natives.constants, { NO_KEY: 0, IDLE: 0, PRESSED: 1, HOLD: 2, RELEASED: 3 });
});
