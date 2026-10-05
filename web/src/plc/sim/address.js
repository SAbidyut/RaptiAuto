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
  K: { name: 'Decimal constant', konst: true },
  H: { name: 'Hex constant', konst: true },
  N: { name: 'Master control nesting level', max: 7, pointer: true },
  P: { name: 'Pointer (jump / subroutine label)', max: 255, pointer: true },
};

export const BIT_DEVS = ['X', 'Y', 'M', 'S', 'T', 'C'];
export const WORD_DEVS = ['D', 'T', 'C'];

/** Parse "X17", "M1000", "K50", "H2000", "D10" → {dev, idx} or {dev:'K'|'H', val}. Returns null if invalid. */
export function parseOperand(text) {
  const s = String(text || '').trim().toUpperCase();
  const m = /^([XYMSTCDKHNP])(-?[0-9A-F]+)$/.exec(s);
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

export const isBitOperand = (op) => !!op && BIT_DEVS.includes(op.dev);
export const isWordOperand = (op) => !!op && (WORD_DEVS.includes(op.dev) || op.dev === 'K' || op.dev === 'H');
export const isWritableWord = (op) => !!op && WORD_DEVS.includes(op.dev);

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
  return 'XYMSTCD'.indexOf(op.dev) * 1e5 + op.idx;
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
  M1020: 'Zero flag',
  M1022: 'Carry flag',
  M1067: 'Operation error',
  M1120: 'Retain COM2 settings',
  M1127: 'COM2 transaction complete',
  M1129: 'COM2 receive time-out',
  M1140: 'COM2 receive data error',
  M1143: 'COM2 RTU mode (OFF = ASCII)',
  D1010: 'Present scan time (0.1 ms)',
  D1011: 'Minimum scan time (0.1 ms)',
  D1012: 'Maximum scan time (0.1 ms)',
  D1110: 'AI channel 0 (EX2)', D1111: 'AI channel 1 (EX2)', D1112: 'AI channel 2 (EX2)', D1113: 'AI channel 3 (EX2)',
  D1116: 'AO channel 0 (EX2)', D1117: 'AO channel 1 (EX2)',
  D1120: 'COM2 protocol (H86 = 9600,7,E,1 · H87 = 9600,8,E,1)',
  D1121: 'PLC station address',
  D1129: 'COM2 time-out (ms)',
  D1130: 'COM2 Modbus error code',
};

/** Decode a D1120 protocol word. */
export function decodeD1120(v) {
  const b = v & 0xFFFF;
  const bauds = { 1: 110, 2: 150, 3: 300, 4: 600, 5: 1200, 6: 2400, 7: 4800, 8: 9600, 9: 19200, 10: 38400, 11: 57600, 12: 115200 };
  const parity = ['N', 'O', 'N', 'E'][(b >> 1) & 3];
  return { baud: bauds[(b >> 4) & 15] || 9600, bits: b & 1 ? 8 : 7, parity, stop: b & 8 ? 2 : 1 };
}
