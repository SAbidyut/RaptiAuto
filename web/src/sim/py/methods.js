// Methods of the built-in types (str, list, tuple, dict, set, bytes).
import {
  hooks, Fl, PyDict, PySet, PyBytes, PyRange, isNum, isTuple, toNum, toInt, pyErr, pyEq, pyCompare, pyStr, pyRepr, truthy, iterate, toList, formatSpec, contains, tuple, typeName, mkf,
} from './values.js';

const kwGet = (kw, name, dflt) => (kw && name in kw ? kw[name] : dflt);
const callSync = (...a) => hooks.callSync(...a);

function checkStr(v, what) {
  if (typeof v !== 'string') throw pyErr('TypeError', `${what} requires a str argument, not ${typeName(v)}`);
  return v;
}

/** str.format */
export function strFormat(fmt, args, kw) {
  let auto = 0;
  return fmt.replace(/\{\{|\}\}|\{([^{}!:]*)(?:!([rsa]))?(?::([^{}]*(?:\{[^{}]*\}[^{}]*)*))?\}/g, (all, field, conv, spec) => {
    if (all === '{{') return '{';
    if (all === '}}') return '}';
    let m = /^([^.[]*)(.*)$/.exec(field);
    let base = m[1], rest = m[2];
    let v;
    if (base === '') {
      if (auto >= args.length) throw pyErr('IndexError', 'tuple index out of range');
      v = args[auto++];
    } else if (/^\d+$/.test(base)) {
      if (+base >= args.length) throw pyErr('IndexError', 'tuple index out of range');
      v = args[+base];
    } else {
      if (!kw || !(base in kw)) throw pyErr('KeyError', base);
      v = kw[base];
    }
    while (rest) {
      const a = /^\.(\w+)/.exec(rest), b = /^\[([^\]]*)\]/.exec(rest);
      if (a) { v = hooks.getAttr(v, a[1]); rest = rest.slice(a[0].length); } else if (b) { v = hooks.getItem(v, /^-?\d+$/.test(b[1]) ? +b[1] : b[1]); rest = rest.slice(b[0].length); } else break;
    }
    if (conv === 'r') v = pyRepr(v); else if (conv === 's') v = pyStr(v);
    if (spec && spec.includes('{')) spec = strFormat(spec, args, kw);
    return spec ? formatSpec(v, spec) : pyStr(v);
  });
}

function splitWs(s, max) {
  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && /\s/.test(s[i])) i++;
    if (i >= n) break;
    if (max >= 0 && out.length >= max) { out.push(s.slice(i).replace(/\s+$/, '')); return out; }
    let j = i;
    while (j < n && !/\s/.test(s[j])) j++;
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

const idx = (s, sub, start, end, last = false) => {
  const hay = end === undefined || end === null ? s.slice(start || 0) : s.slice(start || 0, end);
  const r = last ? hay.lastIndexOf(sub) : hay.indexOf(sub);
  return r < 0 ? -1 : r + (start || 0);
};

