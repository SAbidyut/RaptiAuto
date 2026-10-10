// Raspberry Pi 5 / 4 and Pico / Pico W / Pico 2 / Pico 2 W as parts of the circuit canvas (the same
// canvas, parts library and circuit solver as the Arduino editor). The artwork is the Pinout tab's
// board drawing (0.1 mm units) scaled to the canvas grid (10 units = 0.1" = 2.54 mm), so every
// header pin sits on the 0.1" grid. They are hidden from the Arduino parts library.
import { register } from '../components/registry.js';
import { BOARDS, PI_HEADER, PICO_HEADER, piPinXY, picoPinXY, boardSVG } from './boards.js';

const K = 10 / 25.4; // 0.1 mm → canvas units

/** Canvas part type of a Pi Lab board. */
export const CIRCUIT_TYPE = { pi5: 'rpi5', pi4: 'rpi4', pico: 'pi-pico', picow: 'pi-picow', pico2: 'pi-pico2', pico2w: 'pi-pico2w' };

/** Shift that puts header pin 1 on the canvas grid (every other pin then lands on it too). */
function gridShift(x1, y1) { return [Math.round(x1 / 10) * 10 - x1, Math.round(y1 / 10) * 10 - y1]; }

const short = (p) => (p.gpio != null ? String(p.gpio) : p.name.replace('3V3(OUT)', '3V3').replace('ADC_VREF', 'VREF'));

/** Pin id of a header pin: GPIO17 / GP15, 3V3.1, 5V.2, GND.3 … */
function pinIds(header, pico) {
  const count = {};
  const ids = new Map();
  for (const p of header) {
    let id;
    if (p.gpio != null) id = (pico ? 'GP' : 'GPIO') + p.gpio;
    else {
      const base = p.name.replace('3V3(OUT)', '3V3');
      count[base] = (count[base] || 0) + 1;
      id = base;
      if (['GND', '3V3', '5V'].includes(base) && !(pico && base === '3V3')) id = `${base}.${count[base]}`;
    }
    ids.set(p.phys, id);
  }
  return ids;
}

/** Live pin colours and LEDs on the board drawing (same states as the Pinout tab). */
function boardUpdate(el, v) {
  const st = v.pinSt;
  if (st) {
    if (!el._hp) { el._hp = new Map(); el.querySelectorAll('.hp[data-gpio]').forEach((e) => el._hp.set(Number(e.dataset.gpio), e)); }
    for (const [g, e] of el._hp) { const s = st.get(g) || ''; if (e.dataset.st !== s) e.dataset.st = s; }
  }
  const act = el._act || (el._act = el.querySelector('.led-act'));
  if (act) act.classList.toggle('on', !!v.act);
  const user = el._user || (el._user = el.querySelector('.led-user'));
  if (user) { user.style.setProperty('--on', String(v.L || 0)); user.classList.toggle('on', (v.L || 0) > 0.02); }
}

