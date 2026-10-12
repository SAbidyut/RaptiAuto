// The real internet behind the virtual network (src/net/live.js), with a fake "real internet" so it
// runs offline: what goes out for real, what stays simulated, the fallback to the simulated services
// (with the real weather filled in) and sketches waiting for a real answer.
//   node tests/live.mjs
import { VirtualNet } from '../web/src/net/network.js';
import { runIot } from './iot-helpers.mjs';

let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '\n       ' + String(extra).replace(/\n/g, '\n       ') : '')); }
}

/** A fake real internet: `sites` maps a host to (req, url) → {status, body, headers} | 'down' | 'slow'. */
function fakeLive(sites = {}, { on = true } = {}) {
  const calls = [];
  const cache = new Map();
  const live = {
    calls, enabledFlag: on,
    get on() { return this.enabledFlag; },
    enabled() { return this.enabledFlag; },
    setEnabled(v) { this.enabledFlag = !!v; },
    async fetch(req) {
      const u = new URL(req.url);
      calls.push(req.method + ' ' + req.url);
      const f = sites[u.hostname];
      const r = f ? f(req, u) : 'down';
      if (r === 'down') return { failed: true, error: 'ERR_NAME_NOT_RESOLVED', statusText: 'Unable to resolve host' };
      if (r === 'slow') return new Promise((res) => setTimeout(() => res({ failed: true, error: 'ERR_TIMED_OUT', statusText: 'timed out' }), 300));
      await new Promise((res) => setTimeout(res, 20));
      return { status: r.status || 200, headers: r.headers || { 'content-type': 'text/html' }, body: r.body || '', url: r.url || req.url, live: true };
    },
    async weather(lat, lon) { calls.push(`weather ${lat},${lon}`); const w = { temp: 29.4, hum: 79, cloud: 40, code: 2, wmo: 2, wind: 3, windDir: 140, pressure: 1006, isDay: 1 }; cache.set(lat.toFixed(2) + ',' + lon.toFixed(2), w); return w; },
    peekWeather(lat, lon) { return cache.get(lat.toFixed(2) + ',' + lon.toFixed(2)) || null; },
    async geocode(name) { calls.push('geocode ' + name); return /^bogura$/i.test(name) ? ['Bogura', 24.85, 89.37, 'BD', 'Asia/Dhaka'] : null; },
  };
  return live;
}

const SITES = {
  'en.wikipedia.org': (req, u) => ({ body: `<html><head><title>${u.pathname.split('/').pop()} - Wikipedia</title></head><body><h1>Real page</h1></body></html>` }),
  'example.org': () => ({ body: '<title>Example Domain</title>' }),
  'api.ipify.org': () => ({ body: '37.111.200.9', headers: { 'content-type': 'text/plain' } }),
  'api.open-meteo.com': () => 'down',
  'api.openweathermap.org': () => ({ status: 401, body: '{"cod":401,"message":"Invalid API key"}', headers: { 'content-type': 'application/json' } }),
  'wttr.in': () => 'slow',
};

console.log('Routing');
{
  const live = fakeLive(SITES);
  const net = new VirtualNet({ live });
  check('a live network says so', net.isLive() && net.snapshot().live === true && net.snapshot().liveOn === true);
  check('any real domain resolves', !!net.resolve('en.wikipedia.org') && !!net.resolve('example.org'));
  check('a real site routes out', net.route(new URL('https://en.wikipedia.org/wiki/PLC')).live === true);
  for (const h of ['api.thingspeak.com', 'blynk.cloud', 'api.telegram.org', 'maker.ifttt.com', 'docs.rapti.net', 'start.rapti.net', 'pool.ntp.org', 'time.google.com'])
    check(`${h} stays simulated`, !net.route(new URL(`https://${h}/`)).live);
  check('rapti.net itself is real', net.route(new URL('http://rapti.net/')).live === true);
  check('.local names never go out', !!net.route(new URL('http://esp32.local/')).error);
  net.setInternet(false);
  check('router without internet: not live', !net.isLive() && !!net.route(new URL('https://example.org/')).error);
  net.setInternet(true);
  live.setEnabled(false);
  check('switched off: back to the simulator', !net.isLive() && !!net.route(new URL('https://example.org/')).error && !net.route(new URL('http://wttr.in/Dhaka')).live);
  check('a network without a live web is never live', !new VirtualNet({ live: null }).isLive());
}

