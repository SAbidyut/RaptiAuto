// Wi-Fi for the Arduino side: WiFi / WiFiMulti, IPAddress, WiFiClient (+Secure), WiFiServer, the
// ESP32 WebServer / ESP8266WebServer, WiFiUDP, ESPmDNS and the ESP object. They talk to the virtual
// network (src/net): the board joins the simulated router, gets an IP, can call the simulated internet
// and serves web pages to the IoT tab's browser. Everything runs in the sketch's virtual time.
import { addLibrary, defineClass } from './registry.js';
import { cstr, Ptr, AStr } from '../lang/values.js';
import { HardwareSerial, PRINT_META, PrintMixin } from '../lang/core.js';
import { VirtualNet, WL, NETWORKS } from '../../net/network.js';

// ------------------------------------------------------------------ the network / device of a board
const rootOf = (hw) => hw.root || hw;
const DEVICES = new WeakMap();
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const hex = (n, w = 2) => n.toString(16).padStart(w, '0');

/** The VirtualNet of the simulation (the editor's, so the IoT tab sees it; a private one for headless runs). */
export function netOf(hw) {
  const r = rootOf(hw);
  if (!r.net) r.net = (r.opts && r.opts.net) || new VirtualNet();
  return r.net;
}

/** This board as a device on the network (created on first use, offline until it joins Wi-Fi). */
export function devOf(hw, board) {
  let d = DEVICES.get(hw);
  if (d) return d;
  const net = netOf(hw);
  const id = hw.boardPart ? hw.boardPart.id : 'board';
  const fam = board.family === 'esp8266' ? 'esp8266' : board.family === 'esp32' ? 'esp32' : 'arduino';
  d = net.registerDevice({ id, name: (hw.label || board.name), kind: fam, hostname: '' });
  const m = d.mac;
  d.hostname = fam === 'esp8266' ? `ESP-${hex(m[3])}${hex(m[4])}${hex(m[5])}`.toUpperCase() : fam === 'esp32' ? `esp32-${hex(m[3])}${hex(m[4])}${hex(m[5])}` : `arduino-${hex(m[4])}${hex(m[5])}`;
  net.leave(d);
  net.dropServers(d);
  d.apOn = false; d.apIp = '';
  net.mqtt.dropDevice(d);
  d.bt = null;
  DEVICES.set(hw, d);
  if (hw.addCleanup) hw.addCleanup(() => { net.mqtt.dropDevice(d); net.leave(d); net.dropServers(d); d.apOn = false; d.bt = null; net.changed(); });
  return d;
}

const bytes = (s) => { const a = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 255); return a; };
const text = (v) => (v === undefined || v === null ? '' : cstr(v));

/** Time of a network operation in µs, e.g. 30 ms: the sketch really waits for it. */
function* wait(rt, us) { yield* rt.waitUntil(rt.t + us); }

// ------------------------------------------------------------------ IPAddress
export class IPAddress {
  constructor(a = 0, b = 0, c = 0, d = 0) {
    if (b === 0 && c === 0 && d === 0 && a > 255) { this[0] = a & 255; this[1] = (a >>> 8) & 255; this[2] = (a >>> 16) & 255; this[3] = (a >>> 24) & 255; return; }
    this[0] = a & 255; this[1] = b & 255; this[2] = c & 255; this[3] = d & 255;
  }
  static parse(s) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim());
    return m ? new IPAddress(+m[1], +m[2], +m[3], +m[4]) : null;
  }
  toStr() { return `${this[0]}.${this[1]}.${this[2]}.${this[3]}`; }
  printTo() { return this.toStr(); }
  toString() { return this.toStr(); }
  valueOf() { return ((this[0]) | (this[1] << 8) | (this[2] << 16) | (this[3] << 24)) >>> 0; }
  fromString(s) { const p = IPAddress.parse(cstr(s)); if (!p) return 0; for (let i = 0; i < 4; i++) this[i] = p[i]; return 1; }
  isSet() { return this.valueOf() !== 0 ? 1 : 0; }
  at(i) { return i >= 0 && i < 4 ? this[i] : 0; }
  setAt(i, v) { if (i >= 0 && i < 4) this[i] = v & 255; }
}
const ipOf = (s) => IPAddress.parse(s || '') || new IPAddress();
const hostOf = (h) => (h instanceof IPAddress ? h.toStr() : text(h));

// ------------------------------------------------------------------ WiFi
const ENC = { open: 0, WPA2: 3 };

