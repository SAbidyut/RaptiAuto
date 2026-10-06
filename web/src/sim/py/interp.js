// Compiles the Python AST into JS closures. Expressions and statements are either plain functions (`gen: false`) or
// generator functions (`gen: true`) — only the latter can suspend (time.sleep, busy loops, calls into user code).
import {
  hooks, Fl, mkf, isNum, isFloat, toNum, tuple, isTuple, PyDict, PySet, PyRange, PyBytes, PyIter, PyClass, PyInstance, PyFunc, BoundMethod, NativeFn,
  NativeClass, NativeObj, PyModule, PyError, EXC, newExc, pyErr, isExc, truthy, pyEq, pyCompare, pyStr, pyRepr, binop, contains, iterate, toList, toInt,
  formatSpec, typeName, pyLen,
} from './values.js';
import { builtinMethod } from './methods.js';
import { PySyntaxError } from './lexer.js';

export const RET = { ret: 1 }, BRK = { brk: 1 }, CNT = { cnt: 1 };
const EMPTY = Object.freeze({});
const LOOP_COST = 14; // virtual µs charged per loop iteration / call (MicroPython is not fast)
const MAX_DEPTH = 120;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

class Frame {
  constructor(up) { this.vars = Object.create(null); this.up = up; this.ret = null; this.fn = null; }
}
class PySlice { constructor(lo, hi, step) { this.lo = lo; this.hi = hi; this.step = step; } }
class PyProperty { constructor(fget, fset) { this.fget = fget; this.fset = fset; } }
class StaticMethod { constructor(fn) { this.fn = fn; } }
class ClassMethod { constructor(fn) { this.fn = fn; } }
class SuperProxy { constructor(inst, home) { this.inst = inst; this.home = home; } }
export { PySlice, PyProperty, StaticMethod, ClassMethod, Frame };

// ------------------------------------------------------------------ scopes
class Scope {
  constructor(kind, parent) {
    this.kind = kind; this.parent = parent;
    this.locals = new Set(); this.globals = new Set(); this.nonlocals = new Set();
  }
}

function addTarget(scope, t) {
  switch (t.k) {
    case 'Name': scope.locals.add(t.id); break;
    case 'Tuple': case 'List': t.elts.forEach((x) => addTarget(scope, x)); break;
    case 'Starred': addTarget(scope, t.x); break;
    default: break;
  }
}

function collect(scope, stmts) {
  for (const s of stmts) {
    switch (s.k) {
      case 'Assign': s.targets.forEach((t) => addTarget(scope, t)); break;
      case 'AugAssign': addTarget(scope, s.target); break;
      case 'For': addTarget(scope, s.target); collect(scope, s.body); collect(scope, s.orelse); break;
      case 'While': case 'If': collect(scope, s.body); collect(scope, s.orelse); break;
      case 'Try': collect(scope, s.body); s.handlers.forEach((h) => { if (h.name) scope.locals.add(h.name); collect(scope, h.body); }); collect(scope, s.orelse); collect(scope, s.final); break;
      case 'With': s.items.forEach((i) => { if (i.target) addTarget(scope, i.target); }); collect(scope, s.body); break;
      case 'FuncDef': case 'ClassDef': scope.locals.add(s.name); break;
      case 'Import': s.names.forEach(([d, a]) => scope.locals.add(a || d.split('.')[0])); break;
      case 'ImportFrom': s.names.forEach(([n, a]) => { if (n !== '*') scope.locals.add(a || n); }); break;
      case 'Global': s.names.forEach((n) => scope.globals.add(n)); break;
      case 'Nonlocal': s.names.forEach((n) => scope.nonlocals.add(n)); break;
      case 'Del': s.targets.forEach((t) => addTarget(scope, t)); break;
      default: break;
    }
  }
  for (const n of scope.globals) scope.locals.delete(n);
  for (const n of scope.nonlocals) scope.locals.delete(n);
}

function resolve(scope, name) {
  if (scope.kind === 'module' || scope.globals.has(name)) return { k: 'g' };
  if (scope.locals.has(name)) return { k: 'l', d: 0 };
  let d = 1, s = scope.parent;
  while (s) {
    if (s.kind === 'module' || s.globals.has(name)) return { k: 'g' };
    if (s.locals.has(name)) return { k: 'l', d };
    s = s.parent; d++;
  }
  return { k: 'g' };
}
const nearestNonClass = (s) => { while (s && s.kind === 'class') s = s.parent; return s; };

const S = (fn) => ({ fn, gen: false });
const G = (fn) => ({ fn, gen: true });
const ev = function* (c, f) { return c.gen ? yield* c.fn(f) : c.fn(f); };
void ev;

export class Interp {
  /** env: { rt, builtins: {name: value}, importModule(name), now() } */
  constructor(env) {
    this.env = env;
    this.rt = env.rt;
    this.builtins = env.builtins;
    this.G = new Frame(null);
    this.depth = 0;
    this.syncDepth = 0;
    this.ops = 0;
    this.excStack = [];
    hooks.callSync = (fn, args, kw) => this.callSync(fn, args, kw);
    hooks.getAttr = (o, n) => this.getAttr(o, n);
    hooks.getItem = (o, k) => this.getItem(o, k);
  }

  // ================================================================== object protocol
  err(name, msg) { return pyErr(name, msg); }

  getAttr(o, name) {
    if (o instanceof PyInstance) {
      const v = o.attrs[name];
      if (v !== undefined) return v;
      const c = o.cls.lookup(name);
      if (c !== undefined) return this.bindAttr(o, c);
      if (name === '__class__') return o.cls;
      if (name === '__dict__') { const d = new PyDict(); for (const k of Object.keys(o.attrs)) d.set(k, o.attrs[k]); return d; }
      const ga = o.cls.lookup('__getattr__');
      if (ga) return this.callSync(ga, [o, name]);
      throw pyErr('AttributeError', `'${o.cls.name}' object has no attribute '${name}'`);
    }
    if (o instanceof PyModule) {
      if (name in o.attrs) return o.attrs[name];
      if (name === '__name__') return o.name;
      throw pyErr('AttributeError', `'module' object has no attribute '${name}'`);
    }
    if (o instanceof NativeObj) {
      const v = o.getAttr(name, this);
      if (v !== undefined) return v;
      throw pyErr('AttributeError', `'${o.typeName || 'object'}' object has no attribute '${name}'`);
    }
    if (o instanceof PyClass) {
      if (name === '__name__') return o.name;
      const c = o.lookup(name);
      if (c !== undefined) {
        if (c instanceof StaticMethod) return c.fn;
        if (c instanceof ClassMethod) return new BoundMethod(o, c.fn);
        return c;
      }
      throw pyErr('AttributeError', `type object '${o.name}' has no attribute '${name}'`);
    }
    if (o instanceof NativeClass) {
      if (name in o.attrs) return o.attrs[name];
      if (name === '__name__') return o.name;
      throw pyErr('AttributeError', `type object '${o.name}' has no attribute '${name}'`);
    }
    if (o instanceof SuperProxy) {
      const mro = o.inst.cls.mro;
      for (let i = mro.indexOf(o.home) + 1; i < mro.length; i++) {
        if (name in mro[i].attrs) return this.bindAttr(o.inst, mro[i].attrs[name]);
      }
      throw pyErr('AttributeError', `'super' object has no attribute '${name}'`);
    }
    if (o instanceof PyProperty && name === 'setter') return new NativeFn('setter', (a) => new PyProperty(o.fget, a[0]));
    const bm = builtinMethod(o, name);
    if (bm) return new NativeFn(name, (a, kw) => bm(o, a, kw || EMPTY));
    if ((o instanceof PyFunc || o instanceof NativeFn) && name === '__name__') return o.name;
    if (o instanceof BoundMethod && name === '__name__') return o.fn.name;
    if (isNum(o) && (name === 'real' || name === 'imag')) return name === 'real' ? o : 0;
    throw pyErr('AttributeError', `'${typeName(o)}' object has no attribute '${name}'`);
  }

