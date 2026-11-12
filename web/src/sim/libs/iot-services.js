// Cloud-side Arduino libraries on top of the virtual network: HTTPClient, PubSubClient (MQTT),
// ThingSpeak, NTPClient + time(), Blynk / BlynkTimer / SimpleTimer, UniversalTelegramBot and
// BluetoothSerial. Each one calls the simulated services in src/net (weather, ThingSpeak, Blynk,
// Telegram, MQTT brokers …) in the sketch's virtual time, so a program written for a real ESP32
// behaves the same here — including the mistakes that fail on real hardware.
import { addLibrary, defineClass } from './registry.js';
import { cstr, Ptr, Ref, AStr } from '../lang/values.js';
import { netOf, devOf, WiFiClientLib, NetStream, IPAddress, HTTP, wait, text, bytes, hostOf, hash } from './iot.js';

/** Calls the network from a sketch: simulated services answer at once, other devices' web servers and the real internet need time. */
export function* callNet(rt, net, dev, req, timeoutMs = 5000) {
  const u = net.parseUrl(req.url);
  if (!u) return net.fail('ERR_INVALID_URL', 'Invalid URL');
  const r = net.route(u, dev);
  if (r.error) return r.error;
  // the simulated internet answers at once; another device's server or the real internet takes time
  if (!r.server && !r.live) return net.requestSync(req, dev);
  // a real request may take longer than the sketch's time-out; then the simulated service answers
  const lim = r.live ? Math.max(timeoutMs, 10000) : timeoutMs;
  let res = null;
  net.request(req, dev, lim).then((x) => { res = x; });
  yield* rt.waitFor(() => !!res, rt.t + (lim + 200) * 1000);
  return res || net.fail('ERR_TIMED_OUT', 'timed out');
}

const b64 = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'latin1').toString('base64'));
const fmtNum = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : text(v));
const bytesOf = (v, len) => {
  const a = v instanceof Ptr ? v.a : v, off = v instanceof Ptr ? v.i : 0;
  let s = '';
  for (let i = 0; i < len; i++) { const c = typeof a === 'string' ? a.charCodeAt(off + i) : a[off + i]; s += String.fromCharCode((c | 0) & 255); }
  return s;
};

// ------------------------------------------------------------------ HTTPClient
const HTTPC_MSG = { '-1': 'connection refused', '-2': 'send header failed', '-3': 'send payload failed', '-4': 'not connected', '-5': 'connection lost', '-6': 'no stream', '-7': 'no HTTP server', '-8': 'too less ram', '-9': 'Transfer-Encoding not supported', '-10': 'Stream write error', '-11': 'read Timeout' };

class HTTPClientLib {
  constructor(rt, hw, board) {
    this.rt = rt; this.hw = hw; this.board = board;
    this.url = ''; this.client = null; this.ca = false; this.headers = {}; this.timeout = 5000; this.follow = 0; this.res = null; this.collect = null; this.ua = 'ESP32HTTPClient';
    this.http10 = false; this.reuse = true;
  }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }

  begin(a, b, c, d) {
    this.res = null; this.headers = {}; this.client = null; this.ca = false;
    if (a instanceof WiFiClientLib) {
      this.client = a;
      if (typeof c === 'number') this.url = `${d === 1 || c === 443 ? 'https' : 'http'}://${text(b)}:${c}${text(d && typeof d !== 'number' ? d : '/')}`;
      else this.url = text(b);
    } else if (typeof b === 'number') this.url = `http://${text(a)}:${b}${text(c || '/')}`;
    else { this.url = text(a); if (b !== undefined) this.ca = true; }
    return 1;
  }
  end() { this.res = null; this.url = ''; }
  connected() { return this.res ? 1 : 0; }
  setReuse(r) { this.reuse = !!r; }
  setTimeout(ms) { this.timeout = ms; }
  setConnectTimeout() {}
  setUserAgent(u) { this.ua = text(u); }
  setFollowRedirects(m) { this.follow = m; }
  setRedirectLimit() {}
  useHTTP10(v) { this.http10 = v === undefined ? true : !!v; }
  addHeader(n, v, first, replace) { this.headers[text(n)] = text(v); }
  setAuthorization(u, p) { this.headers.Authorization = p === undefined ? 'Basic ' + text(u) : 'Basic ' + b64(`${text(u)}:${text(p)}`); }
  setAuthorizationType() {}
  setCookieJar() {}
  collectHeaders(keys, n) {
    this.collect = [];
    const list = Array.isArray(keys) ? keys : keys instanceof Ptr ? keys.a.slice(keys.i) : [];
    for (let i = 0; i < n; i++) if (list[i] !== undefined) this.collect.push(cstr(list[i]).toLowerCase());
  }

  trusted() { return this.ca || (this.client && this.client.trust) || (this.board.family !== 'esp32' && this.board.family !== 'esp8266'); }

  * _do(method, body) {
    const net = this.net, dev = this.dev, rt = this.rt;
    if (!this.url) { this.hw.warn('HTTPClient: call http.begin(url) before GET()/POST().', null, 'http-nobegin'); return -1; }
    yield* wait(rt, 12000);
    let url = this.url, hops = 0;
    this.res = null;
    for (;;) {
      let u;
      try { u = new URL(url); } catch (e) { return -1; }
      if (!net.online(dev)) { this.hw.warn('HTTPClient: the board is not connected to Wi-Fi — wait for WiFi.status() == WL_CONNECTED before sending a request.', null, 'http-offline'); yield* wait(rt, 300000); return -1; }
      if (u.protocol === 'https:' && !this.trusted()) {
        yield* wait(rt, 450000);
        this.hw.warn('HTTPS request failed: the server certificate cannot be verified. Use  WiFiClientSecure client; client.setInsecure(); http.begin(client, url);  (testing) or give http.begin(url, root_ca).', null, 'http-tls');
        return -1;
      }
      const headers = { 'user-agent': this.ua, accept: '*/*', ...Object.fromEntries(Object.entries(this.headers).map(([k, v]) => [k.toLowerCase(), v])), host: u.host };
      if (body) { headers['content-length'] = String(body.length); if (!headers['content-type']) headers['content-type'] = 'application/x-www-form-urlencoded'; }
      const res = yield* callNet(rt, net, dev, { method, url, headers, body: body || '', fromName: dev.name }, this.timeout);
      if (res.failed) {
        if (res.error === 'ERR_TIMED_OUT') return -11;
        if (res.error === 'ERR_NAME_NOT_RESOLVED') this.hw.warn(`HTTPClient: "${u.hostname}" could not be found (DNS lookup failed).`, null, 'http-dns:' + u.hostname);
        else this.hw.warn(`HTTPClient: could not reach ${u.host}: ${res.statusText}.`, null, 'http-fail:' + u.host);
        yield* wait(rt, res.error === 'ERR_CONNECTION_REFUSED' ? 20000 : 500000);
        return -1;
      }
      yield* wait(rt, (res.ms || 60) * 1000);
      if (this.follow && [301, 302, 303, 307, 308].includes(res.status) && res.headers.location && hops++ < 5) { url = new URL(res.headers.location, url).href; if (res.status === 303) { method = 'GET'; body = ''; } continue; }
      this.res = res;
      this.finalUrl = url;
      return res.status;
    }
  }
  * GET() { return yield* this._do('GET', ''); }
  * POST(a, n) { return yield* this._do('POST', n !== undefined && typeof n === 'number' ? bytesOf(a, n) : text(a)); }
  * PUT(a, n) { return yield* this._do('PUT', n !== undefined && typeof n === 'number' ? bytesOf(a, n) : text(a)); }
  * PATCH(a, n) { return yield* this._do('PATCH', n !== undefined && typeof n === 'number' ? bytesOf(a, n) : text(a)); }
  * sendRequest(m, a, n) { return yield* this._do(text(m).toUpperCase(), a === undefined ? '' : (typeof n === 'number' ? bytesOf(a, n) : text(a))); }
  getString() { return new AStr(this.res ? this.res.body : ''); }
  getSize() { if (!this.res) return -1; const cl = this.res.headers['content-length']; return cl !== undefined ? +cl : this.res.body.length; }
  getStream() { const c = new WiFiClientLib(this.rt, this.hw, this.board); c.mode = 'buf'; c.buf = this.res ? this.res.body : ''; c.readyT = 0; return c; }
  getStreamPtr() { return this.getStream(); }
  getLocation() { return new AStr(this.res && this.res.headers.location ? this.res.headers.location : ''); }
  header(n) {
    const k = text(n).toLowerCase();
    if (!this.res || !this.collect || !this.collect.includes(k)) return new AStr('');
    return new AStr(this.res.headers[k] || '');
  }
  hasHeader(n) { const k = text(n).toLowerCase(); return this.res && this.collect && this.collect.includes(k) && this.res.headers[k] !== undefined ? 1 : 0; }
  headers_() { return this.collect ? this.collect.filter((k) => this.res && this.res.headers[k] !== undefined).length : 0; }
  headerName(i) { return new AStr(this.collect && this.collect[i] ? this.collect[i] : ''); }
  static errorToString(code) { return new AStr(HTTPC_MSG[String(code)] || ''); }
  errorToString(code) { return new AStr(HTTPC_MSG[String(code)] || ''); }
}

