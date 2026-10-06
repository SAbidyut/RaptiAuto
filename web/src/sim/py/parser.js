// Recursive-descent parser for the MicroPython subset. Produces a plain-object AST (nodes carry `k` and `line`).
import { tokenize, PySyntaxError } from './lexer.js';

const AUG = new Set(['+=', '-=', '*=', '/=', '//=', '%=', '**=', '&=', '|=', '^=', '>>=', '<<=']);
const CMP = new Set(['<', '>', '==', '>=', '<=', '!=']);

class Parser {
  constructor(toks, lineOffset = 0) {
    this.toks = toks;
    this.p = 0;
    this.off = lineOffset;
  }

  get tok() { return this.toks[this.p]; }
  peek(k = 1) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
  err(msg, tok = this.tok) { return new PySyntaxError(msg, tok.line + this.off, tok.col); }
  isOp(v, tok = this.tok) { return tok.t === 'op' && tok.v === v; }
  isKw(v, tok = this.tok) { return tok.t === 'kw' && tok.v === v; }
  eatOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
  eatKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
  expectOp(v) { if (!this.eatOp(v)) throw this.err(`invalid syntax: expected '${v}'`); }
  expectKw(v) { if (!this.eatKw(v)) throw this.err(`invalid syntax: expected '${v}'`); }
  expectName() {
    if (this.tok.t !== 'name') throw this.err('invalid syntax: expected a name');
    return this.toks[this.p++].v;
  }
  node(k, props, tok = this.tok) { return { k, line: tok.line + this.off, ...props }; }

  // ------------------------------------------------------------------ statements
  parseModule() {
    const body = [];
    while (this.tok.t !== 'eof') {
      if (this.tok.t === 'nl') { this.p++; continue; }
      if (this.tok.t === 'indent') throw this.err('unexpected indent');
      body.push(...this.statement());
    }
    return body;
  }

  /** One logical statement; returns a list (simple statements on one line yield several). */
  statement() {
    const t = this.tok;
    if (t.t === 'kw') {
      switch (t.v) {
        case 'if': return [this.ifStmt()];
        case 'while': return [this.whileStmt()];
        case 'for': return [this.forStmt()];
        case 'def': return [this.defStmt([])];
        case 'class': return [this.classStmt()];
        case 'try': return [this.tryStmt()];
        case 'with': return [this.withStmt()];
        case 'async': throw this.err('async / await is not supported');
        default: break;
      }
    }
    if (this.isOp('@')) return [this.decorated()];
    return this.simpleLine();
  }

  simpleLine() {
    const out = [this.simpleStmt()];
    while (this.eatOp(';')) { if (this.tok.t === 'nl') break; out.push(this.simpleStmt()); }
    if (this.tok.t !== 'nl' && this.tok.t !== 'eof') throw this.err('invalid syntax');
    if (this.tok.t === 'nl') this.p++;
    return out;
  }

  block() {
    this.expectOp(':');
    if (this.tok.t !== 'nl') return this.simpleLine(); // one-line body: `if x: y`
    this.p++;
    if (this.tok.t !== 'indent') throw this.err('expected an indented block');
    this.p++;
    const body = [];
    while (this.tok.t !== 'dedent' && this.tok.t !== 'eof') {
      if (this.tok.t === 'nl') { this.p++; continue; }
      body.push(...this.statement());
    }
    if (this.tok.t === 'dedent') this.p++;
    return body;
  }

  ifStmt() {
    const t = this.tok;
    this.p++;
    const test = this.expr();
    const body = this.block();
    let orelse = [];
    if (this.isKw('elif')) orelse = [this.ifStmt()];
    else if (this.eatKw('else')) orelse = this.block();
    return this.node('If', { test, body, orelse }, t);
  }

  whileStmt() {
    const t = this.tok;
    this.p++;
    const test = this.expr();
    const body = this.block();
    const orelse = this.eatKw('else') ? this.block() : [];
    return this.node('While', { test, body, orelse }, t);
  }

