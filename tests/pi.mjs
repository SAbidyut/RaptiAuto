// Virtual Raspberry Pi / Pico: MicroPython runtime, GPIO simulator and the Python libraries.
//   node tests/pi.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GpioSim } from '../web/src/pi/gpio.js';
import { PyProcess } from '../web/src/pi/python.js';
import '../web/src/components/index.js';
import '../web/src/pi/circuit-parts.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { CircuitHw } from '../web/src/pi/circuit-hw.js';
import { autowire, defaultCircuit } from '../web/src/pi/autowire.js';

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = join(here, '..', 'web', 'src', 'pi', 'py');
const LIBS = {};
(function walk(dir, pre) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, pre + n + '/');
    else if (n.endsWith('.py')) LIBS[pre + n] = readFileSync(p, 'utf8');
  }
})(pyDir, '');
const wasmLoader = async () => readFileSync(join(here, '..', 'web', 'vendor', 'micropython', 'micropython.wasm'));

let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '\n       ' + String(extra).replace(/\n/g, '\n       ') : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let live = null;
async function proc(board, opts = {}) {
  if (live) live.kill();   // only one interpreter may be alive (like the app)
  const gpio = opts.gpio || new GpioSim(board);
  let text = '';
  const p = new PyProcess({ gpio, libs: LIBS, wasmLoader, out: (t) => { text += t; }, cwd: board.startsWith('pico') ? '/' : '/home/pi', ...opts });
  live = p;
  await p.start();
  return { p, gpio, get text() { return text; }, clear() { text = ''; } };
}

/** Run a program in a fresh interpreter (like pressing Run); the GPIO board is kept. */
async function py(gpio, src, opts = {}) {
  const t = await proc(gpio.board, { ...opts, gpio });
  await t.p.runSource(src, opts.name || '<stdin>');
  t.p.kill();
  gpio.stopProcess();
  return t.text;
}

console.log('MicroPython basics');
{
  const g = new GpioSim('pi5');
  let out = await py(g, 'import sys\nprint(sys.implementation.name, 2 ** 70)\nname = input("Name? ")\nprint("Hello", name)\n', { readLine: async () => 'Shawon' });
  check('print + bignum', out.includes('micropython 1180591620717411303424'), out);
  check('input()', out.includes('Hello Shawon'), out);
  out = await py(g, 'def f():\n    return 1/0\nf()\n', { name: '/home/pi/err.py' });
  check('traceback names the file', /File "\/home\/pi\/err.py", line 2/.test(out) && out.includes('ZeroDivisionError') && !out.includes('<stdin>'), out);
  out = await py(g, 'import time\nprint(time.strftime("%Y-%m-%d"), round(time.perf_counter(), 0) >= 0)\nimport random\nx=[1,2,3]\nrandom.shuffle(x)\nprint(sorted(x))\nimport datetime\nprint(type(datetime.date.today()).__name__)\n');
  check('time.strftime / random.shuffle / datetime', /\d{4}-\d\d-\d\d True\n\[1, 2, 3\]\ndate/.test(out), out);
  out = await py(g, 'import machine\n');
  check('no machine module on a Raspberry Pi', out.includes("ImportError: no module named 'machine'"), out);
}