// ------------------------------------------------------------------ PubSubClient (MQTT)
class PubSubLib {
  constructor(rt, hw, board, [client] = []) {
    this.rt = rt; this.hw = hw; this.board = board; this.client = client || null;
    this.host = ''; this.port = 1883; this.cb = null; this.mq = null; this.st = -1; this.keep = 15; this.buf = 256; this.last = 0;
  }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }

  setServer(host, port) { this.host = hostOf(host); this.port = port === undefined ? 1883 : port; return this; }
  setCallback(fn) { this.cb = fn; return this; }
  setClient(c) { this.client = c; return this; }
  setKeepAlive(s) { this.keep = s; return this; }
  setSocketTimeout() { return this; }
  setBufferSize(n) { this.buf = n; return 1; }
  getBufferSize() { return this.buf; }

  * connect(id, a, b, c, d, e, f, g) {
    const net = this.net, dev = this.dev, rt = this.rt;
    this._drop(false);
    if (!this.host) { this.hw.warn('PubSubClient: call client.setServer("broker", 1883) before connect().', null, 'mq-noserver'); this.st = -2; return 0; }
    if (!net.online(dev)) { this.hw.warn('PubSubClient.connect(): the board is not connected to Wi-Fi.', null, 'mq-offline'); yield* wait(rt, 400000); this.st = -2; return 0; }
    const opts = {};
    const n = [a, b, c, d, e, f, g].filter((x) => x !== undefined).length;
    if (n === 2) { opts.user = text(a); opts.pass = text(b); }
    else if (n === 4) { opts.will = { topic: text(a), payload: text(d), retain: !!c }; }
    else if (n >= 6) { opts.user = a ? text(a) : undefined; opts.pass = b ? text(b) : undefined; opts.will = c ? { topic: text(c), payload: text(f), retain: !!e } : null; }
    const r = net.mqtt.connect(text(id), this.host, this.port, opts, dev);
    if (!r.ok) {
      yield* wait(rt, r.reason === 'refused' ? 150000 : 1500000);
      this.st = r.code === 5 ? 5 : -2;
      this.hw.warn(r.reason === 'dns' ? `PubSubClient: the broker "${this.host}" could not be found (DNS).` : r.reason === 'refused' ? `PubSubClient: nothing listens for MQTT at ${this.host}:${this.port} (a broker like Mosquitto must run there).` : `PubSubClient: connect to ${this.host} failed (${r.reason}).`, null, 'mq-fail:' + this.host);
      return 0;
    }
    yield* wait(rt, 60000 + (hash(this.host) % 60) * 1000);
    this.mq = r.client; this.st = 0; this.last = rt.t;
    return 1;
  }
  _drop(abnormal) { if (this.mq) { this.net.mqtt.disconnect(this.mq, abnormal); this.mq = null; } }
  connected() {
    if (!this.mq) return 0;
    if (!this.mq.connected) { this.mq = null; this.st = -3; return 0; }
    if (!this.net.online(this.dev)) { this._drop(true); this.st = -3; return 0; }
    return 1;
  }
  state() { return this.st; }
  disconnect() { this._drop(false); this.st = -1; }
  _bad() { this.hw.warn('PubSubClient: not connected to the broker — publish()/subscribe() do nothing. Check client.connected() and reconnect in loop().', null, 'mq-notconn'); return 0; }
  publish(topic, payload, a, b) {
    if (!this.connected()) return this._bad();
    let retain = false, body;
    if (typeof a === 'number' && (b !== undefined || a > 1)) { body = bytesOf(payload, a); retain = !!b; } else { body = text(payload); retain = !!a; }
    const t = text(topic);
    if (5 + 2 + t.length + body.length > this.buf) {
      this.hw.warn(`PubSubClient.publish(): the message is too big for the buffer (${this.buf} bytes: topic ${t.length} + payload ${body.length} + header). Call client.setBufferSize(512) (or more) in setup() — it returned false, nothing was sent.`, null, 'mq-big');
      return 0;
    }
    this.net.mqtt.publish(this.mq, t, body, retain);
    this.last = this.rt.t;
    this.rt.t += 300;
    return 1;
  }
  subscribe(topic) { if (!this.connected()) return this._bad(); this.net.mqtt.subscribe(this.mq, text(topic)); this.last = this.rt.t; this.rt.t += 200; return 1; }
  unsubscribe(topic) { if (!this.connected()) return 0; this.net.mqtt.unsubscribe(this.mq, text(topic)); return 1; }
  * loop() {
    if (!this.mq) return 0;
    if (!this.connected()) return 0;
    const net = this.net;
    this.rt.t += 80;
    // no traffic for 1.5 × keep-alive: the broker drops the client (the sketch must call loop() often)
    if (this.keep && this.rt.t - this.last > this.keep * 1500000 + 1e6 && !net.mqtt.pending) { this.last = this.rt.t; }
    let m;
    while ((m = net.mqtt.poll(this.mq))) {
      if (!this.cb) continue;
      const t = bytes(m.topic); t.push(0);
      const p = bytes(m.payload); p.push(0);
      yield* this.rt.callDynamic(this.cb, [new Ptr(t, 0), new Ptr(p, 0), m.payload.length]);
    }
    this.last = this.rt.t;
    return this.connected();
  }
}

