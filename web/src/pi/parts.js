// Parts you can wire to the virtual header: live artwork, pin chips and controls (press a button,
// slide a distance …). Electrical behaviour is in partsim.js.
import { h } from '../ui/widgets.js';
import { icon } from '../ui/icons.js';
import { pinLabel, physOf } from './boards.js';

const LED_COLORS = { red: '#ff3b30', green: '#22e55e', yellow: '#ffd60a', blue: '#3b82f6', white: '#f8fafc', orange: '#ff8a00' };

export const PART_TYPES = {
  led: { name: 'LED', desc: 'LED + 330 Ω resistor to GND', pins: [{ key: 'a', label: 'Anode +' }], props: { color: 'red' }, ic: 'bulb' },
  rgb: { name: 'RGB LED', desc: 'Common cathode, 3 resistors', pins: [{ key: 'r', label: 'R' }, { key: 'g', label: 'G' }, { key: 'b', label: 'B' }], props: {}, ic: 'palette' },
  button: { name: 'Push button', desc: 'Between the pin and GND (use the pull-up)', pins: [{ key: 'a', label: 'Pin' }], props: { to: 'gnd' }, ic: 'button' },
  switch: { name: 'Toggle switch', desc: 'Latching switch to GND', pins: [{ key: 'a', label: 'Pin' }], props: { to: 'gnd' }, ic: 'sliders' },
  buzzer: { name: 'Buzzer', desc: 'Active buzzer (beeps when HIGH; PWM sets the tone)', pins: [{ key: 'a', label: '+' }], props: {}, ic: 'bell' },
  relay: { name: 'Relay module', desc: '5 V relay board, IN active HIGH, switches a 230 V lamp', pins: [{ key: 'a', label: 'IN' }], props: {}, ic: 'plug' },
  servo: { name: 'Servo SG90', desc: '50 Hz PWM, 0.5–2.5 ms = 0–180°', pins: [{ key: 'sig', label: 'Signal' }], props: {}, ic: 'rotate' },
  motor: { name: 'DC motor (L298N)', desc: 'IN1 = forward, IN2 = backward, PWM = speed', pins: [{ key: 'fwd', label: 'IN1' }, { key: 'back', label: 'IN2' }], props: {}, ic: 'motor' },
  pir: { name: 'PIR motion sensor', desc: 'HC-SR501, OUT goes HIGH for 3 s', pins: [{ key: 'out', label: 'OUT' }], props: {}, ic: 'sensor' },
  ultrasonic: { name: 'HC-SR04 ultrasonic', desc: '2–400 cm, echo via voltage divider', pins: [{ key: 'trig', label: 'TRIG' }, { key: 'echo', label: 'ECHO' }], props: { cm: 50 }, ic: 'activity' },
  pot: { name: 'Potentiometer', desc: '10 kΩ; Pico: on an ADC pin · Pi: MCP3008 channel', pins: [{ key: 'a', label: 'Wiper', adc: true }], props: { value: 0.5, ch: 0 }, ic: 'gauge' },
  ldr: { name: 'Light sensor (LDR)', desc: 'Pico: analog on an ADC pin · Pi: module DO pin', pins: [{ key: 'a', label: 'OUT', adc: true }], props: { light: 0.6, ch: 1 }, ic: 'sun' },
  dht: { name: 'DHT22 sensor', desc: 'Temperature and humidity, one data pin', pins: [{ key: 'data', label: 'DATA' }], props: { t: 28, h: 60 }, ic: 'thermometer' },
  neopixel: { name: 'NeoPixel strip ×8', desc: 'WS2812B, data in', pins: [{ key: 'din', label: 'DIN' }], props: { n: 8 }, ic: 'sparkles' },
};
export const PART_ORDER = ['led', 'rgb', 'button', 'switch', 'buzzer', 'relay', 'servo', 'motor', 'pir', 'ultrasonic', 'pot', 'ldr', 'dht', 'neopixel'];

