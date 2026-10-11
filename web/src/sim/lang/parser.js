// Recursive-descent parser for the Arduino C/C++ subset.
import { CompileError } from './lexer.js';

const TYPE_WORDS = new Set([
  'void', 'bool', 'boolean', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned',
  'byte', 'word', 'size_t', 'time_t', 'String', 'auto',
  'int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t', 'int64_t', 'uint64_t',
  'uint_fast8_t', 'uint_least8_t', 'int_fast8_t', 'uint_fast16_t', 'uint_fast32_t', 'uintptr_t', 'intptr_t',
  'u8', 'u16', 'u32', 's8', 's16', 's32', 'prog_char', 'prog_uchar', 'wchar_t', 'char16_t', 'char32_t',
]);
const QUALIFIERS = new Set([
  'const', 'volatile', 'static', 'extern', 'inline', 'register', 'constexpr', 'mutable', 'virtual',
  'explicit', 'friend', 'PROGMEM', 'IRAM_ATTR', 'ICACHE_RAM_ATTR', 'ARDUINO_ISR_ATTR', '__attribute__',
  'typename', 'DMA_ATTR', 'RTC_DATA_ATTR', 'override', 'final',
]);
const IGNORED_ATTRS = new Set(['PROGMEM', 'IRAM_ATTR', 'ICACHE_RAM_ATTR', 'ARDUINO_ISR_ATTR', 'DMA_ATTR', 'RTC_DATA_ATTR']);

const BIN_PREC = {
  '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
  '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10,
};
const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

const FIXED = {
  int8_t: 'i8', uint8_t: 'u8', int16_t: 'i16', uint16_t: 'u16', int32_t: 'i32', uint32_t: 'u32',
  int64_t: 'i64', uint64_t: 'u64', uint_fast8_t: 'u8', uint_least8_t: 'u8', int_fast8_t: 'i8',
  uint_fast16_t: 'u16', uint_fast32_t: 'u32', uintptr_t: 'u32', intptr_t: 'i32',
  u8: 'u8', u16: 'u16', u32: 'u32', s8: 'i8', s16: 'i16', s32: 'i32', prog_char: 'char', prog_uchar: 'u8',
  wchar_t: 'i16', char16_t: 'u16', char32_t: 'u32',
};

export class Parser {
  constructor(tokens, opts = {}) {
    this.toks = tokens;
    this.p = 0;
    this.typeNames = new Set(opts.classNames || []);
    this.typedefs = new Map();
    this.enumNames = new Set();
  }

  // ---- token helpers ----
  get cur() { return this.toks[this.p]; }
  peek(o = 1) { return this.toks[Math.min(this.p + o, this.toks.length - 1)]; }
  next() { return this.toks[this.p++]; }
  is(v, t = this.cur) { return t && (t.t === 'op' || t.t === 'id') && t.v === v; }
  isOp(v, t = this.cur) { return t && t.t === 'op' && t.v === v; }
  accept(v) { if (this.is(v)) { this.p++; return true; } return false; }
  err(msg, tok = this.cur) { return new CompileError(msg, tok ? tok.line : 0, tok ? tok.col : 0); }
  expect(v, what) {
    if (this.is(v)) return this.next();
    const t = this.cur;
    const found = t.t === 'eof' ? 'end of file' : `'${t.t === 'str' ? '"' + t.v + '"' : t.v}'`;
    // missing semicolon is reported at the end of the previous line, like gcc
    if (v === ';' && this.p > 0) {
      const prev = this.toks[this.p - 1];
      if (prev.line < t.line) throw new CompileError(`expected ';' at end of line`, prev.line, prev.col);
    }
    throw this.err(`expected '${v}'${what ? ' ' + what : ''} before ${found}`);
  }
  ident(what = 'identifier') {
    const t = this.cur;
    if (t.t !== 'id') throw this.err(`expected ${what} before '${t.v || 'end of file'}'`);
    this.p++;
    return t.v;
  }

  isTypeName(name) {
    return TYPE_WORDS.has(name) || this.typeNames.has(name) || this.typedefs.has(name) || this.enumNames.has(name);
  }

  isTypeStart(t = this.cur, nextTok = null) {
    if (!t || t.t !== 'id') return false;
    const v = t.v;
    if (QUALIFIERS.has(v) || v === 'struct' || v === 'class' || v === 'enum' || v === 'union') return true;
    if (TYPE_WORDS.has(v)) return true;
    if (this.typeNames.has(v) || this.typedefs.has(v) || this.enumNames.has(v)) {
      const n = nextTok || this.toks[this.toks.indexOf(t) + 1];
      // `Type::member` is an expression, `Type(` is a functional cast / constructor expression
      if (n && n.t === 'op' && (n.v === '::' || n.v === '(' || n.v === '.')) return false;
      return true;
    }
    return false;
  }

