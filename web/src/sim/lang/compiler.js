// Compiles the AST into JS closures. Statements that may block (delay, loops, Serial waits...)
// compile to generator functions so the simulator can suspend the sketch at any point.
import { CompileError } from './lexer.js';
import { preprocess } from './preprocessor.js';
import { parse } from './parser.js';
import {
  makeTypes, ptrTo, arrOf, coercer, wrapper, commonType, promote, sizeOf, typeName,
} from './types.js';
import {
  AStr, Ptr, Ref, RuntimeError, PK_STR, PK_INT, PK_UINT, PK_FLOAT, PK_CHAR,
  cstr, strToArr, cloneValue, countLeaves, fmtFloat, fmtInt,
} from './values.js';
import { STRING_METHODS } from './stringlib.js';

export const BRK = 1, CONT = 2, RET = 3;
const MAX_DEPTH = 400;

const BLOCKING_NAMES = new Set([
  'delay', 'delayMicroseconds', 'pulseIn', 'pulseInLong', 'yield', 'vTaskDelay', 'sleep', 'usleep',
  'parseInt', 'parseFloat', 'readString', 'readStringUntil', 'readBytes', 'readBytesUntil', 'find', 'findUntil',
  'waitForKey', 'step', 'runToPosition', 'runToNewPosition', 'ping', 'ping_cm', 'ping_in', 'ping_median',
  'ping_timer', 'readDistance', 'measureDistanceCm', 'connect', 'waitForConnectResult',
]);

function E(t, fn, gen = false, extra) {
  const e = { t, fn, gen };
  if (extra) Object.assign(e, extra);
  return e;
}
const isConst = (e) => e.cst !== undefined;
function asGen(e) {
  if (e.gen) return e.fn;
  const fn = e.fn;
  return function* (f) { return fn(f); };
}

class StructInfo {
  constructor(name, node) {
    this.name = name;
    this.node = node;
    this.fields = new Map();
    this.fieldList = [];
    this.methods = new Map(); // name -> [FuncInfo]
    this.ctors = [];
    const self = this;
    this.proto = Object.create(null, { __struct: { value: self, enumerable: false } });
    this.type = { k: 'struct', name, cls: this };
  }
}

class FuncInfo {
  constructor(name, node, cls = null) {
    this.name = name;
    this.node = node;
    this.cls = cls;
    this.gen = false;
    this.params = [];
    this.ret = null;
    this.frameSize = 2;
    this.run = null; // compiled body (fn or generator fn)
    this.calls = new Set();
    this.direct = false; // directly blocking
    this.variadic = false;
  }
}

export class Compiler {
  constructor(opts) {
    this.opts = opts;
    this.rt = opts.rt;
    this.T = makeTypes(opts.arch === 'avr' ? 'avr' : 'arm');
    this.natives = opts.natives; // { functions, classes, globals, constants }
    this.G = [];
    this.globals = new Map();
    this.funcs = new Map(); // name -> [FuncInfo]
    this.structs = new Map();
    this.enumConsts = new Map();
    this.warnings = [];
    this.globalInits = [];
    this.staticInits = [];
    this.cyclesPerNode = opts.arch === 'avr' ? 5 : 2;
    this.mhz = opts.mhz || 16;
    this.nodeCount = 0;
  }

  err(msg, node) { return new CompileError(msg, node ? node.line : 0, node ? node.col || 0 : 0); }
  warn(msg, node) { this.warnings.push({ message: msg, line: node ? node.line : 0 }); }

  // ------------------------------------------------------------------ types
  resolveType(spec, extraPtr = 0, node = spec) {
    const T = this.T;
    let t;
    const name = spec.name;
    if (T[name] && name !== 'avr' && name !== 'INT_BITS') t = T[name];
    else if (this.structs.has(name)) t = this.structs.get(name).type;
    else if (this.natives.classes[name]) t = { k: 'obj', name, cls: this.natives.classes[name] };
    else if (name === 'funcptr') t = T.func;
    else throw this.err(`'${name}' does not name a type`, node);
    const ptr = (spec.ptr || 0) + extraPtr;
    for (let i = 0; i < ptr; i++) t = ptrTo(t);
    if (spec.dims && spec.dims.length) {
      // typedef'd array type
      for (let i = spec.dims.length - 1; i >= 0; i--) t = arrOf(t, null);
    }
    return t;
  }

  defaultValue(t) {
    switch (t.k) {
      case 'int': case 'float': case 'any': return 0;
      case 'String': return new AStr('');
      case 'struct': return this.newStruct(t.cls);
      case 'ptr': return null;
      case 'func': return null;
      default: return 0;
    }
  }

  newStruct(cls) {
    const o = Object.create(cls.proto);
    for (const fd of cls.fieldList) {
      o[fd.name] = fd.make ? fd.make() : this.defaultValue(fd.type);
    }
    return o;
  }

  // ------------------------------------------------------------------ entry
  compileProgram(ast) {
    // pass 1: types, enums, function signatures
    for (const d of ast.body) {
      if (d.kind === 'Struct') this.declareStruct(d);
      else if (d.kind === 'Enum') this.declareEnum(d);
    }
    for (const d of ast.body) {
      if (d.kind === 'Struct') this.defineStruct(d);
    }
    for (const d of ast.body) {
      if (d.kind === 'Func') this.declareFunc(d);
    }
    for (const s of this.structs.values()) {
      for (const m of s.node.methods) this.declareMethod(s, m);
      for (const c of s.node.ctors) this.declareMethod(s, c, true);
    }
    // pass 2: blocking analysis
    this.analyzeBlocking();
    // pass 3: globals in order
    const ctx = this.newCtx(null);
    for (const d of ast.body) {
      if (d.kind === 'Var') this.compileGlobalVar(d, ctx);
    }
    // pass 4: struct field initializers and function bodies
    for (const s of this.structs.values()) this.compileStructFieldInits(s);
    for (const list of this.funcs.values()) for (const fi of list) this.compileFunction(fi);
    for (const s of this.structs.values()) {
      for (const list of s.methods.values()) for (const fi of list) this.compileFunction(fi);
      for (const fi of s.ctors) this.compileFunction(fi);
    }
    for (const list of this.funcs.values()) {
      for (const fi of list) {
        if (!fi.run && fi.node.body === null && (fi.name === 'setup' || fi.name === 'loop' || fi.usedAt)) {
          throw this.err(`undefined reference to '${fi.name}'`, fi.usedAt || fi.node);
        }
      }
    }
    const setup = this.funcs.get('setup');
    const loop = this.funcs.get('loop');
    if (!setup || !setup.some((f) => f.run)) throw new CompileError("undefined reference to 'setup' — every sketch needs a void setup() function", 1);
    if (!loop || !loop.some((f) => f.run)) throw new CompileError("undefined reference to 'loop' — every sketch needs a void loop() function", 1);
    return {
      setup: setup.find((f) => f.run),
      loop: loop.find((f) => f.run),
      funcs: this.funcs,
      G: this.G,
      inits: this.globalInits,
      warnings: this.warnings,
    };
  }

  declareStruct(d) {
    if (this.structs.has(d.name)) return;
    const s = new StructInfo(d.name, d);
    this.structs.set(d.name, s);
    if (d.nested) for (const n of d.nested) this.declareStruct(n);
    for (const f of d.fields) if (f.kind === 'Enum') this.declareEnum(f);
  }

  defineStruct(d) {
    const s = this.structs.get(d.name);
    if (s.defined) return;
    s.defined = true;
    if (d.nested) for (const n of d.nested) this.defineStruct(n);
    for (const fv of d.fields) {
      if (fv.kind !== 'Var') continue;
      for (const decl of fv.decls) {
        let t = this.resolveType(fv.type, decl.ptr, fv);
        const dims = decl.dims.map((dm) => (dm ? this.constEval(dm) : null));
        for (let i = dims.length - 1; i >= 0; i--) t = arrOf(t, dims[i]);
        const fd = { name: decl.name, type: t, decl, isStatic: fv.type.isStatic };
        if (dims.length) {
          const leaf = this.resolveType(fv.type, decl.ptr, fv);
          fd.make = () => this.makeArray(dims, leaf);
        } else if (t.k === 'struct') {
          fd.make = () => this.newStruct(t.cls);
        } else if (t.k === 'String') {
          fd.make = () => new AStr('');
        } else if (t.k === 'obj') {
          fd.make = () => null;
        }
        s.fields.set(decl.name, fd);
        s.fieldList.push(fd);
      }
    }
  }

  compileStructFieldInits(s) {
    // default member initializers: evaluated (sync only) at construction
    for (const fd of s.fieldList) {
      const decl = fd.decl;
      if (!decl.init && !decl.ctorArgs) continue;
      const ctx = this.newCtx(null);
      if (fd.type.k === 'arr') {
        const leaf = this.leafType(fd.type);
        const dims = this.arrayDims(fd.type);
        const initFn = this.compileArrayInit(decl.init, dims, leaf, ctx);
        fd.make = () => initFn(null);
      } else if (fd.type.k === 'obj') {
        const make = this.compileObjCtor(fd.type, decl.ctorArgs || [], ctx, decl);
        fd.make = () => make(null);
      } else {
        const e = this.convert(this.compileInitValue(decl.init || decl.ctorArgs[0], fd.type, ctx), fd.type, decl);
        if (e.gen) throw this.err('member initializer cannot call blocking functions', decl);
        const fn = e.fn;
        fd.make = () => fn(null);
      }
    }
  }

  declareEnum(d) {
    let v = 0;
    for (const it of d.items) {
      if (it.value) v = this.constEval(it.value);
      this.enumConsts.set(it.name, v);
      if (d.name) this.enumConsts.set(d.name + '::' + it.name, v);
      v++;
    }
  }

  makeFuncInfo(d, cls) {
    const fi = new FuncInfo(d.name, d, cls);
    fi.ret = d.isCtor ? this.T.void : this.resolveType(d.ret, 0, d);
    if (d.ret && d.ret.ref) fi.retRef = true;
    let slot = cls ? 2 : 1;
    for (const p of d.params) {
      if (p.variadic) { fi.variadic = true; continue; }
      let t = this.resolveType(p.type, p.ptr, p);
      if (p.dims && p.dims.length) {
        // T arr[] / T arr[][N] parameters are pointers to the element type
        let inner = t;
        for (let i = p.dims.length - 1; i >= 1; i--) inner = arrOf(inner, p.dims[i] ? this.constEval(p.dims[i]) : null);
        t = ptrTo(inner);
        t.fromArray = true;
      }
      const byRef = !!p.ref && t.k !== 'obj' && t.k !== 'arr';
      fi.params.push({ name: p.name, type: t, isRef: byRef, def: p.def, slot: slot++, line: p.line });
    }
    fi.frameSize = slot;
    return fi;
  }

  declareFunc(d) {
    if (d.cls) {
      const s = this.structs.get(d.cls);
      if (!s) throw this.err(`'${d.cls}' has not been declared`, d);
      this.declareMethod(s, d, d.isCtor);
      return;
    }
    if (d.name === 'main') throw this.err("Arduino sketches use setup() and loop() instead of main()", d);
    const fi = this.makeFuncInfo(d, null);
    const list = this.funcs.get(d.name) || [];
    // merge prototype + definition
    const same = list.find((o) => o.params.length === fi.params.length &&
      o.params.every((p, i) => typeName(p.type) === typeName(fi.params[i].type)));
    if (same) {
      if (d.body) {
        if (same.node.body) throw this.err(`redefinition of '${d.name}'`, d);
        // keep default args from prototype
        fi.params.forEach((p, i) => { if (!p.def && same.params[i].def) p.def = same.params[i].def; });
        Object.assign(same, { node: d, params: fi.params, ret: fi.ret, frameSize: fi.frameSize, retRef: fi.retRef });
      }
      return;
    }
    list.push(fi);
    this.funcs.set(d.name, list);
  }

  declareMethod(s, d, isCtor = false) {
    if (isCtor) {
      const fi = this.makeFuncInfo({ ...d, isCtor: true }, s);
      fi.isCtor = true;
      const ex = s.ctors.find((o) => o.params.length === fi.params.length && !o.node.body);
      if (ex && d.body) { Object.assign(ex, { node: d, params: fi.params, frameSize: fi.frameSize }); return; }
      if (s.ctors.some((o) => o.node === d)) return;
      s.ctors.push(fi);
      return;
    }
    const fi = this.makeFuncInfo(d, s);
    fi.isStaticMethod = !!d.isStatic;
    const list = s.methods.get(d.name) || [];
    const ex = list.find((o) => o.params.length === fi.params.length);
    if (ex) {
      if (d.body && !ex.node.body) Object.assign(ex, { node: d, params: fi.params, ret: fi.ret, frameSize: fi.frameSize });
      return;
    }
    list.push(fi);
    s.methods.set(d.name, list);
  }

