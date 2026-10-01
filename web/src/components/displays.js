// Displays: character LCDs (HD44780), OLED SSD1306, TM1637 4-digit, MAX7219 dot matrix.
import { register } from './registry.js';
import { rect, circle, text, line, path, lead, maleHeader, mountHole } from './draw.js';
import { Resistor, Diode } from '../sim/circuit/solver.js';
import { HD44780, SSD1306, TM1637, MAX7219 } from '../sim/devices.js';
import { glyphRows } from './font5x7.js';

// ------------------------------------------------------------------ canvas helpers (browser only)
function canvasFor(el, w, h) {
  if (!el._cv) {
    el._cv = document.createElement('canvas');
    el._cv.width = w; el._cv.height = h;
  }
  return el._cv;
}
function pushImage(el, cv) {
  const img = el.querySelector('.disp-img');
  if (img) img.setAttribute('href', cv.toDataURL());
}

const LCD_THEMES = {
  green: { bg: '#9cc63c', bgOff: '#5c7424', on: '#173208', off: 'rgba(23,50,8,0.09)', frame: '#2c3b12' },
  blue: { bg: '#1f5ce0', bgOff: '#14306c', on: '#eaf2ff', off: 'rgba(255,255,255,0.06)', frame: '#0b1d4a' },
};

function drawLCD(el, dev, cols, rows, theme, light, contrast, blinkOn) {
  const P = 4, cw = 5 * P + 4, ch = 8 * P + 8;
  const cv = canvasFor(el, cols * cw + 8, rows * ch + 6);
  const g = cv.getContext('2d');
  const T = LCD_THEMES[theme] || LCD_THEMES.green;
  g.fillStyle = light ? T.bg : T.bgOff;
  g.fillRect(0, 0, cv.width, cv.height);
  if (!dev || !dev.on) { pushImage(el, cv); return; }
  const cur = dev.cursorPos();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const code = dev.charAt(c, r);
      let bits;
      if (code < 16) { const n = code & 7; bits = Array.from(dev.cgram.subarray(n * 8, n * 8 + 8)); } else bits = glyphRows(code, true);
      const x0 = 4 + c * cw, y0 = 4 + r * ch;
      const isCur = cur && cur[0] === c && cur[1] === r;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 5; x++) {
          let on = (bits[y] >> (4 - x)) & 1;
          if (isCur && dev.blink && blinkOn) on = 1;
          if (isCur && dev.cursor && y === 7) on = 1;
          g.fillStyle = on ? T.on : T.off;
          if (on) g.globalAlpha = 0.25 + 0.75 * contrast;
          g.fillRect(x0 + x * P, y0 + y * P, P - 1, P - 1);
          g.globalAlpha = 1;
        }
      }
    }
  }
  pushImage(el, cv);
}

function lcdGeometry(size, i2c) {
  const big = size === '2004';
  const cols = big ? 20 : 16, rows = big ? 4 : 2;
  const W = big ? 390 : 300, H = big ? 236 : 140;
  const x0 = -15, y0 = 4;
  const pins = i2c
    ? [{ id: 'GND', x: 0, y: 0 }, { id: 'VCC', x: 10, y: 0 }, { id: 'SDA', x: 20, y: 0 }, { id: 'SCL', x: 30, y: 0 }]
    : ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'].map((id, i) => ({ id, x: i * 10, y: 0 }));
  return { cols, rows, W, H, x0, y0, pins, box: [x0, -6, x0 + W, y0 + H] };
}

