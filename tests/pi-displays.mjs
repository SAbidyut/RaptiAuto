// Displays on the virtual Raspberry Pi / Pico: SSD1306 OLED (I²C), TM1637, MAX7219 (SPI), I²C LCD — Python drivers
// talk to the parts of the circuit like the real libraries do.   node tests/pi-displays.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GpioSim } from '../web/src/pi/gpio.js';
import { PyProcess } from '../web/src/pi/python.js';
import '../web/src/components/index.js';
import '../web/src/pi/circuit-parts.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { CircuitHw } from '../web/src/pi/circuit-hw.js';
import { autowire } from '../web/src/pi/autowire.js';

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

let live = null;
async function py(gpio, src, name = '<stdin>') {
  if (live) live.kill();
  let text = '';
  const p = new PyProcess({ gpio, libs: LIBS, wasmLoader, out: (t) => { text += t; }, cwd: gpio.board.startsWith('pico') ? '/' : '/home/pi' });
  live = p;
  await p.start();
  await p.runSource(src, name);
  p.kill();
  gpio.stopProcess();
  return text;
}

/** Builds an auto-wired circuit for `specs` and attaches it to a GpioSim. */
function rig(board, specs) {
  const c = autowire(board, specs);
  const engine = new SimEngine({ ...c, code: '' }, { external: true });
  const r = engine.start();
  const g = new GpioSim(board);
  g.attachHw(new CircuitHw(engine));
  const timer = setInterval(() => engine.tick(performance.now()), 10);
  return { engine, g, c, ok: r.ok, done: () => { clearInterval(timer); g.attachHw(null); engine.stop(); } };
}
const partOf = (r, type) => r.engine.parts.get(r.c.parts.find((p) => p.type === type).id);
const lit = (fb) => fb.reduce((a, b) => a + b, 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('SSD1306 OLED on I²C');
{
  const r = rig('pico', [{ type: 'oled', pins: {} }]);
  await sleep(50);
  let out = await py(r.g, `from machine import Pin, I2C
import ssd1306
i2c = I2C(0, sda=Pin(4), scl=Pin(5))
print([hex(a) for a in i2c.scan()])
oled = ssd1306.SSD1306_I2C(128, 64, i2c)
oled.fill(0)
oled.pixel(10, 20, 1)
oled.rect(0, 0, 128, 64, 1)
oled.text("Hello", 8, 30)
oled.show()
`);
  const d = partOf(r, 'oled-ssd1306').ssd1306;
  check('Pico: i2c.scan() finds 0x3c', out.includes("['0x3c']"), out);
  check('MicroPython ssd1306: pixel (10,20), frame and text arrive in the right place', d.fb[20 * 128 + 10] === 1 && d.fb[0] === 1 && d.fb[63 * 128 + 127] === 1 && d.fb[1 * 128 + 5] === 0 && lit(d.fb) > 300, `lit=${lit(d.fb)} ${out}`);
  const textPx = (() => { let n = 0; for (let y = 30; y < 38; y++) for (let x = 8; x < 48; x++) n += d.fb[y * 128 + x]; return n; })();
  check('text "Hello" drawn with the 8×8 framebuf font', textPx > 40 && textPx < 200, 'px=' + textPx);
  out = await py(r.g, `from machine import Pin, I2C
import ssd1306
oled = ssd1306.SSD1306_I2C(128, 64, I2C(0, sda=Pin(4), scl=Pin(5)))
oled.fill(1)
oled.show()
oled.invert(True)
oled.contrast(80)
`);
  check('fill(1), invert() and contrast() commands', lit(d.fb) === 128 * 64 && d.invert === true && Math.abs(d.contrast - 80 / 255) < 0.01, `lit=${lit(d.fb)} inv=${d.invert}`);
  r.done();
}
{
  const r = rig('pi5', [{ type: 'oled', pins: {} }]);
  await sleep(50);
  const out = await py(r.g, `import board, busio, adafruit_ssd1306
i2c = board.I2C()
oled = adafruit_ssd1306.SSD1306_I2C(128, 64, i2c, addr=0x3C)
oled.fill(0)
oled.text("Raspberry Pi", 0, 0, 1)
oled.line(0, 63, 127, 63, 1)
oled.show()
print("ok")
`);
  const d = partOf(r, 'oled-ssd1306').ssd1306;
  check('Raspberry Pi: adafruit_ssd1306 over busio / board.I2C()', out.trim() === 'ok' && lit(d.fb) > 60 && d.fb[63 * 128 + 100] === 1, out + lit(d.fb));
  const bad = await py(r.g, `import board, adafruit_ssd1306
try:
    adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3D)
except ValueError as e:
    print("ValueError", e)
`);
  check('wrong address → ValueError like the real library', bad.includes('ValueError') && bad.includes('0x3d'), bad);
  r.done();
}

console.log('TM1637, MAX7219, LCD');
{
  const r = rig('pico', [{ type: 'tm1637', pins: { clk: 2, dio: 3 } }]);
  await sleep(50);
  await py(r.g, `from machine import Pin
import tm1637
tm = tm1637.TM1637(clk=Pin(2), dio=Pin(3))
tm.number(1234)
tm.brightness(3)
`);
  const d = partOf(r, 'tm1637').tm1637;
  check('TM1637 number(1234) → segments 1 2 3 4', d.segs[0] === 0x06 && d.segs[1] === 0x5b && d.segs[2] === 0x4f && d.segs[3] === 0x66 && d.brightness === 3, JSON.stringify(Array.from(d.segs)));
  await py(r.g, `from machine import Pin
import tm1637
tm = tm1637.TM1637(clk=Pin(2), dio=Pin(3))
tm.numbers(12, 34, colon=True)
`);
  check('TM1637 numbers() with colon', d.segs[1] === (0x5b | 0x80), JSON.stringify(Array.from(d.segs)));
  await py(r.g, `from machine import Pin
import tm1637
tm = tm1637.TM1637(clk=Pin(2), dio=Pin(3))
tm.show("HELP")
`);
  check('TM1637 show("HELP")', d.segs[0] === 0x76 && d.segs[1] === 0x79 && d.segs[2] === 0x38 && d.segs[3] === 0x73, JSON.stringify(Array.from(d.segs)));
  r.done();
}
{
  const r = rig('pico', [{ type: 'max7219', pins: { din: 3, clk: 2, cs: 5 }, props: { modules: 4 } }]);
  await sleep(50);
  await py(r.g, `from machine import Pin, SPI
import max7219
spi = SPI(0, baudrate=10000000, sck=Pin(2), mosi=Pin(3))
cs = Pin(5, Pin.OUT)
d = max7219.Matrix8x8(spi, cs, 4)
d.brightness(5)
d.fill(0)
d.text("AB", 0, 0, 1)
d.pixel(31, 7, 1)
d.show()
`);
  const devs = partOf(r, 'max7219').max7219;
  const total = devs.reduce((a, m) => a + Array.from(m.rows).reduce((x, y) => x + (y.toString(2).match(/1/g) || []).length, 0), 0);
  check('MAX7219 ×4 over SPI: not in shutdown, brightness, text lights LEDs in the first two modules', devs.every((m) => !m.shutdown) && devs[0].intensity === 5 && total > 15 && Array.from(devs[0].rows).some((v) => v) && Array.from(devs[1].rows).some((v) => v), `total=${total} ${devs.map((m) => Array.from(m.rows).join(',')).join(' | ')}`);
  check('pixel(31,7) lights the last LED of the last module', (devs[3].rows[7] & 1) === 1, Array.from(devs[3].rows).join(','));
  r.done();
}
{
  const r = rig('pi5', [{ type: 'max7219', pins: { din: 10, clk: 11, cs: 8 } }]);
  await sleep(50);
  await py(r.g, `import spidev
spi = spidev.SpiDev()
spi.open(0, 0)
def send(reg, val):
    spi.xfer2([reg, val])
send(0x0C, 1)
send(0x09, 0)
send(0x0A, 7)
send(0x0B, 7)
for row in range(1, 9):
    send(row, 0xFF if row % 2 else 0x00)
spi.close()
`);
  const m = partOf(r, 'max7219').max7219[0];
  check('Raspberry Pi: spidev.xfer2 register writes (shutdown off, intensity, rows)', !m.shutdown && m.intensity === 7 && Array.from(m.rows).join(',') === '255,0,255,0,255,0,255,0', `${m.shutdown} ${m.intensity} ${Array.from(m.rows)}`);
  r.done();
}
{
  const r = rig('pi5', [{ type: 'lcd', pins: {} }, { type: 'pot', pins: {}, props: { ch: 0, value: 0.5 } }]);
  await sleep(50);
  const out = await py(r.g, `from RPLCD.i2c import CharLCD
lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
lcd.write_string("RPLCD works")
lcd.cursor_pos = (1, 0)
lcd.write_string("line two")
import spidev
spi = spidev.SpiDev()
spi.open(0, 0)
r = spi.xfer2([1, (8 + 0) << 4, 0])
print("adc", ((r[1] & 3) << 8) | r[2])
`);
  const lcd = partOf(r, 'lcd-i2c').hd44780;
  const row = (n) => Array.from({ length: 16 }, (_, c) => String.fromCharCode(lcd.charAt(c, n))).join('').trimEnd();
  check('RPLCD CharLCD on the I²C LCD', row(0) === 'RPLCD works' && row(1) === 'line two', row(0) + '|' + row(1) + out);
  check('spidev reads an MCP3008 (pot at 50 % → about 512)', /adc (4[89]\d|5[0-3]\d)/.test(out), out);
  r.done();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
