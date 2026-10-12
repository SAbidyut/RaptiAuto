// Pictures of chapter P5: GPIO programming with gpiozero, RPi.GPIO and machine (Pico).
import { K, T, R, L, P, AR, DOT, BADGE, fig, WC, PC, cable, resG } from './art-pi-kit.js';
import { codeLine } from './art-pi-python.js';

const CK = { kw: '#c792ea', fn: '#82aaff', num: '#f78c6c', str: '#c3e88d', cm: '#66789c', tx: '#e2e8f0', cls: '#ffcb6b' };
const kw = (t) => [t, CK.kw], tx = (t) => [t, CK.tx], fn = (t) => [t, CK.fn], num = (t) => [t, CK.num], str = (t) => [t, CK.str], cls = (t) => [t, CK.cls];
const box = (x, y, w, h, t, sub, c = K.line, fill = K.box) => R(x, y, w, h, { fill, stroke: c, rx: 9 }) + T(x + w / 2, y + (sub ? h / 2 - 1 : h / 2 + 4), t, { size: 10.2, anchor: 'middle', weight: 800 }) + (sub ? T(x + w / 2, y + h / 2 + 12, sub, { size: 8.2, anchor: 'middle', fill: '#94a3b8' }) : '');

export function heroLibs() {
  let s = '';
  const card = (x, title, sub, c, lines) => R(x, 8, 112, 176, { fill: K.box, stroke: c, rx: 12 }) + T(x + 56, 28, title, { size: 12.5, anchor: 'middle', weight: 800, fill: c }) + T(x + 56, 42, sub, { size: 8.4, anchor: 'middle', fill: '#94a3b8' }) + L(x + 10, 50, x + 102, 50, { stroke: '#1e293b' }) + lines.map((l, i) => codeLine(x + 8, 68 + i * 15, l, 6.4)).join('');
  s += card(6, 'gpiozero', 'Pi 4 / Pi 5 · friendly', K.ok, [[kw('from '), tx('gpiozero '), kw('import '), cls('LED')], [], [tx('led = '), cls('LED'), tx('('), num('17'), tx(')')], [tx('led'), fn('.on'), tx('()')], [tx('led'), fn('.off'), tx('()')], [tx('led'), fn('.blink'), tx('()')]]);
  s += card(124, 'RPi.GPIO', 'Pi 4 / Pi 5 · classic', K.warn, [[kw('import '), tx('RPi.GPIO '), kw('as '), tx('GPIO')], [tx('GPIO'), fn('.setmode'), tx('(GPIO.BCM)')], [tx('GPIO'), fn('.setup'), tx('('), num('17'), tx(',')], [tx('   GPIO.OUT)')], [tx('GPIO'), fn('.output'), tx('('), num('17'), tx(',')], [tx('   GPIO.HIGH)')]]);
  s += card(242, 'machine', 'Pico · MicroPython', K.vio, [[kw('from '), tx('machine '), kw('import '), cls('Pin')], [], [tx('led = '), cls('Pin'), tx('('), num('15'), tx(',')], [tx('   Pin.OUT)')], [tx('led'), fn('.on'), tx('()')], [tx('led'), fn('.toggle'), tx('()')]]);
  s += T(180, 204, 'the same LED — three ways', { size: 10, anchor: 'middle', fill: K.acc, weight: 700 });
  return fig(360, 214, s, 'Three libraries, one job. gpiozero and RPi.GPIO are for the Pi 4 / Pi 5, machine is for the Pico boards.');
}