console.log('gpiozero');
{
  const g = new GpioSim('pi5');
  const t0 = Date.now();
  let out = await py(g, 'from gpiozero import LED\nfrom time import sleep\nled = LED(17)\nled.on()\nprint(led.is_lit)\nsleep(0.2)\nled.off()\nprint(led.value)\n');
  check('LED on/off', out === 'True\n0\n', JSON.stringify(out));
  check('sleep really waits', Date.now() - t0 >= 190);
  const btn = { id: 'b1', type: 'button', pins: { a: 2 }, props: { to: 'gnd' }, state: { pressed: false } };
  g.addPart(btn);
  setTimeout(() => { btn.state.pressed = true; g.partChanged(); }, 150);
  setTimeout(() => { btn.state.pressed = false; g.partChanged(); }, 300);
  out = await py(g, `from gpiozero import Button, LED
import time
b = Button(2)
led = LED(17)
hits = []
b.when_pressed = lambda: hits.append('p')
b.when_released = lambda: hits.append('r')
print(b.is_pressed)
b.wait_for_press(timeout=2)
print('pressed', b.is_pressed, led.pin)
time.sleep(0.3)
print(hits)
`);
  check('Button wait_for_press + when_pressed/released callbacks', out.includes("False\npressed True 17\n['p', 'r']"), out);
  check('gpiozero pins are released when the program ends', g.pin(17).mode === 'in' && !g.pin(17).used);
  out = await py(g, 'from gpiozero import LED\nled = LED(17)\nled.blink(0.05, 0.05)\nimport time\nseen=set()\nfor i in range(30):\n    seen.add(led.value)\n    time.sleep(0.01)\nprint(sorted(seen))\n');
  check('blink() runs in the background', out.includes('[0, 1]'), out);
  const t = await proc('pi5', { gpio: g });
  await t.p.runSource('from gpiozero import PWMLED, Servo, AngularServo\nl = PWMLED(18)\nl.value = 0.25\ns = Servo(12)\ns.max()\na = AngularServo(13, min_angle=0, max_angle=180)\na.angle = 90\nprint(l.value, s.pulse_width)\n');
  check('PWMLED / Servo duty', Math.abs(g.duty(18) - 0.25) < 1e-6 && Math.abs(g.pin(12).duty - 0.1) < 1e-6 && g.pin(12).freq === 50 && Math.abs(g.pin(13).duty - 0.075) < 1e-6, t.text + JSON.stringify(g.pin(12)));
  g.stopProcess();
  g.addPart({ id: 'u', type: 'ultrasonic', pins: { trig: 4, echo: 27 }, props: { cm: 37 }, state: {} });
  out = await py(g, 'from gpiozero import DistanceSensor\nd = DistanceSensor(echo=27, trigger=4)\nprint(round(d.distance * 100))\n');
  check('DistanceSensor', out.trim() === '37', out);
  out = await py(g, 'from gpiozero import LED\na = LED(5)\nb = LED("GPIO5")\n');
  check('pin in use error', out.includes('GPIOPinInUse'), out);
  out = await py(g, 'from gpiozero import LED, Button\nled = LED(17)\nb = Button(2)\nled.source = b\nimport time\ntime.sleep(0.1)\nprint(led.value)\n');
  check('led.source = button', out.trim() === '0', out);
  out = await py(g, 'from gpiozero import CPUTemperature, TrafficLights\nprint(30 < CPUTemperature().temperature < 80)\nt = TrafficLights(9, 10, 11)\nt.amber.on()\nprint(t.value)\n');
  check('CPUTemperature / TrafficLights', out === 'True\n(0, 1, 0)\n', out);
}

