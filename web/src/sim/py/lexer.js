// Tokenizer for the MicroPython subset: indentation, strings (raw / bytes / f-strings), numbers, operators.
export class PySyntaxError extends Error {
  constructor(message, line = 0, col = 0) {
    super(message);
    this.line = line;
    this.col = col;
  }
}

const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'async', 'await']);

const OPS3 = ['**=', '//=', '>>=', '<<=', '...'];
const OPS2 = ['**', '//', '>>', '<<', '<=', '>=', '==', '!=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '->', ':='];
const OPS1 = '+-*/%&|^~<>()[]{},:.;=@';

const ESC = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"' };

function unescape(s, line) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out += c; continue; }
    const n = s[++i];
    if (n === 'x') { out += String.fromCharCode(parseInt(s.substr(i + 1, 2), 16)); i += 2; } else if (n === 'u') { out += String.fromCharCode(parseInt(s.substr(i + 1, 4), 16)); i += 4; } else if (n === 'N') { throw new PySyntaxError('\\N{...} escapes are not supported', line); } else if (n === '\n') { /* line continuation */ } else if (n in ESC) out += ESC[n];
    else if (n >= '0' && n <= '7') {
      let j = i, v = '';
      while (j < s.length && j < i + 3 && s[j] >= '0' && s[j] <= '7') v += s[j++];
      out += String.fromCharCode(parseInt(v, 8));
      i = j - 1;
    } else out += '\\' + (n ?? '');
  }
  return out;
}

/** Splits an f-string body into literal strings and {expr} fields. */
function fstringParts(body, raw, line) {
  const parts = [];
  let lit = '';
  const flush = () => { if (lit) { parts.push(raw ? lit : unescape(lit, line)); lit = ''; } };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '{') {
      if (body[i + 1] === '{') { lit += '{'; i++; continue; }
      flush();
      let depth = 1, j = i + 1, q = null;
      for (; j < body.length; j++) {
        const d = body[j];
        if (q) { if (d === q) q = null; continue; }
        if (d === '"' || d === "'") q = d;
        else if (d === '{' || d === '[' || d === '(') depth++;
        else if (d === '}' || d === ']' || d === ')') { depth--; if (depth === 0) break; }
      }
      if (j >= body.length) throw new PySyntaxError("f-string: expecting '}'", line);
      let inner = body.slice(i + 1, j);
      let spec = '', conv = '';
      // split off !r / :spec at depth 0 (outside brackets and strings)
      let d2 = 0, q2 = null, cut = -1, cutSpec = -1;
      for (let k = 0; k < inner.length; k++) {
        const ch = inner[k];
        if (q2) { if (ch === q2) q2 = null; continue; }
        if (ch === '"' || ch === "'") q2 = ch;
        else if ('([{'.includes(ch)) d2++;
        else if (')]}'.includes(ch)) d2--;
        else if (d2 === 0 && ch === '!' && inner[k + 1] !== '=' && cut < 0) cut = k;
        else if (d2 === 0 && ch === ':' && cutSpec < 0) { cutSpec = k; break; }
      }
      let exprEnd = inner.length;
      if (cutSpec >= 0) { spec = inner.slice(cutSpec + 1); exprEnd = cutSpec; }
      if (cut >= 0 && cut < exprEnd) { conv = inner.slice(cut + 1, exprEnd).trim(); exprEnd = cut; }
      let expr = inner.slice(0, exprEnd);
      let self = false;
      if (/=\s*$/.test(expr) && !/[=!<>]=\s*$/.test(expr)) { self = true; expr = expr.replace(/=\s*$/, ''); }
      parts.push({ expr: expr.trim(), spec, conv, self: self ? inner.slice(0, exprEnd) : null, line });
      i = j;
    } else if (c === '}') {
      if (body[i + 1] === '}') { lit += '}'; i++; continue; }
      throw new PySyntaxError("f-string: single '}' is not allowed", line);
    } else lit += c;
  }
  flush();
  return parts;
}

