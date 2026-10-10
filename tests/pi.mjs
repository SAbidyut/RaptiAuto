// Virtual Raspberry Pi / Pico: MicroPython runtime, GPIO simulator and the Python libraries.
//   node tests/pi.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GpioSim } from '../web/src/pi/gpio.js';
import { PyProcess } from '../web/src/pi/python.js';

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

async function proc(board, opts = {}) {
  const gpio = opts.gpio || new GpioSim(board);
  let text = '';
  const p = new PyProcess({ gpio, libs: LIBS, wasmLoader, out: (t) => { text += t; }, cwd: board.startsWith('pico') ? '/' : '/home/pi', ...opts });
  await p.start();
  return { p, gpio, get text() { return text; }, clear() { text = ''; } };
}

/** Run a program in a fresh interpreter (like pressing Run); the GPIO board is kept. */
async function py(gpio, src, opts = {}) {
  const t = await proc(gpio.board, { ...opts, gpio });
  await t.p.runSource(src, opts.name || '<stdin>');
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