console.log('RPi.GPIO');
{
  const g = new GpioSim('pi4');
  g.addPart({ id: 'u', type: 'ultrasonic', pins: { trig: 23, echo: 24 }, props: { cm: 120 }, state: {} });
  let out = await py(g, `import RPi.GPIO as GPIO
import time
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(18, GPIO.OUT)
GPIO.output(18, GPIO.HIGH)
GPIO.setup(23, GPIO.OUT)
GPIO.setup(24, GPIO.IN)
GPIO.output(23, True)
time.sleep(0.00001)
GPIO.output(23, False)
start = stop = time.time()
while GPIO.input(24) == 0:
    start = time.time()
while GPIO.input(24) == 1:
    stop = time.time()
print('cm', round((stop - start) * 34300 / 2))
GPIO.setup(12, GPIO.OUT)
p = GPIO.PWM(12, 50)
p.start(7.5)
print(GPIO.input(18))
`);
  const m = out.match(/cm (\d+)/);
  check('output + input (pins stay set after the program)', g.level(18) === 1 && out.includes('\n1\n'), out);
  check('HC-SR04 echo timing measured in Python (120 cm)', m && Math.abs(Number(m[1]) - 120) <= 4, out);
  out = await py(g, 'import RPi.GPIO as GPIO\nGPIO.setup(4, GPIO.OUT)\n');
  check('setmode required', out.includes('Please set pin numbering mode'), out);
  out = await py(g, 'import RPi.GPIO as GPIO\nGPIO.setmode(GPIO.BCM)\nGPIO.setup(18, GPIO.OUT)\n');
  check('"channel already in use" warning', out.includes('This channel is already in use'), out);
  const btn = { id: 'b', type: 'button', pins: { a: 27 }, props: { to: 'gnd' }, state: {} };
  g.addPart(btn);
  setTimeout(() => { btn.state.pressed = true; g.partChanged(); }, 100);
  out = await py(g, `import RPi.GPIO as GPIO, time
GPIO.setmode(GPIO.BOARD)
GPIO.setup(13, GPIO.IN, pull_up_down=GPIO.PUD_UP)
got = []
GPIO.add_event_detect(13, GPIO.FALLING, callback=lambda ch: got.append(ch), bouncetime=50)
time.sleep(0.3)
print(got, GPIO.event_detected(13))
GPIO.cleanup()
`);
  check('add_event_detect callback (BOARD numbering)', out.includes('[13] True'), out);
}

console.log('Pico (machine)');
{
  const g = new GpioSim('pico');
  g.addPart({ id: 'p', type: 'pot', pins: { a: 26 }, props: { value: 0.5 }, state: {} });
  const out = await py(g, `from machine import Pin, PWM, ADC, Timer
import time
led = Pin(25, Pin.OUT)
led.toggle()
print(led.value(), led)
pwm = PWM(Pin(15))
pwm.freq(1000)
pwm.duty_u16(32768)
adc = ADC(26)
v = adc.read_u16()
print(30000 < v < 35000)
t = ADC(4).read_u16() * 3.3 / 65535
print(abs(27 - (t - 0.706) / 0.001721 - 27) < 3)
n = [0]
def tick(t):
    n[0] += 1
tim = Timer(period=20, mode=Timer.PERIODIC, callback=tick)
time.sleep(0.25)
tim.deinit()
print(n[0] >= 8)
import rp2
print(rp2.bootsel_button())
`);
  check('Pin(25) onboard LED', g.level(25) === 1 && out.startsWith('1 Pin(GPIO25, mode=OUT)'), out);
  check('PWM duty_u16', Math.abs(g.pin(15).duty - 0.5) < 0.001 && g.pin(15).freq === 1000);
  check('ADC pot + temperature sensor', out.includes('1 Pin(GPIO25, mode=OUT)\nTrue\nTrue\n'), out);
  check('machine.Timer callbacks', out.endsWith('True\n0\n'), out);
  let o2 = await py(g, 'import gpiozero\n');
  check('no gpiozero on a Pico', o2.includes('ImportError'), o2);
  const gw = new GpioSim('picow');
  o2 = await py(gw, 'from machine import Pin\nled = Pin("LED", Pin.OUT)\nled.on()\nimport network, time\nw = network.WLAN(network.STA_IF)\nw.active(True)\nw.connect("x","y")\nprint(w.isconnected())\n');
  check('Pico W Pin("LED") + network', gw.level(64) === 1 && o2.includes('False'), o2);
  o2 = await py(g, 'import neopixel, machine\nnp = neopixel.NeoPixel(machine.Pin(0), 3)\nnp[1] = (255, 10, 0)\nnp.write()\n');
  check('NeoPixel write', JSON.stringify(g.neo.get(0)) === '[[0,0,0],[255,10,0],[0,0,0]]', o2);
  g.addPart({ id: 'd', type: 'dht', pins: { data: 16 }, props: { t: 31.4, h: 70 }, state: {} });
  o2 = await py(g, 'import dht, machine\ns = dht.DHT22(machine.Pin(16))\ns.measure()\nprint(s.temperature(), s.humidity())\ns2 = dht.DHT11(machine.Pin(3))\ns2.measure()\n');
  check('DHT22 + missing sensor error', o2.startsWith('31.4 70') && o2.includes('OSError'), o2);
}

