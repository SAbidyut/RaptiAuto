// The simulated internet: web services a sketch or a Python program can call. The data is made up
// (but changes with time and stays consistent), the URLs and JSON shapes follow the real services,
// so the same code works on real hardware later. Nothing leaves the phone.
import { http } from './network.js';
import { PAGES } from './pages.js';
import { dashboardPage, dashboardApi } from './dashboard.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed) => { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const pad = (n, w = 2) => String(n).padStart(w, '0');
const form = (req) => {
  const ct = req.headers['content-type'] || '';
  if (/json/.test(ct) || /^\s*[{[]/.test(req.body)) { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const o = {};
  for (const [k, v] of new URLSearchParams(req.body)) o[k] = v;
  return o;
};

/** Cities the weather services know: latitude, longitude, base temperature (°C), amplitude. */
const CITIES = {
  dhaka: ['Dhaka', 23.81, 90.41, 29, 5, 'BD', 'Asia/Dhaka', 21600], chittagong: ['Chittagong', 22.36, 91.78, 28, 4, 'BD', 'Asia/Dhaka', 21600], sylhet: ['Sylhet', 24.9, 91.87, 27, 5, 'BD', 'Asia/Dhaka', 21600],
  london: ['London', 51.5, -0.12, 12, 5, 'GB', 'Europe/London', 0], 'new york': ['New York', 40.71, -74, 14, 8, 'US', 'America/New_York', -18000], tokyo: ['Tokyo', 35.68, 139.69, 17, 7, 'JP', 'Asia/Tokyo', 32400],
  delhi: ['Delhi', 28.61, 77.2, 31, 7, 'IN', 'Asia/Kolkata', 19800], dubai: ['Dubai', 25.2, 55.27, 36, 6, 'AE', 'Asia/Dubai', 14400], paris: ['Paris', 48.85, 2.35, 13, 6, 'FR', 'Europe/Paris', 3600],
};
const cityByCoords = (lat, lon) => { let best = CITIES.dhaka, bd = 1e9; for (const c of Object.values(CITIES)) { const d = (c[1] - lat) ** 2 + (c[2] - lon) ** 2; if (d < bd) { bd = d; best = c; } } return best; };

/** Weather now at a city: smooth daily + slow random variation, same for everybody. */
function weatherNow(city, nowMs) {
  const [, , , base, amp, , , off] = city;
  const local = new Date(nowMs + off * 1000);
  const hr = local.getUTCHours() + local.getUTCMinutes() / 60;
  const wob = rnd(hash(city[0] + Math.floor(nowMs / 1800000)))();
  const temp = base + amp * Math.sin(((hr - 9) / 24) * Math.PI * 2) + (wob - 0.5) * 2;
  const hum = Math.max(25, Math.min(98, 72 - (temp - base) * 3.2 + (wob - 0.5) * 12));
  const cloud = Math.round(wob * 100);
  const code = cloud > 80 ? 61 : cloud > 55 ? 3 : cloud > 25 ? 2 : 0;
  return { temp, hum, cloud, code, wind: 2 + wob * 9, pressure: 1006 + wob * 14, hr, local };
}
const OWM_DESC = { 0: ['Clear', 'clear sky', '01d'], 2: ['Clouds', 'scattered clouds', '03d'], 3: ['Clouds', 'broken clouds', '04d'], 61: ['Rain', 'light rain', '10d'] };

/** Timezone clock: "2025-10-11T18:21:07.123456+06:00". */
function tzInfo(nowMs, offSec) {
  const d = new Date(nowMs + offSec * 1000);
  const sign = offSec < 0 ? '-' : '+', a = Math.abs(offSec);
  const off = `${sign}${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}`;
  const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}000${off}`;
  return { d, off, iso };
}

export function installServices(net) {
  const add = (names, h) => { for (const n of [].concat(names)) net.addHost(n, h); };
  const now = () => net.clock();

  // ---------------------------------------------------------------- static web pages
  for (const [host, pages] of Object.entries(PAGES)) {
    add(host, (req, u) => {
      const p = pages[u.pathname] || pages[u.pathname.replace(/\/$/, '')] || (u.pathname === '/' ? pages['/'] : null);
      if (!p) return http.html(`<!doctype html><title>404</title><body style="font-family:sans-serif;padding:40px"><h1>404 Not Found</h1><p>${host}${u.pathname} does not exist on this simulated site.</p></body>`, 404);
      return http.html(typeof p === 'function' ? p(u, net) : p);
    });
  }

  // ---------------------------------------------------------------- dashboard of the simulator
  add(['dashboard.rapti.net', 'iot.rapti.net', 'cloud.rapti.net'], (req, u) => {
    if (u.pathname.startsWith('/api/')) return dashboardApi(net, req, u);
    return http.html(dashboardPage(net));
  });

  // ---------------------------------------------------------------- httpbin
  add('httpbin.org', (req, u) => {
    const p = u.pathname;
    const base = { args: Object.fromEntries(u.searchParams), headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.replace(/(^|-)(\w)/g, (m, a, c) => a + c.toUpperCase()), v])), origin: '103.4.145.20', url: req.url };
    if (p === '/get') return http.json(base);
    if (['/post', '/put', '/patch', '/delete', '/anything'].includes(p) || p.startsWith('/anything/')) {
      let json = null; try { json = JSON.parse(req.body); } catch (e) { /* not json */ }
      return http.json({ ...base, data: req.body, json, form: json ? {} : Object.fromEntries(new URLSearchParams(req.body)), method: req.method });
    }
    if (p === '/headers') return http.json({ headers: base.headers });
    if (p === '/ip') return http.json({ origin: '103.4.145.20' });
    if (p === '/user-agent') return http.json({ 'user-agent': req.headers['user-agent'] || '' });
    if (p === '/uuid') return http.json({ uuid: crypto4(u.search + now()) });
    if (p === '/json') return http.json({ slideshow: { author: 'RAPTI', title: 'IoT with RaptiAuto', slides: [{ title: 'Sensors', type: 'all' }, { title: 'Cloud', type: 'all' }] } });
    if (p === '/html') return http.html('<html><body><h1>Herman Melville - Moby-Dick</h1><p>Call me Ishmael.</p></body></html>');
    let m = /^\/status\/(\d+)/.exec(p);
    if (m) return http.text('', +m[1]);
    m = /^\/delay\/(\d+)/.exec(p);
    if (m) return http.json(base);
    m = /^\/base64\/(.+)/.exec(p);
    if (m) { try { return http.text(atob(m[1])); } catch (e) { return http.text('Incorrect Base64 data', 400); } }
    return http.html('<h1>httpbin.org</h1><p>HTTP Request &amp; Response Service (simulated): /get /post /headers /ip /uuid /status/200 /json</p>');
  });

  // ---------------------------------------------------------------- jsonplaceholder
  const names = ['Leanne Graham', 'Ervin Howell', 'Clementine Bauch', 'Patricia Lebsack', 'Chelsey Dietrich', 'Mrs. Dennis Schulist', 'Kurtis Weissnat', 'Nicholas Runolfsdottir V', 'Glenna Reichert', 'Clementina DuBuque'];
  const todo = (i) => ({ userId: 1 + Math.floor((i - 1) / 20), id: i, title: ['delectus aut autem', 'quis ut nam facilis et officia qui', 'fugiat veniam minus', 'et porro tempora', 'laboriosam mollitia et enim quasi adipisci quia provident illum'][(i - 1) % 5], completed: i % 3 === 0 });
  add('jsonplaceholder.typicode.com', (req, u) => {
    const parts = u.pathname.split('/').filter(Boolean);
    const kind = parts[0], id = parts[1] ? +parts[1] : 0;
    if (req.method === 'POST') { const b = form(req); return http.json({ ...b, id: 101 }, 201); }
    if (req.method === 'PUT' || req.method === 'PATCH') return http.json({ ...form(req), id });
    if (req.method === 'DELETE') return http.json({});
    if (kind === 'todos') return id ? http.json(todo(id)) : http.json(Array.from({ length: 200 }, (_, i) => todo(i + 1)));
    if (kind === 'posts') { const post = (i) => ({ userId: 1 + Math.floor((i - 1) / 10), id: i, title: 'sunt aut facere repellat provident occaecati #' + i, body: 'quia et suscipit\nsuscipit recusandae consequuntur expedita et cum' }); return id ? http.json(post(id)) : http.json(Array.from({ length: 100 }, (_, i) => post(i + 1))); }
    if (kind === 'users') { const user = (i) => ({ id: i, name: names[(i - 1) % 10], username: names[(i - 1) % 10].split(' ')[0], email: names[(i - 1) % 10].split(' ')[0].toLowerCase() + '@rapti.net', address: { city: 'Dhaka' }, phone: '01700-000' + i }); return id ? http.json(user(id)) : http.json(Array.from({ length: 10 }, (_, i) => user(i + 1))); }
    return http.json({ posts: 100, todos: 200, users: 10 });
  });

  // ---------------------------------------------------------------- time
  add('worldtimeapi.org', (req, u) => {
    const m = /^\/api\/timezone\/(.+)$/.exec(u.pathname);
    if (u.pathname === '/api/ip' || u.pathname === '/api/timezone') return u.pathname === '/api/ip' ? tz('Asia/Dhaka', 21600) : http.json(['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Tokyo', 'Europe/London', 'America/New_York']);
    if (m) {
      const city = Object.values(CITIES).find((c) => c[6].toLowerCase() === decodeURIComponent(m[1]).toLowerCase());
      if (!city) return http.json({ error: 'unknown location' }, 404);
      return tz(city[6], city[7]);
    }
    return http.text('worldtimeapi.org (simulated)');
    function tz(name, off) {
      const t = tzInfo(now(), off);
      return http.json({ abbreviation: off === 21600 ? '+06' : 'UTC', client_ip: '103.4.145.20', datetime: t.iso, day_of_week: t.d.getUTCDay(), day_of_year: Math.floor((t.d - Date.UTC(t.d.getUTCFullYear(), 0, 0)) / 864e5), dst: false, dst_offset: 0, timezone: name, unixtime: Math.floor(now() / 1000), utc_datetime: new Date(now()).toISOString().replace('Z', '000+00:00'), utc_offset: t.off, week_number: 41 });
    }
  });
  add('timeapi.io', (req, u) => {
    const q = u.searchParams.get('timeZone') || 'Asia/Dhaka';
    const city = Object.values(CITIES).find((c) => c[6] === q) || CITIES.dhaka;
    const t = tzInfo(now(), city[7]);
    return http.json({ year: t.d.getUTCFullYear(), month: t.d.getUTCMonth() + 1, day: t.d.getUTCDate(), hour: t.d.getUTCHours(), minute: t.d.getUTCMinutes(), seconds: t.d.getUTCSeconds(), dateTime: t.iso.slice(0, 19), date: t.iso.slice(0, 10).split('-').reverse().join('/'), time: t.iso.slice(11, 16), timeZone: city[6], dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][t.d.getUTCDay()] });
  });

  // ---------------------------------------------------------------- weather
  add('api.open-meteo.com', (req, u) => {
    const lat = parseFloat(u.searchParams.get('latitude') ?? '23.81'), lon = parseFloat(u.searchParams.get('longitude') ?? '90.41');
    const city = cityByCoords(lat, lon);
    const w = weatherNow(city, now());
    const t = tzInfo(now(), 0);
    const out = { latitude: lat, longitude: lon, generationtime_ms: 0.05, utc_offset_seconds: 0, timezone: 'GMT', elevation: 8 };
    if (u.searchParams.get('current_weather') === 'true' || u.searchParams.has('current')) {
      out.current_weather = { temperature: +w.temp.toFixed(1), windspeed: +(w.wind * 3.6).toFixed(1), winddirection: 190, weathercode: w.code, is_day: w.hr > 6 && w.hr < 18 ? 1 : 0, time: t.iso.slice(0, 16) };
      out.current = { time: t.iso.slice(0, 16), temperature_2m: +w.temp.toFixed(1), relative_humidity_2m: Math.round(w.hum), wind_speed_10m: +(w.wind * 3.6).toFixed(1), weather_code: w.code, surface_pressure: +w.pressure.toFixed(1), cloud_cover: w.cloud };
    }
    if (u.searchParams.has('hourly')) {
      const hrs = Array.from({ length: 24 }, (_, i) => { const x = weatherNow(city, now() + i * 3600e3); return x; });
      out.hourly = { time: hrs.map((_, i) => new Date(now() + i * 3600e3).toISOString().slice(0, 13) + ':00'), temperature_2m: hrs.map((x) => +x.temp.toFixed(1)), relative_humidity_2m: hrs.map((x) => Math.round(x.hum)) };
    }
    return http.json(out);
  });
  add('api.openweathermap.org', (req, u) => {
    const key = u.searchParams.get('appid');
    if (!key) return http.json({ cod: 401, message: 'Invalid API key. Please see https://openweathermap.org/faq#error401 for more info.' }, 401);
    let city = null;
    if (u.searchParams.has('q')) city = CITIES[u.searchParams.get('q').split(',')[0].trim().toLowerCase()];
    else if (u.searchParams.has('lat')) city = cityByCoords(+u.searchParams.get('lat'), +u.searchParams.get('lon'));
    if (!city) return http.json({ cod: '404', message: 'city not found' }, 404);
    const w = weatherNow(city, now());
    const metric = u.searchParams.get('units') === 'metric', imperial = u.searchParams.get('units') === 'imperial';
    const T = (c) => (metric ? c : imperial ? c * 1.8 + 32 : c + 273.15);
    const d = OWM_DESC[w.code] || OWM_DESC[0];
    return http.json({ coord: { lon: city[2], lat: city[1] }, weather: [{ id: 800 + (w.code ? 1 : 0), main: d[0], description: d[1], icon: d[2] }], base: 'stations', main: { temp: +T(w.temp).toFixed(2), feels_like: +T(w.temp + 2).toFixed(2), temp_min: +T(w.temp - 1).toFixed(2), temp_max: +T(w.temp + 1).toFixed(2), pressure: Math.round(w.pressure), humidity: Math.round(w.hum) }, visibility: 10000, wind: { speed: +w.wind.toFixed(2), deg: 190 }, clouds: { all: w.cloud }, dt: Math.floor(now() / 1000), sys: { country: city[5], sunrise: 1760000000, sunset: 1760043000 }, timezone: city[7], id: hash(city[0]) % 1e7, name: city[0], cod: 200 });
  });
  add('wttr.in', (req, u) => {
    const city = CITIES[decodeURIComponent(u.pathname.slice(1)).toLowerCase()] || CITIES.dhaka;
    const w = weatherNow(city, now());
    const f = u.searchParams.get('format');
    if (f === '3') return http.text(`${city[0]}: ${w.code === 0 ? '☀️' : w.code === 61 ? '🌧' : '⛅'}  ${w.temp >= 0 ? '+' : ''}${Math.round(w.temp)}°C`);
    if (f === '1') return http.text(`${w.code === 0 ? '☀️' : '⛅'}  ${w.temp >= 0 ? '+' : ''}${Math.round(w.temp)}°C`);
    if (f === 'j1') return http.json({ current_condition: [{ temp_C: String(Math.round(w.temp)), humidity: String(Math.round(w.hum)), windspeedKmph: String(Math.round(w.wind * 3.6)), weatherDesc: [{ value: (OWM_DESC[w.code] || OWM_DESC[0])[1] }] }] });
    return http.text(`Weather report: ${city[0]}\n\n  ${w.code === 0 ? 'Sunny' : 'Partly cloudy'}  ${Math.round(w.temp)} °C\n  Wind ${Math.round(w.wind * 3.6)} km/h   Humidity ${Math.round(w.hum)} %\n`);
  });

  // ---------------------------------------------------------------- who am I
  add('api.ipify.org', (req, u) => (u.searchParams.get('format') === 'json' ? http.json({ ip: '103.4.145.20' }) : http.text('103.4.145.20')));
  add(['icanhazip.com', 'ifconfig.me', 'checkip.amazonaws.com'], () => http.text('103.4.145.20\n'));
  add(['ip-api.com', 'ipinfo.io'], () => http.json({ status: 'success', country: 'Bangladesh', countryCode: 'BD', region: 'C', regionName: 'Dhaka Division', city: 'Dhaka', zip: '1000', lat: 23.8103, lon: 90.4125, timezone: 'Asia/Dhaka', isp: 'RAPTI Broadband', org: 'RAPTI', query: '103.4.145.20', ip: '103.4.145.20', loc: '23.8103,90.4125' }));

  // ---------------------------------------------------------------- crypto price (for display demos)
  add('api.coingecko.com', (req, u) => {
    const ids = (u.searchParams.get('ids') || 'bitcoin').split(','), vs = (u.searchParams.get('vs_currencies') || 'usd').split(',');
    const base = { bitcoin: 67500, ethereum: 3400, dogecoin: 0.16, solana: 150 };
    const out = {};
    for (const id of ids) { const r = rnd(hash(id + Math.floor(now() / 20000)))(); out[id] = {}; for (const v of vs) out[id][v] = +(((base[id] || 100) * (0.97 + r * 0.06)) * (v === 'bdt' ? 120 : 1)).toFixed(2); }
    return http.json(out);
  });
  add('api.coindesk.com', () => http.json({ time: { updated: new Date(now()).toUTCString() }, bpi: { USD: { code: 'USD', rate_float: +(67500 * (0.97 + rnd(Math.floor(now() / 20000))() * 0.06)).toFixed(2) } } }));

  // ---------------------------------------------------------------- ThingSpeak
  const channelFor = (key) => {
    let ch = [...net.cloud.thingspeak.values()].find((c) => c.key === key || c.readKey === key);
    return ch || null;
  };
  const newChannel = (key) => {
    const id = 2000000 + (hash(key) % 700000);
    const ch = { id, key, readKey: key, name: 'Channel ' + id, fields: {}, entries: [], lastWrite: -1e12 };
    net.cloud.thingspeak.set(id, ch);
    return ch;
  };
  add(['api.thingspeak.com', 'thingspeak.com', 'www.thingspeak.com'], (req, u) => {
    const p = u.pathname;
    if (p === '/update' || p === '/update.json') {
      const b = req.method === 'POST' ? form(req) : {};
      const get = (k) => u.searchParams.get(k) ?? b[k];
      const key = get('api_key') || req.headers['x-thingspeak-api-key'];
      if (!key) return http.text('-1', 400);
      let ch = channelFor(key) || newChannel(key);
      // the free plan accepts one update every 15 seconds
      if (now() - ch.lastWrite < 15000) return p.endsWith('.json') ? http.json({}) : http.text('0');
      const entry = { entry_id: ch.entries.length + 1, created_at: new Date(now()).toISOString().replace(/\.\d+Z/, 'Z') };
      let any = false;
      for (let i = 1; i <= 8; i++) { const v = get('field' + i); if (v !== undefined && v !== null) { entry['field' + i] = String(v); ch.fields[i] = ch.fields[i] || 'Field ' + i; any = true; } }
      if (get('status')) entry.status = get('status');
      if (!any) return p.endsWith('.json') ? http.json({}) : http.text('0');
      ch.entries.push(entry);
      ch.lastWrite = now();
      net.changed();
      return p.endsWith('.json') ? http.json(ch.entries[ch.entries.length - 1]) : http.text(String(entry.entry_id));
    }
    let m = /^\/channels\/(\d+)\/(feeds|fields\/(\d))(\/last)?(\.json|\.csv|\.txt|\.xml)?$/.exec(p);
    if (m) {
      const ch = net.cloud.thingspeak.get(+m[1]);
      if (!ch) return http.json(-1, 404);
      const n = Math.max(1, Math.min(8000, +(u.searchParams.get('results') || (m[4] ? 1 : 100))));
      let rows = ch.entries.slice(-n);
      if (m[4]) rows = ch.entries.slice(-1);
      if (m[3]) {
        const f = 'field' + m[3];
        if (m[4] && m[5] === '.txt') return http.text(rows[0] ? rows[0][f] ?? '' : '');
        if (m[4]) return http.json(rows[0] ? { created_at: rows[0].created_at, entry_id: rows[0].entry_id, [f]: rows[0][f] } : -1);
        return http.json({ channel: { id: ch.id, name: ch.name, last_entry_id: ch.entries.length }, feeds: rows.map((r) => ({ created_at: r.created_at, entry_id: r.entry_id, [f]: r[f] })) });
      }
      if (m[4]) return http.json(rows[0] || -1);
      return http.json({ channel: { id: ch.id, name: ch.name, last_entry_id: ch.entries.length, ...Object.fromEntries(Object.entries(ch.fields).map(([i, n]) => ['field' + i, n])) }, feeds: rows });
    }
    m = /^\/channels\/(\d+)\/?$/.exec(p);
    if (m && net.cloud.thingspeak.get(+m[1])) return http.html(thingspeakPage(net.cloud.thingspeak.get(+m[1])));
    if (p === '/' || p === '/channels') return http.html('<h1>ThingSpeak (simulated)</h1><p>Write: /update?api_key=KEY&amp;field1=23.5 — read: /channels/ID/feeds.json</p>');
    return http.text('Not found', 404);
  });

  // ---------------------------------------------------------------- Blynk
  const blynkFor = (token) => { let b = net.cloud.blynk.get(token); if (!b) { b = { token, online: true, pins: new Map() }; net.cloud.blynk.set(token, b); } return b; };
  add(['blynk.cloud', 'blynk-cloud.com', 'sgp1.blynk.cloud', 'fra1.blynk.cloud', 'ny3.blynk.cloud'], (req, u) => {
    const token = u.searchParams.get('token');
    const p = u.pathname.replace(/^\/external\/api/, '');
    if (!token) return http.json({ error: { message: 'Invalid token' } }, 400);
    const b = blynkFor(token);
    if (p === '/update') {
      for (const [k, v] of u.searchParams) if (/^(v|V)\d+$/.test(k)) b.pins.set(k.toUpperCase(), v);
      net.changed();
      return http.text('', 200);
    }
    if (p === '/get') {
      const out = {};
      for (const [k] of u.searchParams) if (/^(v|V)\d+$/.test(k)) out[k] = b.pins.get(k.toUpperCase()) ?? '';
      const keys = Object.keys(out);
      return keys.length === 1 ? http.text(out[keys[0]]) : http.json(out);
    }
    if (p === '/isHardwareConnected') return http.text(String(b.online));
    if (p === '/logEvent') { net.note('blynk', 'Blynk event: ' + (u.searchParams.get('event') || ''), u.searchParams.get('description') || ''); return http.text('', 200); }
    return http.text('', 404);
  });

  // ---------------------------------------------------------------- IFTTT, Telegram, Slack, Discord
  add('maker.ifttt.com', (req, u) => {
    const m = /^\/trigger\/([^/]+)\/(json\/)?with\/key\/([^/]+)/.exec(u.pathname);
    if (!m) return http.text('{"errors":[{"message":"You sent an invalid request"}]}', 400);
    const b = req.method === 'POST' ? form(req) : {};
    const vals = ['value1', 'value2', 'value3'].map((k) => u.searchParams.get(k) ?? b[k] ?? '').filter(Boolean);
    net.note('ifttt', 'IFTTT event "' + decodeURIComponent(m[1]) + '"', vals.join(' · ') || '(no values)');
    return http.text(`Congratulations! You've fired the ${decodeURIComponent(m[1])} event`);
  });
  add('api.telegram.org', (req, u) => {
    const m = /^\/bot([^/]+)\/(\w+)/.exec(u.pathname);
    if (!m) return http.json({ ok: false, error_code: 404, description: 'Not Found' }, 404);
    const [, token, method] = m;
    if (!/^\d+:[\w-]{10,}$/.test(token)) return http.json({ ok: false, error_code: 401, description: 'Unauthorized' }, 401);
    const b = req.method === 'POST' ? form(req) : {};
    const get = (k) => u.searchParams.get(k) ?? b[k];
    if (method === 'getMe') return http.json({ ok: true, result: { id: +token.split(':')[0], is_bot: true, first_name: 'RaptiBot', username: 'rapti_demo_bot' } });
    if (method === 'sendMessage') {
      if (!get('chat_id') || !get('text')) return http.json({ ok: false, error_code: 400, description: 'Bad Request: chat not found or text is empty' }, 400);
      net.note('telegram', 'Telegram → chat ' + get('chat_id'), get('text'));
      return http.json({ ok: true, result: { message_id: net.notes.length, chat: { id: +get('chat_id') }, date: Math.floor(now() / 1000), text: get('text') } });
    }
    if (method === 'getUpdates') {
      const off = +(get('offset') || 0);
      const list = net.cloud.telegram.inbox.filter((x) => x.update_id >= off);
      return http.json({ ok: true, result: list });
    }
    return http.json({ ok: true, result: true });
  });
  add(['hooks.slack.com', 'discord.com', 'discordapp.com', 'webhook.site', 'ntfy.sh'], (req, u) => {
    const b = form(req);
    const text = b.text || b.content || req.body || '(empty)';
    net.note(u.hostname.includes('slack') ? 'slack' : u.hostname.includes('discord') ? 'discord' : 'webhook', 'Webhook ' + u.hostname + u.pathname.slice(0, 24), String(text).slice(0, 200));
    return u.hostname.includes('slack') ? http.text('ok') : http.text('', 204);
  });

  // ---------------------------------------------------------------- Adafruit IO
  add('io.adafruit.com', (req, u) => {
    const key = req.headers['x-aio-key'] || u.searchParams.get('x-aio-key');
    if (!key) return http.json({ error: 'missing or invalid AIO key' }, 401);
    const m = /^\/api\/v2\/([^/]+)\/feeds\/([^/]+)\/data(\/last)?/.exec(u.pathname);
    if (!m) return http.json({ ok: true });
    const feed = m[1] + '/' + m[2];
    if (!net.cloud.adafruit.has(feed)) net.cloud.adafruit.set(feed, []);
    const rows = net.cloud.adafruit.get(feed);
    if (req.method === 'POST') { const b = form(req); const row = { id: String(rows.length + 1), value: String(b.value ?? ''), feed_key: m[2], created_at: new Date(now()).toISOString() }; rows.push(row); net.changed(); return http.json(row, 200); }
    if (m[3]) return http.json(rows[rows.length - 1] || {});
    return http.json(rows.slice(-50).reverse());
  });
}