  bindAttr(inst, c) {
    if (c instanceof PyFunc) return new BoundMethod(inst, c);
    if (c instanceof PyProperty) return this.callSync(c.fget, [inst]);
    if (c instanceof StaticMethod) return c.fn;
    if (c instanceof ClassMethod) return new BoundMethod(inst.cls, c.fn);
    if (c instanceof NativeFn) return new BoundMethod(inst, c);
    return c;
  }

  setAttr(o, name, v) {
    if (o instanceof PyInstance) {
      const c = o.cls.lookup(name);
      if (c instanceof PyProperty) {
        if (!c.fset) throw pyErr('AttributeError', "can't set attribute");
        this.callSync(c.fset, [o, v]);
        return;
      }
      o.attrs[name] = v;
      return;
    }
    if (o instanceof NativeObj && o.setAttr(name, v, this)) return;
    if (o instanceof PyClass) { o.attrs[name] = v; return; }
    if (o instanceof PyModule) { o.attrs[name] = v; return; }
    throw pyErr('AttributeError', `'${typeName(o)}' object has no attribute '${name}'`);
  }

  getItem(o, k) {
    if (Array.isArray(o)) {
      if (k instanceof PySlice) { const r = sliceSeq(o, k); if (o.isTuple) r.isTuple = true; return r; }
      const n = toInt(k, 'list indices must be integers, not ' + typeName(k) + '; an integer');
      const i = n < 0 ? n + o.length : n;
      if (i < 0 || i >= o.length) throw pyErr('IndexError', (o.isTuple ? 'tuple' : 'list') + ' index out of range');
      return o[i];
    }
    if (typeof o === 'string') {
      if (k instanceof PySlice) return sliceSeq([...o], k).join('');
      const chars = o.length === [...o].length ? null : [...o];
      const len = chars ? chars.length : o.length;
      const n = toInt(k, 'string indices must be integers');
      const i = n < 0 ? n + len : n;
      if (i < 0 || i >= len) throw pyErr('IndexError', 'string index out of range');
      return chars ? chars[i] : o[i];
    }
    if (o instanceof PyDict) {
      const v = o.get(k);
      if (v === undefined) throw pyErr('KeyError', k);
      return v;
    }
    if (o instanceof PyRange) {
      if (k instanceof PySlice) return sliceSeq(toList(o), k);
      const n = toInt(k);
      const i = n < 0 ? n + o.length : n;
      if (i < 0 || i >= o.length) throw pyErr('IndexError', 'range object index out of range');
      return o.at(i);
    }
    if (o instanceof PyBytes) {
      if (k instanceof PySlice) return new PyBytes(sliceSeq(o.a, k));
      const n = toInt(k);
      const i = n < 0 ? n + o.a.length : n;
      if (i < 0 || i >= o.a.length) throw pyErr('IndexError', 'index out of range');
      return o.a[i];
    }
    if (o instanceof PyInstance) {
      const m = o.cls.lookup('__getitem__');
      if (m) return this.callSync(m, [o, k]);
    }
    if (o instanceof NativeObj && o.getItem) return o.getItem(k);
    throw pyErr('TypeError', `'${typeName(o)}' object is not subscriptable`);
  }

  setItem(o, k, v) {
    if (Array.isArray(o) && !o.isTuple) {
      if (k instanceof PySlice) {
        const { start, stop, step } = sliceBounds(o.length, k);
        const vals = toList(v);
        if (step === 1) { o.splice(start, Math.max(0, stop - start), ...vals); return; }
        const idxs = [];
        for (let i = start; step > 0 ? i < stop : i > stop; i += step) idxs.push(i);
        if (idxs.length !== vals.length) throw pyErr('ValueError', `attempt to assign sequence of size ${vals.length} to extended slice of size ${idxs.length}`);
        idxs.forEach((i, j) => { o[i] = vals[j]; });
        return;
      }
      const n = toInt(k, 'list indices must be integers');
      const i = n < 0 ? n + o.length : n;
      if (i < 0 || i >= o.length) throw pyErr('IndexError', 'list assignment index out of range');
      o[i] = v;
      return;
    }
    if (o instanceof PyDict) { o.set(k, v); return; }
    if (o instanceof PyInstance) {
      const m = o.cls.lookup('__setitem__');
      if (m) { this.callSync(m, [o, k, v]); return; }
    }
    if (o instanceof NativeObj && o.setItem) { o.setItem(k, v); return; }
    throw pyErr('TypeError', `'${typeName(o)}' object does not support item assignment`);
  }

  delItem(o, k) {
    if (Array.isArray(o) && !o.isTuple) {
      if (k instanceof PySlice) { const { start, stop } = sliceBounds(o.length, k); o.splice(start, Math.max(0, stop - start)); return; }
      const n = toInt(k);
      const i = n < 0 ? n + o.length : n;
      if (i < 0 || i >= o.length) throw pyErr('IndexError', 'list assignment index out of range');
      o.splice(i, 1);
      return;
    }
    if (o instanceof PyDict) { if (!o.delete(k)) throw pyErr('KeyError', k); return; }
    if (o instanceof PyInstance) {
      const m = o.cls.lookup('__delitem__');
      if (m) { this.callSync(m, [o, k]); return; }
    }
    throw pyErr('TypeError', `'${typeName(o)}' object doesn't support item deletion`);
  }