  // ---- types ----
  parseTypeSpec() {
    const spec = { base: null, uns: null, longs: 0, short: false, isConst: false, isStatic: false, line: this.cur.line };
    let sawAny = false;
    for (;;) {
      const t = this.cur;
      if (t.t !== 'id') break;
      const v = t.v;
      if (v === 'const' || v === 'constexpr') { spec.isConst = true; this.p++; sawAny = true; continue; }
      if (v === 'static') { spec.isStatic = true; this.p++; sawAny = true; continue; }
      if (v === '__attribute__') { this.p++; this.skipParens(); continue; }
      if (QUALIFIERS.has(v)) { this.p++; sawAny = true; continue; }
      if (v === 'unsigned') { spec.uns = true; this.p++; sawAny = true; continue; }
      if (v === 'signed') { spec.uns = false; this.p++; sawAny = true; continue; }
      if (v === 'long') { spec.longs++; this.p++; sawAny = true; continue; }
      if (v === 'short') { spec.short = true; this.p++; sawAny = true; continue; }
      if (spec.base) break;
      if (v === 'int') { spec.base = 'int'; this.p++; sawAny = true; continue; }
      if (v === 'struct' || v === 'class' || v === 'union' || v === 'enum') {
        // elaborated type specifier: `struct Point p;`
        const n = this.peek();
        if (n.t === 'id' && !this.isOp('{', this.peek(2))) {
          this.p += 2;
          spec.base = n.v;
          if (v === 'enum') { spec.base = 'int'; spec.enumName = n.v; }
          sawAny = true;
          continue;
        }
        break;
      }
      if (spec.longs || spec.short || spec.uns !== null) {
        // `unsigned char`, `long double` ... only basic words can follow modifiers
        if (v === 'char' || v === 'double' || v === 'float') { spec.base = v; this.p++; continue; }
        break;
      }
      if (TYPE_WORDS.has(v) || this.typeNames.has(v) || this.typedefs.has(v) || this.enumNames.has(v)) {
        spec.base = v;
        this.p++;
        sawAny = true;
        // template arguments on class types e.g. Array<int, 5> are not supported; skip simple ones
        if (this.isOp('<') && this.typeNames.has(v)) this.skipTemplateArgs();
        continue;
      }
      break;
    }
    if (!sawAny && !spec.base) throw this.err('expected type');
    return this.normalizeSpec(spec);
  }

  skipParens() {
    if (!this.isOp('(')) return;
    let depth = 0;
    do {
      if (this.isOp('(')) depth++;
      else if (this.isOp(')')) depth--;
      this.p++;
    } while (depth > 0 && this.cur.t !== 'eof');
  }

  skipTemplateArgs() {
    let depth = 0;
    do {
      if (this.isOp('<')) depth++;
      else if (this.isOp('>')) depth--;
      else if (this.isOp('>>')) depth -= 2;
      this.p++;
    } while (depth > 0 && this.cur.t !== 'eof');
  }

  normalizeSpec(s) {
    let name = s.base;
    if (name && this.typedefs.has(name)) {
      const td = this.typedefs.get(name);
      return { ...td.type, ptr: (td.type.ptr || 0), dims: td.dims, isConst: s.isConst || td.type.isConst, isStatic: s.isStatic, line: s.line };
    }
    if (name && this.enumNames.has(name)) name = 'int';
    if (name === 'char') name = s.uns === true ? 'u8' : 'char';
    else if (name === 'double' || name === 'float') { /* keep */ }
    else if (name === null || name === 'int') {
      if (s.short) name = s.uns ? 'u16' : 'i16';
      else if (s.longs === 1) name = s.uns ? 'ulong' : 'long';
      else if (s.longs >= 2) name = s.uns ? 'u64' : 'i64';
      else name = s.uns ? 'uint' : 'int';
    } else if (name === 'boolean') name = 'bool';
    else if (name === 'byte') name = 'u8';
    else if (name === 'word') name = 'uint';
    else if (name === 'size_t') name = 'uint';
    else if (name === 'time_t') name = 'long';
    else if (FIXED[name]) name = FIXED[name];
    return { name, isConst: s.isConst, isStatic: s.isStatic, ptr: 0, line: s.line };
  }

  parseDeclarator(allowAbstract = false) {
    const d = { name: null, ptr: 0, ref: false, dims: [], init: null, ctorArgs: null, line: this.cur.line };
    for (;;) {
      if (this.accept('*')) { d.ptr++; while (this.accept('const') || this.accept('volatile')); continue; }
      if (this.isOp('&') || this.isOp('&&')) { this.p++; d.ref = true; continue; }
      break;
    }
    if (this.cur.t === 'id' && !this.isTypeName(this.cur.v)) d.name = this.next().v;
    else if (this.cur.t === 'id' && this.isTypeName(this.cur.v) && !TYPE_WORDS.has(this.cur.v)) d.name = this.next().v;
    else if (!allowAbstract) throw this.err(`expected variable name before '${this.cur.v}'`);
    while (this.cur.t === 'id' && IGNORED_ATTRS.has(this.cur.v)) this.p++;
    while (this.isOp('[')) {
      this.p++;
      if (this.isOp(']')) { d.dims.push(null); this.p++; }
      else { d.dims.push(this.parseAssign()); this.expect(']'); }
    }
    while (this.cur.t === 'id' && IGNORED_ATTRS.has(this.cur.v)) this.p++;
    return d;
  }

