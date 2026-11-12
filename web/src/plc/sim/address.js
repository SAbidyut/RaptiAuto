// Delta DVP device addressing: X/Y are octal (X0…X7, X10…X17), M/S/T/C/D are decimal,
// K is a decimal constant and H a hexadecimal constant.

export const DEVICES = {
  X: { name: 'Input relay', bit: true, octal: true, max: 0o377, modbus: 0x0400 },
  Y: { name: 'Output relay', bit: true, octal: true, max: 0o377, modbus: 0x0500 },
  M: { name: 'Auxiliary relay', bit: true, max: 4095, modbus: 0x0800 },
  S: { name: 'Step relay', bit: true, max: 1023, modbus: 0x0000 },
  T: { name: 'Timer', bit: true, word: true, max: 255, modbus: 0x0600 },
  C: { name: 'Counter', bit: true, word: true, max: 255, modbus: 0x0E00 },
  D: { name: 'Data register', word: true, max: 9999, modbus: 0x1000 },
  E: { name: 'Index register (E0–E7; with F as the high word in 32-bit instructions)', word: true, max: 7 },
  F: { name: 'Index register (F0–F7)', word: true, max: 7 },
  K: { name: 'Decimal constant', konst: true },
  H: { name: 'Hex constant', konst: true },
  FL: { name: 'Floating-point constant', konst: true },
  KX: { name: 'Digit of X inputs (K1 = 4 bits)', digits: 'X' },
  KY: { name: 'Digit of Y outputs (K1 = 4 bits)', digits: 'Y' },
  KM: { name: 'Digit of M relays (K1 = 4 bits)', digits: 'M' },
  KS: { name: 'Digit of S relays (K1 = 4 bits)', digits: 'S' },
  N: { name: 'Master control nesting level', max: 7, pointer: true },
  P: { name: 'Pointer (jump / subroutine label)', max: 255, pointer: true },
};

/**
 * Parse an operand → {dev, idx} for devices, {dev:'K'|'H'|'FL', val} for constants, or null.
 *   X17 M1000 D10 T5 C200 · K50 K-3 H2000 · F1.5 F-2.5E3 (floating point) · E0…E7 F0…F7 (index)
 *   K4M0 K2Y10 K1X0 (n digits = 4n bits of a bit device) · D10E0 K4M0F1 K10E2 (indexed by E / F)
 */
export function parseOperand(text) {
  const s = String(text || '').trim().toUpperCase();
  // floating-point constant: F with a decimal point or an exponent (F0 … F7 alone are index registers)
  const fl = /^F(-?(?:\d+\.\d*|\.\d+|\d+)(?:E[+-]?\d+)?)$/.exec(s);
  if (fl && !/^F[0-7]$/.test(s)) {
    const val = Number(fl[1]);
    if (!Number.isFinite(val) || Math.abs(val) > 3.4e38) return null;
    return { dev: 'FL', val, text: 'F' + fl[1] };
  }
  // index suffix (E0 … E7 / F0 … F7) on a device or a decimal constant
  const ix = /^(.*[0-9])([EF])([0-7])$/.exec(s);
  if (ix && !/^H/.test(s) && !/^[EF]\d*$/.test(ix[1])) {
    const base = parseOperand(ix[1]);
    if (base && (base.idx !== undefined || base.dev === 'K') && base.dev !== 'P' && base.dev !== 'N' && base.dev !== 'E' && base.dev !== 'F') {
      return { ...base, ix: { dev: ix[2], idx: +ix[3] }, text: base.text + ix[2] + ix[3] };
    }
  }
  // KnX / KnY / KnM / KnS: n digits (4 bits each) of a bit device
  const kn = /^K([1-8])([XYMS])(\d+)$/.exec(s);
  if (kn) {
    const bdev = kn[2], info = DEVICES[bdev];
    if (info.octal && /[89]/.test(kn[3])) return null;
    const idx = info.octal ? parseInt(kn[3], 8) : parseInt(kn[3], 10);
    const n = +kn[1];
    if (idx + n * 4 - 1 > info.max) return null;
    return { dev: 'K' + bdev, n, idx, bdev, text: `K${n}${bdev}${info.octal ? idx.toString(8) : idx}` };
  }
  const m = /^([XYMSTCDKHNPEF])(-?[0-9A-F]+)$/.exec(s);
  if (!m) return null;
  const dev = m[1];
  const num = m[2];
  if (dev === 'K') {
    if (!/^-?\d+$/.test(num)) return null;
    const val = parseInt(num, 10);
    if (val < -2147483648 || val > 2147483647) return null;
    return { dev, val, text: 'K' + val };
  }
  if (dev === 'H') {
    if (!/^[0-9A-F]{1,8}$/.test(num)) return null;
    let val = parseInt(num, 16);
    if (val > 0xFFFF && val <= 0xFFFFFFFF) val = val | 0;
    return { dev, val: val > 0x7FFF && val <= 0xFFFF ? val - 0x10000 : val, raw: parseInt(num, 16), text: 'H' + num.replace(/^0+(?=.)/, '') };
  }
  const info = DEVICES[dev];
  if (!/^\d+$/.test(num)) return null;
  if (info.octal && /[89]/.test(num)) return null;
  const idx = info.octal ? parseInt(num, 8) : parseInt(num, 10);
  if (idx > info.max) return null;
  return { dev, idx, text: dev + (info.octal ? idx.toString(8) : String(idx)) };
}