// ------------------------------------------------------------------ ThingSpeak
class ThingSpeakLib {
  constructor(rt, hw, board) { this.rt = rt; this.hw = hw; this.board = board; this.fields = {}; this.status = ''; this.last = 200; this.read = null; }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }
  begin() { return 1; }
  setField(n, v) { this.fields[n] = fmtNum(v); return 200; }
  setStatus(s) { this.status = text(s); return 200; }
  setLatitude() { return 200; }
  setLongitude() { return 200; }
  setElevation() { return 200; }
  setCreatedAt() { return 200; }
  setTwitter() { return 200; }
  * _http(method, url, headers, body) {
    const net = this.net, dev = this.dev;
    yield* wait(this.rt, 20000);
    if (!net.online(dev)) { this.hw.warn('ThingSpeak: the board is not connected to Wi-Fi.', null, 'ts-offline'); return null; }
    const res = yield* callNet(this.rt, net, dev, { method, url, headers, body, fromName: dev.name });
    if (res.failed) return null;
    yield* wait(this.rt, (res.ms || 80) * 1000);
    return res;
  }
  * writeFields(ch, key) {
    const body = Object.entries(this.fields).map(([n, v]) => `field${n}=${encodeURIComponent(v)}`).join('&') + (this.status ? `&status=${encodeURIComponent(this.status)}` : '');
    this.fields = {}; this.status = '';
    if (!body) { this.last = -210; return -210; }
    const res = yield* this._http('POST', 'http://api.thingspeak.com/update', { 'x-thingspeak-api-key': text(key), 'content-type': 'application/x-www-form-urlencoded' }, body);
    if (!res) { this.last = -301; return -301; }
    if (res.status !== 200) { this.last = res.status; return res.status; }
    this.last = res.body.trim() === '0' ? -401 : 200;
    if (this.last === -401) this.hw.warn('ThingSpeak: the update was not accepted (error -401). A free channel takes one update every 15 seconds — wait longer between writeFields() calls.', null, 'ts-rate');
    return this.last;
  }
  * writeField(ch, f, v, key) { this.fields = { [f]: fmtNum(v) }; return yield* this.writeFields(ch, key); }
  * _last(ch, f, key) {
    const res = yield* this._http('GET', `http://api.thingspeak.com/channels/${ch}/fields/${f}/last.txt`, key ? { 'x-thingspeak-api-key': text(key) } : {}, '');
    if (!res) { this.last = -301; return null; }
    this.last = res.status === 200 ? 200 : res.status;
    return res.status === 200 ? res.body.trim() : null;
  }
  * readFloatField(ch, f, key) { const v = yield* this._last(ch, f, key); return v === null ? NaN : parseFloat(v); }
  * readLongField(ch, f, key) { const v = yield* this._last(ch, f, key); return v === null ? 0 : parseInt(v, 10) | 0; }
  * readIntField(ch, f, key) { return yield* this.readLongField(ch, f, key); }
  * readStringField(ch, f, key) { const v = yield* this._last(ch, f, key); return new AStr(v === null ? '' : v); }
  getLastReadStatus() { return this.last; }
}

// ------------------------------------------------------------------ time: NTPClient, configTime(), time()
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

