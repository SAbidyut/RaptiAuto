// Display libraries: LiquidCrystal, LiquidCrystal_I2C, Adafruit_SSD1306 (+GFX), TM1637Display, LedControl, ArduinoLEDMatrix.
import { addLibrary, defineClass, PRINT_METHODS } from './registry.js';
import { PrintMixin } from '../lang/core.js';
import { glyph } from '../../components/font5x7.js';
import { cstr, Ptr } from '../lang/values.js';

const hex2 = (a) => '0x' + Number(a).toString(16).toUpperCase().padStart(2, '0');

// ------------------------------------------------------------------ HD44780 based LCDs
class LcdBase {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.dev = null; this._f32 = hw.board && hw.board.arch === 'avr'; this.bound = false; }
  ok() {
    if (!this.bound) this.bind();
    return this.dev && this.devRt && (!this.devRt.powered || this.devRt.powered()) && this.dev.initialized;
  }
  _write(s) {
    this.rt.t += 50 * s.length;
    if (!this.ok()) return s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 13 || c === 10) continue; // HD44780 shows garbage for CR/LF; real lcd.println prints 2 junk chars
      this.dev.write(c);
    }
    return s.length;
  }
  write(v) {
    if (typeof v === 'number') { if (this.ok()) this.dev.write(v & 255); this.rt.t += 50; return 1; }
    return this._write(cstr(v));
  }
  begin(cols = 16, rows = 2) { this.cols = cols; this.rows = rows; this.bind(); if (this.dev && this.powered()) this.dev.init(); this.rt.t += 50000; }
  init() { this.begin(this.cols || 16, this.rows || 2); }
  powered() { return !this.devRt.powered || this.devRt.powered(); }
  clear() { this.rt.t += 2000; if (this.ok()) this.dev.clear(); }
  home() { this.rt.t += 2000; if (this.ok()) this.dev.home(); }
  setCursor(c, r) { if (this.ok()) this.dev.setCursor(c, r); }
  cursor() { if (this.ok()) { this.dev.cursor = true; this.dev.touch(); } }
  noCursor() { if (this.ok()) { this.dev.cursor = false; this.dev.touch(); } }
  blink() { if (this.ok()) { this.dev.blink = true; this.dev.touch(); } }
  noBlink() { if (this.ok()) { this.dev.blink = false; this.dev.touch(); } }
  display() { if (this.ok()) { this.dev.on = true; this.dev.touch(); } }
  noDisplay() { if (this.ok()) { this.dev.on = false; this.dev.touch(); } }
  scrollDisplayLeft() { if (this.ok()) this.dev.scroll(1); }
  scrollDisplayRight() { if (this.ok()) this.dev.scroll(-1); }
  autoscroll() { if (this.ok()) this.dev.autoShift = true; }
  noAutoscroll() { if (this.ok()) this.dev.autoShift = false; }
  leftToRight() { if (this.ok()) this.dev.inc = true; }
  rightToLeft() { if (this.ok()) this.dev.inc = false; }
  createChar(n, data) {
    if (!this.ok()) return;
    const arr = data instanceof Ptr ? data.a.slice(data.i, data.i + 8) : Array.isArray(data) ? data : [];
    this.dev.createChar(n, arr);
  }
  // LiquidCrystal_I2C extras
  backlight() { if (this.ok() || this.dev) { this.dev.backlight = true; this.dev.touch(); } }
  noBacklight() { if (this.dev) { this.dev.backlight = false; this.dev.touch(); } }
  setBacklight(v) { if (this.dev) { this.dev.backlight = !!v; this.dev.touch(); } }
  printstr(s) { return this._write(cstr(s)); }
}
Object.assign(LcdBase.prototype, { print: PrintMixin.print, println: PrintMixin.println });

