// Minimal C preprocessor: #define (object & function-like), #undef, #include,
// #if/#ifdef/#ifndef/#elif/#else/#endif, #error. Works on lexer tokens.
import { lex, CompileError } from './lexer.js';

function lexInline(text, line) {
  let toks;
  try {
    toks = lex(text, { noDirectives: true });
  } catch (e) {
    throw new CompileError(e.message, line);
  }
  toks.pop(); // eof
  for (const t of toks) t.line = line;
  return toks;
}

function splitArgs(tokens, start, line) {
  // tokens[start] must be '('; returns [args (array of token arrays), indexAfterClose]
  let depth = 0, i = start, cur = [];
  const args = [];
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.t === 'op' && (t.v === '(' || t.v === '[' || t.v === '{')) {
      if (depth > 0) cur.push(t);
      depth++;
    } else if (t.t === 'op' && (t.v === ')' || t.v === ']' || t.v === '}')) {
      depth--;
      if (depth === 0) { args.push(cur); return [args, i + 1]; }
      cur.push(t);
    } else if (t.t === 'op' && t.v === ',' && depth === 1) {
      args.push(cur); cur = [];
    } else if (t.t === 'eof') {
      break;
    } else {
      cur.push(t);
    }
  }
  throw new CompileError('Unterminated macro argument list', line);
}

function tokenText(t) {
  if (t.t === 'str') return JSON.stringify(t.v);
  if (t.t === 'chr') return `'${String.fromCharCode(t.v)}'`;
  if (t.t === 'num') return t.text ?? String(t.v);
  return String(t.v);
}

export class Preprocessor {
  constructor(predefined = {}) {
    this.macros = new Map();
    this.includes = [];
    for (const [k, v] of Object.entries(predefined)) {
      this.macros.set(k, { params: null, body: v === '' ? [] : lexInline(String(v), 0) });
    }
  }

