// Arduino String class methods and C string (<string.h>, <stdlib.h>, <ctype.h>) helpers.
import { AStr, Ptr, Ref, RuntimeError, cstr, strToArr, sprintf, cloneValue } from './values.js';

export function atol(s) {
  const m = /^\s*([+-]?\d+)/.exec(s);
  return m ? parseInt(m[1], 10) : 0;
}
export function atof(s) {
  const m = /^\s*([+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)/.exec(s);
  return m ? parseFloat(m[1]) : 0;
}

const b = (v) => (v ? 1 : 0);
// C-locale toupper / tolower: only a–z / A–Z change (JS toUpperCase also maps µ, ß, ÿ …)
const up = (c) => (c >= 97 && c <= 122 ? c - 32 : c);
const low = (c) => (c >= 65 && c <= 90 ? c + 32 : c);
const upStr = (s) => s.replace(/[a-z]+/g, (x) => x.toUpperCase());
const lowStr = (s) => s.replace(/[A-Z]+/g, (x) => x.toLowerCase());

export const STRING_METHODS = {
  length: { ret: 'uint', fn: (o) => o.s.length },
  isEmpty: { ret: 'bool', fn: (o) => b(o.s.length === 0) },
  charAt: { ret: 'char', min: 1, fn: (o, i) => (i >= 0 && i < o.s.length ? o.s.charCodeAt(i) : 0) },
  setCharAt: {
    ret: 'void', min: 2,
    fn: (o, i, c) => { if (i >= 0 && i < o.s.length) o.s = o.s.slice(0, i) + String.fromCharCode(c & 255) + o.s.slice(i + 1); },
  },
  substring: {
    ret: 'String', min: 1,
    fn: (o, from, to) => {
      // unsigned int arguments: a negative index is huge
      const len = o.s.length;
      from = Math.trunc(from) >>> 0;
      to = to === undefined ? len : Math.trunc(to) >>> 0;
      if (from > to) [from, to] = [to, from];
      if (from >= len) return new AStr('');
      return new AStr(o.s.slice(from, Math.min(len, to)));
    },
  },
  indexOf: { ret: 'int', min: 1, args: ['str', 'num'], fn: (o, v, from = 0) => o.s.indexOf(v, from) },
  lastIndexOf: {
    ret: 'int', min: 1, args: ['str', 'num'],
    fn: (o, v, from) => (from === undefined ? o.s.lastIndexOf(v) : o.s.lastIndexOf(v, from)),
  },
  startsWith: { ret: 'bool', min: 1, args: ['str', 'num'], fn: (o, v, off = 0) => b(o.s.startsWith(v, off)) },
  endsWith: { ret: 'bool', min: 1, args: ['str'], fn: (o, v) => b(o.s.endsWith(v)) },
  equals: { ret: 'bool', min: 1, args: ['str'], fn: (o, v) => b(o.s === v) },
  equalsIgnoreCase: { ret: 'bool', min: 1, args: ['str'], fn: (o, v) => b(lowStr(o.s) === lowStr(v)) },
  compareTo: {
    ret: 'int', min: 1, args: ['str'],
    fn: (o, v) => {
      const a = o.s;
      const n = Math.min(a.length, v.length);
      for (let i = 0; i < n; i++) { const d = a.charCodeAt(i) - v.charCodeAt(i); if (d) return d; }
      return a.length - v.length;
    },
  },
  concat: { ret: 'bool', min: 1, args: ['str'], fn: (o, v) => { o.s += v; return 1; } },
  toInt: { ret: 'long', fn: (o) => atol(o.s) },
  toFloat: { ret: 'float', fn: (o) => Math.fround(atof(o.s)) },
  toDouble: { ret: 'double', fn: (o) => atof(o.s) },
  toUpperCase: { ret: 'void', fn: (o) => { o.s = upStr(o.s); } },
  toLowerCase: { ret: 'void', fn: (o) => { o.s = lowStr(o.s); } },
  trim: { ret: 'void', fn: (o) => { o.s = o.s.replace(/^[\s]+|[\s]+$/g, ''); } },
  replace: { ret: 'void', min: 2, args: ['str', 'str'], fn: (o, a, r) => { if (a.length) o.s = o.s.split(a).join(r); } },
  remove: {
    ret: 'void', min: 1,
    fn: (o, idx, count) => {
      // remove(unsigned index, unsigned count = -1): a negative count means "to the end"
      const len = o.s.length;
      idx = Math.trunc(idx) >>> 0;
      if (idx >= len) return;
      count = count === undefined ? len : Math.trunc(count) >>> 0;
      if (count === 0) return;
      o.s = o.s.slice(0, idx) + o.s.slice(idx + Math.min(count, len - idx));
    },
  },
  reserve: { ret: 'bool', fn: () => 1 },
  c_str: { ret: 'cstr', fn: (o) => o.s },
  begin: { ret: 'cstr', fn: (o) => o.s },
  toCharArray: {
    ret: 'void', min: 2, args: ['buf', 'num'],
    fn: (o, buf, len) => {
      const arr = buf instanceof Ptr ? buf.a : buf;
      const off = buf instanceof Ptr ? buf.i : 0;
      const n = Math.max(0, Math.min(o.s.length, len - 1));
      for (let i = 0; i < n; i++) arr[off + i] = o.s.charCodeAt(i) & 255;
      if (len > 0) arr[off + n] = 0;
    },
  },
  getBytes: {
    ret: 'void', min: 2, args: ['buf', 'num'],
    fn: (o, buf, len) => STRING_METHODS.toCharArray.fn(o, buf, len),
  },
};

// ------------------------------------------------------------------ <string.h> & friends
function bufOf(p) {
  if (p instanceof Ptr) return [p.a, p.i];
  if (Array.isArray(p)) return [p, 0];
  if (p instanceof Ref) return [null, 0];
  return [null, 0];
}

/** C strtol: whitespace, sign, base 0 (0x… hex, 0… octal), and *end set past the last digit used. */
function strtol(s, end, base) {
  const str = cstr(s);
  let i = 0;
  while (i < str.length && ' \t\n\r\f\v'.includes(str[i])) i++;
  let sign = 1;
  if (str[i] === '+' || str[i] === '-') { if (str[i] === '-') sign = -1; i++; }
  let b = base | 0;
  if ((b === 0 || b === 16) && str[i] === '0' && (str[i + 1] === 'x' || str[i + 1] === 'X') && /[0-9a-fA-F]/.test(str[i + 2] || '')) { i += 2; b = 16; }
  else if (b === 0) b = str[i] === '0' ? 8 : 10;
  const start = i;
  let v = 0;
  for (; i < str.length; i++) { const dg = parseInt(str[i], 36); if (Number.isNaN(dg) || dg >= b) break; v = v * b + dg; }
  if (i === start) i = 0; // no number: end = the start of the string
  if (end instanceof Ref) { const [a, off] = bufOf(s); if (a) end.set(new Ptr(a, off + i)); }
  return sign * v;
}

function writeStr(dst, s, max = Infinity) {
  const [a, off] = bufOf(dst);
  if (!a || typeof a === 'string') throw new RuntimeError('Destination is not a writable char array');
  const n = Math.min(s.length, max);
  for (let i = 0; i < n; i++) a[off + i] = s.charCodeAt(i) & 255;
  if (n < max || max === Infinity) a[off + n] = 0;
  return dst;
}

const isCh = (re) => (c) => b(re.test(String.fromCharCode(c & 255)));

export function makeStringNatives(rt, avr) {
  let strtokState = null;
  const f = {
    strlen: { ret: 'uint', fn: (s) => cstr(s).length },
    strcpy: { ret: 'cstr', args: ['raw', 'raw'], fn: (d, s) => writeStr(d, cstr(s)) },
    strncpy: {
      ret: 'cstr', args: ['raw', 'raw'],
      fn: (d, s, n) => {
        const str = cstr(s).slice(0, n);
        const [a, off] = bufOf(d);
        for (let i = 0; i < n; i++) a[off + i] = i < str.length ? str.charCodeAt(i) : 0;
        return d;
      },
    },
    strcat: { ret: 'cstr', args: ['raw', 'raw'], fn: (d, s) => { const cur = cstr(d); const [a, off] = bufOf(d); strToArr(cur + cstr(s), a, off); return d; } },
    strncat: { ret: 'cstr', args: ['raw', 'raw'], fn: (d, s, n) => { const cur = cstr(d); const [a, off] = bufOf(d); strToArr(cur + cstr(s).slice(0, n), a, off); return d; } },
    strcmp: { ret: 'int', args: ['raw', 'raw'], fn: (x, y) => cmp(cstr(x), cstr(y)) },
    strncmp: { ret: 'int', args: ['raw', 'raw'], fn: (x, y, n) => cmp(cstr(x).slice(0, n), cstr(y).slice(0, n)) },
    strcasecmp: { ret: 'int', args: ['raw', 'raw'], fn: (x, y) => cmp(lowStr(cstr(x)), lowStr(cstr(y))) },
    strncasecmp: { ret: 'int', args: ['raw', 'raw'], fn: (x, y, n) => cmp(lowStr(cstr(x)).slice(0, n), lowStr(cstr(y)).slice(0, n)) },
    strchr: {
      ret: 'cstr', args: ['raw'],
      fn: (s, c) => {
        const str = cstr(s);
        const i = str.indexOf(String.fromCharCode(c & 255));
        if (i < 0) return null;
        const [a, off] = bufOf(s);
        return a ? new Ptr(a, off + i) : str.slice(i);
      },
    },
    strrchr: {
      ret: 'cstr', args: ['raw'],
      fn: (s, c) => {
        const str = cstr(s);
        const i = str.lastIndexOf(String.fromCharCode(c & 255));
        if (i < 0) return null;
        const [a, off] = bufOf(s);
        return a ? new Ptr(a, off + i) : str.slice(i);
      },
    },
    strstr: {
      ret: 'cstr', args: ['raw', 'raw'],
      fn: (s, n) => {
        const str = cstr(s);
        const i = str.indexOf(cstr(n));
        if (i < 0) return null;
        const [a, off] = bufOf(s);
        return a ? new Ptr(a, off + i) : str.slice(i);
      },
    },
    strtok: {
      ret: 'cstr', args: ['raw', 'raw'],
      fn: (s, delim) => {
        const d = cstr(delim);
        if (s !== null && s !== 0) {
          const [a, off] = bufOf(s);
          if (!a) return null;
          strtokState = { a, i: off };
        }
        if (!strtokState) return null;
        const { a } = strtokState;
        let i = strtokState.i;
        while (i < a.length && a[i] && d.includes(String.fromCharCode(a[i]))) i++;
        if (i >= a.length || !a[i]) { strtokState = null; return null; }
        const start = i;
        while (i < a.length && a[i] && !d.includes(String.fromCharCode(a[i]))) i++;
        if (i < a.length && a[i]) { a[i] = 0; strtokState.i = i + 1; } else strtokState.i = i;
        return new Ptr(a, start);
      },
    },
    memset: {
      ret: 'void', args: ['raw'],
      fn: (p, v, n) => {
        const [a, off] = bufOf(p);
        if (!a) { if (p && p.__struct && v === 0) zeroStruct(p); return p; } // memset(&s, 0, sizeof(s))
        if (a.length && Array.isArray(a[0])) { fillDeep(a, v); return p; }
        for (let i = 0; i < n && off + i < a.length; i++) {
          if (typeof a[off + i] === 'number') a[off + i] = v & 255;
          else if (a[off + i] && typeof a[off + i] === 'object' && v === 0) zeroStruct(a[off + i]);
        }
        return p;
      },
    },
    memcpy: {
      ret: 'void', args: ['raw', 'raw'],
      fn: (d, s, n) => {
        const [da, doff] = bufOf(d);
        const [sa, soff] = bufOf(s);
        if (!da) {
          // memcpy(&dst, &src, sizeof(S)) between two structs
          if (d && d.__struct && s && s.__struct) for (const k of Object.keys(s)) d[k] = cloneValue(s[k]);
          return d;
        }
        if (typeof sa === 'string') { for (let i = 0; i < n; i++) da[doff + i] = i < sa.length - soff ? sa.charCodeAt(soff + i) : 0; return d; }
        if (!sa) return d;
        const tmp = sa.slice(soff, soff + n);
        for (let i = 0; i < tmp.length && doff + i < da.length; i++) da[doff + i] = tmp[i];
        return d;
      },
    },
    memcmp: {
      ret: 'int', args: ['raw', 'raw'],
      fn: (x, y, n) => {
        const [a, ao] = bufOf(x), [c, co] = bufOf(y);
        for (let i = 0; i < n; i++) { const d = (a[ao + i] | 0) - (c[co + i] | 0); if (d) return d; }
        return 0;
      },
    },
    atoi: { ret: 'int', args: ['raw'], fn: (s) => atol(cstr(s)) },
    atol: { ret: 'long', args: ['raw'], fn: (s) => atol(cstr(s)) },
    atof: { ret: 'double', args: ['raw'], fn: (s) => atof(cstr(s)) },
    strtol: { ret: 'long', args: ['raw', 'raw'], fn: (s, end, base) => strtol(s, end, base) | 0 },
    strtoul: { ret: 'ulong', args: ['raw', 'raw'], fn: (s, end, base) => strtol(s, end, base) >>> 0 },
    strtod: { ret: 'double', args: ['raw', 'raw'], fn: (s) => atof(cstr(s)) },
    itoa: { ret: 'cstr', args: ['num', 'raw'], fn: (v, d, base) => writeStr(d, intToStr(v, base, avr ? 16 : 32)) },
    ltoa: { ret: 'cstr', args: ['num', 'raw'], fn: (v, d, base) => writeStr(d, intToStr(v, base, 32)) },
    utoa: { ret: 'cstr', args: ['num', 'raw'], fn: (v, d, base) => writeStr(d, (v >>> 0).toString(base || 10)) },
    ultoa: { ret: 'cstr', args: ['num', 'raw'], fn: (v, d, base) => writeStr(d, (v >>> 0).toString(base || 10)) },
    dtostrf: {
      ret: 'cstr', args: ['num', 'num', 'num', 'raw'],
      fn: (v, width, prec, d) => {
        let s = Number.isFinite(v) ? Number(v).toFixed(Math.max(0, prec)) : (Number.isNaN(v) ? 'nan' : 'inf');
        const w = Math.abs(width);
        if (s.length < w) s = width < 0 ? s.padEnd(w) : s.padStart(w);
        return writeStr(d, s);
      },
    },
    sprintf: {
      ret: 'int', printf: 2, args: ['raw', 'str'],
      fn: (d, fmt, ...args) => { const s = sprintf(fmt, args, avr); writeStr(d, s); return s.length; },
    },
    snprintf: {
      ret: 'int', printf: 3, args: ['raw', 'num', 'str'],
      fn: (d, n, fmt, ...args) => {
        const s = sprintf(fmt, args, avr);
        if (n > 0) { const [a, off] = bufOf(d); strToArr(s.slice(0, n - 1), a, off); }
        return s.length;
      },
    },
    sprintf_P: { ret: 'int', printf: 2, args: ['raw', 'str'], fn: (d, fmt, ...args) => { const s = sprintf(fmt, args, avr); writeStr(d, s); return s.length; } },
    strcpy_P: { ret: 'cstr', args: ['raw', 'raw'], fn: (d, s) => writeStr(d, cstr(s)) },
    strlen_P: { ret: 'uint', args: ['raw'], fn: (s) => cstr(s).length },
    toupper: { ret: 'int', fn: up },
    tolower: { ret: 'int', fn: low },
    isdigit: { ret: 'int', fn: isCh(/[0-9]/) },
    isalpha: { ret: 'int', fn: isCh(/[A-Za-z]/) },
    isalnum: { ret: 'int', fn: isCh(/[A-Za-z0-9]/) },
    isspace: { ret: 'int', fn: isCh(/[ \t\n\r\f\v]/) },
    isupper: { ret: 'int', fn: isCh(/[A-Z]/) },
    islower: { ret: 'int', fn: isCh(/[a-z]/) },
    isxdigit: { ret: 'int', fn: isCh(/[0-9A-Fa-f]/) },
    ispunct: { ret: 'int', fn: isCh(/[!-/:-@[-`{-~]/) },
    isprint: { ret: 'int', fn: (c) => b(c >= 32 && c < 127) },
    iscntrl: { ret: 'int', fn: (c) => b(c < 32 || c === 127) },
    isDigit: { ret: 'bool', fn: isCh(/[0-9]/) },
    isAlpha: { ret: 'bool', fn: isCh(/[A-Za-z]/) },
    isAlphaNumeric: { ret: 'bool', fn: isCh(/[A-Za-z0-9]/) },
    isSpace: { ret: 'bool', fn: isCh(/[ \t\n\r\f\v]/) },
    isWhitespace: { ret: 'bool', fn: isCh(/[ \t]/) },
    isUpperCase: { ret: 'bool', fn: isCh(/[A-Z]/) },
    isLowerCase: { ret: 'bool', fn: isCh(/[a-z]/) },
    isHexadecimalDigit: { ret: 'bool', fn: isCh(/[0-9A-Fa-f]/) },
    isPunct: { ret: 'bool', fn: isCh(/[!-/:-@[-`{-~]/) },
    isPrintable: { ret: 'bool', fn: (c) => b(c >= 32 && c < 127) },
    isGraph: { ret: 'bool', fn: (c) => b(c > 32 && c < 127) },
    isControl: { ret: 'bool', fn: (c) => b(c < 32 || c === 127) },
    isAscii: { ret: 'bool', fn: (c) => b(c >= 0 && c < 128) },
    toUpperCase: { ret: 'int', fn: up },
    toLowerCase: { ret: 'int', fn: low },
    toAscii: { ret: 'int', fn: (c) => c & 127 },
  };
  return f;
}

function cmp(a, b2) {
  if (a === b2) return 0;
  const n = Math.min(a.length, b2.length);
  for (let i = 0; i < n; i++) { const d = a.charCodeAt(i) - b2.charCodeAt(i); if (d) return d; }
  return a.length - b2.length;
}

function intToStr(v, base = 10, bits = 16) {
  if (base === 10) return String(v);
  const mask = bits === 16 ? 0xffff : 0xffffffff;
  return ((v & mask) >>> 0).toString(base);
}

function fillDeep(a, v) {
  for (let i = 0; i < a.length; i++) {
    if (Array.isArray(a[i])) fillDeep(a[i], v);
    else if (typeof a[i] === 'number') a[i] = v & 255;
  }
}

function zeroStruct(o) {
  for (const k of Object.keys(o)) {
    if (typeof o[k] === 'number') o[k] = 0;
    else if (Array.isArray(o[k])) fillDeep(o[k], 0);
  }
}

