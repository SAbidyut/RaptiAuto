// The real internet behind the simulated one. When the phone is online and Settings → Real internet
// is on, a request the simulator does not have to fake goes out for real: the weather, the time, IP
// and price APIs, httpbin, JSON test APIs and any web page the Raspberry Pi's Chromium opens. In the
// Android app the request is made by the host (RaptiNative.httpRequest: no CORS or mixed-content
// limits); in a desktop browser it is a plain fetch() (only APIs that allow CORS work there).
// Services that need your own account (ThingSpeak, Blynk, Telegram, IFTTT, webhooks …) stay simulated,
// so their data shows in the IoT dashboard. Headless tests never use this (no live object is set).
import { BRIDGE_KEY } from '../bridge-key.js';

let seq = 0;
const pending = new Map();

/** Answer of the Android host (see installNativeCallbacks). */
export function onNativeHttp(id, res) {
  const f = pending.get(id);
  if (f) { pending.delete(id); f(res || { error: 'no answer' }); }
}

const native = () => (typeof window !== 'undefined' && window.RaptiNative && typeof window.RaptiNative.httpRequest === 'function' ? window.RaptiNative : null);
// headers a browser refuses to set (fetch would throw)
const FORBIDDEN = /^(host|connection|content-length|user-agent|accept-encoding|cookie|origin|referer|keep-alive|transfer-encoding|upgrade|date|expect|via)$/i;

async function browserFetch(req) {
  let url = req.url;
  // an https page may not fetch http:// — most APIs answer on https as well
  if (typeof location !== 'undefined' && location.protocol === 'https:') url = url.replace(/^http:/i, 'https:');
  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) if (!FORBIDDEN.test(k)) headers[k] = v;
  const m = (req.method || 'GET').toUpperCase();
  const r = await fetch(url, { method: m, headers, body: m === 'GET' || m === 'HEAD' || !req.body ? undefined : req.body, redirect: 'follow', credentials: 'omit' });
  const body = m === 'HEAD' ? '' : await r.text();
  const hs = {};
  r.headers.forEach((v, k) => { hs[k.toLowerCase()] = v; });
  return { status: r.status, url: r.url || url, headers: hs, body };
}

/** Weather codes of open-meteo (WMO) the simulated services understand. */
const simCode = (c) => (c >= 51 ? 61 : c >= 3 ? 3 : c >= 1 ? 2 : 0);

export class LiveWeb {
  /** enabled(): Settings → Real internet; setEnabled(on) changes it (IoT dashboard switch). */
  constructor({ enabled = () => true, setEnabled = () => {} } = {}) {
    this.enabled = enabled;
    this.setEnabled = setEnabled;
    this.weatherCache = new Map(); // "lat,lon" → { at, w }
    this.geo = new Map();          // city name → [name, lat, lon, cc, tz, offset]
    this.stats = { ok: 0, failed: 0, last: '' };
  }

  get on() { return !!this.enabled() && (typeof navigator === 'undefined' || navigator.onLine !== false); }
  get native() { return !!native(); }

  /** One real request → { status, statusText, headers, body, url, live } or { failed, error, statusText }. */
  fetch(req, timeoutMs = 10000) {
    const n = native();
    const run = n
      ? new Promise((resolve) => {
        const id = 'h' + (++seq);
        pending.set(id, resolve);
        try { n.httpRequest(BRIDGE_KEY, id, (req.method || 'GET').toUpperCase(), req.url, JSON.stringify(req.headers || {}), req.body || ''); } catch (e) { pending.delete(id); resolve({ error: String(e && e.message) }); }
      })
      : browserFetch(req).catch((e) => ({ error: (e && e.message) || 'Failed to fetch' }));
    let timer;
    const limit = new Promise((resolve) => { timer = setTimeout(() => resolve({ error: 'timed out' }), timeoutMs); });
    return Promise.race([run, limit]).then((r) => {
      clearTimeout(timer);
      if (!r || r.error || !r.status) {
        this.stats.failed++; this.stats.last = (r && r.error) || 'failed';
        return { failed: true, error: /timed out/i.test((r && r.error) || '') ? 'ERR_TIMED_OUT' : 'ERR_NAME_NOT_RESOLVED', statusText: (r && r.error) || 'failed' };
      }
      this.stats.ok++;
      return { status: r.status, headers: r.headers || {}, body: r.body == null ? '' : String(r.body), url: r.url || req.url, live: true };
    });
  }

  /** Real weather now at lat / lon (open-meteo, cached 10 min); null when it cannot be had. */
  async weather(lat, lon) {
    const key = lat.toFixed(2) + ',' + lon.toFixed(2);
    const c = this.weatherCache.get(key);
    if (c && Date.now() - c.at < 600000) return c.w;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,is_day,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m&timezone=auto`;
    const r = await this.fetch({ method: 'GET', url, headers: { accept: 'application/json' } }, 8000);
    if (r.failed || r.status !== 200) return c ? c.w : null;
    try {
      const j = JSON.parse(r.body).current;
      const w = { temp: j.temperature_2m, hum: j.relative_humidity_2m, cloud: j.cloud_cover, code: simCode(j.weather_code), wmo: j.weather_code, wind: j.wind_speed_10m / 3.6, windDir: j.wind_direction_10m, pressure: j.surface_pressure, isDay: j.is_day, time: j.time };
      this.weatherCache.set(key, { at: Date.now(), w });
      return w;
    } catch (e) { return c ? c.w : null; }
  }

  /** Cached real weather (synchronous, for the simulated services). */
  peekWeather(lat, lon) {
    const c = this.weatherCache.get(lat.toFixed(2) + ',' + lon.toFixed(2));
    return c && Date.now() - c.at < 1800000 ? c.w : null;
  }

  /** Coordinates of a city name (open-meteo geocoding, cached). */
  async geocode(name) {
    const k = String(name || '').trim().toLowerCase();
    if (!k) return null;
    if (this.geo.has(k)) return this.geo.get(k);
    const r = await this.fetch({ method: 'GET', url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`, headers: {} }, 7000);
    let out = null;
    try { const g = !r.failed && JSON.parse(r.body).results; if (g && g[0]) out = [g[0].name, g[0].latitude, g[0].longitude, g[0].country_code || '', g[0].timezone || 'UTC']; } catch (e) { out = null; }
    this.geo.set(k, out);
    return out;
  }
}

let current = null;
/** The live web the app uses (set once at start-up); null in tests and when there is none. */
export function setLiveWeb(l) { current = l; }
export function liveWeb() { return current; }