class WiFiLib {
  constructor(rt, hw, board) {
    this.rt = rt; this.hw = hw; this.board = board;
    this.esp = board.family === 'esp32' || board.family === 'esp8266';
    this.m = 0; this.state = this.board.family === 'esp32' ? 255 : WL.IDLE; this.pending = null; this.saved = null;
    this.scan = []; this.cfg = null; this.hostname_ = '';
  }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }

  _poll() {
    const p = this.pending;
    if (!p || this.rt.t < p.t0 + p.dur) return;
    this.pending = null;
    const net = this.net, dev = this.dev;
    if (this.cfg && this.cfg.ip) dev.ip = this.cfg.ip.toStr();
    const r = net.join(dev, p.ssid, p.pass);
    this.state = r.status;
    if (r.status === WL.CONNECTED) {
      if (this.cfg && this.cfg.ip) dev.ip = this.cfg.ip.toStr();
      this.saved = { ssid: p.ssid, pass: p.pass };
    } else {
      this.hw.warn(`WiFi: could not join "${p.ssid}" — ${r.reason}.`, null, 'wifi-fail:' + p.ssid);
    }
  }

  begin(ssid, pass) { return this._begin(ssid, pass); }
  _begin(ssid, pass) {
    let s = ssid === undefined ? null : text(ssid), p = pass === undefined || typeof pass === 'number' ? '' : text(pass);
    if (s === null) {
      if (!this.saved) { this.hw.warn('WiFi.begin() without a network name: no Wi-Fi credentials are saved yet — give it the SSID and password.', null, 'wifi-nosaved'); this.state = WL.DISCONNECTED; return this.state; }
      s = this.saved.ssid; p = this.saved.pass;
    }
    if (this.m === 2) this.rt.warnOnce('wifi-mode', 'WiFi.begin() while the mode is WIFI_AP: the station interface is off — call WiFi.mode(WIFI_STA) or WIFI_AP_STA.');
    const net = this.net, dev = this.dev;
    if (dev.connected) net.leave(dev);
    const known = NETWORKS.find((n) => n.ssid === s);
    const bad = !net.opts.router || (!known && net.opts.strict) || (known && known.pass !== p);
    const dur = bad ? 3500000 : 1200000 + (hash(s) % 900) * 1000;
    this.pending = { t0: this.rt.t, dur, ssid: s, pass: p };
    this.state = WL.IDLE;
    this.rt.t += 300;
    return this.state;
  }
  * beginBlocking(ssid, pass) {
    this._begin(ssid, pass);
    const p = this.pending;
    if (p) yield* this.rt.waitUntil(p.t0 + p.dur);
    this._poll();
    return this.state;
  }

  status() {
    this._poll();
    const net = this.net, dev = this.dev;
    if (this.state === WL.CONNECTED && !net.online(dev)) this.state = WL.CONNECTION_LOST;
    else if (this.state === WL.CONNECTION_LOST && net.online(dev)) this.state = WL.CONNECTED;
    this.rt.t += 5;
    return this.state;
  }
  isConnected() { return this.status() === WL.CONNECTED ? 1 : 0; }
  disconnect(off) { this.pending = null; if (this.dev.connected) this.net.leave(this.dev); this.state = WL.DISCONNECTED; this.rt.t += 1000; return 1; }
  reconnect() { if (this.saved) { this._begin(this.saved.ssid, this.saved.pass); return 1; } return 0; }
  mode(m) { if (m !== undefined) { this.m = m; if (m === 0) this.disconnect(); this.rt.t += 100; } return 1; }
  getMode() { return this.m; }
  setSleep() { return 1; }
  setAutoReconnect() { return 1; }
  persistent() {}
  setTxPower() { return 1; }
  setHostname(n) { const d = this.dev; d.hostname = text(n); return 1; }
  hostname(n) { if (n !== undefined) this.setHostname(n); return new AStr(this.dev.hostname); }
  getHostname() { return this.dev.hostname; }
  config(ip, gw, sn, dns) { this.cfg = { ip: ip instanceof IPAddress ? ip : null }; return 1; }
  connected() { return this.isConnected(); }

  localIP() { this._poll(); return this.net.online(this.dev) && this.dev.ip ? ipOf(this.dev.ip) : new IPAddress(); }
  gatewayIP() { return this.net.online(this.dev) ? new IPAddress(192, 168, 1, 1) : new IPAddress(); }
  subnetMask() { return this.net.online(this.dev) ? new IPAddress(255, 255, 255, 0) : new IPAddress(); }
  dnsIP() { return this.net.online(this.dev) ? new IPAddress(192, 168, 1, 1) : new IPAddress(); }
  broadcastIP() { return new IPAddress(192, 168, 1, 255); }
  macAddress(buf) {
    const d = this.dev;
    if (buf !== undefined && buf !== null) { const a = buf instanceof Ptr ? buf.a : buf, o = buf instanceof Ptr ? buf.i : 0; for (let i = 0; i < 6; i++) a[o + i] = d.mac[i]; }
    return new AStr(this.net.macString(d, ':'));
  }
  SSID(i) {
    if (i === undefined) return new AStr(this.net.online(this.dev) ? this.dev.ssid : '');
    const s = this.scan[i]; return new AStr(s ? s.ssid : '');
  }
  RSSI(i) {
    if (i === undefined) return this.net.online(this.dev) ? this.dev.rssi : 0;
    const s = this.scan[i]; return s ? s.rssi : 0;
  }
  BSSIDstr(i) {
    const s = i === undefined ? this.net.scan().find((n) => n.ssid === this.dev.ssid) : this.scan[i];
    return new AStr(s ? s.bssid.map((b) => hex(b)).join(':').toUpperCase() : '');
  }
  channel(i) { const s = i === undefined ? this.net.scan().find((n) => n.ssid === this.dev.ssid) : this.scan[i]; return s ? s.ch : 0; }
  encryptionType(i) { const s = this.scan[i]; if (!s) return 255; const open = s.enc === 'open'; return this.board.family === 'esp8266' ? (open ? 7 : 4) : (open ? ENC.open : ENC.WPA2); }
  * scanNetworks() {
    yield* wait(this.rt, 1800000);
    this.scan = this.net.scan();
    this.state = this.state === WL.IDLE ? WL.IDLE : this.state;
    return this.scan.length;
  }
  scanComplete() { return this.scan.length; }
  scanDelete() { this.scan = []; }
  isHidden() { return 0; }

  softAP(ssid, pass) {
    const p = text(pass || '');
    if (pass !== undefined && p.length > 0 && p.length < 8) { this.hw.warn('WiFi.softAP(): the password must be at least 8 characters (or empty for an open network) — the access point was NOT started.', null, 'softap-pass'); return 0; }
    const d = this.dev; d.apOn = true; d.apIp = '192.168.4.1'; d.apSsid = text(ssid); this.net.changed();
    if (this.m === 0) this.m = 2;
    this.rt.t += 500;
    return 1;
  }
  softAPIP() { return this.dev.apOn ? new IPAddress(192, 168, 4, 1) : new IPAddress(); }
  softAPdisconnect() { const d = this.dev; d.apOn = false; this.net.changed(); return 1; }
  softAPgetStationNum() { return this.dev.apOn ? 1 : 0; }
  softAPConfig() { return 1; }
  onEvent() { return 0; }
  firmwareVersion() { return new AStr('1.5.0'); }
  setAutoConnect() { return 1; }
}

const WIFI_METHODS = (esp32) => ({
  begin: { ret: esp32 ? 'int' : 'int', args: ['raw', 'raw', 'raw', 'raw'] }, status: { ret: 'int' }, isConnected: { ret: 'bool' }, connected: { ret: 'bool' },
  disconnect: { ret: 'bool' }, reconnect: { ret: 'bool' }, mode: { ret: 'bool' }, getMode: { ret: 'int' }, setSleep: { ret: 'bool' }, setAutoReconnect: { ret: 'bool' },
  persistent: { ret: 'void' }, setTxPower: { ret: 'bool' }, setHostname: { ret: 'bool', args: ['str'] }, hostname: { ret: 'String', args: ['raw'] }, getHostname: { ret: 'cstr' },
  config: { ret: 'bool', args: ['raw', 'raw', 'raw', 'raw'] }, localIP: { ret: 'IPAddress' }, gatewayIP: { ret: 'IPAddress' }, subnetMask: { ret: 'IPAddress' },
  dnsIP: { ret: 'IPAddress' }, broadcastIP: { ret: 'IPAddress' }, macAddress: { ret: 'String', args: ['raw'] }, SSID: { ret: 'String' }, RSSI: { ret: 'long' },
  BSSIDstr: { ret: 'String' }, channel: { ret: 'int' }, encryptionType: { ret: 'int' }, scanNetworks: { ret: 'int', gen: true }, scanComplete: { ret: 'int' },
  scanDelete: { ret: 'void' }, isHidden: { ret: 'bool' }, softAP: { ret: 'bool', args: ['raw', 'raw'] }, softAPIP: { ret: 'IPAddress' }, softAPdisconnect: { ret: 'bool' },
  softAPgetStationNum: { ret: 'int' }, softAPConfig: { ret: 'bool' }, onEvent: { ret: 'int', args: ['raw'] }, firmwareVersion: { ret: 'String' }, setAutoConnect: { ret: 'bool' },
});