class LiquidCrystal extends LcdBase {
  constructor(rt, hw, args) {
    super(rt, hw);
    const a = args;
    if (a.length === 6) { [this.rs, this.en, this.d4, this.d5, this.d6, this.d7] = a; this.rw = -1; this.eight = false; }
    else if (a.length === 7) { [this.rs, this.rw, this.en, this.d4, this.d5, this.d6, this.d7] = a; this.eight = false; }
    else if (a.length === 10) { [this.rs, this.en] = a; this.d = a.slice(2); this.eight = true; this.rw = -1; }
    else if (a.length === 11) { [this.rs, this.rw, this.en] = a; this.d = a.slice(3); this.eight = true; }
    else throw new Error('LiquidCrystal: unsupported constructor (use RS, E, D4, D5, D6, D7)');
  }
  bind() {
    this.bound = true;
    const hw = this.hw;
    for (const pin of [this.rs, this.en, ...(this.eight ? this.d : [this.d4, this.d5, this.d6, this.d7])]) hw.pinMode(pin, 1);
    const cands = [...hw.parts.values()].filter((p) => p.hd44780 && !p.i2c);
    for (const p of cands) {
      const okData = this.eight
        ? this.d.every((pin, i) => hw.connected(p, 'D' + i, pin))
        : [this.d4, this.d5, this.d6, this.d7].every((pin, i) => hw.connected(p, 'D' + (4 + i), pin));
      if (hw.connected(p, 'RS', this.rs) && hw.connected(p, 'E', this.en) && okData) {
        this.devRt = p; this.dev = p.hd44780;
        return;
      }
    }
    const want = this.eight ? '' : ` D4=${this.d4} D5=${this.d5} D6=${this.d6} D7=${this.d7}`;
    hw.warn(cands.length
      ? `LCD wiring does not match LiquidCrystal(RS=${this.rs}, E=${this.en},${want}). Check each data wire.`
      : 'No parallel LCD found in the circuit — add "LCD 16×2 (parallel)" and wire RS, E and D4–D7.', null, 'lcdwire');
  }
}

class LiquidCrystalI2C extends LcdBase {
  constructor(rt, hw, args) {
    super(rt, hw);
    [this.addr = 0x27, this.cols = 16, this.rows = 2] = args;
  }
  bind() {
    this.bound = true;
    const p = this.hw.i2cBus().find((d) => d.hd44780 && d.i2c && d.i2c.address === this.addr);
    if (p) { this.devRt = p; this.dev = p.hd44780; return; }
    const any = this.hw.i2cBus().filter((d) => d.hd44780);
    if (any.length) this.hw.warn(`No LCD at I²C address ${hex2(this.addr)} — the LCD in the circuit uses ${hex2(any[0].i2c.address)}.`, null, 'lcdaddr');
    else {
      const b = this.hw.board;
      const sda = b.pinMap[b.i2c.sda], scl = b.pinMap[b.i2c.scl];
      this.hw.warn(`I²C LCD not found. Connect SDA → ${sda} and SCL → ${scl} (plus VCC and GND).`, null, 'lcdi2c');
    }
  }
  begin(cols, rows) { if (cols) this.cols = cols; if (rows) this.rows = rows; super.begin(this.cols, this.rows); }
  init() { super.begin(this.cols, this.rows); }
}

const LCD_METHODS = {
  begin: { ret: 'void' }, init: { ret: 'void' }, clear: { ret: 'void' }, home: { ret: 'void' }, setCursor: { ret: 'void' },
  ...PRINT_METHODS, write: { ret: 'uint', args: ['raw'] }, cursor: { ret: 'void' }, noCursor: { ret: 'void' }, blink: { ret: 'void' },
  noBlink: { ret: 'void' }, display: { ret: 'void' }, noDisplay: { ret: 'void' }, scrollDisplayLeft: { ret: 'void' },
  scrollDisplayRight: { ret: 'void' }, autoscroll: { ret: 'void' }, noAutoscroll: { ret: 'void' }, leftToRight: { ret: 'void' },
  rightToLeft: { ret: 'void' }, createChar: { ret: 'void', args: ['num', 'raw'] }, backlight: { ret: 'void' }, noBacklight: { ret: 'void' },
  setBacklight: { ret: 'void' }, printstr: { ret: 'void', args: ['raw'] },
};

