// ArduinoJson (v6/v7 style): JsonDocument / StaticJsonDocument / DynamicJsonDocument, JsonObject, JsonArray,
// JsonVariant, deserializeJson(), serializeJson(), serializeJsonPretty(), measureJson().
//
//   StaticJsonDocument<256> doc;
//   DeserializationError err = deserializeJson(doc, payload);
//   float t = doc["main"]["temp"];           int n = doc["count"] | 0;
//   doc["led"] = true;                       serializeJson(doc, Serial);
//   for (JsonObject item : doc["list"].as<JsonArray>()) { ... }
//
// A "reference" (JsonRef) is a path into the document; reading follows the path, writing creates the objects
// and arrays on the way — exactly like operator[] of the real library.
import { addLibrary, defineClass } from './registry.js';
import { cstr, Ptr, AStr } from '../lang/values.js';
import { NetStream, wait } from './iot.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const keyOf = (k) => (typeof k === 'number' ? k : cstr(k));

class Doc { constructor() { this.root = undefined; } }

const numStr = (v) => (Number.isInteger(v) ? String(v) : String(+v.toPrecision(9)));

/** JSON text of a value (compact or pretty, like ArduinoJson: two-space indent, `"key": value`). */
export function toJson(v, pretty = false, ind = '') {
  if (v === undefined || v === null) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? numStr(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  const nl = pretty ? '\n' + ind + '  ' : '', end = pretty ? '\n' + ind : '';
  if (Array.isArray(v)) return v.length ? '[' + nl + v.map((x) => toJson(x, pretty, ind + '  ')).join(',' + nl) + end + ']' : '[]';
  const ks = Object.keys(v);
  return ks.length ? '{' + nl + ks.map((k) => JSON.stringify(k) + (pretty ? ': ' : ':') + toJson(v[k], pretty, ind + '  ')).join(',' + nl) + end + '}' : '{}';
}

/** Values stored in a document are plain JS: objects (JSON objects), arrays, numbers, booleans, strings, null. */
class JsonRef {
  constructor(doc, path) { this.doc = doc; this.path = path; }
  get val() { let v = this.doc.root; for (const k of this.path) { if (v === undefined || v === null || typeof v !== 'object') return undefined; v = v[k]; } return v; }
  /** Writes v at the path, creating containers on the way (a number key makes an array, a string key an object). */
  put(v) {
    if (!this.path.length) { this.doc.root = v; return; }
    let parent = this.doc;
    let holder = 'root';
    let cur = this.doc.root;
    for (let i = 0; i < this.path.length; i++) {
      const k = this.path[i];
      const want = typeof k === 'number' ? 'array' : 'object';
      const ok = want === 'array' ? Array.isArray(cur) : isObj(cur);
      if (!ok) { cur = want === 'array' ? [] : {}; parent[holder] = cur; }
      if (i === this.path.length - 1) { cur[k] = v; return; }
      parent = cur; holder = k;
      cur = cur[k];
    }
  }
  child(k) { return new JsonRef(this.doc, [...this.path, keyOf(k)]); }

  // ---- operator[]
  at(k) { return this.child(k); }
  setAt(k, v) { this.child(k).set(v); }
  set(v) { this.put(plain(v)); return this; }
  assign(v) { return this.set(v); }

  // ---- reading
  jsonValue() { const v = this.val; return v === undefined ? null : v; }
  jsonOr(def) {
    const v = this.val;
    if (typeof def === 'number') return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : def;
    if (typeof def === 'string' || def instanceof Ptr || Array.isArray(def) || def instanceof AStr) return typeof v === 'string' ? v : def;
    return v === undefined || v === null ? def : this;
  }
  valueOf() { const v = this.val; return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : 0; }
  toString() { const v = this.val; return v === undefined || v === null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? numStr(v) : typeof v === 'boolean' ? String(v) : toJson(v); }
  printTo() { return this.toString(); }
  c_str() { return this.toString(); }
  isNull() { const v = this.val; return v === undefined || v === null ? 1 : 0; }
  isUnbound() { return this.val === undefined ? 1 : 0; }
  size() { const v = this.val; return Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 0; }
  containsKey(k) { const v = this.val; return isObj(v) && Object.prototype.hasOwnProperty.call(v, cstr(k)) ? 1 : 0; }
  nesting() { return 1; }
  memoryUsage() { return 8 + toJson(this.val).length; }
  overflowed() { return 0; }
  capacity() { return 1024; }
  shrinkToFit() {}

  // ---- as<T>() / is<T>() / to<T>()
  as_int() { return this.valueOf() | 0; }
  as_long() { return this.valueOf() | 0; }
  as_short() { return (this.valueOf() << 16) >> 16; }
  as_char() { return (this.valueOf() << 24) >> 24; }
  as_unsignedint() { return this.valueOf() >>> 0; }
  as_unsignedlong() { return this.valueOf() >>> 0; }
  as_unsignedshort() { return this.valueOf() & 0xffff; }
  as_unsignedchar() { return this.valueOf() & 255; }
  as_float() { return this.valueOf(); }
  as_double() { return this.valueOf(); }
  as_bool() { const v = this.val; return v === true || (typeof v === 'number' && v !== 0) || (typeof v === 'string' && v.length > 0) ? 1 : 0; }
  as_String() { return new AStr(this.toString()); }
  as_constcharPtr() { const v = this.val; return typeof v === 'string' ? v : null; }
  as_JsonObject() { return isObj(this.val) ? this : new JsonRef(new Doc(), []); }
  as_JsonArray() { return Array.isArray(this.val) ? this : new JsonRef(new Doc(), []); }
  as_JsonVariant() { return this; }
  is_int() { const v = this.val; return typeof v === 'number' && Number.isInteger(v) ? 1 : 0; }
  is_long() { return this.is_int(); }
  is_unsignedint() { const v = this.val; return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? 1 : 0; }
  is_unsignedlong() { return this.is_unsignedint(); }
  is_float() { return typeof this.val === 'number' ? 1 : 0; }
  is_double() { return this.is_float(); }
  is_bool() { return typeof this.val === 'boolean' ? 1 : 0; }
  is_String() { return typeof this.val === 'string' ? 1 : 0; }
  is_constcharPtr() { return this.is_String(); }
  is_JsonObject() { return isObj(this.val) ? 1 : 0; }
  is_JsonArray() { return Array.isArray(this.val) ? 1 : 0; }
  is_JsonVariant() { return this.val === undefined ? 0 : 1; }
  to_JsonObject() { this.put({}); return this; }
  to_JsonArray() { this.put([]); return this; }
  to_JsonVariant() { this.put(null); return this; }

  // ---- arrays / objects
  add(v) {
    if (v === undefined) { // add() without a value → a new element reference (v7)
      const a = this.ensureArray(); a.push(null); return this.child(a.length - 1);
    }
    this.ensureArray().push(plain(v));
    return 1;
  }
  ensureArray() { let a = this.val; if (!Array.isArray(a)) { a = []; this.put(a); } return a; }
  ensureObject() { let o = this.val; if (!isObj(o)) { o = {}; this.put(o); } return o; }
  createNestedObject(k) {
    if (k === undefined) { const a = this.ensureArray(); a.push({}); return this.child(a.length - 1); }
    const r = this.child(k); r.put({}); return r;
  }
  createNestedArray(k) {
    if (k === undefined) { const a = this.ensureArray(); a.push([]); return this.child(a.length - 1); }
    const r = this.child(k); r.put([]); return r;
  }
  remove(k) {
    const v = this.val;
    if (Array.isArray(v) && typeof k === 'number') v.splice(k, 1);
    else if (isObj(v)) delete v[cstr(k)];
  }
  clear() { if (!this.path.length) this.doc.root = undefined; else this.put(undefined); }
  iterate() {
    const v = this.val;
    if (Array.isArray(v)) return v.map((_, i) => this.child(i));
    if (isObj(v)) return Object.keys(v).map((k) => new JsonPair(this, k));
    return [];
  }
}

const plain = (v) => {
  if (v instanceof JsonRef) { const x = v.val; return x === undefined ? null : JSON.parse(JSON.stringify(x === undefined ? null : x)); }
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (v === null || v === undefined) return null;
  return cstr(v);
};

class JsonPair {
  constructor(parent, k) { this.parent = parent; this.k = k; }
  key() { return new JsonKey(this.k); }
  value() { return this.parent.child(this.k); }
}
class JsonKey { constructor(k) { this.k = k; } c_str() { return this.k; } toString() { return this.k; } printTo() { return this.k; } }

// ---- errors
const ERR = ['Ok', 'EmptyInput', 'IncompleteInput', 'InvalidInput', 'NoMemory', 'NotSupported', 'TooDeep'];
class DeserializationError {
  constructor(code) { this.n = code; }
  c_str() { return ERR[this.n]; }
  f_str() { return ERR[this.n]; }
  code() { return this.n; }
  valueOf() { return this.n; }
  truthy() { return this.n !== 0; }
  toString() { return ERR[this.n]; }
  printTo() { return ERR[this.n]; }
}

/** Parses JSON text; returns [errorCode, value]. */
function parse(text) {
  const s = String(text);
  if (!s.trim()) return [1, undefined];
  try { return [0, JSON.parse(s)]; } catch (e) {
    // text that stops in the middle is "IncompleteInput", anything else "InvalidInput"
    const t = s.trim();
    const open = (t.match(/[{[]/g) || []).length, close = (t.match(/[}\]]/g) || []).length;
    return [open > close && !/[}\]]\s*$/.test(t) ? 2 : 3, undefined];
  }
}