class WiFiMultiLib {
  constructor(rt, hw, board) { this.rt = rt; this.hw = hw; this.board = board; this.aps = []; }
  addAP(ssid, pass) { this.aps.push({ ssid: text(ssid), pass: text(pass || '') }); return 1; }
  * run(timeout) {
    const wifi = this.wifi();
    if (wifi.status() === WL.CONNECTED) return WL.CONNECTED;
    const net = wifi.net;
    // the strongest known network that is in range (and whose password is right)
    const inRange = net.scan();
    const cand = this.aps.map((a) => ({ a, n: inRange.find((n) => n.ssid === a.ssid) })).filter((x) => x.n).sort((p, q) => q.n.rssi - p.n.rssi)[0];
    if (!cand) { yield* wait(this.rt, 2000000); return WL.DISCONNECTED; }
    wifi._begin(cand.a.ssid, cand.a.pass);
    yield* this.rt.waitUntil(wifi.pending.t0 + wifi.pending.dur);
    wifi._poll();
    return wifi.state;
  }
  wifi() { return this.hw.__wifi; }
}

// ------------------------------------------------------------------ Stream over a connection
const PROTO = HardwareSerial.prototype;
export class NetStream {
  constructor(rt) { this.rt = rt; this.rx = []; this.timeout = 1000; this._f32 = false; }
  _fill() {}
  available() { this._fill(); return this.rx.length; }
  read() { this._fill(); return this.rx.length ? this.rx.shift() : -1; }
  peek() { this._fill(); return this.rx.length ? this.rx[0] : -1; }
  setTimeout(v) { this.timeout = v; }
  getTimeout() { return this.timeout; }
  * timedRead() {
    const ok = yield* this.rt.waitFor(() => { this._fill(); return this.rx.length > 0; }, this.rt.t + this.timeout * 1000);
    return ok ? this.rx.shift() : -1;
  }
  * timedPeek() {
    const ok = yield* this.rt.waitFor(() => { this._fill(); return this.rx.length > 0; }, this.rt.t + this.timeout * 1000);
    return ok ? this.rx[0] : -1;
  }
  write(v, len) {
    if (typeof v === 'number') return this._write(String.fromCharCode(v & 255));
    if (len !== undefined) {
      const a = v instanceof Ptr ? v.a : v, off = v instanceof Ptr ? v.i : 0;
      let s = '';
      for (let i = 0; i < len; i++) { const c = typeof a === 'string' ? a.charCodeAt(off + i) : a[off + i]; s += String.fromCharCode((c | 0) & 255); }
      return this._write(s);
    }
    return this._write(cstr(v));
  }
}
for (const k of ['peekNextDigit', 'parseInt', 'parseFloat', 'readString', 'readStringUntil', 'readBytes', 'readBytesUntil', 'find', 'findUntil']) NetStream.prototype[k] = PROTO[k];
Object.assign(NetStream.prototype, PrintMixin);
NetStream.prototype.printf = function printf(fmt, ...args) { return this._write(PROTO.printf.call({ _write: (s) => s, board: { arch: 'xtensa' } }, fmt, ...args)); };

const STREAM_METHODS = {
  ...PRINT_META,
  write: { ret: 'uint', args: ['raw', 'num'] }, available: { ret: 'int' }, read: { ret: 'int' }, peek: { ret: 'int' }, setTimeout: { ret: 'void' }, getTimeout: { ret: 'ulong' },
  parseInt: { ret: 'long', gen: true }, parseFloat: { ret: 'float', gen: true }, readString: { ret: 'String', gen: true }, readStringUntil: { ret: 'String', gen: true },
  readBytes: { ret: 'uint', gen: true, args: ['raw', 'num'] }, readBytesUntil: { ret: 'uint', gen: true, args: ['num', 'raw', 'num'] },
  find: { ret: 'bool', gen: true, args: ['str'] }, findUntil: { ret: 'bool', gen: true, args: ['str', 'str'] },
};

// ------------------------------------------------------------------ WiFiClient
let reqSeq = 0;

/** A raw HTTP message: headers → { start, headers, body } (null while the header block is incomplete). */
function parseHttp(raw) {
  const i = raw.indexOf('\r\n\r\n');
  if (i < 0) return null;
  const lines = raw.slice(0, i).split('\r\n');
  const headers = {};
  for (const l of lines.slice(1)) { const k = l.indexOf(':'); if (k > 0) headers[l.slice(0, k).trim().toLowerCase()] = l.slice(k + 1).trim(); }
  const cl = headers['content-length'] ? +headers['content-length'] : 0;
  const rest = raw.slice(i + 4);
  return { start: lines[0], headers, body: rest.slice(0, cl), complete: rest.length >= cl, headLen: i + 4, extra: rest.slice(cl) };
}

