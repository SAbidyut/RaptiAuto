// More simulated web services for the IoT examples: air quality, prayer times, sunrise / sunset,
// exchange rates, where the ISS is, quotes and earthquakes, plus the daily forecast of open-meteo.
// Like cloud.js the URLs and the JSON follow the real services, so with Settings → Real internet on
// the very same code gets the real data; offline (or when the real service fails) these answer.
// The sun is computed (NOAA formulas), so sunrise, sunset and prayer times are right for the place.
import { http } from './network.js';

const pad = (n, w = 2) => String(n).padStart(w, '0');
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const rnd = (seed) => { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const RAD = Math.PI / 180;
const DAY = 86400000;

// ------------------------------------------------------------------ the sun
/** Declination (rad) and equation of time (minutes) on the UTC day of `ms`. */
function sunOf(ms) {
  const d = new Date(ms);
  const n = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  return { decl, eq };
}

/**
 * Times of the sun on a local date at lat / lon, as UTC ms. `dayMs` is Date.UTC(y, m, d) of that date
 * (the NOAA formulas give minutes from UTC midnight of the date; east of Greenwich sunrise can be < 0).
 * noon, [morning, evening] for the zenith angles of sunrise and the twilights (null near the poles),
 * and Asr (shadow = the object + its noon shadow).
 */
function sunTimes(dayMs, lat, lon, offSec) {
  const { decl, eq } = sunOf(dayMs + 12 * 3600000 - offSec * 1000);
  const noonMin = 720 - 4 * lon - eq;
  const pair = (zenith) => {
    const c = Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (c < -1 || c > 1) return [null, null];
    const h = Math.acos(c) / RAD;
    return [dayMs + (noonMin - 4 * h) * 60000, dayMs + (noonMin + 4 * h) * 60000];
  };
  const asrAlt = (k) => Math.atan(1 / (k + Math.tan(Math.abs(lat * RAD - decl)))) / RAD;
  return {
    noon: dayMs + noonMin * 60000, pair,
    rise: pair(90.833), civil: pair(96), nautical: pair(102), astro: pair(108),
    asr: pair(90 - asrAlt(1))[1], asrHanafi: pair(90 - asrAlt(2))[1],
  };
}

/** Local day (UTC ms of the local date's midnight, as if UTC) for `ms` at offset `offSec`. */
const localDay = (ms, offSec) => { const d = new Date(ms + offSec * 1000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const hhmm = (ms, offSec) => { if (ms == null) return '--:--'; const d = new Date(ms + offSec * 1000); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const isoAt = (ms, offSec, seconds = true) => {
  const d = new Date(ms + offSec * 1000);
  const s = offSec < 0 ? '-' : '+', a = Math.abs(offSec);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${seconds ? ':' + pad(d.getUTCSeconds()) : ''}${seconds ? `${s}${pad(Math.floor(a / 3600))}:${pad(Math.floor((a % 3600) / 60))}` : ''}`;
};
const ampm = (ms, offSec) => { const d = new Date(ms + offSec * 1000); const h = d.getUTCHours(); return `${h % 12 || 12}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'AM' : 'PM'}`; };
const hms = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(Math.floor(sec % 60))}`;

// ------------------------------------------------------------------ Hijri date (tabular Islamic calendar)
const HIJRI_MONTHS = ['Muḥarram', 'Ṣafar', 'Rabīʿ al-awwal', 'Rabīʿ al-thānī', 'Jumādá al-ūlá', 'Jumādá al-ākhirah', 'Rajab', 'Shaʿbān', 'Ramaḍān', 'Shawwāl', 'Dhū al-Qaʿdah', 'Dhū al-Ḥijjah'];
function hijriOf(dayMs) {
  let l = Math.floor(dayMs / DAY + 2440587.5 + 0.5) - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const m = Math.floor((24 * l) / 709);
  return { d: l - Math.floor((709 * m) / 24), m, y: 30 * n + j - 30 };
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ------------------------------------------------------------------ data
const CURRENCIES = { USD: 1, BDT: 121.9, EUR: 0.861, GBP: 0.748, INR: 88.6, PKR: 281.2, NPR: 141.7, JPY: 151.3, CNY: 7.12, AED: 3.6725, SAR: 3.75, QAR: 3.64, KWD: 0.3062, OMR: 0.3845, MYR: 4.21, SGD: 1.297, CAD: 1.398, AUD: 1.53, CHF: 0.8, KRW: 1418, THB: 32.6, LKR: 302, IDR: 16540, TRY: 41.8, RUB: 81.2 };
const PM25 = { Dhaka: 72, Chittagong: 44, Sylhet: 36, Delhi: 88, Dubai: 31, London: 9, Paris: 11, 'New York': 8, Tokyo: 10 };
const QUOTES = [
  ['The best way to predict the future is to invent it.', 'Alan Kay'],
  ['Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
  ['Imagination is more important than knowledge.', 'Albert Einstein'],
  ['Any sufficiently advanced technology is indistinguishable from magic.', 'Arthur C. Clarke'],
  ['I have not failed. I\'ve just found 10,000 ways that won\'t work.', 'Thomas A. Edison'],
  ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
  ['If I have seen further it is by standing on the shoulders of giants.', 'Isaac Newton'],
  ['Programs must be written for people to read, and only incidentally for machines to execute.', 'Harold Abelson'],
  ['Nothing in life is to be feared, it is only to be understood.', 'Marie Curie'],
  ['Education is the most powerful weapon which you can use to change the world.', 'Nelson Mandela'],
  ['It always seems impossible until it\'s done.', 'Nelson Mandela'],
  ['Learning never exhausts the mind.', 'Leonardo da Vinci'],
  ['Dream is not that which you see while sleeping, it is something that does not let you sleep.', 'A. P. J. Abdul Kalam'],
  ['If you want to shine like a sun, first burn like a sun.', 'A. P. J. Abdul Kalam'],
  ['The important thing is not to stop questioning.', 'Albert Einstein'],
  ['Stay hungry, stay foolish.', 'Steve Jobs'],
  ['The only way to do great work is to love what you do.', 'Steve Jobs'],
  ['First, solve the problem. Then, write the code.', 'John Johnson'],
  ['Done is better than perfect.', 'Sheryl Sandberg'],
  ['Science is organized knowledge. Wisdom is organized life.', 'Immanuel Kant'],
];
// seismically active places: [place, lat, lon, typical depth km]
const QUAKE_PLACES = [
  ['Hualien City, Taiwan', 23.9, 121.6, 20], ['Kermadec Islands, New Zealand', -29.8, -177.6, 35], ['Fiji region', -17.9, -178.2, 560], ['Tobelo, Indonesia', 1.8, 127.9, 60],
  ['Mindanao, Philippines', 6.9, 126.6, 45], ['Hindu Kush region, Afghanistan', 36.5, 70.8, 200], ['Myanmar-India border region', 24.7, 94.6, 55], ['Tonga', -20.2, -174.3, 80],
  ['Kokopo, Papua New Guinea', -4.6, 152.5, 40], ['Kuril Islands', 46.4, 151.9, 50], ['near the coast of central Chile', -33.1, -71.9, 30], ['southern Alaska', 59.8, -152.9, 90],
  ['Honshu, Japan', 37.3, 141.9, 40], ['Sumbawa, Indonesia', -8.6, 117.9, 25], ['Sylhet, Bangladesh', 24.6, 91.9, 30], ['Kathmandu, Nepal', 27.9, 85.4, 15],
];
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** US EPA AQI from PM2.5 (µg/m³). */
function usAqi(pm) {
  const B = [[0, 9, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 500, 301, 500]];
  const b = B.find(([lo, hi]) => pm <= hi) || B[B.length - 1];
  return Math.round(b[2] + ((b[3] - b[2]) * (Math.min(pm, 500) - b[0])) / (b[1] - b[0]));
}

/** The ISS on a simple circular orbit (51.6°, 92.7 min) — good enough to watch it go round. */
function issAt(ms) {
  const t = ms / 1000;
  const P = 5561, inc = 51.64 * RAD;
  const u = ((2 * Math.PI) * (t % P)) / P + 1.3;
  const lat = Math.asin(Math.sin(inc) * Math.sin(u)) / RAD;
  let lon = Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) / RAD + 40 - (t / 86164) * 360 - (t / 86400) * 5;
  lon = ((lon % 360) + 540) % 360 - 180;
  return { lat, lon, alt: 417 + 3 * Math.sin(u * 2), vel: 27580 + 30 * Math.cos(u) };
}

/** Is the ground under (lat, lon) in daylight at `ms`? */
function daylight(ms, lat, lon) {
  const { decl, eq } = sunOf(ms);
  const d = new Date(ms);
  const solarMin = d.getUTCHours() * 60 + d.getUTCMinutes() + eq + 4 * lon;
  const ha = (solarMin / 4 - 180) * RAD;
  return Math.sin(lat * RAD) * Math.sin(decl) + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(ha) > 0;
}

export function installMoreServices(net, { add, now, cityNamed, cityByCoords, CITIES, wx, weatherNow }) {
  /** City tuple and offset for a request with lat / lon (or latitude / longitude) or a city name. */
  const place = (u, latKey = 'latitude', lonKey = 'longitude') => {
    const la = parseFloat(u.searchParams.get(latKey) ?? u.searchParams.get('lat')), lo = parseFloat(u.searchParams.get(lonKey) ?? u.searchParams.get('lng') ?? u.searchParams.get('lon'));
    if (Number.isFinite(la) && Number.isFinite(lo)) {
      const c = cityByCoords(la, lo);
      const near = (c[1] - la) ** 2 + (c[2] - lo) ** 2 < 25;
      return { city: [near ? c[0] : `${la.toFixed(2)},${lo.toFixed(2)}`, la, lo, c[3], c[4], c[5], near ? c[6] : 'UTC', near ? c[7] : Math.round(lo / 15) * 3600], lat: la, lon: lo };
    }
    const c = CITIES.dhaka;
    return { city: c, lat: c[1], lon: c[2] };
  };
  const tzOf = (u, city) => { const tz = u.searchParams.get('timezone') || u.searchParams.get('tzid'); return !tz ? ['GMT', 0] : tz === 'auto' || tz === city[6] ? [city[6], city[7]] : (Object.values(CITIES).find((c) => c[6] === tz) || [0, 0, 0, 0, 0, 0, 'GMT', 0]).slice(6, 8); };

  // ---------------------------------------------------------------- open-meteo: air quality
  add('air-quality-api.open-meteo.com', (req, u) => {
    const { city, lat, lon } = place(u);
    const [tzName, off] = tzOf(u, city);
    const base = PM25[city[0]] ?? 15;
    const pmAt = (t) => {
      const hr = new Date(t + city[7] * 1000).getUTCHours();
      const wob = rnd(hash(city[0] + 'aq' + Math.floor(t / 3600000)))();
      return Math.max(2, base * (1 + 0.35 * Math.cos(((hr - 7) / 24) * 2 * Math.PI)) * (0.85 + wob * 0.3));
    };
    const vals = (t) => {
      const pm = pmAt(t);
      return { pm2_5: +pm.toFixed(1), pm10: +(pm * 1.45).toFixed(1), us_aqi: usAqi(pm), european_aqi: Math.round(Math.min(100, pm * 1.6 + 8)), carbon_monoxide: Math.round(180 + pm * 9), nitrogen_dioxide: +(8 + pm * 0.5).toFixed(1), sulphur_dioxide: +(3 + pm * 0.2).toFixed(1), ozone: Math.round(40 + 30 * Math.sin(((new Date(t + city[7] * 1000).getUTCHours() - 9) / 24) * 2 * Math.PI)), dust: +(pm * 0.3).toFixed(1), uv_index: +Math.max(0, 7 * Math.sin(((new Date(t + city[7] * 1000).getUTCHours() - 6) / 12) * Math.PI)).toFixed(2) };
    };
    const UNITS = { pm2_5: 'μg/m³', pm10: 'μg/m³', us_aqi: 'USAQI', european_aqi: 'EAQI', carbon_monoxide: 'μg/m³', nitrogen_dioxide: 'μg/m³', sulphur_dioxide: 'μg/m³', ozone: 'μg/m³', dust: 'μg/m³', uv_index: '' };
    const out = { latitude: lat, longitude: lon, generationtime_ms: 0.08, utc_offset_seconds: off, timezone: tzName, timezone_abbreviation: tzName === 'GMT' ? 'GMT' : `GMT${off >= 0 ? '+' : ''}${off / 3600}`, elevation: 8 };
    const hourStart = Math.floor(now() / 3600000) * 3600000;
    const pick = (list, v) => Object.fromEntries(list.filter((k) => k in v).map((k) => [k, v[k]]));
    if (u.searchParams.has('current')) {
      const list = u.searchParams.get('current').split(',');
      out.current_units = { time: 'iso8601', interval: 'seconds', ...pick(list, UNITS) };
      out.current = { time: isoAt(hourStart, off, false), interval: 3600, ...pick(list, vals(now())) };
    }
    if (u.searchParams.has('hourly')) {
      const list = u.searchParams.get('hourly').split(',');
      const day0 = localDay(now(), off) - off * 1000;
      const n = 24 * Math.min(7, +(u.searchParams.get('forecast_days') || 5));
      const rows = Array.from({ length: n }, (_, i) => day0 + i * 3600000);
      out.hourly_units = { time: 'iso8601', ...pick(list, UNITS) };
      out.hourly = { time: rows.map((t) => isoAt(t, off, false)) };
      for (const k of list) if (k in UNITS) out.hourly[k] = rows.map((t) => vals(t)[k]);
    }
    return http.json(out);
  });

  // ---------------------------------------------------------------- prayer times (AlAdhan)
  const METHODS = { 1: 'University of Islamic Sciences, Karachi', 2: 'Islamic Society of North America (ISNA)', 3: 'Muslim World League', 4: 'Umm Al-Qura University, Makkah', 5: 'Egyptian General Authority of Survey' };
  const ANGLES = { 1: [18, 18], 2: [15, 15], 3: [18, 17], 4: [18.5, null], 5: [19.5, 17.5] };
  const prayerDay = (city, dayMs, method, school) => {
    const [, lat, lon, , , , tzName, off] = city;
    const s = sunTimes(dayMs, lat, lon, off);
    const [fa, ia] = ANGLES[method] || ANGLES[1];
    const fajr = s.pair(90 + fa)[0];
    const sunset = s.rise[1];
    const isha = ia ? s.pair(90 + ia)[1] : sunset + 90 * 60000;
    const asr = school === 1 ? s.asrHanafi : s.asr;
    const nextRise = sunTimes(dayMs + DAY, lat, lon, off).rise[0];
    const night = nextRise - sunset;
    const T = (ms) => hhmm(ms, off);
    return {
      timings: { Fajr: T(fajr), Sunrise: T(s.rise[0]), Dhuhr: T(s.noon + 60000), Asr: T(asr), Sunset: T(sunset), Maghrib: T(sunset), Isha: T(isha), Imsak: T(fajr - 600000), Midnight: T(sunset + night / 2), Firstthird: T(sunset + night / 3), Lastthird: T(sunset + (2 * night) / 3) },
      tzName, off,
    };
  };
  const aladhanDate = (dayMs, city, method, school) => {
    const d = new Date(dayMs);
    const hj = hijriOf(dayMs);
    return {
      readable: `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`,
      timestamp: String(Math.floor((dayMs - city[7] * 1000 + 3600000) / 1000)),
      gregorian: { date: `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`, format: 'DD-MM-YYYY', day: pad(d.getUTCDate()), weekday: { en: WEEKDAYS[d.getUTCDay()] }, month: { number: d.getUTCMonth() + 1, en: MONTHS[d.getUTCMonth()] }, year: String(d.getUTCFullYear()), designation: { abbreviated: 'AD', expanded: 'Anno Domini' } },
      hijri: { date: `${pad(hj.d)}-${pad(hj.m)}-${hj.y}`, format: 'DD-MM-YYYY', day: pad(hj.d), weekday: { en: ['Al Ahad', 'Al Athnayn', 'Al Thalaata', 'Al Arba\'a', 'Al Khamees', 'Al Juma\'a', 'Al Sabt'][d.getUTCDay()] }, month: { number: hj.m, en: HIJRI_MONTHS[hj.m - 1] }, year: String(hj.y), designation: { abbreviated: 'AH', expanded: 'Anno Hegirae' }, holidays: [] },
      meta: { latitude: city[1], longitude: city[2], timezone: city[6], method: { id: method, name: METHODS[method] || METHODS[1] }, latitudeAdjustmentMethod: 'ANGLE_BASED', midnightMode: 'STANDARD', school: school === 1 ? 'HANAFI' : 'STANDARD', offset: {} },
    };
  };
  const dateParam = (s, off) => {
    const m = /^(\d\d)-(\d\d)-(\d{4})$/.exec(s || '');
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    if (/^\d{9,11}$/.test(s || '')) return localDay(+s * 1000, off);
    return localDay(now(), off);
  };
  add('api.aladhan.com', (req, u) => {
    const parts = u.pathname.split('/').filter(Boolean); // v1, timingsByCity | timings, [date]
    const kind = parts[1] || '';
    const method = +(u.searchParams.get('method') || 1), school = +(u.searchParams.get('school') || 0);
    let city;
    if (/^timingsByCity|^timingsByAddress/.test(kind)) {
      const name = (u.searchParams.get('city') || u.searchParams.get('address') || '').split(',')[0];
      city = cityNamed(name);
      if (!city) return http.json({ code: 400, status: 'BAD_REQUEST', data: 'Unable to find the city. Please check the city and country.' }, 400);
    } else if (/^timings$|^calendar/.test(kind)) {
      if (!u.searchParams.has('latitude')) return http.json({ code: 400, status: 'BAD_REQUEST', data: 'Please specify a valid latitude and longitude.' }, 400);
      city = place(u).city;
    } else return http.json({ code: 200, status: 'OK', data: 'AlAdhan Prayer Times API (simulated): /v1/timingsByCity?city=Dhaka&country=Bangladesh&method=1' });
    const day = dateParam(parts[2], city[7]);
    if (/^calendar/.test(kind)) {
      const y = +(parts[2] || new Date(day).getUTCFullYear()), mo = +(parts[3] || new Date(day).getUTCMonth() + 1);
      const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return http.json({ code: 200, status: 'OK', data: Array.from({ length: days }, (_, i) => { const dm = Date.UTC(y, mo - 1, i + 1); return { timings: prayerDay(city, dm, method, school).timings, date: aladhanDate(dm, city, method, school), meta: aladhanDate(dm, city, method, school).meta }; }) });
    }
    const p = prayerDay(city, day, method, school);
    const dt = aladhanDate(day, city, method, school);
    return http.json({ code: 200, status: 'OK', data: { timings: p.timings, date: { readable: dt.readable, timestamp: dt.timestamp, gregorian: dt.gregorian, hijri: dt.hijri }, meta: dt.meta } });
  });

  // ---------------------------------------------------------------- sunrise-sunset.org
  add('api.sunrise-sunset.org', (req, u) => {
    if (!u.pathname.startsWith('/json')) return http.html('<h1>Sunset and sunrise times API</h1><p>/json?lat=23.81&amp;lng=90.41&amp;formatted=0 (simulated)</p>');
    const la = parseFloat(u.searchParams.get('lat')), lo = parseFloat(u.searchParams.get('lng'));
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return http.json({ results: '', status: 'INVALID_REQUEST' }, 400);
    const tzid = u.searchParams.get('tzid');
    const tzCity = tzid ? Object.values(CITIES).find((c) => c[6] === tzid) : null;
    const off = tzCity ? tzCity[7] : 0;
    const ds = u.searchParams.get('date');
    const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(ds || '');
    // the date is the UTC date unless a time zone is given (like the real service)
    const day = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : localDay(now(), off);
    const s = sunTimes(day, la, lo, 0);
    const fmt0 = u.searchParams.get('formatted') === '0';
    const F = (ms) => (ms == null ? (fmt0 ? '1970-01-01T00:00:01+00:00' : '12:00:01 AM') : fmt0 ? isoAt(ms, off) : ampm(ms, off));
    const len = s.rise[0] == null ? 0 : Math.round((s.rise[1] - s.rise[0]) / 1000);
    const results = {
      sunrise: F(s.rise[0]), sunset: F(s.rise[1]), solar_noon: F(s.noon), day_length: fmt0 ? len : hms(len),
      civil_twilight_begin: F(s.civil[0]), civil_twilight_end: F(s.civil[1]), nautical_twilight_begin: F(s.nautical[0]), nautical_twilight_end: F(s.nautical[1]),
      astronomical_twilight_begin: F(s.astro[0]), astronomical_twilight_end: F(s.astro[1]),
    };
    return http.json({ results, status: 'OK', tzid: tzCity ? tzid : 'UTC' });
  });

  // ---------------------------------------------------------------- exchange rates
  const ratesFor = (base) => {
    const b = CURRENCIES[base];
    if (!b) return null;
    const day = Math.floor(now() / DAY);
    const out = {};
    for (const [k, v] of Object.entries(CURRENCIES)) {
      const wob = k === 'USD' || k === base ? 1 : 1 + (rnd(hash(k + day))() - 0.5) * 0.008;
      const r = (v * (k === 'USD' ? 1 : wob)) / b;
      out[k] = k === base ? 1 : +r.toPrecision(6);
    }
    return out;
  };
  const updated = () => { const d = Math.floor(now() / DAY) * DAY + 60000; return [d, d + DAY]; };
  add('open.er-api.com', (req, u) => {
    const m = /^\/v6\/latest\/([A-Za-z]{3})$/.exec(u.pathname);
    if (!m) return http.json({ result: 'error', 'error-type': 'unsupported-code' }, 404);
    const base = m[1].toUpperCase(), rates = ratesFor(base);
    if (!rates) return http.json({ result: 'error', 'error-type': 'unsupported-code' }, 404);
    const [t0, t1] = updated();
    return http.json({ result: 'success', provider: 'https://www.exchangerate-api.com', documentation: 'https://www.exchangerate-api.com/docs/free', terms_of_use: 'https://www.exchangerate-api.com/terms', time_last_update_unix: t0 / 1000, time_last_update_utc: new Date(t0).toUTCString().replace('GMT', '+0000'), time_next_update_unix: t1 / 1000, time_next_update_utc: new Date(t1).toUTCString().replace('GMT', '+0000'), time_eol_unix: 0, base_code: base, rates });
  });
  add('api.exchangerate-api.com', (req, u) => {
    const m = /^\/v4\/latest\/([A-Za-z]{3})$/.exec(u.pathname);
    const base = m ? m[1].toUpperCase() : 'USD', rates = ratesFor(base);
    if (!rates) return http.json({ result: 'error', 'error-type': 'unsupported-code' }, 404);
    const [t0] = updated();
    return http.json({ provider: 'https://www.exchangerate-api.com', base, date: new Date(t0).toISOString().slice(0, 10), time_last_updated: t0 / 1000, rates });
  });

  // ---------------------------------------------------------------- the International Space Station
  add('api.open-notify.org', (req, u) => {
    if (u.pathname === '/iss-now.json') { const p = issAt(now()); return http.json({ message: 'success', timestamp: Math.floor(now() / 1000), iss_position: { latitude: p.lat.toFixed(4), longitude: p.lon.toFixed(4) } }); }
    if (u.pathname === '/astros.json') {
      const people = [['Oleg Kononenko', 'ISS'], ['Nikolai Chub', 'ISS'], ['Tracy Caldwell Dyson', 'ISS'], ['Matthew Dominick', 'ISS'], ['Michael Barratt', 'ISS'], ['Jeanette Epps', 'ISS'], ['Alexander Grebenkin', 'ISS'], ['Li Guangsu', 'Tiangong'], ['Li Cong', 'Tiangong'], ['Ye Guangfu', 'Tiangong']].map(([name, craft]) => ({ name, craft }));
      return http.json({ people, number: people.length, message: 'success' });
    }
    return http.text('Open Notify (simulated): /iss-now.json  /astros.json', 404);
  });
  add('api.wheretheiss.at', (req, u) => {
    if (!/^\/v1\/satellites\/25544/.test(u.pathname)) return http.json([{ name: 'iss', id: 25544 }]);
    const p = issAt(now());
    const km = u.searchParams.get('units') !== 'miles';
    const sunLon = -((new Date(now()).getUTCHours() * 60 + new Date(now()).getUTCMinutes()) / 4 - 180);
    return http.json({ name: 'iss', id: 25544, latitude: +p.lat.toFixed(6), longitude: +p.lon.toFixed(6), altitude: +(km ? p.alt : p.alt / 1.609).toFixed(3), velocity: +(km ? p.vel : p.vel / 1.609).toFixed(3), visibility: daylight(now(), p.lat, p.lon) ? 'daylight' : 'eclipsed', footprint: 4520.6, timestamp: Math.floor(now() / 1000), daynum: now() / DAY + 2440587.5, solar_lat: +(sunOf(now()).decl / RAD).toFixed(4), solar_lon: +(((sunLon % 360) + 360) % 360).toFixed(4), units: km ? 'kilometers' : 'miles' });
  });

  // ---------------------------------------------------------------- quotes
  let qn = 0;
  const quote = (i) => ({ id: i + 1, quote: QUOTES[i][0], author: QUOTES[i][1] });
  add('dummyjson.com', (req, u) => {
    const p = u.pathname;
    if (p === '/quotes/random') return http.json(quote(Math.floor(rnd(hash('q' + now() + qn++))() * QUOTES.length)));
    let m = /^\/quotes\/(\d+)$/.exec(p);
    if (m) return +m[1] >= 1 && +m[1] <= QUOTES.length ? http.json(quote(+m[1] - 1)) : http.json({ message: `Quote with id '${m[1]}' not found` }, 404);
    if (p === '/quotes') {
      const limit = Math.min(QUOTES.length, +(u.searchParams.get('limit') || 30)), skip = +(u.searchParams.get('skip') || 0);
      return http.json({ quotes: QUOTES.slice(skip, skip + limit).map((_, i) => quote(skip + i)), total: QUOTES.length, skip, limit });
    }
    m = /^\/(products|users|todos|posts)/.exec(p);
    if (m) return http.json({ [m[1]]: [], total: 0, skip: 0, limit: 0 });
    return http.json({ message: 'DummyJSON (simulated): /quotes/random' });
  });
  add('zenquotes.io', (req, u) => {
    if (/^\/api\/(random|today|quotes)/.test(u.pathname)) { const q = QUOTES[Math.floor(rnd(hash('z' + now() + qn++))() * QUOTES.length)]; return http.json([{ q: q[0], a: q[1], h: `<blockquote>&ldquo;${q[0]}&rdquo; &mdash; <footer>${q[1]}</footer></blockquote>` }]); }
    return http.html('<h1>ZenQuotes</h1><p>/api/random (simulated)</p>');
  });

  // ---------------------------------------------------------------- earthquakes (USGS GeoJSON feeds)
  add('earthquake.usgs.gov', (req, u) => {
    const m = /\/summary\/(significant|4\.5|2\.5|1\.0|all)_(hour|day|week|month)\.geojson$/.exec(u.pathname);
    if (!m) return http.html('<h1>USGS Earthquake Hazards Program</h1><p>Feeds: /earthquakes/feed/v1.0/summary/4.5_day.geojson (simulated)</p>');
    const [, lvl, per] = m;
    const span = { hour: 3600000, day: DAY, week: 7 * DAY, month: 30 * DAY }[per];
    const minMag = { significant: 6, '4.5': 4.5, '2.5': 2.5, '1.0': 1, all: 0.5 }[lvl];
    // a fixed stream of quakes (about 7 a day of M4.5+), the same for everybody
    const feats = [];
    const slot = 2880000; // 48 min
    for (let k = Math.floor((now() - span) / slot); k <= Math.floor(now() / slot); k++) {
      const r = rnd(hash('eq' + k));
      const t = k * slot + Math.floor(r() * slot);
      if (t > now() || t < now() - span) continue;
      const mag = +(3.4 + (-Math.log(1 - r() * 0.9995)) * 0.7).toFixed(1);
      if (mag < minMag || (lvl === 'significant' && mag < 6.5)) continue;
      const pl = QUAKE_PLACES[Math.floor(r() * QUAKE_PLACES.length)];
      const lat = +(pl[1] + (r() - 0.5) * 2).toFixed(4), lon = +(pl[2] + (r() - 0.5) * 2).toFixed(4);
      const depth = +(pl[3] * (0.6 + r() * 0.8)).toFixed(2);
      const dist = Math.round(5 + r() * 120), dir = DIRS[Math.floor(r() * 16)];
      const where = /region|^near|^southern|Islands$/.test(pl[0]) ? pl[0] : `${dist} km ${dir} of ${pl[0]}`;
      const id = 'us7000' + (hash('eqid' + k) % 1679616).toString(36).padStart(4, '0');
      feats.push({
        type: 'Feature',
        properties: { mag, place: where, time: t, updated: t + 1800000, tz: null, url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`, detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`, felt: mag > 5 ? Math.round(r() * 200) : null, cdi: null, mmi: null, alert: mag >= 6.5 ? 'yellow' : null, status: 'reviewed', tsunami: mag >= 7 ? 1 : 0, sig: Math.round(mag * mag * 15), net: 'us', code: id.slice(2), ids: `,${id},`, sources: ',us,', types: ',origin,phase-data,', nst: null, dmin: +(r() * 5).toFixed(3), rms: +(0.4 + r() * 0.8).toFixed(2), gap: Math.round(20 + r() * 100), magType: mag >= 5.5 ? 'mww' : 'mb', type: 'earthquake', title: `M ${mag.toFixed(1)} - ${where}` },
        geometry: { type: 'Point', coordinates: [lon, lat, depth] },
        id,
      });
    }
    feats.sort((a, b) => b.properties.time - a.properties.time);
    const title = { significant: 'Significant', '4.5': 'M4.5+', '2.5': 'M2.5+', '1.0': 'M1.0+', all: 'All' }[lvl] + ' Earthquakes, Past ' + per[0].toUpperCase() + per.slice(1);
    return http.json({ type: 'FeatureCollection', metadata: { generated: now(), url: u.href, title: 'USGS ' + title, status: 200, api: '1.10.3', count: feats.length }, features: feats, bbox: [-179.9, -60, 0, 179.9, 70, 600] }, 200, { 'access-control-allow-origin': '*' });
  });

  // ---------------------------------------------------------------- open-meteo daily forecast (added to the forecast handler)
  /** The `daily` block of an open-meteo forecast: [{time, …}] for `days` days at city / offset. */
  return {
    daily(u, city, off) {
      const list = (u.searchParams.get('daily') || '').split(',').filter(Boolean);
      const days = Math.max(1, Math.min(16, +(u.searchParams.get('forecast_days') || 7)));
      const day0 = localDay(now(), off);
      const rows = Array.from({ length: days }, (_, i) => day0 + i * DAY);
      const UNITS = { temperature_2m_max: '°C', temperature_2m_min: '°C', apparent_temperature_max: '°C', weather_code: 'wmo code', precipitation_sum: 'mm', precipitation_probability_max: '%', rain_sum: 'mm', wind_speed_10m_max: 'km/h', uv_index_max: '', sunrise: 'iso8601', sunset: 'iso8601', daylight_duration: 's' };
      const dayVals = (dm, i) => {
        const r = rnd(hash(city[0] + 'day' + Math.floor(dm / DAY)));
        const wob = r(), rainy = r();
        // today follows the weather now (the real one when it is known)
        const cur = i === 0 ? wx(city) : null;
        const tmax = cur ? Math.max(cur.temp, city[3] + city[4] - 1 + wob) : city[3] + city[4] + (wob - 0.5) * 3;
        const tmin = city[3] - city[4] + (wob - 0.5) * 2;
        const prob = Math.round(rainy * rainy * 100);
        const code = prob > 70 ? (prob > 90 ? 95 : 63) : prob > 45 ? 61 : prob > 25 ? 3 : wob > 0.5 ? 2 : 0;
        const s = sunTimes(dm, city[1], city[2], off);
        return {
          temperature_2m_max: +tmax.toFixed(1), temperature_2m_min: +tmin.toFixed(1), apparent_temperature_max: +(tmax + 3).toFixed(1), weather_code: code,
          precipitation_sum: +(prob > 45 ? rainy * 18 : 0).toFixed(1), rain_sum: +(prob > 45 ? rainy * 18 : 0).toFixed(1), precipitation_probability_max: prob,
          wind_speed_10m_max: +(8 + wob * 16).toFixed(1), uv_index_max: +(prob > 60 ? 4 + wob * 2 : 7 + wob * 3).toFixed(2),
          sunrise: s.rise[0] == null ? '' : isoAt(s.rise[0], off, false), sunset: s.rise[1] == null ? '' : isoAt(s.rise[1], off, false),
          daylight_duration: s.rise[0] == null ? 0 : +((s.rise[1] - s.rise[0]) / 1000).toFixed(2),
        };
      };
      const vals = rows.map((dm, i) => dayVals(dm, i));
      const daily = { time: rows.map((dm) => new Date(dm).toISOString().slice(0, 10)) };
      for (const k of list) if (k in UNITS) daily[k] = vals.map((v) => v[k]);
      return { daily_units: { time: 'iso8601', ...Object.fromEntries(list.filter((k) => k in UNITS).map((k) => [k, UNITS[k]])) }, daily };
    },
    tzOf,
    weatherNow,
  };
}