function lcdRender(p, i2c) {
  const G = lcdGeometry(p.size, i2c);
  const T = LCD_THEMES[p.backlight] || LCD_THEMES.green;
  const { x0, y0, W, H } = G;
  let s = `<g filter="url(#softShadow)">${rect(x0, y0, W, H, { fill: '#1d7a3a', rx: 4 })}</g>`;
  s += mountHole(x0 + 10, y0 + 10, 4) + mountHole(x0 + W - 10, y0 + 10, 4) + mountHole(x0 + 10, y0 + H - 10, 4) + mountHole(x0 + W - 10, y0 + H - 10, 4);
  const bx = x0 + 18, by = y0 + 26, bw = W - 36, bh = H - 52;
  s += rect(bx, by, bw, bh, { fill: '#141414', rx: 3 });
  s += rect(bx + 8, by + 8, bw - 16, bh - 16, { fill: T.bg, rx: 2, cls: 'lcd-bg' });
  s += `<image class="disp-img" x="${bx + 12}" y="${by + 12}" width="${bw - 24}" height="${bh - 24}" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
  s += maleHeader(G.pins.map((q) => [q.x, q.y]));
  for (const q of G.pins) s += text(q.x, 9, q.id, { size: 3.2, fill: '#e5f7ea' });
  if (i2c) s += rect(44, -2, 50, 14, { fill: '#18181b', rx: 1.5 }) + text(69, 5, `I²C 0x${Number(p.address).toString(16).toUpperCase()}`, { size: 4, fill: '#9ca3af' });
  return s;
}

function lcdRuntime(ctx, i2c) {
  const G = lcdGeometry(ctx.props.size, i2c);
  const dev = new HD44780(G.cols, G.rows);
  let vdd, vss, bl;
  if (i2c) {
    vdd = ctx.node('VCC'); vss = ctx.node('GND');
    ctx.add(new Resistor(vdd, vss, 200));
  } else {
    vdd = ctx.node('VDD'); vss = ctx.node('VSS');
    ctx.add(new Resistor(vdd, vss, 3000));
    bl = ctx.add(new Diode(ctx.node('A'), ctx.node('K'), 2.9, 18));
  }
  const rt = {
    hd44780: dev,
    i2c: i2c ? { address: Number(ctx.props.address) } : null,
    visual: { dev, light: false, contrast: 1, powered: false, cols: G.cols, rows: G.rows },
    powered() { return ctx.v(vdd) - ctx.v(vss) > 4; },
    after() {
      const pw = this.powered();
      this.visual.powered = pw;
      if (!pw) dev.initialized = false;
      if (i2c) this.visual.light = pw && dev.backlight;
      else {
        this.visual.light = (bl.iAvg ?? bl.i) > 0.002;
        const v0 = ctx.node('V0');
        this.visual.contrast = v0 >= 0 ? Math.max(0, Math.min(1, (ctx.v(vdd) - ctx.v(v0) - 1) / 3.5)) : 1;
      }
      return false;
    },
  };
  return rt;
}

function lcdUpdate(el, v, p) {
  const blinkOn = Math.floor(performance.now() / 500) % 2 === 0;
  const key = `${v.dev.version}|${v.light}|${v.powered}|${v.contrast.toFixed(2)}|${(v.dev.blink && blinkOn) ? 1 : 0}`;
  if (el._k === key) return;
  el._k = key;
  const T = LCD_THEMES[p.backlight] || LCD_THEMES.green;
  el.querySelector('.lcd-bg').setAttribute('fill', v.light ? T.bg : T.bgOff);
  drawLCD(el, v.powered && v.dev.initialized ? v.dev : null, v.cols, v.rows, p.backlight, v.light, v.contrast, blinkOn);
}

register({
  type: 'lcd1602', name: 'LCD 16×2 (parallel)', category: 'display', tags: ['lcd', '1602', 'hd44780', 'liquidcrystal', 'character display'],
  description: 'HD44780 character LCD. Use LiquidCrystal lcd(RS, E, D4, D5, D6, D7). Wire VSS/RW/K to GND, VDD/A to 5V, V0 to GND or a pot.',
  box: (p) => lcdGeometry(p.size, false).box,
  pins: (p) => lcdGeometry(p.size, false).pins,
  props: [
    { key: 'size', label: 'Size', type: 'select', options: [['1602', '16 × 2'], ['2004', '20 × 4']], default: '1602' },
    { key: 'backlight', label: 'Backlight', type: 'select', options: [['green', 'Yellow-green'], ['blue', 'Blue']], default: 'green' },
  ],
  render: (p) => lcdRender(p, false),
  sim: { create: (ctx) => lcdRuntime(ctx, false) },
  update: lcdUpdate,
});

register({
  type: 'lcd-i2c', name: 'LCD 16×2 I²C', category: 'display', tags: ['lcd', 'i2c', '1602', '2004', 'liquidcrystal_i2c', 'pcf8574'],
  description: 'Character LCD with I²C backpack (PCF8574). Only 4 wires: GND, VCC, SDA, SCL. Library: LiquidCrystal_I2C lcd(0x27, 16, 2).',
  box: (p) => lcdGeometry(p.size, true).box,
  pins: (p) => lcdGeometry(p.size, true).pins,
  i2cPins: { sda: 'SDA', scl: 'SCL' },
  props: [
    { key: 'size', label: 'Size', type: 'select', options: [['1602', '16 × 2'], ['2004', '20 × 4']], default: '1602' },
    { key: 'backlight', label: 'Backlight', type: 'select', options: [['blue', 'Blue'], ['green', 'Yellow-green']], default: 'blue' },
    { key: 'address', label: 'I²C address', type: 'select', options: [['39', '0x27'], ['63', '0x3F']], default: '39' },
  ],
  render: (p) => lcdRender(p, true),
  sim: { create: (ctx) => lcdRuntime(ctx, true) },
  update: lcdUpdate,
});

// ------------------------------------------------------------------ OLED SSD1306
const OLED_COLORS = { white: ['#f2f6ff', '#f2f6ff'], blue: ['#4cc9ff', '#4cc9ff'], yellowblue: ['#ffd84a', '#4cc9ff'] };
register({
  type: 'oled-ssd1306', name: 'OLED 0.96" SSD1306', category: 'display', tags: ['oled', 'ssd1306', '128x64', 'i2c', 'graphics', 'adafruit'],
  description: '128×64 monochrome OLED over I²C (address 0x3C). Library: Adafruit_SSD1306 + Adafruit_GFX.',
  box: [-35, -110, 65, 4],
  pins: [{ id: 'GND', x: 0, y: 0 }, { id: 'VCC', x: 10, y: 0 }, { id: 'SCL', x: 20, y: 0 }, { id: 'SDA', x: 30, y: 0 }],
  i2cPins: { sda: 'SDA', scl: 'SCL' },
  props: [
    { key: 'color', label: 'Colour', type: 'select', options: [['white', 'White'], ['blue', 'Blue'], ['yellowblue', 'Yellow + Blue']], default: 'white' },
    { key: 'address', label: 'I²C address', type: 'select', options: [['60', '0x3C'], ['61', '0x3D']], default: '60' },
  ],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-35, -106, 100, 104, { fill: '#1f3a8a', rx: 4 })}</g>`;
    s += mountHole(-28, -99, 3) + mountHole(58, -99, 3) + mountHole(-28, -9, 3) + mountHole(58, -9, 3);
    s += rect(-32, -86, 94, 64, { fill: '#0d0d10', rx: 2 });
    s += rect(-29, -80, 88, 46, { fill: '#000', rx: 1 });
    s += `<image class="disp-img" x="-28" y="-79" width="86" height="43" preserveAspectRatio="none" style="image-rendering:pixelated"/>`;
    s += rect(-14, -30, 58, 6, { fill: '#2a2a2e', rx: 1 });
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0]]);
    s += ['GND', 'VCC', 'SCL', 'SDA'].map((t, i) => text(i * 10, -9, t, { size: 3.2 })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 250));
      const dev = new SSD1306();
      return {
        ssd1306: dev,
        i2c: { address: Number(ctx.props.address) },
        visual: { dev, powered: false },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 3; },
        after() { this.visual.powered = this.powered(); return false; },
      };
    },
  },
  update(el, v, p) {
    const key = v.dev.version + '|' + v.powered + '|' + v.dev.on + '|' + v.dev.invert;
    if (el._k === key) return;
    el._k = key;
    const cv = canvasFor(el, 128, 64);
    const g = cv.getContext('2d');
    const img = g.createImageData(128, 64);
    const [c1, c2] = OLED_COLORS[p.color] || OLED_COLORS.white;
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const A = rgb(c1), B = rgb(c2);
    const on = v.powered && v.dev.on;
    for (let i = 0; i < 128 * 64; i++) {
      let px = on ? v.dev.fb[i] : 0;
      if (on && v.dev.invert) px = px ? 0 : 1;
      const y = (i / 128) | 0;
      const c = y < 16 ? A : B;
      img.data[i * 4] = px ? c[0] : 4;
      img.data[i * 4 + 1] = px ? c[1] : 6;
      img.data[i * 4 + 2] = px ? c[2] : 10;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    pushImage(el, cv);
  },
});

