// The virtual network the simulators share: a Wi-Fi router (192.168.1.x), a little "internet" of
// simulated web services (weather, ThingSpeak, Blynk, Telegram, httpbin …), an MQTT broker and the
// web servers that devices run (an ESP32 WebServer, a Raspberry Pi Flask app …). Offline it is all in
// here, so a sketch or a Python program can use "the internet" anywhere. With the phone online and
// Settings → Real internet on (live.js), weather, time, IP, prices and any other site come from the
// real internet; services that need your own account stay simulated (see simOnly).
import { MqttBroker } from './mqtt.js';
import { installServices } from './cloud.js';
import { liveWeb } from './live.js';

// account services stay simulated (their data shows in the IoT dashboard; nothing is posted for real)
const SIM_ONLY = /(^|\.)(thingspeak\.com|blynk\.cloud|blynk-cloud\.com|telegram\.org|ifttt\.com|adafruit\.com|hooks\.slack\.com|discord(app)?\.com|webhook\.site|ntfy\.sh|pool\.ntp\.org)$/i;
// services the simulator imitates with an API key: without a real key they answer with the real weather
const KEYED = new Set(['api.openweathermap.org']);

export const NETWORKS = [
  { ssid: 'RaptiNet', pass: 'rapti1234', ch: 6, rssi: -42 },
  { ssid: 'RAPTI-Lab', pass: 'password123', ch: 1, rssi: -55 },
  { ssid: 'Wokwi-GUEST', pass: '', ch: 6, rssi: -48 },
  { ssid: 'Guest', pass: '', ch: 11, rssi: -63 },
  { ssid: 'Home-WiFi', pass: '12345678', ch: 3, rssi: -71 },
  { ssid: 'Office-5G', pass: 'admin1234', ch: 36, rssi: -80 },
];

// Arduino WiFi.status() values
export const WL = { IDLE: 0, NO_SSID: 1, SCAN_DONE: 2, CONNECTED: 3, CONNECT_FAILED: 4, CONNECTION_LOST: 5, DISCONNECTED: 6 };

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const http = {
  text: (body, status = 200, type = 'text/plain; charset=utf-8', headers = {}) => ({ status, headers: { 'content-type': type, ...headers }, body: String(body) }),
  json: (obj, status = 200, headers = {}) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: JSON.stringify(obj) }),
  html: (body, status = 200) => ({ status, headers: { 'content-type': 'text/html; charset=utf-8' }, body: String(body) }),
};

const REASON = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 408: 'Request Timeout', 418: "I'm a teapot", 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' };
export const reasonOf = (code) => REASON[code] || '';

export class VirtualNet {
  constructor(opts = {}) {
    this.opts = { strict: false, router: true, internet: true, ...opts };
    this._live = 'live' in opts ? opts.live : undefined; // undefined: the app's live web (live.js)
    this.clock = opts.clock || (() => Date.now());
    this.devices = new Map();   // id → device
    this.servers = new Map();   // 'ip:port' → { dev, port, pending: [], name }
    this.hosts = new Map();     // hostname → handler(req, u, net) (synchronous)
    this.log = [];              // recent exchanges (for the dashboard)
    this.notes = [];            // Telegram / IFTTT / webhook messages sent by devices
    this.cloud = { thingspeak: new Map(), blynk: new Map(), adafruit: new Map(), telegram: { inbox: [], offset: 0 } };
    this.mqtt = new MqttBroker(this);
    this.listeners = new Set();
    this.nextHost = 50;
    this.version = 0;
    installServices(this);
  }

  // ------------------------------------------------------------------ change notifications
  changed() { this.version++; for (const fn of this.listeners) { try { fn(); } catch (e) { /* ignore */ } } }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // ------------------------------------------------------------------ devices & Wi-Fi
  registerDevice({ id, name, kind = 'esp32', hostname = '', broker = false }) {
    let d = this.devices.get(id);
    if (!d) {
      const h = hash(id + name);
      d = { id, name, kind, hostname: hostname || '', mac: [0x24, 0x6f, 0x28, (h >> 16) & 255, (h >> 8) & 255, h & 255], ip: '', ssid: '', rssi: 0, connected: false, broker, since: this.clock(), apIp: '', apOn: false, apSsid: '', bt: null };
      this.devices.set(id, d);
    }
    d.name = name; d.kind = kind; if (hostname) d.hostname = hostname; d.broker = broker;
    this.changed();
    return d;
  }

