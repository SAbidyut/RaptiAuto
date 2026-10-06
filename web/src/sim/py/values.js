// Python value model for the MicroPython interpreter.
//   int -> JS number (integral), float -> JS number (non-integral) or Fl (integral-valued float),
//   bool -> boolean, None -> null, str -> string, list -> Array, tuple -> Array tagged `isTuple`.
export const hooks = { callSync: null, line: 0 };

export class Fl { constructor(v) { this.v = v; } }
export const isFloat = (x) => x instanceof Fl || (typeof x === 'number' && !Number.isInteger(x));
export const isNum = (x) => typeof x === 'number' || typeof x === 'boolean' || x instanceof Fl;
export const toNum = (x) => (x instanceof Fl ? x.v : x === true ? 1 : x === false ? 0 : x);
export const mkf = (v) => (Number.isInteger(v) ? new Fl(v) : v);

export const tuple = (a) => { a.isTuple = true; return a; };
export const isTuple = (x) => Array.isArray(x) && x.isTuple === true;

export class PyDict {
  constructor() { this.m = new Map(); }
  get size() { return this.m.size; }
  get(k) { const e = this.m.get(hkey(k)); return e ? e[1] : undefined; }
  has(k) { return this.m.has(hkey(k)); }
  set(k, v) { const h = hkey(k); const e = this.m.get(h); if (e) e[1] = v; else this.m.set(h, [k, v]); }
  delete(k) { return this.m.delete(hkey(k)); }
  keys() { return [...this.m.values()].map((e) => e[0]); }
  values() { return [...this.m.values()].map((e) => e[1]); }
  items() { return [...this.m.values()]; }
}
export class PySet {
  constructor() { this.m = new Map(); }
  get size() { return this.m.size; }
  add(k) { const h = hkey(k); if (!this.m.has(h)) this.m.set(h, k); }
  has(k) { return this.m.has(hkey(k)); }
  delete(k) { return this.m.delete(hkey(k)); }
  items() { return [...this.m.values()]; }
}
export class PyRange {
  constructor(start, stop, step) { this.start = start; this.stop = stop; this.step = step; }
  get length() {
    const { start, stop, step } = this;
    return Math.max(0, Math.ceil((stop - start) / step));
  }
  at(i) { return this.start + i * this.step; }
}
export class PyIter { constructor(next) { this.next = next; } } // next() -> {done, value}
export class PyBytes { constructor(a) { this.a = a; } }

export class PyClass {
  constructor(name, bases, attrs) {
    this.name = name;
    this.bases = bases;
    this.attrs = attrs;
    this.mro = [this];
    for (const b of bases) for (const c of b.mro) if (!this.mro.includes(c)) this.mro.push(c);
  }
  lookup(name) {
    for (const c of this.mro) if (name in c.attrs) return c.attrs[name];
    return undefined;
  }
  isSub(other) { return this.mro.includes(other); }
}
export class PyInstance {
  constructor(cls) { this.cls = cls; this.attrs = Object.create(null); }
}
export class PyFunc {
  constructor(name, params, body, closure, nameInfo) {
    this.name = name; this.params = params; this.body = body; this.closure = closure; this.info = nameInfo;
  }
}
export class BoundMethod { constructor(self, fn) { this.self = self; this.fn = fn; } }
export class NativeFn {
  constructor(name, fn, gen = false) { this.name = name; this.fn = fn; this.gen = gen; }
}
/** A native class that can be called to build NativeObj instances; `attrs` are class attributes (Pin.OUT ...). */
export class NativeClass {
  constructor(name, make, attrs = {}) { this.name = name; this.make = make; this.attrs = attrs; }
}
export class NativeObj {
  getAttr() { return undefined; }
  setAttr() { return false; }
}
export class PyModule {
  constructor(name, attrs) { this.name = name; this.attrs = attrs; }
}

