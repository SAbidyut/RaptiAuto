// Ready-made PLC lab projects (each one fully wired, programmed and downloaded).
import { rung, program } from './sim/dsl.js';
import { makeConn, normalizeLab, labId } from './store.js';
import { hmiId } from './sim/hmi.js';

function builder() {
  const devices = [], conns = [];
  return {
    devices, conns,
    dev(id, type, props = {}, state = {}) { devices.push({ id, type, props, state }); return id; },
    w(a, ap, b, bp, color) { conns.push(makeConn(devices, a, ap, b, bp, color)); },
  };
}

/** MCB + 24 V supply + PLC + laptop, powered and connected. */
function base(b, plcType = 'dvp-16es2') {
  b.dev('mcb', 'mcb', {}, { on: true });
  b.dev('psu', 'drp024');
  b.dev('plc', plcType, {}, { run: true });
  b.dev('pc', 'laptop');
  b.w('mcb', 'L', 'psu', 'L'); b.w('mcb', 'N', 'psu', 'N'); b.w('mcb', 'PE', 'psu', 'PE');
  b.w('mcb', 'L', 'plc', 'L'); b.w('mcb', 'N', 'plc', 'N'); b.w('mcb', 'PE', 'plc', 'PE');
  b.w('plc', 'S/S', 'psu', '-V1');
  b.w('pc', 'USB', 'plc', 'USB');
}

const E = (type, x, y, w, h, props = {}) => ({ id: hmiId(), type, x, y, w, h, ...props });