console.log('Stop / KeyboardInterrupt');
{
  const g = new GpioSim('pi5');
  let t = await proc('pi5', { gpio: g });
  const run = t.p.runSource('import time\nn = 0\nwhile True:\n    n += 1\n    time.sleep(0.01)\n', 'loop.py');
  await sleep(120);
  await t.p.stop();
  await run;
  check('Ctrl+C stops a sleeping loop', t.text.includes('KeyboardInterrupt'), t.text);
  t = await proc('pi5', { gpio: g });
  t.p.runSource('import time\nwhile True:\n    try:\n        time.sleep(1)\n    except KeyboardInterrupt:\n        print("nope")\n');
  await sleep(100);
  await t.p.stop(300);
  check('a program that ignores Ctrl+C is killed', t.p.dead && t.text.includes('nope'), t.text);
  t = await proc('pi5', { gpio: g });
  t.p.runSource('while True:\n    pass\n');
  await sleep(100);
  await t.p.stop();
  check('busy loop without sleep can be stopped', !t.p.dead && t.text.includes('KeyboardInterrupt'), t.text);
}

console.log('Interactive shell');
{
  const g = new GpioSim('pico');
  const t = await proc('pico', { gpio: g });
  await t.p.replExec('x = 6 * 7');
  await t.p.replExec('x');
  await t.p.replExec('for i in range(2):\n    print(i)\n');
  await t.p.replExec('1/0');
  check('expression value printed', t.text.startsWith('42\n'), JSON.stringify(t.text));
  check('compound statement', t.text.includes('42\n0\n1\n'), JSON.stringify(t.text));
  check('error with <stdin> frame', t.text.includes('File "<stdin>", line 1') && t.text.includes('ZeroDivisionError'), t.text);
}


