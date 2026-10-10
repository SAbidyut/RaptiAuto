// Raspberry Pi 5 / 4 Model B and Pico / Pico W / Pico 2 / Pico 2 W: specs, header pinouts and
// top-view artwork (SVG). Units: 0.1 mm.
import { PICO_W_LED } from './gpio.js';

export const BOARDS = {
  pi5: {
    id: 'pi5', kind: 'pi', name: 'Raspberry Pi 5', short: 'Pi 5', year: 2023,
    soc: 'Broadcom BCM2712', cpu: 'Quad-core Arm Cortex-A76 @ 2.4 GHz', gpu: 'VideoCore VII', ram: '8 GB LPDDR4X-4267',
    io: 'RP1 I/O controller · 2× USB 3.0 · 2× USB 2.0 · Gigabit Ethernet · 2× micro HDMI 4Kp60 · PCIe 2.0 x1',
    revision: 'd04170', model: 'Raspberry Pi 5 Model B Rev 1.0', kernel: '6.6.51+rpt-rpi-2712', os: 'Raspberry Pi OS (64-bit) Bookworm',
  },
  pi4: {
    id: 'pi4', kind: 'pi', name: 'Raspberry Pi 4 Model B', short: 'Pi 4', year: 2019,
    soc: 'Broadcom BCM2711', cpu: 'Quad-core Arm Cortex-A72 @ 1.8 GHz', gpu: 'VideoCore VI', ram: '4 GB LPDDR4-3200',
    io: '2× USB 3.0 · 2× USB 2.0 · Gigabit Ethernet · 2× micro HDMI 4Kp60 · 3.5 mm A/V',
    revision: 'c03115', model: 'Raspberry Pi 4 Model B Rev 1.5', kernel: '6.6.51+rpt-rpi-v8', os: 'Raspberry Pi OS (64-bit) Bookworm',
  },
  pico: {
    id: 'pico', kind: 'pico', name: 'Raspberry Pi Pico', short: 'Pico', year: 2021, mcu: 'RP2040',
    cpu: 'Dual-core Arm Cortex-M0+ @ 133 MHz', ram: '264 KB SRAM', flash: '2 MB QSPI flash', led: 25,
    io: '26 GPIO · 3× 12-bit ADC · 16 PWM channels · 2× UART · 2× I²C · 2× SPI · 8 PIO state machines',
  },
  picow: {
    id: 'picow', kind: 'pico', name: 'Raspberry Pi Pico W', short: 'Pico W', year: 2022, mcu: 'RP2040', wifi: true,
    cpu: 'Dual-core Arm Cortex-M0+ @ 133 MHz', ram: '264 KB SRAM', flash: '2 MB QSPI flash', led: PICO_W_LED,
    io: '2.4 GHz Wi-Fi 4 + Bluetooth 5.2 (CYW43439) · 26 GPIO · 3× ADC · 2× UART · 2× I²C · 2× SPI',
  },
  pico2: {
    id: 'pico2', kind: 'pico', name: 'Raspberry Pi Pico 2', short: 'Pico 2', year: 2024, mcu: 'RP2350',
    cpu: 'Dual-core Arm Cortex-M33 @ 150 MHz', ram: '520 KB SRAM', flash: '4 MB QSPI flash', led: 25,
    io: '26 GPIO · 3× 12-bit ADC · 24 PWM channels · 2× UART · 2× I²C · 2× SPI · 12 PIO state machines',
  },
  pico2w: {
    id: 'pico2w', kind: 'pico', name: 'Raspberry Pi Pico 2 W', short: 'Pico 2 W', year: 2024, mcu: 'RP2350', wifi: true,
    cpu: 'Dual-core Arm Cortex-M33 @ 150 MHz', ram: '520 KB SRAM', flash: '4 MB QSPI flash', led: PICO_W_LED,
    io: '2.4 GHz Wi-Fi 4 + Bluetooth 5.2 (CYW43439) · 26 GPIO · 3× ADC · 2× UART · 2× I²C · 2× SPI',
  },
};
export const BOARD_ORDER = ['pi5', 'pi4', 'pico', 'picow', 'pico2', 'pico2w'];

