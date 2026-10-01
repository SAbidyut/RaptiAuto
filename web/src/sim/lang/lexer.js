// Tokenizer for the Arduino C/C++ subset understood by RaptiAuto.

export class CompileError extends Error {
  constructor(message, line = 0, col = 0) {
    super(message);
    this.line = line;
    this.col = col;
  }
}

const OPS3 = ['>>=', '<<=', '...'];
const OPS2 = ['->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=',
  '&=', '|=', '^=', '::', '##'];
const OPS1 = '+-*/%&|^~!=<>?:;,.()[]{}#';

const isDigit = (c) => c >= '0' && c <= '9';
const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
const isIdPart = (c) => isIdStart(c) || isDigit(c);
const isHex = (c) => isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');

function readEscape(src, i, line) {
  // src[i] is the char after the backslash; returns [code, nextIndex]
  const c = src[i];
  switch (c) {
    case 'n': return [10, i + 1];
    case 't': return [9, i + 1];
    case 'r': return [13, i + 1];
    case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
      let j = i, v = 0, k = 0;
      while (k < 3 && src[j] >= '0' && src[j] <= '7') { v = v * 8 + (src.charCodeAt(j) - 48); j++; k++; }
      return [v & 255, j];
    }
    case 'x': {
      let j = i + 1, v = 0;
      while (isHex(src[j])) { v = v * 16 + parseInt(src[j], 16); j++; }
      return [v & 255, j];
    }
    case 'a': return [7, i + 1];
    case 'b': return [8, i + 1];
    case 'f': return [12, i + 1];
    case 'v': return [11, i + 1];
    case 'e': return [27, i + 1];
    case '\\': return [92, i + 1];
    case "'": return [39, i + 1];
    case '"': return [34, i + 1];
    case '?': return [63, i + 1];
    default:
      if (c === undefined) throw new CompileError('Unterminated escape sequence', line);
      return [c.charCodeAt(0), i + 1];
  }
}

/**
 * Splits source into tokens. Preprocessor directives become single 'pp' tokens
 * holding the directive text (without '#').
 */