export class WiFiClientLib extends NetStream {
  constructor(rt, hw, board, secure = false) {
    super(rt);
    this.hw = hw; this.board = board; this.secure = secure;
    this.mode = 'idle'; this.peer = null; this.tx = ''; this.buf = ''; this.readyT = 0; this.closeT = null; this.stopped = false;
    this.item = null; this.trust = false; this.sent = false; this.srvPort = 0; this.keep = false;
  }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }

  _fill() {
    if (this.buf && this.rt.t >= this.readyT) { for (let i = 0; i < this.buf.length; i++) this.rx.push(this.buf.charCodeAt(i) & 255); this.buf = ''; }
  }
  setInsecure() { this.trust = true; }
  setCACert() { this.trust = true; return 1; }
  setCertificate() { return 1; }
  setPrivateKey() { return 1; }
  setFingerprint() { this.trust = true; return 1; }
  setCACertBundle() { this.trust = true; }
  setBufferSizes() {}
  setNoDelay() {}
  setSocketOption() { return 0; }
  setConnectionTimeout() {}
  allowSelfSignedCerts() { this.trust = true; }
  setTimeout(v) { this.timeout = this.board.family === 'esp32' ? v * 1000 : v; }

  * connect(host, port, timeout) {
    const h = hostOf(host);
    const net = this.net, dev = this.dev;
    this.mode = 'idle'; this.rx = []; this.buf = ''; this.tx = ''; this.sent = false; this.closeT = null; this.stopped = false;
    port = port === undefined ? 80 : port;
    if (!net.online(dev)) { this.hw.warn(`WiFiClient.connect("${h}"): the board is not connected to Wi-Fi (check WiFi.status() == WL_CONNECTED first).`, null, 'wc-offline'); yield* wait(this.rt, 200000); return 0; }
    const ip = net.resolve(h, dev);
    if (!ip) { yield* wait(this.rt, 600000); this.hw.warn(`WiFiClient.connect("${h}"): the host name could not be resolved${net.opts.internet ? '' : ' (the router has no internet)'}.`, null, 'wc-dns:' + h); return 0; }
    if (this.secure && !this.trust && this.board.family === 'esp32') {
      yield* wait(this.rt, 400000);
      this.hw.warn('WiFiClientSecure: the TLS certificate of the server cannot be verified. Call client.setInsecure(); (fine for testing) or client.setCACert(root_ca); before connect().', null, 'wcs-trust');
      return 0;
    }
    const lan = net.deviceByHost(h) || (/^(127\.|192\.168\.)/.test(ip) ? 1 : null);
    const probe = net.route(new URL(`${this.secure || port === 443 ? 'https' : 'http'}://${h}:${port}/`), dev);
    if (probe.error && probe.error.error !== 'ERR_NAME_NOT_RESOLVED') { yield* wait(this.rt, lan ? 200000 : 900000); this.hw.warn(`WiFiClient.connect("${h}", ${port}) failed: ${probe.error.statusText}.`, null, 'wc-refused:' + h + port); return 0; }
    if (probe.error) { yield* wait(this.rt, 600000); return 0; }
    yield* wait(this.rt, lan ? 5000 : 40000 + (hash(h) % 40) * 1000);
    this.mode = 'out'; this.peer = { host: h, port, ip };
    return 1;
  }

  _write(s) {
    if (this.mode === 'out') {
      if (this.stopped) return 0;
      this.tx += s;
      this._dispatch();
      return s.length;
    }
    if (this.mode === 'srv') { if (this.stopped) return 0; this.tx += s; return s.length; }
    this.hw.warn('WiFiClient: print()/write() on a client that is not connected (connect() failed or the connection was closed).', null, 'wc-closed');
    return 0;
  }

  /** The request in tx is complete: send it over the virtual network and queue the answer. */
  _dispatch() {
    const m = parseHttp(this.tx);
    if (!m || !m.complete || !this.peer) return;
    this.tx = m.extra;
    const [method, path] = m.start.split(' ');
    const https = this.secure || this.peer.port === 443;
    const net = this.net, dev = this.dev;
    const p = this.peer;
    if (this.peer.port === 443 && !this.secure) {
      this.hw.warn('Port 443 needs WiFiClientSecure (HTTPS): a plain WiFiClient just gets garbage back from an HTTPS server.', null, 'wc-443');
      this.closeT = this.rt.t; return;
    }
    const url = `${https ? 'https' : 'http'}://${m.headers.host || p.host}${p.port === (https ? 443 : 80) || (m.headers.host || '').includes(':') ? '' : ':' + p.port}${path}`;
    const req = { method, url, headers: m.headers, body: m.body, fromName: dev.name };
    const close = /close/i.test(m.headers.connection || '');
    const deliver = (res, at) => {
      if (res.failed) { this.closeT = at; return; }
      let raw = `HTTP/1.1 ${res.status} ${res.statusText || ''}\r\n`;
      for (const [k, v] of Object.entries(res.headers || {})) raw += `${k.replace(/(^|-)(\w)/g, (x, a, c) => a + c.toUpperCase())}: ${v}\r\n`;
      raw += `Connection: ${close ? 'close' : 'keep-alive'}\r\n\r\n${res.body || ''}`;
      this.buf += raw;
      this.readyT = Math.max(this.readyT, at);
      this.closeT = close ? at : at + 5000000;
      this.sent = true;
    };
    const r = net.route(new URL(url), dev);
    if (r.error) { this.closeT = this.rt.t; return; }
    if (!r.server && !r.live) {
      const res = net.requestSync(req, dev);
      deliver(res, this.rt.t + (res.ms || 60) * 1000);
    } else {
      net.request(req, dev, 5000).then((res) => deliver(res, 0));
    }
  }

  connected() {
    this._fill();
    if (this.mode === 'out') {
      if (this.stopped) return 0;
      if (this.rx.length || this.buf) return 1;
      return this.closeT === null || this.rt.t < this.closeT ? 1 : 0;
    }
    if (this.mode === 'srv') return !this.stopped || this.rx.length ? 1 : 0;
    if (this.mode === 'buf') return this.rx.length || this.buf ? 1 : 0;
    return 0;
  }
  status() { return this.connected() ? 4 : 0; }
  truthy() { return this.connected() ? 1 : 0; }
  flush() {}
  stop() {
    if (this.mode === 'srv' && !this.stopped) this._finishServer();
    this.stopped = true;
  }
  remoteIP() { return this.mode === 'srv' ? new IPAddress(192, 168, 1, 2) : ipOf(this.peer ? this.peer.ip : ''); }
  remotePort() { return this.mode === 'srv' ? 50000 + (++reqSeq % 1000) : (this.peer ? this.peer.port : 0); }
  localIP() { return ipOf(this.dev.ip); }
  localPort() { return this.mode === 'srv' ? this.srvPort : 40000 + (hash(this.dev.id) % 20000); }

  // ---- accepted by a WiFiServer: the browser's request is the input, the answer goes back on stop()
  static fromRequest(rt, hw, board, item, port) {
    const c = new WiFiClientLib(rt, hw, board);
    const r = item.req;
    let raw = `${r.method} ${r.path} HTTP/1.1\r\nHost: ${r.host}\r\n`;
    for (const [k, v] of Object.entries(r.headers || {})) { if (k === 'host' || k === 'content-length') continue; raw += `${k.replace(/(^|-)(\w)/g, (x, a, ch) => a + ch.toUpperCase())}: ${v}\r\n`; }
    if (r.body) raw += `Content-Length: ${r.body.length}\r\n`;
    raw += `\r\n${r.body || ''}`;
    c.mode = 'srv'; c.item = item; c.srvPort = port; c.buf = raw; c.readyT = 0; c._fill();
    return c;
  }
  _finishServer() {
    const item = this.item;
    if (!item || item.done) return;
    const t = this.tx;
    const m = /^HTTP\/\d(?:\.\d)? (\d{3})/.exec(t) ? parseHttp(t.includes('\r\n\r\n') ? t : t + '\r\n\r\n') : null;
    let res;
    if (m) {
      const status = +/^HTTP\/\d(?:\.\d)? (\d{3})/.exec(t)[1];
      const body = t.slice(m.headLen);
      res = { status, headers: { ...m.headers }, body: m.headers['content-length'] ? body.slice(0, +m.headers['content-length']) : body };
      if (!res.headers['content-type']) res.headers['content-type'] = 'text/html';
    } else if (t.length) {
      res = { status: 200, headers: { 'content-type': 'text/html' }, body: t };
    } else {
      res = { status: 0, failed: true, error: 'ERR_EMPTY_RESPONSE', statusText: 'The board closed the connection without sending anything', headers: {}, body: '' };
    }
    item.respond(res);
  }
}