// ------------------------------------------------------------------ TM1637 4-digit display
const SEGS = {
  a: 'M3 0 L5 -2 H15 L17 0 L15 2 H5 Z', b: 'M18 1 L20 3 V13 L18 15 L16 13 V3 Z', c: 'M18 17 L20 19 V29 L18 31 L16 29 V19 Z',
  d: 'M3 32 L5 30 H15 L17 32 L15 34 H5 Z', e: 'M2 17 L4 19 V29 L2 31 L0 29 V19 Z', f: 'M2 1 L4 3 V13 L2 15 L0 13 V3 Z', g: 'M3 16 L5 14 H15 L17 16 L15 18 H5 Z',
};
register({
  type: 'tm1637', name: 'TM1637 4-Digit Display', category: 'display', tags: ['tm1637', '7 segment', 'clock', '4 digit', 'counter'],
  description: '4-digit 7-segment display with colon. 2 wires: CLK and DIO. Library: TM1637Display.',
  box: [-48, -86, 118, 4],
  pins: [{ id: 'CLK', x: 0, y: 0 }, { id: 'DIO', x: 10, y: 0 }, { id: 'VCC', x: 20, y: 0 }, { id: 'GND', x: 30, y: 0 }],
  render() {
    let s = `<g filter="url(#softShadow)">${rect(-48, -86, 166, 82, { fill: '#1e40af', rx: 4 })}</g>`;
    s += rect(-40, -78, 150, 62, { fill: '#121214', rx: 2 });
    for (let d = 0; d < 4; d++) {
      s += `<g transform="translate(${-30 + d * 36 + (d >= 2 ? 6 : 0)} -64) skewX(-6)">`;
      for (const [k, dd] of Object.entries(SEGS)) s += path(dd, { fill: '#2a1212', cls: `tm-seg tm-${d}-${k}` });
      s += `</g>`;
    }
    s += circle(38, -54, 2.4, { fill: '#2a1212', cls: 'tm-colon' }) + circle(36, -40, 2.4, { fill: '#2a1212', cls: 'tm-colon' });
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0]]);
    s += ['CLK', 'DIO', 'VCC', 'GND'].map((t, i) => text(i * 10, -9, t, { size: 3.2 })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      ctx.add(new Resistor(vcc, gnd, 400));
      const dev = new TM1637();
      return {
        tm1637: dev,
        visual: { dev, powered: false },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 3; },
        after() { this.visual.powered = this.powered(); return false; },
      };
    },
  },
  update(el, v) {
    const key = v.dev.version + '|' + v.powered + '|' + v.dev.on + '|' + v.dev.brightness;
    if (el._k === key) return;
    el._k = key;
    if (!el._segs) el._segs = Array.from(el.querySelectorAll('.tm-seg'));
    const on = v.powered && v.dev.on;
    const b = 0.45 + (v.dev.brightness / 7) * 0.55;
    const col = `rgba(255, 40, 40, ${b.toFixed(2)})`;
    for (const sg of el._segs) {
      const [, d, k] = sg.getAttribute('class').split(' ')[1].split('-');
      const bit = 'abcdefg'.indexOf(k);
      const lit = on && (v.dev.segs[+d] >> bit) & 1;
      sg.setAttribute('fill', lit ? col : '#2a1212');
      sg.style.filter = lit ? 'drop-shadow(0 0 2px #ff3030)' : '';
    }
    const colon = on && (v.dev.segs[1] & 0x80);
    for (const c of el.querySelectorAll('.tm-colon')) c.setAttribute('fill', colon ? col : '#2a1212');
  },
});