  // ------------------------------------------------------------ blocking analysis
  analyzeBlocking() {
    const all = [];
    for (const list of this.funcs.values()) all.push(...list);
    for (const s of this.structs.values()) {
      for (const list of s.methods.values()) all.push(...list);
      all.push(...s.ctors);
    }
    const blockingMethods = new Set(BLOCKING_NAMES);
    for (const cls of Object.values(this.natives.classes)) {
      for (const [m, meta] of Object.entries(cls.methods || {})) if (meta && meta.gen) blockingMethods.add(m);
    }
    for (const [name, meta] of Object.entries(this.natives.functions)) if (meta && meta.gen) blockingMethods.add(name);
    const userNames = new Set(this.funcs.keys());
    for (const s of this.structs.values()) for (const k of s.methods.keys()) userNames.add(k);
    const visit = (n, fi) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) visit(x, fi); return; }
      switch (n.kind) {
        case 'While': case 'DoWhile': case 'For': case 'ForRange':
          fi.direct = true; break;
        case 'Call': {
          const c = n.callee;
          if (c.kind === 'Ident') {
            if (userNames.has(c.name)) fi.calls.add(c.name);
            else if (this.natives.functions[c.name]) { if (this.natives.functions[c.name].gen) fi.direct = true; }
            else fi.direct = true; // calling a variable / unknown -> conservative
          } else if (c.kind === 'Member') {
            if (blockingMethods.has(c.name)) fi.direct = true;
            if (userNames.has(c.name)) fi.calls.add(c.name);
          } else fi.direct = true;
          break;
        }
        case 'Construct':
          fi.calls.add('#ctor:' + n.type.name);
          break;
        case 'Var':
          if (n.type && this.structs.has(n.type.name)) fi.calls.add('#ctor:' + n.type.name);
          break;
        default:
      }
      for (const k in n) {
        if (k === 'line' || k === 'col' || k === 'kind') continue;
        const v = n[k];
        if (v && typeof v === 'object') visit(v, fi);
      }
    };
    for (const fi of all) {
      if (fi.node.body) visit(fi.node.body, fi);
      if (fi.node.inits) visit(fi.node.inits, fi);
      for (const p of fi.params) if (p.def) visit(p.def, fi);
      // declarations of struct/library objects may run constructors
      fi.gen = fi.direct;
    }
    const byName = new Map();
    for (const fi of all) {
      const key = fi.isCtor ? '#ctor:' + fi.cls.name : fi.name;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(fi);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const fi of all) {
        if (fi.gen) continue;
        for (const c of fi.calls) {
          const targets = byName.get(c);
          if (targets && targets.some((t) => t.gen)) { fi.gen = true; changed = true; break; }
        }
      }
    }
  }

  // ------------------------------------------------------------ contexts
  newCtx(fi) {
    return { fi, scopes: [new Map()], next: fi ? fi.frameSize : 1, max: fi ? fi.frameSize : 1, cls: fi ? fi.cls : null, loops: 0, switches: 0 };
  }
  pushScope(ctx) { ctx.scopes.push(new Map()); ctx.scopeStart = ctx.scopeStart || []; ctx.scopeStart.push(ctx.next); }
  popScope(ctx) { ctx.scopes.pop(); ctx.next = ctx.scopeStart.pop(); }
  allocLocal(ctx, name, type, node, isRef = false) {
    const scope = ctx.scopes[ctx.scopes.length - 1];
    if (scope.has(name)) throw this.err(`redeclaration of '${name}'`, node);
    const slot = ctx.next++;
    if (ctx.next > ctx.max) ctx.max = ctx.next;
    const sym = { kind: 'local', slot, type, isRef };
    scope.set(name, sym);
    return sym;
  }
  allocGlobal(name, type, node, isRef = false) {
    const slot = this.G.length;
    this.G.push(this.defaultValue(type));
    const sym = { kind: 'global', slot, type, isRef };
    if (name !== null) {
      if (this.globals.has(name)) throw this.err(`redefinition of '${name}'`, node);
      this.globals.set(name, sym);
    }
    return sym;
  }

  lookup(name, ctx) {
    if (ctx) {
      for (let i = ctx.scopes.length - 1; i >= 0; i--) {
        const s = ctx.scopes[i].get(name);
        if (s) return s;
      }
      if (ctx.cls) {
        const fd = ctx.cls.fields.get(name);
        if (fd) return { kind: 'field', field: fd, type: fd.type };
        if (ctx.cls.methods.has(name)) return { kind: 'method', cls: ctx.cls, name };
      }
    }
    const g = this.globals.get(name);
    if (g) return g;
    if (this.funcs.has(name)) return { kind: 'func', list: this.funcs.get(name) };
    if (this.enumConsts.has(name)) return { kind: 'const', value: this.enumConsts.get(name), type: this.T.int };
    const nat = this.natives;
    if (nat.globals[name]) return { kind: 'nativeObj', ...nat.globals[name] };
    if (nat.constants[name] !== undefined) {
      const c = nat.constants[name];
      if (typeof c === 'object' && c !== null && 'value' in c) return { kind: 'const', value: c.value, type: this.T[c.type] || this.T.int };
      if (typeof c === 'string') return { kind: 'const', value: c, type: this.T.cstr };
      return { kind: 'const', value: c, type: Number.isInteger(c) ? (Math.abs(c) > 32767 && this.T.avr ? this.T.long : this.T.int) : this.T.double };
    }
    if (nat.functions[name]) return { kind: 'native', name, meta: nat.functions[name] };
    if (/^B[01]{1,8}$/.test(name)) return { kind: 'const', value: parseInt(name.slice(1), 2), type: this.T.int };
    if (name.includes('::')) {
      const k = name.lastIndexOf('::');
      const clsName = name.slice(0, k), member = name.slice(k + 2);
      const nc = nat.classes[clsName];
      if (nc && nc.statics && nc.statics[member]) return { kind: 'native', name: member, meta: nc.statics[member] };
      if (nc && nc.constants && nc.constants[member] !== undefined) return { kind: 'const', value: nc.constants[member], type: this.T.int };
      const short = name.split('::').pop();
      if (short !== name) return this.lookup(short, ctx);
    }
    return null;
  }

  // ------------------------------------------------------------ constant evaluation
  constEval(node) {
    const e = this.compileExpr(node, this.newCtx(null));
    if (isConst(e)) return typeof e.cst === 'number' ? Math.trunc(e.cst) : e.cst;
    if (!e.gen) {
      try {
        const v = e.fn(null);
        if (typeof v === 'number') return Math.trunc(v);
      } catch (err) { /* fallthrough */ }
    }
    throw this.err('expression must be a compile-time constant', node);
  }

  // ------------------------------------------------------------ arrays
  makeArray(dims, leaf) {
    const [d, ...rest] = dims;
    const n = d || 0;
    const a = new Array(n);
    for (let i = 0; i < n; i++) a[i] = rest.length ? this.makeArray(rest, leaf) : this.defaultValue(leaf);
    return a;
  }

  leafType(t) { while (t.k === 'arr') t = t.of; return t; }
  arrayDims(t) { const d = []; while (t.k === 'arr') { d.push(t.len); t = t.of; } return d; }

  /** Returns a sync function (f) => new array, built from an InitList / string literal / nothing. */
  compileArrayInit(init, dims, leaf, ctx) {
    // infer missing first dimension from initializer
    if (dims[0] === null || dims[0] === undefined) {
      if (init && init.kind === 'InitList') dims[0] = init.items.length;
      else if (init && init.kind === 'Str') dims[0] = init.v.length + 1;
      else if (!init) throw this.err('array size missing', ctx);
      else dims[0] = 0;
    }
    if (!init) {
      const d = dims.slice();
      return () => this.makeArray(d, leaf);
    }
    if (init.kind === 'Str') {
      if (dims.length !== 1) throw this.err('invalid string initializer for multi-dimensional array', init);
      const n = dims[0], s = init.v;
      if (s.length + 1 > n && s.length > n) throw this.err(`initializer-string for array of chars is too long`, init);
      return () => { const a = new Array(n).fill(0); for (let i = 0; i < s.length && i < n; i++) a[i] = s.charCodeAt(i) & 255; return a; };
    }
    if (init.kind !== 'InitList') {
      const e = this.compileExpr(init, ctx);
      if (e.t.k === 'arr' || e.t.k === 'ptr') {
        const fn = e.fn;
        return (f) => cloneValue(fn(f));
      }
      throw this.err('array must be initialized with a brace-enclosed initializer', init);
    }
    const [n, ...rest] = dims;
    if (init.items.length > n) throw this.err(`too many initializers for array of size ${n}`, init);
    const itemFns = init.items.map((it) => {
      if (rest.length) return this.compileArrayInit(it, rest.slice(), leaf, ctx);
      const e = this.convert(this.compileInitValue(it, leaf, ctx), leaf, it);
      if (e.gen) throw this.err('array initializer cannot call blocking functions', it);
      return e.fn;
    });
    const restDims = rest.slice();
    return (f) => {
      const a = new Array(n);
      for (let i = 0; i < n; i++) {
        a[i] = i < itemFns.length ? itemFns[i](f) : (restDims.length ? this.makeArray(restDims, leaf) : this.defaultValue(leaf));
      }
      return a;
    };
  }

  /** Initializer for scalar/struct targets (handles InitList for structs). */
  compileInitValue(init, t, ctx) {
    if (init && init.kind === 'InitList') {
      if (t.k === 'struct') return this.compileStructInitList(t.cls, init, ctx);
      if (t.k === 'String') return init.items.length ? this.compileExpr(init.items[0], ctx) : E(t, () => new AStr(''));
      if (init.items.length === 0) return E(t, () => this.defaultValue(t), false);
      return this.compileExpr(init.items[0], ctx);
    }
    return this.compileExpr(init, ctx);
  }

  compileStructInitList(cls, list, ctx) {
    const fields = cls.fieldList;
    const setters = [];
    let pos = 0;
    for (const it of list.items) {
      let fd;
      let valNode = it;
      if (it.kind === 'Designated') { fd = cls.fields.get(it.field); valNode = it.value; if (!fd) throw this.err(`'${cls.name}' has no member named '${it.field}'`, it); pos = fields.indexOf(fd) + 1; }
      else { fd = fields[pos++]; if (!fd) throw this.err(`too many initializers for '${cls.name}'`, it); }
      let fn;
      if (fd.type.k === 'arr') {
        fn = this.compileArrayInit(valNode, this.arrayDims(fd.type), this.leafType(fd.type), ctx);
      } else {
        const e = this.convert(this.compileInitValue(valNode, fd.type, ctx), fd.type, valNode);
        if (e.gen) throw this.err('initializer cannot call blocking functions', valNode);
        fn = e.fn;
      }
      setters.push([fd.name, fn]);
    }
    return E(cls.type, (f) => {
      const o = this.newStruct(cls);
      for (let i = 0; i < setters.length; i++) o[setters[i][0]] = setters[i][1](f);
      return o;
    });
  }

  // ------------------------------------------------------------ declarations
  compileGlobalVar(d, ctx) {
    for (const decl of d.decls) {
      const { type, init } = this.compileDeclInit(d, decl, ctx, true);
      const sym = this.allocGlobal(decl.name, type, decl, decl.ref);
      sym.isConst = !!d.type.isConst;
      if (init) {
        if (init.cst !== undefined && sym.isConst && (type.k === 'int' || type.k === 'float')) sym.cst = init.cst;
        const slot = sym.slot, G = this.G;
        if (init.gen) {
          const g = init.fn;
          this.globalInits.push({ gen: true, fn: function* (f) { G[slot] = yield* g(f); }, line: decl.line });
        } else {
          const fn = init.fn;
          this.globalInits.push({ gen: false, fn: (f) => { G[slot] = fn(f); }, line: decl.line });
        }
      }
    }
  }

  /** Returns {type, init: E|null} where init produces the full initial value (already converted). */
  compileDeclInit(d, decl, ctx, isGlobal) {
    let base = d.type.name === 'auto' ? null : this.resolveType(d.type, decl.ptr, decl);
    if (decl.dims.length) {
      const dims = decl.dims.map((dm) => (dm ? this.dimValue(dm, ctx) : null));
      const leaf = base;
      if (dims.some((x) => typeof x === 'function')) {
        // runtime-sized (VLA) array
        const fns = dims.map((x) => (typeof x === 'function' ? x : () => x));
        let t = leaf;
        for (let i = dims.length - 1; i >= 0; i--) t = arrOf(t, null);
        return { type: t, init: E(t, (f) => this.makeArray(fns.map((fn) => fn(f)), leaf)) };
      }
      const initFn = this.compileArrayInit(decl.init, dims, leaf, ctx);
      let t = leaf;
      for (let i = dims.length - 1; i >= 0; i--) t = arrOf(t, dims[i]);
      return { type: t, init: E(t, initFn) };
    }
    if (decl.ref) {
      // reference variable: bind to lvalue
      if (!decl.init) throw this.err(`'${decl.name}' declared as reference but not initialized`, decl);
      const lv = this.compileLValue(decl.init, ctx);
      const t = base || lv.t;
      return { type: t, init: lv.gen ? E(t, lv.loc, true) : E(t, lv.ref) };
    }
    if (base === null) {
      // auto
      if (!decl.init) throw this.err(`declaration of 'auto ${decl.name}' has no initializer`, decl);
      const e = this.compileExpr(decl.init, ctx);
      base = e.t.k === 'arr' ? ptrTo(e.t.of) : (e.t.k === 'int' && e.t.rank < this.T.int.rank ? promote(e.t, this.T) : e.t);
      if (base.k === 'ptr' && e.t.k === 'ptr' && e.t.to === this.T.char) base = this.T.cstr;
      return { type: base, init: this.convert(e, base, decl) };
    }
    const t = base;
    if (t.k === 'obj') {
      const args = decl.ctorArgs || (decl.init ? [decl.init] : []);
      if (decl.init && decl.init.kind === 'Construct' && decl.init.type.name === t.name) {
        return { type: t, init: E(t, this.compileObjCtor(t, decl.init.args, ctx, decl)) };
      }
      if (decl.init && !decl.ctorArgs) {
        const e = this.compileExpr(decl.init, ctx);
        if (e.t.k === 'obj') return { type: t, init: e };
      }
      return { type: t, init: E(t, this.compileObjCtor(t, args, ctx, decl)) };
    }
    if (t.k === 'struct') {
      if (decl.ctorArgs || (decl.init && decl.init.kind === 'Construct' && decl.init.type.name === t.name)) {
        const args = decl.ctorArgs || decl.init.args;
        return { type: t, init: this.compileStructCtor(t.cls, args, ctx, decl) };
      }
      if (decl.init) return { type: t, init: this.convert(this.compileInitValue(decl.init, t, ctx), t, decl) };
      if (t.cls.ctors.length) return { type: t, init: this.compileStructCtor(t.cls, [], ctx, decl) };
      return { type: t, init: E(t, () => this.newStruct(t.cls)) };
    }
    let initNode = decl.init;
    if (!initNode && decl.ctorArgs) initNode = decl.ctorArgs.length === 1 ? decl.ctorArgs[0] : { kind: 'Construct', type: d.type, args: decl.ctorArgs, line: decl.line };
    if (!initNode) {
      if (t.k === 'String') return { type: t, init: E(t, () => new AStr('')) };
      return { type: t, init: isGlobal ? null : E(t, () => this.defaultValue(t), false, { cst: this.defaultValue(t) }) };
    }
    const e = this.compileInitValue(initNode, t, ctx);
    if (t.k === 'ptr' && e.t.k === 'arr' && initNode.kind === 'Str') {
      return { type: t, init: E(t, () => initNode.v, false, { cst: initNode.v }) };
    }
    return { type: t, init: this.convert(e, t, decl) };
  }

  dimValue(node, ctx) {
    try { return this.constEval(node); } catch (e) {
      const ex = this.compileExpr(node, ctx);
      if (ex.gen) throw this.err('array size cannot call blocking functions', node);
      const fn = ex.fn;
      return (f) => Math.max(0, Math.trunc(fn(f)));
    }
  }

  compileObjCtor(t, argNodes, ctx, node) {
    const cls = t.cls;
    const args = argNodes.map((a) => this.compileNativeArg(this.compileExpr(a, ctx), cls.ctorArgs ? cls.ctorArgs[argNodes.indexOf(a)] : undefined, a));
    if (args.some((a) => a.gen)) throw this.err('constructor arguments cannot call blocking functions', node);
    const fns = args.map((a) => a.fn);
    const rt = this.rt;
    const line = node.line;
    return (f) => {
      try {
        return cls.create(rt, fns.map((fn) => fn(f)));
      } catch (e) {
        if (e instanceof RuntimeError) throw e;
        throw new RuntimeError(String(e.message || e), line);
      }
    };
  }

  compileStructCtor(cls, argNodes, ctx, node) {
    if (!cls.ctors.length) {
      if (argNodes.length === 0) return E(cls.type, () => this.newStruct(cls));
      return this.compileStructInitList(cls, { items: argNodes }, ctx);
    }
    const fi = this.pickOverload(cls.ctors, argNodes, ctx, node, `${cls.name}::${cls.name}`);
    const call = this.compileUserCall(fi, argNodes, ctx, node, (f) => this.newStruct(cls));
    return call;
  }

  // ------------------------------------------------------------ functions
  compileFunction(fi) {
    const d = fi.node;
    if (!d.body || fi.run) return;
    const ctx = this.newCtx(fi);
    for (const p of fi.params) {
      if (!p.name) continue;
      ctx.scopes[0].set(p.name, { kind: 'local', slot: p.slot, type: p.type, isRef: p.isRef });
    }
    ctx.next = fi.frameSize;
    ctx.max = fi.frameSize;
    const stmts = [];
    if (fi.isCtor && d.inits) {
      for (const ini of d.inits) {
        const fd = fi.cls.fields.get(ini.name);
        if (!fd) throw this.err(`class '${fi.cls.name}' does not have any field named '${ini.name}'`, ini);
        let e;
        if (fd.type.k === 'struct') e = this.compileStructCtor(fd.type.cls, ini.args, ctx, ini);
        else if (fd.type.k === 'obj') e = E(fd.type, this.compileObjCtor(fd.type, ini.args, ctx, ini));
        else e = this.convert(this.compileExpr(ini.args[0], ctx), fd.type, ini);
        const name = ini.name;
        if (e.gen) {
          const g = e.fn;
          stmts.push({ gen: true, fn: function* (f) { f[1][name] = yield* g(f); return 0; } });
        } else {
          const fn = e.fn;
          stmts.push({ gen: false, fn: (f) => { f[1][name] = fn(f); return 0; } });
        }
      }
    }
    ctx.fnRet = fi.ret;
    const body = this.compileBlock(d.body, ctx, false);
    stmts.push(body);
    const block = this.seq(stmts);
    fi.frameSize = ctx.max;
    if (fi.gen && !block.gen) {
      const fn = block.fn;
      fi.run = function* (f) { return fn(f); };
    } else if (!fi.gen && block.gen) {
      throw this.err(`internal: '${fi.name}' contains a blocking call that was not detected — please report this sketch`, d);
    } else {
      fi.run = block.fn;
    }
    if (fi.ret !== this.T.void && !this.alwaysReturns(d.body)) {
      if (fi.name !== 'main') this.warn(`no return statement in function '${fi.name}' returning non-void`, d.body.endLine ? { line: d.body.endLine } : d);
    }
  }

  alwaysReturns(stmt) {
    if (!stmt) return false;
    switch (stmt.kind) {
      case 'Return': return true;
      case 'Block': return stmt.body.some((s) => this.alwaysReturns(s));
      case 'If': return this.alwaysReturns(stmt.then) && this.alwaysReturns(stmt.otherwise);
      case 'While': return stmt.cond.kind === 'Num' && stmt.cond.v !== 0 || (stmt.cond.kind === 'Ident' && stmt.cond.name === 'true');
      case 'For': return !stmt.cond;
      case 'Switch': return stmt.cases.some((c) => c.test === null) && stmt.cases.every((c) => c.body.some((s) => this.alwaysReturns(s)) || c.body.length === 0);
      case 'Expr': return stmt.expr.kind === 'Call' && stmt.expr.callee.kind === 'Ident' && (stmt.expr.callee.name === 'abort' || stmt.expr.callee.name === 'exit');
      default: return false;
    }
  }

  // ------------------------------------------------------------ statements
  stmtCost(nodes) { return (nodes * this.cyclesPerNode + 2) / this.mhz; }

  seq(list) {
    list = list.filter(Boolean);
    const anyGen = list.some((s) => s.gen);
    if (!anyGen) {
      const fns = list.map((s) => s.fn);
      switch (fns.length) {
        case 0: return { gen: false, fn: () => 0 };
        case 1: return { gen: false, fn: fns[0] };
        case 2: { const [a, b] = fns; return { gen: false, fn: (f) => a(f) || b(f) }; }
        case 3: { const [a, b, c] = fns; return { gen: false, fn: (f) => a(f) || b(f) || c(f) }; }
        default: {
          const n = fns.length;
          return {
            gen: false,
            fn: (f) => {
              for (let i = 0; i < n; i++) { const s = fns[i](f); if (s) return s; }
              return 0;
            },
          };
        }
      }
    }
    const n = list.length;
    const fns = list.map((s) => s.fn);
    const gens = list.map((s) => s.gen);
    return {
      gen: true,
      fn: function* (f) {
        for (let i = 0; i < n; i++) {
          const s = gens[i] ? yield* fns[i](f) : fns[i](f);
          if (s) return s;
        }
        return 0;
      },
    };
  }

  compileBlock(node, ctx, newScope = true) {
    if (newScope) this.pushScope(ctx);
    const list = node.body.map((s) => this.compileStmt(s, ctx));
    if (newScope) this.popScope(ctx);
    return this.seq(list);
  }

  compileStmt(node, ctx) {
    const rt = this.rt;
    const line = node.line;
    switch (node.kind) {
      case 'Block': return this.compileBlock(node, ctx);
      case 'Empty': return null;
      case 'Expr': {
        const before = this.nodeCount;
        const e = this.compileExpr(node.expr, ctx, true);
        const cost = this.stmtCost(this.nodeCount - before);
        if (e.gen) {
          const g = e.fn;
          return { gen: true, fn: function* (f) { rt.line = line; rt.t += cost; yield* g(f); return 0; } };
        }
        const fn = e.fn;
        return { gen: false, fn: (f) => { rt.line = line; rt.t += cost; fn(f); return 0; } };
      }
      case 'Var': return this.compileLocalVar(node, ctx);
      case 'Struct': case 'Enum': case 'Typedef': {
        if (node.kind === 'Struct') { this.declareStruct(node); this.defineStruct(node); }
        if (node.kind === 'Enum') this.declareEnum(node);
        return null;
      }
      case 'If': return this.compileIf(node, ctx);
      case 'While': return this.compileWhile(node, ctx);
      case 'DoWhile': return this.compileDoWhile(node, ctx);
      case 'For': return this.compileFor(node, ctx);
      case 'ForRange': return this.compileForRange(node, ctx);
      case 'Switch': return this.compileSwitch(node, ctx);
      case 'Break':
        if (!ctx.loops && !ctx.switches) throw this.err('break statement not within loop or switch', node);
        return { gen: false, fn: () => BRK };
      case 'Continue':
        if (!ctx.loops) throw this.err('continue statement not within a loop', node);
        return { gen: false, fn: () => CONT };
      case 'Return': return this.compileReturn(node, ctx);
      default:
        if (Array.isArray(node)) return this.seq(node.map((n) => this.compileStmt(n, ctx)));
        throw this.err(`unsupported statement ${node.kind}`, node);
    }
  }

  compileLocalVar(node, ctx) {
    const rt = this.rt;
    const out = [];
    for (const decl of node.decls) {
      if (node.type.isStatic) {
        // static local -> hidden global initialised once at program start
        const { type, init } = this.compileDeclInit(node, decl, this.newCtx(null), true);
        const sym = this.allocGlobal(null, type, decl);
        ctx.scopes[ctx.scopes.length - 1].set(decl.name, sym);
        if (init) {
          const slot = sym.slot, G = this.G;
          if (init.gen) throw this.err('static initializer cannot call blocking functions', decl);
          const fn = init.fn;
          this.globalInits.push({ gen: false, fn: (f) => { G[slot] = fn(f); }, line: decl.line });
        }
        continue;
      }
      const before = this.nodeCount;
      const { type, init } = this.compileDeclInit(node, decl, ctx, false);
      const sym = this.allocLocal(ctx, decl.name, type, decl, decl.ref);
      if (node.type.isConst && init && init.cst !== undefined && (type.k === 'int' || type.k === 'float')) sym.cst = init.cst;
      const slot = sym.slot;
      const cost = this.stmtCost(this.nodeCount - before + 1);
      const line = decl.line;
      if (!init) {
        const dv = this.defaultValue(type);
        out.push({ gen: false, fn: (f) => { f[slot] = dv; return 0; } });
      } else if (init.gen) {
        const g = init.fn;
        out.push({ gen: true, fn: function* (f) { rt.line = line; rt.t += cost; f[slot] = yield* g(f); return 0; } });
      } else {
        const fn = init.fn;
        out.push({ gen: false, fn: (f) => { rt.line = line; rt.t += cost; f[slot] = fn(f); return 0; } });
      }
    }
    return this.seq(out);
  }

  cond(node, ctx) {
    const e = this.compileExpr(node, ctx);
    return this.toBool(e, node);
  }

  toBool(e, node) {
    if (e.t.k === 'String' || e.t.k === 'struct') throw this.err(`could not convert '${typeName(e.t)}' to 'bool'`, node);
    if (e.t.k === 'any' && !e.gen) {
      const fn0 = e.fn;
      return E(this.T.bool, (f) => { const v = fn0(f); return (v && typeof v === 'object' && typeof v.truthy === 'function' ? v.truthy() : v) ? 1 : 0; });
    }
    if (e.t.k === 'obj') {
      // `if (Serial)` / `if (!bme.begin())` -> objects are truthy
      const fn = e.fn;
      if (e.gen) return e;
      // an object may decide for itself (WiFiClient: connected(), DeserializationError: failed)
      return E(this.T.bool, (f) => { const v = fn(f); return (v && typeof v.truthy === 'function' ? v.truthy() : v) ? 1 : 0; });
    }
    return e;
  }

  loopYield() {
    const rt = this.rt;
    return rt;
  }

  compileIf(node, ctx) {
    const c = this.cond(node.cond, ctx);
    this.pushScope(ctx);
    const a = this.compileStmt(node.then, ctx) || { gen: false, fn: () => 0 };
    this.popScope(ctx);
    this.pushScope(ctx);
    const b = node.otherwise ? this.compileStmt(node.otherwise, ctx) : null;
    this.popScope(ctx);
    const rt = this.rt, line = node.line;
    const cost = this.stmtCost(3);
    if (isConst(c) && !c.gen) {
      // constant condition: compile only one branch (still keep cost)
      return c.cst ? a : (b || null);
    }
    if (!c.gen && !a.gen && (!b || !b.gen)) {
      const C = c.fn, A = a.fn;
      if (!b) return { gen: false, fn: (f) => { rt.line = line; rt.t += cost; return C(f) ? A(f) : 0; } };
      const B = b.fn;
      return { gen: false, fn: (f) => { rt.line = line; rt.t += cost; return C(f) ? A(f) : B(f); } };
    }
    const C = asGen(c), A = a.fn, ag = a.gen, B = b ? b.fn : null, bg = b ? b.gen : false;
    return {
      gen: true,
      fn: function* (f) {
        rt.line = line; rt.t += cost;
        if (yield* C(f)) return ag ? yield* A(f) : A(f);
        if (B) return bg ? yield* B(f) : B(f);
        return 0;
      },
    };
  }

  compileWhile(node, ctx) {
    const c = this.cond(node.cond, ctx);
    ctx.loops++;
    this.pushScope(ctx);
    const body = this.compileStmt(node.body, ctx) || { gen: false, fn: () => 0 };
    this.popScope(ctx);
    ctx.loops--;
    const rt = this.rt, line = node.line;
    const cost = this.stmtCost(3);
    const C = asGen(c), B = body.fn, bg = body.gen;
    if (!c.gen) {
      const Cs = c.fn;
      return {
        gen: true,
        fn: function* (f) {
          for (;;) {
            rt.line = line;
            rt.t += cost;
            if (!Cs(f)) return 0;
            const s = bg ? yield* B(f) : B(f);
            if (s === BRK) return 0;
            if (s === RET) return RET;
            if (rt.t >= rt.limit || ((++rt.ops & 1023) === 0 && rt.overBudget())) yield 0;
          }
        },
      };
    }
    return {
      gen: true,
      fn: function* (f) {
        for (;;) {
          rt.line = line;
          rt.t += cost;
          if (!(yield* C(f))) return 0;
          const s = bg ? yield* B(f) : B(f);
          if (s === BRK) return 0;
          if (s === RET) return RET;
          if (rt.t >= rt.limit || ((++rt.ops & 1023) === 0 && rt.overBudget())) yield 0;
        }
      },
    };
  }

  compileDoWhile(node, ctx) {
    ctx.loops++;
    this.pushScope(ctx);
    const body = this.compileStmt(node.body, ctx) || { gen: false, fn: () => 0 };
    this.popScope(ctx);
    ctx.loops--;
    const c = this.cond(node.cond, ctx);
    const rt = this.rt, line = node.line;
    const cost = this.stmtCost(3);
    const C = asGen(c), B = body.fn, bg = body.gen;
    return {
      gen: true,
      fn: function* (f) {
        for (;;) {
          const s = bg ? yield* B(f) : B(f);
          if (s === BRK) return 0;
          if (s === RET) return RET;
          rt.line = line;
          rt.t += cost;
          if (!(yield* C(f))) return 0;
          if (rt.t >= rt.limit || ((++rt.ops & 1023) === 0 && rt.overBudget())) yield 0;
        }
      },
    };
  }

  compileFor(node, ctx) {
    this.pushScope(ctx);
    const init = node.init ? (node.init.kind === 'Var' ? this.compileLocalVar(node.init, ctx) : this.compileStmt(node.init, ctx)) : null;
    const c = node.cond ? this.cond(node.cond, ctx) : null;
    const upd = node.update ? this.compileExpr(node.update, ctx, true) : null;
    ctx.loops++;
    this.pushScope(ctx);
    const body = this.compileStmt(node.body, ctx) || { gen: false, fn: () => 0 };
    this.popScope(ctx);
    ctx.loops--;
    this.popScope(ctx);
    const rt = this.rt, line = node.line;
    const cost = this.stmtCost(4);
    const I = init ? init.fn : null, ig = init ? init.gen : false;
    const B = body.fn, bg = body.gen;
    if ((!c || !c.gen) && (!upd || !upd.gen)) {
      const C = c ? c.fn : null, U = upd ? upd.fn : null;
      return {
        gen: true,
        fn: function* (f) {
          if (I) { if (ig) yield* I(f); else I(f); }
          for (;;) {
            rt.line = line;
            rt.t += cost;
            if (C && !C(f)) return 0;
            const s = bg ? yield* B(f) : B(f);
            if (s === BRK) return 0;
            if (s === RET) return RET;
            if (U) U(f);
            if (rt.t >= rt.limit || ((++rt.ops & 1023) === 0 && rt.overBudget())) yield 0;
          }
        },
      };
    }
    const C = c ? asGen(c) : null, U = upd ? asGen(upd) : null;
    return {
      gen: true,
      fn: function* (f) {
        if (I) { if (ig) yield* I(f); else I(f); }
        for (;;) {
          rt.line = line;
          rt.t += cost;
          if (C && !(yield* C(f))) return 0;
          const s = bg ? yield* B(f) : B(f);
          if (s === BRK) return 0;
          if (s === RET) return RET;
          if (U) yield* U(f);
          if (rt.t >= rt.limit || ((++rt.ops & 1023) === 0 && rt.overBudget())) yield 0;
        }
      },
    };
  }

  compileForRange(node, ctx) {
    const range = this.compileExpr(node.range, ctx);
    if (range.gen) throw this.err('range expression cannot call blocking functions', node);
    let elemT;
    if (range.t.k === 'arr') elemT = range.t.of;
    else if (range.t.k === 'String') elemT = this.T.char;
    else if (range.t.k === 'obj' || range.t.k === 'any') elemT = this.T.any;   // a native collection with iterate() (JsonArray …)
    else throw this.err(`'${typeName(range.t)}' cannot be used in a range-based for loop`, node);
    this.pushScope(ctx);
    const vt = node.varType.name === 'auto' ? elemT : this.resolveType(node.varType, node.decl.ptr, node);
    const sym = this.allocLocal(ctx, node.decl.name, vt, node, node.decl.ref);
    ctx.loops++;
    this.pushScope(ctx);
    const body = this.compileStmt(node.body, ctx) || { gen: false, fn: () => 0 };
    this.popScope(ctx);
    ctx.loops--;
    this.popScope(ctx);
    const R = range.fn, B = body.fn, bg = body.gen, slot = sym.slot, isRef = node.decl.ref;
    const conv = isRef ? null : this.convertFn(elemT, vt, node);
    const isStr = range.t.k === 'String';
    const rt = this.rt, line = node.line, cost = this.stmtCost(4);
    return {
      gen: true,
      fn: function* (f) {
        const r = R(f);
        const arr = isStr ? Array.from(r.s, (ch) => ch.charCodeAt(0)) : (r && typeof r.iterate === 'function' ? r.iterate() : r);
        for (let i = 0; i < arr.length; i++) {
          rt.line = line;
          rt.t += cost;
          if (isRef) { const idx = i; f[slot] = new Ref(() => arr[idx], (v) => { arr[idx] = v; }); } else f[slot] = conv(arr[i]);
          const s = bg ? yield* B(f) : B(f);
          if (s === BRK) return 0;
          if (s === RET) return RET;
          if (rt.t >= rt.limit || ((++rt.ops & 1023) === 0 && rt.overBudget())) yield 0;
        }
        return 0;
      },
    };
  }

  compileSwitch(node, ctx) {
    const d = this.compileExpr(node.disc, ctx);
    if (d.t.k !== 'int' && d.t.k !== 'any') throw this.err(`switch quantity not an integer`, node);
    ctx.switches++;
    this.pushScope(ctx);
    const table = new Map();
    const ranges = [];
    let defIndex = -1;
    const bodies = [];
    node.cases.forEach((cs, i) => {
      if (cs.test === null) defIndex = i;
      else {
        const v = this.constEval(cs.test);
        if (cs.testHi) ranges.push([v, this.constEval(cs.testHi), i]);
        else {
          if (table.has(v)) throw this.err(`duplicate case value`, cs);
          table.set(v, i);
        }
      }
      bodies.push(this.seq(cs.body.map((s) => this.compileStmt(s, ctx))));
    });
    this.popScope(ctx);
    ctx.switches--;
    const D = asGen(d), n = bodies.length;
    const fns = bodies.map((b) => b.fn), gens = bodies.map((b) => b.gen);
    const rt = this.rt, line = node.line, cost = this.stmtCost(4);
    const find = (v) => {
      let idx = table.get(v);
      if (idx === undefined) {
        for (const [lo, hi, i] of ranges) if (v >= lo && v <= hi) { idx = i; break; }
      }
      return idx === undefined ? defIndex : idx;
    };
    const anyGen = d.gen || gens.some(Boolean);
    if (!anyGen) {
      const Ds = d.fn;
      return {
        gen: false,
        fn: (f) => {
          rt.line = line; rt.t += cost;
          const start = find(Ds(f));
          if (start < 0) return 0;
          for (let i = start; i < n; i++) {
            const s = fns[i](f);
            if (s === BRK) return 0;
            if (s) return s;
          }
          return 0;
        },
      };
    }
    return {
      gen: true,
      fn: function* (f) {
        rt.line = line; rt.t += cost;
        const start = find(yield* D(f));
        if (start < 0) return 0;
        for (let i = start; i < n; i++) {
          const s = gens[i] ? yield* fns[i](f) : fns[i](f);
          if (s === BRK) return 0;
          if (s) return s;
        }
        return 0;
      },
    };
  }

  compileReturn(node, ctx) {
    const rt = this.rt, line = node.line;
    const retT = ctx.fnRet || this.T.void;
    if (!node.arg) {
      if (retT !== this.T.void && ctx.fi) this.warn(`return-statement with no value, in function returning '${typeName(retT)}'`, node);
      return { gen: false, fn: () => RET };
    }
    if (retT === this.T.void) {
      const e = this.compileExpr(node.arg, ctx);
      if (e.t.k !== 'void') this.warn(`return-statement with a value, in function returning 'void'`, node);
      if (e.gen) { const g = e.fn; return { gen: true, fn: function* (f) { yield* g(f); return RET; } }; }
      const fn = e.fn;
      return { gen: false, fn: (f) => { fn(f); return RET; } };
    }
    let e;
    if (ctx.fi && ctx.fi.retRef) {
      const lv = this.compileLValue(node.arg, ctx);
      e = lv.gen ? E(retT, lv.loc, true) : E(retT, lv.ref);
    } else {
      e = this.convert(this.compileInitValue(node.arg, retT, ctx), retT, node);
    }
    if (e.gen) { const g = e.fn; return { gen: true, fn: function* (f) { rt.line = line; f[0] = yield* g(f); return RET; } }; }
    const fn = e.fn;
    return { gen: false, fn: (f) => { rt.line = line; f[0] = fn(f); return RET; } };
  }

  // ------------------------------------------------------------ expressions
  compileExpr(node, ctx, discard = false) {
    this.nodeCount++;
    switch (node.kind) {
      case 'Num': return this.compileNum(node);
      case 'Chr': return E(this.T.char, () => node.v, false, { cst: node.v });
      case 'Str': {
        const s = node.v;
        return E(arrOf(this.T.char, s.length + 1), () => s, false, { cst: s, strLit: true });
      }
      case 'Ident': return this.compileIdent(node, ctx);
      case 'Binary': return this.compileBinary(node, ctx);
      case 'Logical': return this.compileLogical(node, ctx);
      case 'Unary': return this.compileUnary(node, ctx);
      case 'Update': return this.compileUpdate(node, ctx, discard);
      case 'Assign': return this.compileAssign(node, ctx, discard);
      case 'Cond': return this.compileCond(node, ctx);
      case 'Call': return this.compileCall(node, ctx);
      case 'Member': return this.compileMemberRead(node, ctx);
      case 'Index': case 'Deref': return this.compileLValueRead(node, ctx);
      case 'AddrOf': return this.compileAddrOf(node, ctx);
      case 'Cast': return this.compileCast(node, ctx);
      case 'Construct': return this.compileConstruct(node, ctx);
      case 'SizeofType': {
        const t = this.resolveType(node.type, node.type.ptr || 0, node);
        const v = sizeOf(t, this.T);
        return E(this.T.uint, () => v, false, { cst: v });
      }
      case 'SizeofExpr': return this.compileSizeofExpr(node, ctx);
      case 'Comma': {
        const list = node.list.map((n, i) => this.compileExpr(n, ctx, i < node.list.length - 1 || discard));
        const last = list[list.length - 1];
        if (list.every((x) => !x.gen)) {
          const fns = list.map((x) => x.fn), n = fns.length;
          return E(last.t, (f) => { let v; for (let i = 0; i < n; i++) v = fns[i](f); return v; });
        }
        const gens = list.map(asGen), n = gens.length;
        return E(last.t, function* (f) { let v; for (let i = 0; i < n; i++) v = yield* gens[i](f); return v; }, true);
      }
      case 'InitList': {
        // used e.g. as function argument; produce an array
        const items = node.items.map((it) => this.compileExpr(it, ctx));
        if (items.some((i) => i.gen)) throw this.err('initializer list cannot call blocking functions', node);
        const fns = items.map((i) => i.fn);
        const et = items.length ? items[0].t : this.T.int;
        return E(arrOf(et, items.length), (f) => fns.map((fn) => fn(f)), false, { initList: node });
      }
      default:
        throw this.err(`unsupported expression '${node.kind}'`, node);
    }
  }

  compileNum(node) {
    const T = this.T;
    const v = node.v;
    if (node.isFloat) {
      const t = node.fsuffix ? T.float : T.double;
      const val = t.bits === 32 ? Math.fround(v) : v;
      return E(t, () => val, false, { cst: val });
    }
    let t;
    const fits = (ty) => (ty.uns ? v <= 2 ** ty.bits - 1 : v <= 2 ** (ty.bits - 1) - 1);
    if (node.longs >= 2) t = node.unsigned ? T.u64 : T.i64;
    else if (node.longs === 1) t = node.unsigned ? T.ulong : (fits(T.long) ? T.long : T.ulong);
    else if (node.unsigned) t = fits(T.uint) ? T.uint : T.ulong;
    else if (fits(T.int)) t = T.int;
    else if (fits(T.long)) t = T.long;
    else if (fits(T.ulong) && (node.v > 0x7fffffff)) t = T.ulong;
    else t = T.i64;
    return E(t, () => v, false, { cst: v });
  }

  compileIdent(node, ctx) {
    const name = node.name;
    const T = this.T;
    if (name === 'true') return E(T.bool, () => 1, false, { cst: 1 });
    if (name === 'false') return E(T.bool, () => 0, false, { cst: 0 });
    if (name === 'NULL' || name === 'nullptr') return E(ptrTo(T.void), () => null, false, { cst: null, isNull: true });
    if (name === 'this') {
      if (!ctx || !ctx.cls) throw this.err("invalid use of 'this' in non-member function", node);
      return E(ptrTo(ctx.cls.type), (f) => f[1], false, { thisPtr: true });
    }
    const sym = this.lookup(name, ctx);
    if (!sym) throw this.err(`'${name}' was not declared in this scope`, node);
    switch (sym.kind) {
      case 'local': {
        if (sym.cst !== undefined) { const c = sym.cst; return E(sym.type, () => c, false, { cst: c }); }
        const s = sym.slot;
        if (sym.isRef) return E(sym.type, (f) => f[s].get(), false, { lvSym: sym });
        return E(sym.type, (f) => f[s], false, { lvSym: sym });
      }
      case 'global': {
        if (sym.cst !== undefined) { const c = sym.cst; return E(sym.type, () => c, false, { cst: c }); }
        const G = this.G, s = sym.slot;
        if (sym.isRef) return E(sym.type, () => G[s].get(), false, { lvSym: sym });
        return E(sym.type, () => G[s], false, { lvSym: sym });
      }
      case 'field': {
        const fname = name;
        return E(sym.type, (f) => f[1][fname], false, { lvSym: sym });
      }
      case 'const': {
        const v = sym.value;
        return E(sym.type, () => v, false, { cst: v });
      }
      case 'func': {
        const list = sym.list;
        list.forEach((fi) => { fi.usedAt = fi.usedAt || node; });
        return E(T.func, () => list[0], false, { funcList: list });
      }
      case 'nativeObj': {
        const v = sym.value;
        const t = { k: 'obj', name: sym.cls, cls: this.natives.classes[sym.cls] };
        return E(t, () => v, false);
      }
      case 'native':
        return E(T.func, () => sym.meta, false, { native: sym });
      case 'method':
        throw this.err(`invalid use of member function '${name}'`, node);
      default:
        throw this.err(`'${name}' cannot be used here`, node);
    }
  }

  // ---- conversions
  convertFn(from, to, node) {
    const e = this.convert(E(from, (f) => f), to, node);
    const fn = e.fn;
    return (v) => fn(v);
  }

  /** Converts expression e to type t (assignment semantics). */
  convert(e, t, node) {
    const T = this.T;
    const from = e.t;
    if (t.k === 'auto' || t === from) {
      if (t.k === 'struct' && !e.fresh) return this.mapE(e, t, cloneValue);
      if (t.k === 'String' && !e.fresh) return this.mapE(e, t, (v) => new AStr(v.s));
      return e;
    }
    switch (t.k) {
      case 'int': case 'float': {
        if (from.k === 'int' || from.k === 'float' || from.k === 'any') {
          let c = coercer(t);
          if (!c) return e;
          if (from.k === 'any' && t.isBool) c = (v) => ((v && typeof v === 'object' && typeof v.truthy === 'function' ? v.truthy() : v) ? 1 : 0);
          if (from.k === 'int' && t.k === 'int' && !t.isBool) {
            const fits = from.isBool || (from.bits < t.bits && (from.uns || !t.uns)) || (from.bits === t.bits && from.uns === t.uns);
            if (fits) return { ...e, t };
          }
          if (t.k === 'float' && ((from.k === 'float' && from.bits <= t.bits) || (from.k === 'int' && t.bits === 64))) return { ...e, t };
          if (isConst(e) && typeof e.cst === 'number') { const v = c(e.cst); return E(t, () => v, false, { cst: v }); }
          return this.mapE(e, t, c);
        }
        if (from.k === 'ptr' || from.k === 'arr' || from.k === 'func') {
          if (t.isBool) return this.mapE(e, t, (v) => (v ? 1 : 0));
          return this.mapE(e, t, (v) => (typeof v === 'number' ? v : (v ? 1 : 0)));
        }
        if (from.k === 'obj') {
          if (t.isBool) return this.mapE(e, t, (v) => (v ? 1 : 0));
          { const c = coercer(t); return this.mapE(e, t, (v) => c(typeof v === 'number' ? v : (v && v.valueOf ? +v.valueOf() || 0 : 0))); }
        }
        if (from.k === 'String') throw this.err(`cannot convert 'String' to '${typeName(t)}' (use .toInt() or .toFloat())`, node);
        if (from.k === 'void') throw this.err(`void value not ignored as it ought to be`, node);
        throw this.err(`cannot convert '${typeName(from)}' to '${typeName(t)}'`, node);
      }
      case 'String': {
        const toS = this.toJsStringFn(from, node);
        if (isConst(e) && (typeof e.cst === 'string' || typeof e.cst === 'number')) {
          const s = toS(e.cst);
          return E(t, () => new AStr(s), false, { fresh: true });
        }
        return this.mapE(e, t, (v) => new AStr(toS(v)), { fresh: true });
      }
      case 'ptr': {
        if (from.k === 'arr' || from.k === 'ptr' || e.isNull || from.k === 'any' || from.k === 'func' || (from.k === 'int' && isConst(e) && e.cst === 0)) {
          if (e.isNull || (from.k === 'int' && isConst(e))) return E(t, () => null, false, { cst: null, isNull: true });
          if (from.k === 'arr' && from.of.k === 'arr' && t.to && t.to.k !== 'arr') return { ...e, t };
          return { ...e, t };
        }
        if (from.k === 'String') return this.mapE(e, t, (v) => v.s);
        if (from.k === 'obj' || from.k === 'struct') return { ...e, t };
        throw this.err(`invalid conversion from '${typeName(from)}' to '${typeName(t)}'`, node);
      }
      case 'struct': {
        if (from.k === 'struct' && from.cls === t.cls) return e.fresh ? e : this.mapE(e, t, cloneValue);
        throw this.err(`conversion from '${typeName(from)}' to non-scalar type '${typeName(t)}' requested`, node);
      }
      case 'obj': {
        if (from.k === 'obj') return e;
        if (from.k === 'ptr' && from.to.k === 'obj') return { ...e, t };
        if (t.cls && t.cls.fromValue) { const fv = t.cls.fromValue; return this.mapE(e, t, (v) => fv(v)); }
        return { ...e, t };
      }
      case 'arr': {
        if (from.k === 'arr' || from.k === 'ptr') return e;
        throw this.err(`invalid array assignment`, node);
      }
      case 'func': return e;
      case 'any': return from.k === 'int' && from.isBool && !e.gen ? this.mapE(e, t, (v) => !!v) : e;   // keeps true/false when stored in a JSON document
      default:
        return e;
    }
  }

  mapE(e, t, map, extra) {
    if (e.gen) {
      const g = e.fn;
      return E(t, function* (f) { return map(yield* g(f)); }, true, extra);
    }
    const fn = e.fn;
    return E(t, (f) => map(fn(f)), false, extra);
  }

  toJsStringFn(t, node) {
    switch (t.k) {
      case 'String': return (v) => v.s;
      case 'ptr': case 'arr':
        if (t.to && t.to.k === 'int' && t.to.bits === 8) return cstr;
        if (t.of && t.of.k === 'int' && t.of.bits === 8) return cstr;
        if (t.to && t.to.k === 'void') return cstr;
        return cstr;
      case 'int':
        if (t.isChar) return (v) => String.fromCharCode(v & 255);
        if (t.uns) return (v) => String(v < 0 ? v >>> 0 : v);
        return (v) => String(v);
      case 'float': {
        const f32 = this.T.avr;
        return (v) => fmtFloat(v, 2, f32);
      }
      case 'any': return (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : fmtFloat(v, 2)) : cstr(v));
      case 'obj': return (v) => (v && v.toString ? v.toString() : '');
      default:
        throw this.err(`cannot convert '${typeName(t)}' to String`, node);
    }
  }

  printable(e, node) {
    const t = e.t;
    let kind = PK_INT;
    let conv = null;
    switch (t.k) {
      case 'int': kind = t.isChar ? PK_CHAR : (t.uns && !t.isBool ? PK_UINT : PK_INT); break;
      case 'float': kind = PK_FLOAT; break;
      case 'String': kind = PK_STR; break;
      case 'ptr': case 'arr': kind = PK_STR; conv = cstr; break;
      case 'obj': case 'struct': kind = PK_STR; conv = (v) => (v && v.printTo ? v.printTo() : (v && v.toString ? v.toString() : '')); break;
      case 'void': throw this.err('invalid use of void expression', node);
      default: kind = PK_INT;
    }
    const ex = conv ? this.mapE(e, t, conv) : e;
    return { e: ex, kind };
  }

  // ---- binary
  compileBinary(node, ctx) {
    const op = node.op;
    const l = this.compileExpr(node.l, ctx);
    const r = this.compileExpr(node.r, ctx);
    return this.binaryOp(op, l, r, node);
  }

  binaryOp(op, l, r, node) {
    const T = this.T;
    const lt = l.t, rt = r.t;
    // String operations
    if (lt.k === 'String' || rt.k === 'String') {
      if (op === '+') {
        const ls = this.toJsStringFn(lt, node), rs = this.toJsStringFn(rt, node);
        return this.lift2(T.String, l, r, (a, b) => new AStr(ls(a) + rs(b)), { fresh: true });
      }
      if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
        const ls = this.toJsStringFn(lt, node), rs = this.toJsStringFn(rt, node);
        const cmp = this.cmpFn(op);
        return this.lift2(T.bool, l, r, (a, b) => cmp(ls(a), rs(b)));
      }
      throw this.err(`no match for 'operator${op}' (operand types are '${typeName(lt)}' and '${typeName(rt)}')`, node);
    }
    // ArduinoJson: doc["x"] | 0 gives the default when the value is missing; == compares a value with a C string
    if (op === '|' && (lt.k === 'any' || lt.k === 'obj')) {
      return this.lift2(T.any, l, r, (a, b) => (a && typeof a === 'object' && typeof a.jsonOr === 'function' ? a.jsonOr(b) : ((+a | 0) | (typeof b === 'number' ? b : 0))));
    }
    if ((op === '==' || op === '!=') && (lt.k === 'any') !== (rt.k === 'any') && (lt.k === 'ptr' || lt.k === 'arr' || rt.k === 'ptr' || rt.k === 'arr')) {
      const un = (v) => (v && typeof v === 'object' && typeof v.jsonValue === 'function' ? v.jsonValue() : v);
      const isNull = (v) => v === null || v === undefined || v === 0;
      const eq = op === '==';
      return this.lift2(T.bool, l, r, (a, b) => {
        const x = un(a), y = un(b);
        if (isNull(x) || isNull(y)) return (isNull(x) && isNull(y)) === eq ? 1 : 0;
        return (cstr(x) === cstr(y)) === eq ? 1 : 0;
      });
    }
    // pointer arithmetic
    const lp = lt.k === 'ptr' || lt.k === 'arr', rp = rt.k === 'ptr' || rt.k === 'arr';
    if (lp || rp) {
      if ((op === '+' || op === '-') && lp && !rp) {
        const sign = op === '+' ? 1 : -1;
        const pt = lt.k === 'arr' ? ptrTo(lt.of) : lt;
        return this.lift2(pt, l, r, (p, n) => ptrAdd(p, sign * n));
      }
      if (op === '+' && rp && !lp) return this.lift2(rt.k === 'arr' ? ptrTo(rt.of) : rt, l, r, (n, p) => ptrAdd(p, n));
      if (op === '-' && lp && rp) return this.lift2(T.int, l, r, (a, b) => ptrIndex(a) - ptrIndex(b));
      if (['==', '!='].includes(op)) {
        const eq = (a, b) => {
          if ((a === null || a === 0) && (b === null || b === 0)) return true;
          if (a instanceof Ptr && b instanceof Ptr) return a.a === b.a && a.i === b.i;
          // a pointer to the start of an array equals the array (buf + 0 == buf)
          if (a instanceof Ptr && Array.isArray(b)) return a.a === b && a.i === 0;
          if (b instanceof Ptr && Array.isArray(a)) return b.a === a && b.i === 0;
          if (typeof a === 'string' && typeof b === 'string') return a === b;
          if ((typeof a === 'string' || Array.isArray(a)) && (typeof b === 'string' || Array.isArray(b))) return cstr(a) === cstr(b);
          return a === b;
        };
        return this.lift2(T.bool, l, r, op === '==' ? (a, b) => (eq(a, b) ? 1 : 0) : (a, b) => (eq(a, b) ? 0 : 1));
      }
      if (['<', '>', '<=', '>='].includes(op)) {
        const cmp = this.cmpFn(op);
        return this.lift2(T.bool, l, r, (a, b) => cmp(ptrIndex(a), ptrIndex(b)));
      }
      throw this.err(`invalid operands of types '${typeName(lt)}' and '${typeName(rt)}' to binary 'operator${op}'`, node);
    }
    if (lt.k === 'struct' || rt.k === 'struct' || lt.k === 'void' || rt.k === 'void') {
      throw this.err(`invalid operands of types '${typeName(lt)}' and '${typeName(rt)}' to binary 'operator${op}'`, node);
    }
    if (lt.k === 'obj' || rt.k === 'obj') {
      // e.g. comparing objects with valueOf (DateTime, IPAddress)
      const lv = this.objNum(lt), rv = this.objNum(rt);
      l = lv ? this.mapE(l, T.any, lv) : l;
      r = rv ? this.mapE(r, T.any, rv) : r;
      return this.binaryOp(op, { ...l, t: lv ? T.any : l.t }, { ...r, t: rv ? T.any : r.t }, node);
    }
    if (op === '<<' || op === '>>') {
      const pt = promote(lt, T);
      if (pt.k === 'float' || rt.k === 'float') throw this.err(`invalid operands of types '${typeName(lt)}' and '${typeName(rt)}' to binary 'operator${op}'`, node);
      const w = wrapper(pt.k === 'any' ? T.long : pt);
      let fn;
      if (op === '<<') {
        if (pt.bits === 64) fn = (a, b) => a * 2 ** b;
        else fn = w ? (a, b) => w(b >= 32 ? 0 : a << b) : (a, b) => a << b;
      } else if (pt.uns) fn = pt.bits === 64 ? (a, b) => Math.floor(a / 2 ** b) : (a, b) => (b >= 32 ? 0 : a >>> b);
      else fn = pt.bits === 64 ? (a, b) => Math.floor(a / 2 ** b) : (a, b) => (b >= 32 ? (a < 0 ? -1 : 0) : a >> b);
      return this.lift2(pt.k === 'any' ? T.long : pt, l, r, fn);
    }
    const ct = commonType(lt, rt, T);
    if (['==', '!=', '<', '>', '<=', '>='].includes(op)) {
      const cmp = this.cmpFn(op);
      if (ct.k === 'int' && (lt.uns !== rt.uns)) {
        const c = coercer(ct);
        if (c) return this.lift2(T.bool, l, r, (a, b) => cmp(c(a), c(b)));
      }
      return this.lift2(T.bool, l, r, cmp);
    }
    let fn;
    if (ct.k === 'float' || ct.k === 'any') {
      switch (op) {
        case '+': fn = (a, b) => a + b; break;
        case '-': fn = (a, b) => a - b; break;
        case '*': fn = (a, b) => a * b; break;
        case '/':
          if (ct.k === 'any') fn = (a, b) => (Number.isInteger(a) && Number.isInteger(b) ? (b === 0 ? -1 : Math.trunc(a / b)) : a / b);
          else fn = (a, b) => a / b;
          break;
        case '%':
          if (lt.k === 'float' || rt.k === 'float') throw this.err(`invalid operands of types '${typeName(lt)}' and '${typeName(rt)}' to binary 'operator%' (use fmod)`, node);
          fn = (a, b) => (b === 0 ? a : a % b);
          break;
        case '&': case '|': case '^':
          if (ct.k === 'float') throw this.err(`invalid operands of types '${typeName(lt)}' and '${typeName(rt)}' to binary 'operator${op}'`, node);
          fn = op === '&' ? (a, b) => a & b : op === '|' ? (a, b) => a | b : (a, b) => a ^ b;
          break;
        default: throw this.err(`unsupported operator ${op}`, node);
      }
      return this.lift2(ct, l, r, fn);
    }
    // integer arithmetic with C wrap-around semantics
    const w = wrapper(ct);
    const conv = (lt.uns !== rt.uns && ct.uns) ? coercer(ct) : null;
    const rt_ = this.rt;
    switch (op) {
      case '+': fn = w ? (a, b) => w(a + b) : (a, b) => a + b; break;
      case '-': fn = w ? (a, b) => w(a - b) : (a, b) => a - b; break;
      case '*':
        if (ct.bits === 32) fn = ct.uns ? (a, b) => Math.imul(a, b) >>> 0 : (a, b) => Math.imul(a, b);
        else fn = w ? (a, b) => w(Math.imul(a, b)) : (a, b) => a * b;
        break;
      case '/': {
        const line = node.line;
        fn = (a, b) => {
          if (b === 0) { rt_.warnOnce('div0:' + line, `Division by zero at line ${line}`); return -1; }
          return w ? w(Math.trunc(a / b)) : Math.trunc(a / b);
        };
        if (conv) { const f0 = fn; fn = (a, b) => f0(conv(a), conv(b)); }
        break;
      }
      case '%': {
        const line = node.line;
        fn = (a, b) => {
          if (b === 0) { rt_.warnOnce('mod0:' + line, `Modulo by zero at line ${line}`); return a; }
          return w ? w(a % b) : a % b;
        };
        if (conv) { const f0 = fn; fn = (a, b) => f0(conv(a), conv(b)); }
        break;
      }
      case '&': fn = w ? (a, b) => w(a & b) : (a, b) => a & b; break;
      case '|': fn = w ? (a, b) => w(a | b) : (a, b) => a | b; break;
      case '^': fn = w ? (a, b) => w(a ^ b) : (a, b) => a ^ b; break;
      default: throw this.err(`unsupported operator ${op}`, node);
    }
    if (conv && (op === '+' || op === '-' || op === '*')) { /* wrap handles it */ }
    return this.lift2(ct, l, r, fn);
  }

  objNum(t) {
    if (t.k !== 'obj') return null;
    return (v) => (v && typeof v.valueOf === 'function' ? +v.valueOf() : 0);
  }

  cmpFn(op) {
    switch (op) {
      case '==': return (a, b) => (a == b ? 1 : 0); // eslint-disable-line eqeqeq
      case '!=': return (a, b) => (a != b ? 1 : 0); // eslint-disable-line eqeqeq
      case '<': return (a, b) => (a < b ? 1 : 0);
      case '>': return (a, b) => (a > b ? 1 : 0);
      case '<=': return (a, b) => (a <= b ? 1 : 0);
      case '>=': return (a, b) => (a >= b ? 1 : 0);
      default: throw new Error(op);
    }
  }

  lift1(t, a, op, extra) {
    if (isConst(a) && !a.gen && typeof a.cst === 'number') {
      const v = op(a.cst);
      if (typeof v === 'number') return E(t, () => v, false, { cst: v, ...extra });
    }
    if (!a.gen) { const A = a.fn; return E(t, (f) => op(A(f)), false, extra); }
    const A = a.fn;
    return E(t, function* (f) { return op(yield* A(f)); }, true, extra);
  }

  lift2(t, a, b, op, extra) {
    if (isConst(a) && isConst(b) && !a.gen && !b.gen && typeof a.cst !== 'object' && typeof b.cst !== 'object') {
      try {
        const v = op(a.cst, b.cst);
        if (typeof v === 'number' || typeof v === 'string') return E(t, () => v, false, { cst: v, ...extra });
      } catch (e) { /* not foldable */ }
    }
    if (!a.gen && !b.gen) {
      const A = a.fn, B = b.fn;
      if (isConst(b) && typeof b.cst === 'number') { const c = b.cst; return E(t, (f) => op(A(f), c), false, extra); }
      return E(t, (f) => op(A(f), B(f)), false, extra);
    }
    const A = asGen(a), B = asGen(b);
    return E(t, function* (f) { const x = yield* A(f); return op(x, yield* B(f)); }, true, extra);
  }

  compileLogical(node, ctx) {
    const l = this.toBool(this.compileExpr(node.l, ctx), node.l);
    const r = this.toBool(this.compileExpr(node.r, ctx), node.r);
    const T = this.T;
    if (node.op === '&&') {
      if (!l.gen && !r.gen) { const A = l.fn, B = r.fn; return E(T.bool, (f) => (A(f) && B(f) ? 1 : 0)); }
      const A = asGen(l), B = asGen(r);
      return E(T.bool, function* (f) { return (yield* A(f)) && (yield* B(f)) ? 1 : 0; }, true);
    }
    if (!l.gen && !r.gen) { const A = l.fn, B = r.fn; return E(T.bool, (f) => (A(f) || B(f) ? 1 : 0)); }
    const A = asGen(l), B = asGen(r);
    return E(T.bool, function* (f) { return (yield* A(f)) || (yield* B(f)) ? 1 : 0; }, true);
  }

  compileUnary(node, ctx) {
    const a = this.compileExpr(node.arg, ctx);
    const T = this.T;
    const t = a.t;
    switch (node.op) {
      case '!':
        if (t.k === 'String') throw this.err("no match for 'operator!' (operand type is 'String')", node);
        return this.lift1(T.bool, a, t.k === 'obj' || t.k === 'any' ? (v) => ((v && typeof v.truthy === 'function' ? v.truthy() : v) ? 0 : 1) : (v) => (v ? 0 : 1));
      case '-': {
        if (t.k === 'float' || t.k === 'any') return this.lift1(t, a, (v) => -v);
        if (t.k !== 'int') throw this.err(`wrong type argument to unary minus`, node);
        const pt = promote(t, T);
        const w = wrapper(pt);
        return this.lift1(pt, a, w ? (v) => w(-v) : (v) => -v);
      }
      case '+': {
        if (t.k !== 'int') return a;
        return { ...a, t: promote(t, T) };
      }
      case '~': {
        if (t.k !== 'int' && t.k !== 'any') throw this.err(`wrong type argument to bit-complement`, node);
        const pt = t.k === 'any' ? T.long : promote(t, T);
        const w = wrapper(pt);
        return this.lift1(pt, a, w ? (v) => w(~v) : (v) => ~v);
      }
      default: throw this.err(`unsupported unary ${node.op}`, node);
    }
  }

  compileCond(node, ctx) {
    const c = this.toBool(this.compileExpr(node.cond, ctx), node.cond);
    let a = this.compileExpr(node.a, ctx);
    let b = this.compileExpr(node.b, ctx);
    let t;
    if (a.t.k === 'String' || b.t.k === 'String') t = this.T.String;
    else if ((a.t.k === 'int' || a.t.k === 'float' || a.t.k === 'any') && (b.t.k === 'int' || b.t.k === 'float' || b.t.k === 'any')) t = commonType(a.t, b.t, this.T);
    else if (a.t.k === 'arr' || a.t.k === 'ptr') t = a.t.k === 'arr' ? ptrTo(a.t.of) : a.t;
    else if (b.t.k === 'arr' || b.t.k === 'ptr') t = b.t.k === 'arr' ? ptrTo(b.t.of) : b.t;
    else t = a.t;
    if (t.k === 'int' || t.k === 'float' || t.k === 'String') { a = this.convert(a, t, node); b = this.convert(b, t, node); }
    if (!c.gen && !a.gen && !b.gen) {
      if (isConst(c)) return c.cst ? a : b;
      const C = c.fn, A = a.fn, B = b.fn;
      return E(t, (f) => (C(f) ? A(f) : B(f)));
    }
    const C = asGen(c), A = asGen(a), B = asGen(b);
    return E(t, function* (f) { return (yield* C(f)) ? yield* A(f) : yield* B(f); }, true);
  }

  compileCast(node, ctx) {
    const t = this.resolveType(node.type, 0, node);
    if (t.k === 'void') {
      const e = this.compileExpr(node.arg, ctx);
      return { ...e, t: this.T.void };
    }
    if (node.arg.kind === 'InitList') {
      if (t.k === 'struct') return this.compileStructInitList(t.cls, node.arg, ctx);
      return this.convert(this.compileInitValue(node.arg, t, ctx), t, node);
    }
    const e = this.compileExpr(node.arg, ctx);
    if (t.k === 'ptr') {
      if (e.t.k === 'ptr' || e.t.k === 'arr' || e.t.k === 'String' || e.t.k === 'obj' || e.t.k === 'struct' || e.t.k === 'any') return { ...e, t };
      return { ...e, t };
    }
    if (t.k === 'String') return this.convert(e, t, node);
    if ((t.k === 'int' || t.k === 'float') && e.t.k === 'String') throw this.err(`invalid cast from type 'String' to type '${typeName(t)}'`, node);
    if (t.k === 'int' && t.isChar && e.t.k === 'String') throw this.err(`invalid cast`, node);
    return this.convert(e, t, node);
  }

  compileConstruct(node, ctx) {
    const name = node.type.name;
    const T = this.T;
    if (name === 'String') {
      // String(value [, base|decimals])
      if (node.args.length === 0) return E(T.String, () => new AStr(''), false, { fresh: true });
      const a = this.compileExpr(node.args[0], ctx);
      if (node.args.length >= 2) {
        const b = this.compileExpr(node.args[1], ctx);
        if (a.t.k === 'float') {
          const f32 = T.avr;
          return this.lift2(T.String, a, b, (v, d) => new AStr(fmtFloat(v, d, f32)), { fresh: true });
        }
        const uns = a.t.uns;
        return this.lift2(T.String, a, b, (v, base) => new AStr(fmtInt(v, base, uns)), { fresh: true });
      }
      return this.convert(a, T.String, node);
    }
    if (this.structs.has(name)) {
      const cls = this.structs.get(name);
      if (node.braces && !cls.ctors.length) return this.compileStructInitList(cls, { items: node.args }, ctx);
      return this.compileStructCtor(cls, node.args, ctx, node);
    }
    if (this.natives.classes[name]) {
      const t = { k: 'obj', name, cls: this.natives.classes[name] };
      return E(t, this.compileObjCtor(t, node.args, ctx, node));
    }
    const t = this.resolveType(node.type, 0, node);
    if (node.args.length === 0) { const v = this.defaultValue(t); return E(t, () => v, false, { cst: v }); }
    if (node.args.length !== 1) throw this.err(`expression list treated as compound expression in functional cast`, node);
    return this.convert(this.compileExpr(node.args[0], ctx), t, node);
  }

  compileSizeofExpr(node, ctx) {
    const e = this.compileExpr(node.arg, ctx);
    const T = this.T;
    if (e.t.k === 'arr') {
      const leaf = this.leafType(e.t);
      const es = sizeOf(leaf, T);
      if (e.strLit) { const v = e.cst.length + 1; return E(T.uint, () => v, false, { cst: v }); }
      // compute from the actual array at runtime (handles inferred sizes)
      if (e.gen) throw this.err('invalid sizeof operand', node);
      const fn = e.fn;
      return E(T.uint, (f) => countLeaves(fn(f)) * es);
    }
    const v = sizeOf(e.t, T);
    return E(T.uint, () => v, false, { cst: v });
  }

  // ------------------------------------------------------------ lvalues
  /**
   * Compiles an lvalue. Sync result: { t, gen:false, get(f), set(f,v), rmw(f, comb, post), ref(f) }.
   * Gen result: { t, gen:true, loc: function*(f) -> Ref }.
   */
  compileLValue(node, ctx) {
    const lv = this.compileLValueRaw(node, ctx);
    const c = (lv.t.k === 'int' || lv.t.k === 'float') ? coercer(lv.t) : null;
    if (!c) return lv;
    if (lv.gen) {
      const L = lv.loc;
      return { ...lv, loc: function* (f) { const r = yield* L(f); const s0 = r.set; r.set = (v) => s0(c(v)); return r; } };
    }
    const R = lv.ref;
    return { ...lv, ref: (f) => { const r = R(f); const s0 = r.set; r.set = (v) => s0(c(v)); return r; } };
  }

  compileLValueRaw(node, ctx) {
    const rt = this.rt;
    switch (node.kind) {
      case 'Ident': {
        const sym = this.lookup(node.name, ctx);
        if (!sym) throw this.err(`'${node.name}' was not declared in this scope`, node);
        if (sym.kind === 'local') {
          const s = sym.slot;
          if (sym.isRef) return this.refLV(sym.type, (f) => f[s]);
          return {
            t: sym.type, gen: false, isConst: !!sym.cst,
            get: (f) => f[s],
            set: (f, v) => { f[s] = v; },
            rmw: (f, comb, post) => { const o = f[s]; const n = comb(f, o); f[s] = n; return post ? o : n; },
            ref: (f) => new Ref(() => f[s], (v) => { f[s] = v; }),
          };
        }
        if (sym.kind === 'global') {
          const G = this.G, s = sym.slot;
          if (sym.isRef) return this.refLV(sym.type, () => G[s]);
          return {
            t: sym.type, gen: false, isConst: sym.isConst,
            get: () => G[s],
            set: (f, v) => { G[s] = v; },
            rmw: (f, comb, post) => { const o = G[s]; const n = comb(f, o); G[s] = n; return post ? o : n; },
            ref: () => new Ref(() => G[s], (v) => { G[s] = v; }),
          };
        }
        if (sym.kind === 'field') {
          const name = node.name;
          return this.memberLV(sym.type, (f) => f[1], name);
        }
        if (sym.kind === 'const') throw this.err(`lvalue required as left operand of assignment`, node);
        throw this.err(`'${node.name}' is not assignable`, node);
      }
      case 'Index': {
        const obj = this.compileExpr(node.obj, ctx);
        const idx = this.compileExpr(node.idx, ctx);
        const ot = obj.t;
        let et;
        if (ot.k === 'arr') et = ot.of;
        else if (ot.k === 'ptr') et = ot.to;
        else if (ot.k === 'String') {
          // String operator[] -> char (setCharAt semantics)
          const O = obj.fn, I = idx.fn;
          if (obj.gen || idx.gen) throw this.err('String index cannot call blocking functions', node);
          const getc = (s, i) => (i >= 0 && i < s.s.length ? s.s.charCodeAt(i) : 0);
          const setc = (s, i, v) => { if (i >= 0 && i < s.s.length) s.s = s.s.slice(0, i) + String.fromCharCode(v & 255) + s.s.slice(i + 1); };
          return {
            t: this.T.char, gen: false,
            get: (f) => getc(O(f), I(f)),
            set: (f, v) => setc(O(f), I(f), v),
            rmw: (f, comb, post) => { const s = O(f), i = I(f); const o = getc(s, i); const n = comb(f, o); setc(s, i, n); return post ? o : n; },
            ref: (f) => { const s = O(f), i = I(f); return new Ref(() => getc(s, i), (v) => setc(s, i, v)); },
          };
        } else if (ot.k === 'any' || ot.k === 'obj') et = this.T.any;
        else throw this.err(`invalid types '${typeName(ot)}[${typeName(idx.t)}]' for array subscript`, node);
        if (idx.t.k === 'float') throw this.err(`invalid types '${typeName(ot)}[${typeName(idx.t)}]' for array subscript`, node);
        if (obj.gen || idx.gen) {
          const O = asGen(obj), I = asGen(idx);
          return { t: et, gen: true, loc: function* (f) { const a = yield* O(f); const i = yield* I(f); return elemRef(a, i, rt); } };
        }
        const O = obj.fn, I = idx.fn, line = node.line;
        if (ot.k === 'arr') {
          const oob = (a, i) => { rt.warnOnce('oob:' + line, `Array index ${i} is out of bounds (size ${a.length}) at line ${line}`); return 0; };
          return {
            t: et, gen: false,
            get: (f) => { const a = O(f), i = I(f); return i >= 0 && i < a.length ? a[i] : (typeof a === 'string' ? (i === a.length ? 0 : oob(a, i)) : oob(a, i)); },
            set: (f, v) => { const a = O(f), i = I(f); if (i >= 0 && i < a.length) a[i] = v; else oob(a, i); },
            rmw: (f, comb, post) => { const a = O(f), i = I(f); if (!(i >= 0 && i < a.length)) return oob(a, i); const o = a[i]; const n = comb(f, o); a[i] = n; return post ? o : n; },
            ref: (f) => elemRef(O(f), I(f), rt),
          };
        }
        return {
          t: et, gen: false,
          get: (f) => elemGet(O(f), I(f), rt),
          set: (f, v) => elemSet(O(f), I(f), v, rt),
          rmw: (f, comb, post) => { const a = O(f), i = I(f); const o = elemGet(a, i, rt); const n = comb(f, o); elemSet(a, i, n, rt); return post ? o : n; },
          ref: (f) => elemRef(O(f), I(f), rt),
        };
      }
      case 'Member': {
        const obj = node.obj;
        if (obj.kind === 'Ident' && obj.name === 'this' && node.arrow) {
          if (!ctx.cls) throw this.err("invalid use of 'this'", node);
          const fd = ctx.cls.fields.get(node.name);
          if (!fd) throw this.err(`'${ctx.cls.name}' has no member named '${node.name}'`, node);
          return this.memberLV(fd.type, (f) => f[1], node.name);
        }
        const o = this.compileExpr(obj, ctx);
        let st = o.t;
        if (node.arrow) {
          if (st.k !== 'ptr' && st.k !== 'any') throw this.err(`base operand of '->' has non-pointer type '${typeName(st)}'`, node);
          st = st.k === 'ptr' ? st.to : st;
        }
        let ft;
        if (st.k === 'struct') {
          const fd = st.cls.fields.get(node.name);
          if (!fd) throw this.err(`'${typeName(st)}' has no member named '${node.name}'`, node);
          ft = fd.type;
        } else if (st.k === 'obj' || st.k === 'any') {
          ft = (st.cls && st.cls.fields && st.cls.fields[node.name] && this.T[st.cls.fields[node.name]]) || this.T.any;
        } else throw this.err(`request for member '${node.name}' in non-class type '${typeName(st)}'`, node);
        if (o.gen) {
          const O = o.fn, name = node.name, arrow = node.arrow;
          return { t: ft, gen: true, loc: function* (f) { let x = yield* O(f); if (arrow) x = derefObj(x); return new Ref(() => x[name], (v) => { x[name] = v; }); } };
        }
        const O = o.fn;
        const base = node.arrow ? (f) => derefObj(O(f)) : O;
        return this.memberLV(ft, base, node.name);
      }
      case 'Deref': {
        const p = this.compileExpr(node.arg, ctx);
        let t;
        if (p.t.k === 'ptr') t = p.t.to;
        else if (p.t.k === 'arr') t = p.t.of;
        else if (p.t.k === 'any') t = this.T.any;
        else throw this.err(`invalid type argument of unary '*' (have '${typeName(p.t)}')`, node);
        if (p.gen) {
          const P = p.fn;
          return { t, gen: true, loc: function* (f) { return ptrRef(yield* P(f), rt); } };
        }
        const P = p.fn;
        return {
          t, gen: false,
          get: (f) => ptrGet(P(f), rt),
          set: (f, v) => ptrSet(P(f), v, rt),
          rmw: (f, comb, post) => { const pv = P(f); const o = ptrGet(pv, rt); const n = comb(f, o); ptrSet(pv, n, rt); return post ? o : n; },
          ref: (f) => ptrRef(P(f), rt),
        };
      }
      case 'Cast':
        return { ...this.compileLValueRaw(node.arg, ctx) };
      case 'Call': {
        // function returning reference
        const e = this.compileExpr(node, ctx);
        if (e.gen) {
          const g = e.fn;
          return { t: e.t, gen: true, loc: function* (f) { const r = yield* g(f); return r instanceof Ref ? r : new Ref(() => r, () => {}); } };
        }
        const fn = e.fn;
        if (e.retRef) return this.refLV(e.t, fn);
        throw this.err('lvalue required as left operand of assignment', node);
      }
      default:
        throw this.err('lvalue required as left operand of assignment', node);
    }
  }

  refLV(t, getRef) {
    return {
      t, gen: false,
      get: (f) => getRef(f).get(),
      set: (f, v) => getRef(f).set(v),
      rmw: (f, comb, post) => { const r = getRef(f); const o = r.get(); const n = comb(f, o); r.set(n); return post ? o : n; },
      ref: (f) => getRef(f),
    };
  }

  memberLV(t, base, name) {
    return {
      t, gen: false,
      get: (f) => base(f)[name],
      set: (f, v) => { base(f)[name] = v; },
      rmw: (f, comb, post) => { const o = base(f); const old = o[name]; const n = comb(f, old); o[name] = n; return post ? old : n; },
      ref: (f) => { const o = base(f); return new Ref(() => o[name], (v) => { o[name] = v; }); },
    };
  }

  compileLValueRead(node, ctx) {
    const lv = this.compileLValue(node, ctx);
    if (lv.gen) {
      const L = lv.loc;
      return E(lv.t, function* (f) { return (yield* L(f)).get(); }, true);
    }
    return E(lv.t, lv.get, false);
  }

  compileMemberRead(node, ctx) {
    // obj.field / ptr->field (method calls are handled in compileCall)
    const obj = node.obj;
    if (obj.kind === 'Ident' && obj.name !== 'this') {
      // Enum-like access on library objects / scoped names
      const sym = this.lookup(obj.name, ctx);
      if (!sym && this.natives.classes[obj.name]) {
        const v = this.natives.constants[node.name];
        if (v !== undefined) return E(this.T.int, () => v, false, { cst: v });
      }
    }
    return this.compileLValueRead(node, ctx);
  }

  compileAddrOf(node, ctx) {
    const arg = node.arg;
    // &array[i] -> Ptr ; &var -> Ref ; &obj (library object) -> object itself ; &func -> func
    if (arg.kind === 'Ident') {
      const sym = this.lookup(arg.name, ctx);
      if (sym && (sym.kind === 'func' || sym.kind === 'native')) return this.compileExpr(arg, ctx);
      if (sym && sym.kind === 'nativeObj') { const e = this.compileExpr(arg, ctx); return { ...e, t: ptrTo(e.t) }; }
      if (sym && (sym.type && (sym.type.k === 'obj' || sym.type.k === 'arr' || sym.type.k === 'struct'))) {
        const e = this.compileExpr(arg, ctx);
        if (sym.type.k === 'arr') return { ...e, t: ptrTo(sym.type) };
        return { ...e, t: ptrTo(sym.type) };
      }
    }
    if (arg.kind === 'Index') {
      const obj = this.compileExpr(arg.obj, ctx);
      const idx = this.compileExpr(arg.idx, ctx);
      const et = obj.t.k === 'arr' ? obj.t.of : obj.t.k === 'ptr' ? obj.t.to : this.T.any;
      if (et.k === 'struct' || et.k === 'obj') {
        // pointer to struct element: return the element object itself wrapped as Ptr
        return this.lift2(ptrTo(et), obj, idx, (a, i) => ptrAdd(a, i));
      }
      return this.lift2(ptrTo(et), obj, idx, (a, i) => ptrAdd(a, i));
    }
    const lv = this.compileLValue(arg, ctx);
    if (lv.t.k === 'struct' || lv.t.k === 'obj') {
      if (lv.gen) { const L = lv.loc; return E(ptrTo(lv.t), function* (f) { return (yield* L(f)).get(); }, true); }
      return E(ptrTo(lv.t), lv.get);
    }
    if (lv.gen) return E(ptrTo(lv.t), lv.loc, true);
    return E(ptrTo(lv.t), lv.ref);
  }

  compileAssign(node, ctx) {
    const lv = this.compileLValue(node.target, ctx);
    if (lv.isConst) throw this.err(`assignment of read-only variable`, node);
    const t = lv.t;
    const op = node.op;
    if (t.k === 'arr') {
      throw this.err(`invalid array assignment`, node);
    }
    if (op === '=') {
      const v = this.convert(this.compileInitValue(node.value, t, ctx), t, node);
      if (!lv.gen && !v.gen) {
        const set = lv.set, V = v.fn;
        return E(t, (f) => { const x = V(f); set(f, x); return x; });
      }
      if (lv.gen) {
        const L = lv.loc, V = asGen(v);
        return E(t, function* (f) { const r = yield* L(f); const x = yield* V(f); r.set(x); return x; }, true);
      }
      const set = lv.set, V = v.fn;
      return E(t, function* (f) { const x = yield* V(f); set(f, x); return x; }, true);
    }
    const bop = op.slice(0, -1);
    // String +=
    if (t.k === 'String') {
      if (bop !== '+') throw this.err(`no match for 'operator${op}'`, node);
      const v = this.compileExpr(node.value, ctx);
      const toS = this.toJsStringFn(v.t, node);
      if (lv.gen || v.gen) {
        const L = lv.gen ? lv.loc : null, get = lv.get, V = asGen(v);
        return E(t, function* (f) { const s = L ? (yield* L(f)).get() : get(f); s.s += toS(yield* V(f)); return s; }, true);
      }
      const get = lv.get, V = v.fn;
      return E(t, (f) => { const s = get(f); s.s += toS(V(f)); return s; });
    }
    const v = this.compileExpr(node.value, ctx);
    // compute (old op value) using the binary operator machinery, then convert to the target type
    const { fn: opFn, t: resT } = this.rawBinary(bop, t, v.t, node);
    const conv = this.convert(E(resT, (x) => x), t, node).fn;
    if (!lv.gen && !v.gen) {
      const V = v.fn;
      const comb = (f, old) => conv(opFn(old, V(f)));
      const rmw = lv.rmw;
      return E(t, (f) => rmw(f, comb, false));
    }
    const V = asGen(v);
    if (lv.gen) {
      const L = lv.loc;
      return E(t, function* (f) { const r = yield* L(f); const x = yield* V(f); const n = conv(opFn(r.get(), x)); r.set(n); return n; }, true);
    }
    const rmw = lv.rmw;
    return E(t, function* (f) { const x = yield* V(f); return rmw(f, (ff, old) => conv(opFn(old, x)), false); }, true);
  }

  /** Raw (a,b)=>result function for a binary operator on values of static types lt, rt. */
  rawBinary(op, lt, rt, node) {
    const e = this.binaryOp(op, { t: lt, gen: false, fn: (f) => f.a }, { t: rt, gen: false, fn: (f) => f.b }, node);
    const fn = e.fn;
    const box = { a: 0, b: 0 };
    return { t: e.t, fn: (a, b) => { box.a = a; box.b = b; return fn(box); } };
  }

  compileUpdate(node, ctx) {
    const lv = this.compileLValue(node.arg, ctx);
    if (lv.isConst) throw this.err(`increment of read-only variable`, node);
    const t = lv.t;
    const d = node.op === '++' ? 1 : -1;
    let step;
    if (t.k === 'ptr') step = (v) => ptrAdd(v, d);
    else if (t.k === 'int' || t.k === 'float' || t.k === 'any') {
      const c = coercer(t);
      step = c ? (v) => c(v + d) : (v) => v + d;
      if (t.isBool) step = d > 0 ? () => 1 : (v) => (v ? 0 : 1);
    } else throw this.err(`no match for 'operator${node.op}' (operand type is '${typeName(t)}')`, node);
    const post = !node.prefix;
    if (lv.gen) {
      const L = lv.loc;
      return E(t, function* (f) { const r = yield* L(f); const o = r.get(); const n = step(o); r.set(n); return post ? o : n; }, true);
    }
    const rmw = lv.rmw;
    const comb = (f, old) => step(old);
    return E(t, (f) => rmw(f, comb, post));
  }

  // ------------------------------------------------------------ calls
  pickOverload(list, argNodes, ctx, node, name) {
    const real = list.filter((fi) => fi.node.body || fi.run || true);
    const n = argNodes.length;
    const cands = real.filter((fi) => {
      const req = fi.params.filter((p) => !p.def).length;
      return n >= req && (n <= fi.params.length || fi.variadic);
    });
    if (!cands.length) {
      const fi = real[0];
      const req = fi.params.filter((p) => !p.def).length;
      if (n < req) throw this.err(`too few arguments to function '${name}'`, node);
      throw this.err(`too many arguments to function '${name}'`, node);
    }
    if (cands.length === 1) return cands[0];
    // pick by argument type compatibility
    const argTypes = argNodes.map((a) => this.peekType(a, ctx));
    let best = cands[0], bestScore = -1;
    for (const fi of cands) {
      let score = 0;
      fi.params.forEach((p, i) => {
        const at = argTypes[i];
        if (!at) return;
        if (p.type.k === at.k) score += 2;
        if (p.type === at) score += 3;
        if ((p.type.k === 'String' || (p.type.k === 'ptr' && p.type.to.bits === 8)) && (at.k === 'arr' || at.k === 'ptr' || at.k === 'String')) score += 2;
        if (p.type.k === 'float' && at.k === 'int') score += 1;
        if (p.type.k === 'int' && at.k === 'int' && p.type.isChar === at.isChar) score += 1;
      });
      if (fi.params.length === n) score += 1;
      if (score > bestScore) { best = fi; bestScore = score; }
    }
    return best;
  }

  peekType(node, ctx) {
    const saved = this.nodeCount;
    try {
      return this.compileExpr(node, ctx).t;
    } catch (e) {
      return null;
    } finally {
      this.nodeCount = saved;
    }
  }

  compileUserCall(fi, argNodes, ctx, node, thisFn = null, thisGen = false) {
    fi.usedAt = fi.usedAt || node;
    const rt = this.rt;
    const args = [];
    const params = fi.params;
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      let an = argNodes[i];
      let e;
      if (an === undefined) {
        if (!p.def) throw this.err(`too few arguments to function '${fi.name}'`, node);
        e = this.compileExpr(p.def, this.newCtx(null));
      } else if (p.isRef) {
        if (p.type.k === 'obj' || p.type.k === 'arr') { e = this.compileExpr(an, ctx); }
        else {
          let lv;
          try { lv = this.compileLValue(an, ctx); } catch (err) { lv = null; }
          if (lv) e = lv.gen ? E(p.type, lv.loc, true) : E(p.type, lv.ref);
          else {
            // const T& bound to temporary
            const v = this.convert(this.compileInitValue(an, p.type, ctx), p.type, an);
            e = this.mapE(v, p.type, (x) => { let box = x; return new Ref(() => box, (nv) => { box = nv; }); });
          }
        }
      } else {
        e = this.convert(this.compileInitValue(an, p.type, ctx), p.type, an);
      }
      args.push({ e, slot: p.slot });
    }
    const extra = argNodes.slice(params.length).map((a) => this.compileExpr(a, ctx));
    if (extra.length && !fi.variadic) throw this.err(`too many arguments to function '${fi.name}'`, node);
    const retT = fi.ret;
    const anyGen = fi.gen || args.some((a) => a.e.gen) || thisGen || extra.some((x) => x.gen);
    const nargs = args.length;
    const slots = args.map((a) => a.slot);
    const line = node.line;
    const isCtor = !!fi.isCtor;
    if (!anyGen) {
      const fns = args.map((a) => a.e.fn);
      return E(retT, (f) => {
        const nf = new Array(fi.frameSize);
        if (thisFn) nf[1] = thisFn(f);
        for (let i = 0; i < nargs; i++) nf[slots[i]] = fns[i](f);
        if (++rt.depth > MAX_DEPTH) { rt.depth = 0; throw new RuntimeError(`Stack overflow (too deep recursion) in '${fi.name}'`, line); }
        fi.run(nf);
        rt.depth--;
        return isCtor ? nf[1] : nf[0];
      }, false, { retRef: fi.retRef });
    }
    const gens = args.map((a) => asGen(a.e));
    const thisG = thisFn ? (thisGen ? thisFn : function* (f) { return thisFn(f); }) : null;
    return E(retT, function* (f) {
      const nf = new Array(fi.frameSize);
      if (thisG) nf[1] = yield* thisG(f);
      for (let i = 0; i < nargs; i++) nf[slots[i]] = yield* gens[i](f);
      if (++rt.depth > MAX_DEPTH) { rt.depth = 0; throw new RuntimeError(`Stack overflow (too deep recursion) in '${fi.name}'`, line); }
      if (fi.gen) yield* fi.run(nf); else fi.run(nf);
      rt.depth--;
      return isCtor ? nf[1] : nf[0];
    }, true, { retRef: fi.retRef });
  }

  compileCall(node, ctx) {
    const callee = node.callee;
    const T = this.T;
    if (callee.kind === 'Ident') {
      const name = callee.name;
      const sym = this.lookup(name, ctx);
      if (!sym) {
        if (this.natives.classes[name]) return this.compileConstruct({ kind: 'Construct', type: { name }, args: node.args, line: node.line }, ctx);
        throw this.err(`'${name}' was not declared in this scope`, callee);
      }
      if (sym.kind === 'func') {
        const fi = this.pickOverload(sym.list, node.args, ctx, node, name);
        return this.compileUserCall(fi, node.args, ctx, node);
      }
      if (sym.kind === 'method') {
        const list = sym.cls.methods.get(name);
        const fi = this.pickOverload(list, node.args, ctx, node, name);
        return this.compileUserCall(fi, node.args, ctx, node, (f) => f[1]);
      }
      if (sym.kind === 'native') return this.compileNativeCall(sym.meta, node.args, ctx, node, name);
      // call through a function variable
      const fe = this.compileExpr(callee, ctx);
      const args = node.args.map((a) => this.compileExpr(a, ctx));
      const rt = this.rt;
      const F = asGen(fe), A = args.map(asGen);
      return E(T.any, function* (f) {
        const fn = yield* F(f);
        const vals = [];
        for (const a of A) vals.push(yield* a(f));
        return yield* rt.callDynamic(fn, vals);
      }, true);
    }
    if (callee.kind === 'Member') return this.compileMethodCall(node, ctx);
    // (*fp)(args) or other expressions
    const fe = this.compileExpr(callee.kind === 'Deref' ? callee.arg : callee, ctx);
    const args = node.args.map((a) => this.compileExpr(a, ctx));
    const rt = this.rt;
    const F = asGen(fe), A = args.map(asGen);
    return E(T.any, function* (f) {
      const fn = yield* F(f);
      const vals = [];
      for (const a of A) vals.push(yield* a(f));
      return yield* rt.callDynamic(fn, vals);
    }, true);
  }

  /** Converts an argument for a native (JS) function according to a spec. */
  compileNativeArg(e, spec, node) {
    switch (spec) {
      case 'str': {
        if (e.t.k === 'int' && !e.t.isChar) return this.mapE(e, this.T.cstr, (v) => String(v));
        const toS = this.toJsStringFn(e.t, node);
        return this.mapE(e, this.T.cstr, toS);
      }
      case 'raw': return e;
      case 'any': return e.t.k === 'int' && e.t.isBool && !e.gen ? this.mapE(e, e.t, (v) => !!v) : e;
      case 'ref': return e;
      default:
        if (e.t.k === 'String') return this.mapE(e, e.t, (v) => v.s);
        if (e.t.k === 'arr' && e.t.of.k === 'int' && e.t.of.bits === 8 && spec !== 'arr') return e;
        return e;
    }
  }

  compileNativeCall(meta, argNodes, ctx, node, name, thisE = null) {
    const T = this.T;
    const rt = this.rt;
    let args;
    let retT = this.retType(meta.ret, argNodes, ctx, node);
    const minArgs = meta.min !== undefined ? meta.min : undefined;
    if (minArgs !== undefined && argNodes.length < minArgs) throw this.err(`too few arguments to function '${name}'`, node);
    if (meta.max !== undefined && argNodes.length > meta.max) throw this.err(`too many arguments to function '${name}'`, node);
    if (meta.print) {
      // print(value [, format]) -> impl(value, kind, format)
      if (argNodes.length === 0) {
        args = [E(T.any, () => undefined), E(T.int, () => -1)];
      } else {
        const p = this.printable(this.compileExpr(argNodes[0], ctx), argNodes[0]);
        args = [p.e, E(T.int, () => p.kind, false, { cst: p.kind })];
        if (argNodes[1]) args.push(this.compileExpr(argNodes[1], ctx));
      }
    } else if (meta.printf) {
      args = argNodes.map((a, i) => {
        const e = this.compileExpr(a, ctx);
        if (i < meta.printf) return this.compileNativeArg(e, meta.args ? meta.args[i] : undefined, a);
        if (e.t.k === 'String' || e.t.k === 'arr' || e.t.k === 'ptr') return this.mapE(e, T.cstr, (v) => (typeof v === 'number' ? v : cstr(v)));
        return e;
      });
    } else if (meta.lvalueArgs) {
      args = argNodes.map((a, i) => {
        if (meta.lvalueArgs.includes(i)) {
          const lv = this.compileLValue(a.kind === 'AddrOf' ? a.arg : a, ctx);
          return lv.gen ? E(lv.t, lv.loc, true) : E(lv.t, lv.ref);
        }
        return this.compileNativeArg(this.compileExpr(a, ctx), meta.args ? meta.args[i] : undefined, a);
      });
    } else {
      args = argNodes.map((a, i) => {
        const e = this.compileExpr(a, ctx);
        if (meta.typed) return E(e.t, e.fn, e.gen, { ...e });
        return this.compileNativeArg(e, meta.args ? meta.args[i] : undefined, a);
      });
    }
    if (meta.typed) {
      const types = args.map((a) => a.t);
      if (meta.fnWithThis) { const fw0 = meta.fnWithThis; meta = { ...meta, fnWithThis: (o, ...vals) => fw0(o, types, ...vals) }; }
      else { const impl0 = meta.fn; meta = { ...meta, fn: (...vals) => impl0(types, ...vals) }; }
    }
    if (meta.compile) {
      // compile-time specialisation hook: returns E
      return meta.compile(this, args, node, retT, thisE);
    }
    const impl = meta.fn;
    const line = node.line;
    const cost = (meta.cost || 0) / (meta.costFixed ? 1 : 1);
    const isGen = !!meta.gen;
    const wrapRet = retT.k === 'int' || retT.k === 'float' ? coercer(retT) : null;
    const anyArgGen = args.some((a) => a.gen) || (thisE && thisE.gen);
    const nargs = args.length;
    if (!isGen && !anyArgGen) {
      const fns = args.map((a) => a.fn);
      const call = thisE ? (() => {
        const O = thisE.fn, mname = meta.method || name;
        if (meta.fnWithThis) {
          const fw = meta.fnWithThis;
          switch (nargs) {
            case 0: return (f) => fw(O(f));
            case 1: { const a0 = fns[0]; return (f) => fw(O(f), a0(f)); }
            default: return (f) => fw(O(f), ...fns.map((fn) => fn(f)));
          }
        }
        switch (nargs) {
          case 0: return (f) => O(f)[mname]();
          case 1: { const a0 = fns[0]; return (f) => O(f)[mname](a0(f)); }
          case 2: { const a0 = fns[0], a1 = fns[1]; return (f) => O(f)[mname](a0(f), a1(f)); }
          case 3: { const a0 = fns[0], a1 = fns[1], a2 = fns[2]; return (f) => O(f)[mname](a0(f), a1(f), a2(f)); }
          default: return (f) => { const o = O(f); return o[mname](...fns.map((fn) => fn(f))); };
        }
      })() : (() => {
        switch (nargs) {
          case 0: return () => impl();
          case 1: { const a0 = fns[0]; return (f) => impl(a0(f)); }
          case 2: { const a0 = fns[0], a1 = fns[1]; return (f) => impl(a0(f), a1(f)); }
          case 3: { const a0 = fns[0], a1 = fns[1], a2 = fns[2]; return (f) => impl(a0(f), a1(f), a2(f)); }
          default: return (f) => impl(...fns.map((fn) => fn(f)));
        }
      })();
      const fin = wrapRet ? (f) => wrapRet(call(f)) : call;
      if (cost) return E(retT, (f) => { rt.t += cost; return fin(f); }, false, { native: true });
      return E(retT, (f) => { const v = fin(f); return v; }, false, { native: true, line });
    }
    const gens = args.map(asGen);
    const O = thisE ? asGen(thisE) : null;
    const mname = meta.method || name;
    const fw = meta.fnWithThis;
    return E(retT, function* (f) {
      const o = O ? yield* O(f) : null;
      const vals = new Array(nargs);
      for (let i = 0; i < nargs; i++) vals[i] = yield* gens[i](f);
      if (cost) rt.t += cost;
      let r;
      if (O) r = fw ? fw(o, ...vals) : o[mname](...vals);
      else r = impl(...vals);
      if (isGen && r && typeof r.next === 'function') r = yield* r;
      return wrapRet ? wrapRet(r) : r;
    }, true, { native: true });
  }

  retType(spec, argNodes, ctx, node) {
    const T = this.T;
    if (!spec) return T.void;
    if (typeof spec === 'object') return spec;
    if (spec === 'auto' || spec === 'arg0' || spec === 'common') {
      const types = argNodes.map((a) => this.peekType(a, ctx)).filter(Boolean);
      if (!types.length) return T.int;
      if (spec === 'arg0') return types[0].k === 'int' ? promote(types[0], T) : types[0];
      let t = types[0];
      for (const x of types.slice(1)) t = commonType(t, x, T);
      return t.k === 'int' ? promote(t, T) : t;
    }
    if (spec === 'cstr') return T.cstr;
    if (spec === 'self') return T.any;
    if (T[spec]) return T[spec];
    if (this.natives.classes[spec]) return { k: 'obj', name: spec, cls: this.natives.classes[spec] };
    return T.any;
  }

  compileMethodCall(node, ctx) {
    const m = node.callee;
    const name = m.name;
    const T = this.T;
    // this->method(...)
    if (m.obj.kind === 'Ident' && m.obj.name === 'this') {
      if (!ctx.cls) throw this.err("invalid use of 'this'", node);
      const list = ctx.cls.methods.get(name);
      if (!list) throw this.err(`'${ctx.cls.name}' has no member named '${name}'`, node);
      const fi = this.pickOverload(list, node.args, ctx, node, name);
      return this.compileUserCall(fi, node.args, ctx, node, (f) => f[1]);
    }
    // Class::staticMethod or enum access handled elsewhere
    let oe;
    if (m.obj.kind === 'Ident' && !this.lookup(m.obj.name, ctx) && this.structs.has(m.obj.name)) {
      throw this.err(`cannot call member function without object`, node);
    }
    oe = this.compileExpr(m.obj, ctx);
    let ot = oe.t;
    if (m.arrow) {
      if (ot.k === 'ptr') { ot = ot.to; oe = this.mapE(oe, ot, derefObj); }
      else if (ot.k !== 'any') throw this.err(`base operand of '->' has non-pointer type '${typeName(ot)}'`, node);
    }
    if (ot.k === 'ptr' && (ot.to.k === 'obj' || ot.to.k === 'struct') && !m.arrow) {
      throw this.err(`request for member '${name}' in '${typeName(ot)}', which is of pointer type (maybe you meant to use '->' ?)`, node);
    }
    if (ot.k === 'String') return this.compileStringMethod(oe, name, node, ctx);
    if (ot.k === 'struct') {
      const list = ot.cls.methods.get(name);
      if (!list) throw this.err(`'${ot.cls.name}' has no member named '${name}'`, node);
      const fi = this.pickOverload(list, node.args, ctx, node, name);
      if (oe.gen) return this.compileUserCall(fi, node.args, ctx, node, oe.fn, true);
      return this.compileUserCall(fi, node.args, ctx, node, oe.fn);
    }
    if (ot.k === 'obj') {
      const cls = ot.cls;
      const meta = cls.methods[name];
      if (!meta) {
        if (cls.anyMethod) return this.compileNativeCall({ ret: 'any', method: name }, node.args, ctx, node, name, oe);
        throw this.err(`'class ${cls.name}' has no member named '${name}'`, node);
      }
      return this.compileNativeCall({ ...meta, method: meta.method || name }, node.args, ctx, node, name, oe);
    }
    if (ot.k === 'any') {
      return this.compileNativeCall({ ret: 'any', method: name }, node.args, ctx, node, name, oe);
    }
    if (ot.k === 'arr' || (ot.k === 'ptr' && ot.to && ot.to.bits === 8)) {
      throw this.err(`request for member '${name}' in '${typeName(ot)}', which is of non-class type (char arrays are not Strings)`, node);
    }
    throw this.err(`request for member '${name}' in non-class type '${typeName(ot)}'`, node);
  }

  compileStringMethod(oe, name, node, ctx) {
    const meta = STRING_METHODS[name];
    if (!meta) throw this.err(`'class String' has no member named '${name}'`, node);
    const T = this.T;
    const args = node.args.map((a, i) => {
      const e = this.compileExpr(a, ctx);
      const spec = meta.args ? meta.args[i] : 'num';
      if (spec === 'str') return this.mapE(e, T.cstr, this.toJsStringFn(e.t, a));
      if (spec === 'buf') return e;
      if (e.t.k === 'String') return this.mapE(e, T.cstr, (v) => v.s);
      if (e.t.k === 'arr' || e.t.k === 'ptr') return this.mapE(e, T.cstr, cstr);
      return e;
    });
    if (meta.min !== undefined && args.length < meta.min) throw this.err(`no matching function for call to 'String::${name}()'`, node);
    const retT = meta.ret === 'String' ? T.String : (T[meta.ret] || T.void);
    const impl = meta.fn;
    if (!oe.gen && !args.some((a) => a.gen)) {
      const O = oe.fn, fns = args.map((a) => a.fn);
      switch (fns.length) {
        case 0: return E(retT, (f) => impl(O(f)), false, { fresh: true });
        case 1: { const a0 = fns[0]; return E(retT, (f) => impl(O(f), a0(f)), false, { fresh: true }); }
        case 2: { const a0 = fns[0], a1 = fns[1]; return E(retT, (f) => impl(O(f), a0(f), a1(f)), false, { fresh: true }); }
        default: return E(retT, (f) => impl(O(f), ...fns.map((fn) => fn(f))), false, { fresh: true });
      }
    }
    const O = asGen(oe), gens = args.map(asGen);
    return E(retT, function* (f) {
      const o = yield* O(f);
      const vals = [];
      for (const g of gens) vals.push(yield* g(f));
      return impl(o, ...vals);
    }, true, { fresh: true });
  }
}