export function fmtAddr(dev, idx) {
  const info = DEVICES[dev];
  return dev + (info && info.octal ? idx.toString(8) : String(idx));
}

/** Delta DVP Modbus address of a device (used by the HMI link and the comm log). */
export function modbusAddr(dev, idx) {
  if (dev === 'M' && idx >= 1536) return 0xB000 + (idx - 1536);
  if (dev === 'D' && idx >= 4096) return 0x9000 + (idx - 4096);
  return (DEVICES[dev] ? DEVICES[dev].modbus : 0) + idx;
}

/** Sort key so device lists read naturally: X, Y, M, S, T, C, D by number. */
export function addrSortKey(text) {
  const op = parseOperand(text);
  if (!op || op.idx === undefined) return 1e9;
  const dev = op.bdev || op.dev;
  return Math.max(0, 'XYMSTCDEF'.indexOf(dev)) * 1e5 + op.idx + (op.ix ? 0.5 : 0);
}

/** Latched (retentive) ranges of the ES2/EX2 series with default settings. */
export function isLatched(dev, idx) {
  if (dev === 'M') return idx >= 500 && idx <= 999;
  if (dev === 'D') return idx >= 200 && idx <= 999;
  if (dev === 'C') return idx >= 100 && idx <= 199;
  if (dev === 'S') return idx >= 500 && idx <= 899;
  if (dev === 'T') return idx >= 240 && idx <= 255; // accumulative timers
  return false;
}

/** Timer base (ms) and accumulative flag for a timer number (ES2/EX2). */
export function timerInfo(n) {
  if (n >= 250) return { base: 100, acc: true };
  if (n >= 246) return { base: 1, acc: true };
  if (n >= 240) return { base: 10, acc: true };
  if (n >= 200) return { base: 10, acc: false };
  return { base: 100, acc: false };
}

export const SPECIAL = {
  M1000: 'Run monitor (always ON in RUN)',
  M1001: 'Run monitor (always OFF in RUN)',
  M1002: 'Initial pulse (ON for the first scan)',
  M1003: 'Initial pulse (OFF for the first scan)',
  M1011: '10 ms clock pulse',
  M1012: '100 ms clock pulse',
  M1013: '1 s clock pulse',
  M1014: '1 min clock pulse',
  M1018: 'Trigonometric instructions use degrees (OFF = radians)',
  M1020: 'Zero flag',
  M1021: 'Borrow flag',
  M1022: 'Carry flag',
  M1026: 'RAMP: hold the end value (OFF = repeat)',
  M1029: 'CH0 (Y0) pulse output / drum / RAMP complete',
  M1088: 'MBC: count ON bits (OFF = count OFF bits)',
  M1089: 'Matrix: result is zero / last bit',
  M1094: 'Matrix: pointer advances after MBRD / MBWR',
  M1095: 'Matrix: carry / bit read',
  M1096: 'Matrix: bit to write / shift in',
  M1097: 'Matrix: shift / rotate right (OFF = left)',
  M1102: 'CH1 (Y2) pulse output complete',
  M1161: '8-bit mode for ASCI / HEX / CCD / LRC / CRC (OFF = 16-bit)',
  M1165: 'SORT descending (OFF = ascending)',
  M1067: 'Operation error',
  M1120: 'Retain COM2 settings',
  M1127: 'COM2 transaction complete',
  M1129: 'COM2 receive time-out',
  M1140: 'COM2 receive data error',
  M1143: 'COM2 RTU mode (OFF = ASCII)',
  D1010: 'Present scan time (0.1 ms)',
  D1011: 'Minimum scan time (0.1 ms)',
  D1012: 'Maximum scan time (0.1 ms)',
  D1030: 'Y0 output pulses (low word)', D1031: 'Y0 output pulses (high word)',
  D1313: 'RTC second', D1314: 'RTC minute', D1315: 'RTC hour', D1316: 'RTC day', D1317: 'RTC month', D1318: 'RTC day of the week', D1319: 'RTC year',
  D1348: 'CH0 (Y0) current position (low word)', D1349: 'CH0 (Y0) current position (high word)',
  D1350: 'CH1 (Y2) current position (low word)', D1351: 'CH1 (Y2) current position (high word)',
  D1110: 'AI channel 0 (EX2)', D1111: 'AI channel 1 (EX2)', D1112: 'AI channel 2 (EX2)', D1113: 'AI channel 3 (EX2)',
  D1116: 'AO channel 0 (EX2)', D1117: 'AO channel 1 (EX2)',
  D1120: 'COM2 protocol (H86 = 9600,7,E,1 · H87 = 9600,8,E,1)',
  D1121: 'PLC station address',
  D1129: 'COM2 time-out (ms)',
  D1130: 'COM2 Modbus error code',
};