// ------------------------------------------------------------------ Adafruit GFX + SSD1306
class GFX {
  constructor(w, h) {
    this.WIDTH = w; this.HEIGHT = h; this._w = w; this._h = h;
    this.rotation = 0; this.cx = 0; this.cy = 0; this.tc = 0xffff; this.tbg = 0xffff; this.tsx = 1; this.tsy = 1; this.wrap = 1;
  }
  width() { return this._w; }
  height() { return this._h; }
  setRotation(r) {
    this.rotation = r & 3;
    if (this.rotation & 1) { this._w = this.HEIGHT; this._h = this.WIDTH; } else { this._w = this.WIDTH; this._h = this.HEIGHT; }
  }
  getRotation() { return this.rotation; }
  setCursor(x, y) { this.cx = x; this.cy = y; }
  getCursorX() { return this.cx; }
  getCursorY() { return this.cy; }
  setTextColor(c, bg) { this.tc = c; this.tbg = bg === undefined ? c : bg; }
  setTextSize(sx, sy) { this.tsx = sx > 0 ? sx : 1; this.tsy = sy > 0 ? sy : this.tsx; }
  setTextWrap(w) { this.wrap = w ? 1 : 0; }
  cp437() {}
  setFont() {}
  drawFastVLine(x, y, h, c) { for (let i = 0; i < h; i++) this.drawPixel(x, y + i, c); }
  drawFastHLine(x, y, w, c) { for (let i = 0; i < w; i++) this.drawPixel(x + i, y, c); }
  writePixel(x, y, c) { this.drawPixel(x, y, c); }
  drawLine(x0, y0, x1, y1, c) {
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (steep) { [x0, y0] = [y0, x0]; [x1, y1] = [y1, x1]; }
    if (x0 > x1) { [x0, x1] = [x1, x0]; [y0, y1] = [y1, y0]; }
    const dx = x1 - x0, dy = Math.abs(y1 - y0);
    let err = (dx / 2) | 0;
    const ys = y0 < y1 ? 1 : -1;
    for (; x0 <= x1; x0++) {
      if (steep) this.drawPixel(y0, x0, c); else this.drawPixel(x0, y0, c);
      err -= dy;
      if (err < 0) { y0 += ys; err += dx; }
    }
  }
  drawRect(x, y, w, h, c) { this.drawFastHLine(x, y, w, c); this.drawFastHLine(x, y + h - 1, w, c); this.drawFastVLine(x, y, h, c); this.drawFastVLine(x + w - 1, y, h, c); }
  fillRect(x, y, w, h, c) { for (let i = x; i < x + w; i++) this.drawFastVLine(i, y, h, c); }
  fillScreen(c) { this.fillRect(0, 0, this._w, this._h, c); }
  drawCircle(x0, y0, r, c) {
    let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
    this.drawPixel(x0, y0 + r, c); this.drawPixel(x0, y0 - r, c); this.drawPixel(x0 + r, y0, c); this.drawPixel(x0 - r, y0, c);
    while (x < y) {
      if (f >= 0) { y--; ddy += 2; f += ddy; }
      x++; ddx += 2; f += ddx;
      this.drawPixel(x0 + x, y0 + y, c); this.drawPixel(x0 - x, y0 + y, c); this.drawPixel(x0 + x, y0 - y, c); this.drawPixel(x0 - x, y0 - y, c);
      this.drawPixel(x0 + y, y0 + x, c); this.drawPixel(x0 - y, y0 + x, c); this.drawPixel(x0 + y, y0 - x, c); this.drawPixel(x0 - y, y0 - x, c);
    }
  }
  drawCircleHelper(x0, y0, r, corner, c) {
    let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r;
    while (x < y) {
      if (f >= 0) { y--; ddy += 2; f += ddy; }
      x++; ddx += 2; f += ddx;
      if (corner & 4) { this.drawPixel(x0 + x, y0 + y, c); this.drawPixel(x0 + y, y0 + x, c); }
      if (corner & 2) { this.drawPixel(x0 + x, y0 - y, c); this.drawPixel(x0 + y, y0 - x, c); }
      if (corner & 8) { this.drawPixel(x0 - y, y0 + x, c); this.drawPixel(x0 - x, y0 + y, c); }
      if (corner & 1) { this.drawPixel(x0 - y, y0 - x, c); this.drawPixel(x0 - x, y0 - y, c); }
    }
  }
  fillCircle(x0, y0, r, c) { this.drawFastVLine(x0, y0 - r, 2 * r + 1, c); this.fillCircleHelper(x0, y0, r, 3, 0, c); }
  fillCircleHelper(x0, y0, r, corners, delta, c) {
    let f = 1 - r, ddx = 1, ddy = -2 * r, x = 0, y = r, px = x, py = y;
    delta++;
    while (x < y) {
      if (f >= 0) { y--; ddy += 2; f += ddy; }
      x++; ddx += 2; f += ddx;
      if (x < y + 1) { if (corners & 1) this.drawFastVLine(x0 + x, y0 - y, 2 * y + delta, c); if (corners & 2) this.drawFastVLine(x0 - x, y0 - y, 2 * y + delta, c); }
      if (y !== py) { if (corners & 1) this.drawFastVLine(x0 + py, y0 - px, 2 * px + delta, c); if (corners & 2) this.drawFastVLine(x0 - py, y0 - px, 2 * px + delta, c); py = y; }
      px = x;
    }
  }
  drawRoundRect(x, y, w, h, r, c) {
    const m = Math.min(w, h) >> 1; if (r > m) r = m;
    this.drawFastHLine(x + r, y, w - 2 * r, c); this.drawFastHLine(x + r, y + h - 1, w - 2 * r, c);
    this.drawFastVLine(x, y + r, h - 2 * r, c); this.drawFastVLine(x + w - 1, y + r, h - 2 * r, c);
    this.drawCircleHelper(x + r, y + r, r, 1, c); this.drawCircleHelper(x + w - r - 1, y + r, r, 2, c);
    this.drawCircleHelper(x + w - r - 1, y + h - r - 1, r, 4, c); this.drawCircleHelper(x + r, y + h - r - 1, r, 8, c);
  }
  fillRoundRect(x, y, w, h, r, c) {
    const m = Math.min(w, h) >> 1; if (r > m) r = m;
    this.fillRect(x + r, y, w - 2 * r, h, c);
    this.fillCircleHelper(x + w - r - 1, y + r, r, 1, h - 2 * r - 1, c);
    this.fillCircleHelper(x + r, y + r, r, 2, h - 2 * r - 1, c);
  }
  drawTriangle(x0, y0, x1, y1, x2, y2, c) { this.drawLine(x0, y0, x1, y1, c); this.drawLine(x1, y1, x2, y2, c); this.drawLine(x2, y2, x0, y0, c); }
  fillTriangle(x0, y0, x1, y1, x2, y2, c) {
    if (y0 > y1) { [y0, y1] = [y1, y0]; [x0, x1] = [x1, x0]; }
    if (y1 > y2) { [y2, y1] = [y1, y2]; [x2, x1] = [x1, x2]; }
    if (y0 > y1) { [y0, y1] = [y1, y0]; [x0, x1] = [x1, x0]; }
    for (let y = y0; y <= y2; y++) {
      const xa = y < y1 ? interp(y, y0, x0, y1, x1) : interp(y, y1, x1, y2, x2);
      const xb = interp(y, y0, x0, y2, x2);
      const a = Math.round(Math.min(xa, xb)), b = Math.round(Math.max(xa, xb));
      this.drawFastHLine(a, y, b - a + 1, c);
    }
  }
  drawBitmap(x, y, bmp, w, h, c, bg) {
    const arr = bmp instanceof Ptr ? bmp.a : bmp;
    const off = bmp instanceof Ptr ? bmp.i : 0;
    const bw = (w + 7) >> 3;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const byte = arr[off + j * bw + (i >> 3)] | 0;
        if (byte & (0x80 >> (i & 7))) this.drawPixel(x + i, y + j, c);
        else if (bg !== undefined) this.drawPixel(x + i, y + j, bg);
      }
    }
  }
  drawXBitmap(x, y, bmp, w, h, c) {
    const arr = bmp instanceof Ptr ? bmp.a : bmp;
    const bw = (w + 7) >> 3;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if ((arr[j * bw + (i >> 3)] | 0) & (1 << (i & 7))) this.drawPixel(x + i, y + j, c);
  }
  drawChar(x, y, ch, c, bg, sx = 1, sy = sx) {
    if (x >= this._w || y >= this._h || x + 6 * sx - 1 < 0 || y + 8 * sy - 1 < 0) return;
    const cols = glyph(ch);
    for (let i = 0; i < 6; i++) {
      let line = i < 5 ? cols[i] : 0;
      for (let j = 0; j < 8; j++, line >>= 1) {
        if (line & 1) { if (sx === 1 && sy === 1) this.drawPixel(x + i, y + j, c); else this.fillRect(x + i * sx, y + j * sy, sx, sy, c); }
        else if (bg !== c) { if (sx === 1 && sy === 1) this.drawPixel(x + i, y + j, bg); else this.fillRect(x + i * sx, y + j * sy, sx, sy, bg); }
      }
    }
  }
  _write(s) {
    for (let k = 0; k < s.length; k++) {
      const ch = s.charCodeAt(k);
      if (ch === 10) { this.cx = 0; this.cy += this.tsy * 8; }
      else if (ch !== 13) {
        if (this.wrap && this.cx + this.tsx * 6 > this._w) { this.cx = 0; this.cy += this.tsy * 8; }
        this.drawChar(this.cx, this.cy, ch, this.tc, this.tbg, this.tsx, this.tsy);
        this.cx += this.tsx * 6;
      }
    }
    return s.length;
  }
  write(v) { if (typeof v === 'number') return this._write(String.fromCharCode(v & 255)); return this._write(cstr(v)); }
  getTextBounds(str, x, y, rx1, ry1, rw, rh) {
    const s = cstr(str);
    const lines = s.split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * 6 * this.tsx;
    const hh = lines.length * 8 * this.tsy;
    rx1.set(x); ry1.set(y); rw.set(w); rh.set(hh);
  }
}
Object.assign(GFX.prototype, { print: PrintMixin.print, println: PrintMixin.println });
function interp(y, ya, xa, yb, xb) { return yb === ya ? xa : xa + ((xb - xa) * (y - ya)) / (yb - ya); }