// ------------------------------------------------------------------ WiFiServer
class WiFiServerLib {
  constructor(rt, hw, board, [port = 80] = []) { this.rt = rt; this.hw = hw; this.board = board; this.port = port; this.open = false; }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }
  begin(port) {
    if (port) this.port = port;
    if (this.net.serverFor(this.dev, this.port)) { this.hw.warn(`WiFiServer: port ${this.port} is already used by another server on this board.`, null, 'ws-dup'); return; }
    this.net.listen(this.dev, this.port, this.dev.name);
    this.open = true;
  }
  end() { this.close(); }
  close() { if (this.open) { this.net.unlisten(this.dev, this.port); this.open = false; } }
  stop() { this.close(); }
  setNoDelay() {}
  hasClient() { const s = this.open && this.net.serverFor(this.dev, this.port); return s && s.pending.length ? 1 : 0; }
  accept() {
    if (!this.open) { this.hw.warn('WiFiServer.available(): call server.begin() in setup() first.', null, 'ws-nobegin'); return null; }
    const s = this.net.serverFor(this.dev, this.port);
    if (!s || !s.pending.length) return null;
    const item = s.pending.shift();
    this.net.changed();
    return WiFiClientLib.fromRequest(this.rt, this.hw, this.board, item, this.port);
  }
  available() { return this.accept(); }
  status() { return this.open ? 1 : 0; }
}

// ------------------------------------------------------------------ WebServer / ESP8266WebServer
const HTTP = { ANY: 0, GET: 1, HEAD: 2, POST: 3, PUT: 4, PATCH: 5, DELETE: 6, OPTIONS: 7 };
const HTTP_NAME = ['ANY', 'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

const urlDecode = (s) => { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); } };
const parseForm = (q) => (q || '').split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return i < 0 ? { name: urlDecode(p), value: '' } : { name: urlDecode(p.slice(0, i)), value: urlDecode(p.slice(i + 1)) }; });

class WebServerLib {
  constructor(rt, hw, board, [port = 80] = []) {
    this.rt = rt; this.hw = hw; this.board = board; this.port = port; this.routes = []; this.notFound = null; this.open = false; this.cur = null;
    this.contentLength = null; this.collect = [];
  }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }

  on(uri, a, b) {
    const route = { uri: hostOf(uri), method: HTTP.ANY, fn: null };
    if (typeof a === 'number') { route.method = a; route.fn = b; } else route.fn = a;
    if (!route.fn) { this.hw.warn(`WebServer.on("${route.uri}"): no handler function given.`, null, 'ws-nofn'); return; }
    this.routes.push(route);
  }
  onNotFound(fn) { this.notFound = fn; }
  begin(port) {
    if (port) this.port = port;
    if (this.net.serverFor(this.dev, this.port)) { this.hw.warn(`WebServer: port ${this.port} is already used by another server on this board.`, null, 'ws-dup'); return; }
    this.net.listen(this.dev, this.port, this.dev.name);
    this.open = true;
  }
  close() { if (this.open) { this.net.unlisten(this.dev, this.port); this.open = false; } }
  stop() { this.close(); }
  enableCORS() {}
  enableCrossOrigin() {}
  collectHeaders(keys) { this.collect = []; }
  setContentLength(n) { this.contentLength = n; }
  handleClient() { return this._handle(); }

  * _handle() {
    if (!this.open) { this.hw.warn('WebServer.handleClient(): call server.begin() in setup() first.', null, 'ws-nobegin'); return; }
    const s = this.net.serverFor(this.dev, this.port);
    this.rt.t += 40;
    if (!s) return;
    while (s.pending.length) {
      const item = s.pending.shift();
      this.net.changed();
      yield* this._serve(item);
    }
  }

  * _serve(item) {
    const r = item.req;
    const qi = r.path.indexOf('?');
    const path = urlDecode(qi < 0 ? r.path : r.path.slice(0, qi));
    const args = qi < 0 ? [] : parseForm(r.path.slice(qi + 1));
    const ct = (r.headers['content-type'] || '').toLowerCase();
    if (r.body) {
      if (/x-www-form-urlencoded/.test(ct)) args.push(...parseForm(r.body));
      else args.push({ name: 'plain', value: r.body });
    }
    const method = HTTP[r.method] !== undefined ? HTTP[r.method] : HTTP.GET;
    this.cur = { item, req: r, path, args, method, headers: {}, status: 200, body: '', type: 'text/html', sent: false, stream: false, extra: {} };
    this.contentLength = null;
    let fn = null;
    for (const rt of this.routes) if (rt.uri === path && (rt.method === HTTP.ANY || rt.method === method)) { fn = rt.fn; break; }
    if (!fn) fn = this.notFound;
    if (fn) yield* this.rt.callDynamic(fn, []);
    else if (!this.cur.sent) this._send(404, 'text/html', 'Not found: ' + path);
    const c = this.cur;
    if (c && !c.sent) {
      if (c.stream) this._finish();
      else {
        this.hw.warn(`The handler for "${path}" returned without calling server.send(): the browser gets an empty response. Add server.send(200, "text/plain", "...");`, null, 'ws-nosend:' + path);
        item.respond({ status: 0, failed: true, error: 'ERR_EMPTY_RESPONSE', statusText: 'The board sent nothing', headers: {}, body: '' });
        c.sent = true;
      }
    }
    this.cur = null;
  }

  _need(what) {
    if (!this.cur) { this.hw.warn(`WebServer.${what}() only works inside a request handler (a function given to server.on()).`, null, 'ws-ctx'); return false; }
    return true;
  }
  _send(code, type, body) {
    const c = this.cur;
    if (!c || c.sent) return;
    c.sent = true;
    c.item.respond({ status: code, headers: { 'content-type': type || 'text/plain', ...c.extra }, body });
  }
  _finish() {
    const c = this.cur;
    if (!c || c.sent) return;
    c.sent = true;
    c.item.respond({ status: c.status, headers: { 'content-type': c.type || 'text/html', ...c.extra }, body: c.body });
  }
  send(code, type, body) {
    if (!this._need('send')) return;
    const c = this.cur;
    if (c.sent) { this.hw.warn('server.send() was called twice for one request — only the first answer reaches the browser.', null, 'ws-twice'); return; }
    if (body === undefined && type === undefined) body = '';
    if (this.contentLength === -1 && !text(body)) { c.stream = true; c.status = code; c.type = text(type) || 'text/html'; this.contentLength = null; return; }
    this._send(code, type === undefined ? 'text/plain' : text(type), text(body));
  }
  send_P(code, type, body) { this.send(code, type, body); }
  sendContent(s) {
    if (!this._need('sendContent')) return;
    const c = this.cur;
    if (!c.stream) { c.stream = true; c.status = 200; c.type = c.type || 'text/html'; }
    const t = text(s);
    if (!t.length) { this._finish(); return; }
    c.body += t;
  }
  sendContent_P(s) { this.sendContent(s); }
  sendHeader(name, value) { if (this._need('sendHeader')) this.cur.extra[text(name).toLowerCase()] = text(value); }
  arg(a) {
    if (!this.cur) return new AStr('');
    const found = typeof a === 'number' ? this.cur.args[a] : this.cur.args.find((x) => x.name === text(a));
    return new AStr(found ? found.value : '');
  }
  argName(i) { return new AStr(this.cur && this.cur.args[i] ? this.cur.args[i].name : ''); }
  args() { return this.cur ? this.cur.args.length : 0; }
  hasArg(n) { return this.cur && this.cur.args.some((x) => x.name === text(n)) ? 1 : 0; }
  uri() { return new AStr(this.cur ? this.cur.path : ''); }
  method() { return this.cur ? this.cur.method : 0; }
  header(n) { return new AStr(this.cur ? this.cur.req.headers[text(n).toLowerCase()] || '' : ''); }
  hasHeader(n) { return this.cur && this.cur.req.headers[text(n).toLowerCase()] !== undefined ? 1 : 0; }
  headerName(i) { return new AStr(this.cur ? Object.keys(this.cur.req.headers)[i] || '' : ''); }
  headers() { return this.cur ? Object.keys(this.cur.req.headers).length : 0; }
  hostHeader() { return new AStr(this.cur ? this.cur.req.host : ''); }
  client() { const c = new WiFiClientLib(this.rt, this.hw, this.board); c.mode = 'srv'; c.stopped = true; return c; }
  urlDecode(s) { return new AStr(urlDecode(text(s))); }
  authenticate(u, p) {
    const h = this.cur && this.cur.req.headers.authorization;
    if (!h || !/^Basic /i.test(h)) return 0;
    try { return (typeof atob === 'function' ? atob(h.slice(6)) : Buffer.from(h.slice(6), 'base64').toString()) === `${text(u)}:${text(p)}` ? 1 : 0; } catch (e) { return 0; }
  }
  requestAuthentication() { if (this._need('requestAuthentication')) { this.cur.extra['www-authenticate'] = 'Basic realm="Login Required"'; this._send(401, 'text/plain', 'Authentication required'); } }
  streamFile() { this.hw.warn('WebServer.streamFile(): there is no SPIFFS / LittleFS file system in the simulator — send the page from a String instead.', null, 'ws-file'); return 0; }
}