// ------------------------------------------------------------------ 40-pin header (Pi)
// [physical] = { name, gpio?, type: power3|power5|gnd|gpio|i2c|spi|uart|id, alt }
const PI_ALT = {
  0: 'ID_SD (HAT EEPROM)', 1: 'ID_SC (HAT EEPROM)', 2: 'I²C1 SDA', 3: 'I²C1 SCL', 4: 'GPCLK0', 5: '', 6: '', 7: 'SPI0 CE1', 8: 'SPI0 CE0',
  9: 'SPI0 MISO', 10: 'SPI0 MOSI', 11: 'SPI0 SCLK', 12: 'PWM0', 13: 'PWM1', 14: 'UART0 TXD', 15: 'UART0 RXD', 16: 'SPI1 CE2', 17: '', 18: 'PWM0 · PCM CLK',
  19: 'PWM1 · PCM FS · SPI1 MISO', 20: 'PCM DIN · SPI1 MOSI', 21: 'PCM DOUT · SPI1 SCLK', 22: '', 23: '', 24: '', 25: '', 26: '', 27: '',
};
const PI_GPIO_AT = { 3: 2, 5: 3, 7: 4, 8: 14, 10: 15, 11: 17, 12: 18, 13: 27, 15: 22, 16: 23, 18: 24, 19: 10, 21: 9, 22: 25, 23: 11, 24: 8, 26: 7, 27: 0, 28: 1, 29: 5, 31: 6, 32: 12, 33: 13, 35: 19, 36: 16, 37: 26, 38: 20, 40: 21 };
const PI_POWER = { 1: ['3V3', 'power3'], 17: ['3V3', 'power3'], 2: ['5V', 'power5'], 4: ['5V', 'power5'] };
const PI_GND = [6, 9, 14, 20, 25, 30, 34, 39];

function piType(g) {
  if (g === 0 || g === 1) return 'id';
  if (g === 2 || g === 3) return 'i2c';
  if (g >= 7 && g <= 11) return 'spi';
  if (g === 14 || g === 15) return 'uart';
  return 'gpio';
}

export const PI_HEADER = [];
for (let i = 1; i <= 40; i++) {
  if (PI_POWER[i]) PI_HEADER.push({ phys: i, name: PI_POWER[i][0], type: PI_POWER[i][1] });
  else if (PI_GND.includes(i)) PI_HEADER.push({ phys: i, name: 'GND', type: 'gnd' });
  else { const g = PI_GPIO_AT[i]; PI_HEADER.push({ phys: i, name: 'GPIO' + g, gpio: g, type: piType(g), alt: PI_ALT[g] || '' }); }
}

// ------------------------------------------------------------------ Pico header
const PICO_NAMES = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND', 'GP6', 'GP7', 'GP8', 'GP9', 'GND', 'GP10', 'GP11', 'GP12', 'GP13', 'GND', 'GP14', 'GP15',
  'GP16', 'GP17', 'GND', 'GP18', 'GP19', 'GP20', 'GP21', 'GND', 'GP22', 'RUN', 'GP26', 'GP27', 'AGND', 'GP28', 'ADC_VREF', '3V3(OUT)', '3V3_EN', 'GND', 'VSYS', 'VBUS'];

function picoAlt(g) {
  const i2c = [0, 1, 4, 5, 8, 9, 12, 13, 16, 17, 20, 21].includes(g) ? 'I²C0' : 'I²C1';
  const sdaScl = g % 2 === 0 ? 'SDA' : 'SCL';
  const spi = (g >= 8 && g <= 15) ? 'SPI1' : 'SPI0';
  const spiF = ['RX', 'CSn', 'SCK', 'TX'][g % 4];
  const uartMap = { 0: 'UART0 TX', 1: 'UART0 RX', 4: 'UART1 TX', 5: 'UART1 RX', 8: 'UART1 TX', 9: 'UART1 RX', 12: 'UART0 TX', 13: 'UART0 RX', 16: 'UART0 TX', 17: 'UART0 RX' };
  const parts = [];
  if (g >= 26) parts.push('ADC' + (g - 26));
  if (g <= 22 || g >= 26) parts.push(`${i2c} ${sdaScl}`);
  if (g <= 19) parts.push(`${spi} ${spiF}`);
  if (uartMap[g]) parts.push(uartMap[g]);
  parts.push(`PWM${(g >> 1) & 7} ${g % 2 ? 'B' : 'A'}`);
  return parts.join(' · ');
}