  parseInitializer() {
    if (this.isOp('{')) return this.parseInitList();
    return this.parseAssign();
  }

  parseInitList() {
    const line = this.cur.line;
    this.expect('{');
    const items = [];
    while (!this.isOp('}')) {
      if (this.isOp('.') && this.peek().t === 'id' && this.isOp('=', this.peek(2))) {
        // designated initializer .field = value
        this.p++;
        const field = this.next().v;
        this.p++;
        items.push({ kind: 'Designated', field, value: this.parseInitializer(), line });
      } else {
        items.push(this.parseInitializer());
      }
      if (!this.accept(',')) break;
    }
    this.expect('}');
    return { kind: 'InitList', items, line };
  }

  // ---- top level ----
  parseProgram() {
    const body = [];
    while (this.cur.t !== 'eof') {
      const d = this.parseTopLevel();
      if (Array.isArray(d)) body.push(...d);
      else if (d) body.push(d);
    }
    // lambdas found inside functions became ordinary functions of their own
    if (this.hoisted && this.hoisted.length) body.push(...this.hoisted);
    return { kind: 'Program', body };
  }

  /**
   * Lambda expression  [captures](params) -> type { body }  as a callback (server.on("/", []() { … })):
   * it becomes a function of its own (__lambda_N) and the expression is a reference to it. The body sees
   * the sketch's global variables; captured locals are not supported (a lambda has no state of its own).
   */
  parseLambda() {
    const line = this.cur.line;
    this.expect('[');
    while (!this.isOp(']') && this.cur.t !== 'eof') this.p++;
    this.expect(']');
    const params = this.isOp('(') ? this.parseParams() : [];
    while (this.cur.t === 'id' && (this.cur.v === 'mutable' || this.cur.v === 'noexcept' || this.cur.v === 'constexpr')) this.p++;
    let ret = null;
    if (this.accept('->')) {
      const spec = this.parseTypeSpec();
      let ptr = 0;
      while (this.accept('*')) ptr++;
      ret = { ...spec, ptr };
    }
    const from = this.p;
    const body = this.parseBlock();
    if (!ret) {
      // no declared type: void, or int when the body returns a value (`return x;`)
      let value = false;
      for (let i = from; i < this.p; i++) if (this.toks[i].t === 'id' && this.toks[i].v === 'return' && !(this.toks[i + 1].t === 'op' && this.toks[i + 1].v === ';')) value = true;
      ret = { name: value ? 'int' : 'void', isConst: false, isStatic: false, ptr: 0, line };
    }
    this.hoisted = this.hoisted || [];
    const name = '__lambda_' + this.hoisted.length;
    this.hoisted.push({ kind: 'Func', name, ret, params, body, line });
    return { kind: 'Ident', name, line };
  }

  parseTopLevel() {
    const t = this.cur;
    if (this.isOp(';')) { this.p++; return null; }
    if (t.t === 'id') {
      if (t.v === 'using') { while (!this.isOp(';') && this.cur.t !== 'eof') this.p++; this.accept(';'); return null; }
      if (t.v === 'template') throw this.err('C++ templates are not supported by the simulator');
      if (t.v === 'namespace') {
        this.p++;
        if (this.cur.t === 'id') this.p++;
        this.expect('{');
        const out = [];
        while (!this.isOp('}') && this.cur.t !== 'eof') {
          const d = this.parseTopLevel();
          if (Array.isArray(d)) out.push(...d); else if (d) out.push(d);
        }
        this.expect('}');
        return out;
      }
      if (t.v === 'extern' && this.peek().t === 'str') {
        this.p += 2;
        if (this.isOp('{')) {
          this.p++;
          const out = [];
          while (!this.isOp('}') && this.cur.t !== 'eof') {
            const d = this.parseTopLevel();
            if (Array.isArray(d)) out.push(...d); else if (d) out.push(d);
          }
          this.expect('}');
          return out;
        }
      }
      if (t.v === 'typedef') return this.parseTypedef();
      if ((t.v === 'struct' || t.v === 'class' || t.v === 'union') &&
        (this.isOp('{', this.peek(2)) || this.isOp(':', this.peek(2)) || this.isOp('{', this.peek()))) {
        return this.parseStructDecl();
      }
      if (t.v === 'enum') return this.parseEnumDecl();
      // Out-of-class method / constructor definitions: Foo::bar(...) / Foo::Foo(...)
      if (this.typeNames.has(t.v) && this.isOp('::', this.peek()) && this.peek(2).t === 'id' &&
        this.isOp('(', this.peek(3))) {
        return this.parseOutOfClassCtor();
      }
    }
    const spec = this.parseTypeSpec();
    return this.parseDeclRest(spec, true);
  }

