// The virtual machine behind every Pi screen: board, GPIO, parts, file system and the one Python
// process that may run at a time (Terminal, Thonny and the desktop all share it).
import { GpioSim } from './gpio.js';
import { PyProcess } from './python.js';
import { VFS } from './vfs.js';
import { BOARDS } from './boards.js';
import { PI_EXAMPLES, PICO_EXAMPLES } from './examples.js';
import { newPart } from './parts.js';
import { VirtualNet } from '../net/network.js';

const PI_SEED = () => ({
  dirs: ['/home/pi/Desktop', '/home/pi/Documents', '/home/pi/Downloads', '/home/pi/Music', '/home/pi/Pictures', '/home/pi/Videos', '/home/pi/Public', '/home/pi/Templates', '/home/pi/projects', '/etc', '/boot/firmware', '/tmp', '/usr/bin', '/var/log'],
  files: {
    ...Object.fromEntries(PI_EXAMPLES.map((e) => ['/home/pi/' + e.file, e.code])),
    '/home/pi/Documents/notes.txt': 'Raspberry Pi notes\n==================\n- GPIO pins are 3.3 V. Never connect 5 V to a GPIO!\n- Use a resistor (220–330 Ω) with every LED.\n- Run "pinout" in the terminal to see the header.\n',
    '/home/pi/.bashrc': '# ~/.bashrc: executed by bash(1) for non-login shells.\nalias ll=\'ls -l\'\nexport PATH="$HOME/.local/bin:$PATH"\n',
    '/etc/os-release': 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\nHOME_URL="https://www.debian.org/"\nSUPPORT_URL="https://www.debian.org/support"\nBUG_REPORT_URL="https://bugs.debian.org/"\n',
    '/etc/hostname': 'raspberrypi\n',
    '/boot/firmware/config.txt': '# For more options and information see\n# http://rptl.io/configtxt\n\n# Uncomment some or all of these to enable the optional hardware interfaces\n#dtparam=i2c_arm=on\n#dtparam=i2s=on\n#dtparam=spi=on\n\n# Enable audio (loads snd_bcm2835)\ndtparam=audio=on\n\n# Automatically load overlays for detected cameras\ncamera_auto_detect=1\n\n# Automatically load overlays for detected DSI displays\ndisplay_auto_detect=1\n\n# Enable DRM VC4 V3D driver\ndtoverlay=vc4-kms-v3d\nmax_framebuffers=2\n\narm_64bit=1\narm_boost=1\n\n[all]\n',
  },
});

const PICO_SEED = () => ({
  dirs: ['/lib'],
  files: Object.fromEntries(PICO_EXAMPLES.filter((e) => !e.boards).map((e) => ['/' + e.file, e.code])),
});

export class PiSystem {
  constructor(board, libs) {
    this.libs = libs;
    this.listeners = new Set();
    this.outTaps = new Set();
    this.proc = null;
    this.owner = null;
    this.gpio = new GpioSim(board);
    this.net = new VirtualNet();
    this.piFs = new VFS('rapti.pi.fs.v1', PI_SEED());
    this.picoFs = new VFS('rapti.pico.fs.v1', PICO_SEED());
    this.setBoard(board, true);
  }

