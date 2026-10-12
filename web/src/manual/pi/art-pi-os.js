// Pictures of chapter P7: the Raspberry Pi OS desktop, the file system and the Terminal.
import { K, T, R, L, P, AR, DOT, BADGE, fig, WC } from './art-pi-kit.js';
import { UI, placeScreen, screenDesktop } from './art-pi-screens.js';
import { codeLine } from './art-pi-python.js';

const CK = { kw: '#c792ea', fn: '#82aaff', num: '#f78c6c', str: '#c3e88d', cm: '#66789c', tx: '#e2e8f0', cls: '#ffcb6b' };
const G = '#7ee787', B = '#79b8ff', Y = '#fbbf24';
const win = (x, y, w, h, title, { dark = false, accent = '#475569' } = {}) => R(x, y, w, h, { fill: dark ? '#1b1d23' : '#f3f4f6', stroke: accent, rx: 7 }) + `<rect x="${x}" y="${y}" width="${w}" height="16" rx="7" fill="${dark ? '#2b2e36' : '#d8dbe2'}"/><rect x="${x}" y="${y + 8}" width="${w}" height="8" fill="${dark ? '#2b2e36' : '#d8dbe2'}"/>` + T(x + 8, y + 11.5, title, { size: 8.2, fill: dark ? '#e5e7eb' : '#1f2937', weight: 700 }) + [0, 1, 2].map((i) => `<circle cx="${x + w - 10 - i * 11}" cy="${y + 8}" r="3.4" fill="${['#ef4444', '#facc15', '#22c55e'][i]}"/>`).join('');

export function heroDesktop() {
  let s = `<defs><linearGradient id="dkh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a4a"/><stop offset=".55" stop-color="#14202f"/><stop offset="1" stop-color="#4a1a30"/></linearGradient></defs><rect x="4" y="4" width="352" height="236" rx="16" fill="url(#dkh)" stroke="#1e3a5f"/>`;
  s += `<rect x="4" y="4" width="352" height="22" rx="16" fill="#e8e8ea"/><rect x="4" y="16" width="352" height="10" fill="#e8e8ea"/>`;
  s += `<circle cx="20" cy="15" r="6.5" fill="#c51a4a"/><circle cx="42" cy="15" r="6" fill="#4285f4"/><circle cx="42" cy="15" r="2.6" fill="#fff"/><path d="M58 9 h6 l1.5 2 h6 v10 h-13.5z" fill="#4a90d9"/><rect x="78" y="8" width="14" height="13" rx="2" fill="#2d2d2d"/><path d="M81 12 l3 2.5 -3 2.5" stroke="#7ee787" stroke-width="1.2" fill="none"/>`;
  s += T(344, 19, '12:13', { size: 9, anchor: 'end', fill: '#1f2937', weight: 700 });
  s += `<path d="M18 40 h20 l-2 28 h-16z" fill="#e5e7eb" stroke="#9ca3af"/>` + T(28, 80, 'Wastebasket', { size: 7, anchor: 'middle', fill: '#fff' }) + `<path d="M18 94 h12 l3 3 h14 v18 h-29z" fill="#4a90d9"/>` + T(32, 128, 'pi', { size: 7, anchor: 'middle', fill: '#fff' });
  s += win(70, 44, 172, 118, 'pi@raspberrypi: ~', { dark: true }) + codeLine(78, 70, [['pi@raspberrypi', G], [':', CK.tx], ['~', B], [' $ ', CK.tx], ['ls', CK.tx]], 7.4) + codeLine(78, 82, [['blink.py  hello.py  Desktop', CK.tx]], 7.4) + codeLine(78, 94, [['pi@raspberrypi', G], [':', CK.tx], ['~', B], [' $ ', CK.tx], ['python3 blink.py', CK.tx]], 7.4) + codeLine(78, 106, [['LED on', CK.tx]], 7.4);
  s += win(172, 100, 176, 124, 'Thonny - /home/pi/blink.py', { accent: '#3a7bd5' }) + [0, 1, 2, 3, 4].map((i) => `<rect x="${180 + i * 24}" y="122" width="16" height="12" rx="2" fill="${['#e5e7eb', '#f2c14e', '#3b6fd8', '#2fa84f', '#d93a3a'][i]}"/>`).join('') + `<rect x="178" y="142" width="164" height="76" fill="#fff" stroke="#d1d5db"/>` + codeLine(184, 156, [['from ', CK.kw], ['gpiozero ', '#111'], ['import ', CK.kw], ['LED', CK.cls]].map(([t, c]) => [t, c === '#111' ? '#374151' : c]), 7.4) + codeLine(184, 168, [['led = LED(17)', '#374151']], 7.4) + codeLine(184, 180, [['while True:', '#7c3aed']], 7.4);
  s += win(18, 150, 120, 80, 'File Manager') + `<rect x="22" y="172" width="34" height="54" fill="#e5e7eb"/>` + [0, 1, 2].map((i) => `<path d="M64 ${176 + i * 18} h8 l2 2 h14 v10 h-24z" fill="#4a90d9"/>`).join('') + T(88, 232, '', {});
  return fig(360, 248, s, 'The Raspberry Pi OS desktop of the lab: panel, windows for Terminal, Thonny and the File Manager.');
}