// ------------------------------------------------------------------ pointer helpers
export function ptrAdd(p, n) {
  if (p === null || p === undefined) return new Ptr([], n);
  if (typeof p === 'string') return new Ptr(p, n);
  if (Array.isArray(p)) return new Ptr(p, n);
  if (p instanceof Ptr) return new Ptr(p.a, p.i + n);
  if (p instanceof Ref) return p; // pointer to scalar: no arithmetic
  return p;
}

export function ptrIndex(p) {
  if (p instanceof Ptr) return p.i;
  return 0;
}

export function ptrGet(p, rt) {
  if (p instanceof Ptr) {
    const a = p.a, i = p.i;
    if (typeof a === 'string') return i < a.length ? a.charCodeAt(i) : 0;
    if (i >= 0 && i < a.length) return a[i];
    return 0;
  }
  if (p instanceof Ref) return p.get();
  if (typeof p === 'string') return p.length ? p.charCodeAt(0) : 0;
  if (Array.isArray(p)) return p.length ? p[0] : 0;
  if (p === null || p === undefined) throw new RuntimeError('Null pointer dereference', rt ? rt.line : 0);
  return p;
}

export function ptrSet(p, v, rt) {
  if (p instanceof Ptr) {
    if (typeof p.a === 'string') throw new RuntimeError('Cannot modify a string literal', rt ? rt.line : 0);
    p.a[p.i] = v;
    return;
  }
  if (p instanceof Ref) { p.set(v); return; }
  if (Array.isArray(p)) { p[0] = v; return; }
  throw new RuntimeError('Invalid pointer write', rt ? rt.line : 0);
}