const STR = {
  format: (s, a, kw) => strFormat(s, a, kw),
  join: (s, [it]) => toList(it).map((x) => checkStr(x, 'join')).join(s),
  split: (s, a, kw) => {
    const sep = a[0] ?? kwGet(kw, 'sep', null);
    const max = a[1] ?? kwGet(kw, 'maxsplit', -1);
    if (sep === null) return splitWs(s, max);
    if (sep === '') throw pyErr('ValueError', 'empty separator');
    const parts = s.split(sep);
    if (max >= 0 && parts.length > max + 1) return [...parts.slice(0, max), parts.slice(max).join(sep)];
    return parts;
  },
  rsplit: (s, a, kw) => {
    const sep = a[0] ?? kwGet(kw, 'sep', null);
    const max = a[1] ?? kwGet(kw, 'maxsplit', -1);
    if (sep === null) return splitWs(s, -1);
    const parts = s.split(sep);
    if (max >= 0 && parts.length > max + 1) return [parts.slice(0, parts.length - max).join(sep), ...parts.slice(parts.length - max)];
    return parts;
  },
  splitlines: (s) => (s === '' ? [] : s.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')),
  strip: (s, [c]) => (c ? s.replace(new RegExp(`^[${escRe(c)}]+|[${escRe(c)}]+$`, 'g'), '') : s.trim()),
  lstrip: (s, [c]) => (c ? s.replace(new RegExp(`^[${escRe(c)}]+`), '') : s.trimStart()),
  rstrip: (s, [c]) => (c ? s.replace(new RegExp(`[${escRe(c)}]+$`), '') : s.trimEnd()),
  upper: (s) => s.toUpperCase(),
  lower: (s) => s.toLowerCase(),
  capitalize: (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
  title: (s) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase()),
  swapcase: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
  replace: (s, [a, b, n]) => {
    checkStr(a, 'replace'); checkStr(b, 'replace');
    if (n === undefined || n < 0) return s.split(a).join(b);
    let out = s;
    let pos = 0, cnt = 0;
    while (cnt < n) { const i = out.indexOf(a, pos); if (i < 0) break; out = out.slice(0, i) + b + out.slice(i + a.length); pos = i + b.length; cnt++; if (!a.length) pos++; }
    return out;
  },
  startswith: (s, [p, st]) => (Array.isArray(p) ? p.some((x) => s.startsWith(x, st || 0)) : s.startsWith(checkStr(p, 'startswith'), st || 0)),
  endswith: (s, [p]) => (Array.isArray(p) ? p.some((x) => s.endsWith(x)) : s.endsWith(checkStr(p, 'endswith'))),
  find: (s, [sub, a, b]) => idx(s, checkStr(sub, 'find'), a, b),
  rfind: (s, [sub, a, b]) => idx(s, checkStr(sub, 'rfind'), a, b, true),
  index: (s, [sub, a, b]) => { const r = idx(s, checkStr(sub, 'index'), a, b); if (r < 0) throw pyErr('ValueError', 'substring not found'); return r; },
  rindex: (s, [sub, a, b]) => { const r = idx(s, checkStr(sub, 'rindex'), a, b, true); if (r < 0) throw pyErr('ValueError', 'substring not found'); return r; },
  count: (s, [sub]) => (sub === '' ? s.length + 1 : s.split(sub).length - 1),
  isdigit: (s) => /^[0-9]+$/.test(s),
  isalpha: (s) => /^[A-Za-z]+$/.test(s),
  isalnum: (s) => /^[A-Za-z0-9]+$/.test(s),
  isspace: (s) => /^\s+$/.test(s),
  isupper: (s) => s !== s.toLowerCase() && s === s.toUpperCase(),
  islower: (s) => s !== s.toUpperCase() && s === s.toLowerCase(),
  isdecimal: (s) => /^[0-9]+$/.test(s),
  center: (s, [w, f = ' ']) => { const n = w - s.length; if (n <= 0) return s; const l = Math.floor(n / 2) + (n % 2 && w % 2 ? 1 : 0); return f.repeat(l) + s + f.repeat(n - l); },
  ljust: (s, [w, f = ' ']) => s + f.repeat(Math.max(0, w - s.length)),
  rjust: (s, [w, f = ' ']) => f.repeat(Math.max(0, w - s.length)) + s,
  zfill: (s, [w]) => { const neg = /^[+-]/.test(s) ? s[0] : ''; const body = neg ? s.slice(1) : s; return neg + body.padStart(Math.max(0, w - neg.length), '0'); },
  partition: (s, [sep]) => { const i = s.indexOf(sep); return tuple(i < 0 ? [s, '', ''] : [s.slice(0, i), sep, s.slice(i + sep.length)]); },
  rpartition: (s, [sep]) => { const i = s.lastIndexOf(sep); return tuple(i < 0 ? ['', '', s] : [s.slice(0, i), sep, s.slice(i + sep.length)]); },
  encode: (s) => new PyBytes([...new TextEncoder().encode(s)]),
};
function escRe(c) { return c.replace(/[\\\]^-]/g, '\\$&'); }

function listIndex(l, i) {
  const n = toInt(i, 'list indices');
  const k = n < 0 ? n + l.length : n;
  if (k < 0 || k >= l.length) throw pyErr('IndexError', 'list index out of range');
  return k;
}

function sortList(l, a, kw) {
  const key = kwGet(kw, 'key', null);
  const rev = truthy(kwGet(kw, 'reverse', false));
  const keyed = l.map((v) => [key ? callSync(key, [v]) : v, v]);
  keyed.sort((x, y) => pyCompare(x[0], y[0]));
  if (rev) keyed.reverse();
  return keyed.map((e) => e[1]);
}

const LIST = {
  append: (l, [v]) => { l.push(v); return null; },
  extend: (l, [it]) => { for (const x of toList(it)) l.push(x); return null; },
  insert: (l, [i, v]) => { let k = toInt(i); if (k < 0) k = Math.max(0, k + l.length); l.splice(Math.min(k, l.length), 0, v); return null; },
  pop: (l, [i]) => { if (!l.length) throw pyErr('IndexError', 'pop from empty list'); return i === undefined ? l.pop() : l.splice(listIndex(l, i), 1)[0]; },
  remove: (l, [v]) => { const i = l.findIndex((x) => pyEq(x, v)); if (i < 0) throw pyErr('ValueError', 'list.remove(x): x not in list'); l.splice(i, 1); return null; },
  index: (l, [v]) => { const i = l.findIndex((x) => pyEq(x, v)); if (i < 0) throw pyErr('ValueError', 'object not in sequence'); return i; },
  count: (l, [v]) => l.filter((x) => pyEq(x, v)).length,
  sort: (l, a, kw) => { const s = sortList(l, a, kw); for (let i = 0; i < s.length; i++) l[i] = s[i]; return null; },
  reverse: (l) => { l.reverse(); return null; },
  clear: (l) => { l.length = 0; return null; },
  copy: (l) => l.slice(),
};
const TUPLE = {
  index: (l, [v]) => { const i = l.findIndex((x) => pyEq(x, v)); if (i < 0) throw pyErr('ValueError', 'object not in sequence'); return i; },
  count: (l, [v]) => l.filter((x) => pyEq(x, v)).length,
};

