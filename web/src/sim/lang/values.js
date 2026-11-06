// Runtime value helpers shared by the compiler, the core library and device libraries.

/** Arduino `String` object (mutable, value semantics enforced by the compiler). */
export class AStr {
  constructor(s = '') { this.s = s; }
  toString() { return this.s; }
}

/** Pointer into an array (char*, int*, struct*...). */
export class Ptr {
  constructor(a, i) { this.a = a; this.i = i; }
}

/** Pointer / reference to a scalar variable or object member. */
export class Ref {
  constructor(get, set) { this.get = get; this.set = set; }
}

export class RuntimeError extends Error {
  constructor(message, line = 0) {
    super(message);
    this.line = line;
  }
}

// print kinds
export const PK_STR = 0, PK_INT = 1, PK_UINT = 2, PK_FLOAT = 3, PK_CHAR = 4;

/** Converts any string-like runtime value (JS string, AStr, char array, Ptr, Ref) to a JS string. */
export function cstr(v) {
  if (typeof v === 'string') return v;
  if (v instanceof AStr) return v.s;
  if (Array.isArray(v)) return arrToStr(v, 0);
  if (v instanceof Ptr) {
    if (typeof v.a === 'string') return v.a.slice(v.i);
    if (Array.isArray(v.a)) return arrToStr(v.a, v.i);
  }
  if (v instanceof Ref) return cstr(v.get());
  if (v === null || v === undefined || v === 0) return '';
  return String(v);
}

function arrToStr(a, start) {
  let s = '';
  for (let i = start; i < a.length; i++) {
    const c = a[i];
    if (!c) break;
    s += String.fromCharCode(c & 255);
  }
  return s;
}

/** Writes a JS string into a char array (with terminating NUL). */
export function strToArr(str, arr, offset = 0) {
  const n = str.length;
  for (let i = 0; i < n; i++) arr[offset + i] = str.charCodeAt(i) & 255;
  arr[offset + n] = 0;
  return arr;
}

export function newCharArray(len, str = '') {
  const a = new Array(Math.max(len, str.length + 1)).fill(0);
  strToArr(str, a, 0);
  return a;
}

/** Arduino Print::printFloat */
export function fmtFloat(number, digits = 2, f32 = false) {
  if (Number.isNaN(number)) return 'nan';
  if (!Number.isFinite(number)) return 'inf';
  if (number > 4294967040.0 || number < -4294967040.0) return 'ovf';
  const r = f32 ? Math.fround : (x) => x;
  let out = '';
  if (number < 0) { out = '-'; number = -number; }
  let rounding = 0.5;
  for (let i = 0; i < digits; i++) rounding = r(rounding / 10);
  number = r(number + rounding);
  const intPart = Math.floor(number);
  let remainder = r(number - intPart);
  out += String(intPart);
  if (digits > 0) out += '.';
  while (digits-- > 0) {
    remainder = r(remainder * 10);
    const toPrint = Math.floor(remainder);
    out += String(toPrint);
    remainder = r(remainder - toPrint);
  }
  return out;
}

/** Arduino Print::print(long/unsigned long, base) */
export function fmtInt(v, base = 10, uns = false) {
  if (base === 0) return String.fromCharCode(v & 255);
  if (base < 2) base = 10;
  if (base === 10) {
    if (uns) return String(v < 0 ? v >>> 0 : v);
    return String(v);
  }
  let n = v;
  if (n < 0) n = n >>> 0; // printed as unsigned long
  return Math.floor(n).toString(base).toUpperCase();
}

export function formatPrintable(v, kind, fmt, f32) {
  switch (kind) {
    case PK_STR: return cstr(v);
    case PK_CHAR:
      if (fmt !== undefined) return fmtInt(v, fmt, false);
      return String.fromCharCode(v & 255);
    case PK_FLOAT: return fmtFloat(+v, fmt === undefined ? 2 : fmt, f32);
    case PK_UINT: return fmtInt(v, fmt === undefined ? 10 : fmt, true);
    case PK_INT:
    default:
      if (typeof v === 'string') return v;
      if (v instanceof AStr) return v.s;
      if (typeof v === 'boolean') v = v ? 1 : 0;
      if (typeof v !== 'number') return cstr(v);
      if (!Number.isInteger(v)) return fmtFloat(v, fmt === undefined ? 2 : fmt, f32);
      return fmtInt(v, fmt === undefined ? 10 : fmt, false);
  }
}