  forStmt() {
    const t = this.tok;
    this.p++;
    const target = this.targetList();
    this.expectKw('in');
    const iter = this.exprList();
    const body = this.block();
    const orelse = this.eatKw('else') ? this.block() : [];
    return this.node('For', { target, iter, body, orelse }, t);
  }

  /** for-loop / comprehension target: names, tuples, subscripts (no `in` operator inside). */
  targetList() {
    const t = this.tok;
    const first = this.orExprNoIn();
    if (!this.isOp(',')) return this.toTarget(first);
    const elts = [first];
    while (this.eatOp(',')) { if (this.isKw('in')) break; elts.push(this.orExprNoIn()); }
    return this.toTarget(this.node('Tuple', { elts }, t));
  }

  orExprNoIn() {
    if (this.isOp('*')) { const t = this.tok; this.p++; return this.node('Starred', { x: this.bitOr() }, t); }
    return this.bitOr();
  }

  defStmt(decorators) {
    const t = this.tok;
    this.p++;
    const name = this.expectName();
    this.expectOp('(');
    const params = this.params(')');
    this.expectOp(')');
    if (this.eatOp('->')) this.expr();
    const body = this.block();
    return this.node('FuncDef', { name, params, body, decorators }, t);
  }

  params(close) {
    const params = [];
    let kwonly = false;
    while (!this.isOp(close)) {
      if (this.eatOp('*')) {
        if (this.tok.t === 'name') { params.push({ name: this.expectName(), kind: 'varargs' }); if (this.eatOp(':')) this.expr(); } else kwonly = true;
      } else if (this.eatOp('**')) {
        params.push({ name: this.expectName(), kind: 'kwargs' });
        if (this.eatOp(':')) this.expr();
      } else if (this.isOp('/')) { this.p++; } else {
        const name = this.expectName();
        if (close === ')' && this.eatOp(':')) this.expr();
        const p = { name, kind: kwonly ? 'kwonly' : 'pos' };
        if (this.eatOp('=')) p.default = this.expr();
        params.push(p);
      }
      if (!this.eatOp(',')) break;
    }
    return params;
  }

  classStmt() {
    const t = this.tok;
    this.p++;
    const name = this.expectName();
    let bases = [];
    if (this.eatOp('(')) {
      while (!this.isOp(')')) { bases.push(this.expr()); if (!this.eatOp(',')) break; }
      this.expectOp(')');
    }
    return this.node('ClassDef', { name, bases, body: this.block() }, t);
  }

  decorated() {
    const decs = [];
    while (this.eatOp('@')) {
      decs.push(this.expr());
      if (this.tok.t === 'nl') this.p++;
    }
    if (this.isKw('def')) return this.defStmt(decs);
    throw this.err('decorators are only supported on functions');
  }

  tryStmt() {
    const t = this.tok;
    this.p++;
    const body = this.block();
    const handlers = [];
    let orelse = [], final = [];
    while (this.isKw('except')) {
      const ht = this.tok;
      this.p++;
      let type = null, name = null;
      if (!this.isOp(':')) {
        type = this.expr();
        if (this.eatKw('as')) name = this.expectName();
      }
      handlers.push({ type, name, body: this.block(), line: ht.line + this.off });
    }
    if (this.eatKw('else')) orelse = this.block();
    if (this.eatKw('finally')) final = this.block();
    if (!handlers.length && !final.length) throw this.err("expected 'except' or 'finally' block");
    return this.node('Try', { body, handlers, orelse, final }, t);
  }

  withStmt() {
    const t = this.tok;
    this.p++;
    const items = [];
    do {
      const ctx = this.expr();
      let target = null;
      if (this.eatKw('as')) target = this.toTarget(this.postfix());
      items.push({ ctx, target });
    } while (this.eatOp(','));
    return this.node('With', { items, body: this.block() }, t);
  }