  parseOutOfClassCtor() {
    const cls = this.next().v;
    this.expect('::');
    let name = this.next().v;
    if (name === '~') name = '~' + this.next().v;
    const params = this.parseParams();
    const fn = { kind: 'Func', name, cls, isCtor: name === cls, ret: { name: 'void', ptr: 0 }, params, body: null, line: this.cur.line };
    if (this.isOp(':')) fn.inits = this.parseCtorInits();
    if (this.isOp('{')) fn.body = this.parseBlock();
    else this.expect(';');
    return fn;
  }

  parseCtorInits() {
    this.expect(':');
    const inits = [];
    do {
      const name = this.ident('member name');
      let args;
      if (this.isOp('{')) args = this.parseInitList().items;
      else args = this.parseCallArgs();
      inits.push({ name, args, line: this.cur.line });
    } while (this.accept(','));
    return inits;
  }

  parseParams() {
    this.expect('(');
    const params = [];
    if (this.isOp(')')) { this.p++; return params; }
    if (this.is('void') && this.isOp(')', this.peek())) { this.p += 2; return params; }
    for (;;) {
      if (this.isOp('...')) { this.p++; params.push({ variadic: true }); break; }
      const type = this.parseTypeSpec();
      const d = this.parseDeclarator(true);
      let def = null;
      if (this.accept('=')) def = this.parseAssign();
      params.push({ type, name: d.name, ptr: d.ptr, ref: d.ref, dims: d.dims, def, line: d.line });
      if (!this.accept(',')) break;
    }
    this.expect(')');
    return params;
  }

  looksLikeParams() {
    // called with cur == '('
    const a = this.peek();
    if (this.isOp(')', a)) return true;
    if (a.t === 'id' && (a.v === 'void' || this.isTypeStart(a, this.peek(2)))) {
      // `Type name` or `Type*` or `Type&` -> params
      return true;
    }
    return false;
  }

  parseDeclRest(spec, topLevel) {
    const line = this.cur.line;
    // method of class defined outside: RetType Class::name(...)
    if (topLevel && this.cur.t === 'id' && this.typeNames.has(this.cur.v) && this.isOp('::', this.peek())) {
      const cls = this.next().v;
      this.p++;
      const name = this.ident();
      const params = this.parseParams();
      while (this.accept('const') || this.accept('override'));
      const fn = { kind: 'Func', name, cls, ret: spec, params, body: null, line };
      if (this.isOp('{')) fn.body = this.parseBlock(); else this.expect(';');
      return fn;
    }
    const first = this.parseDeclarator();
    if (this.isOp('(') && first.dims.length === 0 && this.looksLikeParams()) {
      const params = this.parseParams();
      while (this.accept('const') || this.accept('override') || this.accept('noexcept'));
      while (this.cur.t === 'id' && (IGNORED_ATTRS.has(this.cur.v) || this.cur.v === '__attribute__')) {
        this.p++; this.skipParens();
      }
      const ret = { ...spec, ptr: first.ptr, ref: first.ref };
      const fn = { kind: 'Func', name: first.name, ret, params, body: null, line: first.line };
      if (this.isOp('{')) fn.body = this.parseBlock();
      else this.expect(';', 'after function declaration');
      return fn;
    }
    const decls = [first];
    this.parseDeclInit(first);
    while (this.accept(',')) {
      const d = this.parseDeclarator();
      this.parseDeclInit(d);
      decls.push(d);
    }
    this.expect(';', 'after declaration');
    return { kind: 'Var', type: spec, decls, line };
  }

  parseDeclInit(d) {
    if (this.accept('=')) {
      d.init = this.parseInitializer();
    } else if (this.isOp('(')) {
      d.ctorArgs = this.parseCallArgs();
    } else if (this.isOp('{')) {
      const list = this.parseInitList();
      d.init = list;
      d.braceInit = true;
    }
  }

  parseCallArgs() {
    this.expect('(');
    const args = [];
    if (!this.isOp(')')) {
      do { args.push(this.isOp('{') ? this.parseInitList() : this.parseAssign()); } while (this.accept(','));
    }
    this.expect(')');
    return args;
  }

