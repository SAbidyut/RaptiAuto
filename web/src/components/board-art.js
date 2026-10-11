// Artwork of the breadboard-style and Mega boards: every part sits in its own zone so no label, chip
// or button covers a pin name (the rows of pin names run 8.5 units in from the pads; the zones
// between are what is left for chips, buttons and lettering). Units: 10 = 0.1".
import {
  rect, circle, text, path, maleHeader, smdLed, chipQFP, pad,
  silk, smdRow, smdElec, regulator, crystal, polyfuse, via, traces, smallChip,
} from './draw.js';

/** Pin pads of a dual-row board and the names printed beside them (inward). */
export function rowArt(pins, o = {}) {
  let s = '';
  for (const p of pins) s += pad(p.x, p.y, { r: 3.3 });
  for (const p of pins) {
    const up = p.y === o.yTop;
    s += text(p.x, p.y + (up ? 8.5 : -8.5), p.label, { size: o.labelSize || 3.4, rot: -90, anchor: up ? 'end' : 'start', fill: o.labelFill || '#fff' });
  }
  return s;
}

const tactile = (x, y, label, o = {}) => rect(x - 5, y - 5, 10, 10, { fill: '#2b2b2e', rx: 1.4 }) + circle(x, y, 3.2, { fill: '#555' }) + circle(x, y, 1.2, { fill: '#8a8a90' }) +
  (label ? silk(x + (o.dx ?? 8), y, label, { size: 3, anchor: 'start', weight: 600 }) : '');

const microUsb = (x, y, w = 22, h = 22) => rect(x, y, w, h, { fill: 'url(#silver)', rx: 2, stroke: '#7b818a', sw: 0.5 }) + rect(x, y + h / 2 - 5, 5, 10, { fill: '#30343a' }) + rect(x + 5, y + 3, w - 9, h - 6, { fill: 'none', stroke: '#8e949d', sw: 0.5 });

// ------------------------------------------------------------------ Nano
export function nanoArt(pins) {
  let s = `<g filter="url(#softShadow)">${rect(-24, -6, 168, 72, { fill: '#0b6fb8', rx: 3 })}</g>`;
  s += path('M-24 6 H-8 M-8 6 V54 M-24 54 H-8', { stroke: 'rgba(255,255,255,.12)', sw: 1.2 });
  s += microUsb(-30, 19, 24, 22);
  s += smallChip(-2, 25, 16, 10, 'CH340G') + smdRow([[-2, 38], [4, 38, 'c'], [10, 38, 'r']]);
  s += tactile(24, 30, '');
  s += chipQFP(64, 30, 18, { pins: 8, label: '328P' });
  s += crystal(84, 27, 10, '16M');
  s += smdLed(104, 24, { cls: 'led-L', color: '#ffb000' }) + smdLed(104, 30, { cls: 'led-TX', color: '#ffb000' }) + smdLed(104, 36, { cls: 'led-RX', color: '#ffb000' }) + smdLed(114, 30, { cls: 'led-ON', color: '#39ff6a' });
  s += silk(110, 24, 'L', { size: 2.6, anchor: 'start' }) + silk(110, 36, 'RX', { size: 2.6, anchor: 'start' });
  s += regulator(34, 24, '') + smdRow([[50, 36, 'c'], [50, 21, 'c'], [56, 21, 'r']]);
  s += text(130, 30, 'NANO', { size: 7, weight: 800, anchor: 'middle', fill: '#eaf4ff' });
  s += rowArt(pins, { yTop: 0 });
  return s;
}