export function ptrRef(p, rt) {
  if (p instanceof Ref) return p;
  return new Ref(() => ptrGet(p, rt), (v) => ptrSet(p, v, rt));
}

export function derefObj(p) {
  if (p instanceof Ptr) return p.a[p.i];
  if (p instanceof Ref) return p.get();
  return p;
}

function elemGet(a, i, rt) {
  if (Array.isArray(a)) {
    if (i >= 0 && i < a.length) return a[i];
    rt.warnOnce('oob:' + rt.line, `Array index ${i} is out of bounds (size ${a.length}) at line ${rt.line}`);
    return 0;
  }
  if (a instanceof Ptr) return elemGet(a.a, a.i + i, rt);
  if (typeof a === 'string') return i < a.length ? a.charCodeAt(i) : 0;
  if (a instanceof AStr) return i < a.s.length ? a.s.charCodeAt(i) : 0;
  if (a instanceof Ref) return i === 0 ? a.get() : 0;
  if (a && typeof a === 'object' && typeof a.at === 'function') return a.at(i);
  if (a === null || a === undefined) throw new RuntimeError('Null pointer dereference', rt.line);
  return 0;
}

function elemSet(a, i, v, rt) {
  if (Array.isArray(a)) {
    if (i >= 0 && i < a.length) { a[i] = v; return; }
    rt.warnOnce('oob:' + rt.line, `Array index ${i} is out of bounds (size ${a.length}) at line ${rt.line}`);
    return;
  }
  if (a instanceof Ptr) { elemSet(a.a, a.i + i, v, rt); return; }
  if (a instanceof Ref && i === 0) { a.set(v); return; }
  if (typeof a === 'string') throw new RuntimeError('Cannot modify a string literal', rt.line);
  if (a && typeof a === 'object' && typeof a.setAt === 'function') { a.setAt(i, v); return; }
  throw new RuntimeError('Invalid array write', rt.line);
}

function elemRef(a, i, rt) {
  if (a instanceof Ptr) return elemRef(a.a, a.i + i, rt);
  return new Ref(() => elemGet(a, i, rt), (v) => elemSet(a, i, v, rt));
}

// ------------------------------------------------------------------ public API
export function compileSketch(src, opts) {
  const { tokens, includes } = preprocess(src, opts.macros || {});
  const ast = parse(tokens, { classNames: Object.keys(opts.natives.classes) });
  const c = new Compiler(opts);
  const prog = c.compileProgram(ast);
  prog.includes = includes;
  prog.T = c.T;
  return prog;
}