// ------------------------------------------------------------------ WiFiUDP (NTP is handled by NTPClient itself)
class WiFiUDPLib {
  constructor(rt, hw, board) { this.rt = rt; this.hw = hw; this.board = board; this.port = 0; }
  begin(p) { this.port = p; return 1; }
  stop() {}
  beginPacket() { return 1; }
  endPacket() { return 1; }
  write(v) { return typeof v === 'number' ? 1 : text(v).length; }
  parsePacket() { return 0; }
  available() { return 0; }
  read() { return -1; }
  remoteIP() { return new IPAddress(); }
  remotePort() { return 0; }
  flush() {}
}

// ------------------------------------------------------------------ mDNS, ESP, Preferences (NVS)
class MDNSLib {
  constructor(rt, hw, board) { this.rt = rt; this.hw = hw; this.board = board; }
  begin(name) {
    const d = devOf(this.hw, this.board);
    d.hostname = text(name);
    netOf(this.hw).changed();
    this.rt.t += 200000;
    return 1;
  }
  addService() {}
  addServiceTxt() {}
  end() {}
  update() { return 1; }
  setInstanceName() {}
}

class ESPLib {
  constructor(rt, hw, board) { this.rt = rt; this.hw = hw; this.board = board; }
  get e32() { return this.board.family === 'esp32'; }
  heap() { return Math.max(40000, (this.e32 ? 273000 : 43000) - Math.floor(this.rt.t / 4e5) % 997 * 3); }
  getFreeHeap() { return this.heap(); }
  getHeapSize() { return this.e32 ? 327680 : 81920; }
  getMinFreeHeap() { return this.heap() - 20000; }
  getMaxAllocHeap() { return this.heap() - 30000; }
  getFreePsram() { return 0; }
  getPsramSize() { return 0; }
  getChipModel() { return this.e32 ? 'ESP32-D0WDQ6' : 'ESP8266EX'; }
  getChipRevision() { return 1; }
  getChipCores() { return this.e32 ? 2 : 1; }
  getChipId() { const m = devOf(this.hw, this.board).mac; return (m[3] << 16 | m[4] << 8 | m[5]) >>> 0; }
  getEfuseMac() { const m = devOf(this.hw, this.board).mac; return m.reduce((a, b) => a * 256 + b, 0); }
  getCpuFreqMHz() { return this.board.mhz; }
  getSdkVersion() { return this.e32 ? 'v4.4.7-dirty' : '2.2.2-dev(a5ac4f7)'; }
  getCoreVersion() { return '3.0.0'; }
  getFlashChipSize() { return 4194304; }
  getFlashChipSpeed() { return 80000000; }
  getSketchSize() { return 262144 + (hash(this.hw.label || 'x') % 4096); }
  getFreeSketchSpace() { return 1310720; }
  getResetReason() { return new AStr('Power on'); }
  getCycleCount() { return Math.floor(this.rt.t * this.board.mhz) >>> 0; }
  * restart() {
    const r = rootOf(this.hw);
    this.hw.restartRequested = true;
    this.hw.serialOut('Serial', '\r\nets Jun  8 2016 00:22:57\r\n\r\nrst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n');
    yield* this.rt.waitUntil(Infinity);
  }
  reset() { return this.restart(); }
  * deepSleep(us) {
    this.hw.warn('ESP.deepSleep(): the board sleeps — in the simulator it just stops here (a real board would reboot after the time).', null, 'esp-sleep');
    yield* this.rt.waitUntil(Infinity);
  }
}