// ------------------------------------------------------------------ ESP32 DevKit
export function esp32Art(pins) {
  let s = `<g filter="url(#softShadow)">${rect(-26, -8, 194, 106, { fill: '#18181b', rx: 4 })}</g>`;
  s += traces('M-6 28 H20 V40 M44 52 H60', { stroke: 'rgba(255,255,255,.1)' });
  s += microUsb(-32, 34, 22, 22);
  // the module sits between the rows of pin names (y 20 … 70)
  s += rect(60, 20, 104, 50, { fill: 'url(#silver)', rx: 1.5, stroke: '#888', sw: 0.6 });
  s += rect(150, 20, 14, 50, { fill: '#1c4e8f' }) + path('M152 27 h8 v6 h-8 v6 h8 v6 h-8 v6 h8 v6 h-8 v6 h8', { stroke: '#d4a83a', sw: 1.2 });
  s += text(104, 38, 'ESP32-WROOM-32', { size: 5.4, fill: '#3d3f44', weight: 700 }) + text(104, 49, 'Espressif', { size: 4.2, fill: '#55585f' }) + text(104, 59, '2.4 GHz · BT · FCC', { size: 3, fill: '#6b6e75' });
  // buttons, USB-UART bridge, regulator, LEDs
  s += tactile(-6, 28, 'EN', { dx: 8 });
  s += tactile(-6, 62, 'BOOT', { dx: 8 });
  s += chipQFP(36, 45, 14, { pins: 6, label: 'CP2102' });
  s += regulator(47, 56, 'AMS') + silk(53, 53, '3V3', { size: 2.4 });
  s += smdLed(22, 64, { cls: 'led-ON', color: '#ff3030', off: '#cbb' }) + smdLed(32, 64, { cls: 'led-L', color: '#2f8bff', off: '#bcc6d6' });
  s += silk(26, 69, 'PWR  IO2', { size: 2.2 });
  s += smdRow([[16, 36, 'c'], [16, 42, 'r'], [22, 36, 'r'], [22, 42, 'c'], [52, 36, 'c'], [52, 42, 'r']]);
  s += via(58, 28) + via(58, 62);
  s += rowArt(pins, { yTop: 0 });
  return s;
}

// ------------------------------------------------------------------ NodeMCU ESP8266
export function nodemcuArt(pins) {
  let s = `<g filter="url(#softShadow)">${rect(-26, -8, 194, 106, { fill: '#1d1d20', rx: 4 })}</g>`;
  s += traces('M-6 28 H20 V40 M44 52 H62', { stroke: 'rgba(255,255,255,.1)' });
  s += microUsb(-32, 34, 22, 22);
  s += rect(66, 20, 96, 50, { fill: 'url(#silver)', rx: 1.5, stroke: '#888', sw: 0.6 });
  s += rect(146, 20, 16, 50, { fill: '#1f2f6b' }) + path('M149 28 h9 v6 h-9 v6 h9 v6 h-9 v6 h9', { stroke: '#d4a83a', sw: 1.2 });
  s += text(104, 38, 'ESP8266MOD', { size: 5.5, fill: '#3d3f44', weight: 700 }) + text(104, 49, 'ESP-12E', { size: 4.2, fill: '#55585f' }) + text(104, 59, 'AI-THINKER', { size: 3, fill: '#6b6e75' });
  s += tactile(-6, 28, 'RST', { dx: 8 }) + tactile(-6, 62, 'FLASH', { dx: 8 });
  s += chipQFP(34, 45, 14, { pins: 6, label: 'CH340' });
  s += regulator(48, 56, 'AMS') + silk(54, 53, '3V3', { size: 2.4 });
  s += smdLed(22, 64, { cls: 'led-ON', color: '#ff3030', off: '#cbb' }) + smdLed(32, 64, { cls: 'led-L', color: '#2f8bff', off: '#bcc6d6' });
  s += smdRow([[16, 36, 'c'], [16, 42, 'r'], [22, 36, 'r'], [22, 42, 'c'], [52, 36, 'c'], [52, 42, 'r']]);
  s += text(30, 24, 'NodeMCU', { size: 5.2, weight: 700, fill: '#e5e5e5' });
  s += via(60, 28) + via(60, 62);
  s += rowArt(pins, { yTop: 0 });
  return s;
}

// ------------------------------------------------------------------ Raspberry Pi Pico (pins 8.5 in)
export function picoBoardArt(pins) {
  let s = `<g filter="url(#softShadow)">${rect(-14, -8, 210, 86, { fill: '#1a7f3c', rx: 4 })}</g>`;
  s += traces('M-4 35 H20 M44 35 H85 M105 35 H128 M62 22 H85 V30', { stroke: 'rgba(255,255,255,.14)' });
  s += microUsb(-20, 25, 20, 20);
  s += tactile(26, 36, '', {}) + silk(26, 45.2, 'BOOTSEL', { size: 2.6 });
  s += smdLed(46, 30, { cls: 'led-L', color: '#3bff6b', off: '#cdd8cd' }) + silk(46, 24.5, 'LED', { size: 2.4 });
  s += crystal(58, 33, 14, '12.000');
  s += chipQFP(95, 35, 20, { pins: 10, label: 'RP2040' });
  s += rect(128, 27, 16, 16, { fill: '#222', rx: 1 }) + text(136, 35, 'W25Q', { size: 3.2, fill: '#999' });
  s += smdRow([[118, 24, 'c'], [118, 46, 'r'], [150, 28, 'c'], [150, 34, 'r'], [150, 40, 'c'], [62, 42, 'r'], [68, 42, 'c']]);
  s += regulator(152, 22, '');
  s += text(176, 35, 'Pico', { size: 8, weight: 800, rot: -90, fill: '#f4fff6' });
  for (const y of [24, 35, 46]) s += circle(186, y, 2.2, { fill: 'url(#gold)', stroke: '#9c7a2b', sw: 0.4 }) + circle(186, y, 0.8, { fill: '#10281c' });
  s += rowArt(pins, { yTop: 0, labelSize: 3 });
  return s;
}