export const PICO_HEADER = PICO_NAMES.map((name, i) => {
  const phys = i + 1;
  if (name.startsWith('GP')) { const g = Number(name.slice(2)); return { phys, name, gpio: g, type: g >= 26 ? 'adc' : 'gpio', alt: picoAlt(g) }; }
  if (name === 'GND' || name === 'AGND') return { phys, name, type: 'gnd' };
  if (name === '3V3(OUT)') return { phys, name, type: 'power3' };
  if (name === 'VSYS' || name === 'VBUS') return { phys, name, type: 'power5' };
  return { phys, name, type: 'sys' };
});

export const headerOf = (board) => (BOARDS[board].kind === 'pico' ? PICO_HEADER : PI_HEADER);
export const pinLabel = (board, g) => (g === PICO_W_LED ? 'LED (WL_GPIO0)' : BOARDS[board].kind === 'pico' ? 'GP' + g : 'GPIO' + g);
export function physOf(board, g) { const p = headerOf(board).find((x) => x.gpio === g); return p ? p.phys : null; }

/** GPIOs a part may be wired to (ADC parts on the Pico only to GP26–28). */
export function wirablePins(board, adcOnly = false) {
  return headerOf(board).filter((p) => p.gpio != null && (!adcOnly || p.type === 'adc')).map((p) => p.gpio).sort((a, b) => a - b);
}

// ------------------------------------------------------------------ artwork
export function piPinXY(phys) {
  const col = (phys - 1) >> 1;
  return { x: 83.7 + col * 25.4, y: phys % 2 ? 47.7 : 22.3 };
}

export function picoPinXY(phys) {
  return phys <= 20 ? { x: 13.7 + (phys - 1) * 25.4, y: 193.9 } : { x: 13.7 + (40 - phys) * 25.4, y: 16.1 };
}

const RPI_LOGO = (x, y, s, fill = '#fff', op = 0.9) => `<g transform="translate(${x} ${y}) scale(${s})" opacity="${op}" fill="${fill}">
  <path d="M-6-12c-3-2-7-1-7 2 1 3 4 4 7 4zM6-12c3-2 7-1 7 2-1 3-4 4-7 4z"/>
  <circle cx="0" cy="-2" r="4.2"/><circle cx="-6.5" cy="2" r="4"/><circle cx="6.5" cy="2" r="4"/>
  <circle cx="-3.6" cy="8" r="4"/><circle cx="3.6" cy="8" r="4"/><circle cx="0" cy="13" r="3.4"/><circle cx="-8.5" cy="9" r="2.6"/><circle cx="8.5" cy="9" r="2.6"/></g>`;

function usbStack(x, y, blue) {
  const tongue = blue ? '#1d6fe0' : '#111';
  return `<g class="port">
    <rect x="${x}" y="${y}" width="175" height="132" rx="4" fill="url(#metal)" stroke="#6b7280" stroke-width="2"/>
    <rect x="${x + 22}" y="${y + 12}" width="148" height="48" rx="3" fill="#0b0f17"/><rect x="${x + 40}" y="${y + 30}" width="125" height="14" fill="${tongue}"/>
    <rect x="${x + 22}" y="${y + 72}" width="148" height="48" rx="3" fill="#0b0f17"/><rect x="${x + 40}" y="${y + 90}" width="125" height="14" fill="${tongue}"/>
    <path d="M${x + 6} ${y + 8}v116" stroke="#9aa3ad" stroke-width="3"/></g>`;
}

