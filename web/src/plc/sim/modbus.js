// Modbus RTU / ASCII framing (CRC-16, LRC) used to show real frames in the communication log.

export function crc16(bytes) {
  let crc = 0xFFFF;
  for (const b of bytes) {
    crc ^= b & 0xFF;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xA001 : crc >>> 1;
  }
  return crc & 0xFFFF;
}

export function lrc(bytes) {
  let s = 0;
  for (const b of bytes) s = (s + (b & 0xFF)) & 0xFF;
  return (-s) & 0xFF;
}

const hi = (v) => (v >> 8) & 0xFF;
const lo = (v) => v & 0xFF;

/** Request PDU bytes (with station address, without checksum). */
export function requestBytes(station, fc, addr, { count = 1, values = [] } = {}) {
  if (fc === 3 || fc === 1 || fc === 2 || fc === 4) return [station, fc, hi(addr), lo(addr), hi(count), lo(count)];
  if (fc === 5) return [station, 5, hi(addr), lo(addr), values[0] ? 0xFF : 0, 0];
  if (fc === 6) return [station, 6, hi(addr), lo(addr), hi(values[0] & 0xFFFF), lo(values[0] & 0xFFFF)];
  if (fc === 15) {
    const n = values.length, nb = Math.ceil(n / 8), data = new Array(nb).fill(0);
    values.forEach((v, i) => { if (v) data[i >> 3] |= 1 << (i & 7); });
    return [station, 15, hi(addr), lo(addr), hi(n), lo(n), nb, ...data];
  }
  if (fc === 16) {
    const out = [station, 16, hi(addr), lo(addr), hi(values.length), lo(values.length), values.length * 2];
    for (const v of values) out.push(hi(v & 0xFFFF), lo(v & 0xFFFF));
    return out;
  }
  return [station, fc];
}

/** Response PDU bytes. */
export function responseBytes(station, fc, addr, res, req = {}) {
  if (res.exception) return [station, fc | 0x80, res.exception];
  if (fc === 3 || fc === 4) {
    const out = [station, fc, res.data.length * 2];
    for (const v of res.data) out.push(hi(v & 0xFFFF), lo(v & 0xFFFF));
    return out;
  }
  if (fc === 1 || fc === 2) {
    const nb = Math.ceil(res.data.length / 8), data = new Array(nb).fill(0);
    res.data.forEach((v, i) => { if (v) data[i >> 3] |= 1 << (i & 7); });
    return [station, fc, nb, ...data];
  }
  if (fc === 5 || fc === 6) return requestBytes(station, fc, addr, req);
  if (fc === 15 || fc === 16) { const n = (req.values || []).length; return [station, fc, hi(addr), lo(addr), hi(n), lo(n)]; }
  return [station, fc];
}

const hex2 = (b) => b.toString(16).toUpperCase().padStart(2, '0');

/** Encode for display: RTU → "01 06 20 00 00 12 02 07", ASCII → ":010620000012C7␍␊". */
export function encodeFrame(bytes, mode) {
  if (mode === 'RTU') {
    const c = crc16(bytes);
    return [...bytes, c & 0xFF, c >> 8].map(hex2).join(' ');
  }
  return ':' + bytes.map(hex2).join('') + hex2(lrc(bytes)) + '␍␊';
}

/** Bytes on the wire (for timing). */
export function frameChars(bytes, mode) { return mode === 'RTU' ? bytes.length + 2 : bytes.length * 2 + 5; }

/** Transmission time in ms of a frame. */
export function frameMs(bytes, fmt) {
  const bitsPerChar = 1 + fmt.bits + (fmt.parity === 'N' ? 0 : 1) + fmt.stop;
  const silence = fmt.mode === 'RTU' ? 3.5 : 0;
  return ((frameChars(bytes, fmt.mode) + silence) * bitsPerChar * 1000) / fmt.baud;
}

export const fmtName = (f) => `${f.baud} ${f.bits}${f.parity}${f.stop} ${f.mode}`;

/** Two serial ports understand each other when baud, data bits, parity and mode match (stop bits are tolerated). */
export function formatsMatch(a, b) {
  return a.baud === b.baud && a.bits === b.bits && a.parity === b.parity && a.mode === b.mode;
}

export const EXCEPTIONS = { 1: 'Illegal function', 2: 'Illegal data address', 3: 'Illegal data value', 4: 'Slave device failure' };