export function libMap() {
  let s = '';
  const cols = [['Pi 5 · Pi 4', 8, K.ok], ['Pico family', 190, K.vio]];
  cols.forEach(([t, x, c]) => { s += R(x, 8, 162, 28, { fill: K.box2, stroke: c, rx: 9 }) + T(x + 81, 27, t, { size: 12, anchor: 'middle', weight: 800, fill: c }); });
  const rows = [['Language', 'Python 3 programs', 'MicroPython'], ['Library', 'gpiozero · RPi.GPIO', 'machine'], ['Pin names', 'BCM: LED(17), pin 17', 'GP: Pin(15)'], ['Analog in', 'MCP3008 chip (SPI)', 'ADC(26) built in'], ['PWM', 'PWMLED · GPIO.PWM', 'machine.PWM'], ['Run from', 'Thonny · Terminal', 'Thonny']];
  rows.forEach(([a, b, c], i) => { const y = 44 + i * 36; s += T(8, y + 13, a, { size: 8.6, fill: K.dim, weight: 700 }) + R(8, y + 17, 162, 15, { fill: K.box, stroke: '#1e293b', rx: 5 }) + T(89, y + 28, b, { size: 9.2, anchor: 'middle' }) + R(190, y + 17, 162, 15, { fill: K.box, stroke: '#1e293b', rx: 5 }) + T(271, y + 28, c, { size: 9.2, anchor: 'middle' }); });
  return fig(360, 262, s, 'Which library for which board.');
}

export function gpiozeroDevices() {
  let s = '';
  const group = (x, y, w, title, c, items) => {
    let r = R(x, y, w, 20 + Math.ceil(items.length / 2) * 22 + 8, { fill: K.box, stroke: c, rx: 11 }) + T(x + 12, y + 17, title, { size: 11, weight: 800, fill: c });
    items.forEach((it, i) => { const ix = x + 8 + (i % 2) * ((w - 16) / 2), iy = y + 26 + Math.floor(i / 2) * 22; r += R(ix, iy, (w - 16) / 2 - 4, 18, { fill: '#0b1226', stroke: '#1e293b', rx: 6 }) + T(ix + ((w - 16) / 2 - 4) / 2, iy + 12.5, it, { size: it.length > 11 ? 7.2 : 8.6, anchor: 'middle', fill: '#e2e8f0', mono: true }); });
    return r;
  };
  s += group(8, 8, 172, 'Outputs', K.warn, ['LED', 'PWMLED', 'RGBLED', 'Buzzer', 'TonalBuzzer', 'OutputDevice', 'Motor', 'Servo', 'AngularServo', 'Robot', 'LEDBoard', 'TrafficLights']);
  s += group(188, 8, 164, 'Inputs', K.ok, ['Button', 'MotionSensor', 'LineSensor', 'LightSensor', 'DistanceSensor', 'MCP3008', 'MCP3004', 'MCP3208', 'Potentiometer', 'InputDevice']);
  s += group(8, 196, 344, 'System (no wiring)', K.vio, ['CPUTemperature', 'LoadAverage', 'PingServer', 'TimeOfDay']);
  return fig(360, 270, s, 'The gpiozero classes that exist in the lab. Each one is one part: LED(17), Button(2), DistanceSensor(echo=24, trigger=23) …');
}