  expand(tokens, disabled = new Set()) {
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.t !== 'id' || disabled.has(t.v) || !this.macros.has(t.v)) { out.push(t); continue; }
      const m = this.macros.get(t.v);
      if (m.params === null) {
        const body = m.body.map((b) => ({ ...b, line: t.line, col: t.col }));
        const next = new Set(disabled); next.add(t.v);
        out.push(...this.expand(body, next));
        continue;
      }
      // function-like: needs '(' next
      const nt = tokens[i + 1];
      if (!nt || nt.t !== 'op' || nt.v !== '(') { out.push(t); continue; }
      const [rawArgs, after] = splitArgs(tokens, i + 1, t.line);
      if (rawArgs.length === 1 && rawArgs[0].length === 0 && m.params.length === 0) rawArgs.length = 0;
      const expandedArgs = rawArgs.map((a) => this.expand(a, disabled));
      const subst = [];
      const body = m.body;
      for (let k = 0; k < body.length; k++) {
        const b = body[k];
        if (b.t === 'op' && b.v === '#' && body[k + 1] && body[k + 1].t === 'id') {
          const pi = m.params.indexOf(body[k + 1].v);
          if (pi >= 0) {
            subst.push({ t: 'str', v: (rawArgs[pi] || []).map(tokenText).join(' '), line: t.line, col: t.col });
            k++;
            continue;
          }
        }
        if (b.t === 'id') {
          let pi = m.params.indexOf(b.v);
          if (b.v === '__VA_ARGS__' && m.variadic) {
            const rest = expandedArgs.slice(m.params.length);
            rest.forEach((a, ai) => {
              if (ai > 0) subst.push({ t: 'op', v: ',', line: t.line, col: t.col });
              subst.push(...a);
            });
            continue;
          }
          if (pi >= 0) {
            const pasteNext = body[k + 1] && body[k + 1].t === 'op' && body[k + 1].v === '##';
            const pastePrev = subst.length && subst[subst.length - 1].paste;
            const arg = pasteNext || pastePrev ? (rawArgs[pi] || []) : (expandedArgs[pi] || []);
            subst.push(...arg.map((a) => ({ ...a, line: t.line, col: t.col })));
            continue;
          }
        }
        if (b.t === 'op' && b.v === '##') {
          // token pasting: merge previous and next token text
          const prev = subst.pop();
          let nextTok = body[k + 1];
          k++;
          if (nextTok && nextTok.t === 'id') {
            const pi = m.params.indexOf(nextTok.v);
            if (pi >= 0) {
              const arg = rawArgs[pi] || [];
              const merged = lexInline((prev ? tokenText(prev) : '') + (arg[0] ? tokenText(arg[0]) : ''), t.line);
              subst.push(...merged, ...arg.slice(1));
              continue;
            }
          }
          const merged = lexInline((prev ? tokenText(prev) : '') + (nextTok ? tokenText(nextTok) : ''), t.line);
          subst.push(...merged);
          continue;
        }
        subst.push({ ...b, line: t.line, col: t.col });
      }
      const next = new Set(disabled); next.add(t.v);
      out.push(...this.expand(subst, next));
      i = after - 1;
    }
    return out;
  }

  evalCondition(text, line) {
    let toks = lexInline(text, line);
    // replace defined X / defined(X)
    const pre = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'id' && t.v === 'defined') {
        let name;
        if (toks[i + 1] && toks[i + 1].v === '(') { name = toks[i + 2]?.v; i += 3; }
        else { name = toks[i + 1]?.v; i += 1; }
        pre.push({ t: 'num', v: this.macros.has(name) ? 1 : 0, line });
      } else pre.push(t);
    }
    toks = this.expand(pre);
    let p = 0;
    const peek = () => toks[p];
    const val = (t) => {
      if (!t) return 0;
      if (t.t === 'num' || t.t === 'chr') return Number(t.v) || 0;
      if (t.t === 'id') return t.v === 'true' ? 1 : 0;
      return 0;
    };
    const prec = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7,
      '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
    const unary = () => {
      const t = toks[p++];
      if (!t) return 0;
      if (t.t === 'op') {
        if (t.v === '(') { const v = ternary(); p++; return v; }
        if (t.v === '!') return unary() ? 0 : 1;
        if (t.v === '-') return -unary();
        if (t.v === '+') return +unary();
        if (t.v === '~') return ~unary();
      }
      return val(t);
    };
    const binary = (minPrec) => {
      let left = unary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || !(t.v in prec) || prec[t.v] < minPrec) return left;
        p++;
        const right = binary(prec[t.v] + 1);
        switch (t.v) {
          case '||': left = left || right ? 1 : 0; break;
          case '&&': left = left && right ? 1 : 0; break;
          case '|': left |= right; break;
          case '^': left ^= right; break;
          case '&': left &= right; break;
          case '==': left = left === right ? 1 : 0; break;
          case '!=': left = left !== right ? 1 : 0; break;
          case '<': left = left < right ? 1 : 0; break;
          case '>': left = left > right ? 1 : 0; break;
          case '<=': left = left <= right ? 1 : 0; break;
          case '>=': left = left >= right ? 1 : 0; break;
          case '<<': left <<= right; break;
          case '>>': left >>= right; break;
          case '+': left += right; break;
          case '-': left -= right; break;
          case '*': left *= right; break;
          case '/': left = right ? Math.trunc(left / right) : 0; break;
          case '%': left = right ? left % right : 0; break;
        }
      }
    };
    const ternary = () => {
      const c = binary(1);
      const t = peek();
      if (t && t.t === 'op' && t.v === '?') {
        p++;
        const a = ternary();
        p++; // ':'
        const b = ternary();
        return c ? a : b;
      }
      return c;
    };
    return ternary() !== 0;
  }

  run(tokens) {
    const out = [];
    const stack = []; // {parentActive, active, taken}
    let active = true;
    let chunk = [];
    const flush = () => {
      if (chunk.length) { out.push(...this.expand(chunk)); chunk = []; }
    };
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.t === 'eof') break;
      if (t.t !== 'pp') {
        if (active) chunk.push(t);
        continue;
      }
      const m = /^(\w*)\s*([\s\S]*)$/.exec(t.v);
      const dir = m ? m[1] : '';
      const rest = m ? m[2].trim() : '';
      switch (dir) {
        case 'ifdef':
        case 'ifndef': {
          const name = rest.split(/\s+/)[0];
          const def = this.macros.has(name);
          const cond = dir === 'ifdef' ? def : !def;
          stack.push({ parentActive: active, taken: cond });
          active = active && cond;
          break;
        }
        case 'if': {
          const cond = active ? this.evalCondition(rest, t.line) : false;
          stack.push({ parentActive: active, taken: cond });
          active = active && cond;
          break;
        }
        case 'elif': {
          const top = stack[stack.length - 1];
          if (!top) throw new CompileError('#elif without #if', t.line);
          if (top.taken || !top.parentActive) active = false;
          else {
            const cond = this.evalCondition(rest, t.line);
            top.taken = cond;
            active = cond;
          }
          break;
        }
        case 'else': {
          const top = stack[stack.length - 1];
          if (!top) throw new CompileError('#else without #if', t.line);
          active = top.parentActive && !top.taken;
          top.taken = true;
          break;
        }
        case 'endif': {
          const top = stack.pop();
          if (!top) throw new CompileError('#endif without #if', t.line);
          active = top.parentActive;
          break;
        }
        default:
          if (!active) break;
          flush();
          if (dir === 'define') this.define(rest, t.line);
          else if (dir === 'undef') this.macros.delete(rest.split(/\s+/)[0]);
          else if (dir === 'include') {
            const inc = /^[<"]([^>"]+)[>"]/.exec(rest);
            if (inc) this.includes.push({ name: inc[1], line: t.line });
          } else if (dir === 'error') {
            throw new CompileError('#error ' + rest, t.line);
          }
          // #pragma, #warning, #line, '' (null directive): ignored
      }
    }
    flush();
    if (stack.length) throw new CompileError('Unterminated #if / #ifdef block', tokens[tokens.length - 1]?.line || 0);
    return out;
  }

  define(rest, line) {
    const m = /^([A-Za-z_]\w*)(\()?/.exec(rest);
    if (!m) throw new CompileError('Invalid #define', line);
    const name = m[1];
    if (m[2]) {
      const close = rest.indexOf(')');
      if (close < 0) throw new CompileError('Invalid macro parameter list', line);
      let params = rest.slice(name.length + 1, close).split(',').map((s) => s.trim()).filter(Boolean);
      let variadic = false;
      if (params.length && params[params.length - 1] === '...') { variadic = true; params.pop(); }
      const body = lexInline(rest.slice(close + 1), line);
      this.macros.set(name, { params, variadic, body });
    } else {
      this.macros.set(name, { params: null, body: lexInline(rest.slice(name.length), line) });
    }
  }
}

export function preprocess(src, predefined) {
  const pp = new Preprocessor(predefined);
  const tokens = pp.run(lex(src));
  const last = tokens.length ? tokens[tokens.length - 1] : null;
  tokens.push({ t: 'eof', v: '', line: last ? last.line + 1 : 1, col: 1 });
  return { tokens, includes: pp.includes, macros: pp.macros };
}