/** printf-style formatting. `avr` emulates avr-libc (no %f support). */
export function sprintf(fmt, args, avr = false) {
  let out = '';
  let ai = 0;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== '%') { out += c; continue; }
    i++;
    if (fmt[i] === '%') { out += '%'; continue; }
    let flags = '';
    while ('-+ #0'.includes(fmt[i]) && i < fmt.length) flags += fmt[i++];
    let width = '';
    if (fmt[i] === '*') { width = String(args[ai++] | 0); i++; } else while (fmt[i] >= '0' && fmt[i] <= '9') width += fmt[i++];
    let prec = null;
    if (fmt[i] === '.') {
      i++;
      prec = '';
      if (fmt[i] === '*') { prec = String(args[ai++] | 0); i++; } else while (fmt[i] >= '0' && fmt[i] <= '9') prec += fmt[i++];
      prec = prec === '' ? 0 : parseInt(prec, 10);
    }
    let len = '';
    while ('hlLqjzt'.includes(fmt[i]) && i < fmt.length) len += fmt[i++];
    const conv = fmt[i];
    if (conv === undefined) break;
    let arg = args[ai++];
    let s;
    switch (conv) {
      case 'd': case 'i': {
        let n = Math.trunc(Number(typeof arg === 'string' ? arg.charCodeAt(0) : arg) || 0);
        if (avr && !len.includes('l')) n = (n << 16) >> 16;
        s = String(Math.abs(n));
        if (prec !== null) s = s.padStart(prec, '0');
        if (n < 0) s = '-' + s; else if (flags.includes('+')) s = '+' + s; else if (flags.includes(' ')) s = ' ' + s;
        break;
      }
      case 'u': {
        let n = Math.trunc(Number(arg) || 0);
        n = avr && !len.includes('l') ? n & 0xffff : n >>> 0;
        s = String(n);
        if (prec !== null) s = s.padStart(prec, '0');
        break;
      }
      case 'x': case 'X': case 'o': {
        let n = Math.trunc(Number(arg) || 0);
        n = avr && !len.includes('l') ? n & 0xffff : n >>> 0;
        s = n.toString(conv === 'o' ? 8 : 16);
        if (conv === 'X') s = s.toUpperCase();
        if (prec !== null) s = s.padStart(prec, '0');
        if (flags.includes('#') && n !== 0) s = (conv === 'o' ? '0' : conv === 'X' ? '0X' : '0x') + s;
        break;
      }
      case 'c': s = String.fromCharCode((typeof arg === 'string' ? arg.charCodeAt(0) : Number(arg)) & 255); break;
      case 's': {
        s = cstr(arg);
        if (prec !== null) s = s.slice(0, prec);
        break;
      }
      case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': {
        if (avr) { s = '?'; break; }
        const n = Number(arg) || 0;
        const p = prec === null ? 6 : prec;
        if (conv === 'f' || conv === 'F') s = Number.isFinite(n) ? Math.abs(n).toFixed(p) : (Number.isNaN(n) ? 'nan' : 'inf');
        else if (conv === 'e' || conv === 'E') s = Math.abs(n).toExponential(p).replace(/e([+-])(\d)$/, 'e$10$2');
        else { s = String(Number(Math.abs(n).toPrecision(p || 1))); }
        if (conv === 'E' || conv === 'G') s = s.toUpperCase();
        if (n < 0 || Object.is(n, -0) && n !== 0) s = '-' + s; else if (flags.includes('+')) s = '+' + s; else if (flags.includes(' ')) s = ' ' + s;
        break;
      }
      case 'p': s = '0x' + (Number(arg) || 0).toString(16); break;
      default: s = '%' + conv; ai--; break;
    }
    if (width) {
      const w = parseInt(width, 10);
      if (s.length < w) {
        if (flags.includes('-')) s = s.padEnd(w, ' ');
        else if (flags.includes('0') && 'diuxXofFeEgG'.includes(conv) && (prec === null || 'fFeEgG'.includes(conv))) {
          const neg = s[0] === '-' || s[0] === '+' ? s[0] : '';
          s = neg + s.slice(neg.length).padStart(w - neg.length, '0');
        } else s = s.padStart(w, ' ');
      }
    }
    out += s;
  }
  return out;
}

/** Counts the scalar elements of a (possibly nested) array – used by sizeof. */
export function countLeaves(a) {
  if (!Array.isArray(a)) return 1;
  if (a.length === 0) return 0;
  if (!Array.isArray(a[0])) return a.length;
  let n = 0;
  for (const x of a) n += countLeaves(x);
  return n;
}

/** Deep clone used for struct / array value copies. */
export function cloneValue(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(cloneValue);
  if (v instanceof AStr) return new AStr(v.s);
  if (v instanceof Ptr || v instanceof Ref) return v;
  if (v.__struct) {
    const o = Object.create(Object.getPrototypeOf(v));
    for (const k of Object.keys(v)) o[k] = cloneValue(v[k]);
    return o;
  }
  return v; // library objects are copied by reference
}