export function pullUpFig() {
  let s = '';
  // schematic pull-up
  s += T(10, 16, 'Button(2): pull-up (the default)', { size: 10.5, weight: 800, fill: K.acc });
  s += R(150, 28, 66, 70, { fill: '#166534', stroke: K.ok, rx: 8 }) + T(183, 46, 'GPIO2', { size: 10.5, anchor: 'middle', weight: 800 }) + T(183, 60, 'input', { size: 8.5, anchor: 'middle', fill: '#bbf7d0' });
  s += T(183, 88, 'reads 1 or 0', { size: 8.2, anchor: 'middle', fill: '#bbf7d0' });
  s += T(14, 52, '3.3 V', { size: 10, fill: PC.power3, weight: 800 }) + cable([[48, 46], [60, 46]], WC.red) + `<rect x="60" y="40" width="44" height="12" rx="3" fill="#d9bf92" stroke="#0b1226"/>` + T(82, 36, 'pull-up ~50 kΩ', { size: 8, anchor: 'middle', fill: '#fde68a' }) + cable([[104, 46], [128, 46], [128, 72], [150, 72]], WC.red).replace(/#ef4444/g, '#ef4444');
  s += cable([[128, 72], [128, 84]], WC.blu) + `<rect x="114" y="84" width="28" height="22" rx="4" fill="#1f2937" stroke="#475569"/><circle cx="128" cy="95" r="6" fill="#3b82f6"/>` + cable([[128, 106], [128, 124]], WC.blk) + L(118, 126, 138, 126, { stroke: '#94a3b8', sw: 2 }) + L(121, 131, 135, 131, { stroke: '#94a3b8', sw: 2 }) + L(125, 136, 131, 136, { stroke: '#94a3b8', sw: 2 });
  s += T(150, 106, 'button to GND', { size: 8.8, fill: '#cbd5e1' }) + T(150, 120, '(the pull-up is inside', { size: 8.2, fill: K.dim }) + T(150, 132, 'the Pi: no resistor!)', { size: 8.2, fill: K.dim });
  // waveform
  const x0 = 236, xe = 352;
  s += T(x0, 40, '3.3 V', { size: 8.5, fill: K.dim }) + T(x0, 110, '0 V', { size: 8.5, fill: K.dim });
  s += P(`M${x0 + 28} 34 H${x0 + 56} V104 H${x0 + 92} V34 H${xe}`, { stroke: K.acc, sw: 2.2 });
  s += L(x0 + 56, 110, x0 + 92, 110, { stroke: K.warn, sw: 2 }) + T(x0 + 74, 122, 'pressed', { size: 8.4, anchor: 'middle', fill: K.warn, weight: 700 }) + T(x0 + 42, 28, 'idle: HIGH', { size: 8, anchor: 'middle', fill: K.dim });
  s += R(8, 150, 344, 54, { fill: K.box, stroke: K.line, rx: 10 }) + T(18, 169, 'Press = LOW = is_pressed is True.', { size: 10.2, fill: K.ink, weight: 700 }) + T(18, 184, 'gpiozero does the inversion for you: when_pressed fires on the falling edge.', { size: 8.8, fill: '#cbd5e1' }) + T(18, 197, 'With pull_up=False the button goes to 3V3 instead, idle LOW.', { size: 8.8, fill: '#cbd5e1' });
  return fig(360, 214, s, 'A button needs a defined level when nobody presses it. The Pi has resistors built in: wire the button between the GPIO and GND and let the pull-up do the rest.');
}

export function pwmDuty() {
  let s = '';
  const x0 = 56, per = 38;
  [0, 25, 50, 75, 100].forEach((d, i) => {
    const y = 14 + i * 40;
    s += T(8, y + 20, `${d}%`, { size: 11, weight: 800, fill: K.acc });
    let path = `M${x0} ${y + 28}`;
    for (let k = 0; k < 4; k++) {
      const a = x0 + k * per, w = per * d / 100;
      if (d === 0) path += ` H${a + per}`;
      else if (d === 100) path += ` V${y + 4} H${a + per}`;
      else path += ` V${y + 4} H${a + w} V${y + 28} H${a + per}`;
    }
    s += P(path, { stroke: d === 0 ? K.dim : K.warn, sw: 2 });
    s += `<circle cx="258" cy="${y + 16}" r="11" fill="#ef4444" fill-opacity="${0.12 + d / 100 * 0.88}" stroke="#7f1d1d"/>` + T(284, y + 12, `${(3.3 * d / 100).toFixed(2).replace(/\.?0+$/, '')} V`, { size: 9.4, fill: '#cbd5e1', weight: 700 }) + T(284, y + 25, 'on average', { size: 7.8, fill: K.dim });
  });
  s += T(x0 + per * 2, 218, 'one period (e.g. 1 / 100 Hz = 10 ms)', { size: 8.4, anchor: 'middle', fill: K.dim });
  return fig(360, 226, s, 'PWM: the pin switches on and off very fast. The share of "on" time is the duty cycle — an LED looks dimmer, a motor slower.');
}

export function servoPulse() {
  let s = '';
  const x0 = 56, fw = 250; // 20 ms frame = 250 px
  [[0.5, 0, '0°'], [1.5, 90, '90°'], [2.5, 180, '180°']].forEach(([ms, a, lab], i) => {
    const y = 14 + i * 58, w = fw * ms / 20;
    s += T(8, y + 22, lab, { size: 14, weight: 800, fill: K.acc });
    s += P(`M${x0} ${y + 32} H${x0 + 8} V${y + 6} H${x0 + 8 + w} V${y + 32} H${x0 + fw}`, { stroke: K.warn, sw: 2.2 });
    s += T(x0 + 8 + w / 2, y + 2, `${ms} ms`, { size: 9.4, anchor: 'middle', fill: '#fde68a', weight: 700 });
    s += L(x0 + fw, y + 36, x0 + fw, y + 4, { stroke: '#334155', dash: '2 3' });
    s += `<circle cx="334" cy="${y + 22}" r="3" fill="#94a3b8"/>` + P(`M334 ${y + 22} l${16 * Math.cos((180 - a) * Math.PI / 180)} ${-16 * Math.sin((180 - a) * Math.PI / 180)}`, { stroke: '#f1f5f9', sw: 3 });
  });
  s += T(x0 + fw / 2, 190, 'one frame = 20 ms (50 times per second)', { size: 8.6, anchor: 'middle', fill: K.dim });
  return fig(360, 200, s, 'A servo reads the width of a pulse that repeats every 20 ms: about 0.5 ms = 0°, 1.5 ms = 90°, 2.5 ms = 180° (SG90 as in the lab examples).');
}

export function edgeEvents() {
  let s = '';
  const x0 = 24;
  s += T(8, 14, 'GPIO2 level', { size: 9.4, fill: K.dim }) + T(8, 38, '3.3 V', { size: 8.5, fill: K.dim }) + T(8, 96, '0 V', { size: 8.5, fill: K.dim });
  s += P(`M${x0 + 20} 34 H110 L112 90 L116 40 L118 90 H220 L222 40 L226 90 L228 34 H330`, { stroke: K.acc, sw: 2.2 });
  s += L(112, 20, 112, 112, { stroke: K.err, dash: '3 3' }) + L(228, 20, 228, 112, { stroke: K.ok, dash: '3 3' });
  s += T(112, 126, 'FALLING edge', { size: 9.6, anchor: 'middle', fill: '#fca5a5', weight: 800 }) + T(228, 126, 'RISING edge', { size: 9.6, anchor: 'middle', fill: '#86efac', weight: 800 });
  s += T(112, 138, 'button pressed', { size: 8.4, anchor: 'middle', fill: K.dim }) + T(228, 138, 'button released', { size: 8.4, anchor: 'middle', fill: K.dim });
  s += R(8, 150, 168, 62, { fill: K.box, stroke: K.ok, rx: 10 }) + T(92, 166, 'gpiozero', { size: 10, anchor: 'middle', weight: 800, fill: K.ok }) + codeLine(14, 182, [tx('b.'), fn('when_pressed'), tx(' = f')], 8.4) + codeLine(14, 196, [tx('b.'), fn('when_released'), tx(' = g')], 8.4);
  s += R(184, 150, 168, 62, { fill: K.box, stroke: K.warn, rx: 10 }) + T(268, 166, 'RPi.GPIO', { size: 10, anchor: 'middle', weight: 800, fill: K.warn }) + codeLine(190, 182, [tx('add_event_detect(2,')], 8.4) + codeLine(190, 196, [tx('  GPIO.FALLING, f, 200)')], 8.4);
  s += T(172, 68, 'bounce', { size: 8, anchor: 'middle', fill: K.warn });
  return fig(360, 222, s, 'An edge is the moment the level changes. An event handler (a callback) runs on exactly that moment — "bouncetime" ignores the contact chatter right after it.');
}

export function pollVsEvents() {
  let s = '';
  const lane = (y, title, c) => T(8, y, title, { size: 10.5, weight: 800, fill: c }) + L(8, y + 38, 352, y + 38, { stroke: '#334155' });
  s += lane(18, 'Polling: ask again and again', K.warn);
  for (let i = 0; i < 12; i++) s += L(18 + i * 28, 40, 18 + i * 28, 56, { stroke: K.warn }) + `<circle cx="${18 + i * 28}" cy="48" r="2.6" fill="${K.warn}"/>`;
  s += `<rect x="78" y="34" width="18" height="14" fill="#ef4444" fill-opacity=".8"/>` + T(87, 28, 'short press', { size: 8.2, anchor: 'middle', fill: '#fca5a5' }) + `<rect x="190" y="34" width="60" height="14" fill="#22c55e" fill-opacity=".8"/>` + T(220, 28, 'long press', { size: 8.2, anchor: 'middle', fill: '#86efac' });
  s += T(8, 76, 'a short press between two questions can slip through', { size: 8.2, fill: K.dim });
  s += lane(100, 'Events: be told when it happens', K.ok);
  s += `<rect x="78" y="116" width="18" height="14" fill="#ef4444" fill-opacity=".8"/><rect x="190" y="116" width="60" height="14" fill="#22c55e" fill-opacity=".8"/>`;
  [[78, 'f()'], [190, 'f()']].forEach(([x, t]) => { s += AR(x, 104, x, 116, { m: 'mfc', stroke: K.ok }) + T(x + 4, 108, t, { size: 8.2, fill: '#86efac', mono: true }); });
  s += T(8, 152, 'the callback runs the moment the pin changes', { size: 8.2, fill: K.dim });
  return fig(360, 164, s, 'Two ways to watch a button: polling (is_pressed in a loop) or events (when_pressed, add_event_detect).');
}

export function rpiGpioFlow() {
  let s = '';
  const steps = [['GPIO.setmode(GPIO.BCM)', 'pin numbers are BCM', K.acc], ['GPIO.setup(pin, GPIO.OUT)', 'or GPIO.IN, pull_up_down=GPIO.PUD_UP', K.ok], ['GPIO.output / GPIO.input', 'write or read the pin', K.warn], ['GPIO.cleanup()', 'give all pins back (in finally:)', K.vio]];
  steps.forEach(([a, b, c], i) => { const y = 8 + i * 52; s += R(8, y, 224, 42, { fill: K.box, stroke: c, rx: 9 }) + BADGE(22, y + 21, i + 1) + T(38, y + 19, a, { size: 10, weight: 800, fill: c, mono: true }) + T(38, y + 33, b, { size: 8.4, fill: '#cbd5e1' }); if (i < 3) s += AR(120, y + 42, 120, y + 52, { m: 'mfb', stroke: K.acc }); });
  s += R(246, 8, 106, 194, { fill: 'rgba(148,163,184,.05)', stroke: K.line, rx: 10, dash: '4 3' }) + T(299, 26, 'also', { size: 10, anchor: 'middle', weight: 800, fill: K.acc });
  ['GPIO.PWM(pin, 100)', 'add_event_detect(…)', 'wait_for_edge(…)', 'event_detected(…)', 'setwarnings(False)'].forEach((t, i) => { s += R(252, 36 + i * 32, 94, 26, { fill: '#0b1226', stroke: '#1e293b', rx: 6 }) + T(299, 52 + i * 32, t.length > 17 ? t.slice(0, 16) + '…' : t, { size: 7.8, anchor: 'middle', fill: '#e2e8f0', mono: true }); });
  return fig(360, 214, s, 'The life of an RPi.GPIO program: mode, setup, use, cleanup.');
}

export function picoMachine() {
  let s = '';
  const card = (x, y, w, h, title, c, lines) => R(x, y, w, h, { fill: K.box, stroke: c, rx: 11 }) + T(x + 10, y + 17, title, { size: 11, weight: 800, fill: c, mono: true }) + lines.map((l, i) => T(x + 10, y + 34 + i * 13, l, { size: 8.6, fill: '#cbd5e1' })).join('');
  s += card(8, 8, 170, 100, 'Pin', K.ok, ['Pin(15, Pin.OUT)', 'Pin(14, Pin.IN, Pin.PULL_UP)', '.on() .off() .toggle() .value()', '.irq(handler=…) for edges']);
  s += card(182, 8, 170, 100, 'PWM', K.warn, ['PWM(Pin(15))', '.freq(1000)', '.duty_u16(0 … 65535)', '.duty_ns(1500000) for servos']);
  s += card(8, 114, 170, 100, 'ADC', K.acc, ['ADC(26)  →  GP26 = ADC0', '.read_u16()  0 … 65535', 'volts = raw × 3.3 / 65535', 'ADC(4) = chip temperature']);
  s += card(182, 114, 170, 100, 'I2C · time', K.vio, ['I2C(0, scl=Pin(5), sda=Pin(4))', '.scan()  → device addresses', 'time_pulse_us(echo, 1, 30000)', 'time.sleep() · sleep_ms()']);
  return fig(360, 226, s, 'The parts of machine you will use most on a Pico.');
}

export function adcMcp() {
  let s = '';
  s += R(8, 20, 76, 64, { fill: K.box, stroke: K.warn, rx: 9 }) + T(46, 40, 'Pot', { size: 11, anchor: 'middle', weight: 800 }) + T(46, 55, '0 … 3.3 V', { size: 8.8, anchor: 'middle', fill: '#cbd5e1' }) + T(46, 70, 'analog', { size: 8.4, anchor: 'middle', fill: K.dim });
  s += AR(84, 52, 118, 52, { m: 'mfb', stroke: K.warn }) + T(101, 44, 'CH0', { size: 8.2, anchor: 'middle', fill: K.warn });
  s += R(120, 8, 88, 92, { fill: '#111827', stroke: '#475569', rx: 6 }) + T(164, 32, 'MCP3008', { size: 10.5, anchor: 'middle', weight: 800 }) + T(164, 46, '8-ch ADC', { size: 8.4, anchor: 'middle', fill: K.dim }) + T(164, 64, '10 bit', { size: 8.4, anchor: 'middle', fill: '#cbd5e1' }) + T(164, 76, '0 … 1023', { size: 8.4, anchor: 'middle', fill: '#cbd5e1' });
  s += AR(208, 52, 244, 52, { m: 'mfb', stroke: K.acc }) + T(226, 44, 'SPI', { size: 8.2, anchor: 'middle', fill: K.acc });
  s += R(246, 8, 106, 92, { fill: '#166534', stroke: K.ok, rx: 9 }) + T(299, 28, 'Raspberry Pi', { size: 9.6, anchor: 'middle', weight: 800 }) + ['CLK → GPIO11', 'DOUT → GPIO9', 'DIN → GPIO10', 'CS → GPIO8'].map((t, i) => T(299, 44 + i * 13, t, { size: 8.4, anchor: 'middle', fill: '#dcfce7', mono: true })).join('');
  s += R(8, 112, 344, 60, { fill: K.box, stroke: K.line, rx: 10 }) + codeLine(16, 130, [tx('pot = '), cls('MCP3008'), tx('(channel='), num('0'), tx(')   '), [' # value: 0.0 … 1.0', CK.cm]], 8.8) + codeLine(16, 147, [tx('led = '), cls('PWMLED'), tx('('), num('18'), tx(')')], 8.8) + codeLine(16, 163, [tx('led.value = pot.value')], 8.8);
  s += R(8, 180, 344, 34, { fill: 'rgba(139,92,246,.1)', stroke: 'rgba(139,92,246,.4)', rx: 10 }) + T(180, 201, 'Pico: no chip needed — ADC(26) reads GP26 directly (16-bit)', { size: 9.4, anchor: 'middle', fill: '#c4b5fd', weight: 700 });
  return fig(360, 224, s, 'The Pi has no analog inputs. An MCP3008 chip turns a voltage into a number and sends it over SPI; gpiozero hides the details.');
}