// ------------------------------------------------------------------ exceptions
export class PyError extends Error {
  constructor(exc, line) {
    super(excMessage(exc));
    this.exc = exc;
    this.line = line || hooks.line;
  }
}
function excMessage(exc) {
  const a = exc.attrs.args;
  if (!a || !a.length) return '';
  if (exc.cls.isSub(EXC.KeyError) && a.length === 1) return pyRepr(a[0]);
  if (exc.cls.isSub(EXC.OSError) && a.length === 2 && typeof a[0] === 'number') return `[Errno ${a[0]}] ${pyStr(a[1])}`;
  return a.length === 1 ? pyStr(a[0]) : pyRepr(a);
}

const EXC_TREE = [
  ['BaseException', null], ['Exception', 'BaseException'], ['KeyboardInterrupt', 'BaseException'], ['SystemExit', 'BaseException'],
  ['GeneratorExit', 'BaseException'], ['StopIteration', 'Exception'], ['ArithmeticError', 'Exception'], ['ZeroDivisionError', 'ArithmeticError'],
  ['OverflowError', 'ArithmeticError'], ['AssertionError', 'Exception'], ['AttributeError', 'Exception'], ['EOFError', 'Exception'],
  ['ImportError', 'Exception'], ['LookupError', 'Exception'], ['IndexError', 'LookupError'], ['KeyError', 'LookupError'], ['MemoryError', 'Exception'],
  ['NameError', 'Exception'], ['UnboundLocalError', 'NameError'], ['OSError', 'Exception'], ['RuntimeError', 'Exception'],
  ['NotImplementedError', 'RuntimeError'], ['SyntaxError', 'Exception'], ['TypeError', 'Exception'], ['ValueError', 'Exception'], ['UnicodeError', 'ValueError'],
];
export const EXC = {};
for (const [name, base] of EXC_TREE) EXC[name] = new PyClass(name, base ? [EXC[base]] : [], {});
EXC.IOError = EXC.OSError;
EXC.BaseException.attrs.__init__ = new NativeFn('__init__', (a) => { a[0].attrs.args = tuple(a.slice(1)); return null; });
EXC.TimeoutError = new PyClass('TimeoutError', [EXC.OSError], {});

export function newExc(cls, args) {
  const e = new PyInstance(cls);
  e.attrs.args = tuple(args.slice());
  return e;
}
export function pyErr(name, msg) {
  return new PyError(newExc(EXC[name], msg === undefined ? [] : [msg]));
}
export const isExc = (o) => o instanceof PyInstance && o.cls.isSub(EXC.BaseException);

// ------------------------------------------------------------------ truth, identity, equality, hashing
export function truthy(v) {
  if (v === null || v === undefined || v === false) return false;
  if (v === true) return true;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (v instanceof Fl) return v.v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof PyDict || v instanceof PySet) return v.size > 0;
  if (v instanceof PyRange) return v.length > 0;
  if (v instanceof PyBytes) return v.a.length > 0;
  if (v instanceof PyInstance) {
    const b = v.cls.lookup('__bool__');
    if (b) return truthy(hooks.callSync(b, [v]));
    const l = v.cls.lookup('__len__');
    if (l) return truthy(hooks.callSync(l, [v]));
  }
  return true;
}

let idc = 0;
const ids = new WeakMap();
export function objId(o) {
  if (o === null || o === undefined) return 0;
  if (typeof o === 'object' || typeof o === 'function') {
    let i = ids.get(o);
    if (!i) { i = 0x3ffe0000 + (++idc) * 16; ids.set(o, i); }
    return i;
  }
  return typeof o === 'number' ? (o << 1) | 1 : typeof o === 'boolean' ? (o ? 5 : 3) : 0x3ffa0000 + String(o).length;
}

export function hkey(k) {
  if (typeof k === 'string') return 's' + k;
  if (typeof k === 'number') return k;
  if (k instanceof Fl) return k.v;
  if (typeof k === 'boolean') return k ? 1 : 0;
  if (k === null) return 'N';
  if (isTuple(k)) return 't(' + k.map((x) => String(hkey(x))).join(',') + ')';
  if (Array.isArray(k) || k instanceof PyDict || k instanceof PySet) throw pyErr('TypeError', 'unhashable type: \'' + typeName(k) + '\'');
  return 'o' + objId(k);
}