let seq = 0;
export function newPart(type, pins, props = {}) {
  const t = PART_TYPES[type];
  return { id: 'p' + Date.now().toString(36) + (seq++), type, pins: { ...pins }, props: { ...t.props, ...props }, state: {} };
}

/** Pins the part needs on this board (a Pi pot / LDR uses the MCP3008 instead of a GPIO). */
export function partPins(part, isPico) {
  const t = PART_TYPES[part.type];
  if (!isPico && (part.type === 'pot')) return [];
  return t.pins.filter((p) => !(p.adc && !isPico && part.type === 'pot'));
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (c, k) => `rgba(${c[0]},${c[1]},${c[2]},${k})`;

// ------------------------------------------------------------------ artwork
const ART = {
  led: (p) => `<svg viewBox="0 0 100 90"><defs><radialGradient id="lg-${p.id}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".35" class="led-col" stop-color="${LED_COLORS[p.props.color] || '#f33'}"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient></defs>
    <circle class="halo" cx="50" cy="34" r="30" fill="${LED_COLORS[p.props.color] || '#f33'}" opacity="0" filter="blur(6px)"/>
    <path d="M32 58V30a18 18 0 0 1 36 0v28z" fill="url(#lg-${p.id})" class="dome" opacity=".55"/><rect x="28" y="56" width="44" height="6" rx="2" fill="${LED_COLORS[p.props.color] || '#f33'}" opacity=".7"/>
    <path d="M42 62v24M58 62v18" stroke="#b8bec7" stroke-width="3"/></svg>`,
  rgb: () => `<svg viewBox="0 0 100 90"><circle class="halo" cx="50" cy="34" r="30" opacity="0" filter="blur(6px)"/><path class="dome" d="M32 58V30a18 18 0 0 1 36 0v28z" fill="#e5e7eb" opacity=".8"/><rect x="28" y="56" width="44" height="6" rx="2" fill="#cbd5e1"/>
    <path d="M38 62v24M46 62v28M54 62v24M62 62v20" stroke="#b8bec7" stroke-width="3"/></svg>`,
  button: () => `<svg viewBox="0 0 100 90"><rect x="18" y="18" width="64" height="64" rx="6" fill="#1f2937" stroke="#0b1220" stroke-width="2"/><circle cx="26" cy="26" r="3" fill="#6b7280"/><circle cx="74" cy="26" r="3" fill="#6b7280"/><circle cx="26" cy="74" r="3" fill="#6b7280"/><circle cx="74" cy="74" r="3" fill="#6b7280"/>
    <circle class="cap" cx="50" cy="50" r="20" fill="#ef4444" stroke="#7f1d1d" stroke-width="3"/></svg>`,
  switch: () => `<svg viewBox="0 0 100 90"><rect x="14" y="30" width="72" height="30" rx="15" fill="#1f2937" stroke="#0b1220" stroke-width="2"/><circle class="knob" cx="30" cy="45" r="12" fill="#e5e7eb"/><text x="50" y="80" text-anchor="middle" font-size="11" fill="#94a3b8" class="sw-txt">OFF</text></svg>`,
  buzzer: () => `<svg viewBox="0 0 100 90"><g class="waves" opacity="0" stroke="#22d3ee" stroke-width="3" fill="none"><path d="M78 26a26 26 0 0 1 0 38"/><path d="M86 18a38 38 0 0 1 0 54"/></g><circle cx="46" cy="45" r="30" fill="#111827" stroke="#000" stroke-width="2"/><circle cx="46" cy="45" r="6" fill="#000"/><text x="46" y="28" font-size="9" text-anchor="middle" fill="#6b7280">+</text></svg>`,
  relay: () => `<svg viewBox="0 0 100 90"><rect x="6" y="20" width="58" height="54" rx="4" fill="#1d4ed8"/><text x="35" y="44" font-size="8" fill="#dbeafe" text-anchor="middle">SRD-05VDC</text><text x="35" y="56" font-size="7" fill="#bfdbfe" text-anchor="middle">10A 250VAC</text>
    <circle class="rled" cx="14" cy="68" r="3.5" fill="#450a0a"/><g transform="translate(78 40)"><circle class="lamp" r="13" fill="#3f3f46" stroke="#a1a1aa" stroke-width="2"/><path d="M-5 -2l5 6 5-6" stroke="#71717a" stroke-width="2" fill="none"/><rect x="-6" y="13" width="12" height="8" fill="#a1a1aa"/></g>
    <text class="rtxt" x="35" y="88" font-size="8" fill="#94a3b8" text-anchor="middle">NO open</text></svg>`,
  servo: () => `<svg viewBox="0 0 100 90"><rect x="16" y="30" width="68" height="38" rx="3" fill="#2563eb"/><rect x="8" y="42" width="84" height="8" rx="2" fill="#1d4ed8"/><circle cx="36" cy="49" r="13" fill="#1e40af"/>
    <g class="horn" transform="rotate(0 36 49)"><path d="M36 49L36 14" stroke="#f8fafc" stroke-width="9" stroke-linecap="round"/><circle cx="36" cy="49" r="7" fill="#f8fafc"/><circle cx="36" cy="49" r="2.5" fill="#94a3b8"/></g>
    <text class="ang" x="66" y="62" font-size="11" fill="#dbeafe" text-anchor="middle" font-family="monospace">90°</text></svg>`,
  motor: () => `<svg viewBox="0 0 100 90"><rect x="8" y="34" width="30" height="24" rx="3" fill="#9ca3af"/><rect x="34" y="40" width="10" height="12" fill="#6b7280"/>
    <g class="fan" transform="rotate(0 66 46)"><circle cx="66" cy="46" r="5" fill="#111"/><path d="M66 46 C60 30 70 20 74 22 C76 30 72 40 66 46Z M66 46 C82 40 90 50 88 54 C80 56 70 52 66 46Z M66 46 C70 62 60 72 56 70 C54 62 60 52 66 46Z M66 46 C50 52 42 42 44 38 C52 36 62 40 66 46Z" fill="#f59e0b" opacity=".9"/></g>
    <text class="spd" x="24" y="80" font-size="10" fill="#94a3b8" text-anchor="middle" font-family="monospace">0%</text></svg>`,
  pir: () => `<svg viewBox="0 0 100 90"><rect x="14" y="52" width="72" height="26" rx="3" fill="#15803d"/><path d="M22 54a28 28 0 0 1 56 0z" fill="#f8fafc" stroke="#cbd5e1"/><path d="M30 54a20 20 0 0 1 40 0M38 54a12 12 0 0 1 24 0" stroke="#e2e8f0" fill="none"/>
    <circle class="pled" cx="78" cy="70" r="3.5" fill="#450a0a"/></svg>`,
  ultrasonic: () => `<svg viewBox="0 0 100 90"><rect x="4" y="26" width="92" height="40" rx="3" fill="#1d4ed8"/><circle cx="26" cy="46" r="16" fill="url(#mesh)" stroke="#cbd5e1" stroke-width="3"/><circle cx="74" cy="46" r="16" stroke="#cbd5e1" stroke-width="3" fill="#475569"/><circle cx="26" cy="46" r="11" fill="#334155"/><circle cx="74" cy="46" r="11" fill="#334155"/>
    <rect x="44" y="30" width="12" height="8" rx="1.5" fill="#cbd5e1"/><g class="ping" opacity="0" stroke="#22d3ee" stroke-width="2" fill="none"><path d="M26 22a30 30 0 0 1 48 0"/></g></svg>`,
  pot: () => `<svg viewBox="0 0 100 90"><rect x="22" y="56" width="56" height="20" rx="3" fill="#1e3a8a"/><circle cx="50" cy="44" r="26" fill="#1f2937" stroke="#0b1220" stroke-width="2"/><g class="knob" transform="rotate(0 50 44)"><circle cx="50" cy="44" r="18" fill="#374151"/><rect x="48" y="24" width="4" height="16" rx="2" fill="#f8fafc"/></g></svg>`,
  ldr: () => `<svg viewBox="0 0 100 90"><g class="sun" transform="translate(76 22)"><circle r="9" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="2.5"><path d="M0-15v4M0 11v4M-15 0h4M11 0h4M-11-11l3 3M8 8l3 3M-11 11l3-3M8-8l3-3"/></g></g>
    <circle cx="40" cy="50" r="22" fill="#e7d3a6" stroke="#a16207" stroke-width="2"/><path d="M26 44h28M26 50h28M26 56h28M30 44v12M50 44v12" stroke="#b45309" stroke-width="2.5" fill="none"/></svg>`,
  dht: () => `<svg viewBox="0 0 100 90"><rect x="28" y="10" width="44" height="64" rx="4" fill="#f8fafc" stroke="#cbd5e1"/>${[0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((c) => `<rect x="${34 + c * 11}" y="${16 + r * 10}" width="8" height="6" rx="1" fill="#cbd5e1"/>`).join('')).join('')}<text x="50" y="86" font-size="9" fill="#94a3b8" text-anchor="middle" class="dval">—</text></svg>`,
  neopixel: (p) => `<svg viewBox="0 0 100 90"><rect x="2" y="34" width="96" height="22" rx="3" fill="#0f172a" stroke="#1e293b"/>${Array.from({ length: p.props.n || 8 }, (_, i) => `<rect class="px" data-i="${i}" x="${6 + i * 11.6}" y="38" width="9" height="14" rx="2" fill="#e5e7eb" opacity=".25"/>`).join('')}</svg>`,
};

// ------------------------------------------------------------------ card
/**
 * Card for one part. ctx: { gpio, board, isPico, onPin(part, key), onRemove(part), onChange() }
 * Returns { el, update() }.
 */
export function partCard(part, ctx) {
  const t = PART_TYPES[part.type];
  const art = h('div', { class: 'pc-art', html: ART[part.type](part) });
  const chips = h('div', { class: 'pc-pins' });
  const drawChips = () => {
    chips.innerHTML = '';
    if (!ctx.isPico && (part.type === 'pot' || part.type === 'ldr')) {
      const ch = Number(part.props.ch ?? 0);
      chips.appendChild(h('button', { class: 'pin-chip spi', onclick: () => ctx.onChannel(part) }, h('b', {}, 'MCP3008'), h('span', {}, `CH${ch}`)));
      if (part.type === 'pot') return;
    }
    for (const pd of partPins(part, ctx.isPico)) {
      if (pd.adc && !ctx.isPico && part.type === 'ldr') { /* digital DO on the Pi */ }
      const g = part.pins[pd.key];
      const ph = g != null ? physOf(ctx.board, g) : null;
      chips.appendChild(h('button', { class: 'pin-chip' + (g == null ? ' unset' : ''), onclick: () => ctx.onPin(part, pd.key) },
        h('b', {}, pd.label), h('span', {}, g == null ? 'choose…' : `${pinLabel(ctx.board, g)}${ph ? ' · pin ' + ph : ''}`)));
    }
  };
  drawChips();
  const controls = h('div', { class: 'pc-ctl' });
  const slider = (label, key, min, max, step, fmt) => {
    const val = h('b', {}, fmt(part.props[key]));
    const inp = h('input', { type: 'range', min, max, step, value: part.props[key] });
    inp.addEventListener('input', () => { part.props[key] = Number(inp.value); val.textContent = fmt(part.props[key]); ctx.gpio.partChanged(); ctx.onChange(); });
    controls.appendChild(h('label', { class: 'pc-slider' }, h('span', {}, label), inp, val));
  };
  if (part.type === 'button') {
    const b = h('button', { class: 'pc-press' }, 'Hold to press');
    const down = (e) => { e.preventDefault(); b.setPointerCapture && e.pointerId != null && b.setPointerCapture(e.pointerId); part.state.pressed = true; b.classList.add('on'); ctx.gpio.partChanged(); ctx.vibrate && ctx.vibrate(); };
    const up = () => { if (!part.state.pressed) return; part.state.pressed = false; b.classList.remove('on'); ctx.gpio.partChanged(); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    art.addEventListener('pointerdown', down);
    art.addEventListener('pointerup', up);
    art.addEventListener('pointerleave', up);
    controls.appendChild(b);
  } else if (part.type === 'switch') {
    const b = h('button', { class: 'pc-press' }, 'Flip');
    const flip = () => { part.state.on = !part.state.on; ctx.gpio.partChanged(); ctx.vibrate && ctx.vibrate(); };
    b.onclick = flip; art.onclick = flip;
    controls.appendChild(b);
  } else if (part.type === 'pir') {
    const b = h('button', { class: 'pc-press' }, '👋 Wave a hand');
    b.onclick = () => {
      part.state.until = performance.now() + 3000;
      ctx.gpio.partChanged();
      clearTimeout(part.state.tm);
      part.state.tm = setTimeout(() => ctx.gpio.partChanged(), 3010);
    };
    controls.appendChild(b);
  } else if (part.type === 'ultrasonic') slider('Distance', 'cm', 2, 400, 1, (v) => `${v} cm`);
  else if (part.type === 'pot') slider('Turn', 'value', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`);
  else if (part.type === 'ldr') slider('Light', 'light', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`);
  else if (part.type === 'dht') { slider('Temp', 't', -10, 60, 0.1, (v) => `${Number(v).toFixed(1)} °C`); slider('Humidity', 'h', 5, 99, 1, (v) => `${v}%`); }
  else if (part.type === 'led') {
    const sel = h('select', { class: 'pc-select' }, ...Object.keys(LED_COLORS).map((c) => h('option', { value: c, selected: c === part.props.color }, c)));
    sel.onchange = () => { part.props.color = sel.value; art.innerHTML = ART.led(part); ctx.onChange(); update(); };
    controls.appendChild(h('label', { class: 'pc-slider' }, h('span', {}, 'Colour'), sel));
  }

  const el = h('div', { class: 'part-card', 'data-type': part.type },
    h('div', { class: 'pc-head' },
      h('span', { class: 'pc-ic', html: icon(t.ic, 16) }),
      h('div', { class: 'pc-title' }, h('b', {}, t.name), h('small', {}, t.desc)),
      h('button', { class: 'icon-btn sm', 'aria-label': 'Remove', html: icon('close', 18), onclick: () => ctx.onRemove(part) })),
    h('div', { class: 'pc-body' }, art, h('div', { class: 'pc-side' }, chips, controls)));

  const g = ctx.gpio;
  const q = (s) => art.querySelector(s);
  let fanA = 0, lastT = performance.now();
  function update() {
    const d = (k) => (part.pins[k] == null ? 0 : g.drive(part.pins[k]) || 0);
    switch (part.type) {
      case 'led': {
        const v = d('a');
        q('.dome').setAttribute('opacity', String(0.45 + v * 0.55));
        q('.halo').setAttribute('opacity', String(v * 0.75));
        break;
      }
      case 'rgb': {
        const c = [d('r'), d('g'), d('b')].map((x) => Math.round(clamp(x, 0, 1) * 255));
        const on = Math.max(...c) / 255;
        q('.dome').setAttribute('fill', on ? `rgb(${Math.max(c[0], 40)},${Math.max(c[1], 40)},${Math.max(c[2], 40)})` : '#e5e7eb');
        q('.halo').setAttribute('fill', `rgb(${c.join(',')})`);
        q('.halo').setAttribute('opacity', String(on * 0.8));
        break;
      }
      case 'button': q('.cap').setAttribute('r', part.state.pressed ? '17' : '20'); q('.cap').setAttribute('fill', part.state.pressed ? '#b91c1c' : '#ef4444'); break;
      case 'switch': q('.knob').setAttribute('cx', part.state.on ? '70' : '30'); q('.sw-txt').textContent = part.state.on ? 'ON' : 'OFF'; break;
      case 'buzzer': {
        const p = part.pins.a != null ? g.pins.get(part.pins.a) : null;
        const on = p && ((p.mode === 'out' && p.out) || (p.mode === 'pwm' && p.duty > 0.02));
        q('.waves').setAttribute('opacity', on ? '1' : '0');
        ctx.tone && ctx.tone(part.id, on ? (p.mode === 'pwm' && p.freq >= 30 ? p.freq : 2300) : 0);
        break;
      }
      case 'relay': {
        const on = d('a') >= 0.5;
        q('.rled').setAttribute('fill', on ? '#ef4444' : '#450a0a');
        q('.lamp').setAttribute('fill', on ? '#fde047' : '#3f3f46');
        q('.rtxt').textContent = on ? 'NO closed · lamp ON' : 'NO open';
        break;
      }
      case 'servo': {
        const p = part.pins.sig != null ? g.pins.get(part.pins.sig) : null;
        if (p && p.mode === 'pwm' && p.freq >= 30 && p.freq <= 400 && p.duty > 0) {
          const ms = (p.duty / p.freq) * 1000;
          part.state.angle = clamp((ms - 0.5) / 2 * 180, 0, 180);
        }
        const a = part.state.angle ?? 90;
        q('.horn').setAttribute('transform', `rotate(${a - 90} 36 49)`);
        q('.ang').textContent = `${Math.round(a)}°`;
        break;
      }
      case 'motor': {
        const s = d('fwd') - d('back');
        const nowT = performance.now();
        fanA = (fanA + s * (nowT - lastT) * 1.4) % 360;
        lastT = nowT;
        q('.fan').setAttribute('transform', `rotate(${fanA} 66 46)`);
        q('.spd').textContent = `${s < 0 ? '−' : ''}${Math.round(Math.abs(s) * 100)}%`;
        part.state.spinning = Math.abs(s) > 0.001;
        break;
      }
      case 'pir': q('.pled').setAttribute('fill', performance.now() < (part.state.until || 0) ? '#ef4444' : '#450a0a'); break;
      case 'ultrasonic': q('.ping').setAttribute('opacity', part.state.tFall && performance.now() - part.state.tFall < 200 ? '1' : '0'); break;
      case 'pot': q('.knob').setAttribute('transform', `rotate(${(part.props.value - 0.5) * 270} 50 44)`); break;
      case 'ldr': q('.sun').setAttribute('opacity', String(0.15 + part.props.light * 0.85)); break;
      case 'dht': q('.dval').textContent = `${Number(part.props.t).toFixed(1)} °C · ${part.props.h}%`; break;
      case 'neopixel': {
        const cols = g.neo.get(part.pins.din) || [];
        art.querySelectorAll('.px').forEach((r, i) => {
          const c = cols[i];
          if (c && (c[0] || c[1] || c[2])) {
            const m = Math.max(c[0], c[1], c[2]) / 255;
            r.setAttribute('fill', `rgb(${c.map((x) => Math.min(255, Math.round(x / Math.max(m, 0.001) * 0.9 + 25))).join(',')})`);
            r.setAttribute('opacity', String(0.45 + m * 0.55));
          } else { r.setAttribute('fill', '#e5e7eb'); r.setAttribute('opacity', '.25'); }
        });
        break;
      }
      default:
    }
  }
  update();
  return { el, update, redrawPins: drawChips, part };
}

export { LED_COLORS, mix };