class Clock {
  constructor(rt, hw, board) { this.rt = rt; this.hw = hw; this.board = board; this.sync = null; this.gmt = 0; this.dst = 0; this.servers = []; this.cfgAt = null; }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }
  /** Seconds since 1970 (UTC): real time once synchronised, else the seconds since boot (like a board without NTP). */
  epoch() { this.poll(); return this.sync ? Math.floor(this.sync.epoch + (this.rt.t - this.sync.t) / 1e6) : Math.floor(this.rt.t / 1e6); }
  poll() {
    if (this.sync || this.cfgAt === null || this.rt.t < this.cfgAt + 1500000) return;
    const net = this.net, dev = this.dev;
    if (net.online(dev) && net.opts.internet && this.servers.some((s) => net.resolve(s, dev))) this.sync = { epoch: Math.floor(Date.now() / 1000), t: this.rt.t };
    else this.cfgAt = this.rt.t;
  }
  tm(epoch, local = true) {
    const o = local ? this.gmt + this.dst : 0;
    const d = new Date((epoch + o) * 1000);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return { tm_sec: d.getUTCSeconds(), tm_min: d.getUTCMinutes(), tm_hour: d.getUTCHours(), tm_mday: d.getUTCDate(), tm_mon: d.getUTCMonth(), tm_year: d.getUTCFullYear() - 1900, tm_wday: d.getUTCDay(), tm_yday: Math.floor((d - y0) / 86400000), tm_isdst: this.dst ? 1 : 0 };
  }
}
const p2 = (n) => String(n).padStart(2, '0');
export function strftime(f, t) {
  return f.replace(/%([a-zA-Z%])/g, (m, c) => {
    switch (c) {
      case 'Y': return String(t.tm_year + 1900);
      case 'y': return p2((t.tm_year + 1900) % 100);
      case 'm': return p2(t.tm_mon + 1);
      case 'd': return p2(t.tm_mday);
      case 'e': return String(t.tm_mday).padStart(2, ' ');
      case 'H': return p2(t.tm_hour);
      case 'I': return p2(t.tm_hour % 12 || 12);
      case 'M': return p2(t.tm_min);
      case 'S': return p2(t.tm_sec);
      case 'p': return t.tm_hour < 12 ? 'AM' : 'PM';
      case 'A': return DAY[t.tm_wday];
      case 'a': return DAY[t.tm_wday].slice(0, 3);
      case 'B': return MON[t.tm_mon];
      case 'b': case 'h': return MON[t.tm_mon].slice(0, 3);
      case 'j': return String(t.tm_yday + 1).padStart(3, '0');
      case 'F': return `${t.tm_year + 1900}-${p2(t.tm_mon + 1)}-${p2(t.tm_mday)}`;
      case 'T': return `${p2(t.tm_hour)}:${p2(t.tm_min)}:${p2(t.tm_sec)}`;
      case 'R': return `${p2(t.tm_hour)}:${p2(t.tm_min)}`;
      case 'D': return `${p2(t.tm_mon + 1)}/${p2(t.tm_mday)}/${p2((t.tm_year + 1900) % 100)}`;
      case 'Z': return 'UTC';
      case 'z': return '+0000';
      case 'u': return String(t.tm_wday || 7);
      case 'w': return String(t.tm_wday);
      case 'n': return '\n';
      case '%': return '%';
      default: return m;
    }
  });
}
const tmObject = (t) => Object.assign({ printTo() { return strftime('%A, %B %d %Y %H:%M:%S', this); }, toString() { return this.printTo(); } }, t);

class NTPClientLib {
  constructor(rt, hw, board, [udp, server, offset, interval] = []) {
    this.clock = new Clock(rt, hw, board); this.rt = rt; this.hw = hw; this.board = board;
    this.server = server === undefined ? 'pool.ntp.org' : text(server); this.offset = typeof offset === 'number' ? offset : 0; this.interval = interval || 60000;
    this.synced = false; this.lastT = -1e12;
  }
  begin() { return 1; }
  end() {}
  setTimeOffset(o) { this.offset = o; }
  setUpdateInterval(i) { this.interval = i; }
  setPoolServerName(n) { this.server = text(n); }
  isTimeSet() { return this.synced ? 1 : 0; }
  * forceUpdate() {
    const net = this.clock.net, dev = this.clock.dev;
    yield* wait(this.rt, 60000);
    if (!net.online(dev) || !net.opts.internet || !net.resolve(this.server, dev)) {
      this.hw.warn(`NTPClient: the time server "${this.server}" cannot be reached (is Wi-Fi connected and the internet on?).`, null, 'ntp-fail');
      yield* wait(this.rt, 1000000);
      return 0;
    }
    yield* wait(this.rt, 40000 + (hash(this.server) % 50) * 1000);
    this.clock.sync = { epoch: Math.floor(Date.now() / 1000), t: this.rt.t };
    this.synced = true; this.lastT = this.rt.t;
    return 1;
  }
  * update() {
    if (this.rt.t - this.lastT < this.interval * 1000 && this.synced) return 0;
    return yield* this.forceUpdate();
  }
  getEpochTime() { return this.offset + this.clock.epoch(); }
  getDay() { return new Date(this.getEpochTime() * 1000).getUTCDay(); }
  getHours() { return new Date(this.getEpochTime() * 1000).getUTCHours(); }
  getMinutes() { return new Date(this.getEpochTime() * 1000).getUTCMinutes(); }
  getSeconds() { return new Date(this.getEpochTime() * 1000).getUTCSeconds(); }
  getFormattedTime() { return new AStr(`${p2(this.getHours())}:${p2(this.getMinutes())}:${p2(this.getSeconds())}`); }
  getFormattedDate() { const d = new Date(this.getEpochTime() * 1000); return new AStr(`${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}Z`); }
}

// ------------------------------------------------------------------ Blynk
class BlynkParam {
  constructor(v = '') { this.v = String(v); }
  asInt() { return parseInt(this.v, 10) | 0; }
  asLong() { return parseInt(this.v, 10) | 0; }
  asLongLong() { return parseInt(this.v, 10) || 0; }
  asFloat() { return parseFloat(this.v) || 0; }
  asDouble() { return parseFloat(this.v) || 0; }
  asString() { return new AStr(this.v); }
  asStr() { return this.v; }
  isEmpty() { return this.v.length ? 0 : 1; }
  getLength() { return this.v.length; }
  valueOf() { return parseFloat(this.v) || 0; }
  toString() { return this.v; }
  printTo() { return this.v; }
}