export function desktopAnatomy() {
  let s = placeScreen(screenDesktop({}), 8, 8, 0.46, { H: 700, r: 28 });
  const f = (x, y) => [8 + 0.46 * x, 8 + 0.46 * y];
  const pts = [f(38, 112), f(96, 112), f(205, 112), f(282, 112), f(344, 112), f(64, 250)];
  s += pts.map(([x, y], i) => BADGE(x, y, i + 1)).join('');
  [['Raspberry menu', 'all programs, Help, Shutdown'], ['Chromium', 'the web browser'], ['Terminal', 'command line'], ['Tray', 'Bluetooth · Wi-Fi · volume'], ['Clock', 'the phone’s time'], ['Desktop icons', 'Wastebasket, your pi folder']].forEach(([a, b], i) => { const y = 34 + i * 48; s += BADGE(194, y, i + 1) + T(208, y + 4, a, { size: 11, weight: 700 }) + T(208, y + 17, b, { size: 8.8, fill: K.dim }); });
  s += T(194, 330, 'File Manager is the launcher between', { size: 8.2, fill: K.dim }) + T(194, 340, 'Chromium and Terminal.', { size: 8.2, fill: K.dim });
  return fig(360, 348, s, 'The Desktop tab. Open windows get a button next to the launchers.');
}

export function raspMenu() {
  let s = R(8, 8, 150, 232, { fill: '#f3f4f6', stroke: '#9ca3af', rx: 8 });
  const items = [['Programming', null], ['  Thonny', '#3a7bd5'], ['Internet', null], ['  Chromium', '#4285f4'], ['Accessories', null], ['  File Manager', '#4a90d9'], ['  Terminal', '#2d2d2d'], ['  Text Editor', '#9ca3af'], ['  Calculator', '#6b7280'], ['Preferences', null], ['  Raspberry Pi Configuration', '#c51a4a']];
  items.forEach(([t, c], i) => { const y = 14 + i * 16; if (c) s += `<rect x="16" y="${y + 1}" width="10" height="10" rx="2" fill="${c}"/>` + T(32, y + 10, t.trim(), { size: 8.2, fill: '#1f2937' }); else s += T(14, y + 10, t, { size: 8.2, weight: 800, fill: '#6b7280' }); });
  s += L(14, 194, 150, 194, { stroke: '#d1d5db' }) + T(20, 208, 'Help', { size: 8.4, fill: '#1f2937' }) + T(20, 224, 'Shutdown…', { size: 8.4, fill: '#1f2937' });
  s += AR(166, 214, 190, 214, { m: 'mfb', stroke: K.acc });
  s += R(194, 150, 158, 90, { fill: '#2b2e36', stroke: '#475569', rx: 10 }) + T(273, 168, 'Shutdown options', { size: 9.6, anchor: 'middle', weight: 800, fill: '#fff' }) + [['Shutdown', '#dc2626'], ['Reboot', '#334155'], ['Logout', '#334155'], ['Cancel', '#334155']].map(([t, c], i) => R(202 + (i % 2) * 74, 178 + Math.floor(i / 2) * 28, 68, 22, { fill: c, stroke: 'none', rx: 7 }) + T(236 + (i % 2) * 74, 193 + Math.floor(i / 2) * 28, t, { size: 8.8, anchor: 'middle', fill: '#fff', weight: 700 })).join('');
  s += T(273, 20, 'Tap the raspberry', { size: 10, anchor: 'middle', weight: 800, fill: K.acc }) + T(273, 36, 'in the top-left corner', { size: 10, anchor: 'middle', fill: K.ink }) + T(273, 60, 'to open this menu.', { size: 10, anchor: 'middle', fill: K.ink });
  s += T(273, 90, 'Every app also has', { size: 8.8, anchor: 'middle', fill: K.dim }) + T(273, 102, 'a launcher or an icon.', { size: 8.8, anchor: 'middle', fill: K.dim });
  return fig(360, 252, s, 'The raspberry menu groups the programs; Shutdown… asks what to do.');
}