  macString(d, sep = ':') { return d.mac.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(sep); }

  /** Networks in range: [{ssid, rssi, ch, enc}] (the router can be switched off). */
  scan() {
    if (!this.opts.router) return [];
    return NETWORKS.map((n, i) => ({ ssid: n.ssid, rssi: n.rssi + ((i * 7) % 5), ch: n.ch, enc: n.pass ? 'WPA2' : 'open', bssid: [0x02, 0x1a, 0x2b, 0x3c, 0x4d, i] }));
  }

  /**
   * A device joins a network. Returns { status, ip }: status as WiFi.status() (3 connected, 1 no SSID,
   * 4 failed). Wrong SSID / password fail only when `strict` is on; otherwise any name works as long
   * as the password is empty or at least 8 characters (what a real WPA2 network would insist on).
   */
  join(d, ssid, pass = '') {
    if (!this.opts.router) return { status: WL.NO_SSID, ip: '', reason: `The Wi-Fi network "${ssid}" is not in range (the router is switched off)` };
    const known = NETWORKS.find((n) => n.ssid === ssid);
    if (known) {
      if (known.pass !== pass) return { status: WL.CONNECT_FAILED, ip: '', reason: known.pass ? `Wrong password for "${ssid}"` : `"${ssid}" is an open network` };
    } else if (this.opts.strict) {
      return { status: WL.NO_SSID, ip: '', reason: `No Wi-Fi network called "${ssid}". Networks here: ${NETWORKS.map((n) => n.ssid).join(', ')}` };
    } else if (pass && pass.length < 8) {
      return { status: WL.CONNECT_FAILED, ip: '', reason: 'A WPA2 password needs at least 8 characters' };
    }
    if (!d.ip) {
      const used = new Set([...this.devices.values()].map((x) => x.ip));
      let n = this.nextHost;
      while (used.has('192.168.1.' + n) && n < 250) n++;
      d.ip = '192.168.1.' + n;
      this.nextHost = n + 1;
    }
    d.ssid = ssid;
    d.rssi = known ? known.rssi : -58;
    d.connected = true;
    d.since = this.clock();
    this.changed();
    return { status: WL.CONNECTED, ip: d.ip };
  }

  leave(d) { if (d && d.connected) { d.connected = false; this.dropServers(d); this.changed(); } }

  /** Text typed into the phone's Bluetooth terminal reaches the board's BluetoothSerial. */
  btSend(id, text) {
    const d = this.devices.get(id);
    if (!d || !d.bt) return false;
    d.bt.rx += text + '\n';
    d.bt.log.push({ dir: 'in', text: text + '\n', t: this.clock() });
    this.changed();
    return true;
  }

  /** Router and internet switches of the dashboard / IoT panel. */
  setRouter(on) { this.opts.router = !!on; this.changed(); }
  setInternet(on) { this.opts.internet = !!on; this.changed(); }

  /** The real internet behind this network (null in tests / when switched off). */
  get live() { return this._live !== undefined ? this._live : liveWeb(); }
  isLive() { const l = this.live; return !!(l && l.on && this.opts.internet && this.opts.router); }
  /** A host that is always answered by the simulator (account services, the RAPTI pages of the simulator). */
  simOnly(host) {
    const h = String(host || '').toLowerCase();
    if (SIM_ONLY.test(h) || /^time\./.test(h) || /^ntp\./.test(h)) return true;
    return /\.rapti\.net$/.test(h) && !/^(www\.)?rapti\.net$/.test(h);
  }