function ethernet(x, y) {
  return `<g class="port"><rect x="${x}" y="${y}" width="210" height="160" rx="4" fill="url(#metal)" stroke="#6b7280" stroke-width="2"/>
    <rect x="${x + 70}" y="${y + 22}" width="132" height="116" rx="4" fill="#111"/>
    <path d="M${x + 110} ${y + 40}h50v18h14v44h-14v18h-50z" fill="#1f2937"/>
    <rect x="${x + 190}" y="${y + 18}" width="14" height="10" fill="#22c55e" class="eth-led"/><rect x="${x + 190}" y="${y + 132}" width="14" height="10" fill="#f59e0b" class="eth-led2"/></g>`;
}

function hdmi(x, y, label) {
  return `<g class="port"><rect x="${x}" y="${y}" width="70" height="58" rx="5" fill="url(#metal)" stroke="#6b7280" stroke-width="2"/>
    <rect x="${x + 12}" y="${y + 36}" width="46" height="14" rx="3" fill="#0b0f17"/></g>
    <text x="${x + 35}" y="${y - 10}" class="silk" text-anchor="middle">${label}</text>`;
}

function usbc(x, y) {
  return `<g class="port"><rect x="${x}" y="${y}" width="90" height="66" rx="8" fill="url(#metal)" stroke="#6b7280" stroke-width="2"/>
    <rect x="${x + 14}" y="${y + 40}" width="62" height="16" rx="8" fill="#0b0f17"/></g>
    <text x="${x + 45}" y="${y - 10}" class="silk" text-anchor="middle">POWER IN</text>`;
}

function chip(x, y, w, h, fill, lines = [], txt = '#9ca3af', fs = 13) {
  const t = lines.map((l, i) => `<text x="${x + w / 2}" y="${y + h / 2 + (i - (lines.length - 1) / 2) * (fs + 3) + fs / 3}" fill="${txt}" font-size="${fs}" text-anchor="middle" font-family="monospace">${l}</text>`).join('');
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${fill}"/>${t}`;
}

function fpc(x, y, w, h, label, vertical) {
  const latch = vertical ? `<rect x="${x + w - 10}" y="${y}" width="10" height="${h}" fill="#1f2937"/>` : `<rect x="${x}" y="${y + h - 10}" width="${w}" height="10" fill="#1f2937"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#e9dcc0"/>${latch}<text x="${vertical ? x - 8 : x + w / 2}" y="${vertical ? y + h / 2 : y - 8}" class="silk" text-anchor="middle" ${vertical ? `transform="rotate(-90 ${x - 8} ${y + h / 2})"` : ''}>${label}</text>`;
}

const DEFS = `<defs>
  <linearGradient id="pcb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f8a45"/><stop offset="1" stop-color="#14703a"/></linearGradient>
  <linearGradient id="pcbPico" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c8a46"/><stop offset="1" stop-color="#11713a"/></linearGradient>
  <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef1f4"/><stop offset=".5" stop-color="#b9c0c8"/><stop offset="1" stop-color="#d9dee3"/></linearGradient>
  <linearGradient id="lid" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5e7eb"/><stop offset=".55" stop-color="#aeb4bc"/><stop offset="1" stop-color="#cfd4da"/></linearGradient>
  <radialGradient id="gold" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ffe9a3"/><stop offset=".6" stop-color="#d9ad3c"/><stop offset="1" stop-color="#9c7419"/></radialGradient>
  <filter id="glow" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="6"/></filter>
</defs>`;

function hole(x, y) {
  return `<circle cx="${x}" cy="${y}" r="30" fill="url(#gold)" opacity=".9"/><circle cx="${x}" cy="${y}" r="14" fill="#0b1020"/>`;
}

function piHeaderArt() {
  let s = '<rect x="71" y="9.6" width="508" height="50.8" rx="3" fill="#111" stroke="#000"/>';
  for (const p of PI_HEADER) {
    const { x, y } = piPinXY(p.phys);
    s += `<g class="hp t-${p.type}" data-phys="${p.phys}"${p.gpio != null ? ` data-gpio="${p.gpio}"` : ''}>
      <rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="${p.phys === 1 ? 0 : 7}" fill="url(#gold)"/>
      <circle class="pst" cx="${x}" cy="${y}" r="9.5"/><circle class="hit" cx="${x}" cy="${y}" r="12.7" fill="transparent"/></g>`;
  }
  return s + '<text x="66" y="56" class="silk" text-anchor="end">1</text><text x="586" y="27" class="silk">40</text>';
}