function registerPi(board) {
  const info = BOARDS[board];
  const ids = pinIds(PI_HEADER, false);
  const p1 = piPinXY(1);
  const [ox, oy] = gridShift(p1.x * K, p1.y * K);
  const pins = PI_HEADER.map((p) => {
    const { x, y } = piPinXY(p.phys);
    return { id: ids.get(p.phys), x: Math.round((x * K + ox) * 10) / 10, y: Math.round((y * K + oy) * 10) / 10, label: p.gpio != null ? `GPIO${p.gpio} (pin ${p.phys})` : `${p.name} (pin ${p.phys})` };
  });
  const pinMap = {};
  for (const p of PI_HEADER) if (p.gpio != null) pinMap[p.gpio] = ids.get(p.phys);
  const gnd = [...ids.values()].filter((id) => id.startsWith('GND'));
  const art = boardSVG(board, `cp-${board}-`).replace('<svg ', `<svg x="${-30 * K + ox}" y="${-20 * K + oy}" width="${930 * K}" height="${610 * K}" `);
  register({
    type: CIRCUIT_TYPE[board], name: info.name, category: 'boards', hidden: true, piBoard: board,
    tags: ['raspberry pi', 'gpio'], description: `${info.cpu} · 40-pin header · 3.3 V GPIO`,
    box: [-12 + ox, -8 + oy, 352 + ox, 232 + oy], pins,
    internal: [gnd, ['3V3.1', '3V3.2'], ['5V.1', '5V.2']],
    board: {
      name: info.name, arch: 'arm', family: 'bcm', mhz: board === 'pi5' ? 2400 : 1800, vcc: 3.3, adcBits: 0, python: true,
      pinMap, analogPins: [], pwmPins: null, interruptPins: null,
      i2c: { sda: 2, scl: 3 }, spi: { mosi: 10, miso: 9, sck: 11, ss: 8 }, gndPins: [gnd[0]],
      supplies: [{ pin: '3V3.1', v: 3.3, r: 0.05, maxI: 0.8 }, { pin: '5V.1', v: 5.1, r: 0.02, maxI: 3 }],
      serialPorts: [], rout: 40, rpull: 50000, pinMaxI: 0.016, uart: { serial0: { rx: 15, tx: 14 } },
    },
    render() {
      let s = art;
      // pin names next to the header: BCM numbers, 3V3, 5V, GND
      for (const p of PI_HEADER) {
        const { x, y } = piPinXY(p.phys);
        const outer = p.phys % 2 === 0;
        const px = x * K + ox, py = y * K + oy + (outer ? -6.6 : 6.6);
        const col = p.type === 'gnd' ? '#cbd5e1' : p.type.startsWith('power') ? '#fecaca' : '#fef3c7';
        s += `<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" font-size="3.6" font-weight="800" fill="${col}" font-family="JetBrains Mono, monospace" text-anchor="${outer ? 'start' : 'end'}" transform="rotate(-90 ${px.toFixed(1)} ${py.toFixed(1)})" dy="1.3" paint-order="stroke" stroke="#0b3d1f" stroke-width="1">${short(p)}</text>`;
      }
      return s;
    },
    update: boardUpdate,
  });
}

function registerPico(board) {
  const info = BOARDS[board];
  const ids = pinIds(PICO_HEADER, true);
  const p1 = picoPinXY(1);
  const [ox, oy] = gridShift(p1.x * K, p1.y * K);
  const pins = PICO_HEADER.map((p) => {
    const { x, y } = picoPinXY(p.phys);
    return { id: ids.get(p.phys), x: Math.round(x * K + ox), y: Math.round(y * K + oy), label: `${p.name} (pin ${p.phys})` };
  });
  const pinMap = {};
  for (const p of PICO_HEADER) if (p.gpio != null) pinMap[p.gpio] = ids.get(p.phys);
  const gnd = [...ids.values()].filter((id) => id.startsWith('GND'));
  const art = boardSVG(board, `cp-${board}-`).replace('<svg ', `<svg x="${-50 * K + ox}" y="${-75 * K + oy}" width="${610 * K}" height="${360 * K}" `);
  register({
    type: CIRCUIT_TYPE[board], name: info.name, category: 'boards', hidden: true, piBoard: board,
    tags: ['raspberry pi', 'pico', 'micropython'], description: `${info.mcu} · ${info.cpu} · 3.3 V GPIO`,
    box: [-22 + ox, -32 + oy, 222 + ox, 114 + oy], pins,
    internal: [[...gnd, 'AGND'], ['3V3', 'ADC_VREF']],
    board: {
      name: info.name, arch: 'arm', family: 'rp2040', mhz: 133, vcc: 3.3, adcBits: 12, python: true,
      ledBuiltin: info.wifi ? null : 25, pinMap, analogPins: [26, 27, 28], gpioAnalog: true, pwmPins: null, interruptPins: null,
      i2c: { sda: 4, scl: 5 }, spi: { mosi: 19, miso: 16, sck: 18, ss: 17 }, gndPins: [gnd[0]],
      supplies: [{ pin: '3V3', v: 3.3, r: 0.1, maxI: 0.3 }, { pin: 'VBUS', v: 5, r: 0.1 }, { pin: 'VSYS', v: 4.7, r: 0.2 }],
      serialPorts: [], rout: 40, rpull: 50000, pinMaxI: 0.012, uart: { UART0: { rx: 1, tx: 0 }, UART1: { rx: 5, tx: 4 } },
    },
    render: () => art,
    update: boardUpdate,
  });
}

registerPi('pi5');
registerPi('pi4');
for (const b of ['pico', 'picow', 'pico2', 'pico2w']) registerPico(b);