class BlynkLib {
  constructor(rt, hw, board) { this.rt = rt; this.hw = hw; this.board = board; this.auth = ''; this.cloud = null; this.tried = -1e12; this.firstConnect = true; }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }
  fn(name) {
    const funcs = this.hw.runner && this.hw.runner.prog && this.hw.runner.prog.funcs;
    const list = funcs && funcs.get(name);
    return list ? list.find((f) => f.run) || null : null;
  }
  config(auth) { this.auth = text(auth); }
  * begin(auth, ssid, pass) {
    this.config(auth);
    if (ssid !== undefined) {
      const wifi = this.hw.__wifi;
      yield* wifi.beginBlocking(ssid, pass);
    }
    return yield* this.connect(30000);
  }
  * connect() {
    const net = this.net, dev = this.dev;
    this.tried = this.rt.t;
    if (!net.online(dev)) { yield* wait(this.rt, 500000); return 0; }
    if (!/^[\w-]{16,}$/.test(this.auth) || /^(your|auth)/i.test(this.auth)) {
      this.hw.warn(`Blynk: the auth token "${this.auth}" is not valid. Create a device in the Blynk app/console and paste its token (32 letters/digits) into BLYNK_AUTH_TOKEN.`, null, 'blynk-token');
      yield* wait(this.rt, 1500000);
      return 0;
    }
    if (!net.opts.internet) { yield* wait(this.rt, 1500000); return 0; }
    yield* wait(this.rt, 400000 + (hash(this.auth) % 500) * 1000);
    let b = net.cloud.blynk.get(this.auth);
    if (!b) { b = { token: this.auth, online: true, pins: new Map() }; net.cloud.blynk.set(this.auth, b); }
    b.online = true; b.dirty = b.dirty || new Set(); b.name = dev.name;
    this.cloud = b;
    if (this.hw.addCleanup && !this.cleanup) { this.cleanup = true; this.hw.addCleanup(() => { b.online = false; net.changed(); }); }
    net.changed();
    // BLYNK_CONNECTED(): the app sends the stored widget values again
    this.pendingConnected = true;
    return 1;
  }
  connected() { return this.cloud && this.net.online(this.dev) && this.net.opts.internet ? 1 : 0; }
  disconnect() { if (this.cloud) { this.cloud.online = false; this.cloud = null; this.net.changed(); } }
  * run() {
    this.rt.t += 120;
    const net = this.net;
    if (this.cloud && !this.connected()) this.cloud = null;
    if (!this.cloud) {
      if (this.auth && this.rt.t - this.tried > 5000000) yield* this.connect();
      if (!this.cloud) return;
    }
    if (this.pendingConnected) {
      this.pendingConnected = false;
      const f = this.fn('BlynkOnConnected_');
      if (f) yield* this.rt.callDynamic(f, []);
    }
    const b = this.cloud;
    if (b.dirty && b.dirty.size) {
      const pins = [...b.dirty]; b.dirty.clear();
      for (const pin of pins) {
        const f = this.fn('BlynkWidgetWrite_' + pin);
        if (f) yield* this.rt.callDynamic(f, [new BlynkParam(b.pins.get(pin) ?? '')]);
      }
    }
  }
  virtualWrite(pin, ...vals) {
    if (!this.cloud) { this.hw.warn('Blynk.virtualWrite(): not connected to the Blynk cloud (Blynk.connected() is false).', null, 'blynk-notconn'); return; }
    const v = vals.map((x) => (typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(2)) : text(x))).join(',');
    this.cloud.pins.set('V' + pin, v);
    this.net.changed();
    this.rt.t += 400;
  }
  syncVirtual(...pins) { if (this.cloud) for (const p of pins) { if (this.cloud.pins.has('V' + p)) this.cloud.dirty.add('V' + p); } }
  syncAll() { if (this.cloud) for (const k of this.cloud.pins.keys()) this.cloud.dirty.add(k); }
  logEvent(name, desc) { if (this.cloud) this.net.note('blynk', 'Blynk event: ' + text(name), text(desc)); }
  notify(msg) { if (this.cloud) this.net.note('blynk', 'Blynk notification', text(msg)); }
  email(to, subj, body) { if (this.cloud) this.net.note('blynk', 'Blynk e-mail → ' + text(to), `${text(subj)}: ${text(body)}`); }
  setProperty() {}
  isConnected() { return this.connected(); }
}

class SimpleTimerLib {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.list = []; this.seq = 0; }
  add(ms, fn, n) { const id = this.seq++; this.list.push({ id, ms, fn, left: n, next: this.rt.t + ms * 1000, on: true }); return id; }
  setInterval(ms, fn) { return this.add(ms, fn, -1); }
  setTimeout(ms, fn) { return this.add(ms, fn, 1); }
  setTimer(ms, fn, n) { return this.add(ms, fn, n === 0 ? -1 : n); }
  * run() {
    const t = this.rt.t;
    for (const x of [...this.list]) {
      if (!x.on || t < x.next) continue;
      // like SimpleTimer / BlynkTimer: prev += interval × (periods elapsed), so it does not drift
      const iv = Math.max(1, x.ms * 1000);
      x.next += iv * (Math.floor((t - x.next) / iv) + 1);
      if (x.left > 0 && --x.left === 0) this.list = this.list.filter((y) => y !== x);
      yield* this.rt.callDynamic(x.fn, []);
    }
  }
  find(id) { return this.list.find((x) => x.id === id); }
  deleteTimer(id) { this.list = this.list.filter((x) => x.id !== id); }
  disable(id) { const x = this.find(id); if (x) x.on = false; }
  enable(id) { const x = this.find(id); if (x) { x.on = true; x.next = this.rt.t + x.ms * 1000; } }
  toggle(id) { const x = this.find(id); if (x) { if (x.on) x.on = false; else this.enable(id); } }
  restartTimer(id) { const x = this.find(id); if (x) x.next = this.rt.t + x.ms * 1000; }
  isEnabled(id) { const x = this.find(id); return x && x.on ? 1 : 0; }
  getNumTimers() { return this.list.length; }
  getNumAvailableTimers() { return 16 - this.list.length; }
}

// ------------------------------------------------------------------ UniversalTelegramBot
class TelegramBotLib {
  constructor(rt, hw, board, [token, client] = []) {
    this.rt = rt; this.hw = hw; this.board = board; this.token = text(token);
    this.messages = []; this.last_message_received = 0; this.longPoll = 0; this.waitForResponse = 1500;
  }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }
  * _api(method, path, body) {
    const net = this.net, dev = this.dev;
    yield* wait(this.rt, 30000);
    if (!net.online(dev)) { this.hw.warn('Telegram bot: the board is not connected to Wi-Fi.', null, 'tg-offline'); return null; }
    const res = yield* callNet(this.rt, net, dev, { method, url: `https://api.telegram.org/bot${this.token}/${path}`, headers: body ? { 'content-type': 'application/json' } : {}, body: body || '', fromName: dev.name });
    if (res.failed) return null;
    yield* wait(this.rt, (res.ms || 100) * 1000);
    if (res.status === 401) this.hw.warn('Telegram bot: the bot token was rejected (401 Unauthorized). Get a token from @BotFather: it looks like 123456789:AAE…', null, 'tg-token');
    try { return JSON.parse(res.body); } catch (e) { return null; }
  }
  * getUpdates(offset) {
    const r = yield* this._api('GET', `getUpdates?offset=${offset}&limit=1`);
    this.messages = [];
    if (!r || !r.ok) return 0;
    for (const u of r.result) {
      const m = u.message || {};
      this.messages.push({ update_id: u.update_id, message_id: m.message_id || 0, text: new AStr(m.text || ''), chat_id: new AStr(String(m.chat ? m.chat.id : '')), from_id: new AStr(String(m.from ? m.from.id : '')), from_name: new AStr(m.from ? m.from.first_name : ''), type: new AStr('message'), date: new AStr(String(m.date || '')) });
      this.last_message_received = u.update_id;
    }
    return this.messages.length;
  }
  * sendMessage(chat, msg, mode) {
    const r = yield* this._api('POST', 'sendMessage', JSON.stringify({ chat_id: text(chat), text: text(msg), parse_mode: mode ? text(mode) : undefined }));
    return r && r.ok ? 1 : 0;
  }
  * sendMessageWithReplyKeyboard(chat, msg, mode, kb) { return yield* this.sendMessage(chat, msg, mode); }
  * sendChatAction() { return 1; }
  * getMe() { const r = yield* this._api('GET', 'getMe'); return new AStr(r && r.ok ? JSON.stringify(r.result) : ''); }
}