export function pyEq(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (isNum(a) && isNum(b)) return toNum(a) === toNum(b);
  if (typeof a === 'string' || typeof b === 'string') return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (isTuple(a) !== isTuple(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!pyEq(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof PyDict && b instanceof PyDict) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a.items()) { if (!b.has(k) || !pyEq(v, b.get(k))) return false; }
    return true;
  }
  if (a instanceof PySet && b instanceof PySet) {
    if (a.size !== b.size) return false;
    for (const k of a.items()) if (!b.has(k)) return false;
    return true;
  }
  if (a instanceof PyInstance) {
    const m = a.cls.lookup('__eq__');
    if (m) return truthy(hooks.callSync(m, [a, b]));
  }
  if (a instanceof PyRange && b instanceof PyRange) return a.start === b.start && a.stop === b.stop && a.step === b.step;
  return false;
}

export function typeName(v) {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (v instanceof Fl) return 'float';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return v.isTuple ? 'tuple' : 'list';
  if (v instanceof PyDict) return 'dict';
  if (v instanceof PySet) return 'set';
  if (v instanceof PyRange) return 'range';
  if (v instanceof PyBytes) return 'bytes';
  if (v instanceof PyInstance) return v.cls.name;
  if (v instanceof PyClass) return 'type';
  if (v instanceof PyFunc) return 'function';
  if (v instanceof NativeFn || v instanceof BoundMethod) return 'function';
  if (v instanceof PyModule) return 'module';
  if (v instanceof NativeObj) return v.typeName || 'object';
  if (v instanceof PyIter) return 'iterator';
  if (v instanceof NativeClass) return 'type';
  return 'object';
}

// ------------------------------------------------------------------ string conversion
export function floatRepr(x) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf';
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0';
  const ax = Math.abs(x);
  const e10 = Math.floor(Math.log10(ax));
  if (e10 < -4 || e10 >= 16) {
    let [m, e] = x.toExponential(6).split('e');
    if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '');
    return m + 'e' + e[0] + e.slice(1).padStart(2, '0');
  }
  let s = String(Number(x.toPrecision(7)));
  if (/e/.test(s)) s = Number(s).toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  if (!s.includes('.')) s += '.0';
  return s;
}

const QUOTE_ESC = { '\n': '\\n', '\r': '\\r', '\t': '\\t', '\\': '\\\\' };
export function strRepr(s) {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = q;
  for (const ch of s) {
    if (ch === q) out += '\\' + q;
    else if (QUOTE_ESC[ch]) out += QUOTE_ESC[ch];
    else if (ch < ' ' || ch === '\x7f') out += '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0');
    else out += ch;
  }
  return out + q;
}

export function pyRepr(v, seen = []) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : floatRepr(v);
  if (v instanceof Fl) return floatRepr(v.v);
  if (typeof v === 'string') return strRepr(v);
  if (Array.isArray(v)) {
    if (seen.includes(v)) return v.isTuple ? '(...)' : '[...]';
    seen = [...seen, v];
    const inner = v.map((x) => pyRepr(x, seen)).join(', ');
    return v.isTuple ? (v.length === 1 ? `(${inner},)` : `(${inner})`) : `[${inner}]`;
  }
  if (v instanceof PyDict) return '{' + v.items().map(([k, x]) => pyRepr(k, seen) + ': ' + pyRepr(x, seen)).join(', ') + '}';
  if (v instanceof PySet) return v.size ? '{' + v.items().map((x) => pyRepr(x, seen)).join(', ') + '}' : 'set()';
  if (v instanceof PyRange) return v.step === 1 ? `range(${v.start}, ${v.stop})` : `range(${v.start}, ${v.stop}, ${v.step})`;
  if (v instanceof PyBytes) return "b'" + v.a.map((c) => (c >= 32 && c < 127 && c !== 39 && c !== 92 ? String.fromCharCode(c) : '\\x' + c.toString(16).padStart(2, '0'))).join('') + "'";
  if (v instanceof PyInstance) {
    const m = v.cls.lookup('__repr__');
    if (m) return String(hooks.callSync(m, [v]));
    if (isExc(v)) return `${v.cls.name}(${(v.attrs.args || []).map((x) => pyRepr(x)).join(', ')})`;
    return `<${v.cls.name} object at 0x${objId(v).toString(16)}>`;
  }
  if (v instanceof PyClass) return `<class '${v.name}'>`;
  if (v instanceof NativeClass) return `<class '${v.name}'>`;
  if (v instanceof PyFunc) return `<function ${v.name}>`;
  if (v instanceof NativeFn) return `<built-in function ${v.name}>`;
  if (v instanceof BoundMethod) return `<bound_method ${v.fn.name || ''}>`;
  if (v instanceof PyModule) return `<module '${v.name}'>`;
  if (v instanceof NativeObj) return v.repr ? v.repr() : `<${v.typeName || 'object'}>`;
  return String(v);
}