const DICT = {
  get: (d, [k, dflt = null]) => { const v = d.get(k); return v === undefined ? dflt : v; },
  keys: (d) => d.keys(),
  values: (d) => d.values(),
  items: (d) => d.items().map(([k, v]) => tuple([k, v])),
  pop: (d, [k, dflt]) => {
    const v = d.get(k);
    if (v === undefined) { if (dflt === undefined) throw pyErr('KeyError', k); return dflt; }
    d.delete(k);
    return v;
  },
  popitem: (d) => { const it = d.items(); if (!it.length) throw pyErr('KeyError', 'popitem(): dictionary is empty'); const [k, v] = it[it.length - 1]; d.delete(k); return tuple([k, v]); },
  update: (d, [o], kw) => {
    if (o instanceof PyDict) o.items().forEach(([k, v]) => d.set(k, v));
    else if (o !== undefined) for (const pair of toList(o)) d.set(pair[0], pair[1]);
    if (kw) for (const k of Object.keys(kw)) d.set(k, kw[k]);
    return null;
  },
  setdefault: (d, [k, dflt = null]) => { const v = d.get(k); if (v !== undefined) return v; d.set(k, dflt); return dflt; },
  clear: (d) => { d.m.clear(); return null; },
  copy: (d) => { const r = new PyDict(); d.items().forEach(([k, v]) => r.set(k, v)); return r; },
};

const setOf = (it) => { const s = new PySet(); for (const x of toList(it)) s.add(x); return s; };
const SET = {
  add: (s, [v]) => { s.add(v); return null; },
  remove: (s, [v]) => { if (!s.delete(v)) throw pyErr('KeyError', v); return null; },
  discard: (s, [v]) => { s.delete(v); return null; },
  pop: (s) => { const it = s.items(); if (!it.length) throw pyErr('KeyError', 'pop from an empty set'); s.delete(it[0]); return it[0]; },
  clear: (s) => { s.m.clear(); return null; },
  update: (s, [o]) => { for (const x of toList(o)) s.add(x); return null; },
  union: (s, [o]) => { const r = setOf(s.items()); for (const x of toList(o)) r.add(x); return r; },
  intersection: (s, [o]) => { const t = setOf(o); const r = new PySet(); s.items().forEach((x) => { if (t.has(x)) r.add(x); }); return r; },
  difference: (s, [o]) => { const t = setOf(o); const r = new PySet(); s.items().forEach((x) => { if (!t.has(x)) r.add(x); }); return r; },
  issubset: (s, [o]) => { const t = setOf(o); return s.items().every((x) => t.has(x)); },
  issuperset: (s, [o]) => toList(o).every((x) => s.has(x)),
  copy: (s) => setOf(s.items()),
};

const BYTES = {
  decode: (b) => new TextDecoder().decode(new Uint8Array(b.a)),
};

export function builtinMethod(obj, name) {
  let table = null;
  if (typeof obj === 'string') table = STR;
  else if (Array.isArray(obj)) table = obj.isTuple ? TUPLE : LIST;
  else if (obj instanceof PyDict) table = DICT;
  else if (obj instanceof PySet) table = SET;
  else if (obj instanceof PyBytes) table = BYTES;
  else if (obj instanceof PyRange) table = { index: (r, [v]) => { for (let i = 0; i < r.length; i++) if (r.at(i) === v) return i; throw pyErr('ValueError', 'object not in sequence'); }, count: (r, [v]) => (contains(r, v) ? 1 : 0) };
  else if (isNum(obj)) {
    table = {
      bit_length: (x) => Math.abs(toNum(x)).toString(2).replace(/^0$/, '').length,
      to_bytes: (x, [n, order]) => { const a = []; let v = toNum(x); for (let i = 0; i < n; i++) { a.push(v & 255); v = Math.floor(v / 256); } if (order !== 'little') a.reverse(); return new PyBytes(a); },
      is_integer: (x) => Number.isInteger(toNum(x)),
    };
  }
  return table && Object.prototype.hasOwnProperty.call(table, name) ? table[name] : undefined;
}

void mkf; void Fl; void iterate; void isTuple;
