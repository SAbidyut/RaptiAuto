// Helpers shared by the example projects: a device / wire builder, the powered PLC base and the
// finishing step that turns a build into a downloaded lab project.
import { makeConn, normalizeLab, labId } from './store.js';
import { hmiId } from './sim/hmi.js';
import { rung } from './sim/dsl.js';

export function builder() {
  const devices = [], conns = [];
  return {
    devices, conns,
    dev(id, type, props = {}, state = {}) { devices.push({ id, type, props, state }); return id; },
    w(a, ap, b, bp, color) { conns.push(makeConn(devices, a, ap, b, bp, color)); },
  };
}

/** MCB + 24 V supply + PLC + laptop, powered and connected. */
export function base(b, plcType = 'dvp-16es2') {
  b.dev('mcb', 'mcb', {}, { on: true });
  b.dev('psu', 'drp024');
  b.dev('plc', plcType, {}, { run: true });
  b.dev('pc', 'laptop');
  b.w('mcb', 'L', 'psu', 'L'); b.w('mcb', 'N', 'psu', 'N'); b.w('mcb', 'PE', 'psu', 'PE');
  b.w('mcb', 'L', 'plc', 'L'); b.w('mcb', 'N', 'plc', 'N'); b.w('mcb', 'PE', 'plc', 'PE');
  b.w('plc', 'S/S', 'psu', '-V1');
  b.w('pc', 'USB', 'plc', 'USB');
}

export const E = (type, x, y, w, h, props = {}) => ({ id: hmiId(), type, x, y, w, h, ...props });

export function finish(meta, b, prog, extra = {}) {
  const p = normalizeLab({
    id: labId('lab'), name: meta.name, created: Date.now(),
    devices: b.devices, conns: b.conns, program: prog,
    plc: { downloaded: extra.noDownload ? null : JSON.parse(JSON.stringify(prog)), latched: null },
    hmi: extra.hmi, fromExample: meta.id,
    // a second PLC's program (already downloaded into it)
    plcs: extra.plcs ? Object.fromEntries(Object.entries(extra.plcs).map(([id, pr]) => [id, { program: pr, plc: { downloaded: JSON.parse(JSON.stringify(pr)), latched: null } }])) : undefined,
    activePlc: extra.plcs ? 'plc' : undefined,
  });
  return p;
}


/** Header band of a DOP-107 screen: title, clock and a button to the other screen. */
export const hmiHdr = (title, other, screen) => [
  E('rect', 12, 10, 776, 58, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
  E('text', 28, 22, 380, 36, { text: title, size: 24, color: '#e2e8f0', align: 'left', bold: true }),
  E('clock', 410, 22, 220, 36, { fmt: 'datetime', size: 15, color: '#93c5fd', align: 'right' }),
  other ? E('goto', 640, 18, 136, 42, { text: other, screen }) : null,
].filter(Boolean);

/** First-scan rung every Modbus master needs: COM2 = 9600 bps 8E1 (H87), Modbus RTU (M1143). */
export const comRung = (extra = []) => rung('First scan: COM2 = 9600 bps 8E1 (H87), Modbus RTU (M1143) — every slave is set the same' + (extra.length ? '; start values' : ''),
  ['M1002 =>| MOV H87 D1120', '=>| SET M1120', ...extra.map((e) => '=>| ' + e), '=> SET M1143']);

/** The RS-485 settings the slaves of the examples share. */
export const COM = { baud: '9600', format: '8E1', protocol: 'RTU' };

/** A drive set up for Modbus RTU control from the PLC (station 1, 9600 bps 8E1). */
export const VFD_MODBUS = { params: { _v: 2, '00-20': 1, '00-21': 2, '09-00': 1, '09-01': 9.6, '09-04': 14, '01-12': 4, '01-13': 4 } };