class SSD1306Lib extends GFX {
  constructor(rt, hw, args) {
    let w = 128, h = 64;
    if (args.length >= 2 && args[0] > 8) { w = args[0]; h = args[1]; }
    super(w, h);
    this.rt = rt; this.hw = hw;
    this.buf = new Uint8Array(w * h);
    this._f32 = hw.board && hw.board.arch === 'avr';
    this.dev = null;
    // splash (like the Adafruit logo) shown if display() is called before clearDisplay()
    this.setTextColor(1); this.setTextSize(2); this.setCursor(10, 18); this._write('RaptiAuto');
    this.setTextSize(1); this.setCursor(28, 40); this._write('SSD1306 OLED');
    this.setTextColor(0xffff); this.setTextSize(1); this.setCursor(0, 0);
  }
  begin(vcc = 2, addr = 0x3c) {
    this.addr = addr || 0x3c;
    this.rt.t += 100000;
    const p = this.hw.i2cBus().find((d) => d.ssd1306 && d.i2c.address === this.addr);
    if (!p) {
      const any = this.hw.i2cBus().find((d) => d.ssd1306);
      if (any) this.hw.warn(`No OLED at I²C address ${hex2(this.addr)} (the OLED in the circuit is ${hex2(any.i2c.address)}).`, null, 'oledaddr');
      else {
        const b = this.hw.board;
        this.hw.warn(`OLED display not found on I²C. Connect SDA → ${b.pinMap[b.i2c.sda]} and SCL → ${b.pinMap[b.i2c.scl]} (plus VCC and GND).`, null, 'oledi2c');
      }
      return 0;
    }
    if (p.powered && !p.powered()) return 0;
    this.devRt = p; this.dev = p.ssd1306;
    this.dev.on = true;
    return 1;
  }
  drawPixel(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this._w || y >= this._h) return;
    switch (this.rotation) {
      case 1: [x, y] = [this.WIDTH - y - 1, x]; break;
      case 2: x = this.WIDTH - x - 1; y = this.HEIGHT - y - 1; break;
      case 3: [x, y] = [y, this.HEIGHT - x - 1]; break;
      default:
    }
    const i = y * this.WIDTH + x;
    if (c === 1) this.buf[i] = 1; else if (c === 0) this.buf[i] = 0; else if (c === 2) this.buf[i] ^= 1;
  }
  getPixel(x, y) { return x >= 0 && y >= 0 && x < this.WIDTH && y < this.HEIGHT ? this.buf[y * this.WIDTH + x] : 0; }
  clearDisplay() { this.buf.fill(0); }
  display() {
    this.rt.t += this.hw.board.arch === 'avr' ? 23000 : 9000; // I2C transfer time of 1 KB @ 400 kHz
    if (!this.dev) return;
    this.dev.load(this.buf);
  }
  invertDisplay(i) { if (this.dev) { this.dev.invert = !!i; this.dev.version++; } }
  dim(d) { if (this.dev) { this.dev.contrast = d ? 0.5 : 1; this.dev.version++; } }
  ssd1306_command(c) { if (this.dev) { if (c === 0xae) this.dev.on = false; if (c === 0xaf) this.dev.on = true; this.dev.version++; } }
  startscrollright() {} startscrollleft() {} startscrolldiagright() {} startscrolldiagleft() {} stopscroll() {}
}