// ------------------------------------------------------------------ BluetoothSerial (ESP32 classic Bluetooth SPP)
class BluetoothSerialLib extends NetStream {
  constructor(rt, hw, board) { super(rt); this.hw = hw; this.board = board; this.name = ''; }
  get net() { return netOf(this.hw); }
  get dev() { return devOf(this.hw, this.board); }
  begin(name) {
    this.name = text(name || 'ESP32');
    this.dev.bt = { name: this.name, log: [], rx: '' };
    this.net.changed();
    this.rt.t += 150000;
    return 1;
  }
  end() { this.dev.bt = null; this.net.changed(); }
  _fill() { const b = this.dev.bt; if (b && b.rx) { for (let i = 0; i < b.rx.length; i++) this.rx.push(b.rx.charCodeAt(i) & 255); b.rx = ''; } }
  _write(s) {
    const b = this.dev.bt;
    if (!b) { this.hw.warn('BluetoothSerial: call SerialBT.begin("name") in setup() first.', null, 'bt-begin'); return 0; }
    b.log.push({ dir: 'out', text: s, t: Date.now() });
    if (b.log.length > 200) b.log.splice(0, b.log.length - 200);
    this.net.changed();
    this.rt.t += s.length * 40;
    return s.length;
  }
  hasClient() { return this.dev.bt ? 1 : 0; }
  connected() { return this.dev.bt ? 1 : 0; }
  disconnect() { return 1; }
  flush() {}
  enableSSP() {}
  setPin() { return 1; }
  register_callback() {}
  getBtAddressString() { return new AStr(this.net.macString(this.dev, ':')); }
}

