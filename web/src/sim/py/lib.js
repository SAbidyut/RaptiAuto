// Python built-ins and the pure (hardware independent) standard modules: math, random, time, sys, gc, json, os ...
import {
  hooks, Fl, mkf, isNum, isFloat, toNum, tuple, isTuple, PyDict, PySet, PyRange, PyBytes, PyIter, PyClass, PyInstance, PyFunc, BoundMethod, NativeFn, NativeClass, NativeObj,
  PyModule, PyError, EXC, pyErr, truthy, pyEq, pyCompare, pyStr, pyRepr, binop, iterate, toList, toInt, typeName, pyLen, objId, hkey, formatSpec,
} from './values.js';
import { builtinMethod } from './methods.js';
import { PySlice, PyProperty, StaticMethod, ClassMethod } from './interp.js';

const callSync = (...a) => hooks.callSync(...a);
const kwGet = (kw, name, dflt) => (kw && name in kw ? kw[name] : dflt);
const fn = (name, f, gen = false) => new NativeFn(name, f, gen);

function need(args, lo, hi, name) {
  if (args.length < lo || args.length > hi) throw pyErr('TypeError', `${name}() takes ${lo === hi ? lo : lo + ' to ' + hi} positional arguments but ${args.length} were given`);
}

function roundHalfEven(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

function parseInt10(s, base) {
  let t = s.trim().replace(/_/g, '');
  let sign = 1;
  if (t[0] === '-' || t[0] === '+') { if (t[0] === '-') sign = -1; t = t.slice(1); }
  if (base === 0) {
    if (/^0[xX]/.test(t)) { base = 16; t = t.slice(2); } else if (/^0[bB]/.test(t)) { base = 2; t = t.slice(2); } else if (/^0[oO]/.test(t)) { base = 8; t = t.slice(2); } else base = 10;
  } else if (base === 16) t = t.replace(/^0[xX]/, '');
  else if (base === 2) t = t.replace(/^0[bB]/, '');
  else if (base === 8) t = t.replace(/^0[oO]/, '');
  const digits = '0123456789abcdefghijklmnopqrstuvwxyz'.slice(0, base);
  if (!t || [...t.toLowerCase()].some((c) => !digits.includes(c))) throw pyErr('ValueError', `invalid syntax for integer with base ${base}: ${pyRepr(s)}`);
  return sign * parseInt(t, base);
}

export function makeBuiltins(ctx) {
  const B = Object.create(null);
  const types = new Map();
  const mkType = (name, f, check, gen = false) => {
    const t = new NativeFn(name, f, gen);
    t.check = check;
    t.isType = true;
    B[name] = t;
    types.set(name, t);
    return t;
  };

  // ---- types
  mkType('int', (a) => {
    need(a, 0, 2, 'int');
    if (!a.length) return 0;
    const v = a[0];
    if (typeof v === 'string') return parseInt10(v, a.length > 1 ? a[1] : 10);
    if (isNum(v)) {
      const x = toNum(v);
      if (!Number.isFinite(x)) throw pyErr(Number.isNaN(x) ? 'ValueError' : 'OverflowError', Number.isNaN(x) ? 'cannot convert float NaN to integer' : 'cannot convert float infinity to integer');
      return Math.trunc(x);
    }
    if (v instanceof PyInstance && v.cls.lookup('__int__')) return callSync(v.cls.lookup('__int__'), [v]);
    throw pyErr('TypeError', `can't convert ${typeName(v)} to int`);
  }, (v) => (typeof v === 'number' && Number.isInteger(v)) || typeof v === 'boolean');
  mkType('float', (a) => {
    need(a, 0, 1, 'float');
    if (!a.length) return new Fl(0);
    const v = a[0];
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t === 'nan' || t === '+nan' || t === '-nan') return NaN;
      if (t === 'inf' || t === '+inf' || t === 'infinity') return Infinity;
      if (t === '-inf' || t === '-infinity') return -Infinity;
      if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/.test(t.replace(/_/g, ''))) throw pyErr('ValueError', `invalid syntax for number`);
      return mkf(parseFloat(t.replace(/_/g, '')));
    }
    if (isNum(v)) return mkf(toNum(v));
    if (v instanceof PyInstance && v.cls.lookup('__float__')) return callSync(v.cls.lookup('__float__'), [v]);
    throw pyErr('TypeError', `can't convert ${typeName(v)} to float`);
  }, (v) => isFloat(v));
  mkType('str', (a) => { need(a, 0, 3, 'str'); return a.length ? (a.length > 1 && a[0] instanceof PyBytes ? new TextDecoder().decode(new Uint8Array(a[0].a)) : pyStr(a[0])) : ''; }, (v) => typeof v === 'string');
  mkType('bool', (a) => (a.length ? truthy(a[0]) : false), (v) => typeof v === 'boolean');
  mkType('list', (a) => (a.length ? toList(a[0]) : []), (v) => Array.isArray(v) && !v.isTuple);
  mkType('tuple', (a) => tuple(a.length ? toList(a[0]) : []), (v) => isTuple(v));
  mkType('dict', (a, kw) => {
    const d = new PyDict();
    if (a.length) {
      const src = a[0];
      if (src instanceof PyDict) src.items().forEach(([k, v]) => d.set(k, v));
      else for (const pair of toList(src)) { const p = toList(pair); if (p.length !== 2) throw pyErr('ValueError', 'dictionary update sequence element has wrong length'); d.set(p[0], p[1]); }
    }
    for (const k of Object.keys(kw || {})) d.set(k, kw[k]);
    return d;
  }, (v) => v instanceof PyDict);
  mkType('set', (a) => { const s = new PySet(); if (a.length) toList(a[0]).forEach((x) => s.add(x)); return s; }, (v) => v instanceof PySet);
  B.frozenset = B.set;
  mkType('bytes', (a) => {
    if (!a.length) return new PyBytes([]);
    const v = a[0];
    if (typeof v === 'number') return new PyBytes(new Array(v).fill(0));
    if (typeof v === 'string') return new PyBytes([...new TextEncoder().encode(v)]);
    return new PyBytes(toList(v).map((x) => toInt(x) & 255));
  }, (v) => v instanceof PyBytes);
  B.bytearray = B.bytes;
  mkType('range', (a) => {
    need(a, 1, 3, 'range');
    const [x, y, z] = a.map((v) => toInt(v, 'range() integer argument'));
    if (a.length === 1) return new PyRange(0, x, 1);
    const step = a.length === 3 ? z : 1;
    if (step === 0) throw pyErr('ValueError', 'zero step for range()');
    return new PyRange(x, y, step);
  }, (v) => v instanceof PyRange);
  B.object = new PyClass('object', [], {});
  mkType('type', (a) => {
    if (a.length !== 1) throw pyErr('TypeError', 'type() takes 1 argument');
    const v = a[0];
    if (v instanceof PyInstance) return v.cls;
    return types.get(typeName(v)) || B.object;
  }, () => false);

  // ---- functions
  B.print = fn('print', (a, kw) => {
    const sep = kwGet(kw, 'sep', ' '), end = kwGet(kw, 'end', '\n');
    ctx.print(a.map(pyStr).join(sep === null ? ' ' : sep) + (end === null ? '\n' : end));
    return null;
  });
  B.len = fn('len', (a) => { need(a, 1, 1, 'len'); return pyLen(a[0]); });
  B.abs = fn('abs', (a) => { const v = a[0]; if (!isNum(v)) throw pyErr('TypeError', `bad operand type for abs(): '${typeName(v)}'`); const x = Math.abs(toNum(v)); return isFloat(v) ? mkf(x) : x; });
  B.repr = fn('repr', (a) => pyRepr(a[0]));
  B.hash = fn('hash', (a) => { const k = hkey(a[0]); if (typeof k === 'number') return k; let h = 0; for (const c of String(k)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; });
  B.id = fn('id', (a) => objId(a[0]));
  B.callable = fn('callable', (a) => a[0] instanceof PyFunc || a[0] instanceof NativeFn || a[0] instanceof BoundMethod || a[0] instanceof PyClass || a[0] instanceof NativeClass || (a[0] instanceof PyInstance && !!a[0].cls.lookup('__call__')) || (a[0] instanceof NativeObj && !!a[0].call));
  B.chr = fn('chr', (a) => { const n = toInt(a[0]); if (n < 0 || n > 0x10ffff) throw pyErr('ValueError', 'chr() arg not in range(0x110000)'); return String.fromCodePoint(n); });
  B.ord = fn('ord', (a) => { if (typeof a[0] !== 'string' || [...a[0]].length !== 1) throw pyErr('TypeError', 'ord() expected a character'); return a[0].codePointAt(0); });
  B.hex = fn('hex', (a) => { const n = toInt(a[0]); return (n < 0 ? '-0x' : '0x') + Math.abs(n).toString(16); });
  B.bin = fn('bin', (a) => { const n = toInt(a[0]); return (n < 0 ? '-0b' : '0b') + Math.abs(n).toString(2); });
  B.oct = fn('oct', (a) => { const n = toInt(a[0]); return (n < 0 ? '-0o' : '0o') + Math.abs(n).toString(8); });
  B.divmod = fn('divmod', (a) => tuple([binop('//', a[0], a[1]), binop('%', a[0], a[1])]));
  B.pow = fn('pow', (a) => {
    if (a.length === 3) { let r = 1n; let b = BigInt(toInt(a[0])) % BigInt(toInt(a[2])); let e = BigInt(toInt(a[1])); const m = BigInt(toInt(a[2])); while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; } return Number(r); }
    return binop('**', a[0], a[1]);
  });
  B.round = fn('round', (a) => {
    const v = a[0];
    if (!isNum(v)) throw pyErr('TypeError', `type ${typeName(v)} doesn't define __round__ method`);
    const x = toNum(v);
    if (a.length < 2 || a[1] === null) {
      if (!Number.isFinite(x)) throw pyErr(Number.isNaN(x) ? 'ValueError' : 'OverflowError', 'cannot convert float to integer');
      return roundHalfEven(x);
    }
    const n = toInt(a[1]);
    const m = 10 ** n;
    let r;
    if (n >= 0 && n <= 100) {
      const exact = Math.abs(x).toFixed(Math.min(100, n + 30));
      const tail = exact.slice(exact.indexOf('.') + 1 + n);
      r = /^50*$/.test(tail) ? roundHalfEven(x * m) / m : Number(x.toFixed(n));
    } else r = roundHalfEven(x * m) / m;
    return isFloat(v) ? mkf(r) : (n >= 0 ? x : r);
  });
  B.sum = fn('sum', (a, kw) => { let t = a.length > 1 ? a[1] : kwGet(kw, 'start', 0); const it = iterate(a[0]); for (let r = it.next(); !r.done; r = it.next()) t = binop('+', t, r.value); return t; });
  const minmax = (name, sign) => fn(name, (a, kw) => {
    const key = kwGet(kw, 'key', null);
    const vals = a.length === 1 ? toList(a[0]) : a;
    if (!vals.length) { if (kw && 'default' in kw) return kw.default; throw pyErr('ValueError', `${name}() arg is an empty sequence`); }
    let best = vals[0], bk = key ? callSync(key, [best]) : best;
    for (let i = 1; i < vals.length; i++) { const k = key ? callSync(key, [vals[i]]) : vals[i]; if (pyCompare(k, bk) * sign > 0) { best = vals[i]; bk = k; } }
    return best;
  });
  B.min = minmax('min', -1);
  B.max = minmax('max', 1);
  B.sorted = fn('sorted', (a, kw) => { const l = toList(a[0]); builtinMethod(l, 'sort')(l, [], kw); return l; });
  B.reversed = fn('reversed', (a) => { const it = iterate(toList(a[0]).reverse()); return new PyIter(it.next); });
  B.any = fn('any', (a) => { const it = iterate(a[0]); for (let r = it.next(); !r.done; r = it.next()) if (truthy(r.value)) return true; return false; });
  B.all = fn('all', (a) => { const it = iterate(a[0]); for (let r = it.next(); !r.done; r = it.next()) if (!truthy(r.value)) return false; return true; });
  B.enumerate = fn('enumerate', (a, kw) => {
    const it = iterate(a[0]);
    let i = a.length > 1 ? a[1] : kwGet(kw, 'start', 0);
    return new PyIter(() => { const r = it.next(); return r.done ? { done: true } : { done: false, value: tuple([i++, r.value]) }; });
  });
  B.zip = fn('zip', (a) => {
    const its = a.map(iterate);
    return new PyIter(() => {
      if (!its.length) return { done: true };
      const out = [];
      for (const it of its) { const r = it.next(); if (r.done) return { done: true }; out.push(r.value); }
      return { done: false, value: tuple(out) };
    });
  });
  B.map = fn('map', (a) => {
    const f = a[0];
    const its = a.slice(1).map(iterate);
    return new PyIter(() => {
      const args = [];
      for (const it of its) { const r = it.next(); if (r.done) return { done: true }; args.push(r.value); }
      return { done: false, value: callSync(f, args) };
    });
  });
  B.filter = fn('filter', (a) => {
    const f = a[0], it = iterate(a[1]);
    return new PyIter(() => {
      for (;;) { const r = it.next(); if (r.done) return r; if (truthy(f === null ? r.value : callSync(f, [r.value]))) return r; }
    });
  });
  B.iter = fn('iter', (a) => { const it = iterate(a[0]); return it instanceof PyIter ? it : new PyIter(it.next); });
  B.next = fn('next', (a) => {
    const it = a[0] instanceof PyIter ? a[0] : iterate(a[0]);
    const r = it.next();
    if (r.done) { if (a.length > 1) return a[1]; throw pyErr('StopIteration'); }
    return r.value;
  });
  B.isinstance = fn('isinstance', (a) => {
    const check = (t) => {
      if (isTuple(t)) return t.some(check);
      if (t === B.object) return true;
      if (t instanceof PyClass) return a[0] instanceof PyInstance && a[0].cls.isSub(t);
      if (t instanceof NativeFn && t.check) return t.check(a[0]);
      if (t instanceof NativeClass) return a[0] instanceof NativeObj && a[0].cls === t;
      throw pyErr('TypeError', 'isinstance() arg 2 must be a type or tuple of types');
    };
    return check(a[1]);
  });
  B.issubclass = fn('issubclass', (a) => a[0] instanceof PyClass && a[1] instanceof PyClass && a[0].isSub(a[1]));
  B.getattr = fn('getattr', (a) => {
    try { return ctx.interp.getAttr(a[0], a[1]); } catch (e) { if (a.length > 2 && e instanceof PyError && e.exc.cls.isSub(EXC.AttributeError)) return a[2]; throw e; }
  });
  B.setattr = fn('setattr', (a) => { ctx.interp.setAttr(a[0], a[1], a[2]); return null; });
  B.hasattr = fn('hasattr', (a) => { try { ctx.interp.getAttr(a[0], a[1]); return true; } catch (e) { if (e instanceof PyError && e.exc.cls.isSub(EXC.AttributeError)) return false; throw e; } });
  B.property = fn('property', (a) => new PyProperty(a[0], a[1] || null));
  B.staticmethod = fn('staticmethod', (a) => new StaticMethod(a[0]));
  B.classmethod = fn('classmethod', (a) => new ClassMethod(a[0]));
  B.input = fn('input', function* (a) {
    if (a.length) ctx.print(pyStr(a[0]));
    const rt = ctx.rt;
    const ok = yield* rt.waitFor(() => ctx.serial.buf.includes('\n') || ctx.serial.buf.includes('\r'), Infinity);
    void ok;
    const m = /^([^\r\n]*)[\r\n]+/.exec(ctx.serial.buf);
    const line = m ? m[1] : ctx.serial.buf;
    ctx.serial.buf = m ? ctx.serial.buf.slice(m[0].length) : '';
    return line;
  }, true);
  B.exit = fn('exit', () => { throw new PyError(new PyInstanceExit()); });
  B.globals = fn('globals', () => { const d = new PyDict(); for (const k of Object.keys(ctx.interp.G.vars)) d.set(k, ctx.interp.G.vars[k]); return d; });
  B.dir = fn('dir', (a) => { const o = a[0]; let names = []; if (o instanceof PyInstance) names = [...Object.keys(o.attrs), ...o.cls.mro.flatMap((c) => Object.keys(c.attrs))]; else if (o instanceof PyModule) names = Object.keys(o.attrs); return [...new Set(names)].sort(); });

  for (const [name, cls] of Object.entries(EXC)) B[name] = cls;
  B.__name__ = '__main__';
  return B;
}