  /** Is device d on the Wi-Fi (router on and joined)? null = the user's phone / PC: always. */
  online(d) { return !d || (d.connected && this.opts.router); }

  deviceByHost(host) {
    const h = String(host || '').toLowerCase();
    for (const d of this.devices.values()) {
      if (d.ip && d.ip === h) return d;
      if (d.apOn && d.apIp === h) return d;
      if (d.hostname && (h === d.hostname.toLowerCase() || h === d.hostname.toLowerCase() + '.local')) return d;
    }
    return null;
  }

  // ------------------------------------------------------------------ DNS
  /** IP of a host name, or '' (NXDOMAIN). */
  resolve(host, dev = null) {
    const h = String(host || '').toLowerCase().replace(/\.$/, '');
    if (!h) return '';
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return h;
    if (h === 'localhost') return '127.0.0.1';
    const d = this.deviceByHost(h);
    if (d) return d.ip || '';
    if (h.endsWith('.local')) return '';
    if (!this.opts.internet || !this.opts.router) return '';
    if (this.hasHost(h) || (this.isLive() && /\.[a-z]{2,}$/.test(h))) { const x = hash(h); return `${[34, 52, 104, 142, 151, 172][x % 6]}.${(x >> 8) & 255}.${(x >> 16) & 255}.${1 + ((x >> 24) % 250)}`; }
    return '';
  }

  hasHost(h) { const k = h.replace(/^www\./, ''); return this.hosts.has(h) || this.hosts.has(k) || this.hosts.has('www.' + k); }
  addHost(name, handler) { this.hosts.set(name, handler); }

  // ------------------------------------------------------------------ web servers of the devices
  /** A device starts listening: its server gets the requests addressed to ip:port (and name.local). */
  listen(dev, port, name = '') {
    const key = `${dev.id}:${port}`;
    const s = { key, dev, port, name: name || dev.name, pending: [], open: true };
    this.servers.set(key, s);
    this.changed();
    return s;
  }
  unlisten(dev, port) { this.servers.delete(`${dev.id}:${port}`); this.changed(); }
  dropServers(d) { for (const [k, s] of this.servers) if (s.dev === d) this.servers.delete(k); }
  serverFor(dev, port) { return this.servers.get(`${dev.id}:${port}`) || null; }