export function pyStr(v) {
  if (typeof v === 'string') return v;
  if (v instanceof PyInstance) {
    const m = v.cls.lookup('__str__');
    if (m) return String(hooks.callSync(m, [v]));
    if (isExc(v)) return excMessage(v);
  }
  return pyRepr(v);
}

// ------------------------------------------------------------------ format()
export function formatSpec(v, spec) {
  if (v instanceof PyInstance) {
    const m = v.cls.lookup('__format__');
    if (m) return String(hooks.callSync(m, [v, spec]));
  }
  const m = /^(?:(.)?([<>=^]))?([-+ ])?(#)?(0)?(\d+)?([,_])?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/.exec(spec);
  if (!m) throw pyErr('ValueError', 'Invalid format specifier');
  let [, fill, align, sign, alt, zero, width, grouping, prec, type] = m;
  const w = width ? +width : 0;
  const p = prec !== undefined ? +prec : null;
  let body;
  const isStr = typeof v === 'string';
  if (isStr && (type === undefined || type === 's')) {
    body = p !== null ? v.slice(0, p) : v;
    align = align || '<';
  } else if (isNum(v) && !isStr) {
    let x = toNum(v);
    const flt = isFloat(v) || (!!type && 'eEfFgG%'.includes(type));
    if (type === 'c') { body = String.fromCharCode(x); align = align || '<'; } else {
      let neg = x < 0 || Object.is(x, -0);
      let ax = Math.abs(x);
      let s;
      switch (type) {
        case 'b': s = Math.trunc(ax).toString(2); if (alt) s = '0b' + s; break;
        case 'o': s = Math.trunc(ax).toString(8); if (alt) s = '0o' + s; break;
        case 'x': s = Math.trunc(ax).toString(16); if (alt) s = '0x' + s; break;
        case 'X': s = Math.trunc(ax).toString(16).toUpperCase(); if (alt) s = '0X' + s; break;
        case 'e': case 'E': s = ax.toExponential(p === null ? 6 : p).replace(/e([+-])(\d)$/, 'e$10$2'); if (type === 'E') s = s.toUpperCase(); break;
        case 'f': case 'F': s = ax.toFixed(p === null ? 6 : p); break;
        case '%': s = (ax * 100).toFixed(p === null ? 6 : p) + '%'; break;
        case 'g': case 'G': {
          const pr = p === null ? 6 : p === 0 ? 1 : p;
          const e = ax === 0 ? 0 : Math.floor(Math.log10(ax));
          if (e < -4 || e >= pr) s = ax.toExponential(pr - 1).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
          else s = String(Number(ax.toPrecision(pr)));
          if (type === 'G') s = s.toUpperCase();
          break;
        }
        case 'd': case 'n': s = String(Math.trunc(ax)); break;
        default:
          if (flt) {
            s = p !== null ? String(Number(ax.toPrecision(p || 1))) : floatRepr(ax);
            if (p !== null && isFloat(v) && !s.includes('.') && !s.includes('e')) s += '';
          } else s = String(ax);
      }
      if (grouping) { const parts = s.split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, grouping); s = parts.join('.'); }
      const sg = neg ? '-' : sign === '+' ? '+' : sign === ' ' ? ' ' : '';
      if (zero && !align) { align = '='; fill = fill || '0'; }
      if (align === '=') {
        const padN = Math.max(0, w - sg.length - s.length);
        return sg + (fill || ' ').repeat(padN) + s;
      }
      body = sg + s;
      align = align || '>';
    }
  } else {
    body = pyStr(v);
    align = align || '<';
  }
  if (body.length >= w) return body;
  const padN = w - body.length;
  const f = fill || ' ';
  if (align === '<') return body + f.repeat(padN);
  if (align === '^') { const l = Math.floor(padN / 2); return f.repeat(l) + body + f.repeat(padN - l); }
  return f.repeat(padN) + body;
}