const GFX_METHODS = {
  begin: { ret: 'bool' }, display: { ret: 'void' }, clearDisplay: { ret: 'void' }, invertDisplay: { ret: 'void' }, dim: { ret: 'void' },
  drawPixel: { ret: 'void' }, writePixel: { ret: 'void' }, getPixel: { ret: 'bool' }, drawLine: { ret: 'void' }, drawFastHLine: { ret: 'void' },
  drawFastVLine: { ret: 'void' }, drawRect: { ret: 'void' }, fillRect: { ret: 'void' }, fillScreen: { ret: 'void' },
  drawCircle: { ret: 'void' }, fillCircle: { ret: 'void' }, drawRoundRect: { ret: 'void' }, fillRoundRect: { ret: 'void' },
  drawTriangle: { ret: 'void' }, fillTriangle: { ret: 'void' }, drawBitmap: { ret: 'void', args: ['num', 'num', 'raw'] },
  drawXBitmap: { ret: 'void', args: ['num', 'num', 'raw'] }, drawChar: { ret: 'void' },
  setCursor: { ret: 'void' }, getCursorX: { ret: 'int' }, getCursorY: { ret: 'int' }, setTextColor: { ret: 'void' }, setTextSize: { ret: 'void' },
  setTextWrap: { ret: 'void' }, setRotation: { ret: 'void' }, getRotation: { ret: 'u8' }, width: { ret: 'int' }, height: { ret: 'int' },
  cp437: { ret: 'void' }, setFont: { ret: 'void', args: ['raw'] }, ...PRINT_METHODS, write: { ret: 'uint', args: ['raw'] },
  getTextBounds: { ret: 'void', lvalueArgs: [3, 4, 5, 6], args: ['str', 'num', 'num'] },
  ssd1306_command: { ret: 'void' }, startscrollright: { ret: 'void' }, startscrollleft: { ret: 'void' },
  startscrolldiagright: { ret: 'void' }, startscrolldiagleft: { ret: 'void' }, stopscroll: { ret: 'void' },
};

