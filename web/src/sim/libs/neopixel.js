// Adafruit_NeoPixel library.
import { addLibrary, defineClass } from './registry.js';

const GAMMA = Array.from({ length: 256 }, (_, i) => Math.round(Math.pow(i / 255, 2.6) * 255));

export function colorHSV(hue, sat = 255, val = 255) {
  hue = Math.floor(((hue & 0xffff) * 1530 + 32768) / 65536);
  let r, g, b;
  if (hue < 510) { b = 0; if (hue < 255) { r = 255; g = hue; } else { r = 510 - hue; g = 255; } }
  else if (hue < 1020) { r = 0; if (hue < 765) { g = 255; b = hue - 510; } else { g = 1020 - hue; b = 255; } }
  else if (hue < 1530) { g = 0; if (hue < 1275) { r = hue - 1020; b = 255; } else { r = 255; b = 1530 - hue; } }
  else { r = 255; g = 0; b = 0; }
  const v1 = 1 + (val & 255), s1 = 1 + (sat & 255), s2 = 255 - (sat & 255);
  return (((((((r * s1) >> 8) + s2) * v1) & 0xff00) << 8) | (((((g * s1) >> 8) + s2) * v1) & 0xff00) | (((((b * s1) >> 8) + s2) * v1) >> 8)) >>> 0;
}

const color = (r, g, b) => (((r & 255) << 16) | ((g & 255) << 8) | (b & 255)) >>> 0;
const color4 = (r, g, b, w = 0) => (((w & 255) << 24) | ((r & 255) << 16) | ((g & 255) << 8) | (b & 255)) >>> 0;
// Adafruit_NeoPixel.h: type = (wOffset << 6) | (rOffset << 4) | (gOffset << 2) | bOffset; W == R → no white LED
const neo = (w, r, g, b) => (w << 6) | (r << 4) | (g << 2) | b;

class NeoPixel {
  constructor(rt, hw, n = 0, pin = -1, type = 0x52) {
    this.rt = rt; this.hw = hw;
    this.n = n; this.pin = pin; this.type = type;
    this.px = new Array(n).fill(0);
    this.bright = 0;
  }
  begin() { if (this.pin >= 0) this.hw.pinMode(this.pin, 1); }
  show() {
    if (this.pin < 0) return;
    const t = this.type;
    const wo = (t >> 6) & 3, ro = (t >> 4) & 3, go = (t >> 2) & 3, bo = t & 3;
    const rgbw = wo !== ro;
    const out = this.px.map((c) => {
      let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      if (this.bright) { r = (r * this.bright) >> 8; g = (g * this.bright) >> 8; b = (b * this.bright) >> 8; }
      if (rgbw) {
        // an RGBW strip: its white LED adds to all three colours
        let w = (c >>> 24) & 255;
        if (this.bright) w = (w * this.bright) >> 8;
        return color(Math.min(255, r + w), Math.min(255, g + w), Math.min(255, b + w));
      }
      const bytes = [0, 0, 0];
      bytes[ro] = r; bytes[go] = g; bytes[bo] = b;
      // the WS2812B on the board expects G, R, B
      return color(bytes[1], bytes[0], bytes[2]);
    });
    this.hw.sendWs2812(this.pin, out);
    this.rt.t += 30 * this.n + 50;
  }
  setPixelColor(i, r, g, b, w = 0) {
    if (i < 0 || i >= this.n) return;
    this.px[i] = g === undefined ? r >>> 0 : color4(r, g, b, w);
  }
  getPixelColor(i) { return i >= 0 && i < this.n ? this.px[i] : 0; }
  setBrightness(b) { this.bright = ((b & 255) + 1) & 511; if (this.bright > 256) this.bright = 256; }
  getBrightness() { return this.bright ? this.bright - 1 : 255; }
  clear() { this.px.fill(0); }
  fill(c = 0, first = 0, count = 0) {
    if (first >= this.n) return;
    const end = count === 0 ? this.n : Math.min(this.n, first + count);
    for (let i = first; i < end; i++) this.px[i] = c >>> 0;
  }
  Color(r, g, b, w) { return color4(r, g, b, w); }
  ColorHSV(h, s, v) { return colorHSV(h, s, v); }
  gamma32(c) { return color4(GAMMA[(c >> 16) & 255], GAMMA[(c >> 8) & 255], GAMMA[c & 255], GAMMA[(c >>> 24) & 255]); }
  gamma8(x) { return GAMMA[x & 255]; }
  sine8(x) { return Math.round((Math.sin(((x & 255) / 256) * Math.PI * 2) + 1) * 127.5) & 255; }
  numPixels() { return this.n; }
  setPin(p) { this.pin = p; }
  getPin() { return this.pin; }
  updateLength(n) { this.n = n; this.px = new Array(n).fill(0); }
  updateType(t) { this.type = t; }
  canShow() { return 1; }
  rainbow(first = 0, reps = 1, sat = 255, bri = 255, gammify = 1) {
    for (let i = 0; i < this.n; i++) {
      const hue = first + Math.floor((i * reps * 65536) / this.n);
      let c = colorHSV(hue, sat, bri);
      if (gammify) c = this.gamma32(c);
      this.px[i] = c;
    }
  }
}

