// Behavioural models of display controllers used by several parts / libraries.

/** HD44780 character LCD controller. */
export class HD44780 {
  constructor(cols = 16, rows = 2) {
    this.cols = cols;
    this.rows = rows;
    this.ddram = new Uint8Array(128).fill(32);
    this.cgram = new Uint8Array(64);
    this.addr = 0;
    this.on = true;
    this.cursor = false;
    this.blink = false;
    this.inc = true;
    this.autoShift = false;
    this.shift = 0;
    this.backlight = true;
    this.initialized = false;
    this.version = 1;
  }
  rowBase(r) { return [0x00, 0x40, 0x00 + this.cols, 0x40 + this.cols][r] ?? 0; }
  touch() { this.version++; }
  init() { this.initialized = true; this.clear(); this.on = true; this.touch(); }
  clear() { this.ddram.fill(32); this.addr = 0; this.shift = 0; this.inc = true; this.touch(); }
  home() { this.addr = 0; this.shift = 0; this.touch(); }
  setCursor(c, r) {
    r = Math.max(0, Math.min(this.rows - 1, r));
    this.addr = (this.rowBase(r) + c) & 0x7f;
    this.touch();
  }
  write(ch) {
    this.ddram[this.addr & 0x7f] = ch & 255;
    this.step(this.inc ? 1 : -1);
    if (this.autoShift) this.shift += this.inc ? 1 : -1;
    this.touch();
  }
  step(d) {
    let a = this.addr + d;
    if (a === 0x28) a = 0x40;
    else if (a === 0x68) a = 0x00;
    else if (a === 0x3f) a = 0x27;
    else if (a < 0) a = 0x67;
    this.addr = a & 0x7f;
  }
  createChar(n, rows) {
    n &= 7;
    for (let i = 0; i < 8; i++) this.cgram[n * 8 + i] = (rows[i] | 0) & 0x1f;
    this.touch();
  }
  scroll(d) { this.shift += d; this.touch(); }
  /** Character code displayed at visible column c, row r. */
  charAt(c, r) {
    const base = r < 2 ? (r === 0 ? 0x00 : 0x40) : (r === 2 ? 0x00 : 0x40);
    let off = r < 2 ? c + this.shift : c + this.cols + this.shift;
    off = ((off % 40) + 40) % 40;
    return this.ddram[base + off];
  }
  cursorPos() {
    const a = this.addr;
    for (let r = 0; r < this.rows; r++) {
      const base = this.rowBase(r);
      const c = a - base - this.shift;
      if (c >= 0 && c < this.cols && (r < 2 || true)) {
        if ((r === 0 && a < 0x28) || (r === 1 && a >= 0x40) || r >= 2) return [c, r];
      }
    }
    return null;
  }
}

/** SSD1306 128x64 monochrome OLED. */
export class SSD1306 {
  constructor(w = 128, h = 64) {
    this.w = w; this.h = h;
    this.fb = new Uint8Array(w * h);
    this.on = true;
    this.invert = false;
    this.contrast = 1;
    this.version = 1;
  }
  load(buf) { this.fb.set(buf.subarray ? buf.subarray(0, this.fb.length) : buf.slice(0, this.fb.length)); this.version++; }
}

/** TM1637 4-digit 7-segment controller. */
export class TM1637 {
  constructor() { this.segs = [0, 0, 0, 0, 0, 0]; this.brightness = 7; this.on = true; this.version = 1; }
  set(pos, data) { for (let i = 0; i < data.length && pos + i < 6; i++) this.segs[pos + i] = data[i] & 255; this.version++; }
}

/** MAX7219 LED matrix driver (one per 8x8 module). */
export class MAX7219 {
  constructor() { this.rows = new Uint8Array(8); this.shutdown = true; this.intensity = 8; this.version = 1; }
}
