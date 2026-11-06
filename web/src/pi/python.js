// Runs Python on the virtual Raspberry Pi: MicroPython 1.29 compiled to WebAssembly (see
// tools/micropython). time.sleep(), input() and long loops hand control back to the browser, so
// the board, the parts and the UI keep running while a program runs.
import { loadMicroPython } from '../../vendor/micropython/micropython.mjs';
import { PICO_W_LED } from './gpio.js';
import { netBridge } from './netbridge.js';

const PI_ONLY = ['RPi/__init__.py', 'RPi/GPIO.py', 'gpiozero.py', 'board.py', 'adafruit_dht.py', 'signal.py', 'smbus2.py', 'smbus.py', 'serial.py', 'flask.py', 'http/__init__.py', 'http/server.py',
  'paho/__init__.py', 'paho/mqtt/__init__.py', 'paho/mqtt/client.py', 'paho/mqtt/publish.py', 'paho/mqtt/subscribe.py', 'psutil.py', 'threading.py',
  'adafruit_ssd1306.py', 'busio.py', 'spidev.py', 'RPLCD/__init__.py', 'RPLCD/i2c.py'];
const PICO_ONLY = ['machine.py', 'rp2.py', 'network.py', 'dht.py', 'urequests.py', 'umqtt/__init__.py', 'umqtt/simple.py', 'ntptime.py', 'pico_i2c_lcd.py', 'lcd_api.py'];

let wasmModule = null;
/** Compile micropython.wasm once; every program then gets a fresh instance in a few ms. */
export function compileWasm(loader) {
  if (!wasmModule) {
    wasmModule = (async () => {
      const bytes = loader ? await loader() : await (await fetch('micropython.wasm')).arrayBuffer();
      return WebAssembly.compile(bytes);
    })();
    wasmModule.catch(() => { wasmModule = null; });
  }
  return wasmModule;
}

/** The JavaScript side of the _rpi_js module that the Python libraries call. */
function bridge(gpio, proc) {
  const pin = (n) => (n === 'LED' ? PICO_W_LED : n);
  return {
    board: () => gpio.board,
    setup: (n, mode, pull) => gpio.setup(pin(n), mode, pull),
    set_pull: (n, pull) => gpio.setPull(pin(n), pull),
    write: (n, v) => gpio.write(pin(n), v),
    read: (n) => gpio.read(pin(n)),
    level: (n) => gpio.level(pin(n)),
    duty: (n) => gpio.duty(pin(n)),
    pwm: (n, f, d) => gpio.pwm(pin(n), f, d),
    pwm_off: (n) => gpio.pwmOff(pin(n)),
    blink: (n, on, off, count, onV, offV, fi, fo) => gpio.blink(pin(n), on, off, count, onV, offV, fi, fo),
    stop_bg: (n) => gpio.stopBg(pin(n)),
    watch: (n, edge, bounce) => gpio.watch(pin(n), edge, bounce),
    watch_cb: (n, cid) => gpio.watchCb(pin(n), cid),
    unwatch: (n) => gpio.unwatch(pin(n)),
    detected: (n) => gpio.detected(pin(n)),
    release: (n) => gpio.release(pin(n)),
    in_use: (n) => (gpio.pins.get(pin(n)) || {}).used ? 1 : 0,
    claim: (n, owner) => { const p = gpio.pins.get(pin(n)); if (p) p.owner = owner; },
    timer: (cid, ms, periodic) => gpio.timer(cid, ms, periodic),
    timer_stop: (id) => gpio.timerStop(id),
    next_event: () => gpio.nextEvent(),
    event_arg: () => gpio.evArg,
    adc: (ch) => gpio.adc(ch),
    mcp3008: (ch) => gpio.mcp3008(ch),
    light: (n) => gpio.light(n),
    distance: (n) => gpio.distance(n),
    dht: (n, which) => gpio.dht(n, which),
    neo: (n, count, hex) => gpio.neoWrite(pin(n), count, hex),
    bootsel: () => gpio.bootsel,
    cpu_temp: () => gpio.cpuTemp(),
    wifi: (state, ssid) => { gpio.wifiState = { state, ssid }; gpio.changed(); },
    // a UART wired to an Arduino on the canvas talks to it; otherwise the text shows in the shell
    uart_write: (id, s) => { if (!gpio.uartWrite(id, s) && !gpio.uartWired(id)) proc.write(s); },
    uart_wired: (id) => gpio.uartWired(id),
    uart_any: (id) => gpio.uartAny(id),
    uart_read: (id, n) => gpio.uartRead(id, n),
    uart_readline: (id, partial) => gpio.uartReadLine(id, partial),
    uart_has_line: (id) => (gpio.uartHasLine(id) ? 1 : 0),
    i2c_has: (addr) => gpio.i2cHas(addr),
    i2c_scan: () => gpio.i2cScan(),
    i2c_write: (addr, hex) => gpio.i2cWrite(addr, hex),
    i2c_read: (addr, n) => gpio.i2cRead(addr, n),
    spi_xfer: (sck, mosi, hex) => gpio.spiXfer(sck, mosi, hex),
    disp_tm1637: (clk, dio, hex, bright, on) => gpio.dispTm1637(clk, dio, hex, bright, on),
    ...netBridge(gpio),
  };
}