  parseTypedef() {
    const line = this.cur.line;
    this.expect('typedef');
    if ((this.is('struct') || this.is('class') || this.is('union')) && (this.isOp('{', this.peek()) || this.isOp('{', this.peek(2)))) {
      const st = this.parseStructBody();
      const alias = this.ident('typedef name');
      this.expect(';');
      if (!st.name) st.name = alias;
      this.typeNames.add(alias);
      if (alias !== st.name) this.typedefs.set(alias, { type: { name: st.name, ptr: 0 }, dims: [] });
      return st;
    }
    if (this.is('enum')) {
      const en = this.parseEnumBody();
      const alias = this.ident('typedef name');
      this.expect(';');
      this.enumNames.add(alias);
      return en;
    }
    const spec = this.parseTypeSpec();
    // function pointer typedef: typedef void (*Handler)(int);
    if (this.isOp('(') && this.isOp('*', this.peek())) {
      this.p += 2;
      const alias = this.ident();
      this.expect(')');
      this.parseParams();
      this.expect(';');
      this.typedefs.set(alias, { type: { name: 'funcptr', ptr: 0 }, dims: [] });
      return null;
    }
    const d = this.parseDeclarator();
    this.expect(';');
    this.typedefs.set(d.name, { type: { ...spec, ptr: d.ptr }, dims: d.dims });
    return { kind: 'Typedef', name: d.name, line };
  }

  parseStructDecl() {
    const st = this.parseStructBody();
    // optional declarators after struct body
    if (this.isOp(';')) { this.p++; return st; }
    const spec = { name: st.name, ptr: 0, isConst: false, isStatic: false, line: st.line };
    const decls = [];
    do {
      const d = this.parseDeclarator();
      this.parseDeclInit(d);
      decls.push(d);
    } while (this.accept(','));
    this.expect(';');
    return [st, { kind: 'Var', type: spec, decls, line: st.line }];
  }

  parseStructBody() {
    const line = this.cur.line;
    const kw = this.next().v;
    let name = null;
    if (this.cur.t === 'id') name = this.next().v;
    if (!name) name = `__anon_${line}_${this.p}`;
    this.typeNames.add(name);
    if (this.accept(':')) {
      // base classes: not supported, but skip `public Foo`
      while (!this.isOp('{') && this.cur.t !== 'eof') this.p++;
    }
    this.expect('{');
    const st = { kind: 'Struct', name, isClass: kw === 'class', fields: [], methods: [], ctors: [], line };
    while (!this.isOp('}')) {
      if (this.cur.t === 'eof') throw this.err(`expected '}' at end of ${kw} ${name}`);
      if ((this.is('public') || this.is('private') || this.is('protected')) && this.isOp(':', this.peek())) { this.p += 2; continue; }
      if (this.isOp(';')) { this.p++; continue; }
      if (this.is('enum')) { st.fields.push(this.parseEnumDecl()); continue; }
      if (this.is('typedef')) { this.parseTypedef(); continue; }
      if ((this.is('struct') || this.is('class')) && (this.isOp('{', this.peek(2)) || this.isOp('{', this.peek()))) {
        const inner = this.parseStructDecl();
        if (Array.isArray(inner)) { st.nested = st.nested || []; st.nested.push(inner[0]); st.fields.push(inner[1]); }
        else { st.nested = st.nested || []; st.nested.push(inner); }
        continue;
      }
      // constructor / destructor
      if ((this.is(name) && this.isOp('(', this.peek())) || (this.is('explicit') && this.is(name, this.peek()))) {
        if (this.is('explicit')) this.p++;
        const cl = this.cur.line;
        this.p++;
        const params = this.parseParams();
        const ctor = { kind: 'Func', name, cls: name, isCtor: true, ret: { name: 'void', ptr: 0 }, params, body: null, line: cl };
        if (this.isOp(':')) ctor.inits = this.parseCtorInits();
        if (this.isOp('{')) ctor.body = this.parseBlock(); else this.expect(';');
        st.ctors.push(ctor);
        continue;
      }
      if (this.isOp('~')) {
        this.p++; this.ident(); this.parseParams();
        if (this.isOp('{')) this.parseBlock(); else this.expect(';');
        continue;
      }
      const spec = this.parseTypeSpec();
      const d = this.parseDeclarator();
      if (this.isOp('(')) {
        const params = this.parseParams();
        while (this.accept('const') || this.accept('override') || this.accept('noexcept'));
        let pure = false;
        if (this.isOp('=')) { this.p++; this.next(); pure = true; }
        const fn = { kind: 'Func', name: d.name, cls: name, ret: { ...spec, ptr: d.ptr, ref: d.ref }, params, body: null, isStatic: spec.isStatic, line: d.line };
        if (this.isOp('{')) fn.body = this.parseBlock(); else this.expect(';');
        if (!pure) st.methods.push(fn);
        continue;
      }
      const decls = [d];
      this.parseDeclInit(d);
      while (this.accept(',')) { const d2 = this.parseDeclarator(); this.parseDeclInit(d2); decls.push(d2); }
      this.expect(';');
      st.fields.push({ kind: 'Var', type: spec, decls, line: d.line });
    }
    this.expect('}');
    return st;
  }

  parseEnumDecl() {
    const en = this.parseEnumBody();
    if (this.isOp(';')) { this.p++; return en; }
    const decls = [];
    do {
      const d = this.parseDeclarator();
      this.parseDeclInit(d);
      decls.push(d);
    } while (this.accept(','));
    this.expect(';');
    return [en, { kind: 'Var', type: { name: 'int', ptr: 0 }, decls, line: en.line }];
  }

