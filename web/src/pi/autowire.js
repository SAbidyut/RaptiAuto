// Builds a wired circuit (parts + wires for the canvas) from the short part lists of the Pi Lab
// examples — { type: 'led', pins: { a: 17 }, props: { color } } … — the way a student would wire
// it: a resistor in front of every LED, active-low buttons to GND, 5 V modules on 5V, an MCP3008
// for analog parts on a Raspberry Pi, and a voltage divider on the HC-SR04's 5 V ECHO.
import { newId, pinsOf, toWorld } from '../components/registry.js';
import { BOARDS } from './boards.js';
import { CIRCUIT_TYPE } from './circuit-parts.js';

const RED = '#ef4444', BLACK = '#111827', SIG = ['#22c55e', '#3b82f6', '#f97316', '#eab308', '#a855f7', '#06b6d4', '#ec4899'];

/** Default parts of a new circuit (the same as the Pi Lab's first wiring). */
export function defaultSpecs(board) {
  return BOARDS[board].kind === 'pico'
    ? [{ type: 'led', pins: { a: 15 }, props: { color: 'red' } }, { type: 'button', pins: { a: 14 } }, { type: 'pot', pins: { a: 26 } }]
    : [{ type: 'led', pins: { a: 17 }, props: { color: 'red' } }, { type: 'led', pins: { a: 27 }, props: { color: 'green' } }, { type: 'button', pins: { a: 2 } }, { type: 'buzzer', pins: { a: 22 } }];
}

export function defaultCircuit(board) { return autowire(board, defaultSpecs(board)); }

/** An empty circuit: only the board. */
export function boardOnly(board) {
  return { parts: [{ id: newId('p'), type: CIRCUIT_TYPE[board], x: 0, y: 0, rot: 0, props: {} }], wires: [] };
}