function* readAll(rt, stream) {
  let out = '';
  yield* rt.waitFor(() => stream.available() > 0, rt.t + (stream.timeout || 1000) * 1000);
  for (let idle = 0; idle < 3;) {
    let n = 0;
    while (stream.available() > 0) { out += String.fromCharCode(stream.read()); n++; }
    if (n) idle = 0; else { idle++; yield* wait(rt, 3000); }
  }
  return out;
}

export function jsonOf(v) { return v instanceof JsonRef ? v.val : v; }

/** Writes text to a Print object (Serial, a client), a String or a char buffer. */
function emit(out, size, s) {
  if (out instanceof AStr) { out.s += s; return s.length; }
  if (out && typeof out._write === 'function') return out._write(s);
  if (out instanceof Ptr || Array.isArray(out)) {
    const a = out instanceof Ptr ? out.a : out, o = out instanceof Ptr ? out.i : 0;
    const cap = typeof size === 'number' ? size : a.length - o;
    const n = Math.max(0, Math.min(s.length, cap - 1));
    for (let i = 0; i < n; i++) a[o + i] = s.charCodeAt(i) & 255;
    a[o + n] = 0;
    return n;
  }
  return 0;
}

addLibrary((natives, rt, hw) => {
  const refMethods = {
    at: { ret: 'any' }, size: { ret: 'uint' }, isNull: { ret: 'bool' }, isUnbound: { ret: 'bool' }, containsKey: { ret: 'bool', args: ['raw'] }, nesting: { ret: 'uint' }, memoryUsage: { ret: 'uint' },
    overflowed: { ret: 'bool' }, capacity: { ret: 'uint' }, shrinkToFit: { ret: 'void' }, c_str: { ret: 'cstr' },
    as_int: { ret: 'int' }, as_long: { ret: 'long' }, as_short: { ret: 'i16' }, as_char: { ret: 'char' }, as_unsignedint: { ret: 'uint' }, as_unsignedlong: { ret: 'ulong' }, as_unsignedshort: { ret: 'u16' },
    as_unsignedchar: { ret: 'u8' }, as_float: { ret: 'float' }, as_double: { ret: 'float' }, as_bool: { ret: 'bool' }, as_String: { ret: 'String' }, as_constcharPtr: { ret: 'cstr' },
    as_JsonObject: { ret: 'JsonObject' }, as_JsonArray: { ret: 'JsonArray' }, as_JsonVariant: { ret: 'JsonVariant' },
    is_int: { ret: 'bool' }, is_long: { ret: 'bool' }, is_unsignedint: { ret: 'bool' }, is_unsignedlong: { ret: 'bool' }, is_float: { ret: 'bool' }, is_double: { ret: 'bool' }, is_bool: { ret: 'bool' },
    is_String: { ret: 'bool' }, is_constcharPtr: { ret: 'bool' }, is_JsonObject: { ret: 'bool' }, is_JsonArray: { ret: 'bool' }, is_JsonVariant: { ret: 'bool' },
    to_JsonObject: { ret: 'JsonObject' }, to_JsonArray: { ret: 'JsonArray' }, to_JsonVariant: { ret: 'JsonVariant' },
    add: { ret: 'any', args: ['any'] }, createNestedObject: { ret: 'JsonObject', args: ['raw'] }, createNestedArray: { ret: 'JsonArray', args: ['raw'] }, remove: { ret: 'void', args: ['raw'] },
    clear: { ret: 'void' }, set: { ret: 'bool', args: ['any'] },
  };
  const fromArg = (r, a) => (a && a[0] instanceof JsonRef ? a[0] : new JsonRef(new Doc(), []));
  for (const n of ['JsonVariant', 'JsonObject', 'JsonArray', 'JsonVariantConst', 'JsonObjectConst', 'JsonArrayConst']) {
    defineClass(natives, n, { create: fromArg, ctorArgs: ['raw'], methods: refMethods });
  }
  const docCls = { create: () => new JsonRef(new Doc(), []), ctorArgs: ['raw'], methods: refMethods };
  for (const n of ['StaticJsonDocument', 'DynamicJsonDocument', 'JsonDocument', 'BasicJsonDocument']) defineClass(natives, n, docCls);
  defineClass(natives, 'JsonPair', { create: () => new JsonPair(new JsonRef(new Doc(), []), ''), methods: { key: { ret: 'any' }, value: { ret: 'any' } } });
  defineClass(natives, 'DeserializationError', {
    create: () => new DeserializationError(0),
    methods: { c_str: { ret: 'cstr' }, f_str: { ret: 'cstr' }, code: { ret: 'int' } },
    constants: { Ok: 0, EmptyInput: 1, IncompleteInput: 2, InvalidInput: 3, NoMemory: 4, NotSupported: 5, TooDeep: 6 },
  });
  const done = (code) => new DeserializationError(code);
  natives.functions.deserializeJson = {
    ret: 'DeserializationError', gen: true, args: ['raw', 'raw', 'raw'],
    fn: function* (doc, input) {
      const text = input instanceof NetStream ? yield* readAll(rt, input) : cstr(input);
      const [code, val] = parse(text);
      if (code === 0 && doc instanceof JsonRef) doc.put(val);
      else if (doc instanceof JsonRef && code !== 0) doc.put(undefined);
      return done(code);
    },
  };
  natives.functions.serializeJson = { ret: 'uint', args: ['raw', 'raw', 'raw'], fn: (doc, out, size) => emit(out, size, toJson(jsonOf(doc))) };
  natives.functions.serializeJsonPretty = { ret: 'uint', args: ['raw', 'raw', 'raw'], fn: (doc, out, size) => emit(out, size, toJson(jsonOf(doc), true)) };
  natives.functions.measureJson = { ret: 'uint', args: ['raw'], fn: (doc) => toJson(jsonOf(doc)).length };
  natives.functions.measureJsonPretty = { ret: 'uint', args: ['raw'], fn: (doc) => toJson(jsonOf(doc), true).length };
  natives.constants.ARDUINOJSON_VERSION = '6.21.5';
});