console.log('Real answers and fallbacks');
{
  const live = fakeLive(SITES);
  const net = new VirtualNet({ live });
  let r = await net.request({ method: 'GET', url: 'https://en.wikipedia.org/wiki/Programmable_logic_controller', headers: {} }, null);
  check('a real page comes through', r.status === 200 && r.live && r.body.includes('Real page'), JSON.stringify(r).slice(0, 200));
  check('…and is logged as real', net.log.length && net.log[net.log.length - 1].live === true);
  r = await net.request({ method: 'GET', url: 'https://api.ipify.org/', headers: {} }, null);
  check('the real public IP', r.body === '37.111.200.9');
  r = await net.request({ method: 'GET', url: 'https://no-such-site.example/', headers: {} }, null);
  check('an unknown real site fails like a browser', r.failed && r.error === 'ERR_NAME_NOT_RESOLVED', JSON.stringify(r));
  // open-meteo is down → the simulated service answers with the real weather fetched by weather()
  r = await net.request({ method: 'GET', url: 'https://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41&current_weather=true', headers: {} }, null);
  let j = JSON.parse(r.body);
  check('open-meteo down → simulated answer with the real temperature', r.status === 200 && r.liveFallback && j.current_weather.temperature === 29.4 && j.current_weather.winddirection === 140, r.body);
  // OpenWeatherMap without a real key → simulated JSON with the real weather (city geocoded)
  r = await net.request({ method: 'GET', url: 'http://api.openweathermap.org/data/2.5/weather?q=Dhaka,BD&appid=demo&units=metric', headers: {} }, null);
  j = JSON.parse(r.body);
  check('OpenWeatherMap demo key → real Dhaka weather', r.status === 200 && j.name === 'Dhaka' && j.main.temp === 29.4 && j.main.humidity === 79, r.body);
  r = await net.request({ method: 'GET', url: 'http://api.openweathermap.org/data/2.5/weather?q=Bogura&appid=demo&units=metric', headers: {} }, null);
  j = JSON.parse(r.body);
  check('…a city the simulator does not know is geocoded', r.status === 200 && j.name === 'Bogura' && j.main.temp === 29.4 && live.calls.includes('geocode Bogura'), r.body);
  // wttr.in times out → simulated wttr with the real weather
  r = await net.request({ method: 'GET', url: 'http://wttr.in/Dhaka?format=3', headers: {} }, null);
  check('wttr.in slow → simulated, real temperature', r.status === 200 && /Dhaka: .* \+29°C/.test(r.body), r.body);
  // account services never go out
  const before = live.calls.length;
  r = await net.request({ method: 'GET', url: 'https://api.thingspeak.com/update?api_key=ABCD&field1=3', headers: {} }, null);
  check('ThingSpeak stays simulated (nothing sent)', live.calls.length === before && r.status === 200 && !r.live);
  // the simulated weather of the dashboard uses the cached real weather too
  r = net.requestSync({ method: 'GET', url: 'http://wttr.in/Dhaka?format=3', headers: {} }, null);
  check('cached real weather in a synchronous call', r.status === 200 && r.body.includes('+29°C'), r.body);
}

console.log('A sketch waits for the real internet');
{
  const live = fakeLive({
    ...SITES,
    'api.open-meteo.com': () => ({ body: JSON.stringify({ current: { temperature_2m: 30.1, relative_humidity_2m: 70 } }), headers: { 'content-type': 'application/json' } }),
  });
  const net = new VirtualNet({ live });
  const code = `#include <WiFi.h>
#include <HTTPClient.h>
void setup() {
  Serial.begin(115200);
  WiFi.begin("RaptiNet", "rapti1234");
  while (WiFi.status() != WL_CONNECTED) delay(200);
  HTTPClient http;
  http.begin("http://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41&current=temperature_2m");
  int code = http.GET();
  Serial.print("code ");
  Serial.println(code);
  Serial.println(http.getString());
  http.end();
  http.begin("http://api.thingspeak.com/update?api_key=K&field1=1");
  Serial.print("ts ");
  Serial.println(http.GET());
  http.end();
}
void loop() {}
`;
  const r = await runIot(code, { net, ms: 6000, between: async (eng, t) => { if (t % 160 === 0) await new Promise((res) => setTimeout(res, 5)); } });
  check('HTTPClient gets the real JSON', r.ok && r.serial.includes('code 200') && r.serial.includes('"temperature_2m":30.1'), JSON.stringify([r.serial, r.error, r.warns, live.calls]));
  check('ThingSpeak from a sketch stays simulated', r.serial.includes('ts 200') && !live.calls.some((c) => c.includes('thingspeak')), r.serial);
  r.stop && r.stop();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