const RUN_WRAPPER = (path) => `
import _rpi_boot as __rb
__rb.start()
try:
    exec(compile(open(${JSON.stringify(path)}).read(), ${JSON.stringify(path)}, 'exec'))
except BaseException as __e:
    __rb.report(__e)
del __rb
`;

const SRC_WRAPPER = (src, name) => `
import _rpi_boot as __rb
__rb.start()
try:
    exec(compile(${JSON.stringify(src)}, ${JSON.stringify(name)}, 'exec'))
except BaseException as __e:
    __rb.report(__e)
del __rb
`;

const REPL_WRAPPER = (src) => `
import _rpi_boot as __rb
try:
    exec(compile(${JSON.stringify(src)}, '<stdin>', 'single'))
except BaseException as __e:
    __rb.report(__e, True)
del __rb
`;

const BOOT_PY = `
import sys, io
_status = [0]
def start():
    _status[0] = 0
def report(e, keep=False):
    if isinstance(e, SystemExit):
        code = e.value if hasattr(e, 'value') else (e.args[0] if e.args else None)
        if code not in (None, 0):
            if not isinstance(code, int):
                print(code, file=sys.stderr)
            _status[0] = 1
        return
    _status[0] = 2 if isinstance(e, KeyboardInterrupt) else 1
    s = io.StringIO()
    sys.print_exception(e, s)
    lines = s.getvalue().split('\\n')
    out = lines if keep else [l for l in lines if '"<stdin>"' not in l]
    sys.stderr.write('\\n'.join(out))
def status():
    return _status[0]
`;

/**
 * One Python process (a fresh interpreter). out(text, stream) receives stdout/stderr text;
 * readLine(prompt) must return a Promise of the typed line.
 */
// strict UTF-8: a binary file (e.g. bytes([0, 255])) must not be stored as cut-off text
const utf8 = new TextDecoder('utf-8', { fatal: true });

export class PyProcess {
  constructor({ gpio, libs, out, readLine, files, cwd = '/home/pi', banner, wasmLoader, heap = 6 << 20 }) {
    this.gpio = gpio;
    this.libs = libs || {};
    this.out = out || (() => {});
    this.readLine = readLine || (async () => '');
    this.files = files || {};
    this.cwd = cwd;
    this.banner = banner;
    this.wasmLoader = wasmLoader;
    this.heap = heap;
    this.dead = false;
    this.busy = false;
    this.queue = Promise.resolve();
    this.pendingRead = null;
    this.outBuf = '';
    this.errBuf = '';
  }

  async start() {
    const wasm = await compileWasm(this.wasmLoader);
    const dec = new TextDecoder();
    const decErr = new TextDecoder();
    const module = {
      instantiateWasm: (imports, receive) => {
        WebAssembly.instantiate(wasm, imports).then((inst) => receive(inst, wasm));
        return {};
      },
      locateFile: (f) => f,
      print: () => {},
      printErr: () => {},
    };
    this.mp = await loadMicroPython({
      heapsize: this.heap,
      pystack: 4096,
      linebuffer: false,
      stdout: (b) => this.emit(dec.decode(b, { stream: true }), 'out'),
      stderr: (b) => this.emit(decErr.decode(b, { stream: true }), 'err'),
      module,
    });
    const M = this.mp._module;
    this.M = M;
    M.raptiPending = () => (this.dead ? 0 : this.gpio.pending());
    M.raptiShouldYield = () => this.gpio.shouldYield();
    M.raptiReadLine = (prompt) => {
      this.flush();
      return new Promise((resolve) => {
        this.pendingRead = resolve;
        Promise.resolve(this.readLine(prompt)).then((line) => { if (this.pendingRead === resolve) { this.pendingRead = null; resolve(line); } });
      });
    };
    this.mp.registerJsModule('_rpi_js', bridge(this.gpio, this));
    const FS = this.mp.FS;
    const pico = this.gpio.isPico;
    // the simulator's own modules live in /rlib (after the user's folders on sys.path)
    FS.mkdirTree('/rlib/RPi');
    for (const [name, src] of Object.entries(this.libs)) {
      if (pico && PI_ONLY.includes(name)) continue;
      if (!pico && PICO_ONLY.includes(name)) continue;
      const slash = name.lastIndexOf('/');
      if (slash > 0) { try { FS.mkdirTree('/rlib/' + name.slice(0, slash)); } catch (e) { /* exists */ } }
      FS.writeFile('/rlib/' + name, src);
    }
    FS.writeFile('/rlib/_rpi_boot.py', BOOT_PY);
    this.writeFiles(this.files);
    try { FS.mkdirTree(this.cwd); } catch (e) { /* exists */ }
    await this.exec(`import sys, os, builtins, _rapti\nsys.path.append('/rlib')\nos.chdir(${JSON.stringify(this.cwd)})\nbuiltins.input = _rapti.input\nimport _rpi_hw\n`);
    // callbacks (button IRQs, timers) also run while no code is running, e.g. at the >>> prompt
    this.idleT = setInterval(() => { if (!this.dead && !this.busy && this.gpio.pending()) this.exec('_rpi_hw._dispatch(0)'); }, 15);
    return this;
  }