function finish(meta, b, prog, extra = {}) {
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
const hmiHdr = (title, other, screen) => [
  E('rect', 12, 10, 776, 58, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
  E('text', 28, 22, 380, 36, { text: title, size: 24, color: '#e2e8f0', align: 'left', bold: true }),
  E('clock', 410, 22, 220, 36, { fmt: 'datetime', size: 15, color: '#93c5fd', align: 'right' }),
  other ? E('goto', 640, 18, 136, 42, { text: other, screen }) : null,
].filter(Boolean);

/** First-scan rung every Modbus master needs: COM2 = 9600 bps 8E1 (H87), Modbus RTU (M1143). */
const comRung = (extra = []) => rung('First scan: COM2 = 9600 bps 8E1 (H87), Modbus RTU (M1143) — every slave is set the same' + (extra.length ? '; start values' : ''),
  ['M1002 =>| MOV H87 D1120', '=>| SET M1120', ...extra.map((e) => '=>| ' + e), '=> SET M1143']);

/** The RS-485 settings the slaves of the examples share. */
const COM = { baud: '9600', format: '8E1', protocol: 'RTU' };

/** A drive set up for Modbus RTU control from the PLC (station 1, 9600 bps 8E1). */
const VFD_MODBUS = { params: { _v: 2, '00-20': 1, '00-21': 2, '09-00': 1, '09-01': 9.6, '09-04': 14, '01-12': 4, '01-13': 4 } };

export const LAB_EXAMPLES = [
  {
    id: 'start-stop', name: 'Start / Stop latching circuit', level: 'beginner', tags: ['PLC', 'Ladder'],
    description: 'The classic self-holding circuit: START (X0) latches Y0, the NC STOP button (X1) breaks it. Two pilot lamps show the state.',
    build() {
      const b = builder();
      base(b);
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('lrun', 'lamp', { label: 'RUN', color: 'green' });
      b.dev('lstop', 'lamp', { label: 'STOPPED', color: 'red' });
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lstop', 'X1');
      b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lstop', 'X2', '#1e3a8a');
      const prog = program([
        rung('Self-holding: START (X0) turns Y0 on, Y0 keeps itself on, the NC STOP button (X1) breaks the circuit', ['X0| X1 => OUT Y0', 'Y0']),
        rung('Stopped lamp: on while Y0 is off', ['/Y0 => OUT Y1']),
      ], { X0: 'START push button', X1: 'STOP push button (NC)', Y0: 'RUN lamp / motor contactor', Y1: 'STOPPED lamp' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'traffic-light', name: 'Traffic light with timers', level: 'beginner', tags: ['TMR', 'Timers'],
    description: 'Red 5 s → green 4 s → amber 2 s using a chain of 100 ms timers (TMR). With the selector OFF the amber lamp flashes using the 1 s clock M1013.',
    build() {
      const b = builder();
      base(b);
      b.dev('sel', 'selector', { label: 'ENABLE', pos0: 'OFF', pos1: 'ON' }, { on: true });
      b.dev('red', 'lamp', { label: 'RED', color: 'red' });
      b.dev('amber', 'lamp', { label: 'AMBER', color: 'yellow' });
      b.dev('green', 'lamp', { label: 'GREEN', color: 'green' });
      b.w('psu', '+V1', 'sel', '13'); b.w('sel', '14', 'plc', 'X0');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'red', 'X1'); b.w('plc', 'Y1', 'amber', 'X1'); b.w('plc', 'Y2', 'green', 'X1');
      b.w('red', 'X2', 'psu', '-V2'); b.w('red', 'X2', 'amber', 'X2', '#1e3a8a'); b.w('amber', 'X2', 'green', 'X2', '#1e3a8a');
      const prog = program([
        rung('T0: red phase 5.0 s (restarts when T2 finishes)', ['X0 /T2 => TMR T0 K50']),
        rung('T1: green phase 4.0 s', ['T0 => TMR T1 K40']),
        rung('T2: amber phase 2.0 s', ['T1 => TMR T2 K20']),
        rung('Red lamp', ['X0 /T0 => OUT Y0']),
        rung('Green lamp', ['T0 /T1 => OUT Y2']),
        rung('Amber lamp: amber phase, or flashing (M1013 = 1 s clock) while disabled', ['T1 -| => OUT Y1', '/X0 M1013']),
      ], { X0: 'ENABLE selector', Y0: 'RED lamp', Y1: 'AMBER lamp', Y2: 'GREEN lamp', T0: 'red time', T1: 'green time', T2: 'amber time' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'part-counter', name: 'Part counter with sensor + HMI', level: 'intermediate', tags: ['CNT', 'HMI', 'Sensor'],
    description: 'A PNP proximity sensor (X0) counts parts with CNT C0. The target is set on the DOP-107 HMI (D0). When the box is full the lamp lights and the buzzer beeps.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('prox', 'prox', { label: 'PART' });
      b.dev('reset', 'pb', { label: 'RESET', color: 'blue', contact: 'NO' });
      b.dev('full', 'lamp', { label: 'BOX FULL', color: 'yellow' });
      b.dev('buz', 'buzzer', { label: 'ALARM' });
      b.w('psu', '+V1', 'prox', 'BN'); b.w('prox', 'BU', 'psu', '-V1'); b.w('prox', 'BK', 'plc', 'X0');
      b.w('prox', 'BN', 'reset', '13', '#dc2626'); b.w('reset', '14', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'full', 'X1'); b.w('plc', 'Y1', 'buz', '+');
      b.w('full', 'X2', 'psu', '-V2'); b.w('full', 'X2', 'buz', '-', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      const prog = program([
        rung('Default target (5 parts) at the first scan', ['M1002 => MOV K5 D0']),
        rung('Count one part on every rising edge of the sensor', ['X0 => CNT C0 D0']),
        rung('Reset with the RESET button (X1) or the HMI button (M10)', ['X1| => RST C0', 'M10']),
        rung('Box full lamp', ['C0 => OUT Y0']),
        rung('Buzzer beeps while full (1 s clock)', ['C0 M1013 => OUT Y1']),
      ], { X0: 'Part sensor', X1: 'RESET button', Y0: 'BOX FULL lamp', Y1: 'Buzzer', C0: 'Part counter', D0: 'Target', M10: 'HMI reset' });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Counter', bg: '#0b1630', elements: [
            E('rect', 16, 14, 768, 64, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
            E('text', 36, 28, 600, 40, { text: 'PART COUNTER · DVP16ES2', size: 28, color: '#e2e8f0', align: 'left', bold: true }),
            E('rect', 16, 94, 380, 370, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'PRODUCTION' }),
            E('num', 40, 140, 330, 90, { word: 'C0', dec: 0, unit: 'pcs', label: 'COUNT' }),
            E('input', 40, 250, 330, 80, { word: 'D0', dec: 0, unit: 'pcs', label: 'TARGET', min: 1, max: 999 }),
            E('button', 40, 356, 330, 84, { text: 'RESET', bit: 'M10', mode: 'momentary', color: 'blue' }),
            E('rect', 412, 94, 372, 370, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'STATUS' }),
            E('lamp', 440, 150, 100, 100, { bit: 'C0', text: 'BOX FULL', onColor: '#f59e0b', offColor: '#334155', shape: 'circle' }),
            E('lamp', 570, 150, 100, 100, { bit: 'X0', text: 'SENSOR', onColor: '#22c55e', offColor: '#334155', shape: 'circle' }),
            E('bar', 700, 140, 60, 290, { word: 'C0', dec: 0, label: 'FILL', min: 0, max: 10, color: '#22d3ee' }),
            E('meter', 440, 290, 230, 160, { word: 'C0', dec: 0, unit: 'pcs', label: 'COUNT', min: 0, max: 10 }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'vfd-terminals', name: 'VFD forward / reverse, 2 speeds', level: 'intermediate', tags: ['VFD', 'MS300', 'Interlock'],
    description: 'Interlocked FWD / REV control of a Delta MS300 through its terminals: PLC relays drive MI1 (FWD), MI2 (REV) and MI3 / MI4 (multi-step speeds 15 Hz / 50 Hz).',
    build() {
      const b = builder();
      base(b);
      b.dev('vfd', 'ms300', {}, { params: { _v: 2, '00-21': 1, '00-20': 0, '02-00': 1, '01-12': 3, '01-13': 3, '04-00': 15, '04-01': 50 } });
      b.dev('motor', 'motor', { load: 40 });
      b.dev('fwd', 'pb', { label: 'FWD', color: 'green', contact: 'NO' });
      b.dev('rev', 'pb', { label: 'REV', color: 'yellow', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('spd', 'selector', { label: 'SPEED', pos0: 'LOW', pos1: 'HIGH' });
      b.dev('lf', 'lamp', { label: 'FWD', color: 'green' });
      b.dev('lr', 'lamp', { label: 'REV', color: 'yellow' });
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'fwd', '13'); b.w('fwd', '13', 'rev', '13', '#dc2626'); b.w('rev', '13', 'stop', '11', '#dc2626'); b.w('stop', '11', 'spd', '13', '#dc2626');
      b.w('fwd', '14', 'plc', 'X0'); b.w('rev', '14', 'plc', 'X1'); b.w('stop', '12', 'plc', 'X2'); b.w('spd', '14', 'plc', 'X3');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lf', 'X1'); b.w('plc', 'Y1', 'lr', 'X1'); b.w('lf', 'X2', 'psu', '-V2'); b.w('lf', 'X2', 'lr', 'X2', '#1e3a8a');
      b.w('plc', 'C1', 'vfd', 'DCM');
      b.w('plc', 'Y4', 'vfd', 'MI1'); b.w('plc', 'Y5', 'vfd', 'MI2'); b.w('plc', 'Y6', 'vfd', 'MI3'); b.w('plc', 'Y7', 'vfd', 'MI4');
      const prog = program([
        rung('Forward run M0: FWD (X0) latches, STOP (X2, NC) breaks, interlocked with reverse M1', ['X0| X2 /M1 => OUT M0', 'M0']),
        rung('Reverse run M1: REV (X1) latches, interlocked with forward M0', ['X1| X2 /M0 => OUT M1', 'M1']),
        rung('Forward: MI1 (Y4) + FWD lamp (Y0)', ['M0 =>| OUT Y4', '=> OUT Y0']),
        rung('Reverse: MI2 (Y5) + REV lamp (Y1)', ['M1 =>| OUT Y5', '=> OUT Y1']),
        rung('LOW speed → MI3 (multi-step 1 = Pr.04-00 = 15 Hz)', ['/X3 => OUT Y6']),
        rung('HIGH speed → MI4 (multi-step 2 = Pr.04-01 = 50 Hz)', ['X3 => OUT Y7']),
      ], { X0: 'FWD button', X1: 'REV button', X2: 'STOP button (NC)', X3: 'SPEED selector', Y4: 'VFD MI1 (FWD)', Y5: 'VFD MI2 (REV)', Y6: 'VFD MI3 (step 1)', Y7: 'VFD MI4 (step 2)', M0: 'Forward run', M1: 'Reverse run' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'contactor-starter', name: 'Motor starter: contactor + overload relay', level: 'intermediate', tags: ['Contactor', 'Overload', 'Sensor'],
    description: 'A conveyor motor switched by a magnetic contactor (KM1) with a thermal overload relay (F1). START latches the PLC, Y0 pulls in KM1, its auxiliary contact 13–14 tells the PLC it really closed, then the drive runs. The overload NC 95–96 and a photoelectric sensor (box at the end of the belt) stop the motor.',
    build() {
      const b = builder();
      base(b);
      b.dev('vfd', 'ms300', {}, { params: { _v: 2, '00-21': 1, '00-20': 0, '02-00': 1, '01-12': 2, '01-13': 1, '04-00': 40 } });
      b.dev('km1', 'contactor', { label: 'KM1', coil: '24DC' });
      b.dev('f1', 'olr', { label: 'F1' }, { tripped: false });
      b.dev('motor', 'motor', { load: 40 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('photo', 'photo', { label: 'BOX END', output: 'PNP' }, { target: false });
      b.dev('lrun', 'lamp', { label: 'RUN', color: 'green' });
      b.dev('lfault', 'lamp', { label: 'OVERLOAD', color: 'red' });
      // power: drive → contactor main contacts → overload relay → motor
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('vfd', 'U/T1', 'km1', 'L1'); b.w('vfd', 'V/T2', 'km1', 'L2'); b.w('vfd', 'W/T3', 'km1', 'L3');
      b.w('km1', 'T1', 'f1', 'L1'); b.w('km1', 'T2', 'f1', 'L2'); b.w('km1', 'T3', 'f1', 'L3');
      b.w('f1', 'T1', 'motor', 'U'); b.w('f1', 'T2', 'motor', 'V'); b.w('f1', 'T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      // 24 V inputs: START, STOP (NC), overload 95–96 (NC), KM1 feedback 13–14, photo sensor
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626'); b.w('stop', '11', 'photo', 'BN', '#dc2626');
      b.w('psu', '+V1', 'f1', '95'); b.w('f1', '95', 'km1', '13', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1'); b.w('f1', '96', 'plc', 'X2'); b.w('km1', '14', 'plc', 'X3'); b.w('photo', 'BK', 'plc', 'X4');
      b.w('photo', 'BU', 'psu', '-V2');
      // outputs: KM1 coil, lamps, drive run + speed
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'km1', 'A1'); b.w('km1', 'A2', 'psu', '-V2');
      b.w('plc', 'Y1', 'lrun', 'X1'); b.w('plc', 'Y2', 'lfault', 'X1'); b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lfault', 'X2', '#1e3a8a');
      b.w('plc', 'C1', 'vfd', 'DCM');
      b.w('plc', 'Y4', 'vfd', 'MI1'); b.w('plc', 'Y6', 'vfd', 'MI3');
      const prog = program([
        rung('Run latch M0: START (X0) sets it, STOP (X1, NC) and the overload contact 95–96 (X2, NC) break it', ['X0| X1 X2 => OUT M0', 'M0']),
        rung('KM1 coil (Y0) while running', ['M0 => OUT Y0']),
        rung('Drive FWD (MI1, Y4) only when KM1 has really closed (13–14 → X3) and no box is at the belt end (X4)', ['M0 X3 /X4 => OUT Y4']),
        rung('Speed: multi-step 1 (MI3 → Pr.04-00 = 40 Hz)', ['M1000 => OUT Y6']),
        rung('RUN lamp from the contactor feedback', ['X3 => OUT Y1']),
        rung('OVERLOAD lamp when F1 has tripped', ['/X2 => OUT Y2']),
      ], { X0: 'START push button', X1: 'STOP push button (NC)', X2: 'Overload relay F1 95–96 (NC)', X3: 'KM1 auxiliary 13–14', X4: 'Photo sensor: box at belt end', Y0: 'KM1 contactor coil', Y1: 'RUN lamp', Y2: 'OVERLOAD lamp', Y4: 'VFD MI1 (FWD)', Y6: 'VFD MI3 (speed 1)', M0: 'Run latch' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'vfd-modbus-hmi', name: 'VFD speed control · Modbus RTU + HMI', level: 'advanced', tags: ['MODRW', 'RS-485', 'HMI', 'VFD'], featured: true,
    description: 'The complete system: DOP-107 HMI ↔ DVP PLC (COM1) ↔ MS300 VFD over RS-485 Modbus RTU (MODRW). Set the speed on the HMI, read back frequency, current and fault code.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('vfd', 'ms300', {}, { params: { _v: 2, '00-20': 1, '00-21': 2, '09-00': 1, '09-01': 9.6, '09-04': 14, '01-12': 5, '01-13': 5 } });
      b.dev('motor', 'motor', { load: 40 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('es', 'estop', { label: 'E-STOP' });
      b.dev('lrun', 'lamp', { label: 'RUN', color: 'green' });
      b.dev('lflt', 'lamp', { label: 'FAULT', color: 'red' });
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626'); b.w('stop', '11', 'es', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1'); b.w('es', '12', 'plc', 'X2');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lflt', 'X1'); b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lflt', 'X2', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      b.w('plc', 'COM2', 'vfd', 'RS485');
      const prog = program([
        rung('First scan: COM2 = 9600 bps, 8 data bits, even parity, 1 stop (H87), Modbus RTU (M1143); default speed 30.00 Hz', ['M1002 =>| MOV H87 D1120', '=>| SET M1120', '=>| SET M1143', '=> MOV K3000 D10']),
        rung('Run latch: START (X0) or HMI START (M10); STOP (X1, NC), E-STOP (X2, NC), HMI STOP (M11) or a fault (Y1) stop it', ['X0| X1 X2 /M11 /Y1 => OUT M0', 'M10|', 'M0']),
        rung('Command word for 2000H: H12 = RUN + FWD', ['M0 => MOV H12 D0']),
        rung('Command word for 2000H: H1 = STOP', ['/M0 => MOV H1 D0']),
        rung('Limit the speed set point to 0 – 50.00 Hz', ['D10>K5000 => MOV K5000 D10']),
        rung('Write the run command to the drive (station 1, function 06, 2000H)', ['M1000 => MODRW K1 K6 H2000 D0 K1']),
        rung('Write the frequency command (2001H, 0.01 Hz units)', ['M1000 => MODRW K1 K6 H2001 D10 K1']),
        rung('Read output frequency + output current (2103H, 2104H) into D20, D21', ['M1000 => MODRW K1 K3 H2103 D20 K2']),
        rung('Read the drive fault code (2100H) into D22', ['M1000 => MODRW K1 K3 H2100 D22 K1']),
        rung('Motor speed ≈ Hz × 28 rpm (4-pole motor): D28', ['M1000 =>| DIV D20 K10 D26', '=>| MUL D26 K28 D24', '=> DIV D24 K10 D28']),
        rung('RUN lamp', ['M0 => OUT Y0']),
        rung('FAULT lamp: drive fault code ≠ 0 or COM2 time-out (M1129)', ['D22<>K0| => OUT Y1', 'M1129']),
        rung('HMI RESET (M12): reset the drive fault over RS-485 (RSTEF = 2002H bit 1)', ['M12 => RSTEF K1 K1']),
        rung('HMI status word D30: 0 = stopped, 1 = running, 2 = fault', ['/M0 /Y1 => MOV K0 D30', 'M0 /Y1 => MOV K1 D30', 'Y1 => MOV K2 D30']),
      ], {
        X0: 'START button', X1: 'STOP button (NC)', X2: 'E-STOP (NC)', Y0: 'RUN lamp', Y1: 'FAULT lamp', M0: 'Run command', M10: 'HMI START', M11: 'HMI STOP', M12: 'HMI fault RESET',
        D0: 'VFD command word', D10: 'Speed set point (0.01 Hz)', D20: 'Output frequency (0.01 Hz)', D21: 'Output current (0.01 A)', D22: 'VFD fault code', D28: 'Motor speed (rpm)', D30: 'HMI status (0 stop, 1 run, 2 fault)',
      });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Drive', bg: '#0b1630', elements: [
            E('rect', 12, 10, 776, 58, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
            E('text', 28, 22, 300, 36, { text: 'VFD SPEED CONTROL', size: 24, color: '#e2e8f0', align: 'left', bold: true }),
            E('clock', 300, 22, 210, 36, { fmt: 'datetime', size: 15, color: '#93c5fd', align: 'right' }),
            E('goto', 520, 18, 110, 42, { text: 'ALARMS', screen: 1 }),
            E('state', 640, 18, 136, 42, { word: 'D30', bit: '', label: '', states: '0:STOPPED:#475569|1:RUNNING:#16a34a|2:FAULT:#dc2626' }),
            E('rect', 12, 80, 250, 388, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'CONTROL' }),
            E('button', 30, 112, 214, 64, { text: 'START', bit: 'M10', mode: 'momentary', color: 'green' }),
            E('button', 30, 184, 214, 64, { text: 'STOP', bit: 'M11', mode: 'momentary', color: 'red' }),
            E('input', 30, 256, 214, 64, { word: 'D10', dec: 2, unit: 'Hz', label: 'SET SPEED', min: 0, max: 50 }),
            E('setval', 30, 328, 104, 48, { word: 'D10', mode: 'dec', value: 500, min: 0, max: 5000, text: '− 5 Hz', color: 'gray' }),
            E('setval', 140, 328, 104, 48, { word: 'D10', mode: 'inc', value: 500, min: 0, max: 5000, text: '+ 5 Hz', color: 'blue' }),
            E('motor', 30, 384, 76, 76, { bit: 'M0', text: '' }),
            E('lamp', 130, 394, 110, 56, { bit: 'Y1', text: 'FAULT', onColor: '#ef4444', offColor: '#334155', shape: 'rect' }),
            E('rect', 274, 80, 514, 210, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'DRIVE STATUS' }),
            E('meter', 288, 112, 220, 168, { word: 'D20', dec: 2, unit: 'Hz', label: 'OUTPUT', min: 0, max: 50 }),
            E('num', 520, 112, 254, 52, { word: 'D20', dec: 2, unit: 'Hz', label: 'FREQUENCY' }),
            E('num', 520, 170, 254, 52, { word: 'D21', dec: 2, unit: 'A', label: 'CURRENT' }),
            E('num', 520, 228, 254, 52, { word: 'D28', dec: 0, unit: 'rpm', label: 'SPEED' }),
            E('trend', 274, 300, 514, 168, { word: 'D20', word2: 'D10', dec: 2, min: 0, max: 50, span: 30, label: 'OUTPUT Hz  /  SET POINT' }),
          ],
        }, {
          id: 's2', name: 'Alarms', bg: '#0b1630', elements: [
            E('rect', 12, 10, 776, 58, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
            E('text', 28, 22, 300, 36, { text: 'ALARMS', size: 24, color: '#e2e8f0', align: 'left', bold: true }),
            E('clock', 300, 22, 300, 36, { fmt: 'datetime', size: 15, color: '#93c5fd', align: 'right' }),
            E('goto', 640, 18, 136, 42, { text: '◀ DRIVE', screen: 0 }),
            E('alarm', 12, 80, 776, 44, { bit: 'Y1', text: 'DRIVE FAULT or COM2 time-out — check the VFD' }),
            E('alarm', 12, 130, 776, 44, { bit: 'M1129', text: 'COM2 Modbus time-out (no answer from the drive)' }),
            E('alarmlist', 12, 184, 560, 284, { label: 'ALARM HISTORY' }),
            E('rect', 584, 184, 204, 284, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'DRIVE' }),
            E('num', 600, 222, 172, 56, { word: 'D22', dec: 0, unit: '', label: 'FAULT CODE' }),
            E('state', 600, 290, 172, 60, { word: 'D30', bit: '', label: 'STATUS', states: '0:STOPPED:#475569|1:RUNNING:#16a34a|2:FAULT:#dc2626' }),
            E('button', 600, 380, 172, 70, { text: 'RESET', bit: 'M12', mode: 'momentary', color: 'orange' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'plc-master-slave', name: 'Two PLCs: Master → Slave over RS-485', level: 'advanced', tags: ['MODRW', 'RS-485', '2 PLCs'], featured: true,
    description: 'PLC 1 (master) sends START / STOP and RESET to PLC 2 (slave, station 2) with MODRW and reads its part counter back. The slave runs the conveyor and counts parts. Tap the PLC chip at the top to program either PLC.',
    build() {
      const b = builder();
      base(b);
      b.devices.find((d) => d.id === 'plc').props.name = 'PLC 1 · Master';
      b.dev('plc2', 'dvp-32es2', { name: 'PLC 2 · Slave' }, { run: true });
      b.w('mcb', 'L', 'plc2', 'L'); b.w('mcb', 'N', 'plc2', 'N'); b.w('mcb', 'PE', 'plc2', 'PE');
      b.w('plc2', 'S/S', 'psu', '-V1');
      // the RS-485 link: COM2 to COM2 (D+ / D- / SG)
      b.w('plc', 'COM2', 'plc2', 'COM2');
      // master: buttons and lamps
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('reset', 'pb', { label: 'RESET', color: 'blue', contact: 'NO' });
      b.dev('lrun', 'lamp', { label: 'LINE ON', color: 'green' });
      b.dev('lfull', 'lamp', { label: 'BATCH OK', color: 'yellow' });
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626'); b.w('stop', '11', 'reset', '13', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1'); b.w('reset', '14', 'plc', 'X2');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lfull', 'X1');
      b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lfull', 'X2', '#1e3a8a');
      // slave: part sensor and the conveyor contactor lamp
      b.dev('prox', 'prox', { label: 'PART' });
      b.dev('lconv', 'lamp', { label: 'CONVEYOR', color: 'white' });
      b.w('psu', '+V1', 'prox', 'BN'); b.w('prox', 'BU', 'psu', '-V1'); b.w('prox', 'BK', 'plc2', 'X0');
      b.w('plc2', 'C0', 'psu', '+V2');
      b.w('plc2', 'Y0', 'lconv', 'X1'); b.w('lconv', 'X2', 'lfull', 'X2', '#1e3a8a');
      const master = program([
        rung('First scan: COM2 = 9600 bps 8E1 (H87), Modbus RTU (M1143) — the slave uses the same settings', ['M1002 =>| MOV H87 D1120', '=>| SET M1120', '=> SET M1143']),
        rung('Line latch: START (X0) turns it on, the NC STOP button (X1) turns it off', ['X0| X1 => OUT M0', 'M0']),
        rung('D0 = run command for the slave (1 = run, 0 = stop)', ['M0 => MOV K1 D0', '/M0 => MOV K0 D0']),
        rung('D1 = reset command for the slave (1 while RESET is held)', ['X2 => MOV K1 D1', '/X2 => MOV K0 D1']),
        rung('Write D0, D1 to the slave\'s D100, D101 (station 2, function 16, 1064H = D100)', ['M1000 => MODRW K2 K16 H1064 D0 K2']),
        rung('Read the slave\'s counter C0 (0E00H) into D10', ['M1000 => MODRW K2 K3 H0E00 D10 K1']),
        rung('LINE ON lamp', ['M0 => OUT Y0']),
        rung('BATCH OK lamp when the slave has counted 5 parts; flashes if the slave does not answer (M1129)', ['D10>=K5 -| => OUT Y1', 'M1129 M1013']),
      ], { X0: 'START', X1: 'STOP (NC)', X2: 'RESET', Y0: 'LINE ON lamp', Y1: 'BATCH OK lamp', M0: 'Line running', D0: 'Run command → slave D100', D1: 'Reset command → slave D101', D10: 'Parts counted by the slave' });
      const slave = program([
        rung('First scan: station address 2 (D1121) and the same COM2 format as the master', ['M1002 =>| MOV K2 D1121', '=>| MOV H87 D1120', '=>| SET M1120', '=> SET M1143']),
        rung('The master writes D100 = 1 to run the conveyor', ['D100=K1 => OUT Y0']),
        rung('Count parts while the conveyor runs', ['X0 Y0 => CNT C0 K999']),
        rung('The master writes D101 = 1 to reset the counter', ['D101=K1 => RST C0']),
      ], { X0: 'Part sensor', Y0: 'Conveyor', C0: 'Part counter (read by the master)', D100: 'Run command from the master', D101: 'Reset command from the master' });
      return finish(this, b, master, { plcs: { plc2: slave } });
    },
  },
  {
    id: 'modbus-network', name: 'Modbus RTU network: PLC · VFD · DTB · sensor · meter · HMI', level: 'advanced', tags: ['Modbus', 'RS-485', 'MODRW', 'DTB', 'HMI'], featured: true,
    description: 'One RS-485 bus, one master and four slaves: the PLC (COM2) runs the MS300 conveyor drive (station 1), sets and reads the DTB4848 oven controller (station 2), reads the cabinet temperature / humidity sensor (station 3) and the energy meter (station 4). The HMI talks to the PLC on COM1. Open the Network view to see the whole RS-485 line, its station addresses and which device answers.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      // rail 2, right → left: the drive, the oven controller, the sensor, the energy meter
      b.dev('vfd', 'ms300', {}, { params: { _v: 2, '00-20': 1, '00-21': 2, '09-00': 1, '09-01': 9.6, '09-04': 14, '01-12': 4, '01-13': 4 } });
      const com = { baud: '9600', format: '8E1', protocol: 'RTU' };
      b.dev('dtb', 'dtb4848', { label: 'OVEN', station: 2, ...com }, { sv: 150, run: true, mode: 0 });
      b.dev('th', 'th-rs485', { label: 'CABINET', station: 3, ...com }, { temp: 31.5, rh: 48 });
      b.dev('em', 'em-rs485', { label: 'MAIN', station: 4, ...com }, { wh: 0 });
      b.dev('motor', 'motor', { load: 35 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('lrun', 'lamp', { label: 'CONVEYOR', color: 'green' });
      b.dev('lrdy', 'lamp', { label: 'OVEN READY', color: 'yellow' });
      b.dev('lalm', 'lamp', { label: 'ALARM', color: 'red' });
      // power: drive from the MCB, meter + oven controller from the supply's L / N, sensor on 24 V
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('psu', 'L', 'em', 'L'); b.w('psu', 'N', 'em', 'N');
      b.w('em', 'L', 'dtb', 'L'); b.w('em', 'N', 'dtb', 'N');
      b.w('psu', '+V1', 'th', 'V+'); b.w('th', 'V-', 'psu', '-V1');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lrdy', 'X1'); b.w('plc', 'Y2', 'lalm', 'X1');
      b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lrdy', 'X2', '#1e3a8a'); b.w('lrdy', 'X2', 'lalm', 'X2', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      // communication: HMI on COM1 (RS-232); the RS-485 bus is a daisy chain PLC COM2 → meter → sensor → DTB → drive
      b.w('hmi', 'COM1', 'plc', 'COM1');
      b.w('plc', 'COM2', 'em', 'RS485');
      b.w('em', 'RS485', 'th', 'RS485');
      b.w('th', 'RS485', 'dtb', 'RS485');
      b.w('dtb', 'RS485', 'vfd', 'RS485');
      const prog = program([
        rung('First scan: COM2 = 9600 bps 8E1 (H87), Modbus RTU (M1143) — every slave is set the same; conveyor 30.00 Hz, oven 150.0 °C, oven RUN', ['M1002 =>| MOV H87 D1120', '=>| SET M1120', '=>| SET M1143', '=>| MOV K3000 D10', '=>| MOV K1500 D40', '=> SET M13']),
        rung('Line latch: START (X0) or HMI START (M10); STOP (X1, NC) or HMI STOP (M11) stop it', ['X0| X1 /M11 => OUT M0', 'M10|', 'M0']),
        rung('Oven ready threshold D32 = SV − 5.0 °C (DTB values are in 0.1 °C)', ['M1000 => SUB D31 K50 D32']),
        rung('Oven ready (M1): PV (D30) has reached the threshold', ['D30>=D32 => OUT M1']),
        rung('The conveyor runs while the line is on and the oven is ready', ['M0 M1 => OUT M2']),
        rung('Command word for the drive (2000H): H12 = RUN FWD, H1 = STOP', ['M2 => MOV H12 D0']),
        rung('', ['/M2 => MOV H1 D0']),
        rung('Station 1 · MS300: write the command word (function 06, 2000H)', ['M1000 => MODRW K1 K6 H2000 D0 K1']),
        rung('Station 1 · MS300: write the frequency command (2001H, 0.01 Hz)', ['M1000 => MODRW K1 K6 H2001 D10 K1']),
        rung('Station 1 · MS300: read output frequency + current (2103H, 2104H) → D20, D21', ['M1000 => MODRW K1 K3 H2103 D20 K2']),
        rung('Station 2 · DTB4848: read PV + SV (1000H, 1001H) → D30, D31', ['M1000 => MODRW K2 K3 H1000 D30 K2']),
        rung('Station 2 · DTB4848: write the HMI set value D40 to SV (1001H)', ['M1000 => MODRW K2 K6 H1001 D40 K1']),
        rung('Station 2 · DTB4848: RUN / STOP bit 0814H (function 05) from the HMI switch M13', ['M13 => MOV K1 D41']),
        rung('', ['/M13 => MOV K0 D41']),
        rung('', ['M1000 => MODRW K2 K5 H814 D41 K1']),
        rung('Station 3 · T/H sensor: read temperature + humidity (0000H, 0001H) → D50, D51', ['M1000 => MODRW K3 K3 H0 D50 K2']),
        rung('Station 4 · energy meter: read voltage, current, power (0000H…0002H) → D60…D62', ['M1000 => MODRW K4 K3 H0 D60 K3']),
        rung('Station 4 · energy meter: read the energy in Wh, 32-bit (0005H low, 0006H high) → D64, D65', ['M1000 => MODRW K4 K3 H5 D64 K2']),
        rung('Cabinet too hot: above 40.0 °C', ['D50>K400 => OUT M3']),
        rung('CONVEYOR lamp', ['M2 => OUT Y0']),
        rung('OVEN READY lamp', ['M1 => OUT Y1']),
        rung('ALARM lamp flashes on a COM2 time-out (M1129) or a hot cabinet (M3)', ['M1129| M1013 => OUT Y2', 'M3']),
      ], {
        X0: 'START button', X1: 'STOP button (NC)', Y0: 'CONVEYOR lamp', Y1: 'OVEN READY lamp', Y2: 'ALARM lamp',
        M0: 'Line on', M1: 'Oven ready', M2: 'Conveyor running', M3: 'Cabinet too hot', M10: 'HMI START', M11: 'HMI STOP', M13: 'HMI oven RUN switch',
        D0: 'VFD command word', D10: 'Conveyor speed (0.01 Hz)', D20: 'VFD output frequency (0.01 Hz)', D21: 'VFD output current (0.01 A)',
        D30: 'Oven PV (0.1 °C)', D31: 'Oven SV (0.1 °C)', D32: 'Ready threshold', D40: 'HMI oven set value (0.1 °C)', D41: 'Oven RUN bit',
        D50: 'Cabinet temperature (0.1 °C)', D51: 'Cabinet humidity (0.1 %RH)', D60: 'Mains voltage (0.1 V)', D61: 'Mains current (0.01 A)', D62: 'Power (W)', D64: 'Energy (Wh, 32-bit)',
      });
      const hdr = (title, other, screen) => [
        E('rect', 12, 10, 776, 58, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
        E('text', 28, 22, 360, 36, { text: title, size: 24, color: '#e2e8f0', align: 'left', bold: true }),
        E('clock', 390, 22, 230, 36, { fmt: 'datetime', size: 15, color: '#93c5fd', align: 'right' }),
        E('goto', 640, 18, 136, 42, { text: other, screen }),
      ];
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Line', bg: '#0b1630', elements: [
            ...hdr('OVEN + CONVEYOR', 'NETWORK ▶', 1),
            E('rect', 12, 80, 384, 240, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'OVEN · DTB4848 · ID 2' }),
            E('meter', 24, 112, 190, 150, { word: 'D30', dec: 1, unit: '°C', label: 'PV', min: 0, max: 250 }),
            E('num', 224, 112, 160, 52, { word: 'D31', dec: 1, unit: '°C', label: 'SV (READ)' }),
            E('input', 224, 170, 160, 52, { word: 'D40', dec: 1, unit: '°C', label: 'SET SV', min: 0, max: 250 }),
            E('button', 224, 230, 160, 40, { text: 'OVEN RUN', bit: 'M13', mode: 'toggle', color: 'blue' }),
            E('lamp', 224, 274, 160, 36, { bit: 'M1', text: 'READY', onColor: '#eab308', offColor: '#334155', shape: 'rect' }),
            E('rect', 404, 80, 384, 240, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'CONVEYOR · MS300 · ID 1' }),
            E('button', 418, 112, 170, 60, { text: 'START', bit: 'M10', mode: 'momentary', color: 'green' }),
            E('button', 418, 180, 170, 60, { text: 'STOP', bit: 'M11', mode: 'momentary', color: 'red' }),
            E('input', 418, 248, 170, 60, { word: 'D10', dec: 2, unit: 'Hz', label: 'SPEED', min: 0, max: 50 }),
            E('num', 600, 112, 176, 56, { word: 'D20', dec: 2, unit: 'Hz', label: 'OUTPUT' }),
            E('num', 600, 176, 176, 56, { word: 'D21', dec: 2, unit: 'A', label: 'CURRENT' }),
            E('motor', 640, 236, 80, 80, { bit: 'M2', text: '' }),
            E('trend', 12, 330, 776, 140, { word: 'D30', word2: 'D31', dec: 1, min: 0, max: 250, span: 60, label: 'OVEN PV / SV (°C)' }),
          ],
        }, {
          id: 's2', name: 'Network', bg: '#0b1630', elements: [
            ...hdr('RS-485 · MODBUS RTU', '◀ LINE', 0),
            E('text', 16, 72, 770, 26, { text: 'Master: PLC COM2 · 9600 bps 8E1 · daisy chain PLC → ID 4 → ID 3 → ID 2 → ID 1', size: 15, color: '#93c5fd', align: 'left', bold: false }),
            E('rect', 12, 104, 384, 150, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'ID 1 · MS300 DRIVE' }),
            E('num', 24, 136, 176, 56, { word: 'D20', dec: 2, unit: 'Hz', label: '2103H' }),
            E('num', 208, 136, 176, 56, { word: 'D21', dec: 2, unit: 'A', label: '2104H' }),
            E('rect', 404, 104, 384, 150, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'ID 2 · DTB4848 OVEN' }),
            E('num', 416, 136, 176, 56, { word: 'D30', dec: 1, unit: '°C', label: 'PV 1000H' }),
            E('num', 600, 136, 176, 56, { word: 'D31', dec: 1, unit: '°C', label: 'SV 1001H' }),
            E('rect', 12, 262, 384, 150, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'ID 3 · T/H SENSOR' }),
            E('num', 24, 294, 176, 56, { word: 'D50', dec: 1, unit: '°C', label: 'TEMP 0000H' }),
            E('num', 208, 294, 176, 56, { word: 'D51', dec: 1, unit: '%', label: 'RH 0001H' }),
            E('rect', 404, 262, 384, 150, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'ID 4 · ENERGY METER' }),
            E('num', 416, 294, 116, 56, { word: 'D60', dec: 1, unit: 'V', label: '0000H' }),
            E('num', 538, 294, 116, 56, { word: 'D62', dec: 0, unit: 'W', label: '0002H' }),
            E('num', 660, 294, 116, 56, { word: 'D64', dec: 3, unit: 'kWh', label: '0005H' }),
            E('num', 416, 354, 116, 52, { word: 'D61', dec: 2, unit: 'A', label: '0001H' }),
            E('alarm', 12, 422, 776, 48, { bit: 'M1129', text: 'COM2 TIME-OUT — a slave does not answer (check Monitor → Network)' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'modbus-th-fan', name: 'Modbus basics: read a temperature / humidity sensor', level: 'intermediate', tags: ['Modbus', 'MODRW', 'RS-485', 'FC03', 'HMI'],
    description: 'Your first Modbus master: the PLC (COM2) reads temperature and humidity from an RS-485 sensor (station 1, function 03, address 0000H, 2 registers) into D50 / D51. A fan runs above the temperature you set on the HMI, a humidity lamp warns above 70 %RH, and a COMM FAIL lamp flashes when the sensor stops answering. Tap the sensor in 3D to change the room temperature.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('th', 'th-rs485', { label: 'ROOM', station: 1, ...COM }, { temp: 27, rh: 55 });
      b.dev('lfan', 'lamp', { label: 'FAN', color: 'green' });
      b.dev('lhum', 'lamp', { label: 'HUMID', color: 'yellow' });
      b.dev('lfail', 'lamp', { label: 'COMM FAIL', color: 'red' });
      b.w('psu', '+V1', 'th', 'V+'); b.w('th', 'V-', 'psu', '-V1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lfan', 'X1'); b.w('plc', 'Y1', 'lhum', 'X1'); b.w('plc', 'Y2', 'lfail', 'X1');
      b.w('lfan', 'X2', 'psu', '-V2'); b.w('lfan', 'X2', 'lhum', 'X2', '#1e3a8a'); b.w('lhum', 'X2', 'lfail', 'X2', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      b.w('plc', 'COM2', 'th', 'RS485');
      const prog = program([
        comRung(['MOV K300 D60']),
        rung('Station 1 · sensor: function 03 (read registers), address 0000H, 2 registers → D50 = temperature, D51 = humidity (both ×10)', ['M1000 => MODRW K1 K3 H0 D50 K2']),
        rung('D62 = fan limit − 1.0 °C (the hysteresis)', ['M1000 => SUB D60 K10 D62']),
        rung('Fan ON when the temperature is above the limit D60 (set on the HMI, 0.1 °C)', ['D50>D60 => SET M0']),
        rung('Fan OFF again below the limit − 1.0 °C', ['D50<D62 => RST M0']),
        rung('FAN lamp', ['M0 => OUT Y0']),
        rung('Humidity warning above 70.0 %RH', ['D51>K700 => OUT Y1']),
        rung('COMM FAIL: M1129 = the sensor did not answer (time-out) — the lamp flashes at 1 s (M1013)', ['M1129 M1013 => OUT Y2']),
      ], { Y0: 'FAN lamp', Y1: 'HUMID lamp', Y2: 'COMM FAIL lamp', M0: 'Fan on', D50: 'Temperature (0.1 °C)', D51: 'Humidity (0.1 %RH)', D60: 'Fan limit (0.1 °C)', D62: 'Fan OFF level', M1129: 'COM2 time-out' });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Room', bg: '#0b1630', elements: [
            ...hmiHdr('ROOM CLIMATE · MODBUS', null),
            E('rect', 12, 80, 384, 250, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'SENSOR · ID 1 · FC03 0000H' }),
            E('meter', 24, 112, 190, 150, { word: 'D50', dec: 1, unit: '°C', label: 'TEMPERATURE', min: 0, max: 60 }),
            E('num', 224, 112, 160, 52, { word: 'D51', dec: 1, unit: '%RH', label: 'HUMIDITY' }),
            E('lamp', 224, 176, 160, 40, { bit: 'M0', text: 'FAN ON', onColor: '#22c55e', offColor: '#334155', shape: 'rect' }),
            E('lamp', 224, 224, 160, 40, { bit: 'Y1', text: 'HUMID', onColor: '#eab308', offColor: '#334155', shape: 'rect' }),
            E('rect', 404, 80, 384, 250, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'FAN CONTROL' }),
            E('input', 418, 112, 356, 64, { word: 'D60', dec: 1, unit: '°C', label: 'FAN ON ABOVE', min: 0, max: 60 }),
            E('num', 418, 184, 170, 56, { word: 'D62', dec: 1, unit: '°C', label: 'FAN OFF BELOW' }),
            E('motor', 640, 190, 110, 110, { bit: 'M0', text: 'FAN' }),
            E('trend', 12, 340, 776, 130, { word: 'D50', word2: 'D60', dec: 1, min: 0, max: 60, span: 120, label: 'TEMPERATURE vs LIMIT (°C)' }),
            E('alarm', 12, 426, 776, 44, { bit: 'M1129', text: 'COM2 TIME-OUT — the sensor does not answer (check station, baud, format, wiring)' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'modbus-energy-vfd', name: 'Modbus: drive control + energy meter', level: 'advanced', tags: ['Modbus', 'MODRW', 'VFD', 'Energy', 'HMI'],
    description: 'One RS-485 line, two slaves: the PLC runs the MS300 drive (station 1: command word 2000H, frequency 2001H, status 2103H / 2104H) and reads the 1-phase energy meter (station 2: voltage, current, power, energy). The HMI starts / stops the motor, sets the speed and shows live power, the peak power and the energy used. A HIGH POWER lamp lights above 400 W.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('vfd', 'ms300', {}, VFD_MODBUS);
      b.dev('em', 'em-rs485', { label: 'MAIN', station: 2, ...COM }, { wh: 0 });
      b.dev('motor', 'motor', { load: 55 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('lrun', 'lamp', { label: 'MOTOR RUN', color: 'green' });
      b.dev('lhigh', 'lamp', { label: 'HIGH POWER', color: 'yellow' });
      b.dev('lfail', 'lamp', { label: 'COMM FAIL', color: 'red' });
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('psu', 'L', 'em', 'L'); b.w('psu', 'N', 'em', 'N');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lhigh', 'X1'); b.w('plc', 'Y2', 'lfail', 'X1');
      b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lhigh', 'X2', '#1e3a8a'); b.w('lhigh', 'X2', 'lfail', 'X2', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      b.w('plc', 'COM2', 'em', 'RS485'); b.w('em', 'RS485', 'vfd', 'RS485');
      const prog = program([
        comRung(['MOV K3000 D10']),
        rung('Motor latch: START (X0) or HMI START (M10); STOP (X1, NC) or HMI STOP (M11)', ['X0| X1 /M11 => OUT M0', 'M10|', 'M0']),
        rung('Command word for the drive (2000H): H12 = RUN forward, H1 = STOP', ['M0 => MOV H12 D0']),
        rung('', ['/M0 => MOV H1 D0']),
        rung('Station 1 · MS300: write the command word (function 06, 2000H)', ['M1000 => MODRW K1 K6 H2000 D0 K1']),
        rung('Station 1 · MS300: write the frequency command (2001H, 0.01 Hz) from the HMI value D10', ['M1000 => MODRW K1 K6 H2001 D10 K1']),
        rung('Station 1 · MS300: read the output frequency and current (2103H, 2104H) → D20, D21', ['M1000 => MODRW K1 K3 H2103 D20 K2']),
        rung('Station 2 · meter: read voltage, current, power (0000H … 0002H) → D60, D61, D62', ['M1000 => MODRW K2 K3 H0 D60 K3']),
        rung('Station 2 · meter: read the energy in Wh (0005H low word, 0006H high word) → D64, D65', ['M1000 => MODRW K2 K3 H5 D64 K2']),
        rung('Peak power: keep the largest value of D62 in D70', ['D62>D70 => MOV D62 D70']),
        rung('RESET PEAK (HMI button M12) clears it', ['M12 => MOV K0 D70']),
        rung('MOTOR RUN lamp', ['M0 => OUT Y0']),
        rung('HIGH POWER lamp above 400 W', ['D62>K400 => OUT Y1']),
        rung('COMM FAIL lamp flashes on a COM2 time-out', ['M1129 M1013 => OUT Y2']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'MOTOR RUN lamp', Y1: 'HIGH POWER lamp', Y2: 'COMM FAIL lamp', M0: 'Motor running', M10: 'HMI START', M11: 'HMI STOP', M12: 'HMI RESET PEAK', D0: 'VFD command word', D10: 'Speed command (0.01 Hz)', D20: 'Output frequency (0.01 Hz)', D21: 'Output current (0.01 A)', D60: 'Voltage (0.1 V)', D61: 'Current (0.01 A)', D62: 'Power (W)', D64: 'Energy low word (Wh)', D70: 'Peak power (W)' });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Drive + power', bg: '#0b1630', elements: [
            ...hmiHdr('DRIVE + ENERGY · MODBUS', null),
            E('rect', 12, 80, 384, 250, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'MS300 DRIVE · ID 1' }),
            E('button', 24, 112, 170, 56, { text: 'START', bit: 'M10', mode: 'momentary', color: 'green' }),
            E('button', 204, 112, 180, 56, { text: 'STOP', bit: 'M11', mode: 'momentary', color: 'red' }),
            E('input', 24, 178, 360, 60, { word: 'D10', dec: 2, unit: 'Hz', label: 'SPEED COMMAND', min: 0, max: 50 }),
            E('num', 24, 248, 170, 56, { word: 'D20', dec: 2, unit: 'Hz', label: 'OUTPUT' }),
            E('num', 204, 248, 180, 56, { word: 'D21', dec: 2, unit: 'A', label: 'CURRENT' }),
            E('rect', 404, 80, 384, 250, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'ENERGY METER · ID 2' }),
            E('num', 418, 112, 170, 52, { word: 'D60', dec: 1, unit: 'V', label: 'VOLTAGE' }),
            E('num', 600, 112, 176, 52, { word: 'D61', dec: 2, unit: 'A', label: 'LINE CURRENT' }),
            E('num', 418, 172, 170, 52, { word: 'D62', dec: 0, unit: 'W', label: 'POWER' }),
            E('num', 600, 172, 176, 52, { word: 'D70', dec: 0, unit: 'W', label: 'PEAK' }),
            E('num', 418, 232, 170, 52, { word: 'D64', dec: 3, unit: 'kWh', label: 'ENERGY' }),
            E('button', 600, 232, 176, 52, { text: 'RESET PEAK', bit: 'M12', mode: 'momentary', color: 'blue' }),
            E('lamp', 600, 292, 176, 32, { bit: 'Y1', text: 'HIGH POWER', onColor: '#eab308', offColor: '#334155', shape: 'rect' }),
            E('motor', 330, 270, 60, 56, { bit: 'M0', text: '' }),
            E('trend', 12, 340, 776, 130, { word: 'D62', word2: 'D20', dec: 0, min: 0, max: 600, span: 60, label: 'POWER (W) · FREQUENCY (0.01 Hz ÷ 10)' }),
            E('alarm', 12, 426, 776, 44, { bit: 'M1129', text: 'COM2 TIME-OUT — a slave does not answer' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'modbus-function-codes', name: 'Modbus function codes lab: FC 01 · 03 · 05 · 06 · 16', level: 'advanced', tags: ['Modbus', 'MODRW', 'DTB', 'FC01', 'FC05', 'FC16', 'HMI'],
    description: 'Every Modbus function code the PLC master uses, against one DTB4848 controller (station 1): read registers FC03 (PV, SV, limits, output), write one register FC06 (SV), write several registers FC16 (the two limits), write a bit FC05 (RUN / STOP, coil 0814H) and read it back FC01. Watch each frame in Monitor → Comm log.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('dtb', 'dtb4848', { label: 'OVEN', station: 1, ...COM }, { sv: 100, run: true, mode: 0 });
      b.dev('lrun', 'lamp', { label: 'DTB RUN', color: 'green' });
      b.dev('lheat', 'lamp', { label: 'HEATING', color: 'yellow' });
      b.dev('lfail', 'lamp', { label: 'COMM FAIL', color: 'red' });
      b.w('psu', 'L', 'dtb', 'L'); b.w('psu', 'N', 'dtb', 'N');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lheat', 'X1'); b.w('plc', 'Y2', 'lfail', 'X1');
      b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lheat', 'X2', '#1e3a8a'); b.w('lheat', 'X2', 'lfail', 'X2', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      b.w('plc', 'COM2', 'dtb', 'RS485');
      const prog = program([
        comRung(['MOV K1000 D10', 'MOV K2500 D20', 'MOV K0 D21']),
        rung('FC03 · read 2 registers from 1000H: D0 = PV, D1 = SV (0.1 °C)', ['M1000 => MODRW K1 K3 H1000 D0 K2']),
        rung('FC03 · read the range limits 1002H (upper) and 1003H (lower) → D4, D5', ['M1000 => MODRW K1 K3 H1002 D4 K2']),
        rung('FC03 · read the heater output 1012H (0.1 %) → D6', ['M1000 => MODRW K1 K3 H1012 D6 K1']),
        rung('FC06 · write ONE register: SV (1001H) ← D10, while the HMI button WRITE SV (M20) is held', ['M20 => MODRW K1 K6 H1001 D10 K1']),
        rung('FC16 · write TWO registers: 1002H ← D20 (upper), 1003H ← D21 (lower), while WRITE LIMITS (M21) is held', ['M21 => MODRW K1 K16 H1002 D20 K2']),
        rung('FC05 · the bit to write: D41 = 1 for RUN (M22), 0 for STOP (M23)', ['M22 => MOV K1 D41']),
        rung('', ['M23 => MOV K0 D41']),
        rung('FC05 · write the single coil 0814H (RUN / STOP) from D41 while RUN or STOP is held', ['M22| => MODRW K1 K5 H814 D41 K1', 'M23']),
        rung('FC01 · read the coil 0814H back: D45 = 1 while the controller runs', ['M1000 => MODRW K1 K1 H814 D45 K1']),
        rung('DTB RUN lamp (from the coil that was read back)', ['D45=K1 => OUT Y0']),
        rung('HEATING lamp while the output is above 0 %', ['D6>K0 => OUT Y1']),
        rung('COMM FAIL lamp flashes on a COM2 time-out', ['M1129 M1013 => OUT Y2']),
      ], { Y0: 'DTB RUN lamp', Y1: 'HEATING lamp', Y2: 'COMM FAIL lamp', D0: 'PV (0.1 °C)', D1: 'SV (0.1 °C)', D4: 'Upper limit (0.1 °C)', D5: 'Lower limit (0.1 °C)', D6: 'Heater output (0.1 %)', D10: 'SV to write', D20: 'Upper limit to write', D21: 'Lower limit to write', D41: 'RUN bit to write', D45: 'RUN bit read back', M20: 'HMI WRITE SV', M21: 'HMI WRITE LIMITS', M22: 'HMI RUN', M23: 'HMI STOP' });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Function codes', bg: '#0b1630', elements: [
            ...hmiHdr('MODBUS FUNCTION CODES', null),
            E('rect', 12, 80, 384, 190, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'READ · FC03 / FC01 · every scan' }),
            E('num', 24, 110, 170, 52, { word: 'D0', dec: 1, unit: '°C', label: 'PV  1000H' }),
            E('num', 204, 110, 180, 52, { word: 'D1', dec: 1, unit: '°C', label: 'SV  1001H' }),
            E('num', 24, 170, 170, 46, { word: 'D4', dec: 1, unit: '°C', label: 'UPPER 1002H' }),
            E('num', 204, 170, 180, 46, { word: 'D5', dec: 1, unit: '°C', label: 'LOWER 1003H' }),
            E('num', 24, 222, 170, 42, { word: 'D6', dec: 1, unit: '%', label: 'OUT 1012H' }),
            E('lamp', 204, 224, 180, 38, { bit: 'Y0', text: 'RUN coil 0814H', onColor: '#22c55e', offColor: '#334155', shape: 'rect' }),
            E('rect', 404, 80, 384, 190, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'WRITE · held button = repeated request' }),
            E('input', 414, 108, 218, 50, { word: 'D10', dec: 1, unit: '°C', label: 'SV TO WRITE', min: 0, max: 400 }),
            E('button', 638, 108, 140, 50, { text: 'WRITE SV · FC06', bit: 'M20', mode: 'momentary', color: 'blue' }),
            E('input', 414, 164, 108, 50, { word: 'D20', dec: 1, unit: '', label: 'UPPER', min: 0, max: 400 }),
            E('input', 528, 164, 108, 50, { word: 'D21', dec: 1, unit: '', label: 'LOWER', min: 0, max: 400 }),
            E('button', 642, 164, 136, 50, { text: 'LIMITS · FC16', bit: 'M21', mode: 'momentary', color: 'blue' }),
            E('button', 414, 220, 176, 44, { text: 'RUN · FC05', bit: 'M22', mode: 'momentary', color: 'green' }),
            E('button', 602, 220, 176, 44, { text: 'STOP · FC05', bit: 'M23', mode: 'momentary', color: 'red' }),
            E('text', 14, 278, 772, 26, { text: 'FC01 read coil · FC03 read registers · FC05 write coil · FC06 write register · FC16 write registers', size: 14, color: '#93c5fd', align: 'left', bold: false }),
            E('trend', 12, 308, 776, 112, { word: 'D0', word2: 'D1', dec: 1, min: 0, max: 400, span: 90, label: 'PV / SV (°C)' }),
            E('alarm', 12, 426, 776, 44, { bit: 'M1129', text: 'COM2 TIME-OUT — the controller does not answer' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'pid-oven-recipes', name: 'PID oven line: recipes · DTB4848 · conveyor drive · HMI', level: 'advanced', tags: ['PID', 'DTB', 'Modbus', 'VFD', 'Recipes', 'HMI'], featured: true,
    description: 'A baking line: the Delta DTB4848 PID controller (station 2) holds the oven temperature and the MS300 drive (station 1) runs the conveyor. The HMI has three recipes — DRY 80 °C / 20 Hz, BAKE 150 °C / 30 Hz, CURE 200 °C / 15 Hz — the PLC writes the set value and the belt speed. The belt only runs when the oven has been within ±5 °C of the set value for 5 s. The trend shows PV, SV and the heater output.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('vfd', 'ms300', {}, VFD_MODBUS);
      b.dev('dtb', 'dtb4848', { label: 'OVEN PID', station: 2, ...COM }, { sv: 150, run: true, mode: 0 });
      b.dev('motor', 'motor', { load: 35 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('lrun', 'lamp', { label: 'CONVEYOR', color: 'green' });
      b.dev('lrdy', 'lamp', { label: 'OVEN STABLE', color: 'yellow' });
      b.dev('lfail', 'lamp', { label: 'ALARM', color: 'red' });
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('psu', 'L', 'dtb', 'L'); b.w('psu', 'N', 'dtb', 'N');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lrdy', 'X1'); b.w('plc', 'Y2', 'lfail', 'X1');
      b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lrdy', 'X2', '#1e3a8a'); b.w('lrdy', 'X2', 'lfail', 'X2', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      b.w('plc', 'COM2', 'dtb', 'RS485'); b.w('dtb', 'RS485', 'vfd', 'RS485');
      const prog = program([
        comRung(['MOV K1500 D40', 'MOV K3000 D10', 'MOV K2 D90', 'SET M13']),
        rung('Recipe 1 · DRY: oven 80.0 °C, belt 20.00 Hz', ['M30 =>| MOV K800 D40', '=>| MOV K2000 D10', '=> MOV K1 D90']),
        rung('Recipe 2 · BAKE: oven 150.0 °C, belt 30.00 Hz', ['M31 =>| MOV K1500 D40', '=>| MOV K3000 D10', '=> MOV K2 D90']),
        rung('Recipe 3 · CURE: oven 200.0 °C, belt 15.00 Hz', ['M32 =>| MOV K2000 D40', '=>| MOV K1500 D10', '=> MOV K3 D90']),
        rung('Line latch: START (X0) or HMI START (M10); STOP (X1, NC) or HMI STOP (M11)', ['X0| X1 /M11 => OUT M0', 'M10|', 'M0']),
        rung('Control error D32 = PV − SV (0.1 °C); D33 = its absolute value', ['M1000 => SUB D30 D31 D32']),
        rung('', ['M1000 => MOV D32 D33']),
        rung('', ['M1000 => ABS D33']),
        rung('Oven stable: the error stays below 5.0 °C for 5 s (T0 = 50 × 100 ms)', ['D33<K50 => TMR T0 K50']),
        rung('OVEN STABLE (M1)', ['T0 => OUT M1']),
        rung('The conveyor runs while the line is on and the oven is stable', ['M0 M1 => OUT M2']),
        rung('Command word for the drive (2000H): H12 = RUN forward, H1 = STOP', ['M2 => MOV H12 D0']),
        rung('', ['/M2 => MOV H1 D0']),
        rung('Station 1 · MS300: command word (FC06, 2000H)', ['M1000 => MODRW K1 K6 H2000 D0 K1']),
        rung('Station 1 · MS300: frequency (FC06, 2001H) from the recipe D10', ['M1000 => MODRW K1 K6 H2001 D10 K1']),
        rung('Station 1 · MS300: read output frequency + current (2103H, 2104H)', ['M1000 => MODRW K1 K3 H2103 D20 K2']),
        rung('Station 2 · DTB4848 PID: read PV, SV (1000H, 1001H) → D30, D31', ['M1000 => MODRW K2 K3 H1000 D30 K2']),
        rung('Station 2 · DTB4848 PID: write the recipe\'s set value D40 to SV (1001H)', ['M1000 => MODRW K2 K6 H1001 D40 K1']),
        rung('Station 2 · DTB4848 PID: read the heater output (1012H, 0.1 %) → D34', ['M1000 => MODRW K2 K3 H1012 D34 K1']),
        rung('Station 2 · DTB4848 PID: RUN / STOP coil 0814H from the HMI switch M13', ['M13 => MOV K1 D41']),
        rung('', ['/M13 => MOV K0 D41']),
        rung('', ['M1000 => MODRW K2 K5 H814 D41 K1']),
        rung('CONVEYOR lamp', ['M2 => OUT Y0']),
        rung('OVEN STABLE lamp', ['M1 => OUT Y1']),
        rung('ALARM lamp flashes on a COM2 time-out or when the oven is more than 20 °C too hot', ['M1129| M1013 => OUT Y2', 'D32>K200']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'CONVEYOR lamp', Y1: 'OVEN STABLE lamp', Y2: 'ALARM lamp', M0: 'Line on', M1: 'Oven stable', M2: 'Conveyor running', M13: 'HMI oven RUN switch', M30: 'HMI recipe DRY', M31: 'HMI recipe BAKE', M32: 'HMI recipe CURE', D0: 'VFD command word', D10: 'Belt speed (0.01 Hz)', D20: 'Output frequency (0.01 Hz)', D21: 'Output current (0.01 A)', D30: 'Oven PV (0.1 °C)', D31: 'Oven SV (0.1 °C)', D32: 'PV − SV (0.1 °C)', D33: '|PV − SV| (0.1 °C)', D34: 'Heater output (0.1 %)', D40: 'Set value to write (0.1 °C)', D90: 'Recipe number' });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Line', bg: '#0b1630', elements: [
            ...hmiHdr('BAKING LINE · PID OVEN', 'RECIPES ▶', 1),
            E('rect', 12, 80, 384, 240, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'OVEN · DTB4848 PID · ID 2' }),
            E('meter', 24, 112, 190, 150, { word: 'D30', dec: 1, unit: '°C', label: 'PV', min: 0, max: 250 }),
            E('num', 224, 112, 160, 52, { word: 'D31', dec: 1, unit: '°C', label: 'SV' }),
            E('num', 224, 170, 160, 52, { word: 'D34', dec: 1, unit: '%', label: 'HEATER OUT' }),
            E('button', 224, 230, 160, 40, { text: 'OVEN RUN', bit: 'M13', mode: 'toggle', color: 'blue' }),
            E('lamp', 224, 274, 160, 36, { bit: 'M1', text: 'STABLE', onColor: '#eab308', offColor: '#334155', shape: 'rect' }),
            E('rect', 404, 80, 384, 240, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'CONVEYOR · MS300 · ID 1' }),
            E('button', 418, 112, 170, 60, { text: 'START', bit: 'M10', mode: 'momentary', color: 'green' }),
            E('button', 418, 180, 170, 60, { text: 'STOP', bit: 'M11', mode: 'momentary', color: 'red' }),
            E('state', 418, 248, 170, 56, { word: 'D90', label: 'RECIPE', states: '0:NONE:#475569|1:DRY:#3b82f6|2:BAKE:#f59e0b|3:CURE:#ef4444' }),
            E('num', 600, 112, 176, 56, { word: 'D20', dec: 2, unit: 'Hz', label: 'BELT SPEED' }),
            E('num', 600, 176, 176, 56, { word: 'D21', dec: 2, unit: 'A', label: 'CURRENT' }),
            E('motor', 640, 236, 80, 80, { bit: 'M2', text: '' }),
            E('trend', 12, 330, 776, 140, { word: 'D30', word2: 'D31', dec: 1, min: 0, max: 250, span: 90, label: 'OVEN PV / SV (°C)' }),
          ],
        }, {
          id: 's2', name: 'Recipes', bg: '#0b1630', elements: [
            ...hmiHdr('RECIPES', '◀ LINE', 0),
            E('rect', 12, 80, 256, 250, { fill: '#10224a', stroke: '#3b82f6', radius: 16, title: 'DRY' }),
            E('text', 28, 120, 224, 60, { text: '80 °C · 20 Hz', size: 24, color: '#93c5fd', align: 'center', bold: true }),
            E('button', 28, 250, 224, 60, { text: 'LOAD DRY', bit: 'M30', mode: 'momentary', color: 'blue' }),
            E('rect', 272, 80, 256, 250, { fill: '#2a1c0c', stroke: '#f59e0b', radius: 16, title: 'BAKE' }),
            E('text', 288, 120, 224, 60, { text: '150 °C · 30 Hz', size: 26, color: '#fcd34d', align: 'center', bold: true }),
            E('button', 288, 250, 224, 60, { text: 'LOAD BAKE', bit: 'M31', mode: 'momentary', color: 'orange' }),
            E('rect', 532, 80, 256, 250, { fill: '#2a0f12', stroke: '#ef4444', radius: 16, title: 'CURE' }),
            E('text', 548, 120, 224, 60, { text: '200 °C · 15 Hz', size: 26, color: '#fca5a5', align: 'center', bold: true }),
            E('button', 548, 250, 224, 60, { text: 'LOAD CURE', bit: 'M32', mode: 'momentary', color: 'red' }),
            E('num', 12, 344, 250, 56, { word: 'D31', dec: 1, unit: '°C', label: 'OVEN SV NOW' }),
            E('num', 272, 344, 250, 56, { word: 'D30', dec: 1, unit: '°C', label: 'OVEN PV NOW' }),
            E('state', 532, 344, 256, 56, { word: 'D90', label: 'ACTIVE RECIPE', states: '0:NONE:#475569|1:DRY:#3b82f6|2:BAKE:#f59e0b|3:CURE:#ef4444' }),
            E('alarm', 12, 420, 776, 44, { bit: 'M1129', text: 'COM2 TIME-OUT — a slave does not answer' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'pid-tuning-lab', name: 'PID tuning lab: PB · Ti · Td · auto-tune (DTB4848)', level: 'advanced', tags: ['PID', 'DTB', 'Tuning', 'Modbus', 'HMI'], featured: true,
    description: 'Learn what the three PID numbers do. The PLC talks to a DTB4848 over Modbus: set the SV, choose the control method (PID · ON/OFF · Manual, 1005H), type a new proportional band PB (1009H), integral time Ti (100AH) and derivative time Td (100BH) and press APPLY, or let the controller find them with AUTO-TUNE (coil 0813H). The trend shows PV, SV and the heater output so you can see overshoot, speed and offset.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('dtb', 'dtb4848', { label: 'OVEN PID', station: 1, ...COM }, { sv: 120, run: true, mode: 0 });
      b.dev('lrun', 'lamp', { label: 'RUN', color: 'green' });
      b.dev('lat', 'lamp', { label: 'AUTO-TUNE', color: 'yellow' });
      b.dev('lfail', 'lamp', { label: 'COMM FAIL', color: 'red' });
      b.w('psu', 'L', 'dtb', 'L'); b.w('psu', 'N', 'dtb', 'N');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'lrun', 'X1'); b.w('plc', 'Y1', 'lat', 'X1'); b.w('plc', 'Y2', 'lfail', 'X1');
      b.w('lrun', 'X2', 'psu', '-V2'); b.w('lrun', 'X2', 'lat', 'X2', '#1e3a8a'); b.w('lat', 'X2', 'lfail', 'X2', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      b.w('plc', 'COM2', 'dtb', 'RS485');
      const prog = program([
        comRung(['MOV K1200 D40', 'MOV K80 D20', 'MOV K30 D21', 'MOV K3 D22', 'MOV K300 D37', 'SET M13']),
        rung('Station 1 · DTB4848: read PV, SV (1000H, 1001H) → D30, D31', ['M1000 => MODRW K1 K3 H1000 D30 K2']),
        rung('Read the PID settings back: 1009H PB, 100AH Ti, 100BH Td → D24, D25, D26', ['M1000 => MODRW K1 K3 H1009 D24 K3']),
        rung('Read the heater output 1012H (0.1 %) → D34 and the control method 1005H → D35', ['M1000 => MODRW K1 K3 H1012 D34 K1']),
        rung('', ['M1000 => MODRW K1 K3 H1005 D35 K1']),
        rung('Read the auto-tune coil 0813H (FC01) → D43', ['M1000 => MODRW K1 K1 H813 D43 K1']),
        rung('Write the set value D40 to SV (1001H, FC06)', ['M1000 => MODRW K1 K6 H1001 D40 K1']),
        rung('Control method buttons: PID = 0, ON/OFF = 1, MANUAL = 2', ['M30 => MOV K0 D36']),
        rung('', ['M31 => MOV K1 D36']),
        rung('', ['M32 => MOV K2 D36']),
        rung('Write 1005H ← D36 while one of the three buttons is held (FC06)', ['M30| => MODRW K1 K6 H1005 D36 K1', 'M31|', 'M32']),
        rung('Manual mode: write the output (1012H, 0.1 %) from D37 — the controller only accepts it in manual mode', ['D35=K2 => MODRW K1 K6 H1012 D37 K1']),
        rung('APPLY: write PB, Ti, Td (D20, D21, D22) to 1009H … 100BH with ONE request (FC16) while M33 is held', ['M33 => MODRW K1 K16 H1009 D20 K3']),
        rung('AUTO-TUNE button: write 1 to the coil 0813H (FC05)', ['M34 => MOV K1 D42']),
        rung('', ['M34 => MODRW K1 K5 H813 D42 K1']),
        rung('RUN / STOP coil 0814H follows the HMI switch M13 (FC05)', ['M13 => MOV K1 D41']),
        rung('', ['/M13 => MOV K0 D41']),
        rung('', ['M1000 => MODRW K1 K5 H814 D41 K1']),
        rung('RUN lamp', ['M13 => OUT Y0']),
        rung('AUTO-TUNE lamp: the coil reads 1 while the controller is tuning', ['D43=K1 => OUT Y1']),
        rung('COMM FAIL lamp flashes on a COM2 time-out', ['M1129 M1013 => OUT Y2']),
      ], { Y0: 'RUN lamp', Y1: 'AUTO-TUNE lamp', Y2: 'COMM FAIL lamp', M13: 'HMI RUN switch', M30: 'HMI PID', M31: 'HMI ON/OFF', M32: 'HMI MANUAL', M33: 'HMI APPLY', M34: 'HMI AUTO-TUNE', D20: 'PB to write (0.1 °C)', D21: 'Ti to write (s)', D22: 'Td to write (s)', D24: 'PB read back', D25: 'Ti read back', D26: 'Td read back', D30: 'PV (0.1 °C)', D31: 'SV (0.1 °C)', D34: 'Heater output (0.1 %)', D35: 'Control method read back', D36: 'Control method to write', D37: 'Manual output to write (0.1 %)', D40: 'SV to write (0.1 °C)', D43: 'Auto-tune coil read back' });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Tuning', bg: '#0b1630', elements: [
            ...hmiHdr('PID TUNING · DTB4848', null),
            E('rect', 12, 80, 392, 232, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'PROCESS' }),
            E('meter', 22, 108, 180, 140, { word: 'D30', dec: 1, unit: '°C', label: 'PV', min: 0, max: 250 }),
            E('num', 210, 108, 184, 48, { word: 'D31', dec: 1, unit: '°C', label: 'SV (READ)' }),
            E('input', 210, 162, 184, 48, { word: 'D40', dec: 1, unit: '°C', label: 'SET SV', min: 0, max: 250 }),
            E('num', 210, 216, 184, 44, { word: 'D34', dec: 1, unit: '%', label: 'OUTPUT' }),
            E('button', 22, 258, 120, 46, { text: 'RUN / STOP', bit: 'M13', mode: 'toggle', color: 'blue' }),
            E('state', 150, 258, 244, 46, { word: 'D35', label: 'METHOD', states: '0:PID:#22c55e|1:ON/OFF:#f59e0b|2:MANUAL:#a855f7' }),
            E('rect', 412, 80, 376, 232, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'PID SETTINGS · 1009H 100AH 100BH' }),
            E('input', 422, 108, 118, 56, { word: 'D20', dec: 1, unit: '°C', label: 'PB', min: 0.1, max: 200 }),
            E('input', 546, 108, 108, 56, { word: 'D21', dec: 0, unit: 's', label: 'Ti', min: 0, max: 600 }),
            E('input', 660, 108, 118, 56, { word: 'D22', dec: 0, unit: 's', label: 'Td', min: 0, max: 600 }),
            E('num', 422, 170, 118, 44, { word: 'D24', dec: 1, unit: '°C', label: 'PB NOW' }),
            E('num', 546, 170, 108, 44, { word: 'D25', dec: 0, unit: 's', label: 'Ti NOW' }),
            E('num', 660, 170, 118, 44, { word: 'D26', dec: 0, unit: 's', label: 'Td NOW' }),
            E('button', 422, 220, 170, 42, { text: 'APPLY · FC16', bit: 'M33', mode: 'momentary', color: 'green' }),
            E('button', 604, 220, 174, 42, { text: 'AUTO-TUNE', bit: 'M34', mode: 'momentary', color: 'orange' }),
            E('button', 422, 266, 112, 38, { text: 'PID', bit: 'M30', mode: 'momentary', color: 'blue' }),
            E('button', 544, 266, 112, 38, { text: 'ON/OFF', bit: 'M31', mode: 'momentary', color: 'blue' }),
            E('button', 666, 266, 112, 38, { text: 'MANUAL', bit: 'M32', mode: 'momentary', color: 'blue' }),
            E('trend', 12, 322, 600, 150, { word: 'D30', word2: 'D31', dec: 1, min: 0, max: 250, span: 120, label: 'PV / SV (°C)' }),
            E('input', 620, 322, 168, 50, { word: 'D37', dec: 1, unit: '%', label: 'MANUAL OUT', min: 0, max: 100 }),
            E('lamp', 620, 380, 168, 40, { bit: 'Y1', text: 'AUTO-TUNING', onColor: '#eab308', offColor: '#334155', shape: 'rect' }),
            E('alarm', 620, 428, 168, 44, { bit: 'M1129', text: 'COM2 TIME-OUT' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'analog-speed', name: 'Analog speed: pot → EX2 → VFD', level: 'advanced', tags: ['Analog', 'EX2', 'AVI'],
    description: 'A DVP20EX2 reads a speed pot on AI channel 0 (D1110) and drives the MS300 AVI input from AO channel 0 (D1116). START/STOP run the drive through MI1.',
    build() {
      const b = builder();
      base(b, 'dvp-20ex2');
      b.dev('vfd', 'ms300', {}, { params: { _v: 2, '00-20': 2, '00-21': 1, '01-12': 4, '01-13': 4 } });
      b.dev('motor', 'motor', { load: 30 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('pot', 'pot', { label: 'SPEED' }, { pos: 0.6 });
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('vfd', '+10V', 'pot', '1'); b.w('pot', '3', 'vfd', 'ACM'); b.w('pot', '2', 'plc', 'V0+');
      b.w('plc', 'VI0-', 'vfd', 'ACM');
      b.w('plc', 'VO0', 'vfd', 'AVI'); b.w('plc', 'AG0', 'vfd', 'ACM');
      // DVP20EX200T: NPN transistor outputs powered from UP / ZP; Y0 pulls MI1 to DCM (sink mode)
      b.w('plc', 'UP', 'psu', '+V2'); b.w('plc', 'ZP', 'psu', '-V2'); b.w('plc', 'ZP', 'vfd', 'DCM'); b.w('plc', 'Y0', 'vfd', 'MI1');
      const prog = program([
        rung('Run latch → Y0 drives MI1 (FWD)', ['X0| X1 => OUT Y0', 'Y0']),
        rung('Analog pass-through: AI CH0 (D1110, 0–2000) → AO CH0 (D1116, 0–2000 = 0–10 V)', ['M1000 => MOV D1110 D1116']),
        rung('Keep a copy in D100 for monitoring', ['M1000 => MOV D1110 D100']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'VFD MI1 (FWD)', D1110: 'AI CH0 (pot)', D1116: 'AO CH0 → VFD AVI' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'blank', name: 'Starter lab (PLC + power)', level: 'beginner', tags: ['Empty'],
    description: 'A powered DVP16ES2 with its 24 V supply and the programming laptop. Add devices and write your own program.',
    build() {
      const b = builder();
      base(b);
      return finish(this, b, program([rung('', [''])], {}), { noDownload: true });
    },
  },
];

/** A new lab: an empty bench — no device, no wire. The student adds what the project needs. */
export function emptyLab(name = 'My lab') {
  return finish({ name, id: null }, builder(), program([rung('', [''])], {}), { noDownload: true });
}

export function buildExample(id) {
  const ex = LAB_EXAMPLES.find((e) => e.id === id);
  if (!ex) return null;
  const p = ex.build();
  p.name = ex.name;
  return p;
}