  simpleStmt() {
    const t = this.tok;
    if (t.t === 'kw') {
      switch (t.v) {
        case 'pass': this.p++; return this.node('Pass', {}, t);
        case 'break': this.p++; return this.node('Break', {}, t);
        case 'continue': this.p++; return this.node('Continue', {}, t);
        case 'return': {
          this.p++;
          const value = this.endOfSimple() ? null : this.exprList();
          return this.node('Return', { value }, t);
        }
        case 'global': case 'nonlocal': {
          this.p++;
          const names = [this.expectName()];
          while (this.eatOp(',')) names.push(this.expectName());
          return this.node(t.v === 'global' ? 'Global' : 'Nonlocal', { names }, t);
        }
        case 'import': {
          this.p++;
          const names = [];
          do {
            let dotted = this.expectName();
            while (this.eatOp('.')) dotted += '.' + this.expectName();
            names.push([dotted, this.eatKw('as') ? this.expectName() : null]);
          } while (this.eatOp(','));
          return this.node('Import', { names }, t);
        }
        case 'from': {
          this.p++;
          let module = '';
          while (this.isOp('.')) { module += '.'; this.p++; }
          if (this.tok.t === 'name') {
            module += this.expectName();
            while (this.eatOp('.')) module += '.' + this.expectName();
          }
          this.expectKw('import');
          const names = [];
          if (this.eatOp('*')) names.push(['*', null]);
          else {
            const paren = this.eatOp('(');
            do {
              if (paren && this.isOp(')')) break;
              const n = this.expectName();
              names.push([n, this.eatKw('as') ? this.expectName() : null]);
            } while (this.eatOp(','));
            if (paren) this.expectOp(')');
          }
          return this.node('ImportFrom', { module, names }, t);
        }
        case 'raise': {
          this.p++;
          let exc = null, cause = null;
          if (!this.endOfSimple()) { exc = this.expr(); if (this.eatKw('from')) cause = this.expr(); }
          return this.node('Raise', { exc, cause }, t);
        }
        case 'assert': {
          this.p++;
          const test = this.expr();
          const msg = this.eatOp(',') ? this.expr() : null;
          return this.node('Assert', { test, msg }, t);
        }
        case 'del': {
          this.p++;
          const targets = [this.toTarget(this.postfix())];
          while (this.eatOp(',')) targets.push(this.toTarget(this.postfix()));
          return this.node('Del', { targets }, t);
        }
        case 'yield': throw this.err('generators (yield) are not supported');
        default: break;
      }
    }
    // expression statement / assignment
    const first = this.exprListStar();
    if (this.isOp('=')) {
      const targets = [this.toTarget(first)];
      let value;
      while (this.eatOp('=')) {
        value = this.exprListStar();
        if (this.isOp('=')) targets.push(this.toTarget(value));
      }
      return this.node('Assign', { targets, value }, t);
    }
    if (this.tok.t === 'op' && AUG.has(this.tok.v)) {
      const op = this.tok.v.slice(0, -1);
      this.p++;
      const target = this.toTarget(first);
      if (target.k === 'Tuple' || target.k === 'List') throw this.err('illegal expression for augmented assignment', t);
      return this.node('AugAssign', { target, op, value: this.exprList() }, t);
    }
    if (this.isOp(':')) { // annotated assignment: x: int = 3
      this.p++;
      this.expr();
      if (this.eatOp('=')) return this.node('Assign', { targets: [this.toTarget(first)], value: this.exprListStar() }, t);
      return this.node('Pass', {}, t);
    }
    return this.node('ExprS', { value: first }, t);
  }

  endOfSimple() { return this.tok.t === 'nl' || this.tok.t === 'eof' || this.isOp(';'); }