  // ================================================================== calls
  bind(fn, args, kw, frame) {
    const info = fn.info, params = info.params, defs = fn.defs;
    const vars = frame.vars;
    let ai = 0;
    let rest = kw && Object.keys(kw).length ? { ...kw } : null;
    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      switch (p.kind) {
        case 'pos':
          if (ai < args.length) {
            vars[p.name] = args[ai++];
            if (rest && p.name in rest) throw pyErr('TypeError', `function got multiple values for argument '${p.name}'`);
          } else if (rest && p.name in rest) { vars[p.name] = rest[p.name]; delete rest[p.name]; } else if (defs[i] !== undefined) vars[p.name] = defs[i];
          else throw pyErr('TypeError', `function missing required positional argument #${i + 1}${info.name ? ` (${p.name})` : ''}`);
          break;
        case 'varargs': vars[p.name] = tuple(args.slice(ai)); ai = args.length; break;
        case 'kwonly':
          if (rest && p.name in rest) { vars[p.name] = rest[p.name]; delete rest[p.name]; } else if (defs[i] !== undefined) vars[p.name] = defs[i];
          else throw pyErr('TypeError', `function missing required keyword-only argument '${p.name}'`);
          break;
        default: { // kwargs
          const d = new PyDict();
          if (rest) { for (const k of Object.keys(rest)) d.set(k, rest[k]); rest = null; }
          vars[p.name] = d;
        }
      }
    }
    if (ai < args.length) throw pyErr('TypeError', `function takes ${params.filter((p) => p.kind === 'pos').length} positional arguments but ${args.length} were given`);
    if (rest && Object.keys(rest).length) throw pyErr('TypeError', `function got an unexpected keyword argument '${Object.keys(rest)[0]}'`);
  }

  * callg(fn, args, kw) {
    if (fn instanceof PyFunc) return yield* this.callFunc(fn, args, kw);
    if (fn instanceof NativeFn) {
      const r = fn.fn(args, kw || EMPTY);
      return fn.gen ? yield* r : r;
    }
    if (fn instanceof BoundMethod) return yield* this.callg(fn.fn, [fn.self, ...args], kw);
    if (fn instanceof PyClass) {
      const inst = new PyInstance(fn);
      if (fn.isSub(EXC.BaseException)) inst.attrs.args = tuple(args.slice());
      const init = fn.lookup('__init__');
      if (init) {
        const r = yield* this.callg(init, [inst, ...args], kw);
        if (r !== null && r !== undefined) throw pyErr('TypeError', '__init__() should return None');
      } else if (!fn.isSub(EXC.BaseException) && (args.length || (kw && Object.keys(kw).length))) throw pyErr('TypeError', `${fn.name}() takes no arguments`);
      return inst;
    }
    if (fn instanceof NativeClass) return fn.make(args, kw || EMPTY, this);
    if (fn instanceof PyInstance) {
      const m = fn.cls.lookup('__call__');
      if (m) return yield* this.callg(m, [fn, ...args], kw);
    }
    if (fn instanceof NativeObj && fn.call) return fn.call(args, kw || EMPTY, this);
    throw pyErr('TypeError', `'${typeName(fn)}' object is not callable`);
  }

  * callFunc(fn, args, kw) {
    if (++this.depth > MAX_DEPTH) { this.depth = 0; throw pyErr('RuntimeError', 'maximum recursion depth exceeded'); }
    try {
      const frame = new Frame(fn.closure);
      frame.fn = fn;
      this.bind(fn, args, kw, frame);
      this.rt.t += LOOP_COST;
      const body = fn.info.body;
      if (fn.info.expr) return body.gen ? yield* body.fn(frame) : body.fn(frame);
      const r = body.gen ? yield* body.fn(frame) : body.fn(frame);
      return r === RET ? frame.ret : null;
    } finally {
      this.depth = Math.max(0, this.depth - 1);
    }
  }

  callSync(fn, args = [], kw) {
    if (fn instanceof NativeFn && !fn.gen) return fn.fn(args, kw || EMPTY);
    this.syncDepth++;
    try {
      const g = this.callg(fn, args, kw);
      let guard = 0;
      for (let r = g.next(); ; r = g.next()) {
        if (r.done) return r.value;
        if (++guard > 5e6) throw pyErr('RuntimeError', 'callback ran too long');
      }
    } finally {
      this.syncDepth--;
    }
  }

  /** Charges virtual time for a loop iteration; yields to the engine when needed (never inside callSync). */
  * tick() {
    const rt = this.rt;
    rt.t += LOOP_COST;
    if (this.syncDepth === 0 && (rt.t >= rt.limit || ((++this.ops & 255) === 0 && now() > rt.deadline))) yield 0;
  }

  // ================================================================== compile
  compileModule(ast) {
    const scope = new Scope('module', null);
    const body = this.block(ast, scope);
    return body;
  }

  nameLoad(scope, name) {
    const r = resolve(scope, name);
    const I = this;
    if (r.k === 'l') {
      const d = r.d;
      const unbound = () => pyErr('UnboundLocalError', `local variable '${name}' referenced before assignment`);
      if (d === 0) return S((f) => { const v = f.vars[name]; if (v === undefined) throw unbound(); return v; });
      return S((f) => { let g = f; for (let i = 0; i < d; i++) g = g.up; const v = g.vars[name]; if (v === undefined) throw pyErr('NameError', `free variable '${name}' referenced before assignment in enclosing scope`); return v; });
    }
    const Gv = this.G.vars, B = this.builtins;
    return S(() => {
      let v = Gv[name];
      if (v !== undefined) return v;
      v = B[name];
      if (v !== undefined) return v;
      throw pyErr('NameError', `name '${name}' isn't defined`);
    });
    void I;
  }

  nameStore(scope, name) {
    const r = resolve(scope, name);
    if (r.k === 'l') {
      const d = r.d;
      if (d === 0) return (f, v) => { f.vars[name] = v; };
      return (f, v) => { let g = f; for (let i = 0; i < d; i++) g = g.up; g.vars[name] = v; };
    }
    const Gv = this.G.vars;
    return (f, v) => { Gv[name] = v; };
  }

  // ------------------------------------------------------------------ expressions
  expr(n, scope) {
    const I = this;
    switch (n.k) {
      case 'Num': { const v = n.float ? mkf(n.v) : n.v; return S(() => v); }
      case 'Str': { const v = n.v; return S(() => v); }
      case 'Bytes': { const v = new PyBytes([...new TextEncoder().encode(n.v)]); return S(() => new PyBytes(v.a.slice())); }
      case 'Const': { const v = n.v; return S(() => v); }
      case 'Name': return this.nameLoad(scope, n.id);
      case 'FStr': return this.fstr(n, scope);
      case 'List': return this.display(n.elts, scope, (a) => a);
      case 'Tuple': return this.display(n.elts, scope, (a) => tuple(a));
      case 'Set': return this.display(n.elts, scope, (a) => { const s = new PySet(); a.forEach((x) => s.add(x)); return s; });
      case 'Dict': return this.dict(n, scope);
      case 'Unary': {
        const X = this.expr(n.x, scope);
        const op = n.op;
        const f1 = op === 'not' ? (x) => !truthy(x)
          : op === '-' ? (x) => { if (x instanceof Fl) return new Fl(-x.v); if (typeof x === 'boolean') return x ? -1 : 0; if (typeof x === 'number') return x === 0 ? (Number.isInteger(x) ? 0 : x) : -x; if (x instanceof PyInstance) { const m = x.cls.lookup('__neg__'); if (m) return I.callSync(m, [x]); } throw pyErr('TypeError', `unsupported operand type for unary -: '${typeName(x)}'`); }
            : op === '+' ? (x) => { if (!isNum(x)) throw pyErr('TypeError', `unsupported operand type for unary +: '${typeName(x)}'`); return typeof x === 'boolean' ? +x : x; }
              : (x) => { if (!isNum(x) || isFloat(x)) throw pyErr('TypeError', `unsupported operand type for ~: '${typeName(x)}'`); return -toNum(x) - 1; };
        if (!X.gen) { const a = X.fn; return S((f) => f1(a(f))); }
        return G(function* (f) { return f1(yield* X.fn(f)); });
      }
      case 'Bin': {
        const op = n.op;
        return this.combine2(this.expr(n.l, scope), this.expr(n.r, scope), (a, b) => binop(op, a, b));
      }
      case 'BoolOp': return this.boolop(n, scope);
      case 'Cmp': return this.cmp(n, scope);
      case 'IfExp': {
        const T = this.expr(n.test, scope), A = this.expr(n.body, scope), B = this.expr(n.orelse, scope);
        if (!T.gen && !A.gen && !B.gen) return S((f) => (truthy(T.fn(f)) ? A.fn(f) : B.fn(f)));
        return G(function* (f) {
          const t = T.gen ? yield* T.fn(f) : T.fn(f);
          const C = truthy(t) ? A : B;
          return C.gen ? yield* C.fn(f) : C.fn(f);
        });
      }
      case 'Attr': {
        const O = this.expr(n.obj, scope), name = n.name;
        if (!O.gen) { const o = O.fn; return S((f) => I.getAttr(o(f), name)); }
        return G(function* (f) { return I.getAttr(yield* O.fn(f), name); });
      }
      case 'Sub': return this.combine2(this.expr(n.obj, scope), this.subIndex(n.idx, scope), (o, k) => I.getItem(o, k));
      case 'Slice': throw new PySyntaxError('invalid slice', n.line);
      case 'Call': return this.call(n, scope);
      case 'Lambda': return this.lambda(n, scope);
      case 'ListComp': case 'SetComp': case 'GenExp': case 'DictComp': return this.comp(n, scope);
      case 'Starred': throw new PySyntaxError("can't use starred expression here", n.line);
      default: throw new PySyntaxError('unsupported expression: ' + n.k, n.line);
    }
  }

  subIndex(idx, scope) {
    if (idx.k === 'Slice') {
      const parts = [idx.lo, idx.hi, idx.step].map((p) => (p ? this.expr(p, scope) : S(() => null)));
      return this.combineN(parts, (a) => new PySlice(a[0], a[1], a[2]));
    }
    return this.expr(idx, scope);
  }

  combine2(A, B, op) {
    if (!A.gen && !B.gen) { const a = A.fn, b = B.fn; return S((f) => op(a(f), b(f))); }
    return G(function* (f) {
      const x = A.gen ? yield* A.fn(f) : A.fn(f);
      const y = B.gen ? yield* B.fn(f) : B.fn(f);
      return op(x, y);
    });
  }

  combineN(list, op) {
    if (list.every((c) => !c.gen)) { const fns = list.map((c) => c.fn); return S((f) => op(fns.map((g) => g(f)))); }
    return G(function* (f) {
      const vals = [];
      for (const c of list) vals.push(c.gen ? yield* c.fn(f) : c.fn(f));
      return op(vals);
    });
  }

  /** list / tuple / set displays with `*x` unpacking. */
  display(elts, scope, make) {
    const cs = elts.map((e) => (e.k === 'Starred' ? { star: true, c: this.expr(e.x, scope) } : { star: false, c: this.expr(e, scope) }));
    const anyStar = cs.some((x) => x.star);
    const allSync = cs.every((x) => !x.c.gen);
    if (allSync && !anyStar) { const fns = cs.map((x) => x.c.fn); return S((f) => make(fns.map((g) => g(f)))); }
    if (allSync) {
      return S((f) => { const out = []; for (const x of cs) { const v = x.c.fn(f); if (x.star) out.push(...toList(v)); else out.push(v); } return make(out); });
    }
    return G(function* (f) {
      const out = [];
      for (const x of cs) {
        const v = x.c.gen ? yield* x.c.fn(f) : x.c.fn(f);
        if (x.star) out.push(...toList(v)); else out.push(v);
      }
      return make(out);
    });
  }

  dict(n, scope) {
    const ks = n.keys.map((k) => (k ? this.expr(k, scope) : null));
    const vs = n.values.map((v) => this.expr(v, scope));
    const all = [...ks, ...vs].filter(Boolean);
    const run = (f, get) => {
      const d = new PyDict();
      for (let i = 0; i < ks.length; i++) {
        if (ks[i] === null) { const o = get(vs[i], f); if (o instanceof PyDict) o.items().forEach(([k, v]) => d.set(k, v)); else throw pyErr('TypeError', 'argument after ** must be a mapping'); } else d.set(get(ks[i], f), get(vs[i], f));
      }
      return d;
    };
    if (all.every((c) => !c.gen)) return S((f) => run(f, (c, fr) => c.fn(fr)));
    return G(function* (f) {
      const d = new PyDict();
      for (let i = 0; i < ks.length; i++) {
        if (ks[i] === null) { const o = vs[i].gen ? yield* vs[i].fn(f) : vs[i].fn(f); o.items().forEach(([k, v]) => d.set(k, v)); } else {
          const k = ks[i].gen ? yield* ks[i].fn(f) : ks[i].fn(f);
          const v = vs[i].gen ? yield* vs[i].fn(f) : vs[i].fn(f);
          d.set(k, v);
        }
      }
      return d;
    });
  }

  boolop(n, scope) {
    const cs = n.vals.map((v) => this.expr(v, scope));
    const isAnd = n.op === 'and';
    if (cs.every((c) => !c.gen)) {
      const fns = cs.map((c) => c.fn);
      return S((f) => {
        let v;
        for (let i = 0; i < fns.length; i++) { v = fns[i](f); if (isAnd ? !truthy(v) : truthy(v)) return v; }
        return v;
      });
    }
    return G(function* (f) {
      let v;
      for (const c of cs) { v = c.gen ? yield* c.fn(f) : c.fn(f); if (isAnd ? !truthy(v) : truthy(v)) return v; }
      return v;
    });
  }

  cmp(n, scope) {
    const L = this.expr(n.left, scope);
    const Rs = n.rights.map((r) => this.expr(r, scope));
    const ops = n.ops.map(cmpFn);
    if (ops.length === 1) return this.combine2(L, Rs[0], ops[0]);
    const all = [L, ...Rs];
    if (all.every((c) => !c.gen)) {
      return S((f) => {
        let a = L.fn(f);
        for (let i = 0; i < ops.length; i++) { const b = Rs[i].fn(f); if (!ops[i](a, b)) return false; a = b; }
        return true;
      });
    }
    return G(function* (f) {
      let a = L.gen ? yield* L.fn(f) : L.fn(f);
      for (let i = 0; i < ops.length; i++) {
        const c = Rs[i];
        const b = c.gen ? yield* c.fn(f) : c.fn(f);
        if (!ops[i](a, b)) return false;
        a = b;
      }
      return true;
    });
  }

  fstr(n, scope) {
    const I = this;
    const parts = [];
    for (const p of n.parts) {
      if (typeof p === 'string') { parts.push({ lit: p }); continue; }
      if (p.self) parts.push({ lit: p.self });
      const c = this.expr(p.expr, scope);
      let spec = null;
      if (p.spec && p.spec.includes('{')) spec = this.fstr({ parts: specParts(p.spec, p.line) }, scope);
      parts.push({ c, spec: spec || (p.spec ? S(() => p.spec) : null), conv: p.conv || (p.self && !p.spec ? 'r' : '') });
    }
    const fmt = (v, spec, conv) => {
      if (conv === 'r') v = pyRepr(v); else if (conv === 's') v = pyStr(v);
      return spec ? formatSpec(v, spec) : pyStr(v);
    };
    const need = parts.some((p) => (p.c && p.c.gen) || (p.spec && p.spec.gen));
    if (!need) {
      return S((f) => {
        let out = '';
        for (const p of parts) out += p.lit !== undefined ? p.lit : fmt(p.c.fn(f), p.spec ? p.spec.fn(f) : '', p.conv);
        return out;
      });
    }
    return G(function* (f) {
      let out = '';
      for (const p of parts) {
        if (p.lit !== undefined) { out += p.lit; continue; }
        const v = p.c.gen ? yield* p.c.fn(f) : p.c.fn(f);
        const sp = p.spec ? (p.spec.gen ? yield* p.spec.fn(f) : p.spec.fn(f)) : '';
        out += fmt(v, sp, p.conv);
      }
      return out;
    });
    void I;
  }

  // ------------------------------------------------------------------ calls
  /** Argument list compiled to a function (f) -> [args, kw] (sync) or generator. */
  compileArgs(args, scope) {
    const items = args.map((a) => ({ ...a, c: this.expr(a.expr, scope) }));
    const simple = items.every((a) => !a.star && !a.dstar && !a.name && !a.c.gen);
    if (simple) {
      const fns = items.map((a) => a.c.fn);
      const n = fns.length;
      if (n === 0) return { gen: false, fn: () => [[], null] };
      if (n === 1) { const a0 = fns[0]; return { gen: false, fn: (f) => [[a0(f)], null] }; }
      return { gen: false, fn: (f) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = fns[i](f); return [a, null]; } };
    }
    const fill = (st, a, v, kw) => {
      if (a.star) st.args.push(...toList(v));
      else if (a.dstar) { if (!(v instanceof PyDict)) throw pyErr('TypeError', 'argument after ** must be a mapping'); st.kw = st.kw || {}; v.items().forEach(([k, x]) => { st.kw[k] = x; }); } else if (a.name) { st.kw = st.kw || {}; st.kw[a.name] = v; } else st.args.push(v);
      void kw;
    };
    if (items.every((a) => !a.c.gen)) {
      return { gen: false, fn: (f) => { const st = { args: [], kw: null }; for (const a of items) fill(st, a, a.c.fn(f)); return [st.args, st.kw]; } };
    }
    return {
      gen: true,
      fn: function* (f) {
        const st = { args: [], kw: null };
        for (const a of items) fill(st, a, a.c.gen ? yield* a.c.fn(f) : a.c.fn(f));
        return [st.args, st.kw];
      },
    };
  }

  call(n, scope) {
    const I = this;
    const A = this.compileArgs(n.args, scope);
    // super() / super(...)
    if (n.fn.k === 'Name' && n.fn.id === 'super' && !n.args.length) {
      return S((f) => {
        let g = f;
        while (g && !g.fn) g = g.up;
        const fn = g && g.fn;
        if (!fn || !fn.home) throw pyErr('RuntimeError', 'super(): no arguments');
        const selfName = fn.info.params[0] && fn.info.params[0].name;
        return new SuperProxy(g.vars[selfName], fn.home);
      });
    }
    if (n.fn.k === 'Attr') {
      const O = this.expr(n.fn.obj, scope), name = n.fn.name;
      const line = n.line;
      return G(function* (f) {
        const o = O.gen ? yield* O.fn(f) : O.fn(f);
        const [args, kw] = A.gen ? yield* A.fn(f) : A.fn(f);
        hooks.line = line;
        return yield* I.callMethod(o, name, args, kw);
      });
    }
    const F = this.expr(n.fn, scope);
    const line = n.line;
    return G(function* (f) {
      const fn = F.gen ? yield* F.fn(f) : F.fn(f);
      const [args, kw] = A.gen ? yield* A.fn(f) : A.fn(f);
      hooks.line = line;
      if (fn instanceof NativeFn && !fn.gen) return fn.fn(args, kw || EMPTY);
      return yield* I.callg(fn, args, kw);
    });
  }

  * callMethod(o, name, args, kw) {
    if (o instanceof PyInstance) {
      const a = o.attrs[name];
      if (a !== undefined) return yield* this.callg(a, args, kw);
      const m = o.cls.lookup(name);
      if (m instanceof PyFunc) return yield* this.callFunc(m, [o, ...args], kw);
    } else if (!(o instanceof NativeObj || o instanceof PyModule || o instanceof PyClass || o instanceof NativeClass || o instanceof SuperProxy)) {
      const bm = builtinMethod(o, name);
      if (bm) return bm(o, args, kw || EMPTY);
    }
    const fn = this.getAttr(o, name);
    if (fn instanceof NativeFn && !fn.gen) return fn.fn(args, kw || EMPTY);
    return yield* this.callg(fn, args, kw);
  }

  lambda(n, scope) {
    const fscope = new Scope('function', scope);
    n.params.forEach((p) => fscope.locals.add(p.name));
    const body = this.expr(n.body, fscope);
    const info = { name: '<lambda>', params: n.params, body, expr: true };
    return this.makeFunc(info, n.params, scope, false);
  }

  /** Builds a closure creating the PyFunc at run time (evaluates the default values in the defining frame). */
  makeFunc(info, params, scope, inClass) {
    const defs = params.map((p) => (p.default ? this.expr(p.default, scope) : null));
    const anyGen = defs.some((d) => d && d.gen);
    const build = (f, dv) => { const fn = new PyFunc(info.name, params, null, inClass ? f.up : f, info); fn.info = info; fn.defs = dv; return fn; };
    if (!anyGen) {
      return S((f) => build(f, defs.map((d) => (d ? d.fn(f) : undefined))));
    }
    return G(function* (f) {
      const dv = [];
      for (const d of defs) dv.push(d ? (d.gen ? yield* d.fn(f) : d.fn(f)) : undefined);
      return build(f, dv);
    });
  }

  comp(n, scope) {
    const I = this;
    const cscope = new Scope('comp', scope);
    n.gens.forEach((g) => addTarget(cscope, g.target));
    const gens = n.gens.map((g, i) => ({
      iter: this.expr(g.iter, i === 0 ? scope : cscope),
      assign: this.target(g.target, cscope),
      ifs: g.ifs.map((c) => this.expr(c, cscope)),
    }));
    const elt = n.k === 'DictComp' ? null : this.expr(n.elt, cscope);
    const key = n.k === 'DictComp' ? this.expr(n.elt, cscope) : null;
    const val = n.k === 'DictComp' ? this.expr(n.value, cscope) : null;
    const kind = n.k;
    return G(function* (f) {
      const cf = new Frame(f);
      const out = kind === 'DictComp' ? new PyDict() : kind === 'SetComp' ? new PySet() : [];
      function* run(i) {
        const g = gens[i];
        const iterable = g.iter.gen ? yield* g.iter.fn(i === 0 ? f : cf) : g.iter.fn(i === 0 ? f : cf);
        const it = iterate(iterable);
        for (let r = it.next(); !r.done; r = it.next()) {
          if (g.assign.gen) yield* g.assign.fn(cf, r.value); else g.assign.fn(cf, r.value);
          let ok = true;
          for (const c of g.ifs) { const t = c.gen ? yield* c.fn(cf) : c.fn(cf); if (!truthy(t)) { ok = false; break; } }
          if (!ok) continue;
          if (i + 1 < gens.length) { yield* run(i + 1); continue; }
          if (kind === 'DictComp') {
            const k = key.gen ? yield* key.fn(cf) : key.fn(cf);
            const v = val.gen ? yield* val.fn(cf) : val.fn(cf);
            out.set(k, v);
          } else {
            const v = elt.gen ? yield* elt.fn(cf) : elt.fn(cf);
            if (kind === 'SetComp') out.add(v); else out.push(v);
          }
        }
      }
      yield* run(0);
      return out;
    });
    void I;
  }

  // ------------------------------------------------------------------ assignment targets: {fn(f, value), gen}
  target(t, scope) {
    const I = this;
    switch (t.k) {
      case 'Name': { const st = this.nameStore(scope, t.id); return { gen: false, fn: st }; }
      case 'Attr': {
        const O = this.expr(t.obj, scope), name = t.name;
        if (!O.gen) { const o = O.fn; return { gen: false, fn: (f, v) => I.setAttr(o(f), name, v) }; }
        return { gen: true, fn: function* (f, v) { I.setAttr(yield* O.fn(f), name, v); } };
      }
      case 'Sub': {
        const O = this.expr(t.obj, scope), K = this.subIndex(t.idx, scope);
        if (!O.gen && !K.gen) { const o = O.fn, k = K.fn; return { gen: false, fn: (f, v) => I.setItem(o(f), k(f), v) }; }
        return { gen: true, fn: function* (f, v) { const o = O.gen ? yield* O.fn(f) : O.fn(f); const k = K.gen ? yield* K.fn(f) : K.fn(f); I.setItem(o, k, v); } };
      }
      case 'Tuple': case 'List': {
        const subs = t.elts.map((e) => (e.k === 'Starred' ? { star: true, t: this.target(e.x, scope) } : { star: false, t: this.target(e, scope) }));
        const starAt = subs.findIndex((s) => s.star);
        const anyGen = subs.some((s) => s.t.gen);
        const split = (v) => {
          const vals = toList(v);
          if (starAt < 0) {
            if (vals.length !== subs.length) throw pyErr('ValueError', vals.length > subs.length ? `too many values to unpack (expected ${subs.length})` : `need more than ${vals.length} values to unpack`);
            return vals;
          }
          const after = subs.length - starAt - 1;
          if (vals.length < subs.length - 1) throw pyErr('ValueError', `need more than ${vals.length} values to unpack`);
          return [...vals.slice(0, starAt), vals.slice(starAt, vals.length - after), ...vals.slice(vals.length - after)];
        };
        if (!anyGen) return { gen: false, fn: (f, v) => { const vals = split(v); for (let i = 0; i < subs.length; i++) subs[i].t.fn(f, vals[i]); } };
        return { gen: true, fn: function* (f, v) { const vals = split(v); for (let i = 0; i < subs.length; i++) { if (subs[i].t.gen) yield* subs[i].t.fn(f, vals[i]); else subs[i].t.fn(f, vals[i]); } } };
      }
      default: throw new PySyntaxError('cannot assign to expression', t.line);
    }
  }

  // ------------------------------------------------------------------ statements
  block(stmts, scope) {
    const cs = stmts.map((s) => this.stmt(s, scope));
    const n = cs.length;
    if (n === 0) return S(() => undefined);
    if (cs.every((c) => !c.gen)) {
      const fns = cs.map((c) => c.fn);
      if (n === 1) return S(fns[0]);
      return S((f) => { for (let i = 0; i < n; i++) { const r = fns[i](f); if (r !== undefined) return r; } return undefined; });
    }
    return G(function* (f) {
      for (let i = 0; i < n; i++) {
        const c = cs[i];
        const r = c.gen ? yield* c.fn(f) : c.fn(f);
        if (r !== undefined) return r;
      }
      return undefined;
    });
  }

  stmt(n, scope) {
    const I = this;
    const line = n.line;
    switch (n.k) {
      case 'ExprS': {
        const E = this.expr(n.value, scope);
        if (!E.gen) { const e = E.fn; return S((f) => { hooks.line = line; e(f); }); }
        return G(function* (f) { hooks.line = line; yield* E.fn(f); });
      }
      case 'Pass': return S(() => undefined);
      case 'Break': return S(() => BRK);
      case 'Continue': return S(() => CNT);
      case 'Global': case 'Nonlocal': return S(() => undefined);
      case 'Return': {
        if (!n.value) return S((f) => { f.ret = null; return RET; });
        const E = this.expr(n.value, scope);
        if (!E.gen) { const e = E.fn; return S((f) => { hooks.line = line; f.ret = e(f); return RET; }); }
        return G(function* (f) { hooks.line = line; f.ret = yield* E.fn(f); return RET; });
      }
      case 'Assign': return this.assign(n, scope);
      case 'AugAssign': return this.augassign(n, scope);
      case 'If': {
        const T = this.expr(n.test, scope), B = this.block(n.body, scope), E = n.orelse.length ? this.block(n.orelse, scope) : null;
        if (!T.gen && !B.gen && (!E || !E.gen)) {
          const t = T.fn, b = B.fn, e = E ? E.fn : null;
          return S((f) => { hooks.line = line; if (truthy(t(f))) return b(f); return e ? e(f) : undefined; });
        }
        return G(function* (f) {
          hooks.line = line;
          const t = T.gen ? yield* T.fn(f) : T.fn(f);
          if (truthy(t)) return B.gen ? yield* B.fn(f) : B.fn(f);
          if (E) return E.gen ? yield* E.fn(f) : E.fn(f);
          return undefined;
        });
      }
      case 'While': {
        const T = this.expr(n.test, scope), B = this.block(n.body, scope), E = n.orelse.length ? this.block(n.orelse, scope) : null;
        return G(function* (f) {
          for (;;) {
            hooks.line = line;
            const t = T.gen ? yield* T.fn(f) : T.fn(f);
            if (!truthy(t)) { if (E) { const r = E.gen ? yield* E.fn(f) : E.fn(f); if (r !== undefined) return r; } return undefined; }
            const r = B.gen ? yield* B.fn(f) : B.fn(f);
            if (r === BRK) return undefined;
            if (r === RET) return r;
            yield* I.tick();
          }
        });
      }
      case 'For': {
        const It = this.expr(n.iter, scope), As = this.target(n.target, scope), B = this.block(n.body, scope), E = n.orelse.length ? this.block(n.orelse, scope) : null;
        return G(function* (f) {
          hooks.line = line;
          const iterable = It.gen ? yield* It.fn(f) : It.fn(f);
          const it = iterate(iterable);
          for (let r = it.next(); !r.done; r = it.next()) {
            if (As.gen) yield* As.fn(f, r.value); else As.fn(f, r.value);
            const s = B.gen ? yield* B.fn(f) : B.fn(f);
            if (s === BRK) return undefined;
            if (s === RET) return s;
            yield* I.tick();
          }
          if (E) { const r = E.gen ? yield* E.fn(f) : E.fn(f); if (r !== undefined) return r; }
          return undefined;
        });
      }
      case 'FuncDef': return this.funcDef(n, scope);
      case 'ClassDef': return this.classDef(n, scope);
      case 'Try': return this.tryStmt(n, scope);
      case 'Raise': {
        const E = n.exc ? this.expr(n.exc, scope) : null;
        return G(function* (f) {
          hooks.line = line;
          if (!E) {
            const cur = I.excStack[I.excStack.length - 1];
            if (!cur) throw pyErr('RuntimeError', 'no active exception to reraise');
            throw cur;
          }
          let v = E.gen ? yield* E.fn(f) : E.fn(f);
          if (v instanceof PyClass) v = yield* I.callg(v, [], null);
          if (!isExc(v)) throw pyErr('TypeError', 'exceptions must derive from BaseException');
          throw new PyError(v, line);
        });
      }
      case 'Assert': {
        const T = this.expr(n.test, scope), M = n.msg ? this.expr(n.msg, scope) : null;
        return G(function* (f) {
          hooks.line = line;
          const t = T.gen ? yield* T.fn(f) : T.fn(f);
          if (!truthy(t)) {
            const m = M ? (M.gen ? yield* M.fn(f) : M.fn(f)) : undefined;
            throw pyErr('AssertionError', m);
          }
        });
      }
      case 'Del': {
        const dels = n.targets.map((t) => {
          if (t.k === 'Name') { const r = resolve(scope, t.id); const Gv = this.G.vars; return S((f) => { let fr = f; if (r.k === 'g') fr = { vars: Gv }; else for (let i = 0; i < r.d; i++) fr = fr.up; if (fr.vars[t.id] === undefined) throw pyErr('NameError', `name '${t.id}' isn't defined`); delete fr.vars[t.id]; }); }
          if (t.k === 'Sub') return this.combine2(this.expr(t.obj, scope), this.subIndex(t.idx, scope), (o, k) => I.delItem(o, k));
          if (t.k === 'Attr') { const O = this.expr(t.obj, scope); return S((f) => { const o = O.fn(f); if (o instanceof PyInstance) delete o.attrs[t.name]; }); }
          throw new PySyntaxError("can't delete expression", n.line);
        });
        return G(function* (f) { hooks.line = line; for (const d of dels) { if (d.gen) yield* d.fn(f); else d.fn(f); } });
      }
      case 'Import': {
        const stores = n.names.map(([dotted, alias]) => {
          const top = dotted.split('.')[0];
          const st = this.nameStore(scope, alias || top);
          return (f) => st(f, I.env.importModule(dotted, !!alias));
        });
        return S((f) => { hooks.line = line; stores.forEach((s) => s(f)); });
      }
      case 'ImportFrom': {
        const names = n.names;
        const stores = names.map(([nm, al]) => (nm === '*' ? null : this.nameStore(scope, al || nm)));
        return S((f) => {
          hooks.line = line;
          const mod = I.env.importModule(n.module, true);
          names.forEach(([nm], i) => {
            if (nm === '*') { for (const k of Object.keys(mod.attrs)) if (!k.startsWith('_')) I.G.vars[k] = mod.attrs[k]; return; }
            if (!(nm in mod.attrs)) throw pyErr('ImportError', `can't import name ${nm}`);
            stores[i](f, mod.attrs[nm]);
          });
        });
      }
      case 'With': return this.withStmt(n, scope);
      default: throw new PySyntaxError('unsupported statement: ' + n.k, n.line);
    }
  }

  assign(n, scope) {
    const V = this.expr(n.value, scope);
    const line = n.line;
    const ts = n.targets.map((t) => this.target(t, scope));
    // fast path: single Name target, sync value
    if (ts.length === 1 && !ts[0].gen && !V.gen) {
      const v = V.fn, t = ts[0].fn;
      return S((f) => { hooks.line = line; t(f, v(f)); });
    }
    return G(function* (f) {
      hooks.line = line;
      const v = V.gen ? yield* V.fn(f) : V.fn(f);
      for (const t of ts) { if (t.gen) yield* t.fn(f, v); else t.fn(f, v); }
    });
  }

  augassign(n, scope) {
    const I = this;
    const line = n.line, op = n.op;
    const V = this.expr(n.value, scope);
    const compute = (old, v) => {
      if (Array.isArray(old) && !old.isTuple && op === '+' && Array.isArray(v)) { for (const x of v) old.push(x); return old; }
      if (old instanceof PyInstance) {
        const names = { '+': '__iadd__', '-': '__isub__', '*': '__imul__' };
        const m = names[op] && old.cls.lookup(names[op]);
        if (m) return I.callSync(m, [old, v]);
      }
      return binop(op, old, v);
    };
    const t = n.target;
    if (t.k === 'Name') {
      const L = this.nameLoad(scope, t.id), st = this.nameStore(scope, t.id);
      if (!V.gen) { const l = L.fn, v = V.fn; return S((f) => { hooks.line = line; st(f, compute(l(f), v(f))); }); }
      return G(function* (f) { hooks.line = line; const old = L.fn(f); const v = yield* V.fn(f); st(f, compute(old, v)); });
    }
    if (t.k === 'Attr') {
      const O = this.expr(t.obj, scope);
      return G(function* (f) {
        hooks.line = line;
        const o = O.gen ? yield* O.fn(f) : O.fn(f);
        const v = V.gen ? yield* V.fn(f) : V.fn(f);
        I.setAttr(o, t.name, compute(I.getAttr(o, t.name), v));
      });
    }
    const O = this.expr(t.obj, scope), K = this.subIndex(t.idx, scope);
    return G(function* (f) {
      hooks.line = line;
      const o = O.gen ? yield* O.fn(f) : O.fn(f);
      const k = K.gen ? yield* K.fn(f) : K.fn(f);
      const v = V.gen ? yield* V.fn(f) : V.fn(f);
      I.setItem(o, k, compute(I.getItem(o, k), v));
    });
  }

  funcDef(n, scope) {
    const I = this;
    const fscope = new Scope('function', nearestNonClass(scope));
    n.params.forEach((p) => fscope.locals.add(p.name));
    collect(fscope, n.body);
    n.params.forEach((p) => fscope.locals.add(p.name));
    const body = this.block(n.body, fscope);
    const info = { name: n.name, params: n.params, body, expr: false };
    const inClass = scope.kind === 'class';
    const mk = this.makeFunc(info, n.params, scope, inClass);
    const decs = n.decorators.map((d) => this.expr(d, scope));
    const st = this.nameStore(scope, n.name);
    const line = n.line;
    return G(function* (f) {
      hooks.line = line;
      let fn = mk.gen ? yield* mk.fn(f) : mk.fn(f);
      for (let i = decs.length - 1; i >= 0; i--) {
        const d = decs[i].gen ? yield* decs[i].fn(f) : decs[i].fn(f);
        fn = yield* I.callg(d, [fn], null);
      }
      st(f, fn);
    });
  }

  classDef(n, scope) {
    const I = this;
    const cscope = new Scope('class', scope);
    collect(cscope, n.body);
    const body = this.block(n.body, cscope);
    const bases = n.bases.map((b) => this.expr(b, scope));
    const st = this.nameStore(scope, n.name);
    const line = n.line;
    return G(function* (f) {
      hooks.line = line;
      const bs = [];
      for (const b of bases) { const v = b.gen ? yield* b.fn(f) : b.fn(f); if (v instanceof PyClass) bs.push(v); else if (v !== I.builtins.object) throw pyErr('TypeError', 'base must be a class'); }
      const cf = new Frame(f);
      if (body.gen) yield* body.fn(cf); else body.fn(cf);
      const attrs = {};
      for (const k of Object.keys(cf.vars)) attrs[k] = cf.vars[k];
      const cls = new PyClass(n.name, bs, attrs);
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v instanceof PyFunc) v.home = cls;
        else if ((v instanceof StaticMethod || v instanceof ClassMethod) && v.fn instanceof PyFunc) v.fn.home = cls;
        else if (v instanceof PyProperty) { if (v.fget instanceof PyFunc) v.fget.home = cls; if (v.fset instanceof PyFunc) v.fset.home = cls; }
      }
      st(f, cls);
    });
  }

  tryStmt(n, scope) {
    const I = this;
    const B = this.block(n.body, scope);
    const hs = n.handlers.map((h) => ({ type: h.type ? this.expr(h.type, scope) : null, store: h.name ? this.nameStore(scope, h.name) : null, name: h.name, body: this.block(h.body, scope) }));
    const E = n.orelse.length ? this.block(n.orelse, scope) : null;
    const F = n.final.length ? this.block(n.final, scope) : null;
    const asPy = (e) => {
      if (e instanceof PyError) return e;
      if (e instanceof RangeError && /call stack/i.test(e.message)) return pyErr('RuntimeError', 'maximum recursion depth exceeded');
      return null;
    };
    const matches = (type, exc) => {
      if (type instanceof PyClass) return exc.cls.isSub(type);
      if (isTuple(type)) return type.some((t) => matches(t, exc));
      return false;
    };
    return G(function* (f) {
      try {
        let r;
        try {
          r = B.gen ? yield* B.fn(f) : B.fn(f);
        } catch (e) {
          const pe = asPy(e);
          if (!pe) throw e;
          for (const h of hs) {
            let ok = h.type === null;
            if (!ok) { const t = h.type.gen ? yield* h.type.fn(f) : h.type.fn(f); ok = matches(t, pe.exc); }
            if (!ok) continue;
            if (h.store) h.store(f, pe.exc);
            I.excStack.push(pe);
            try {
              return h.body.gen ? yield* h.body.fn(f) : h.body.fn(f);
            } finally {
              I.excStack.pop();
              if (h.name) { const r2 = resolve(scope, h.name); if (r2.k === 'l' && r2.d === 0) delete f.vars[h.name]; }
            }
          }
          throw pe;
        }
        if (r === undefined && E) r = E.gen ? yield* E.fn(f) : E.fn(f);
        return r;
      } finally {
        if (F) { if (F.gen) yield* F.fn(f); else F.fn(f); }
      }
    });
  }

  withStmt(n, scope) {
    const I = this;
    const items = n.items.map((it) => ({ ctx: this.expr(it.ctx, scope), target: it.target ? this.target(it.target, scope) : null }));
    const B = this.block(n.body, scope);
    return G(function* (f) {
      const entered = [];
      try {
        for (const it of items) {
          const c = it.ctx.gen ? yield* it.ctx.fn(f) : it.ctx.fn(f);
          let v = c;
          if (c instanceof PyInstance && c.cls.lookup('__enter__')) { v = yield* I.callg(c.cls.lookup('__enter__'), [c], null); entered.push(c); } else if (c instanceof NativeObj && c.enter) v = c.enter();
          if (it.target) { if (it.target.gen) yield* it.target.fn(f, v); else it.target.fn(f, v); }
        }
        return B.gen ? yield* B.fn(f) : B.fn(f);
      } finally {
        for (const c of entered.reverse()) {
          const ex = c.cls.lookup('__exit__');
          if (ex) yield* I.callg(ex, [c, null, null, null], null);
        }
      }
    });
  }
}