function piArt(board) {
  const pi5 = board === 'pi5';
  let s = `<svg class="board-svg pi-board" viewBox="-30 -20 930 610" xmlns="http://www.w3.org/2000/svg">${DEFS}
  <rect x="-14" y="${pi5 ? 228 : 228}" width="26" height="108" rx="4" fill="#4b5563"/>
  <rect x="0" y="0" width="850" height="560" rx="30" fill="url(#pcb)" stroke="#0c5a2c" stroke-width="3"/>
  <path d="M40 520 L330 520 M600 40 L640 40" stroke="#2a9a54" stroke-width="2" opacity=".5"/>
  ${hole(35, 35)}${hole(615, 35)}${hole(35, 525)}${hole(615, 525)}`;
  // traces
  s += '<g stroke="#2aa25a" stroke-width="2.2" fill="none" opacity=".45"><path d="M300 330 C300 380 250 420 210 470"/><path d="M330 330 C340 400 380 440 395 470"/><path d="M370 250 H560 V320"/><path d="M250 175 V120 H180"/><path d="M380 176 V100 H560"/><path d="M240 330 V400 H160"/></g>';
  s += piHeaderArt();
  if (pi5) {
    s += usbStack(695, 24, false) + usbStack(695, 204, true) + ethernet(660, 377);
    s += usbc(77, 497) + hdmi(222, 505, 'HDMI0') + hdmi(356, 505, 'HDMI1');
    s += fpc(452, 470, 78, 26, 'CAM/DISP 0') + fpc(548, 470, 78, 26, 'CAM/DISP 1');
    s += fpc(14, 140, 30, 170, 'PCIe', true);
    s += '<rect x="300" y="458" width="34" height="18" rx="2" fill="#f3f4f6"/><text x="317" y="450" class="silk" text-anchor="middle">UART</text>';
    s += '<rect x="590" y="70" width="52" height="22" rx="2" fill="#f3f4f6"/><text x="616" y="108" class="silk" text-anchor="middle">FAN</text>';
    s += '<g fill="url(#gold)"><circle cx="602" cy="22" r="6"/><circle cx="627" cy="22" r="6"/><circle cx="602" cy="47" r="6"/><circle cx="627" cy="47" r="6"/></g>';
    s += '<rect x="130" y="440" width="30" height="16" rx="2" fill="#f3f4f6"/><text x="145" y="432" class="silk" text-anchor="middle">BAT</text>';
    s += `<g class="pwr-btn"><rect x="-12" y="440" width="42" height="44" rx="6" fill="#2b2f36"/><circle cx="8" cy="462" r="13" fill="#4b5563" stroke="#111" stroke-width="2"/></g>`;
    s += '<rect class="led-pwr" x="40" y="400" width="20" height="12" rx="3"/><text x="70" y="410" class="silk">PWR/ACT</text>';
    s += '<rect x="235" y="165" width="150" height="150" rx="10" fill="url(#lid)" stroke="#8b929b" stroke-width="2"/>';
    s += '<text x="310" y="232" fill="#4b5563" font-size="14" font-weight="700" text-anchor="middle" font-family="sans-serif">BROADCOM</text><text x="310" y="254" fill="#4b5563" font-size="12" text-anchor="middle" font-family="monospace">BCM2712</text>';
    s += chip(410, 185, 112, 112, '#16181d', ['MICRON', 'LPDDR4X', '8GB']);
    s += chip(552, 290, 88, 88, '#16181d', ['RP1'], '#d1d5db', 16) + RPI_LOGO(596, 352, 0.9, '#d1d5db', 0.5);
    s += `<rect x="50" y="85" width="140" height="92" rx="5" fill="url(#lid)" stroke="#8b929b"/>${RPI_LOGO(120, 128, 1.4, '#9aa3ad', 0.8)}`;
    s += chip(95, 330, 60, 60, '#16181d', ['PMIC']);
    s += `<text x="250" y="400" class="silk-big">Raspberry Pi 5</text><text x="250" y="425" class="silk">© Raspberry Pi Ltd 2023</text>`;
    s += RPI_LOGO(470, 405, 1.6, '#eaf3ec', 0.85);
  } else {
    s += ethernet(660, 25) + usbStack(695, 223, false) + usbStack(695, 403, true);
    s += usbc(77, 497) + hdmi(225, 505, 'HDMI0') + hdmi(360, 505, 'HDMI1');
    s += `<g class="port"><rect x="492" y="478" width="72" height="96" rx="6" fill="#16181d"/><circle cx="528" cy="560" r="16" fill="#000" stroke="#333" stroke-width="3"/></g><text x="528" y="468" class="silk" text-anchor="middle">A/V</text>`;
    s += fpc(450, 300, 28, 170, 'CAMERA', true) + fpc(18, 150, 28, 170, 'DISPLAY', true);
    s += '<g fill="url(#gold)"><circle cx="602" cy="72" r="6"/><circle cx="627" cy="72" r="6"/><circle cx="602" cy="97" r="6"/><circle cx="627" cy="97" r="6"/></g><text x="614" y="124" class="silk" text-anchor="middle">PoE</text>';
    s += '<rect class="led-pwr" x="18" y="440" width="20" height="12" rx="3"/><rect class="led-act" x="18" y="462" width="20" height="12" rx="3"/><text x="46" y="450" class="silk">PWR</text><text x="46" y="472" class="silk">ACT</text>';
    s += '<rect x="220" y="170" width="150" height="150" rx="10" fill="url(#lid)" stroke="#8b929b" stroke-width="2"/>';
    s += '<text x="295" y="236" fill="#4b5563" font-size="14" font-weight="700" text-anchor="middle" font-family="sans-serif">BROADCOM</text><text x="295" y="258" fill="#4b5563" font-size="12" text-anchor="middle" font-family="monospace">BCM2711</text>';
    s += chip(398, 192, 112, 108, '#16181d', ['MICRON', 'LPDDR4', '4GB']);
    s += chip(560, 300, 60, 60, '#16181d', ['VL805']);
    s += `<rect x="60" y="88" width="132" height="92" rx="5" fill="url(#lid)" stroke="#8b929b"/>${RPI_LOGO(126, 130, 1.4, '#9aa3ad', 0.8)}`;
    s += chip(110, 360, 56, 56, '#16181d', ['PMIC']);
    s += `<text x="230" y="400" class="silk-big">Raspberry Pi 4 Model B</text><text x="230" y="425" class="silk">© Raspberry Pi 2018</text>`;
  }
  s += '<g class="act-glow"></g></svg>';
  return s;
}