  toTarget(e) {
    switch (e.k) {
      case 'Name': case 'Attr': case 'Sub': return e;
      case 'Tuple': case 'List': return { ...e, elts: e.elts.map((x) => this.toTarget(x)) };
      case 'Starred': return { ...e, x: this.toTarget(e.x) };
      default: throw new PySyntaxError('cannot assign to expression', e.line, 0);
    }
  }

  // ------------------------------------------------------------------ expressions
  /** a, b, c  -> Tuple (used where a bare tuple is allowed). */
  exprList() {
    const t = this.tok;
    const first = this.expr();
    if (!this.isOp(',')) return first;
    const elts = [first];
    while (this.eatOp(',')) { if (this.exprEnds()) break; elts.push(this.expr()); }
    return this.node('Tuple', { elts }, t);
  }

  exprListStar() {
    const t = this.tok;
    const one = () => { if (this.isOp('*')) { const s = this.tok; this.p++; return this.node('Starred', { x: this.bitOr() }, s); } return this.expr(); };
    const first = one();
    if (!this.isOp(',')) return first;
    const elts = [first];
    while (this.eatOp(',')) { if (this.exprEnds()) break; elts.push(one()); }
    return this.node('Tuple', { elts }, t);
  }

  exprEnds() {
    const t = this.tok;
    return t.t === 'nl' || t.t === 'eof' || (t.t === 'op' && (t.v === '=' || t.v === ')' || t.v === ']' || t.v === '}' || t.v === ':' || t.v === ';' || AUG.has(t.v)));
  }

  expr() {
    if (this.isKw('lambda')) return this.lambda();
    const t = this.tok;
    const body = this.orTest();
    if (this.isKw('if')) {
      this.p++;
      const test = this.orTest();
      this.expectKw('else');
      return this.node('IfExp', { test, body, orelse: this.expr() }, t);
    }
    return body;
  }

  lambda() {
    const t = this.tok;
    this.p++;
    const params = this.params(':');
    this.expectOp(':');
    return this.node('Lambda', { params, body: this.expr() }, t);
  }

  orTest() {
    const t = this.tok;
    let l = this.andTest();
    if (!this.isKw('or')) return l;
    const vals = [l];
    while (this.eatKw('or')) vals.push(this.andTest());
    return this.node('BoolOp', { op: 'or', vals }, t);
  }

  andTest() {
    const t = this.tok;
    const l = this.notTest();
    if (!this.isKw('and')) return l;
    const vals = [l];
    while (this.eatKw('and')) vals.push(this.notTest());
    return this.node('BoolOp', { op: 'and', vals }, t);
  }

  notTest() {
    const t = this.tok;
    if (this.eatKw('not')) return this.node('Unary', { op: 'not', x: this.notTest() }, t);
    return this.comparison();
  }

  comparison() {
    const t = this.tok;
    const left = this.bitOr();
    const ops = [], rights = [];
    for (;;) {
      const c = this.tok;
      let op = null;
      if (c.t === 'op' && CMP.has(c.v)) { op = c.v; this.p++; } else if (this.isKw('in')) { op = 'in'; this.p++; } else if (this.isKw('not') && this.isKw('in', this.peek())) { op = 'not in'; this.p += 2; } else if (this.isKw('is')) {
        this.p++;
        op = this.eatKw('not') ? 'is not' : 'is';
      }
      if (!op) break;
      ops.push(op);
      rights.push(this.bitOr());
    }
    return ops.length ? this.node('Cmp', { left, ops, rights }, t) : left;
  }

  binLevel(next, ops) {
    const t = this.tok;
    let l = next.call(this);
    while (this.tok.t === 'op' && ops.includes(this.tok.v)) {
      const op = this.tok.v;
      this.p++;
      l = this.node('Bin', { op, l, r: next.call(this) }, t);
    }
    return l;
  }