  writeFiles(files) {
    const FS = this.mp.FS;
    for (const [path, data] of Object.entries(files)) {
      const dir = path.slice(0, path.lastIndexOf('/'));
      if (dir) try { FS.mkdirTree(dir); } catch (e) { /* exists */ }
      try { FS.writeFile(path, data); } catch (e) { /* ignore */ }
    }
  }

  /** Did the program delete this file? (a binary file still exists but is not read back as text) */
  gone(p) { try { this.mp.FS.stat(p); return false; } catch (e) { return true; } }

  /** Files under root as { path: text } (to save what a program wrote). */
  readFiles(root) {
    const FS = this.mp.FS;
    const out = {};
    const walk = (dir) => {
      let names = [];
      try { names = FS.readdir(dir); } catch (e) { return; }
      for (const n of names) {
        if (n === '.' || n === '..') continue;
        const p = (dir === '/' ? '' : dir) + '/' + n;
        let st;
        try { st = FS.stat(p); } catch (e) { continue; }
        if (FS.isDir(st.mode)) { if (p !== '/rlib' && p !== '/proc' && p !== '/dev' && p !== '/tmp') walk(p); }
        else { try { out[p] = utf8.decode(FS.readFile(p)); } catch (e) { /* binary: stays in the interpreter only */ } }
      }
    };
    walk(root);
    return out;
  }

  emit(text, stream) {
    if (!text) return;
    if (stream === 'err') { this.flushOut(); this.errBuf += text; } else { this.flushErr(); this.outBuf += text; }
    if (!this.flushT) this.flushT = setTimeout(() => this.flush(), 16);
  }

  flushOut() {
    if (!this.outBuf) return;
    let t = this.outBuf;
    this.outBuf = '';
    if (this.banner && t.includes('Raspberry Pi with RaptiAuto')) t = t.replace(/MicroPython v[\d.]+[^\n]*Raspberry Pi with RaptiAuto/, this.banner);
    this.out(t, 'out');
  }
  flushErr() { if (this.errBuf) { const t = this.errBuf; this.errBuf = ''; this.out(t, 'err'); } }
  flush() { clearTimeout(this.flushT); this.flushT = 0; this.flushOut(); this.flushErr(); }

  write(text) { this.emit(String(text), 'out'); }

  /** Run Python source at the top level (__main__). Resolves when it finishes. */
  exec(code) {
    const run = async () => {
      if (this.dead) return;
      const M = this.M;
      const len = M.lengthBytesUTF8(code);
      const buf = M._malloc(len + 1);
      M.stringToUTF8(code, buf, len + 1);
      const value = M._malloc(12);
      this.busy = true;
      this.gpio.busy = true;
      try {
        await M.ccall('mp_js_do_exec', 'null', ['pointer', 'number', 'pointer'], [buf, len, value], { async: true });
      } finally {
        this.busy = false;
        this.gpio.busy = false;
        if (!this.dead) { M._free(buf); M._free(value); }
        this.flush();
      }
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  /** Run a file that is already in the interpreter's file system. */
  async runFile(path) {
    await this.exec(RUN_WRAPPER(path));
    return this.status();
  }

  async runSource(src, name = '<stdin>') {
    await this.exec(SRC_WRAPPER(src, name));
    return this.status();
  }

  async status() {
    if (this.dead) return 2;
    try { return this.mp.pyimport('_rpi_boot').status(); } catch (e) { return 1; }
  }

  // ---------------------------------------------------------------- interactive shell (>>>)
  /** Run one statement typed at the >>> prompt; expression values are printed like a REPL. */
  async replExec(src) {
    this.repl = true;
    await this.exec(REPL_WRAPPER(src));
  }

  /** Ctrl+C: KeyboardInterrupt in the running code. */
  interrupt() {
    if (this.dead) return;
    if (this.pendingRead) { const r = this.pendingRead; this.pendingRead = null; this.M._mp_sched_keyboard_interrupt(); r(''); return; }
    if (this.busy) this.M._mp_sched_keyboard_interrupt();
  }

  /** Stop: KeyboardInterrupt, and if the program ignores it, throw the interpreter away. */
  async stop(graceMs = 1200) {
    if (this.dead) return;
    if (this.busy) {
      this.interrupt();
      const done = await Promise.race([this.queue.then(() => true, () => true), new Promise((r) => setTimeout(() => r(false), graceMs))]);
      if (!done) this.kill();
    }
  }

  kill() {
    if (this.dead) return;
    this.flush();
    this.dead = true;
    clearInterval(this.idleT);
    if (this.M) this.M.raptiDead = true;
    if (this.pendingRead) { const r = this.pendingRead; this.pendingRead = null; r(''); }
    this.mp = null;
    this.M = null;
  }
}