function specParts(spec, line) {
  const parts = [];
  const re = /\{([^{}]*)\}/g;
  let last = 0, m;
  while ((m = re.exec(spec))) {
    if (m.index > last) parts.push(spec.slice(last, m.index));
    parts.push({ expr: parseSpecExpr(m[1]), spec: '', conv: '', line });
    last = m.index + m[0].length;
  }
  if (last < spec.length) parts.push(spec.slice(last));
  return parts;
}
let specParser = null;
export function setSpecParser(fn) { specParser = fn; }
function parseSpecExpr(src) { return specParser(src); }

function cmpFn(op) {
  switch (op) {
    case '==': return (a, b) => pyEq(a, b);
    case '!=': return (a, b) => !pyEq(a, b);
    case '<': return (a, b) => (isNum(a) && isNum(b) ? toNum(a) < toNum(b) : cmpOrd(a, b) < 0);
    case '>': return (a, b) => (isNum(a) && isNum(b) ? toNum(a) > toNum(b) : cmpOrd(a, b) > 0);
    case '<=': return (a, b) => (isNum(a) && isNum(b) ? toNum(a) <= toNum(b) : cmpOrd(a, b) <= 0);
    case '>=': return (a, b) => (isNum(a) && isNum(b) ? toNum(a) >= toNum(b) : cmpOrd(a, b) >= 0);
    case 'in': return (a, b) => contains(b, a);
    case 'not in': return (a, b) => !contains(b, a);
    case 'is': return (a, b) => pyIs(a, b);
    default: return (a, b) => !pyIs(a, b);
  }
}
function cmpOrd(a, b) {
  if (a === null || b === null) throw pyErr('TypeError', `unsupported types for comparison: '${typeName(a)}', '${typeName(b)}'`);
  return pyCompare(a, b);
}
export function pyIs(a, b) {
  if (a === b) return true;
  if (a instanceof Fl && b instanceof Fl) return a.v === b.v;
  if (isNum(a) && isNum(b) && typeof a === typeof b) return a === b;
  return false;
}

function sliceBounds(len, s) {
  const step = s.step === null || s.step === undefined ? 1 : toInt(s.step);
  if (step === 0) throw pyErr('ValueError', 'slice step cannot be zero');
  const norm = (v, dflt, lo, hi) => { if (v === null || v === undefined) return dflt; let x = toInt(v); if (x < 0) x += len; return Math.max(lo, Math.min(hi, x)); };
  if (step > 0) return { start: norm(s.lo, 0, 0, len), stop: norm(s.hi, len, 0, len), step };
  return { start: norm(s.lo, len - 1, -1, len - 1), stop: norm(s.hi, -1, -1, len - 1), step };
}
function sliceSeq(arr, s) {
  const { start, stop, step } = sliceBounds(arr.length, s);
  const out = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(arr[i]);
  else for (let i = start; i > stop; i += step) out.push(arr[i]);
  return out;
}

export { pyLen, PyIter, PyRange, EXC, newExc };