/** printf-style `fmt % args`. */
export function percentFormat(fmt, args) {
  const list = isTuple(args) ? args : [args];
  let ai = 0;
  const dict = args instanceof PyDict ? args : null;
  const out = fmt.replace(/%(?:\(([^)]*)\))?([-+ #0]*)(\*|\d+)?(?:\.(\*|\d+))?([diouxXeEfFgGcrsa%])/g, (all, key, flags, width, prec, conv) => {
    if (conv === '%') return '%';
    let v;
    if (key !== undefined) {
      if (!dict || !dict.has(key)) throw pyErr('KeyError', key);
      v = dict.get(key);
    } else {
      if (width === '*') width = String(list[ai++]);
      if (prec === '*') prec = String(list[ai++]);
      if (ai >= list.length) throw pyErr('TypeError', 'not enough arguments for format string');
      v = list[ai++];
    }
    let spec = '';
    if (flags.includes('-')) spec += '<'; else if (flags.includes('0') && 'diouxXeEfFgG'.includes(conv)) spec += '0';
    if (flags.includes('+')) spec += '+'; else if (flags.includes(' ')) spec += ' ';
    if (flags.includes('#')) spec += '#';
    if (width) spec += (flags.includes('-') ? '' : '') + width;
    let s;
    switch (conv) {
      case 's': s = formatSpec(pyStr(v), spec + (prec !== undefined ? '.' + prec : '')); break;
      case 'r': case 'a': s = formatSpec(pyRepr(v), spec + (prec !== undefined ? '.' + prec : '')); break;
      case 'c': s = formatSpec(typeof v === 'string' ? v : String.fromCharCode(toNum(v)), spec); break;
      case 'd': case 'i': case 'u': {
        if (!isNum(v)) throw pyErr('TypeError', '%d format: a number is required, not ' + typeName(v));
        s = formatSpec(Math.trunc(toNum(v)), spec + 'd'); break;
      }
      case 'x': case 'X': case 'o': s = formatSpec(Math.trunc(toNum(v)), spec + conv); break;
      default:
        if (!isNum(v)) throw pyErr('TypeError', 'a float is required');
        s = formatSpec(mkf(toNum(v)), spec + (prec !== undefined ? '.' + prec : '') + conv);
    }
    return s;
  });
  if (!dict && ai < list.length) throw pyErr('TypeError', 'not all arguments converted during string formatting');
  return out;
}

// ------------------------------------------------------------------ iteration
export function iterate(v) {
  if (Array.isArray(v)) { let i = 0; return { next: () => (i < v.length ? { done: false, value: v[i++] } : { done: true }) }; }
  if (typeof v === 'string') { const chars = [...v]; let i = 0; return { next: () => (i < chars.length ? { done: false, value: chars[i++] } : { done: true }) }; }
  if (v instanceof PyRange) { let i = 0; const n = v.length; return { next: () => (i < n ? { done: false, value: v.at(i++) } : { done: true }) }; }
  if (v instanceof PyDict) { const ks = v.keys(); let i = 0; return { next: () => (i < ks.length ? { done: false, value: ks[i++] } : { done: true }) }; }
  if (v instanceof PySet) { const ks = v.items(); let i = 0; return { next: () => (i < ks.length ? { done: false, value: ks[i++] } : { done: true }) }; }
  if (v instanceof PyBytes) { let i = 0; return { next: () => (i < v.a.length ? { done: false, value: v.a[i++] } : { done: true }) }; }
  if (v instanceof PyIter) return v;
  if (v instanceof PyInstance) {
    const m = v.cls.lookup('__iter__');
    if (m) {
      const it = hooks.callSync(m, [v]);
      if (it instanceof PyInstance) {
        const nx = it.cls.lookup('__next__');
        if (nx) return { next: () => { try { return { done: false, value: hooks.callSync(nx, [it]) }; } catch (e) { if (e instanceof PyError && e.exc.cls.isSub(EXC.StopIteration)) return { done: true }; throw e; } } };
      }
      return iterate(it);
    }
    const g = v.cls.lookup('__getitem__');
    if (g) { let i = 0; return { next: () => { try { return { done: false, value: hooks.callSync(g, [v, i++]) }; } catch (e) { if (e instanceof PyError && e.exc.cls.isSub(EXC.IndexError)) return { done: true }; throw e; } } }; }
  }
  if (v instanceof NativeObj && v.iter) return v.iter();
  throw pyErr('TypeError', `'${typeName(v)}' object is not iterable`);
}