// ------------------------------------------------------------------ TM1637Display
const DIGITS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
class TM1637Display {
  constructor(rt, hw, [clk, dio]) { this.rt = rt; this.hw = hw; this.clk = clk; this.dio = dio; this.bright = 0x0f; this.dev = null; this.bound = false; }
  bind() {
    this.bound = true;
    const p = [...this.hw.parts.values()].find((r) => r.tm1637 && this.hw.connected(r, 'CLK', this.clk) && this.hw.connected(r, 'DIO', this.dio));
    if (p) { this.devRt = p; this.dev = p.tm1637; } else this.hw.warn(`TM1637 display not found on CLK=${this.clk}, DIO=${this.dio}. Check the wiring.`, null, 'tmwire');
  }
  ok() { if (!this.bound) this.bind(); return this.dev && this.devRt.powered(); }
  setBrightness(b, on = 1) { this.bright = (b & 7) | (on ? 8 : 0); if (this.ok()) { this.dev.brightness = b & 7; this.dev.on = !!on; this.dev.version++; } }
  setSegments(segs, length = 4, pos = 0) {
    this.rt.t += 1500;
    if (!this.ok()) return;
    const arr = segs instanceof Ptr ? segs.a.slice(segs.i) : segs;
    this.dev.brightness = this.bright & 7; this.dev.on = !!(this.bright & 8);
    this.dev.set(pos, arr.slice(0, length));
  }
  clear() { this.setSegments([0, 0, 0, 0]); }
  encodeDigit(d) { return DIGITS[d & 15]; }
  showBase(base, num, dots, lead, length, pos) {
    let neg = false;
    if (base < 0) { base = -base; neg = true; }
    const digits = new Array(4).fill(0);
    if (num === 0 && !lead) { for (let i = 0; i < length - 1; i++) digits[i] = 0; digits[length - 1] = DIGITS[0]; }
    else {
      for (let i = length - 1; i >= 0; --i) {
        const d = num % base;
        if (d === 0 && num === 0 && !lead) digits[i] = 0; else digits[i] = DIGITS[d];
        if (d === 0 && num === 0 && neg) { digits[i] = 0x40; neg = false; }
        num = Math.floor(num / base);
      }
    }
    if (dots) for (let i = 0; i < 4; i++) { digits[i] |= dots & 0x80; dots = (dots << 1) & 255; }
    this.setSegments(digits, length, pos);
  }
  showNumberDec(num, lead = 0, length = 4, pos = 0) { this.showNumberDecEx(num, 0, lead, length, pos); }
  showNumberDecEx(num, dots = 0, lead = 0, length = 4, pos = 0) { this.showBase(num < 0 ? -10 : 10, Math.abs(num) & 0xffff, dots, lead, length, pos); }
  showNumberHexEx(num, dots = 0, lead = 0, length = 4, pos = 0) { this.showBase(16, num & 0xffff, dots, lead, length, pos); }
}

