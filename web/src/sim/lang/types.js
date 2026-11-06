// Static type model used by the compiler. Integer widths depend on the board:
// AVR (Uno R3, Nano, Mega...) has 16-bit int and 32-bit double; 32-bit MCUs use 32-bit int and 64-bit double.

export function makeTypes(arch) {
  const avr = arch === 'avr';
  const INT_BITS = avr ? 16 : 32;
  const T = {};
  const int = (name, bits, uns, rank, extra = {}) => (T[name] = { k: 'int', name, bits, uns, rank, ...extra });
  T.void = { k: 'void', name: 'void' };
  T.bool = { k: 'int', name: 'bool', bits: 1, uns: true, rank: 0, isBool: true };
  int('char', 8, false, 1, { isChar: true });
  int('i8', 8, false, 1);
  int('u8', 8, true, 1);
  int('i16', 16, false, 2);
  int('u16', 16, true, 2);
  int('int', INT_BITS, false, 3);
  int('uint', INT_BITS, true, 3);
  int('long', 32, false, 4);
  int('ulong', 32, true, 4);
  int('i32', 32, false, avr ? 4 : 3);
  int('u32', 32, true, avr ? 4 : 3);
  int('i64', 64, false, 5);
  int('u64', 64, true, 5);
  T.float = { k: 'float', name: 'float', bits: 32 };
  T.double = { k: 'float', name: 'double', bits: avr ? 32 : 64 };
  T.String = { k: 'String', name: 'String' };
  T.any = { k: 'any', name: 'any' };
  T.cstr = { k: 'ptr', name: 'char*', to: T.char };
  T.func = { k: 'func', name: 'function' };
  T.funcptr = T.func;
  T.auto = { k: 'auto', name: 'auto' };
  T.avr = avr;
  T.INT_BITS = INT_BITS;
  return T;
}

export const ptrTo = (t) => ({ k: 'ptr', name: (t.name || '?') + '*', to: t });
export const arrOf = (t, len) => ({ k: 'arr', name: (t.name || '?') + '[]', of: t, len });

export const isFloat = (t) => t.k === 'float';

/** Coercion function applied when a value is stored into a variable of type t. */
export function coercer(t) {
  if (t.k === 'int') {
    if (t.isBool) return (v) => (v ? 1 : 0);
    switch (t.bits) {
      case 8: return t.uns ? (v) => v & 255 : (v) => (v << 24) >> 24;
      case 16: return t.uns ? (v) => v & 65535 : (v) => (v << 16) >> 16;
      case 32: return t.uns ? (v) => v >>> 0 : (v) => v | 0;
      default: return t.uns ? (v) => { v = Math.trunc(+v) || 0; return v < 0 ? v + 18446744073709552000 : v; } : (v) => Math.trunc(+v) || 0;
    }
  }
  if (t.k === 'float') return t.bits === 32 ? (v) => Math.fround(+v) : (v) => +v;
  return null;
}

/** Wraps the result of an integer arithmetic operation into the range of t. */
export function wrapper(t) {
  if (t.k !== 'int') return null;
  if (t.isBool) return (v) => (v ? 1 : 0);
  switch (t.bits) {
    case 8: return t.uns ? (v) => v & 255 : (v) => (v << 24) >> 24;
    case 16: return t.uns ? (v) => v & 65535 : (v) => (v << 16) >> 16;
    case 32: return t.uns ? (v) => v >>> 0 : (v) => v | 0;
    default: return null;
  }
}

export function promote(t, T) {
  if (t.k !== 'int') return t;
  if (t.rank < T.int.rank) {
    // values that fit in int promote to int; on AVR unsigned 16-bit promotes to unsigned int
    if (t.bits < T.int.bits || !t.uns) return T.int;
    return T.uint;
  }
  return t;
}

/** C "usual arithmetic conversions". */
export function commonType(a, b, T) {
  if (a.k === 'any' || b.k === 'any') {
    if (a.k === 'float' || b.k === 'float') return a.k === 'float' ? a : b;
    return T.any;
  }
  if (a.k === 'float' || b.k === 'float') {
    if (a.k === 'float' && b.k === 'float') return a.bits >= b.bits ? a : b;
    return a.k === 'float' ? a : b;
  }
  if (a.k !== 'int' || b.k !== 'int') return T.any;
  a = promote(a, T);
  b = promote(b, T);
  if (a === b) return a;
  if (a.uns === b.uns) return a.rank >= b.rank ? a : b;
  const u = a.uns ? a : b, s = a.uns ? b : a;
  if (u.rank >= s.rank) return u;
  if (s.bits > u.bits) return s;
  // unsigned version of the signed type
  for (const k of ['uint', 'ulong', 'u32', 'u64']) {
    const c = T[k];
    if (c.bits === s.bits && c.rank === s.rank) return c;
  }
  return u;
}

export function sizeOf(t, T) {
  switch (t.k) {
    case 'int': return t.isBool ? 1 : Math.max(1, t.bits / 8);
    case 'float': return t.bits / 8;
    case 'ptr': return T.avr ? 2 : 4;
    case 'String': return T.avr ? 6 : 12;
    case 'arr': return (t.len || 0) * sizeOf(t.of, T);
    case 'struct': {
      let s = 0;
      for (const f of t.cls.fieldList) s += sizeOf(f.type, T);
      return Math.max(1, s);
    }
    default: return T.avr ? 2 : 4;
  }
}

export function typeName(t) {
  if (!t) return '?';
  switch (t.k) {
    case 'int': {
      const names = { char: 'char', i8: 'int8_t', u8: 'byte', i16: 'int16_t', u16: 'uint16_t', int: 'int', uint: 'unsigned int',
        long: 'long', ulong: 'unsigned long', i32: 'int32_t', u32: 'uint32_t', i64: 'long long', u64: 'unsigned long long', bool: 'bool' };
      return names[t.name] || t.name;
    }
    case 'ptr': return typeName(t.to) + '*';
    case 'arr': return typeName(t.of) + '[]';
    case 'obj': return t.cls.name;
    case 'struct': return t.cls.name;
    default: return t.name || t.k;
  }
}