export function toList(v) {
  if (Array.isArray(v)) return v.slice();
  const it = iterate(v), out = [];
  for (let r = it.next(); !r.done; r = it.next()) out.push(r.value);
  return out;
}

// ------------------------------------------------------------------ comparison & arithmetic
export function pyCompare(a, b) {
  if (isNum(a) && isNum(b)) { const x = toNum(a), y = toNum(b); return x < y ? -1 : x > y ? 1 : 0; }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { const c = pyCompare(a[i], b[i]); if (c) return c; }
    return a.length - b.length < 0 ? -1 : a.length > b.length ? 1 : 0;
  }
  if (a instanceof PyInstance) {
    const lt = a.cls.lookup('__lt__');
    if (lt) return truthy(hooks.callSync(lt, [a, b])) ? -1 : pyEq(a, b) ? 0 : 1;
  }
  throw pyErr('TypeError', `unsupported types for comparison: '${typeName(a)}', '${typeName(b)}'`);
}

const big = (x) => BigInt(Math.trunc(x));
function bitop(op, x, y) {
  if (x >= 0 && y >= 0 && x < 2147483648 && y < 2147483648 && op !== '<<') {
    if (op === '&') return x & y;
    if (op === '|') return x | y;
    if (op === '^') return x ^ y;
    if (op === '>>') return y > 31 ? 0 : x >> y;
  }
  const a = big(x), b = big(y);
  switch (op) {
    case '&': return Number(a & b);
    case '|': return Number(a | b);
    case '^': return Number(a ^ b);
    case '<<': if (y < 0) throw pyErr('ValueError', 'negative shift count'); return Number(a << b);
    default: if (y < 0) throw pyErr('ValueError', 'negative shift count'); return Number(a >> b);
  }
}