export function windowAnatomy() {
  let s = win(20, 14, 190, 120, 'Text Editor', {});
  s += `<rect x="24" y="34" width="182" height="96" fill="#fff"/>` + T(32, 52, 'Raspberry Pi notes', { size: 8.4, fill: '#374151', mono: true }) + T(32, 64, '- GPIO pins are 3.3 V', { size: 8.4, fill: '#374151', mono: true });
  s += BADGE(24, 22, 1) + BADGE(168, 22, 2) + BADGE(182, 22, 3) + BADGE(196, 22, 4);
  s += R(20, 150, 190, 22, { fill: '#e8e8ea', stroke: '#9ca3af', rx: 6 }) + R(26, 154, 70, 14, { fill: '#cbd5e1', stroke: 'none', rx: 4 }) + T(61, 164, 'Text Editor', { size: 8, anchor: 'middle', fill: '#1f2937' }) + BADGE(112, 161, 5);
  [['Title bar', 'drag to move (tablet)'], ['Minimise', 'hide the window'], ['Maximise', 'full size (phone: always)'], ['Close', 'the window is gone'], ['Task button', 'tap: show · tap again: hide']].forEach(([a, b], i) => { const y = 24 + i * 32; s += BADGE(232, y, i + 1) + T(244, y + 3.5, a, { size: 9.6, weight: 700 }) + T(244, y + 15, b, { size: 8.4, fill: K.dim }); });
  return fig(360, 190, s.replace(/T\(/g, 'T('), 'A desktop window. On a phone every window is maximised; the buttons below the panel switch between the open ones.');
}

export function fileManagerFig() {
  let s = win(8, 8, 344, 218, 'pi');
  s += `<rect x="8" y="24" width="344" height="24" fill="#e5e7eb"/>`;
  ['◀', '▲', '⌂'].forEach((t, i) => { s += R(14 + i * 24, 28, 20, 16, { fill: '#fff', stroke: '#9ca3af', rx: 4 }) + T(24 + i * 24, 40, t, { size: 8, anchor: 'middle', fill: '#374151' }); });
  s += R(90, 28, 160, 16, { fill: '#fff', stroke: '#9ca3af', rx: 4 }) + T(96, 40, '/home/pi', { size: 8.6, fill: '#111827', mono: true }) + R(258, 28, 40, 16, { fill: '#fff', stroke: '#9ca3af', rx: 4 }) + T(278, 40, '+ folder', { size: 7.2, anchor: 'middle', fill: '#374151' }) + R(302, 28, 42, 16, { fill: '#fff', stroke: '#9ca3af', rx: 4 }) + T(323, 40, '+ file', { size: 7.2, anchor: 'middle', fill: '#374151' });
  s += `<rect x="8" y="48" width="84" height="160" fill="#eef0f4"/>`;
  ['Home', 'Desktop', 'Documents', 'Downloads', 'projects', 'Filesystem root'].forEach((t, i) => { s += T(16, 66 + i * 20, t, { size: 8.4, fill: '#1f2937', weight: i === 0 ? 800 : 500 }); });
  const names = [['Desktop', 1], ['Documents', 1], ['Downloads', 1], ['projects', 1], ['blink.py', 0], ['hello.py', 0], ['button_led.py', 0], ['servo_sweep.py', 0]];
  names.forEach(([n, d], i) => { const x = 104 + (i % 4) * 62, y = 56 + Math.floor(i / 4) * 64; s += d ? `<path d="M${x + 6} ${y + 6} h10 l3 3 h16 v20 h-29z" fill="#4a90d9"/>` : `<path d="M${x + 8} ${y + 4} h16 l7 7 v22 h-23z" fill="#fff" stroke="#9ca3af"/><text x="${x + 19}" y="${y + 26}" font-size="9" fill="#3b82f6" font-weight="800" text-anchor="middle">py</text>`; s += T(x + 18, y + 46, n.length > 11 ? n.slice(0, 10) + '…' : n, { size: 7.2, anchor: 'middle', fill: '#1f2937' }); });
  s += T(100, 200, '12 items · Free space: 22.4 GB', { size: 7.6, fill: '#6b7280' });
  s += R(222, 140, 118, 56, { fill: '#2b2e36', stroke: '#475569', rx: 8 }) + T(281, 156, 'blink.py', { size: 9, anchor: 'middle', weight: 800, fill: '#fff' }) + R(228, 164, 50, 20, { fill: '#334155', stroke: 'none', rx: 6 }) + T(253, 177.5, 'Rename', { size: 8, anchor: 'middle', fill: '#fff' }) + R(284, 164, 50, 20, { fill: '#dc2626', stroke: 'none', rx: 6 }) + T(309, 177.5, 'Delete', { size: 8, anchor: 'middle', fill: '#fff' });
  s += T(281, 212, 'touch and hold a file', { size: 8.4, anchor: 'middle', fill: K.acc, weight: 700 });
  return fig(360, 236, s, 'The File Manager: tap a folder to enter it, tap a .py file to open it in Thonny, touch and hold for Rename / Delete.');
}

export function vfsTree() {
  let s = '';
  const row = (x, y, t, c = '#cbd5e1', icon = 'd', note = '') => `<text x="${x}" y="${y}" font-size="10" fill="${c}" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="${icon === 'd' ? 700 : 500}">${icon === 'd' ? '▸ ' : '· '}${t}</text>` + (note ? T(206, y, note, { size: 8.2, fill: K.dim }) : '');
  s += T(8, 14, 'Raspberry Pi (Pi 4 / Pi 5)', { size: 10.5, weight: 800, fill: K.ok });
  const tree = [[0, '/', 'd', ''], [1, 'home/pi', 'd', 'your home folder  ( ~ )'], [2, 'blink.py  hello.py …', 'f', 'the example programs'], [2, 'Desktop', 'd', 'icons on the desktop'], [2, 'Documents  Downloads', 'd', ''], [2, 'projects', 'd', 'your own work'], [2, 'Music Pictures Videos …', 'd', ''], [1, 'boot/firmware', 'd', ''], [2, 'config.txt', 'f', 'I²C / SPI switches'], [1, 'etc', 'd', 'hostname, os-release'], [1, 'proc', 'd', 'cpuinfo, meminfo …']];
  tree.forEach(([lv, t, ic, n], i) => { s += row(10 + lv * 16, 34 + i * 16, t, lv === 0 ? K.acc : ic === 'd' ? '#e2e8f0' : '#cbd5e1', ic, n).replace(/x="(\d+)"([^>]*>▸|[^>]*>·)/, (m) => m); });
  s += L(8, 218, 352, 218, { stroke: '#1e293b' });
  s += T(8, 234, 'Raspberry Pi Pico (flash)', { size: 10.5, weight: 800, fill: K.vio });
  [[0, '/', 'd', ''], [1, 'main.py', 'f', 'runs when the Pico starts'], [1, 'lib/', 'd', 'extra modules']].forEach(([lv, t, ic, n], i) => { s += row(10 + lv * 16, 254 + i * 16, t, lv === 0 ? K.acc : '#e2e8f0', ic, n); });
  return fig(360, 308, s, 'The virtual file system. The Pi keeps its files under /home/pi (the "SD card"); a Pico has its own small flash drive that starts at /.');
}

export function pathsFig() {
  let s = '';
  s += R(8, 8, 344, 74, { fill: K.box, stroke: K.ok, rx: 10 }) + T(18, 26, 'Absolute path — starts with /', { size: 10.5, weight: 800, fill: K.ok });
  s += codeLine(18, 46, [['/home/pi/projects/', CK.cls], ['blink.py', CK.tx]], 11) + T(18, 66, 'the same from everywhere', { size: 8.8, fill: K.dim });
  s += R(8, 90, 344, 106, { fill: K.box, stroke: K.warn, rx: 10 }) + T(18, 108, 'Relative path — from where you are now (pwd)', { size: 10.5, weight: 800, fill: K.warn });
  s += codeLine(18, 128, [['pi@raspberrypi', G], [':', CK.tx], ['~/projects', B], [' $ ', CK.tx], ['python3 blink.py', CK.tx]], 8.6) + codeLine(18, 146, [['pi@raspberrypi', G], [':', CK.tx], ['~/projects', B], [' $ ', CK.tx], ['cd ..', CK.tx], ['      # one folder up', CK.cm]], 8.6) + codeLine(18, 164, [['pi@raspberrypi', G], [':', CK.tx], ['~', B], [' $ ', CK.tx], ['cd /', CK.tx], ['         # the root', CK.cm]], 8.6) + codeLine(18, 182, [['~', CK.cls], [' means /home/pi · ', CK.tx], ['.', CK.cls], [' here · ', CK.tx], ['..', CK.cls], [' the folder above', CK.tx]], 8.6);
  return fig(360, 206, s, 'Paths: absolute ones start at the root, relative ones start where you are. The prompt shows the folder you are in.');
}

export function terminalAnatomy() {
  let s = win(8, 8, 344, 176, 'pi@raspberrypi: ~', { dark: true });
  const l = [[['Linux raspberrypi 6.6.51+rpt-rpi-2712 … aarch64', '#9ca3af']], [['Type "help" to see the commands of this simulated shell.', '#6b7280']], [['pi@raspberrypi', G], [':', CK.tx], ['~', B], [' $ ', CK.tx], ['ls', CK.tx]], [['Desktop   Documents   blink.py   hello.py', CK.tx]], [['pi@raspberrypi', G], [':', CK.tx], ['~', B], [' $ ', CK.tx], ['pinctrl get 17', CK.tx]], [['17: ip    pn | lo // GPIO17 = input', CK.tx]], [['pi@raspberrypi', G], [':', CK.tx], ['~', B], [' $ ', CK.tx], ['▌', Y]]];
  l.forEach((p, i) => { s += codeLine(16, 44 + i * 16, p, 8.2); });
  s += R(8, 190, 344, 24, { fill: '#2b2e36', stroke: '#475569', rx: 6 });
  ['Ctrl+C', 'Tab', '↑', '↓', 'Ctrl+D', 'Ctrl+L', '|', '/', '-', '~'].forEach((k, i) => { const w = k.length > 2 ? 40 : 22; const xs = [14, 58, 84, 110, 136, 180, 224, 250, 276, 302]; s += R(xs[i], 194, w, 16, { fill: '#3a3d46', stroke: 'none', rx: 4 }) + T(xs[i] + w / 2, 205, k, { size: 7.4, anchor: 'middle', fill: '#e5e7eb' }); });
  s += BADGE(24, 62, 1) + BADGE(332, 78, 2) + BADGE(332, 94 + 16, 3) + BADGE(332, 196, 4);
  s += T(180, 232, '① prompt: user@host:folder ②③ command and its output ④ key bar for phone keyboards', { size: 7.8, anchor: 'middle', fill: K.dim });
  return fig(360, 242, s, 'The Terminal: type a command, press Enter. Tab completes names, ↑ ↓ bring back old commands, Ctrl+C stops a program.');
}

const chips = (x, y, w, title, color, rows) => {
  let s = R(x, y, w, 22 + rows.length * 17 + 6, { fill: K.box, stroke: color, rx: 11 }) + T(x + 10, y + 16, title, { size: 10.5, weight: 800, fill: color });
  rows.forEach(([cmd, desc], i) => { const yy = y + 34 + i * 17; s += `<text x="${x + 10}" y="${yy}" font-size="8.8" fill="#e2e8f0" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700">${cmd.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` + T(x + w - 8, yy, desc, { size: 8.2, anchor: 'end', fill: '#94a3b8' }); });
  return s;
};
export function cmdFiles() {
  const rows = [['pwd', 'where am I'], ['ls  ·  ls -l', 'list files'], ['cd folder  ·  cd ..', 'change folder'], ['mkdir  touch', 'new folder / file'], ['cp  mv  rm', 'copy · move · delete'], ['cat  head  tail', 'show a file'], ['nano file.py', 'edit a file'], ['tree  find  grep', 'look around, search'], ['wc  chmod  history', 'count · rights · old commands']];
  return fig(360, 22 + rows.length * 17 + 24, chips(8, 4, 344, 'Files and folders', K.ok, rows), 'The commands for files and folders. Names are case sensitive: Blink.py is not blink.py.');
}
export function cmdSystem() {
  const rows = [['uname -a  ·  hostname', 'which Pi is this'], ['whoami  ·  id', 'pi, the user'], ['date  ·  cal  ·  uptime', 'time and calendar'], ['free  ·  df', 'memory · disk space'], ['top  ·  ps', 'running programs'], ['lscpu  ·  neofetch', 'the CPU · a summary'], ['vcgencmd measure_temp', 'CPU temperature'], ['help  ·  clear  ·  exit', 'the command list']];
  return fig(360, 22 + rows.length * 17 + 24, chips(8, 4, 344, 'About the Pi', K.blue, rows), 'Commands that tell you about the Pi.');
}
export function cmdGpio() {
  const rows = [['pinout', 'the header, drawn in text'], ['pinctrl get 17', 'state of GPIO17'], ['pinctrl set 17 op dh', 'output, drive high'], ['pinctrl set 17 op dl', 'output, drive low'], ['pinctrl set 2 ip pu', 'input with pull-up'], ['raspi-gpio get 17', 'Pi 4 only (the Pi 5 says no)'], ['i2cdetect -y 1', 'list I²C devices']];
  const r2 = [['python3 blink.py', 'run a program'], ['python3', 'the >>> prompt (exit())'], ['python3 -c "print(1+2)"', 'one line'], ['thonny file.py', 'open it in Thonny']];
  return fig(360, 22 + rows.length * 17 + 24 + 22 + r2.length * 17 + 24, chips(8, 4, 344, 'GPIO and the board', K.warn, rows) + chips(8, 22 + rows.length * 17 + 18, 344, 'Python', K.vio, r2), 'GPIO and Python from the command line. pinctrl set changes a real (simulated) pin, so the circuit reacts.');
}
export function cmdNet() {
  const rows = [['ip  ·  ifconfig', 'addresses'], ['ping -c 3 host', 'is a host reachable'], ['curl url  ·  wget url', 'fetch a page / file'], ['nslookup host', 'the address of a name'], ['nmcli dev wifi', 'Wi-Fi networks'], ['mosquitto_pub / _sub', 'MQTT messages'], ['chromium-browser url', 'open the browser']];
  const r2 = [['a | b', 'pipe: output of a into b'], ['a ; b   ·   a && b', 'one after the other'], ['a > file  ·  a >> file', 'write / append to a file']];
  return fig(360, 22 + rows.length * 17 + 24 + 22 + r2.length * 17 + 24, chips(8, 4, 344, 'Network (the lab’s simulated one)', K.acc, rows) + chips(8, 22 + rows.length * 17 + 18, 344, 'Shell tricks', K.err, r2), 'Network commands work on the lab’s simulated network; pipes and redirection work like in a real shell.');
}

export function oneProcess() {
  let s = '';
  [['Thonny', 'Run', K.acc, 18], ['Terminal', 'python3 file.py', K.ok, 78], ['Run button', 'top bar', K.warn, 138]].forEach(([a, b, c, y]) => { s += R(8, y, 100, 48, { fill: K.box, stroke: c, rx: 10 }) + T(58, y + 21, a, { size: 11, anchor: 'middle', weight: 800, fill: c }) + T(58, y + 37, b, { size: 8.6, anchor: 'middle', fill: '#cbd5e1' }) + AR(108, y + 24, 140, 108, { m: 'mfb', stroke: c }); });
  s += R(142, 78, 92, 60, { fill: K.box2, stroke: K.vio, rx: 10 }) + T(188, 102, 'one Python', { size: 11, anchor: 'middle', weight: 800, fill: K.vio }) + T(188, 117, 'process', { size: 11, anchor: 'middle', weight: 800, fill: K.vio }) + T(188, 131, 'at a time', { size: 8.4, anchor: 'middle', fill: '#cbd5e1' });
  s += AR(234, 108, 262, 108, { m: 'mfb', stroke: K.acc }) + R(264, 78, 88, 60, { fill: '#166534', stroke: K.ok, rx: 10 }) + T(308, 102, 'GPIO pins', { size: 10.5, anchor: 'middle', weight: 800 }) + T(308, 117, '▸ circuit on', { size: 9.4, anchor: 'middle', fill: '#bbf7d0' }) + T(308, 130, 'the canvas', { size: 9.4, anchor: 'middle', fill: '#bbf7d0' });
  s += T(180, 206, 'Start a program anywhere: the previous one is stopped first.', { size: 9, anchor: 'middle', fill: K.dim });
  return fig(360, 216, s, 'Thonny, the Terminal and the Run button share one Python process. A program started from the Terminal powers the circuit too.');
}

export function piConfigFig() {
  let s = win(8, 8, 344, 232, 'Raspberry Pi Configuration');
  ['System', 'Display', 'Interfaces', 'Performance', 'Localisation'].forEach((t, i) => { s += R(14 + i * 66, 28, 64, 20, { fill: i === 2 ? '#fff' : '#e5e7eb', stroke: '#9ca3af', rx: 5 }) + T(46 + i * 66, 42, t, { size: 8, anchor: 'middle', fill: '#111827', weight: i === 2 ? 800 : 500 }); });
  [['SSH', 0], ['VNC', 0], ['SPI', 1], ['I2C', 1], ['Serial Port', 0], ['Serial Console', 0], ['1-Wire', 0], ['Remote GPIO', 0]].forEach(([t, on], i) => { const y = 62 + i * 20; s += T(24, y + 10, t + ':', { size: 8.8, fill: '#1f2937' }) + R(250, y, 44, 16, { fill: on ? '#22c55e' : '#fff', stroke: '#9ca3af', rx: 4 }) + T(272, y + 11.5, 'On', { size: 8, anchor: 'middle', fill: on ? '#fff' : '#374151' }) + R(298, y, 44, 16, { fill: on ? '#fff' : '#9ca3af', stroke: '#9ca3af', rx: 4 }) + T(320, y + 11.5, 'Off', { size: 8, anchor: 'middle', fill: on ? '#374151' : '#fff' }); });
  s += T(24, 232, 'SPI and I2C change the lines in /boot/firmware/config.txt', { size: 7.8, fill: '#6b7280' });
  return fig(360, 250, s, 'Raspberry Pi Configuration (menu ▸ Preferences). The SPI and I2C switches edit the real config.txt file of the lab.');
}

export function chromiumFig() {
  let s = win(8, 8, 344, 206, 'Chromium — Start');
  s += `<rect x="8" y="24" width="344" height="24" fill="#e5e7eb"/>` + ['◀', '▶', '⟳'].map((t, i) => T(20 + i * 20, 40, t, { size: 9, anchor: 'middle', fill: '#374151' })).join('') + R(76, 28, 266, 16, { fill: '#fff', stroke: '#9ca3af', rx: 8 }) + T(86, 39.5, 'http://localhost:5000/', { size: 8.6, fill: '#111827' });
  ['Start', 'RAPTI', 'Google', 'Wikipedia', 'Dashboard', 'localhost:5000', 'Weather'].forEach((t, i) => { const w = t.length * 5 + 12, xs = [14, 44, 90, 138, 198, 252, 316]; s += R(xs[i], 52, Math.min(w, 60), 14, { fill: '#f3f4f6', stroke: '#d1d5db', rx: 7 }) + T(xs[i] + Math.min(w, 60) / 2, 62, t.length > 11 ? 'localhost' : t, { size: 6.6, anchor: 'middle', fill: '#374151' }); });
  s += `<rect x="8" y="70" width="344" height="144" fill="#fff"/>` + T(180, 104, 'Hello from my Pi', { size: 16, anchor: 'middle', weight: 800, fill: '#111827' }) + T(180, 124, 'LED is  ON', { size: 11, anchor: 'middle', fill: '#16a34a', weight: 700 }) + R(130, 140, 100, 28, { fill: '#2563eb', stroke: 'none', rx: 8 }) + T(180, 158, 'Toggle LED', { size: 10, anchor: 'middle', fill: '#fff', weight: 700 });
  s += T(180, 196, 'a Flask page served by your own program', { size: 8.6, anchor: 'middle', fill: '#6b7280' });
  return fig(360, 224, s, 'Chromium browses the lab’s simulated network: the start page, the IoT dashboard and the web page of your own Flask or http.server program on localhost:5000.');
}