  // ------------------------------------------------------------------ HTTP
  parseUrl(url, origin) {
    let u;
    try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'http://' + url); } catch (e) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u;
  }

  /** Log a finished exchange. */
  record(req, res, ms) {
    this.log.push({ t: this.clock(), from: req.fromName || 'browser', method: req.method, url: req.url, status: res.status, ms: Math.round(ms), live: !!res.live });
    if (this.log.length > 120) this.log.splice(0, this.log.length - 120);
    this.changed();
  }

  fail(code, text) { return { status: 0, error: code, statusText: text || code, headers: {}, body: '', failed: true }; }

  /** Which server does this URL address? { dev, server, port } for a device on the LAN, 'internet' or an error. */
  route(u, origin) {
    const host = u.hostname.toLowerCase();
    const port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    let dev = null;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') dev = origin || null;
    else dev = this.deviceByHost(host);
    if (dev) {
      if (origin && dev !== origin && !this.online(origin)) return { error: this.fail('ERR_INTERNET_DISCONNECTED', 'This device is not connected to Wi-Fi') };
      if (dev !== origin && !this.opts.router) return { error: this.fail('ERR_NETWORK_CHANGED', 'The router is off') };
      if (!dev.connected && !dev.apOn && dev !== origin) return { error: this.fail('ERR_ADDRESS_UNREACHABLE', `${host} is not on the network (it has no Wi-Fi connection)`) };
      const server = this.serverFor(dev, port);
      if (!server) return { error: this.fail('ERR_CONNECTION_REFUSED', `${host} refused to connect on port ${port}`) };
      return { dev, server, port };
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && !/^(8\.8\.|1\.1\.)/.test(host) && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return { error: this.fail('ERR_ADDRESS_UNREACHABLE', `No device has the address ${host}`) };
    if (!this.opts.router || (origin && !this.online(origin))) return { error: this.fail('ERR_INTERNET_DISCONNECTED', 'There is no Wi-Fi connection') };
    if (!this.opts.internet) return { error: this.fail('ERR_INTERNET_DISCONNECTED', 'The router has no internet') };
    if (host.endsWith('.local')) return { error: this.fail('ERR_NAME_NOT_RESOLVED', `${host} could not be resolved`) };
    if (this.isLive() && !this.simOnly(host)) return { internet: true, live: true };
    if (!this.hasHost(host)) return { error: this.fail('ERR_NAME_NOT_RESOLVED', `${host}'s server DNS address could not be found`) };
    return { internet: true };
  }

  /** Internet handler lookup (www. optional). */
  hostHandler(host) {
    const h = host.toLowerCase();
    return this.hosts.get(h) || this.hosts.get(h.replace(/^www\./, '')) || this.hosts.get('www.' + h);
  }

  /** Normalise a request: { method, url, headers (lower-case), body }. */
  normalise(req) {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers || {})) headers[k.toLowerCase()] = String(v);
    return { ...req, method: String(req.method || 'GET').toUpperCase(), headers, body: req.body == null ? '' : String(req.body) };
  }

  /**
   * Synchronous request: for the internet's services. A device's own web server answers only through
   * request() (it needs its program to run), so a sketch cannot call another device synchronously.
   */
  requestSync(rawReq, origin = null) {
    const req = this.normalise(rawReq);
    const u = this.parseUrl(req.url);
    if (!u) return this.fail('ERR_INVALID_URL', 'Invalid URL');
    const r = this.route(u, origin);
    if (r.error) return r.error;
    if (r.server) return this.fail('ERR_CONNECTION_TIMED_OUT', 'Another device on the network can only answer web browsers, not programs, in this simulator');
    if (r.live && !this.hostHandler(u.hostname)) return this.fail('ERR_TIMED_OUT', 'A real web request takes time: this call cannot wait for it');
    return this.serve(req, u, origin);
  }

  /**
   * A request that goes out to the real internet. When that fails (offline, time-out, the server
   * is down or busy, or a keyed service without a real key) the simulated service answers instead —
   * the weather ones with the real weather when it is known.
   */
  async serveLive(req, u, origin, timeoutMs = 10000) {
    const t0 = Date.now();
    const host = u.hostname.toLowerCase();
    const sim = this.hostHandler(host);
    const res = await this.live.fetch(req, timeoutMs);
    const fallback = res.failed || res.status >= 500 || res.status === 429 || (KEYED.has(host) && (res.status === 401 || res.status === 403));
    if (fallback && sim) {
      if (this.livePrepare) { try { await this.livePrepare(u); } catch (e) { /* simulated values */ } }
      const s = this.serve(req, u, origin);
      s.liveFallback = true;
      return s;
    }
    if (res.failed) {
      const f = this.fail(res.error, `${host}: ${res.statusText}`);
      this.record({ ...req, fromName: origin ? origin.name : 'browser' }, f, Date.now() - t0);
      return f;
    }
    res.headers = { ...res.headers };
    res.statusText = reasonOf(res.status);
    res.ms = Date.now() - t0;
    this.record({ ...req, fromName: origin ? origin.name : 'browser' }, res, res.ms);
    return res;
  }

  serve(req, u, origin) {
    const t0 = this.clock();
    const h = this.hostHandler(u.hostname);
    let res;
    try { res = h ? h(req, u, this) : http.text('Not found', 404); } catch (e) { res = http.text('Internal error: ' + (e && e.message), 500); }
    if (!res) res = http.text('Not found', 404);
    res.headers = { server: 'RaptiAuto-sim', date: new Date(this.clock()).toUTCString(), 'content-length': String(unicodeLength(res.body)), ...(res.headers || {}) };
    res.statusText = reasonOf(res.status);
    res.ms = 40 + (hash(u.hostname) % 160);
    this.record({ ...req, fromName: origin ? origin.name : 'browser' }, res, res.ms);
    return res;
  }

  /** Asynchronous request (browsers, Python): also reaches the web servers of other devices. */
  request(rawReq, origin = null, timeoutMs = 8000) {
    const req = this.normalise(rawReq);
    const u = this.parseUrl(req.url);
    if (!u) return Promise.resolve(this.fail('ERR_INVALID_URL', 'Invalid URL'));
    const r = this.route(u, origin);
    if (r.error) return Promise.resolve(r.error);
    if (r.live) return this.serveLive(req, u, origin, Math.max(timeoutMs, 10000));
    if (!r.server) return Promise.resolve(this.serve(req, u, origin));
    return new Promise((resolve) => {
      const item = { req: { ...req, path: u.pathname + u.search, host: u.host, from: origin ? origin.name : 'browser' }, resolve, t0: this.clock(), done: false };
      const finish = (res) => {
        if (item.done) return;
        item.done = true;
        clearTimeout(item.timer);
        res.headers = { server: r.dev.name, 'content-length': String(unicodeLength(res.body || '')), ...(res.headers || {}) };
        res.statusText = res.statusText || reasonOf(res.status);
        this.record({ ...req, fromName: origin ? origin.name : 'browser' }, res, this.clock() - item.t0);
        resolve(res);
      };
      item.respond = finish;
      item.timer = setTimeout(() => finish(this.fail('ERR_TIMED_OUT', `${u.hostname} took too long to respond — is handleClient() / the server loop running?`)), timeoutMs);
      r.server.pending.push(item);
      this.changed();
    });
  }

  // ------------------------------------------------------------------ dashboard data
  snapshot() {
    return {
      router: this.opts.router, internet: this.opts.internet, strict: this.opts.strict, time: this.clock(),
      live: this.isLive(), liveOn: this.live ? !!this.live.enabled() : undefined,
      devices: [...this.devices.values()].map((d) => ({ id: d.id, name: d.name, kind: d.kind, ip: d.ip, mac: this.macString(d), ssid: d.ssid, rssi: d.rssi, connected: d.connected && this.opts.router, hostname: d.hostname, ap: d.apOn ? { ssid: d.apSsid, ip: d.apIp } : null, bt: d.bt ? { name: d.bt.name, log: d.bt.log.slice(-40) } : null, servers: [...this.servers.values()].filter((s) => s.dev === d).map((s) => s.port), since: d.since })),
      http: this.log.slice(-40).reverse(),
      notes: this.notes.slice(-40).reverse(),
      mqtt: this.mqtt.snapshot(),
      thingspeak: [...this.cloud.thingspeak.values()].map((c) => ({ id: c.id, name: c.name, key: c.key, fields: c.fields, entries: c.entries.slice(-30) })),
      blynk: [...this.cloud.blynk.values()].map((b) => ({ token: b.token, online: b.online, pins: [...b.pins.entries()].map(([k, v]) => ({ pin: k, value: v })) })),
      adafruit: [...this.cloud.adafruit.entries()].map(([k, v]) => ({ feed: k, last: v[v.length - 1] ? v[v.length - 1].value : '', count: v.length })),
      networks: NETWORKS.map((n) => ({ ssid: n.ssid, open: !n.pass, pass: n.pass })),
    };
  }

  /** User-visible note (Telegram message, IFTTT trigger, webhook): shown in the dashboard. */
  note(kind, title, text, extra = {}) {
    this.notes.push({ t: this.clock(), kind, title, text, ...extra });
    if (this.notes.length > 100) this.notes.splice(0, this.notes.length - 100);
    this.changed();
  }
}

function unicodeLength(s) { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00 ? 2 : 3); } return n; }

let shared = null;
/** The one network of the running app (a fresh one per simulation run is made by the callers that need it). */
export function sharedNet() { if (!shared) shared = new VirtualNet(); return shared; }
export function resetSharedNet(opts) { shared = new VirtualNet(opts); return shared; }