export function binop(op, a, b) {
  if (isNum(a) && isNum(b)) {
    const fa = isFloat(a), fb = isFloat(b);
    const x = toNum(a), y = toNum(b);
    let f = fa || fb, r;
    switch (op) {
      case '+': r = x + y; break;
      case '-': r = x - y; break;
      case '*': r = x * y; break;
      case '/': if (y === 0) throw pyErr('ZeroDivisionError', 'divide by zero'); r = x / y; f = true; break;
      case '//': if (y === 0) throw pyErr('ZeroDivisionError', 'divide by zero'); r = Math.floor(x / y); break;
      case '%': if (y === 0) throw pyErr('ZeroDivisionError', 'divide by zero'); r = x - y * Math.floor(x / y); break;
      case '**':
        if (!f && y < 0) f = true;
        if (x === 0 && y < 0) throw pyErr('ZeroDivisionError', 'divide by zero');
        r = x ** y;
        break;
      case '&': case '|': case '^': case '<<': case '>>':
        if (f) throw pyErr('TypeError', `unsupported types for ${op}: 'float', '${typeName(b)}'`);
        return bitop(op, x, y);
      default: throw pyErr('TypeError', 'unsupported operand type for ' + op);
    }
    return f ? mkf(r) : r;
  }
  if (op === '+') {
    if (typeof a === 'string' && typeof b === 'string') return a + b;
    if (Array.isArray(a) && Array.isArray(b)) { const r = a.concat(b); if (a.isTuple && b.isTuple) r.isTuple = true; return r; }
    if (a instanceof PyBytes && b instanceof PyBytes) return new PyBytes(a.a.concat(b.a));
  } else if (op === '*') {
    if (typeof a === 'string' && isNum(b)) return a.repeat(Math.max(0, toNum(b)));
    if (isNum(a) && typeof b === 'string') return b.repeat(Math.max(0, toNum(a)));
    if (Array.isArray(a) && isNum(b)) { let r = []; for (let i = 0; i < toNum(b); i++) r = r.concat(a); if (a.isTuple) r.isTuple = true; return r; }
    if (isNum(a) && Array.isArray(b)) return binop('*', b, a);
  } else if (op === '%') {
    if (typeof a === 'string') return percentFormat(a, b);
  } else if (op === '|' || op === '&' || op === '-' || op === '^') {
    if (a instanceof PySet && b instanceof PySet) {
      const r = new PySet();
      if (op === '|') { a.items().forEach((x) => r.add(x)); b.items().forEach((x) => r.add(x)); }
      else if (op === '&') a.items().forEach((x) => { if (b.has(x)) r.add(x); });
      else if (op === '-') a.items().forEach((x) => { if (!b.has(x)) r.add(x); });
      else { a.items().forEach((x) => { if (!b.has(x)) r.add(x); }); b.items().forEach((x) => { if (!a.has(x)) r.add(x); }); }
      return r;
    }
    if (op === '|' && a instanceof PyDict && b instanceof PyDict) { const r = new PyDict(); a.items().forEach(([k, v]) => r.set(k, v)); b.items().forEach(([k, v]) => r.set(k, v)); return r; }
  }
  if (a instanceof PyInstance) {
    const names = { '+': '__add__', '-': '__sub__', '*': '__mul__', '/': '__truediv__', '//': '__floordiv__', '%': '__mod__', '**': '__pow__' };
    const m = names[op] && a.cls.lookup(names[op]);
    if (m) return hooks.callSync(m, [a, b]);
  }
  if (b instanceof PyInstance) {
    const names = { '+': '__radd__', '-': '__rsub__', '*': '__rmul__', '/': '__rtruediv__' };
    const m = names[op] && b.cls.lookup(names[op]);
    if (m) return hooks.callSync(m, [b, a]);
  }
  throw pyErr('TypeError', `unsupported operand types for ${op}: '${typeName(a)}' and '${typeName(b)}'`);
}

export function contains(container, item) {
  if (Array.isArray(container)) { for (const x of container) if (pyEq(x, item)) return true; return false; }
  if (typeof container === 'string') {
    if (typeof item !== 'string') throw pyErr('TypeError', "'in <string>' requires string as left operand");
    return container.includes(item);
  }
  if (container instanceof PyDict || container instanceof PySet) return container.has(item);
  if (container instanceof PyRange) { if (!isNum(item)) return false; const x = toNum(item); const n = (x - container.start) / container.step; return Number.isInteger(n) && n >= 0 && n < container.length; }
  if (container instanceof PyBytes) return container.a.includes(item);
  if (container instanceof PyInstance) {
    const m = container.cls.lookup('__contains__');
    if (m) return truthy(hooks.callSync(m, [container, item]));
    const it = iterate(container);
    for (let r = it.next(); !r.done; r = it.next()) if (pyEq(r.value, item)) return true;
    return false;
  }
  throw pyErr('TypeError', `'${typeName(container)}' object is not iterable`);
}

export function pyLen(v) {
  if (typeof v === 'string') return [...v].length;
  if (Array.isArray(v)) return v.length;
  if (v instanceof PyDict || v instanceof PySet) return v.size;
  if (v instanceof PyRange) return v.length;
  if (v instanceof PyBytes) return v.a.length;
  if (v instanceof PyInstance) {
    const m = v.cls.lookup('__len__');
    if (m) return hooks.callSync(m, [v]);
  }
  if (v instanceof NativeObj && v.len) return v.len();
  throw pyErr('TypeError', `object of type '${typeName(v)}' has no len()`);
}

/** Integer for indexing/range arguments (accepts bool, whole floats are rejected like CPython). */
export function toInt(v, what = 'an integer') {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  throw pyErr('TypeError', `${what} is required (got type ${typeName(v)})`);
}