function PyInstanceExit() {
  const e = new PyInstance(EXC.SystemExit);
  e.attrs.args = [];
  return e;
}

// ------------------------------------------------------------------ pure modules
const mod = (name, attrs) => new PyModule(name, attrs);

export function makePureModules(ctx) {
  const rt = ctx.rt;
  const m = {};

  // ---- math
  const f1 = (name, g) => fn(name, (a) => { need(a, 1, 1, name); if (!isNum(a[0])) throw pyErr('TypeError', `can't convert ${typeName(a[0])} to float`); return mkf(g(toNum(a[0]))); });
  const dom = (name, g, ok) => fn(name, (a) => { const x = toNum(a[0]); if (!ok(x)) throw pyErr('ValueError', 'math domain error'); return mkf(g(x)); });
  m.math = mod('math', {
    pi: Math.PI, e: Math.E, tau: Math.PI * 2, inf: Infinity, nan: NaN,
    sin: f1('sin', Math.sin), cos: f1('cos', Math.cos), tan: f1('tan', Math.tan), atan: f1('atan', Math.atan),
    asin: dom('asin', Math.asin, (x) => x >= -1 && x <= 1), acos: dom('acos', Math.acos, (x) => x >= -1 && x <= 1),
    sinh: f1('sinh', Math.sinh), cosh: f1('cosh', Math.cosh), tanh: f1('tanh', Math.tanh),
    exp: f1('exp', Math.exp), sqrt: dom('sqrt', Math.sqrt, (x) => x >= 0), fabs: f1('fabs', Math.abs),
    log: fn('log', (a) => { const x = toNum(a[0]); if (x <= 0) throw pyErr('ValueError', 'math domain error'); return mkf(a.length > 1 ? Math.log(x) / Math.log(toNum(a[1])) : Math.log(x)); }),
    log10: dom('log10', Math.log10, (x) => x > 0), log2: dom('log2', Math.log2, (x) => x > 0),
    floor: fn('floor', (a) => Math.floor(toNum(a[0]))), ceil: fn('ceil', (a) => Math.ceil(toNum(a[0]))), trunc: fn('trunc', (a) => Math.trunc(toNum(a[0]))),
    pow: fn('pow', (a) => mkf(toNum(a[0]) ** toNum(a[1]))), atan2: fn('atan2', (a) => mkf(Math.atan2(toNum(a[0]), toNum(a[1])))),
    hypot: fn('hypot', (a) => mkf(Math.hypot(...a.map(toNum)))), degrees: f1('degrees', (x) => (x * 180) / Math.PI), radians: f1('radians', (x) => (x * Math.PI) / 180),
    fmod: fn('fmod', (a) => mkf(toNum(a[0]) % toNum(a[1]))), copysign: fn('copysign', (a) => mkf(Math.sign(toNum(a[1])) * Math.abs(toNum(a[0])))),
    isnan: fn('isnan', (a) => Number.isNaN(toNum(a[0]))), isinf: fn('isinf', (a) => Math.abs(toNum(a[0])) === Infinity), isfinite: fn('isfinite', (a) => Number.isFinite(toNum(a[0]))),
    modf: fn('modf', (a) => { const x = toNum(a[0]); const i = Math.trunc(x); return tuple([mkf(x - i), mkf(i)]); }),
    factorial: fn('factorial', (a) => { let r = 1; for (let i = 2; i <= toInt(a[0]); i++) r *= i; return r; }),
    gcd: fn('gcd', (a) => { let x = Math.abs(toInt(a[0])), y = Math.abs(toInt(a[1])); while (y) [x, y] = [y, x % y]; return x; }),
    ldexp: fn('ldexp', (a) => mkf(toNum(a[0]) * 2 ** toNum(a[1]))), frexp: fn('frexp', (a) => { const x = toNum(a[0]); if (x === 0) return tuple([mkf(0), 0]); const e = Math.ceil(Math.log2(Math.abs(x))); return tuple([mkf(x / 2 ** e), e]); }),
  });

  // ---- random (seeded PRNG so runs are repeatable until seed() changes it)
  let seed = (Math.random() * 2 ** 32) >>> 0;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const randrange = (a, b, step = 1) => { const n = Math.ceil((b - a) / step); if (n <= 0) throw pyErr('ValueError', 'empty range for randrange()'); return a + step * Math.floor(rnd() * n); };
  m.random = mod('random', {
    random: fn('random', () => mkf(rnd())),
    seed: fn('seed', (a) => { seed = a.length && a[0] !== null ? (toNum(a[0]) >>> 0) : (Math.random() * 2 ** 32) >>> 0; return null; }),
    randint: fn('randint', (a) => { const lo = toInt(a[0]), hi = toInt(a[1]); if (hi < lo) throw pyErr('ValueError', 'empty range for randint()'); return lo + Math.floor(rnd() * (hi - lo + 1)); }),
    randrange: fn('randrange', (a) => (a.length === 1 ? randrange(0, toInt(a[0])) : randrange(toInt(a[0]), toInt(a[1]), a[2] ? toInt(a[2]) : 1))),
    uniform: fn('uniform', (a) => mkf(toNum(a[0]) + rnd() * (toNum(a[1]) - toNum(a[0])))),
    choice: fn('choice', (a) => { const l = toList(a[0]); if (!l.length) throw pyErr('IndexError', 'empty sequence'); return l[Math.floor(rnd() * l.length)]; }),
    shuffle: fn('shuffle', (a) => { const l = a[0]; for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return null; }),
    getrandbits: fn('getrandbits', (a) => Math.floor(rnd() * 2 ** toInt(a[0]))),
    sample: fn('sample', (a) => { const l = toList(a[0]); const k = toInt(a[1]); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l.slice(0, k); }),
  });
  ctx.rnd = rnd;

  // ---- time
  const epoch0 = Math.floor(Date.now() / 1000) - 946684800; // MicroPython epoch is 2000-01-01
  const WRAP = 2 ** 30;
  const sleepUs = function* (us) {
    if (ctx.interp.syncDepth > 0) { rt.t = Math.max(rt.t, rt.t + us); return null; }
    yield* rt.waitUntil(rt.t + us);
    return null;
  };
  const secs = () => epoch0 + Math.floor(rt.t / 1e6);
  const tm = (s) => { const d = new Date((s + 946684800) * 1000); const yd = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1; return tuple([d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), (d.getUTCDay() + 6) % 7, yd]); };
  m.time = mod('time', {
    sleep: fn('sleep', function* (a) { const s = toNum(a[0]); if (s < 0) throw pyErr('ValueError', 'sleep length must be non-negative'); return yield* sleepUs(s * 1e6); }, true),
    sleep_ms: fn('sleep_ms', function* (a) { return yield* sleepUs(Math.max(0, toNum(a[0])) * 1e3); }, true),
    sleep_us: fn('sleep_us', function* (a) { return yield* sleepUs(Math.max(0, toNum(a[0]))); }, true),
    ticks_ms: fn('ticks_ms', () => Math.floor(rt.t / 1000) % WRAP),
    ticks_us: fn('ticks_us', () => Math.floor(rt.t) % WRAP),
    ticks_cpu: fn('ticks_cpu', () => Math.floor(rt.t) % WRAP),
    ticks_add: fn('ticks_add', (a) => (((toInt(a[0]) + toInt(a[1])) % WRAP) + WRAP) % WRAP),
    ticks_diff: fn('ticks_diff', (a) => (((toInt(a[0]) - toInt(a[1]) + WRAP / 2) % WRAP) + WRAP) % WRAP - WRAP / 2),
    time: fn('time', () => secs()),
    time_ns: fn('time_ns', () => Math.floor((epoch0 + rt.t / 1e6) * 1e9)),
    localtime: fn('localtime', (a) => tm(a.length && a[0] !== null ? toInt(a[0]) : secs())),
    gmtime: fn('gmtime', (a) => tm(a.length && a[0] !== null ? toInt(a[0]) : secs())),
    mktime: fn('mktime', (a) => { const t = toList(a[0]); return Math.floor(Date.UTC(t[0], t[1] - 1, t[2], t[3], t[4], t[5]) / 1000) - 946684800; }),
  });
  m.utime = m.time;

  // ---- sys / gc / os / micropython
  const stdout = new NativeObj();
  stdout.typeName = 'TextIOWrapper';
  stdout.getAttr = (name) => (name === 'write' ? fn('write', (a) => { ctx.print(pyStr(a[0])); return pyLen(a[0]); }) : name === 'flush' ? fn('flush', () => null) : undefined);
  m.sys = mod('sys', {
    platform: ctx.platform, version: '3.4.0; MicroPython v1.23.0', version_info: tuple([3, 4, 0]), byteorder: 'little', maxsize: 2 ** 31 - 1,
    implementation: tuple(['micropython', tuple([1, 23, 0])]), modules: new PyDict(), path: [''], argv: [], stdout, stderr: stdout,
    exit: fn('exit', () => { throw new PyError(PyInstanceExit()); }),
  });
  m.gc = mod('gc', {
    collect: fn('collect', () => null), enable: fn('enable', () => null), disable: fn('disable', () => null), isenabled: fn('isenabled', () => true),
    mem_free: fn('mem_free', () => 112640), mem_alloc: fn('mem_alloc', () => 16384),
  });
  const uname = new NativeObj();
  uname.typeName = 'uname_result';
  const unameVals = { sysname: ctx.platform, nodename: ctx.platform, release: '1.23.0', version: 'v1.23.0 RaptiAuto simulator', machine: ctx.machineName };
  uname.getAttr = (n) => unameVals[n];
  uname.iter = () => iterate(tuple(Object.values(unameVals)));
  m.os = mod('os', {
    uname: fn('uname', () => uname), urandom: fn('urandom', (a) => new PyBytes(Array.from({ length: toInt(a[0]) }, () => Math.floor(ctx.rnd() * 256)))),
    listdir: fn('listdir', () => ['boot.py', 'main.py']), getcwd: fn('getcwd', () => '/'), sep: '/', name: 'posix',
    mkdir: fn('mkdir', () => null), remove: fn('remove', () => null), rename: fn('rename', () => null),
  });
  m.micropython = mod('micropython', {
    const: fn('const', (a) => a[0]), native: fn('native', (a) => a[0]), viper: fn('viper', (a) => a[0]), bytecode: fn('bytecode', (a) => a[0]),
    opt_level: fn('opt_level', () => 0), mem_info: fn('mem_info', () => { ctx.print('mem: total=112640, used=16384, free=96256\n'); return null; }),
    schedule: fn('schedule', (a) => { ctx.interp.rt.queueIsr({ pyfn: a[0], args: [a[1]] }); return null; }), alloc_emergency_exception_buf: fn('alloc_emergency_exception_buf', () => null),
    kbd_intr: fn('kbd_intr', () => null),
  });

  // ---- json
  const toPy = (v) => {
    if (v === null) return null;
    if (Array.isArray(v)) return v.map(toPy);
    if (typeof v === 'object') { const d = new PyDict(); for (const k of Object.keys(v)) d.set(k, toPy(v[k])); return d; }
    if (typeof v === 'number') return Number.isInteger(v) && !/[.eE]/.test(String(v)) ? v : v;
    return v;
  };
  const toJs = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean' || typeof v === 'string') return v;
    if (isNum(v)) return toNum(v);
    if (Array.isArray(v)) return v.map(toJs);
    if (v instanceof PyDict) { const o = {}; v.items().forEach(([k, x]) => { o[pyStr(k)] = toJs(x); }); return o; }
    throw pyErr('TypeError', `object of type '${typeName(v)}' is not JSON serializable`);
  };
  const dumps = (a, kw) => {
    const ind = kwGet(kw, 'indent', null);
    const s = JSON.stringify(toJs(a[0]), null, ind === null ? undefined : ind);
    return ind === null ? s.replace(/":/g, '": ').replace(/,"/g, ', "') : s;
  };
  m.json = mod('json', {
    dumps: fn('dumps', dumps),
    loads: fn('loads', (a) => { try { return toPy(JSON.parse(pyStr(a[0]))); } catch (e) { throw pyErr('ValueError', 'syntax error in JSON'); } }),
  });
  m.ujson = m.json;

  // ---- struct (minimal)
  m.collections = mod('collections', {
    OrderedDict: B_dict(),
    deque: new NativeFn('deque', (a) => (a.length ? toList(a[0]) : [])),
  });
  m.ucollections = m.collections;
  void formatSpec; void hkey; void PySlice;
  return m;
}

function B_dict() {
  return new NativeFn('OrderedDict', (a, kw) => {
    const d = new PyDict();
    if (a.length) for (const pair of toList(a[0] instanceof PyDict ? a[0].items() : a[0])) d.set(pair[0], pair[1]);
    for (const k of Object.keys(kw || {})) d.set(k, kw[k]);
    return d;
  });
}