// ------------------------------------------------------------------ STM32 Blue Pill
export function bluePillArt(pins) {
  let s = `<g filter="url(#softShadow)">${rect(-20, -8, 222, 76, { fill: '#1e4fb4', rx: 3 })}</g>`;
  s += traces('M0 30 H52 M70 30 H88 M112 30 H150', { stroke: 'rgba(255,255,255,.14)' });
  s += microUsb(-26, 18, 20, 20);
  s += smdLed(10, 24, { cls: 'led-L', color: '#3bff6b', off: '#cdd8cd' }) + smdLed(10, 36, { cls: 'led-ON', color: '#ff3030', off: '#cbb' });
  s += tactile(32, 30, '');
  s += crystal(46, 27, 14, '8.000');
  s += chipQFP(92, 30, 20, { pins: 10, label: 'F103C8' });
  s += crystal(108, 28, 6, '');
  s += regulator(124, 25, 'LDO') + smdRow([[140, 24, 'c'], [140, 36, 'r'], [60, 36, 'c'], [66, 36, 'r']]);
  // BOOT0 / BOOT1 jumpers and the SWD header
  s += rect(150, 20, 20, 8, { fill: '#1f1f22', rx: 0.6 }) + rect(150, 33, 20, 8, { fill: '#1f1f22', rx: 0.6 });
  [[154, 24, 160], [164, 24, 160], [154, 37, 160], [164, 37, 160]].forEach(([x, y]) => { s += rect(x - 1.4, y - 1.4, 2.8, 2.8, { fill: 'url(#gold)' }); });
  s += rect(157, 22.4, 9, 3.2, { fill: '#ffd700', rx: 0.4 }) + rect(157, 35.4, 9, 3.2, { fill: '#ffd700', rx: 0.4 });
  s += silk(174, 24, 'B0', { size: 2.4, anchor: 'start' }) + silk(174, 37, 'B1', { size: 2.4, anchor: 'start' });
  s += rowArt(pins, { yTop: 0, labelSize: 3 });
  return s;
}

// ------------------------------------------------------------------ Mega 2560 details (the rest is in boards.js)
export function megaDetails() {
  let s = traces('M46 92 H88 V108 H110 M120 30 H180 M130 150 H190 V170 M240 40 H300 M300 150 H350') + traces('M362 30 V190', { sw: 1 });
  s += chipQFP(78, 58, 18, { pins: 8, label: '16U2' }) + crystal(90, 73, 10, '16M') + polyfuse(50, 36) + silk(54.5, 44, 'F1', { size: 2.6 });
  s += maleHeader([[56, 84], [66, 84], [56, 94], [66, 94], [56, 104], [66, 104]]) + silk(73, 94, 'ICSP', { size: 3, anchor: 'start' });
  s += crystal(160, 130, 16, '16.000') + smdElec(52, 128, 6) + smdElec(52, 146, 6) + regulator(52, 172, 'REG') + silk(58, 168, '5V', { size: 2.6 });
  s += smdRow([[93, 50], [93, 55], [93, 60, 'c'], [93, 65, 'c'], [99, 50, 'cv'], [99, 58, 'rv'], [105, 50, 'r'], [105, 55, 'r'], [170, 112, 'r'], [178, 112, 'c'], [186, 112, 'r'], [64, 150, 'r'], [64, 155, 'r'], [72, 152, 'c']]);
  s += maleHeader([[290, 120], [300, 120], [290, 130], [300, 130], [290, 140], [300, 140]]) + silk(295, 148, 'ICSP', { size: 3 });
  s += via(100, 108) + via(236, 112) + via(84, 168) + via(300, 160);
  return s;
}