  parseEnumBody() {
    const line = this.cur.line;
    this.expect('enum');
    let scoped = false;
    if (this.is('class') || this.is('struct')) { this.p++; scoped = true; }
    let name = null;
    if (this.cur.t === 'id') { name = this.next().v; this.enumNames.add(name); }
    if (this.accept(':')) this.parseTypeSpec();
    this.expect('{');
    const items = [];
    while (!this.isOp('}')) {
      const iname = this.ident('enumerator');
      let value = null;
      if (this.accept('=')) value = this.parseAssign();
      items.push({ name: iname, value, line: this.cur.line });
      if (!this.accept(',')) break;
    }
    this.expect('}');
    return { kind: 'Enum', name, scoped, items, line };
  }

  // ---- statements ----
  parseBlock() {
    const line = this.cur.line;
    this.expect('{');
    const body = [];
    while (!this.isOp('}')) {
      if (this.cur.t === 'eof') throw this.err("expected '}' at end of input");
      const s = this.parseStatement();
      if (Array.isArray(s)) body.push(...s);
      else if (s) body.push(s);
    }
    const endLine = this.cur.line;
    this.p++;
    return { kind: 'Block', body, line, endLine };
  }

  parseStatement() {
    const t = this.cur;
    const line = t.line;
    if (t.t === 'op') {
      if (t.v === '{') return this.parseBlock();
      if (t.v === ';') { this.p++; return { kind: 'Empty', line }; }
    }
    if (t.t === 'id') {
      switch (t.v) {
        case 'if': {
          this.p++;
          this.expect('(');
          const cond = this.parseExpr();
          this.expect(')');
          const then = this.parseStatement();
          let otherwise = null;
          if (this.accept('else')) otherwise = this.parseStatement();
          return { kind: 'If', cond, then, otherwise, line };
        }
        case 'while': {
          this.p++;
          this.expect('(');
          const cond = this.parseExpr();
          this.expect(')');
          return { kind: 'While', cond, body: this.parseStatement(), line };
        }
        case 'do': {
          this.p++;
          const body = this.parseStatement();
          this.expect('while');
          this.expect('(');
          const cond = this.parseExpr();
          this.expect(')');
          this.expect(';');
          return { kind: 'DoWhile', cond, body, line };
        }
        case 'for': return this.parseFor();
        case 'switch': return this.parseSwitch();
        case 'return': {
          this.p++;
          let arg = null;
          if (!this.isOp(';')) arg = this.isOp('{') ? this.parseInitList() : this.parseExpr();
          this.expect(';');
          return { kind: 'Return', arg, line };
        }
        case 'break': this.p++; this.expect(';'); return { kind: 'Break', line };
        case 'continue': this.p++; this.expect(';'); return { kind: 'Continue', line };
        case 'goto': throw this.err('goto is not supported by the simulator');
        case 'case': case 'default':
          throw this.err(`'${t.v}' label not within a switch statement`);
        case 'typedef': this.parseTypedef(); return null;
        case 'struct': case 'class': case 'union':
          if (this.isOp('{', this.peek(2)) || this.isOp('{', this.peek())) return this.parseStructDecl();
          break;
        case 'enum':
          return this.parseEnumDecl();
        case 'asm': case '__asm__': case '__asm':
          this.p++;
          while (this.accept('volatile') || this.accept('__volatile__'));
          this.skipParens();
          this.accept(';');
          return { kind: 'Empty', line };
        default:
      }
      if (this.isTypeStart(t, this.peek())) {
        const spec = this.parseTypeSpec();
        const d = this.parseDeclRest(spec, false);
        if (d.kind === 'Func') return null; // local prototype
        return d;
      }
    }
    const expr = this.parseExpr();
    this.expect(';');
    return { kind: 'Expr', expr, line };
  }

  parseFor() {
    const line = this.cur.line;
    this.p++;
    this.expect('(');
    let init = null;
    if (!this.isOp(';')) {
      if (this.isTypeStart(this.cur, this.peek())) {
        const spec = this.parseTypeSpec();
        const d = this.parseDeclarator();
        if (this.isOp(':')) {
          // range-based for
          this.p++;
          const range = this.parseExpr();
          this.expect(')');
          const body = this.parseStatement();
          return { kind: 'ForRange', varType: spec, decl: d, range, body, line };
        }
        this.parseDeclInit(d);
        const decls = [d];
        while (this.accept(',')) { const d2 = this.parseDeclarator(); this.parseDeclInit(d2); decls.push(d2); }
        init = { kind: 'Var', type: spec, decls, line };
      } else {
        init = { kind: 'Expr', expr: this.parseExpr(), line };
      }
    }
    this.expect(';');
    const cond = this.isOp(';') ? null : this.parseExpr();
    this.expect(';');
    const update = this.isOp(')') ? null : this.parseExpr();
    this.expect(')');
    const body = this.parseStatement();
    return { kind: 'For', init, cond, update, body, line };
  }