// ------------------------------------------------------------------ LedControl (MAX7219)
const CHARTABLE = { 0: 0x7e, 1: 0x30, 2: 0x6d, 3: 0x79, 4: 0x33, 5: 0x5b, 6: 0x5f, 7: 0x70, 8: 0x7f, 9: 0x7b };
class LedControl {
  constructor(rt, hw, [din, clk, cs, n = 1]) { this.rt = rt; this.hw = hw; this.din = din; this.clk = clk; this.cs = cs; this.n = n; this.devs = null; this.bound = false; }
  bind() {
    this.bound = true;
    const p = [...this.hw.parts.values()].find((r) => r.max7219 && this.hw.connected(r, 'DIN', this.din) && this.hw.connected(r, 'CLK', this.clk) && this.hw.connected(r, 'CS', this.cs));
    if (p) { this.devRt = p; this.devs = p.max7219; } else this.hw.warn(`MAX7219 matrix not found on DIN=${this.din}, CLK=${this.clk}, CS=${this.cs}.`, null, 'maxwire');
  }
  d(addr) { if (!this.bound) this.bind(); if (!this.devs || !this.devRt.powered()) return null; this.rt.t += 60; return this.devs[addr] || null; }
  getDeviceCount() { return this.n; }
  shutdown(a, s) { const d = this.d(a); if (d) { d.shutdown = !!s; d.version++; } }
  setScanLimit() {}
  setIntensity(a, i) { const d = this.d(a); if (d) { d.intensity = i & 15; d.version++; } }
  clearDisplay(a) { const d = this.d(a); if (d) { d.rows.fill(0); d.version++; } }
  setLed(a, r, c, s) { const d = this.d(a); if (!d || r < 0 || r > 7 || c < 0 || c > 7) return; const v = 0x80 >> c; if (s) d.rows[r] |= v; else d.rows[r] &= ~v; d.version++; }
  setRow(a, r, v) { const d = this.d(a); if (!d || r < 0 || r > 7) return; d.rows[r] = v & 255; d.version++; }
  setColumn(a, c, v) { for (let r = 0; r < 8; r++) this.setLed(a, r, c, (v >> (7 - r)) & 1); }
  setDigit(a, digit, value, dp) { const d = this.d(a); if (!d) return; d.rows[digit & 7] = (CHARTABLE[value] || 0) | (dp ? 0x80 : 0); d.version++; }
  setChar(a, digit, value, dp) { this.setDigit(a, digit, typeof value === 'number' ? value - 48 : 0, dp); }
}

// ------------------------------------------------------------------ R4 WiFi LED matrix
class LEDMatrix {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.frame = new Array(96).fill(0); this.text = ''; this.speed = 100; this.color = 1; }
  push() { if (this.hw.boardRt) this.hw.boardRt.visual.matrix = this.frame.slice(); }
  begin() {
    if (!this.hw.board.ledMatrix) this.hw.warn('ArduinoLEDMatrix needs an Arduino Uno R4 WiFi board.', null, 'r4mx');
    return 1;
  }
  clear() { this.frame.fill(0); this.push(); }
  loadFrame(words) {
    const w = words instanceof Ptr ? words.a.slice(words.i) : words;
    for (let i = 0; i < 96; i++) this.frame[i] = ((w[i >> 5] >>> (31 - (i & 31))) & 1);
    this.push();
  }
  renderBitmap(bmp, rows = 8, cols = 12) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 12; c++) this.frame[r * 12 + c] = r < rows && c < cols && bmp[r] && bmp[r][c] ? 1 : 0;
    this.push();
  }
  // ArduinoGraphics subset
  beginDraw() {}
  endDraw() {}
  stroke() {}
  noStroke() {}
  fill() {}
  background() {}
  textFont() {}
  textScrollSpeed(ms) { this.speed = ms; }
  beginText(x = 0, y = 1) { this.tx = x; this.ty = y; this.text = ''; }
  _write(s) { this.text += s; return s.length; }
  set(x, y, on) { if (x >= 0 && x < 12 && y >= 0 && y < 8) this.frame[y * 12 + x] = on ? 1 : 0; }
  drawText(offset) {
    this.frame.fill(0);
    let x = this.tx - offset;
    for (const ch of this.text) {
      const cols = glyph(ch.charCodeAt(0));
      for (let i = 0; i < 5; i++, x++) for (let j = 0; j < 7; j++) if ((cols[i] >> j) & 1) this.set(x, this.ty + j, 1);
      x++;
    }
    this.push();
  }
  * endText(mode = 0) {
    if (!mode) { this.drawText(0); return; }
    const total = this.text.length * 6 + 12;
    for (let off = -12; off <= total - 12; off++) {
      this.drawText(mode === 1 ? off : -off);
      yield* this.rt.waitUntil(this.rt.t + this.speed * 1000);
    }
  }
}
Object.assign(LEDMatrix.prototype, { print: PrintMixin.print, println: PrintMixin.println });