// ------------------------------------------------------------------ MAX7219 dot matrix
register({
  type: 'max7219', name: 'MAX7219 8×8 LED Matrix', category: 'display', tags: ['max7219', 'dot matrix', '8x8', 'ledcontrol', 'scrolling text'],
  description: 'Red 8×8 LED matrix with MAX7219 driver (SPI-like: DIN, CS, CLK). Library: LedControl. Choose 4 modules for a 32×8 display.',
  box: (p) => [-8, -96, (Number(p.modules) || 1) * 82 + 4, 4],
  pins: [{ id: 'VCC', x: 0, y: 0 }, { id: 'GND', x: 10, y: 0 }, { id: 'DIN', x: 20, y: 0 }, { id: 'CS', x: 30, y: 0 }, { id: 'CLK', x: 40, y: 0 }],
  props: [{ key: 'modules', label: 'Modules', type: 'select', options: [['1', '1 (8×8)'], ['4', '4 (32×8)']], default: '1' }],
  render(p) {
    const m = Number(p.modules) || 1;
    let s = `<g filter="url(#softShadow)">${rect(-8, -96, m * 82 + 12, 100, { fill: '#1e3a8a', rx: 3 })}</g>`;
    for (let k = 0; k < m; k++) {
      const ox = k * 82;
      s += rect(ox - 4, -92, 80, 80, { fill: '#121214', rx: 2 });
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) s += circle(ox + 5 + c * 9.6, -83 + r * 9.6, 3.6, { fill: '#3a1010', cls: `mx-dot` });
    }
    s += maleHeader([[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]]);
    s += ['VCC', 'GND', 'DIN', 'CS', 'CLK'].map((t, i) => text(i * 10, -7.5, t, { size: 3, fill: '#fff' })).join('');
    return s;
  },
  sim: {
    create(ctx) {
      const m = Number(ctx.props.modules) || 1;
      const vcc = ctx.node('VCC'), gnd = ctx.node('GND');
      const load = ctx.add(new Resistor(vcc, gnd, 1000));
      const devs = Array.from({ length: m }, () => new MAX7219());
      return {
        max7219: devs,
        visual: { devs, powered: false, v: 0 },
        powered() { return ctx.v(vcc) - ctx.v(gnd) > 3.5; },
        prepare() {
          let lit = 0;
          for (const d of devs) if (!d.shutdown) for (const r of d.rows) for (let b = 0; b < 8; b++) lit += (r >> b) & 1;
          load.setR(Math.max(5, 5 / (0.003 + lit * 0.002)));
        },
        after() { this.visual.powered = this.powered(); return false; },
      };
    },
  },
  update(el, v) {
    const key = v.devs.map((d) => d.version).join(',') + '|' + v.powered;
    if (el._k === key) return;
    el._k = key;
    if (!el._dots) el._dots = Array.from(el.querySelectorAll('.mx-dot'));
    v.devs.forEach((d, k) => {
      const on = v.powered && !d.shutdown;
      const glow = 0.5 + (d.intensity / 15) * 0.5;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          // LedControl: setLed(addr,row,col) lights bit (7-col)? -> column 0 is the left-most LED
          const lit = on && (d.rows[r] >> (7 - c)) & 1;
          const dot = el._dots[k * 64 + r * 8 + c];
          if (!dot) continue;
          if (dot._l === lit) continue;
          dot._l = lit;
          dot.setAttribute('fill', lit ? `rgba(255,${Math.round(40 + 40 * glow)},40,1)` : '#3a1010');
          dot.style.filter = lit ? 'drop-shadow(0 0 2.5px #ff3030)' : '';
        }
      }
    });
  },
});