  parseSwitch() {
    const line = this.cur.line;
    this.p++;
    this.expect('(');
    const disc = this.parseExpr();
    this.expect(')');
    this.expect('{');
    const cases = [];
    let current = null;
    while (!this.isOp('}')) {
      if (this.cur.t === 'eof') throw this.err("expected '}' at end of switch");
      if (this.is('case')) {
        const cl = this.cur.line;
        this.p++;
        let test = this.parseTernary();
        let testHi = null;
        if (this.isOp('...')) { this.p++; testHi = this.parseTernary(); }
        this.expect(':');
        current = { test, testHi, body: [], line: cl };
        cases.push(current);
        continue;
      }
      if (this.is('default') && this.isOp(':', this.peek())) {
        this.p += 2;
        current = { test: null, body: [], line: this.cur.line };
        cases.push(current);
        continue;
      }
      if (!current) throw this.err('statement before first case label in switch');
      const s = this.parseStatement();
      if (Array.isArray(s)) current.body.push(...s);
      else if (s) current.body.push(s);
    }
    this.p++;
    return { kind: 'Switch', disc, cases, line };
  }

  // ---- expressions ----
  parseExpr() {
    const line = this.cur.line;
    const e = this.parseAssign();
    if (this.isOp(',')) {
      const list = [e];
      while (this.accept(',')) list.push(this.parseAssign());
      return { kind: 'Comma', list, line };
    }
    return e;
  }

  parseAssign() {
    const line = this.cur.line;
    const left = this.parseTernary();
    const t = this.cur;
    if (t.t === 'op' && ASSIGN_OPS.has(t.v)) {
      this.p++;
      const value = this.isOp('{') ? this.parseInitList() : this.parseAssign();
      return { kind: 'Assign', op: t.v, target: left, value, line };
    }
    return left;
  }

  parseTernary() {
    const line = this.cur.line;
    const cond = this.parseBinary(1);
    if (this.isOp('?')) {
      this.p++;
      const a = this.parseAssign();
      this.expect(':', 'in conditional expression');
      const b = this.parseAssign();
      return { kind: 'Cond', cond, a, b, line };
    }
    return cond;
  }

  parseBinary(minPrec) {
    let left = this.parseUnary();
    for (;;) {
      const t = this.cur;
      if (t.t !== 'op') return left;
      const prec = BIN_PREC[t.v];
      if (!prec || prec < minPrec) return left;
      this.p++;
      const right = this.parseBinary(prec + 1);
      if (t.v === '&&' || t.v === '||') left = { kind: 'Logical', op: t.v, l: left, r: right, line: t.line };
      else left = { kind: 'Binary', op: t.v, l: left, r: right, line: t.line };
    }
  }

  tryParseCastType() {
    // cur is '('; returns type or null (restoring position)
    const save = this.p;
    const next = this.peek();
    if (next.t !== 'id' || !this.isTypeStart(next, this.peek(2))) return null;
    this.p++;
    try {
      const spec = this.parseTypeSpec();
      let ptr = 0;
      while (this.accept('*')) { ptr++; this.accept('const'); }
      this.accept('&');
      if (!this.isOp(')')) { this.p = save; return null; }
      this.p++;
      return { ...spec, ptr };
    } catch (e) {
      this.p = save;
      return null;
    }
  }

  parseUnary() {
    const t = this.cur;
    const line = t.line;
    if (t.t === 'op') {
      switch (t.v) {
        case '!': case '~': case '-': case '+':
          this.p++;
          return { kind: 'Unary', op: t.v, arg: this.parseUnary(), line };
        case '++': case '--':
          this.p++;
          return { kind: 'Update', op: t.v, prefix: true, arg: this.parseUnary(), line };
        case '*':
          this.p++;
          return { kind: 'Deref', arg: this.parseUnary(), line };
        case '&':
          this.p++;
          return { kind: 'AddrOf', arg: this.parseUnary(), line };
        case '(': {
          const type = this.tryParseCastType();
          if (type) {
            if (this.isOp('{')) return { kind: 'Cast', type, arg: this.parseInitList(), line };
            return { kind: 'Cast', type, arg: this.parseUnary(), line };
          }
          break;
        }
        default:
      }
    } else if (t.t === 'id') {
      if (t.v === 'sizeof') {
        this.p++;
        if (this.isOp('(')) {
          const type = this.tryParseCastType();
          if (type) return { kind: 'SizeofType', type, line };
          this.p++;
          const e = this.parseExpr();
          this.expect(')');
          return { kind: 'SizeofExpr', arg: e, line };
        }
        return { kind: 'SizeofExpr', arg: this.parseUnary(), line };
      }
      if (t.v === 'new') throw this.err("'new' (dynamic memory) is not supported by the simulator");
      if (t.v === 'delete') throw this.err("'delete' is not supported by the simulator");
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      const t = this.cur;
      if (t.t !== 'op') return e;
      if (t.v === '(') {
        const args = this.parseCallArgs();
        e = { kind: 'Call', callee: e, args, line: t.line };
      } else if (t.v === '[') {
        this.p++;
        const idx = this.parseExpr();
        this.expect(']');
        e = { kind: 'Index', obj: e, idx, line: t.line };
      } else if (t.v === '.' || t.v === '->') {
        this.p++;
        let name = this.ident('member name');
        // doc.as<JsonObject>() / to<JsonArray>() / is<int>() / as<const char*>(): the type becomes part of the method name (as_JsonObject …)
        if (this.isOp('<') && (name === 'as' || name === 'to' || name === 'is')) {
          let q = this.p + 1, tn = '';
          while (this.toks[q] && this.toks[q].t !== 'eof' && !(this.toks[q].t === 'op' && this.toks[q].v === '>')) { const k = this.toks[q]; tn += k.v === '*' ? 'Ptr' : String(k.v); q++; }
          if (this.toks[q] && this.toks[q + 1] && this.toks[q + 1].t === 'op' && this.toks[q + 1].v === '(') { name = `${name}_${tn}`; this.p = q + 1; }
        }
        e = { kind: 'Member', obj: e, name, arrow: t.v === '->', line: t.line };
      } else if (t.v === '++' || t.v === '--') {
        this.p++;
        e = { kind: 'Update', op: t.v, prefix: false, arg: e, line: t.line };
      } else return e;
    }
  }