const NVS = new Map(); // namespace → Map(key → value): survives restarts of the sketch like the flash does
class PreferencesLib {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.ns = null; this.ro = false; }
  begin(ns, ro) { this.ns = text(ns); this.ro = !!ro; if (!NVS.has(this.ns)) NVS.set(this.ns, new Map()); this.rt.t += 3000; return 1; }
  end() { this.ns = null; }
  get m() {
    if (!this.ns) { this.hw.warn('Preferences: call prefs.begin("namespace", false) first.', null, 'pref-begin'); return new Map(); }
    return NVS.get(this.ns);
  }
  put(k, v) { if (this.ro) { this.hw.warn('Preferences: the namespace was opened read-only (second argument of begin() is true).', null, 'pref-ro'); return 0; } this.m.set(text(k), v); this.rt.t += 2000; return 1; }
  get(k, d) { const m = this.m; return m.has(text(k)) ? m.get(text(k)) : d; }
  putInt(k, v) { return this.put(k, v | 0) ? 4 : 0; }
  putUInt(k, v) { return this.put(k, v >>> 0) ? 4 : 0; }
  putLong(k, v) { return this.put(k, v | 0) ? 4 : 0; }
  putULong(k, v) { return this.put(k, v >>> 0) ? 4 : 0; }
  putShort(k, v) { return this.put(k, (v << 16) >> 16) ? 2 : 0; }
  putUShort(k, v) { return this.put(k, v & 0xffff) ? 2 : 0; }
  putChar(k, v) { return this.put(k, (v << 24) >> 24) ? 1 : 0; }
  putUChar(k, v) { return this.put(k, v & 255) ? 1 : 0; }
  putBool(k, v) { return this.put(k, v ? 1 : 0) ? 1 : 0; }
  putFloat(k, v) { return this.put(k, Math.fround(v)) ? 4 : 0; }
  putDouble(k, v) { return this.put(k, v) ? 8 : 0; }
  putString(k, v) { const s = text(v); return this.put(k, s) ? s.length : 0; }
  getInt(k, d = 0) { return this.get(k, d) | 0; }
  getUInt(k, d = 0) { return this.get(k, d) >>> 0; }
  getLong(k, d = 0) { return this.get(k, d) | 0; }
  getULong(k, d = 0) { return this.get(k, d) >>> 0; }
  getShort(k, d = 0) { return (this.get(k, d) << 16) >> 16; }
  getUShort(k, d = 0) { return this.get(k, d) & 0xffff; }
  getChar(k, d = 0) { return (this.get(k, d) << 24) >> 24; }
  getUChar(k, d = 0) { return this.get(k, d) & 255; }
  getBool(k, d = 0) { return this.get(k, d) ? 1 : 0; }
  getFloat(k, d = 0) { return this.get(k, d); }
  getDouble(k, d = 0) { return this.get(k, d); }
  getString(k, d = '') { const v = this.get(k, text(d)); return new AStr(String(v)); }
  isKey(k) { return this.m.has(text(k)) ? 1 : 0; }
  remove(k) { return this.m.delete(text(k)) ? 1 : 0; }
  clear() { this.m.clear(); return 1; }
  freeEntries() { return 500 - this.m.size; }
}