export function autowire(board, specs = []) {
  const pico = BOARDS[board].kind === 'pico';
  const bid = newId('p');
  const parts = [{ id: bid, type: CIRCUIT_TYPE[board], x: 0, y: 0, rot: 0, props: {} }];
  const wires = [];
  const gp = (g) => (pico ? 'GP' : 'GPIO') + g;
  // every part group is a "slot" laid out later over (or under) the header pin it uses most, so
  // the wires run more or less straight and seldom cross
  const pinX = new Map(pinsOf({ type: CIRCUIT_TYPE[board], props: {} }).map((p) => [p.id, p]));
  const slots = [];
  let cur = null;
  const place = (where, w, hgt = 120, pin = null) => {
    cur = { where, w, h: hgt, pin, parts: [] };
    slots.push(cur);
    return { x: 0, y: 0 };
  };
  const V5 = pico ? 'VBUS' : '5V.1';
  // ground and 3V3 from the header pin nearest to the part, so power wires stay short
  // (on the Pico a pin on the other edge of the board is never "near": its wire would cross the board)
  const midY = pico ? 40 : 100;
  const near = (ids) => {
    const ax = cur && pinX.get(cur.pin) ? pinX.get(cur.pin).x : 0;
    const up = !cur || cur.where === 'up';
    const cost = (id) => Math.abs(pinX.get(id).x - ax) + ((pinX.get(id).y < midY) === up ? 0 : 1000);
    return ids.slice().sort((a, b) => cost(a) - cost(b))[0];
  };
  const gnds = () => [...pinX.keys()].filter((id) => id.startsWith('GND'));
  const GND = () => near(gnds());
  const v3 = () => (pico ? '3V3' : near(['3V3.1', '3V3.2']));
  let si = 0;
  const sig = () => SIG[si++ % SIG.length];
  const side = (g) => (pico && g != null && g < 16 ? 'down' : 'up');
  const add = (type, x, y, props = {}, rot = 0) => { const id = newId('p'); const part = { id, type, x, y, rot, props }; parts.push(part); if (cur) cur.parts.push(part); return id; };
  const wire = (a, ap, b, bp, color) => wires.push({ id: newId('w'), from: { part: a, pin: ap }, to: { part: b, pin: bp }, points: [], color: color || sig() });
  const toBoard = (id, pin, bpin, color) => wire(id, pin, bid, bpin, color);
  let adc = null;
  const mcp = () => {
    if (adc) return adc;
    const keep = cur;
    const at = place('up', 80, 70, gp(10));
    adc = add('mcp3008', at.x, at.y + 30);
    cur = keep;
    toBoard(adc, 'VDD', v3(), RED); toBoard(adc, 'VREF', v3(), RED); toBoard(adc, 'AGND', GND(), BLACK); toBoard(adc, 'DGND', GND(), BLACK);
    toBoard(adc, 'CLK', gp(11)); toBoard(adc, 'DOUT', gp(9)); toBoard(adc, 'DIN', gp(10)); toBoard(adc, 'CS', gp(8));
    return adc;
  };
  const analogIn = (id, pin, spec) => {
    if (pico) toBoard(id, pin, gp(spec.pins.a != null ? spec.pins.a : 26));
    else wire(id, pin, mcp(), 'CH' + Number((spec.props || {}).ch ?? 0));
  };

  for (const s of specs) {
    const P = s.pins || {}, props = s.props || {};
    const g0 = P.a ?? P.sig ?? P.out ?? P.data ?? P.din ?? P.trig ?? P.fwd ?? P.r ?? null;
    const anchor = g0 != null ? gp(g0) : s.type === 'lcd' ? gp(pico ? 4 : 2) : pico ? gp(26) : gp(10);
    const place0 = place;
    const placeAt = (where, w, hgt) => place0(where, w, hgt, anchor);
    switch (s.type) {
      case 'led': {
        const at = placeAt(side(g0), 70);
        const r = add('resistor', at.x, at.y, { value: 330 });
        const d = add('led', at.x + 50, at.y, { color: props.color || 'red' });
        toBoard(r, '1', gp(P.a)); wire(r, '2', d, 'A', '#f59e0b'); toBoard(d, 'C', GND(), BLACK);
        break;
      }
      case 'rgb': {
        const at = placeAt(side(g0), 150, 140);
        const d = add('rgb-led', at.x + 50, at.y - 70, { common: 'cathode' });
        [['r', 'R'], ['g', 'G'], ['b', 'B']].forEach(([k, pin], i) => {
          const r = add('resistor', at.x + i * 0, at.y - i * 20 + 0, { value: 220 }, 0);
          toBoard(r, '1', gp(P[k])); wire(r, '2', d, pin, ['#ef4444', '#22c55e', '#3b82f6'][i]);
        });
        toBoard(d, 'COM', GND(), BLACK);
        break;
      }
      case 'button': {
        const at = placeAt(side(g0), 30, 60);
        const b = add('pushbutton', at.x, at.y - 30);
        toBoard(b, '1.l', gp(P.a));
        toBoard(b, '2.l', props.to === '3v3' ? v3() : GND(), props.to === '3v3' ? RED : BLACK);
        break;
      }
      case 'switch': {
        const at = placeAt(side(g0), 30, 40);
        const sw = add('slide-switch', at.x, at.y);
        toBoard(sw, '2', gp(P.a)); toBoard(sw, '1', props.to === '3v3' ? v3() : GND(), props.to === '3v3' ? RED : BLACK);
        break;
      }
      case 'buzzer': {
        const at = placeAt(side(g0), 40, 50);
        const z = add('buzzer', at.x + 10, at.y, { kind: props.kind || (pico ? 'passive' : 'active') });
        toBoard(z, '+', gp(P.a)); toBoard(z, '-', GND(), BLACK);
        break;
      }
      case 'relay': {
        const at = placeAt(side(g0), 160, 160);
        const k = add('relay', at.x + 10, at.y);
        const ps = add('power-supply', at.x + 70, at.y - 110, { voltage: 12 });
        const lamp = add('lamp', at.x + 110, at.y - 110, { rating: '12' });
        toBoard(k, 'VCC', V5, RED); toBoard(k, 'GND', GND(), BLACK); toBoard(k, 'IN', gp(P.a));
        wire(ps, '+', k, 'COM', RED); wire(k, 'NO', lamp, '1', '#f97316'); wire(lamp, '2', ps, '-', BLACK);
        break;
      }
      case 'servo': {
        const at = placeAt(side(g0), 80, 110);
        const sv = add('servo', at.x + 14, at.y);
        toBoard(sv, 'GND', GND(), BLACK); toBoard(sv, 'V+', V5, RED); toBoard(sv, 'PWM', gp(P.sig), '#f97316');
        break;
      }
      case 'motor': {
        const at = placeAt(side(g0), 200, 200);
        const drv = add('l298n', at.x + 12, at.y);
        const m = add('dc-motor', at.x + 30, at.y - 150);
        const ps = add('power-supply', at.x + 140, at.y - 150, { voltage: 9 });
        toBoard(drv, 'IN1', gp(P.fwd)); toBoard(drv, 'IN2', gp(P.back)); toBoard(drv, 'ENA', V5, RED);
        wire(drv, 'OUT1', m, '1', '#f97316'); wire(drv, 'OUT2', m, '2', '#3b82f6');
        wire(ps, '+', drv, '12V', RED); wire(ps, '-', drv, 'GND', BLACK); toBoard(drv, 'GND', GND(), BLACK);
        break;
      }
      case 'pir': {
        const at = placeAt(side(g0), 80, 90);
        const pr = add('pir', at.x + 24, at.y);
        toBoard(pr, 'VCC', V5, RED); toBoard(pr, 'GND', GND(), BLACK); toBoard(pr, 'OUT', gp(P.out));
        break;
      }
      case 'ultrasonic': {
        const at = placeAt(side(g0), 160, 120);
        const us = add('hc-sr04', at.x + 40, at.y);
        toBoard(us, 'VCC', V5, RED); toBoard(us, 'GND', GND(), BLACK); toBoard(us, 'TRIG', gp(P.trig));
        // 5 V ECHO → 1 kΩ / 2 kΩ divider → 3.3 V GPIO
        const r1 = add('resistor', at.x + 90, at.y + 40, { value: 1000 });
        const r2 = add('resistor', at.x + 90, at.y + 70, { value: 2000 });
        wire(us, 'ECHO', r1, '1', '#a855f7'); toBoard(r1, '2', gp(P.echo), '#a855f7'); toBoard(r2, '1', gp(P.echo), '#a855f7'); toBoard(r2, '2', GND(), BLACK);
        break;
      }
      case 'pot': {
        const at = placeAt(pico ? side(P.a ?? 26) : 'up', 40, 50);
        const pt = add('potentiometer', at.x + 9, at.y);
        toBoard(pt, 'VCC', v3(), RED); toBoard(pt, 'GND', GND(), BLACK);
        analogIn(pt, 'SIG', s);
        break;
      }
      case 'ldr': {
        const at = placeAt(pico ? side(P.a ?? 26) : 'up', 50, 80);
        const l = add('ldr-module', at.x + 10, at.y);
        toBoard(l, 'VCC', v3(), RED); toBoard(l, 'GND', GND(), BLACK);
        if (pico) toBoard(l, 'AO', gp(P.a ?? 26)); else if (P.a != null) toBoard(l, 'DO', gp(P.a)); else analogIn(l, 'AO', s);
        break;
      }
      case 'dht': {
        const at = placeAt(side(g0), 50, 90);
        const d = add('dht22', at.x + 12, at.y, { model: props.model || '22' });
        toBoard(d, 'VCC', v3(), RED); toBoard(d, 'GND', GND(), BLACK); toBoard(d, 'DATA', gp(P.data));
        break;
      }
      case 'neopixel': {
        const at = placeAt(side(g0), 110, 110);
        const np = add('neopixel', at.x + 30, at.y, { layout: props.layout || 'stick8' });
        toBoard(np, 'VCC', V5, RED); toBoard(np, 'GND', GND(), BLACK); toBoard(np, 'DIN', gp(P.din));
        break;
      }
      case 'lcd': {
        const at = placeAt('up', 290, 160);
        const l = add('lcd-i2c', at.x + 15, at.y - 150, { address: String(props.addr ?? 39) });
        toBoard(l, 'VCC', V5, RED); toBoard(l, 'GND', GND(), BLACK); toBoard(l, 'SDA', gp(pico ? 4 : 2)); toBoard(l, 'SCL', gp(pico ? 5 : 3));
        break;
      }
      default: break;
    }
  }
  layoutSlots(slots, pinX, pico);
  routeWires(parts, wires, bid, pico);
  return { parts, wires };
}