  parsePrimary() {
    const t = this.cur;
    const line = t.line;
    switch (t.t) {
      case 'num':
        this.p++;
        return { kind: 'Num', v: t.v, isFloat: t.isFloat, unsigned: t.unsigned, longs: t.longs, fsuffix: t.fsuffix, line };
      case 'chr':
        this.p++;
        return { kind: 'Chr', v: t.v, line };
      case 'str': {
        let s = '';
        while (this.cur.t === 'str') s += this.next().v;
        return { kind: 'Str', v: s, line };
      }
      case 'op':
        if (t.v === '(') {
          this.p++;
          const e = this.parseExpr();
          this.expect(')');
          return e;
        }
        if (t.v === '{') return this.parseInitList();
        if (t.v === '::') { this.p++; return this.parsePrimary(); }
        if (t.v === '[') return this.parseLambda();
        throw this.err(`expected expression before '${t.v}' token`);
      case 'id': {
        // static_cast<T>(x) & friends
        if ((t.v === 'static_cast' || t.v === 'reinterpret_cast' || t.v === 'const_cast' || t.v === 'dynamic_cast') && this.isOp('<', this.peek())) {
          this.p += 2;
          const spec = this.parseTypeSpec();
          let ptr = 0;
          while (this.accept('*')) ptr++;
          this.accept('&');
          this.expect('>');
          this.expect('(');
          const arg = this.parseExpr();
          this.expect(')');
          return { kind: 'Cast', type: { ...spec, ptr }, arg, line };
        }
        // unsigned(x), long(x), unsigned long(x)
        if (t.v === 'unsigned' || t.v === 'long' || t.v === 'signed' || t.v === 'short') {
          const type = this.parseTypeSpec();
          const args = this.parseCallArgs();
          return { kind: 'Construct', type, args, line };
        }
        // functional cast / constructor: int(x), float(x), String(x), byte(x), MyStruct{..}
        if (this.isTypeName(t.v) && (this.isOp('(', this.peek()) || this.isOp('{', this.peek()))) {
          if (TYPE_WORDS.has(t.v) || this.typedefs.has(t.v)) {
            const spec = this.normalizeSpec({ base: t.v, uns: null, longs: 0, short: false, isConst: false, isStatic: false, line });
            this.p++;
            if (this.isOp('{')) return { kind: 'Cast', type: spec, arg: this.parseInitList(), line, functional: true };
            const args = this.parseCallArgs();
            return { kind: 'Construct', type: spec, args, line };
          }
          this.p++;
          if (this.isOp('{')) {
            const list = this.parseInitList();
            return { kind: 'Construct', type: { name: t.v, ptr: 0 }, args: list.items, braces: true, line };
          }
          const args = this.parseCallArgs();
          return { kind: 'Construct', type: { name: t.v, ptr: 0 }, args, line };
        }
        this.p++;
        if (this.isOp('::') && this.peek().t === 'id') {
          let name = t.v;
          while (this.isOp('::') && this.peek().t === 'id') {
            this.p++;
            name += '::' + this.next().v;
          }
          return { kind: 'Ident', name, line, col: t.col };
        }
        return { kind: 'Ident', name: t.v, line, col: t.col };
      }
      case 'eof':
        throw this.err('expected expression before end of file');
      default:
        throw this.err(`unexpected '${t.v}'`);
    }
  }
}

export function parse(tokens, opts) {
  const p = new Parser(tokens, opts);
  const program = p.parseProgram();
  return program;
}