export function tokenize(src) {
  const toks = [];
  const indents = [0];
  let i = 0, line = 1, lineStart = 0, depth = 0, atLineStart = true;
  const n = src.length;
  const push = (t, v, extra) => toks.push({ t, v, line, col: i - lineStart + 1, ...extra });

  while (i < n) {
    if (atLineStart && depth === 0) {
      // measure indentation
      let col = 0, j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) { col = src[j] === '\t' ? (col + 8) & ~7 : col + 1; j++; }
      if (j >= n) { i = j; break; }
      if (src[j] === '\n' || src[j] === '\r' || src[j] === '#') {
        // blank / comment-only line
        while (j < n && src[j] !== '\n') j++;
        i = j + 1; line++; lineStart = i;
        continue;
      }
      i = j;
      if (col > indents[indents.length - 1]) { indents.push(col); push('indent'); } else {
        while (col < indents[indents.length - 1]) { indents.pop(); push('dedent'); }
        if (col !== indents[indents.length - 1]) throw new PySyntaxError('unindent does not match any outer indentation level', line, 1);
      }
      atLineStart = false;
    }
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f') { i++; continue; }
    if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '\n') {
      if (depth === 0) { if (toks.length && toks[toks.length - 1].t !== 'nl' && toks[toks.length - 1].t !== 'indent' && toks[toks.length - 1].t !== 'dedent') push('nl'); atLineStart = true; }
      i++; line++; lineStart = i;
      continue;
    }
    if (c === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) { i += src[i + 1] === '\r' ? 3 : 2; line++; lineStart = i; continue; }

    // strings (with prefixes)
    const sm = /^([rRbBfFuU]{0,2})('''|"""|'|")/.exec(src.slice(i, i + 5));
    if (sm && (sm[1] === '' || /^(r|b|f|u|rb|br|fr|rf)$/i.test(sm[1]))) {
      const pre = sm[1].toLowerCase();
      const q = sm[2];
      const startLine = line, col0 = i - lineStart + 1;
      let j = i + sm[0].length, body = '';
      const raw = pre.includes('r');
      for (;;) {
        if (j >= n) throw new PySyntaxError('unterminated string literal', startLine, col0);
        const d = src[j];
        if (d === '\\') { body += d + (src[j + 1] ?? ''); if (src[j + 1] === '\n') { line++; lineStart = j + 2; } j += 2; continue; }
        if (src.startsWith(q, j)) { j += q.length; break; }
        if (d === '\n') {
          if (q.length === 1) throw new PySyntaxError('unterminated string literal', startLine, col0);
          line++; lineStart = j + 1;
        }
        body += d; j++;
      }
      const tok = { line: startLine, col: col0 };
      if (pre.includes('f')) toks.push({ t: 'fstr', parts: fstringParts(body, raw, startLine), ...tok });
      else toks.push({ t: pre.includes('b') ? 'bytes' : 'str', v: raw ? body : unescape(body, startLine), ...tok });
      i = j;
      continue;
    }
    if (/[A-Za-z_\u0080-￿]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w\u0080-￿]/.test(src[j])) j++;
      const w = src.slice(i, j);
      push(KEYWORDS.has(w) ? 'kw' : 'name', w);
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const m = /^(0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
      const txt = m[0].replace(/_/g, '');
      let v, isFloat = false;
      if (/^0[xX]/.test(txt)) v = parseInt(txt.slice(2), 16);
      else if (/^0[oO]/.test(txt)) v = parseInt(txt.slice(2), 8);
      else if (/^0[bB]/.test(txt)) v = parseInt(txt.slice(2), 2);
      else { v = parseFloat(txt); isFloat = /[.eE]/.test(txt); }
      if (src[i + m[0].length] === 'j' || src[i + m[0].length] === 'J') throw new PySyntaxError('complex numbers are not supported', line, i - lineStart + 1);
      push('num', v, { float: isFloat });
      i += m[0].length;
      continue;
    }
    let op = null;
    const s3 = src.substr(i, 3), s2 = src.substr(i, 2);
    if (OPS3.includes(s3)) op = s3; else if (OPS2.includes(s2)) op = s2; else if (OPS1.includes(c)) op = c;
    if (!op) throw new PySyntaxError(`invalid syntax: unexpected character '${c}'`, line, i - lineStart + 1);
    if ('([{'.includes(op)) depth++;
    else if (')]}'.includes(op)) { depth--; if (depth < 0) throw new PySyntaxError('unmatched bracket', line, i - lineStart + 1); }
    push('op', op);
    i += op.length;
  }
  if (depth > 0) throw new PySyntaxError('unexpected end of input (unclosed bracket)', line, 1);
  if (toks.length && toks[toks.length - 1].t !== 'nl') push('nl');
  while (indents.length > 1) { indents.pop(); push('dedent'); }
  push('eof');
  return toks;
}