/**
 * Wires to the header get one bend level (pin → straight out from the board → across → into the
 * part), so they run square like jumpers instead of diagonally over the board and its labels.
 */
function routeWires(parts, wires, bid, pico) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const at = (end) => {
    const part = byId.get(end.part);
    const pin = part && pinsOf(part).find((q) => q.id === end.pin);
    return pin ? toWorld(part, pin.x, pin.y) : null;
  };
  let k = 0;
  for (const w of wires) {
    const onBoard = w.from.part === bid ? w.from : w.to.part === bid ? w.to : null;
    if (!onBoard) continue;
    const other = onBoard === w.from ? w.to : w.from;
    const a = at(onBoard), b = at(other);
    if (!a || !b || Math.abs(a[0] - b[0]) < 1 || Math.abs(a[1] - b[1]) < 1) continue;
    // the bend sits between the board and the part, staggered so parallel runs don't overlap
    const dir = b[1] < a[1] ? -1 : 1;
    const span = Math.abs(b[1] - a[1]);
    // clear of the pin names printed next to the header (longer on the Pico)
    const off = Math.min(span - 8, (pico ? 50 : 24) + (k++ % 6) * 6);
    if (off < 6) continue;
    const y = Math.round(a[1] + dir * off);
    const pts = [[a[0], y], [b[0], y]];
    w.points = onBoard === w.from ? pts : pts.reverse();
  }
}

/** Put the slots in rows above (and for the Pico also below) the board, each over its pin. */
function layoutSlots(slots, pinX, pico) {
  const GAP = 30;
  for (const where of ['up', 'down']) {
    const list = slots.filter((s) => s.where === where).map((s) => ({ s, x: (pinX.get(s.pin) || { x: 100 }).x - s.w / 2 }));
    list.sort((a, b) => a.x - b.x);
    const maxRow = pico ? 560 : 700;
    let rowY = where === 'up' ? (pico ? -90 : -110) : 220, right = -Infinity, rowH = 0, rowStart = -60;
    for (const it of list) {
      let x = Math.max(it.x, right + GAP);
      if (x + it.s.w > rowStart + maxRow && right > -Infinity) {
        // next row, further from the board
        rowY += where === 'up' ? -(rowH + 60) : rowH + 60;
        right = -Infinity; rowH = 0;
        x = it.x;
      }
      for (const p of it.s.parts) { p.x = Math.round((p.x + x) / 10) * 10; p.y = Math.round((p.y + rowY) / 10) * 10; }
      right = x + it.s.w;
      rowH = Math.max(rowH, it.s.h);
    }
  }
}