function crypto4(seed) { const r = rnd(hash(seed)); const h = () => Math.floor(r() * 65536).toString(16).padStart(4, '0'); return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`; }

function thingspeakPage(ch) {
  const f = Object.keys(ch.fields).map(Number);
  const charts = f.map((i) => {
    const vals = ch.entries.map((e) => parseFloat(e['field' + i])).filter((v) => Number.isFinite(v));
    const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
    const pts = vals.map((v, k) => `${(k / Math.max(1, vals.length - 1)) * 300},${70 - ((v - lo) / span) * 60}`).join(' ');
    return `<div class="c"><h3>${ch.fields[i]}</h3><svg viewBox="0 0 300 80"><polyline fill="none" stroke="#06b6d4" stroke-width="2" points="${pts}"/></svg><b>${vals.length ? vals[vals.length - 1] : '—'}</b></div>`;
  }).join('');
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>${ch.name} - ThingSpeak</title><style>body{font-family:sans-serif;background:#f6f8fa;margin:0}header{background:#ff7a00;color:#fff;padding:14px 18px;font-weight:700}.c{display:inline-block;width:300px;margin:12px;background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px}b{font-size:22px}</style><header>ThingSpeak · ${ch.name} (ID ${ch.id}) · ${ch.entries.length} entries</header>${charts || '<p style="padding:20px">No data yet — write with /update?api_key=…&amp;field1=…</p>'}`;
}