export function lex(src, opts = {}) {
  const directives = !opts.noDirectives;
  const toks = [];
  const n = src.length;
  let i = 0, line = 1, lineStart = 0, atLineStart = true;

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; lineStart = i; atLineStart = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') { i++; continue; }
    if (c === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
      i += src[i + 1] === '\r' ? 3 : 2; line++; lineStart = i; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') { line++; lineStart = k + 1; }
      i = stop;
      continue;
    }
    const col = i - lineStart + 1;

    if (c === '#' && atLineStart && directives) {
      let j = i + 1, text = '';
      const startLine = line;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\' && (src[j + 1] === '\n' || (src[j + 1] === '\r' && src[j + 2] === '\n'))) {
          j += src[j + 1] === '\r' ? 3 : 2; line++; lineStart = j; text += ' '; continue;
        }
        if (src[j] === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; break; }
        if (src[j] === '/' && src[j + 1] === '*') {
          const e = src.indexOf('*/', j + 2);
          const stop = e < 0 ? n : e + 2;
          for (let k = j; k < stop; k++) if (src[k] === '\n') { line++; lineStart = k + 1; }
          j = stop; text += ' '; continue;
        }
        if (src[j] === '"' || src[j] === "'") {
          // keep quoted text verbatim (may contain // or /*)
          const q = src[j];
          text += q; j++;
          while (j < n && src[j] !== q && src[j] !== '\n') {
            if (src[j] === '\\' && j + 1 < n) { text += src[j] + src[j + 1]; j += 2; continue; }
            text += src[j]; j++;
          }
          if (src[j] === q) { text += q; j++; }
          continue;
        }
        text += src[j];
        j++;
      }
      toks.push({ t: 'pp', v: text.replace(/\r/g, '').trim(), line: startLine, col });
      i = j;
      continue;
    }
    atLineStart = false;

    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(src[j])) j++;
      const word = src.slice(i, j);
      // raw string literal R"delim( ... )delim"
      if ((word === 'R' || word === 'u8R' || word === 'LR') && src[j] === '"') {
        const open = src.indexOf('(', j + 1);
        if (open > 0) {
          const delim = src.slice(j + 1, open);
          const close = src.indexOf(')' + delim + '"', open + 1);
          if (close > 0) {
            const val = src.slice(open + 1, close);
            for (let k = i; k < close; k++) if (src[k] === '\n') { line++; lineStart = k + 1; }
            toks.push({ t: 'str', v: val, line, col });
            i = close + delim.length + 2;
            continue;
          }
        }
      }
      // wide / unicode string prefixes: L"..", u8".."
      if ((word === 'L' || word === 'u8' || word === 'u' || word === 'U') && (src[j] === '"' || src[j] === "'")) {
        i = j;
        continue;
      }
      toks.push({ t: 'id', v: word, line, col });
      i = j;
      continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
      let j = i, isFloat = false, value;
      if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2;
        while (isHex(src[j]) || src[j] === "'") j++;
        value = parseInt(src.slice(i + 2, j).replace(/'/g, ''), 16);
      } else if (c === '0' && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        j = i + 2;
        while (src[j] === '0' || src[j] === '1' || src[j] === "'") j++;
        value = parseInt(src.slice(i + 2, j).replace(/'/g, ''), 2);
      } else {
        while (isDigit(src[j]) || src[j] === "'") j++;
        if (src[j] === '.' ) { isFloat = true; j++; while (isDigit(src[j])) j++; }
        if ((src[j] === 'e' || src[j] === 'E') && (isDigit(src[j + 1]) || ((src[j + 1] === '+' || src[j + 1] === '-') && isDigit(src[j + 2])))) {
          isFloat = true; j += 2; while (isDigit(src[j])) j++;
        }
        const text = src.slice(i, j).replace(/'/g, '');
        if (isFloat) value = parseFloat(text);
        else if (text.length > 1 && text[0] === '0') value = parseInt(text, 8) || 0;
        else value = parseInt(text, 10);
      }
      let unsigned = false, longs = 0, fsuffix = false;
      while (j < n) {
        const s = src[j];
        if (s === 'u' || s === 'U') { unsigned = true; j++; }
        else if (s === 'l' || s === 'L') { longs++; j++; }
        else if ((s === 'f' || s === 'F') && isFloat) { fsuffix = true; j++; }
        else break;
      }
      if (j < n && isIdPart(src[j])) {
        throw new CompileError(`Invalid number '${src.slice(i, j + 1)}'`, line, col);
      }
      toks.push({ t: 'num', v: value, isFloat, unsigned, longs, fsuffix, line, col, text: src.slice(i, j) });
      i = j;
      continue;
    }

    if (c === "'") {
      let j = i + 1, v = 0, count = 0;
      while (j < n && src[j] !== "'") {
        if (src[j] === '\n') throw new CompileError('Unterminated character literal', line, col);
        let code;
        if (src[j] === '\\') [code, j] = readEscape(src, j + 1, line);
        else { code = src.charCodeAt(j); j++; }
        v = count === 0 ? code : ((v << 8) | (code & 255));
        count++;
      }
      if (src[j] !== "'") throw new CompileError('Unterminated character literal', line, col);
      if (count === 0) throw new CompileError('Empty character literal', line, col);
      toks.push({ t: 'chr', v: count === 1 && v > 255 ? (v & 255) : v, line, col });
      i = j + 1;
      continue;
    }

    if (c === '"') {
      let j = i + 1, s = '';
      while (j < n && src[j] !== '"') {
        if (src[j] === '\n') throw new CompileError('Missing closing quote " in string', line, col);
        if (src[j] === '\\') {
          if (src[j + 1] === '\n') { j += 2; line++; lineStart = j; continue; }
          let code;
          [code, j] = readEscape(src, j + 1, line);
          s += String.fromCharCode(code);
        } else {
          s += src[j];
          j++;
        }
      }
      if (src[j] !== '"') throw new CompileError('Missing closing quote " in string', line, col);
      toks.push({ t: 'str', v: s, line, col });
      i = j + 1;
      continue;
    }

    let op = null;
    const three = src.substr(i, 3), two = src.substr(i, 2);
    if (OPS3.includes(three)) op = three;
    else if (OPS2.includes(two)) op = two;
    else if (OPS1.includes(c)) op = c;
    if (op) {
      toks.push({ t: 'op', v: op, line, col });
      i += op.length;
      continue;
    }
    if (c === '@' || c === '`' || c.charCodeAt(0) > 127) {
      throw new CompileError(`Stray '${c}' in program`, line, col);
    }
    throw new CompileError(`Unexpected character '${c}'`, line, col);
  }
  toks.push({ t: 'eof', v: '', line, col: 1 });
  return toks;
}