function picoArt(board) {
  const w = board === 'picow' || board === 'pico2w';
  const two = board === 'pico2' || board === 'pico2w';
  const name = BOARDS[board].name;
  let s = `<svg class="board-svg pico-board" viewBox="-50 -75 610 360" xmlns="http://www.w3.org/2000/svg">${DEFS}
    <rect x="0" y="0" width="510" height="210" rx="10" fill="url(#pcbPico)" stroke="#0c5a2c" stroke-width="2.5"/>`;
  s += '<g stroke="#2aa25a" stroke-width="1.6" fill="none" opacity=".5"><path d="M60 105 H150"/><path d="M200 105 H232"/><path d="M302 90 H360"/><path d="M267 70 V40 H180"/><path d="M267 140 V170 H200"/></g>';
  // micro USB
  s += '<g class="port"><rect x="-14" y="72" width="64" height="66" rx="5" fill="url(#metal)" stroke="#6b7280" stroke-width="2"/><rect x="-8" y="92" width="16" height="26" rx="3" fill="#0b0f17"/></g>';
  s += '<rect class="led-user" x="66" y="40" width="20" height="12" rx="3"/><text x="76" y="32" class="silk" text-anchor="middle">LED</text>';
  s += `<g class="bootsel"><rect x="72" y="128" width="46" height="46" rx="5" fill="#f3f4f6" stroke="#9ca3af"/><circle cx="95" cy="151" r="13" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/></g><text x="95" y="121" class="silk" text-anchor="middle">BOOTSEL</text>`;
  s += chip(140, 78, 46, 54, '#16181d', ['W25Q'], '#6b7280', 10);
  s += chip(118, 30, 30, 26, '#16181d', [], '#6b7280', 9);
  s += `<rect x="232" y="70" width="70" height="70" rx="4" fill="#16181d"/>${RPI_LOGO(255, 98, 0.75, '#cbd5e1', 0.65)}<text x="281" y="103" fill="#cbd5e1" font-size="9" text-anchor="middle" font-family="monospace">${two ? 'RP2350' : 'RP2-B2'}</text><text x="281" y="120" fill="#94a3b8" font-size="7" text-anchor="middle" font-family="monospace">${two ? 'A2' : '20/21 P64M15.00'}</text>`;
  s += '<rect x="318" y="128" width="40" height="22" rx="8" fill="url(#metal)" stroke="#9aa3ad"/><text x="338" y="143" fill="#4b5563" font-size="7" text-anchor="middle">12.000</text>';
  if (w) {
    s += '<rect x="372" y="48" width="92" height="96" rx="4" fill="url(#lid)" stroke="#8b929b"/><text x="418" y="92" fill="#4b5563" font-size="9" text-anchor="middle" font-family="monospace">CYW43439</text><text x="418" y="106" fill="#6b7280" font-size="7" text-anchor="middle" font-family="monospace">Wi-Fi · BT</text>';
    s += '<path d="M474 60 v12 h20 v12 h-20 v12 h20 v12 h-20 v12 h20 v12 h-20 v12" stroke="#d9ad3c" stroke-width="3" fill="none" opacity=".8"/>';
  } else {
    s += '<g fill="url(#gold)"><circle cx="488" cy="80" r="6"/><circle cx="488" cy="105" r="6"/><circle cx="488" cy="130" r="6"/></g><text x="470" y="84" class="silk-s" text-anchor="end">SWCLK</text><text x="470" y="109" class="silk-s" text-anchor="end">GND</text><text x="470" y="134" class="silk-s" text-anchor="end">SWDIO</text>';
  }
  s += `<text x="${w ? 205 : 330}" y="${w ? 60 : 60}" class="silk-big pico-silk" text-anchor="middle">${name}</text><text x="${w ? 205 : 330}" y="${w ? 176 : 176}" class="silk-s" text-anchor="middle">© ${two ? '2024' : w ? '2022' : '2020'}</text>`;
  // castellated pins + labels
  for (const p of PICO_HEADER) {
    const { x, y } = picoPinXY(p.phys);
    const top = p.phys > 20;
    const edgeY = top ? 0 : 210;
    s += `<g class="hp t-${p.type}" data-phys="${p.phys}"${p.gpio != null ? ` data-gpio="${p.gpio}"` : ''}>
      <path d="M${x - 8} ${edgeY} A8 8 0 0 ${top ? 0 : 1} ${x + 8} ${edgeY}" fill="url(#gold)"/>
      <circle cx="${x}" cy="${y}" r="9" fill="url(#gold)"/><circle cx="${x}" cy="${y}" r="4.5" fill="#0b1020"/>
      <circle class="pst" cx="${x}" cy="${y}" r="9.5"/><circle class="hit" cx="${x}" cy="${y}" r="12.7" fill="transparent"/>
      <text class="plabel t-${p.type}" x="${x}" y="${top ? -10 : 220}" transform="rotate(-90 ${x} ${top ? -10 : 220})" text-anchor="${top ? 'start' : 'end'}" dy="4">${p.name}</text></g>`;
  }
  s += '</svg>';
  return s;
}

export function boardSVG(board) {
  return BOARDS[board].kind === 'pico' ? picoArt(board) : piArt(board);
}