  get board() { return this.gpio.board; }
  get info() { return BOARDS[this.board]; }
  get isPico() { return this.gpio.isPico; }
  get fs() { return this.isPico ? this.picoFs : this.piFs; }
  get home() { return this.isPico ? '/' : '/home/pi'; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  /** Every byte a program prints, whoever started it (the board view's mini console). */
  onOut(fn) { this.outTaps.add(fn); return () => this.outTaps.delete(fn); }
  emit(what) { for (const fn of this.listeners) { try { fn(what, this); } catch (e) { console.error(e); } } }

  setBoard(board, first = false) {
    if (!first) this.killProcess();
    this.gpio.setBoard(board);
    this.initNet(board);
    this.gpio.parts = this.loadParts(board);
    this.gpio.inputsChanged();
    try { localStorage.setItem('rapti.pi.board', board); } catch (e) { /* ignore */ }
    if (!first) this.emit('board');
  }

  /** The board's network device: a Raspberry Pi is on Wi-Fi from boot; a Pico W joins from code; a Pico has none. */
  initNet(board) {
    const info = BOARDS[board];
    const isPi = info.kind === 'pi';
    if (this.netDev) { this.net.dropServers(this.netDev); this.net.mqtt.dropDevice(this.netDev); this.net.leave(this.netDev); this.net.devices.delete(this.netDev.id); }
    this.netDev = this.net.registerDevice({ id: 'pi', name: isPi ? 'Raspberry Pi' : info.name, kind: isPi ? 'pi' : 'pico', hostname: isPi ? 'raspberrypi' : 'picow', broker: isPi });
    const wifi = isPi || info.wifi;
    this.gpio.net = wifi ? this.net : null;
    this.gpio.netDev = wifi ? this.netDev : null;
    if (isPi) this.net.join(this.netDev, 'RaptiNet', 'rapti1234');
  }

  partsKey(board = this.board) { return 'rapti.pi.parts.' + (BOARDS[board].kind === 'pico' ? 'pico' : 'pi'); }

  loadParts(board) {
    try {
      const saved = JSON.parse(localStorage.getItem(this.partsKey(board)) || 'null');
      if (Array.isArray(saved)) return saved.map((p) => ({ ...p, state: {} }));
    } catch (e) { /* ignore */ }
    return BOARDS[board].kind === 'pico'
      ? [newPart('led', { a: 15 }, { color: 'red' }), newPart('button', { a: 14 }), newPart('pot', { a: 26 })]
      : [newPart('led', { a: 17 }, { color: 'red' }), newPart('led', { a: 27 }, { color: 'green' }), newPart('button', { a: 2 }), newPart('buzzer', { a: 22 })];
  }

  saveParts() {
    const data = this.gpio.parts.map(({ id, type, pins, props }) => ({ id, type, pins, props }));
    try { localStorage.setItem(this.partsKey(), JSON.stringify(data)); } catch (e) { /* ignore */ }
    this.emit('parts');
  }

  /** Replace the wiring with what an example needs. */
  wireExample(ex) {
    if (!ex.parts || !ex.parts.length) return false;
    this.gpio.parts = ex.parts.map((p) => newPart(p.type, p.pins, p.props || {}));
    this.gpio.inputsChanged();
    this.saveParts();
    return true;
  }

  /** Put the board's files back to the examples (SD card re-flash / Pico flash erase). */
  resetFs() {
    this.killProcess();
    const fs = this.fs;
    try { localStorage.removeItem(fs.key); } catch (e) { /* ignore */ }
    fs.load(this.isPico ? PICO_SEED() : PI_SEED());
    this.emit('files');
  }

  // ---------------------------------------------------------------- processes
  get running() { return !!(this.proc && !this.proc.dead && this.proc.busy); }

  /**
   * Start a fresh Python process (the previous one is stopped first).
   * opts: { out, readLine, cwd, banner, owner }
   */
  async spawn(opts) {
    this.killProcess();
    const proc = new PyProcess({
      gpio: this.gpio, libs: this.libs, files: this.fs.snapshot(this.isPico ? '/' : '/home/pi'),
      cwd: opts.cwd || this.home, banner: opts.banner, readLine: opts.readLine,
      out: (t, s) => { if (opts.out) opts.out(t, s); for (const fn of this.outTaps) fn(t, s); },
    });
    this.proc = proc;
    this.owner = opts.owner || null;
    await proc.start();
    this.emit('proc');
    this.emit('start');
    return proc;
  }

  /** Pull files the program wrote back into the file system. */
  syncBack(proc = this.proc) {
    if (!proc || proc.dead || !proc.mp) return;
    try { this.fs.merge(proc.readFiles(this.isPico ? '/' : '/home/pi'), this.isPico ? '/' : '/home/pi'); } catch (e) { /* ignore */ }
  }

  killProcess() {
    const p = this.proc;
    if (!p) return;
    this.syncBack(p);
    p.kill();
    this.proc = null;
    this.owner = null;
    if (this.netDev) { this.net.dropServers(this.netDev); this.net.mqtt.dropDevice(this.netDev); }
    this.gpio.stopProcess();
    if (this.isPico) this.gpio.reset();
    this.emit('proc');
  }

  async stop() {
    const p = this.proc;
    if (!p) return;
    await p.stop();
    this.emit('proc');
  }
}

export { PI_EXAMPLES, PICO_EXAMPLES };