addLibrary((natives, rt, hw) => {
  defineClass(natives, 'LiquidCrystal', { create: (r, args) => new LiquidCrystal(r, hw, args), methods: LCD_METHODS });
  defineClass(natives, 'LiquidCrystal_I2C', { create: (r, args) => new LiquidCrystalI2C(r, hw, args), methods: LCD_METHODS });
  natives.classes.hd44780_I2Cexp = natives.classes.LiquidCrystal_I2C;
  defineClass(natives, 'Adafruit_SSD1306', { create: (r, args) => new SSD1306Lib(r, hw, args), methods: GFX_METHODS });
  defineClass(natives, 'TM1637Display', {
    create: (r, args) => new TM1637Display(r, hw, args),
    methods: {
      setBrightness: { ret: 'void' }, setSegments: { ret: 'void', args: ['raw'] }, clear: { ret: 'void' }, encodeDigit: { ret: 'u8' },
      showNumberDec: { ret: 'void' }, showNumberDecEx: { ret: 'void' }, showNumberHexEx: { ret: 'void' },
    },
  });
  defineClass(natives, 'LedControl', {
    create: (r, args) => new LedControl(r, hw, args),
    methods: {
      getDeviceCount: { ret: 'int' }, shutdown: { ret: 'void' }, setScanLimit: { ret: 'void' }, setIntensity: { ret: 'void' },
      clearDisplay: { ret: 'void' }, setLed: { ret: 'void' }, setRow: { ret: 'void' }, setColumn: { ret: 'void' },
      setDigit: { ret: 'void' }, setChar: { ret: 'void' },
    },
  });
  defineClass(natives, 'ArduinoLEDMatrix', {
    create: (r) => new LEDMatrix(r, hw),
    methods: {
      begin: { ret: 'bool' }, clear: { ret: 'void' }, loadFrame: { ret: 'void', args: ['raw'] }, renderBitmap: { ret: 'void', args: ['raw'] },
      beginDraw: { ret: 'void' }, endDraw: { ret: 'void' }, stroke: { ret: 'void' }, noStroke: { ret: 'void' }, fill: { ret: 'void' },
      background: { ret: 'void' }, textFont: { ret: 'void', args: ['raw'] }, textScrollSpeed: { ret: 'void' }, beginText: { ret: 'void' },
      ...PRINT_METHODS, endText: { ret: 'void', gen: true }, set: { ret: 'void' },
    },
  });
  Object.assign(natives.constants, {
    SSD1306_SWITCHCAPVCC: 2, SSD1306_EXTERNALVCC: 1, SSD1306_WHITE: 1, SSD1306_BLACK: 0, SSD1306_INVERSE: 2,
    WHITE: 1, BLACK: 0, INVERSE: 2, SSD1306_DISPLAYOFF: 0xae, SSD1306_DISPLAYON: 0xaf,
    SEG_A: 1, SEG_B: 2, SEG_C: 4, SEG_D: 8, SEG_E: 16, SEG_F: 32, SEG_G: 64, SEG_DP: 128,
    LCD_5x8DOTS: 0, LCD_5x10DOTS: 4, POSITIVE: 1, NEGATIVE: 0,
    SCROLL_LEFT: 1, SCROLL_RIGHT: 2, NO_SCROLL: 0, Font_4x6: 0, Font_5x7: 1,
  });
});