console.log('Circuit (wired on the canvas)');
{
  // Pi 5 → GPIO17 → 330 Ω → LED → GND, button GPIO2 → GND, MCP3008 + pot, HC-SR04, DHT22, I²C LCD
  const W = (a, ap, b, bp) => ({ id: 'w' + Math.random().toString(36).slice(2), from: { part: a, pin: ap }, to: { part: b, pin: bp }, points: [], color: '#22c55e' });
  const project = {
    parts: [
      { id: 'pi', type: 'rpi5', x: 0, y: 0, rot: 0, props: {} },
      { id: 'r1', type: 'resistor', x: 400, y: 0, rot: 0, props: { value: 330 } },
      { id: 'd1', type: 'led', x: 500, y: 0, rot: 0, props: { color: 'red' } },
      { id: 'b1', type: 'pushbutton', x: 400, y: 100, rot: 0, props: {} },
      { id: 'adc', type: 'mcp3008', x: 400, y: 200, rot: 0, props: {} },
      { id: 'pot', type: 'potentiometer', x: 520, y: 200, rot: 0, props: {} },
      { id: 'us', type: 'hc-sr04', x: 400, y: 400, rot: 0, props: {} },
      { id: 'th', type: 'dht22', x: 600, y: 400, rot: 0, props: {} },
      { id: 'lcd', type: 'lcd-i2c', x: 0, y: 500, rot: 0, props: {} },
    ],
    wires: [
      W('pi', 'GPIO17', 'r1', '1'), W('r1', '2', 'd1', 'A'), W('d1', 'C', 'pi', 'GND.1'),
      W('pi', 'GPIO2', 'b1', '1.l'), W('b1', '2.l', 'pi', 'GND.2'),
      W('adc', 'VDD', 'pi', '3V3.1'), W('adc', 'VREF', 'pi', '3V3.1'), W('adc', 'AGND', 'pi', 'GND.3'), W('adc', 'DGND', 'pi', 'GND.3'),
      W('adc', 'CLK', 'pi', 'GPIO11'), W('adc', 'DOUT', 'pi', 'GPIO9'), W('adc', 'DIN', 'pi', 'GPIO10'), W('adc', 'CS', 'pi', 'GPIO8'),
      W('pot', 'VCC', 'pi', '3V3.2'), W('pot', 'GND', 'pi', 'GND.4'), W('pot', 'SIG', 'adc', 'CH0'),
      W('us', 'VCC', 'pi', '5V.1'), W('us', 'GND', 'pi', 'GND.5'), W('us', 'TRIG', 'pi', 'GPIO23'), W('us', 'ECHO', 'pi', 'GPIO24'),
      W('th', 'VCC', 'pi', '3V3.2'), W('th', 'GND', 'pi', 'GND.6'), W('th', 'DATA', 'pi', 'GPIO4'),
      W('lcd', 'VCC', 'pi', '5V.2'), W('lcd', 'GND', 'pi', 'GND.7'), W('lcd', 'SDA', 'pi', 'GPIO2'), W('lcd', 'SCL', 'pi', 'GPIO3'),
    ],
    code: '',
  };
  const warnings = [];
  const engine = new SimEngine(project, { external: true, onWarning: (m) => warnings.push(m) });
  const res = engine.start();
  check('engine starts with a Pi board and no sketch', res.ok && res.external && engine.pins.size === 28, JSON.stringify(res));
  const g = new GpioSim('pi5');
  const hw = new CircuitHw(engine);
  g.attachHw(hw);
  const tick = () => engine.tick(performance.now());
  tick();
  const ledOn = () => engine.parts.get('d1').visual.brightness ?? engine.parts.get('d1').visual.b ?? engine.parts.get('d1').visual.level;
  let out = await py(g, 'from gpiozero import LED, Button, MCP3008, DistanceSensor\nimport adafruit_dht, board\nled = LED(17)\nled.on()\nb = Button(2)\nprint("pressed", b.is_pressed)\nprint("pot", round(MCP3008(channel=0).value, 1))\nprint("cm", round(DistanceSensor(echo=24, trigger=23).distance * 100))\nd = adafruit_dht.DHT22(board.D4)\nprint("dht", d.temperature, d.humidity)\nimport time\ntime.sleep(0.05)\n');
  tick();
  const led = engine.parts.get('d1');
  check('Python LED(17).on() lights the wired LED', engine.pins.get(17).out === 1 && (led.visual.on || led.visual.lit || led.visual.brightness > 0.2 || Object.values(led.visual).some((v) => typeof v === 'number' && v > 0.2)), JSON.stringify(led.visual));
  check('Button(2) reads the circuit (not pressed)', out.includes('pressed False'), out);
  check('MCP3008 reads the pot through the circuit', /pot 0\.5/.test(out), out);
  check('DistanceSensor reads the wired HC-SR04', out.includes('cm 100'), out);
  check('DHT22 on GPIO4 from the circuit', out.includes('dht 24'), out);
  engine.input('b1', 'press', true);
  tick();
  out = await py(g, 'from gpiozero import Button\nprint("pressed", Button(2).is_pressed)\n');
  check('pressing the button on the canvas is seen by Python', out.includes('pressed True'), out);
  engine.input('b1', 'press', false);
  tick();
  // RPi.GPIO polling an HC-SR04 echo in real time (the circuit clock follows the wall clock)
  out = await py(g, 'import RPi.GPIO as GPIO, time\nGPIO.setmode(GPIO.BCM)\nGPIO.setup(23, GPIO.OUT)\nGPIO.setup(24, GPIO.IN)\nGPIO.output(23, 1)\ntime.sleep(0.00001)\nGPIO.output(23, 0)\nt0 = time.time()\nwhile GPIO.input(24) == 0 and time.time() - t0 < 0.1:\n    start = time.time()\nwhile GPIO.input(24) == 1 and time.time() - t0 < 0.2:\n    stop = time.time()\nprint("echo", round((stop - start) * 17150))\n');
  check('RPi.GPIO echo timing loop on the circuit', /echo (8[5-9]|9[0-9]|10[0-9]|11[0-5])\b/.test(out), out);
  check('5 V on a GPIO is warned about', warnings.some((w) => /3\.3 V only/.test(w)), warnings.join('\n'));
  out = await py(g, 'from i2c_lcd import I2cLcd\nlcd = I2cLcd(0x27, 2, 16)\nlcd.putstr("Hello Pi!")\nlcd.move_to(0, 1)\nlcd.putstr("RAPTI")\n');
  const lcd = engine.parts.get('lcd').hd44780;
  const row = (r) => Array.from({ length: 16 }, (_, c) => String.fromCharCode(lcd.charAt(c, r))).join('').trimEnd();
  check('I²C LCD (PCF8574) shows the text', row(0) === 'Hello Pi!' && row(1) === 'RAPTI', JSON.stringify([row(0), row(1), out]));
  g.attachHw(null);
  engine.stop();
}
{
  // Pico: pot on GP26 (ADC0), LED on GP15
  const W = (a, ap, b, bp) => ({ id: 'w' + Math.random().toString(36).slice(2), from: { part: a, pin: ap }, to: { part: b, pin: bp }, points: [] });
  const project = {
    parts: [{ id: 'pico', type: 'pi-pico', x: 0, y: 0, rot: 0, props: {} }, { id: 'pot', type: 'potentiometer', x: 300, y: 0, rot: 0, props: {} }],
    wires: [W('pot', 'VCC', 'pico', '3V3'), W('pot', 'GND', 'pico', 'GND.1'), W('pot', 'SIG', 'pico', 'GP26')],
    code: '',
  };
  const engine = new SimEngine(project, { external: true });
  engine.start();
  const g = new GpioSim('pico');
  g.attachHw(new CircuitHw(engine));
  engine.input('pot', 'pos', 25);
  engine.tick(performance.now());
  const out = await py(g, 'from machine import ADC\nprint("adc", round(ADC(26).read_u16() / 65535, 2))\n');
  check('Pico ADC(26) reads the pot wiper from the circuit', /adc 0\.2[3-7]/.test(out), out);
  engine.stop();
}
{
  // examples wire themselves onto the canvas
  const c = defaultCircuit('pi5');
  check('default Pi circuit has the board and parts', c.parts[0].type === 'rpi5' && c.parts.length > 3 && c.wires.length > 3);
  const ex = autowire('pi5', [{ type: 'led', pins: { a: 17 }, props: { color: 'red' } }, { type: 'button', pins: { a: 2 } }, { type: 'ultrasonic', pins: { trig: 23, echo: 24 } }, { type: 'pot', pins: {}, props: { ch: 0 } }]);
  const engine = new SimEngine({ ...ex, code: '' }, { external: true });
  check('auto-wired example circuit builds', engine.start().ok);
  const nodeOf = (part, pin) => engine.nodeOf(part, pin);
  const pi = ex.parts[0].id;
  const led = ex.parts.find((p) => p.type === 'led');
  check('auto-wired LED path: GPIO17 → resistor → LED', ex.wires.some((w) => (w.from.part === pi && w.from.pin === 'GPIO17') || (w.to.part === pi && w.to.pin === 'GPIO17')) && nodeOf(led.id, 'C') === nodeOf(pi, 'GND.1'));
  check('auto-wired MCP3008 on SPI', ex.parts.some((p) => p.type === 'mcp3008') && nodeOf(ex.parts.find((p) => p.type === 'mcp3008').id, 'CLK') === nodeOf(pi, 'GPIO11'));
  engine.stop();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