// ------------------------------------------------------------------ registration
addLibrary((natives, rt, hw, board) => {
  const S = natives;
  defineClass(S, 'HTTPClient', {
    create: () => new HTTPClientLib(rt, hw, board),
    statics: { errorToString: { ret: 'String', fn: (c) => new AStr(HTTPC_MSG[String(c)] || '') } },
    methods: {
      begin: { ret: 'bool', args: ['raw', 'raw', 'raw', 'raw'] }, end: { ret: 'void' }, connected: { ret: 'bool' }, setReuse: { ret: 'void' }, setTimeout: { ret: 'void' }, setConnectTimeout: { ret: 'void' },
      setUserAgent: { ret: 'void', args: ['raw'] }, setFollowRedirects: { ret: 'void' }, setRedirectLimit: { ret: 'void' }, useHTTP10: { ret: 'void' },
      addHeader: { ret: 'void', args: ['raw', 'raw', 'raw', 'raw'] }, setAuthorization: { ret: 'void', args: ['raw', 'raw'] }, setAuthorizationType: { ret: 'void', args: ['raw'] }, setCookieJar: { ret: 'void', args: ['raw'] },
      collectHeaders: { ret: 'void', args: ['raw', 'num'] }, GET: { ret: 'int', gen: true }, POST: { ret: 'int', gen: true, args: ['raw', 'num'] }, PUT: { ret: 'int', gen: true, args: ['raw', 'num'] },
      PATCH: { ret: 'int', gen: true, args: ['raw', 'num'] }, sendRequest: { ret: 'int', gen: true, args: ['raw', 'raw', 'num'] }, getString: { ret: 'String' }, getSize: { ret: 'int' },
      getStream: { ret: 'WiFiClient' }, getStreamPtr: { ret: 'WiFiClient' }, getLocation: { ret: 'String' }, header: { ret: 'String', args: ['raw'] }, hasHeader: { ret: 'bool', args: ['raw'] },
      headers: { ret: 'int', method: 'headers_' }, headerName: { ret: 'String' }, errorToString: { ret: 'String' },
    },
  });
  defineClass(S, 'PubSubClient', {
    create: (r, a) => new PubSubLib(rt, hw, board, a), ctorArgs: ['raw'],
    methods: {
      setServer: { ret: 'self', args: ['raw', 'num'] }, setCallback: { ret: 'self', args: ['raw'] }, setClient: { ret: 'self', args: ['raw'] }, setKeepAlive: { ret: 'self' }, setSocketTimeout: { ret: 'self' },
      setBufferSize: { ret: 'bool' }, getBufferSize: { ret: 'uint' }, connect: { ret: 'bool', gen: true, args: ['raw', 'raw', 'raw', 'raw', 'raw', 'raw', 'raw', 'raw'] }, connected: { ret: 'bool' },
      state: { ret: 'int' }, disconnect: { ret: 'void' }, publish: { ret: 'bool', args: ['raw', 'raw', 'num', 'num'] }, subscribe: { ret: 'bool', args: ['raw', 'num'] }, unsubscribe: { ret: 'bool', args: ['raw'] },
      loop: { ret: 'bool', gen: true },
    },
  });
  defineClass(S, 'ThingSpeakClass', {
    create: () => new ThingSpeakLib(rt, hw, board),
    methods: {
      begin: { ret: 'bool', args: ['raw'] }, setField: { ret: 'int', args: ['num', 'raw'] }, setStatus: { ret: 'int', args: ['raw'] }, setLatitude: { ret: 'int' }, setLongitude: { ret: 'int' }, setElevation: { ret: 'int' },
      setCreatedAt: { ret: 'int', args: ['raw'] }, setTwitter: { ret: 'int', args: ['raw', 'raw'] }, writeFields: { ret: 'int', gen: true, args: ['num', 'raw'] }, writeField: { ret: 'int', gen: true, args: ['num', 'num', 'raw', 'raw'] },
      readFloatField: { ret: 'float', gen: true, args: ['num', 'num', 'raw'] }, readLongField: { ret: 'long', gen: true, args: ['num', 'num', 'raw'] }, readIntField: { ret: 'int', gen: true, args: ['num', 'num', 'raw'] },
      readStringField: { ret: 'String', gen: true, args: ['num', 'num', 'raw'] }, getLastReadStatus: { ret: 'int' },
    },
  });
  const ts = new ThingSpeakLib(rt, hw, board);
  natives.globals.ThingSpeak = { cls: 'ThingSpeakClass', value: ts };

  defineClass(S, 'NTPClient', {
    create: (r, a) => new NTPClientLib(rt, hw, board, a), ctorArgs: ['raw', 'raw', 'num', 'num'],
    methods: {
      begin: { ret: 'void' }, end: { ret: 'void' }, setTimeOffset: { ret: 'void' }, setUpdateInterval: { ret: 'void' }, setPoolServerName: { ret: 'void', args: ['raw'] }, isTimeSet: { ret: 'bool' },
      forceUpdate: { ret: 'bool', gen: true }, update: { ret: 'bool', gen: true }, getEpochTime: { ret: 'ulong' }, getDay: { ret: 'int' }, getHours: { ret: 'int' }, getMinutes: { ret: 'int' }, getSeconds: { ret: 'int' },
      getFormattedTime: { ret: 'String' }, getFormattedDate: { ret: 'String' },
    },
  });

  // ---- <time.h>
  const clock = new Clock(rt, hw, board);
  defineClass(S, 'tm', {
    create: () => tmObject({ tm_sec: 0, tm_min: 0, tm_hour: 0, tm_mday: 1, tm_mon: 0, tm_year: 70, tm_wday: 4, tm_yday: 0, tm_isdst: 0 }), methods: {},
    fields: { tm_sec: 'int', tm_min: 'int', tm_hour: 'int', tm_mday: 'int', tm_mon: 'int', tm_year: 'int', tm_wday: 'int', tm_yday: 'int', tm_isdst: 'int' },
  });
  const fill = (dst, t) => { Object.assign(dst, t); return dst; };
  Object.assign(S.functions, {
    configTime: { ret: 'void', args: ['num', 'num', 'raw', 'raw', 'raw'], fn: (gmt, dst, s1, s2, s3) => { clock.gmt = gmt; clock.dst = dst; clock.servers = [s1, s2, s3].filter((x) => x !== undefined).map(text); clock.cfgAt = rt.t; clock.sync = null; } },
    time: { ret: 'long', args: ['raw'], fn: (p) => { const e = clock.epoch(); if (p instanceof Ref) p.set(e); return e; } },
    localtime: { ret: 'tm', args: ['raw'], fn: (p) => tmObject(clock.tm(p instanceof Ref ? p.get() : 0, true)) },
    gmtime: { ret: 'tm', args: ['raw'], fn: (p) => tmObject(clock.tm(p instanceof Ref ? p.get() : 0, false)) },
    getLocalTime: { ret: 'bool', args: ['raw', 'num'], fn: (t) => { clock.poll(); if (!clock.sync) return 0; fill(t, clock.tm(clock.epoch(), true)); return 1; } },
    strftime: { ret: 'uint', args: ['raw', 'num', 'str', 'raw'], fn: (buf, n, fmt, t) => { const s = strftime(fmt, t).slice(0, n - 1); const a = buf instanceof Ptr ? buf.a : buf, o = buf instanceof Ptr ? buf.i : 0; for (let i = 0; i < s.length; i++) a[o + i] = s.charCodeAt(i); a[o + s.length] = 0; return s.length; } },
    mktime: { ret: 'long', args: ['raw'], fn: (t) => Math.floor((Date.UTC(t.tm_year + 1900, t.tm_mon, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec) / 1000) - clock.gmt - clock.dst) },
    difftime: { ret: 'float', args: ['num', 'num'], fn: (a, b) => a - b },
  });

  // ---- Blynk
  const blynk = new BlynkLib(rt, hw, board);
  defineClass(S, 'BlynkParam', {
    create: () => new BlynkParam(''),
    methods: { asInt: { ret: 'int' }, asLong: { ret: 'long' }, asLongLong: { ret: 'long' }, asFloat: { ret: 'float' }, asDouble: { ret: 'float' }, asString: { ret: 'String' }, asStr: { ret: 'cstr' }, isEmpty: { ret: 'bool' }, getLength: { ret: 'uint' } },
  });
  defineClass(S, 'BlynkWifi', {
    create: () => blynk,
    methods: {
      config: { ret: 'void', args: ['raw', 'raw', 'raw'] }, begin: { ret: 'void', gen: true, args: ['raw', 'raw', 'raw', 'raw', 'raw'] }, connect: { ret: 'bool', gen: true, args: ['num'] }, connected: { ret: 'bool' },
      disconnect: { ret: 'void' }, run: { ret: 'void', gen: true }, virtualWrite: { ret: 'void', args: ['num', 'raw', 'raw', 'raw', 'raw'] }, syncVirtual: { ret: 'void', args: ['num', 'num', 'num', 'num'] },
      syncAll: { ret: 'void' }, logEvent: { ret: 'void', args: ['raw', 'raw'] }, notify: { ret: 'void', args: ['raw'] }, email: { ret: 'void', args: ['raw', 'raw', 'raw'] }, setProperty: { ret: 'void' },
      isConnected: { ret: 'bool' },
    },
  });
  natives.globals.Blynk = { cls: 'BlynkWifi', value: blynk };
  const timerMethods = {
    setInterval: { ret: 'int', args: ['num', 'raw'] }, setTimeout: { ret: 'int', args: ['num', 'raw'] }, setTimer: { ret: 'int', args: ['num', 'raw', 'num'] }, run: { ret: 'void', gen: true },
    deleteTimer: { ret: 'void' }, disable: { ret: 'void' }, enable: { ret: 'void' }, toggle: { ret: 'void' }, restartTimer: { ret: 'void' }, isEnabled: { ret: 'bool' }, getNumTimers: { ret: 'int' }, getNumAvailableTimers: { ret: 'int' },
  };
  defineClass(S, 'BlynkTimer', { create: () => new SimpleTimerLib(rt, hw), methods: timerMethods });
  defineClass(S, 'SimpleTimer', { create: () => new SimpleTimerLib(rt, hw), methods: timerMethods });
  for (let i = 0; i < 128; i++) S.constants['V' + i] = i;

  defineClass(S, 'UniversalTelegramBot', {
    create: (r, a) => new TelegramBotLib(rt, hw, board, a), ctorArgs: ['raw', 'raw'],
    methods: {
      getUpdates: { ret: 'int', gen: true, args: ['num'] }, sendMessage: { ret: 'bool', gen: true, args: ['raw', 'raw', 'raw'] }, sendMessageWithReplyKeyboard: { ret: 'bool', gen: true, args: ['raw', 'raw', 'raw', 'raw', 'raw'] },
      sendChatAction: { ret: 'bool', gen: true, args: ['raw', 'raw'] }, getMe: { ret: 'String', gen: true },
    },
    fields: { messages: 'any', last_message_received: 'int', longPoll: 'int', waitForResponse: 'int' },
  });

  const bt = { create: () => new BluetoothSerialLib(rt, hw, board), methods: {} };
  defineClass(S, 'BluetoothSerial', {
    ...bt,
    methods: {
      print: { ret: 'uint', print: true }, println: { ret: 'uint', print: true }, write: { ret: 'uint', args: ['raw', 'num'] }, available: { ret: 'int' }, read: { ret: 'int' }, peek: { ret: 'int' },
      begin: { ret: 'bool', args: ['raw', 'raw'] }, end: { ret: 'void' }, hasClient: { ret: 'bool' }, connected: { ret: 'bool' }, disconnect: { ret: 'bool' }, flush: { ret: 'void' }, enableSSP: { ret: 'void' },
      setPin: { ret: 'bool', args: ['raw'] }, register_callback: { ret: 'void', args: ['raw'] }, setTimeout: { ret: 'void' }, readString: { ret: 'String', gen: true }, readStringUntil: { ret: 'String', gen: true },
      parseInt: { ret: 'long', gen: true }, parseFloat: { ret: 'float', gen: true }, getBtAddressString: { ret: 'String' },
      printf: { ret: 'uint', printf: 1, args: ['str'] },
    },
  });

  Object.assign(S.constants, {
    HTTPC_ERROR_CONNECTION_REFUSED: -1, HTTPC_ERROR_SEND_HEADER_FAILED: -2, HTTPC_ERROR_SEND_PAYLOAD_FAILED: -3, HTTPC_ERROR_NOT_CONNECTED: -4, HTTPC_ERROR_CONNECTION_LOST: -5,
    HTTPC_ERROR_NO_STREAM: -6, HTTPC_ERROR_NO_HTTP_SERVER: -7, HTTPC_ERROR_TOO_LESS_RAM: -8, HTTPC_ERROR_ENCODING: -9, HTTPC_ERROR_STREAM_WRITE: -10, HTTPC_ERROR_READ_TIMEOUT: -11,
    HTTPC_DISABLE_FOLLOW_REDIRECTS: 0, HTTPC_STRICT_FOLLOW_REDIRECTS: 1, HTTPC_FORCE_FOLLOW_REDIRECTS: 2,
    HTTP_CODE_CONTINUE: 100, HTTP_CODE_OK: 200, HTTP_CODE_CREATED: 201, HTTP_CODE_ACCEPTED: 202, HTTP_CODE_NO_CONTENT: 204, HTTP_CODE_MOVED_PERMANENTLY: 301, HTTP_CODE_FOUND: 302, HTTP_CODE_SEE_OTHER: 303,
    HTTP_CODE_NOT_MODIFIED: 304, HTTP_CODE_TEMPORARY_REDIRECT: 307, HTTP_CODE_PERMANENT_REDIRECT: 308, HTTP_CODE_BAD_REQUEST: 400, HTTP_CODE_UNAUTHORIZED: 401, HTTP_CODE_FORBIDDEN: 403,
    HTTP_CODE_NOT_FOUND: 404, HTTP_CODE_METHOD_NOT_ALLOWED: 405, HTTP_CODE_REQUEST_TIMEOUT: 408, HTTP_CODE_TOO_MANY_REQUESTS: 429, HTTP_CODE_INTERNAL_SERVER_ERROR: 500,
    HTTP_CODE_BAD_GATEWAY: 502, HTTP_CODE_SERVICE_UNAVAILABLE: 503, HTTP_CODE_GATEWAY_TIMEOUT: 504,
    MQTT_CONNECTION_TIMEOUT: -4, MQTT_CONNECTION_LOST: -3, MQTT_CONNECT_FAILED: -2, MQTT_DISCONNECTED: -1, MQTT_CONNECTED: 0, MQTT_CONNECT_BAD_PROTOCOL: 1, MQTT_CONNECT_BAD_CLIENT_ID: 2,
    MQTT_CONNECT_UNAVAILABLE: 3, MQTT_CONNECT_BAD_CREDENTIALS: 4, MQTT_CONNECT_UNAUTHORIZED: 5,
    TS_OK_SUCCESS: 200, TS_ERR_BADAPIKEY: 400, TS_ERR_BADURL: -101, TS_ERR_OUT_OF_RANGE: -201, TS_ERR_INVALID_FIELD_NUM: -201, TS_ERR_SETFIELD_NOT_CALLED: -210, TS_ERR_CONNECT_FAILED: -301, TS_ERR_UNEXPECTED_FAIL: -302, TS_ERR_BAD_RESPONSE: -303, TS_ERR_TIMEOUT: -304, TS_ERR_NOT_INSERTED: -401,
    OK_SUCCESS: 200, ERR_NOT_INSERTED: -401, ERR_CONNECT_FAILED: -301,
  });
});

/** Function-like macros of the libraries (BLYNK_WRITE …) for the preprocessor. */
export const IOT_MACROS = {
  BLYNK_WRITE: { params: ['pin'], body: 'void BlynkWidgetWrite_ ## pin (BlynkParam &param)' },
  BLYNK_READ: { params: ['pin'], body: 'void BlynkWidgetRead_ ## pin (BlynkParam &param)' },
  BLYNK_CONNECTED: { params: [], body: 'void BlynkOnConnected_ ()' },
  BLYNK_DISCONNECTED: { params: [], body: 'void BlynkOnDisconnected_ ()' },
  BLYNK_APP_CONNECTED: { params: [], body: 'void BlynkOnAppConnected_ ()' },
};

export { HTTP };