  bitOr() { return this.binLevel(this.bitXor, ['|']); }
  bitXor() { return this.binLevel(this.bitAnd, ['^']); }
  bitAnd() { return this.binLevel(this.shift, ['&']); }
  shift() { return this.binLevel(this.arith, ['<<', '>>']); }
  arith() { return this.binLevel(this.term, ['+', '-']); }
  term() { return this.binLevel(this.factor, ['*', '/', '//', '%', '@']); }

  factor() {
    const t = this.tok;
    if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '~')) {
      this.p++;
      return this.node('Unary', { op: t.v, x: this.factor() }, t);
    }
    return this.power();
  }

  power() {
    const t = this.tok;
    const base = this.postfix();
    if (this.eatOp('**')) return this.node('Bin', { op: '**', l: base, r: this.factor() }, t);
    return base;
  }

  postfix() {
    const t = this.tok;
    let e = this.atom();
    for (;;) {
      if (this.isOp('(')) {
        this.p++;
        e = this.node('Call', { fn: e, args: this.callArgs() }, t);
      } else if (this.isOp('[')) {
        this.p++;
        const idx = this.subscript();
        this.expectOp(']');
        e = this.node('Sub', { obj: e, idx }, t);
      } else if (this.isOp('.')) {
        this.p++;
        e = this.node('Attr', { obj: e, name: this.expectName() }, t);
      } else break;
    }
    return e;
  }

  callArgs() {
    const args = [];
    while (!this.isOp(')')) {
      if (this.eatOp('**')) args.push({ expr: this.expr(), dstar: true });
      else if (this.eatOp('*')) args.push({ expr: this.expr(), star: true });
      else if (this.tok.t === 'name' && this.isOp('=', this.peek())) {
        const name = this.expectName();
        this.p++;
        args.push({ name, expr: this.expr() });
      } else {
        const e = this.expr();
        if (this.isKw('for')) args.push({ expr: this.comprehension('GenExp', e) });
        else args.push({ expr: e });
      }
      if (!this.eatOp(',')) break;
    }
    this.expectOp(')');
    return args;
  }

  subscript() {
    const t = this.tok;
    const part = () => {
      let lo = null;
      if (!this.isOp(':')) lo = this.expr();
      if (!this.isOp(':')) return lo;
      this.p++;
      let hi = null, step = null;
      if (!this.isOp(':') && !this.isOp(']') && !this.isOp(',')) hi = this.expr();
      if (this.eatOp(':')) { if (!this.isOp(']') && !this.isOp(',')) step = this.expr(); }
      return this.node('Slice', { lo, hi, step }, t);
    };
    const first = part();
    if (!this.isOp(',')) return first;
    const elts = [first];
    while (this.eatOp(',')) { if (this.isOp(']')) break; elts.push(part()); }
    return this.node('Tuple', { elts }, t);
  }

  comprehension(kind, elt, value) {
    const t = this.tok;
    const gens = [];
    while (this.isKw('for')) {
      this.p++;
      const target = this.targetList();
      this.expectKw('in');
      const iter = this.orTest();
      const ifs = [];
      while (this.eatKw('if')) ifs.push(this.orTestNoCond());
      gens.push({ target, iter, ifs });
    }
    return this.node(kind, { elt, value, gens }, t);
  }

  orTestNoCond() { return this.orTest(); }

  atom() {
    const t = this.tok;
    switch (t.t) {
      case 'num': this.p++; return this.node('Num', { v: t.v, float: !!t.float }, t);
      case 'str': {
        this.p++;
        let v = t.v;
        while (this.tok.t === 'str') v += this.toks[this.p++].v; // adjacent literals
        return this.node('Str', { v }, t);
      }
      case 'bytes': this.p++; return this.node('Bytes', { v: t.v }, t);
      case 'fstr': {
        this.p++;
        const parts = [...t.parts];
        while (this.tok.t === 'fstr' || this.tok.t === 'str') { const n = this.toks[this.p++]; parts.push(...(n.t === 'fstr' ? n.parts : [n.v])); }
        return this.node('FStr', { parts: parts.map((q) => (typeof q === 'string' ? q : { ...q, expr: parseExprSource(q.expr, q.line - 1 + 0) })) }, t);
      }
      case 'name': this.p++; return this.node('Name', { id: t.v }, t);
      case 'kw':
        if (t.v === 'None') { this.p++; return this.node('Const', { v: null }, t); }
        if (t.v === 'True') { this.p++; return this.node('Const', { v: true }, t); }
        if (t.v === 'False') { this.p++; return this.node('Const', { v: false }, t); }
        if (t.v === 'lambda') return this.lambda();
        if (t.v === 'await') throw this.err('async / await is not supported');
        throw this.err('invalid syntax');
      case 'op':
        if (t.v === '(') {
          this.p++;
          if (this.eatOp(')')) return this.node('Tuple', { elts: [] }, t);
          const first = this.starOrExpr();
          if (this.isKw('for')) { const c = this.comprehension('GenExp', first); this.expectOp(')'); return c; }
          if (this.isOp(',')) {
            const elts = [first];
            while (this.eatOp(',')) { if (this.isOp(')')) break; elts.push(this.starOrExpr()); }
            this.expectOp(')');
            return this.node('Tuple', { elts }, t);
          }
          this.expectOp(')');
          return first;
        }
        if (t.v === '[') {
          this.p++;
          if (this.eatOp(']')) return this.node('List', { elts: [] }, t);
          const first = this.starOrExpr();
          if (this.isKw('for')) { const c = this.comprehension('ListComp', first); this.expectOp(']'); return c; }
          const elts = [first];
          while (this.eatOp(',')) { if (this.isOp(']')) break; elts.push(this.starOrExpr()); }
          this.expectOp(']');
          return this.node('List', { elts }, t);
        }
        if (t.v === '{') {
          this.p++;
          if (this.eatOp('}')) return this.node('Dict', { keys: [], values: [] }, t);
          if (this.isOp('**')) return this.dictRest(t, [], []);
          const first = this.expr();
          if (this.isOp(':')) {
            this.p++;
            const v = this.expr();
            if (this.isKw('for')) { const c = this.comprehension('DictComp', first, v); this.expectOp('}'); return c; }
            return this.dictRest(t, [first], [v], true);
          }
          if (this.isKw('for')) { const c = this.comprehension('SetComp', first); this.expectOp('}'); return c; }
          const elts = [first];
          while (this.eatOp(',')) { if (this.isOp('}')) break; elts.push(this.expr()); }
          this.expectOp('}');
          return this.node('Set', { elts }, t);
        }
        if (t.v === '...') { this.p++; return this.node('Const', { v: null }, t); }
        throw this.err('invalid syntax');
      default: throw this.err('invalid syntax');
    }
  }

  dictRest(t, keys, values, afterFirst = false) {
    if (afterFirst && !this.eatOp(',')) { this.expectOp('}'); return this.node('Dict', { keys, values }, t); }
    while (!this.isOp('}')) {
      if (this.eatOp('**')) { keys.push(null); values.push(this.bitOr()); } else {
        keys.push(this.expr());
        this.expectOp(':');
        values.push(this.expr());
      }
      if (!this.eatOp(',')) break;
    }
    this.expectOp('}');
    return this.node('Dict', { keys, values }, t);
  }

  starOrExpr() {
    if (this.isOp('*')) { const t = this.tok; this.p++; return this.node('Starred', { x: this.bitOr() }, t); }
    return this.expr();
  }
}

export function parseExprSource(src, lineOffset) {
  const toks = tokenize('(' + src + ')');
  const p = new Parser(toks, lineOffset);
  const e = p.exprListStar();
  if (p.tok.t !== 'nl' && p.tok.t !== 'eof') throw p.err('f-string: invalid syntax');
  return e;
}

export function parse(src) {
  const toks = tokenize(src.replace(/\r\n?/g, '\n'));
  return new Parser(toks).parseModule();
}