addLibrary((natives, rt, hw) => {
  const methods = {
    begin: { ret: 'void' }, show: { ret: 'void' }, setPixelColor: { ret: 'void' }, getPixelColor: { ret: 'u32' },
    setBrightness: { ret: 'void' }, getBrightness: { ret: 'u8' }, clear: { ret: 'void' }, fill: { ret: 'void' },
    Color: { ret: 'u32' }, ColorHSV: { ret: 'u32' }, gamma32: { ret: 'u32' }, gamma8: { ret: 'u8' }, sine8: { ret: 'u8' },
    numPixels: { ret: 'u16' }, setPin: { ret: 'void' }, getPin: { ret: 'int' }, updateLength: { ret: 'void' },
    updateType: { ret: 'void' }, canShow: { ret: 'bool' }, rainbow: { ret: 'void' },
  };
  defineClass(natives, 'Adafruit_NeoPixel', {
    create: (r, args) => new NeoPixel(r, hw, ...args),
    methods,
    statics: {
      Color: { ret: 'u32', fn: (r, g, b, w) => color4(r, g, b, w) },
      ColorHSV: { ret: 'u32', fn: (h, s, v) => colorHSV(h, s, v) },
      gamma32: { ret: 'u32', fn: (c) => color4(GAMMA[(c >> 16) & 255], GAMMA[(c >> 8) & 255], GAMMA[c & 255], GAMMA[(c >>> 24) & 255]) },
      gamma8: { ret: 'u8', fn: (x) => GAMMA[x & 255] },
    },
  });
  Object.assign(natives.constants, {
    NEO_RGB: neo(0, 0, 1, 2), NEO_RBG: neo(0, 0, 2, 1), NEO_GRB: neo(1, 1, 0, 2), NEO_GBR: neo(2, 2, 0, 1), NEO_BRG: neo(1, 1, 2, 0), NEO_BGR: neo(2, 2, 1, 0),
    NEO_WRGB: neo(0, 1, 2, 3), NEO_WRBG: neo(0, 1, 3, 2), NEO_WGRB: neo(0, 2, 1, 3), NEO_WGBR: neo(0, 3, 1, 2), NEO_WBRG: neo(0, 2, 3, 1), NEO_WBGR: neo(0, 3, 2, 1),
    NEO_RWGB: neo(1, 0, 2, 3), NEO_RWBG: neo(1, 0, 3, 2), NEO_RGWB: neo(2, 0, 1, 3), NEO_RGBW: neo(3, 0, 1, 2), NEO_RBWG: neo(2, 0, 3, 1), NEO_RBGW: neo(3, 0, 2, 1),
    NEO_GWRB: neo(1, 2, 0, 3), NEO_GWBR: neo(1, 3, 0, 2), NEO_GRWB: neo(2, 1, 0, 3), NEO_GRBW: neo(3, 1, 0, 2), NEO_GBWR: neo(2, 3, 0, 1), NEO_GBRW: neo(3, 2, 0, 1),
    NEO_BWRG: neo(1, 2, 3, 0), NEO_BWGR: neo(1, 3, 2, 0), NEO_BRWG: neo(2, 1, 3, 0), NEO_BGWR: neo(2, 3, 1, 0), NEO_BRGW: neo(3, 1, 2, 0), NEO_BGRW: neo(3, 2, 1, 0),
    NEO_KHZ800: 0x0000, NEO_KHZ400: 0x0100,
  });
});