// ------------------------------------------------------------------ registration
addLibrary((natives, rt, hw, board) => {
  const wifi = new WiFiLib(rt, hw, board);
  hw.__wifi = wifi;
  const esp = board.family === 'esp32' || board.family === 'esp8266';
  const wm = WIFI_METHODS(board.family === 'esp32');
  if (!esp) wm.begin = { ret: 'int', gen: true, method: 'beginBlocking', args: ['raw', 'raw'] };
  defineClass(natives, 'WiFiClass', { create: () => wifi, methods: wm });
  natives.globals.WiFi = { cls: 'WiFiClass', value: wifi };
  const multi = { create: () => new WiFiMultiLib(rt, hw, board), methods: { addAP: { ret: 'bool', args: ['raw', 'raw'] }, run: { ret: 'int', gen: true } } };
  defineClass(natives, 'WiFiMulti', multi);
  defineClass(natives, 'ESP8266WiFiMulti', multi);

  defineClass(natives, 'IPAddress', {
    create: (r, a) => new IPAddress(...(a || [])), ctorArgs: ['num', 'num', 'num', 'num'],
    methods: { toString: { ret: 'String', method: 'toStr' }, fromString: { ret: 'bool', args: ['raw'] }, isSet: { ret: 'bool' } },
  });
  natives.constants.INADDR_NONE = 0xffffffff;

  const clientMethods = {
    ...STREAM_METHODS,
    connect: { ret: 'int', gen: true, args: ['raw', 'num', 'num'] }, connected: { ret: 'bool' }, stop: { ret: 'void' }, flush: { ret: 'void' }, status: { ret: 'int' },
    remoteIP: { ret: 'IPAddress' }, remotePort: { ret: 'uint' }, localIP: { ret: 'IPAddress' }, localPort: { ret: 'uint' },
    setNoDelay: { ret: 'void' }, setSocketOption: { ret: 'int' }, setConnectionTimeout: { ret: 'void' },
    setInsecure: { ret: 'void' }, setCACert: { ret: 'bool', args: ['raw'] }, setCertificate: { ret: 'bool', args: ['raw'] }, setPrivateKey: { ret: 'bool', args: ['raw'] },
    setFingerprint: { ret: 'bool', args: ['raw'] }, setCACertBundle: { ret: 'void', args: ['raw'] }, setBufferSizes: { ret: 'void' }, allowSelfSignedCerts: { ret: 'void' },
    printf: { ret: 'uint', printf: 1, args: ['str'] },
  };
  if (board.arch === 'avr') delete clientMethods.printf;
  defineClass(natives, 'WiFiClient', { create: () => new WiFiClientLib(rt, hw, board, false), methods: clientMethods });
  defineClass(natives, 'WiFiClientSecure', { create: () => new WiFiClientLib(rt, hw, board, true), methods: clientMethods });
  defineClass(natives, 'BearSSL_WiFiClientSecure', { create: () => new WiFiClientLib(rt, hw, board, true), methods: clientMethods });
  defineClass(natives, 'EthernetClient', { create: () => new WiFiClientLib(rt, hw, board, false), methods: clientMethods });
  defineClass(natives, 'WiFiServer', {
    create: (r, a) => new WiFiServerLib(rt, hw, board, a), ctorArgs: ['num'],
    methods: { begin: { ret: 'void' }, end: { ret: 'void' }, close: { ret: 'void' }, stop: { ret: 'void' }, setNoDelay: { ret: 'void' }, hasClient: { ret: 'bool' }, accept: { ret: 'WiFiClient' }, available: { ret: 'WiFiClient' }, status: { ret: 'int' } },
  });

  const wsMethods = {
    on: { ret: 'void', args: ['raw', 'raw', 'raw', 'raw'] }, onNotFound: { ret: 'void', args: ['raw'] }, begin: { ret: 'void' }, close: { ret: 'void' }, stop: { ret: 'void' },
    handleClient: { ret: 'void', gen: true }, send: { ret: 'void', args: ['num', 'raw', 'raw'] }, send_P: { ret: 'void', args: ['num', 'raw', 'raw'] },
    sendContent: { ret: 'void', args: ['raw'] }, sendContent_P: { ret: 'void', args: ['raw'] }, sendHeader: { ret: 'void', args: ['raw', 'raw', 'raw'] },
    arg: { ret: 'String', args: ['raw'] }, argName: { ret: 'String' }, args: { ret: 'int' }, hasArg: { ret: 'bool', args: ['raw'] }, uri: { ret: 'String' }, method: { ret: 'int' },
    header: { ret: 'String', args: ['raw'] }, hasHeader: { ret: 'bool', args: ['raw'] }, headerName: { ret: 'String' }, headers: { ret: 'int' }, hostHeader: { ret: 'String' },
    client: { ret: 'WiFiClient' }, urlDecode: { ret: 'String', args: ['raw'] }, authenticate: { ret: 'bool', args: ['raw', 'raw'] }, requestAuthentication: { ret: 'void' },
    streamFile: { ret: 'uint', args: ['raw', 'raw'] }, enableCORS: { ret: 'void' }, enableCrossOrigin: { ret: 'void' }, collectHeaders: { ret: 'void', args: ['raw', 'raw'] },
    setContentLength: { ret: 'void' },
  };
  const ws = { create: (r, a) => new WebServerLib(rt, hw, board, a), ctorArgs: ['num'], methods: wsMethods };
  defineClass(natives, 'WebServer', ws);
  defineClass(natives, 'ESP8266WebServer', ws);
  defineClass(natives, 'WiFiUDP', { create: () => new WiFiUDPLib(rt, hw, board), methods: { begin: { ret: 'bool' }, stop: { ret: 'void' }, beginPacket: { ret: 'bool', args: ['raw', 'raw'] }, endPacket: { ret: 'bool' }, write: { ret: 'uint', args: ['raw', 'raw'] }, parsePacket: { ret: 'int' }, available: { ret: 'int' }, read: { ret: 'int', args: ['raw', 'raw'] }, remoteIP: { ret: 'IPAddress' }, remotePort: { ret: 'uint' }, flush: { ret: 'void' } } });

  const mdns = new MDNSLib(rt, hw, board);
  defineClass(natives, 'MDNSResponder', { create: () => mdns, methods: { begin: { ret: 'bool', args: ['raw'] }, addService: { ret: 'void', args: ['raw', 'raw', 'raw'] }, addServiceTxt: { ret: 'void', args: ['raw', 'raw', 'raw', 'raw'] }, end: { ret: 'void' }, update: { ret: 'bool' }, setInstanceName: { ret: 'void', args: ['raw'] } } });
  natives.globals.MDNS = { cls: 'MDNSResponder', value: mdns };

  const espObj = new ESPLib(rt, hw, board);
  defineClass(natives, 'EspClass', {
    create: () => espObj,
    methods: {
      getFreeHeap: { ret: 'uint' }, getHeapSize: { ret: 'uint' }, getMinFreeHeap: { ret: 'uint' }, getMaxAllocHeap: { ret: 'uint' }, getFreePsram: { ret: 'uint' }, getPsramSize: { ret: 'uint' },
      getChipModel: { ret: 'cstr' }, getChipRevision: { ret: 'uint' }, getChipCores: { ret: 'uint' }, getChipId: { ret: 'uint' }, getEfuseMac: { ret: 'ulong' }, getCpuFreqMHz: { ret: 'uint' },
      getSdkVersion: { ret: 'cstr' }, getCoreVersion: { ret: 'cstr' }, getFlashChipSize: { ret: 'uint' }, getFlashChipSpeed: { ret: 'uint' }, getSketchSize: { ret: 'uint' },
      getFreeSketchSpace: { ret: 'uint' }, getResetReason: { ret: 'String' }, getCycleCount: { ret: 'uint' }, restart: { ret: 'void', gen: true }, reset: { ret: 'void', gen: true }, deepSleep: { ret: 'void', gen: true },
    },
  });
  natives.globals.ESP = { cls: 'EspClass', value: espObj };

  const pm = {};
  for (const n of ['Int', 'UInt', 'Long', 'ULong', 'Short', 'UShort', 'Char', 'UChar', 'Bool', 'Float', 'Double']) { pm['put' + n] = { ret: 'uint', args: ['raw', 'raw'] }; }
  pm.putString = { ret: 'uint', args: ['raw', 'raw'] };
  const pg = { getInt: 'int', getUInt: 'uint', getLong: 'long', getULong: 'ulong', getShort: 'i16', getUShort: 'u16', getChar: 'char', getUChar: 'u8', getBool: 'bool', getFloat: 'float', getDouble: 'float' };
  for (const [k, r] of Object.entries(pg)) pm[k] = { ret: r, args: ['raw', 'raw'] };
  Object.assign(pm, { getString: { ret: 'String', args: ['raw', 'raw'] }, begin: { ret: 'bool', args: ['raw', 'raw'] }, end: { ret: 'void' }, isKey: { ret: 'bool', args: ['raw'] }, remove: { ret: 'bool', args: ['raw'] }, clear: { ret: 'bool' }, freeEntries: { ret: 'uint' } });
  defineClass(natives, 'Preferences', { create: () => new PreferencesLib(rt, hw), methods: pm });

  Object.assign(natives.constants, {
    WL_NO_SHIELD: 255, WL_IDLE_STATUS: 0, WL_NO_SSID_AVAIL: 1, WL_SCAN_COMPLETED: 2, WL_CONNECTED: 3, WL_CONNECT_FAILED: 4, WL_CONNECTION_LOST: 5, WL_DISCONNECTED: 6, WL_AP_LISTENING: 7, WL_AP_CONNECTED: 8, WL_AP_FAILED: 9,
    WIFI_OFF: 0, WIFI_STA: 1, WIFI_AP: 2, WIFI_AP_STA: 3,
    WIFI_AUTH_OPEN: 0, WIFI_AUTH_WEP: 1, WIFI_AUTH_WPA_PSK: 2, WIFI_AUTH_WPA2_PSK: 3, WIFI_AUTH_WPA_WPA2_PSK: 4,
    ENC_TYPE_WEP: 5, ENC_TYPE_TKIP: 2, ENC_TYPE_CCMP: 4, ENC_TYPE_NONE: 7, ENC_TYPE_AUTO: 8,
    HTTP_ANY: HTTP.ANY, HTTP_GET: HTTP.GET, HTTP_HEAD: HTTP.HEAD, HTTP_POST: HTTP.POST, HTTP_PUT: HTTP.PUT, HTTP_PATCH: HTTP.PATCH, HTTP_DELETE: HTTP.DELETE, HTTP_OPTIONS: HTTP.OPTIONS,
    CONTENT_LENGTH_UNKNOWN: -1, CONTENT_LENGTH_NOT_SET: -2,
  });
});

export { HTTP, HTTP_NAME, wait, text, bytes, hostOf, ipOf, hash, parseHttp, urlDecode, parseForm };
