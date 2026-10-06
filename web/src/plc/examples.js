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
  });
  return p;
}

/** Groups of the PLC example gallery (LAB_EXAMPLES[i].category). */
export const LAB_EXAMPLE_CATEGORIES = [
  { id: 'basics', name: 'Ladder basics' },
  { id: 'motor', name: 'Motor control' },
  { id: 'vfd', name: 'VFD & drives' },
  { id: 'process', name: 'Process automation' },
  { id: 'complete', name: 'Complete projects' },
  { id: 'practice', name: 'Practice' },
];

export const LAB_EXAMPLES = [
  {
    id: 'start-stop', category: 'basics', name: 'Start / Stop latching circuit', level: 'beginner', tags: ['PLC', 'Ladder'],
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
    id: 'traffic-light', category: 'basics', name: 'Traffic light with timers', level: 'beginner', tags: ['TMR', 'Timers'],
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
    id: 'part-counter', category: 'basics', name: 'Part counter with sensor + HMI', level: 'intermediate', tags: ['CNT', 'HMI', 'Sensor'],
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
            E('text', 36, 28, 600, 40, { text: 'PART COUNTER · DVP-16ES2', size: 28, color: '#e2e8f0', align: 'left', bold: true }),
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
    id: 'vfd-terminals', category: 'vfd', name: 'VFD forward / reverse, 2 speeds', level: 'intermediate', tags: ['VFD', 'MS300', 'Interlock'],
    description: 'Interlocked FWD / REV control of a Delta MS300 through its terminals: PLC relays drive MI1 (FWD), MI2 (REV) and MI3 / MI4 (multi-step speeds 15 Hz / 45 Hz).',
    build() {
      const b = builder();
      base(b);
      b.dev('vfd', 'ms300', {}, { params: { '00-21': 1, '00-20': 0, '02-00': 0, '01-12': 3, '01-13': 3, '04-00': 15, '04-01': 45 } });
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
        rung('HIGH speed → MI4 (multi-step 2 = Pr.04-01 = 45 Hz)', ['X3 => OUT Y7']),
      ], { X0: 'FWD button', X1: 'REV button', X2: 'STOP button (NC)', X3: 'SPEED selector', Y4: 'VFD MI1 (FWD)', Y5: 'VFD MI2 (REV)', Y6: 'VFD MI3 (step 1)', Y7: 'VFD MI4 (step 2)', M0: 'Forward run', M1: 'Reverse run' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'vfd-modbus-hmi', category: 'complete', name: 'VFD speed control · Modbus RTU + HMI', level: 'advanced', tags: ['MODRW', 'RS-485', 'HMI', 'VFD'], featured: true,
    description: 'The complete system: DOP-107 HMI ↔ DVP PLC (COM1) ↔ MS300 VFD over RS-485 Modbus RTU (MODRW). Set the speed on the HMI, read back frequency, current and fault code.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('vfd', 'ms300', {}, { params: { '00-20': 1, '00-21': 2, '09-00': 1, '09-01': 9.6, '09-04': 14, '01-12': 5, '01-13': 5 } });
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
      ], {
        X0: 'START button', X1: 'STOP button (NC)', X2: 'E-STOP (NC)', Y0: 'RUN lamp', Y1: 'FAULT lamp', M0: 'Run command', M10: 'HMI START', M11: 'HMI STOP',
        D0: 'VFD command word', D10: 'Speed set point (0.01 Hz)', D20: 'Output frequency (0.01 Hz)', D21: 'Output current (0.01 A)', D22: 'VFD fault code', D28: 'Motor speed (rpm)',
      });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Drive', bg: '#0b1630', elements: [
            E('rect', 12, 10, 776, 58, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
            E('text', 30, 22, 560, 36, { text: 'VFD SPEED CONTROL · MODBUS RTU', size: 26, color: '#e2e8f0', align: 'left', bold: true }),
            E('lamp', 660, 18, 110, 42, { bit: 'M0', text: 'RUN', onColor: '#22c55e', offColor: '#334155', shape: 'rect' }),
            E('rect', 12, 80, 250, 388, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'CONTROL' }),
            E('button', 30, 118, 214, 76, { text: 'START', bit: 'M10', mode: 'momentary', color: 'green' }),
            E('button', 30, 206, 214, 76, { text: 'STOP', bit: 'M11', mode: 'momentary', color: 'red' }),
            E('input', 30, 296, 214, 76, { word: 'D10', dec: 2, unit: 'Hz', label: 'SET SPEED', min: 0, max: 50 }),
            E('motor', 30, 382, 76, 76, { bit: 'M0', text: '' }),
            E('lamp', 130, 392, 110, 56, { bit: 'Y1', text: 'FAULT', onColor: '#ef4444', offColor: '#334155', shape: 'rect' }),
            E('rect', 274, 80, 514, 210, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'DRIVE STATUS' }),
            E('meter', 288, 112, 220, 168, { word: 'D20', dec: 2, unit: 'Hz', label: 'OUTPUT', min: 0, max: 50 }),
            E('num', 520, 112, 254, 52, { word: 'D20', dec: 2, unit: 'Hz', label: 'FREQUENCY' }),
            E('num', 520, 170, 254, 52, { word: 'D21', dec: 2, unit: 'A', label: 'CURRENT' }),
            E('num', 520, 228, 254, 52, { word: 'D28', dec: 0, unit: 'rpm', label: 'SPEED' }),
            E('trend', 274, 300, 514, 168, { word: 'D20', word2: 'D10', dec: 2, min: 0, max: 50, span: 30, label: 'OUTPUT Hz  /  SET POINT' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'analog-speed', category: 'vfd', name: 'Analog speed: pot → EX2 → VFD', level: 'advanced', tags: ['Analog', 'EX2', 'AVI'],
    description: 'A DVP-20EX2 reads a speed pot on AI channel 0 (D1110) and drives the MS300 AVI input from AO channel 0 (D1116). START/STOP run the drive through MI1.',
    build() {
      const b = builder();
      base(b, 'dvp-20ex2');
      b.dev('vfd', 'ms300', {}, { params: { '00-20': 2, '00-21': 1, '01-12': 4, '01-13': 4 } });
      b.dev('motor', 'motor', { load: 30 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('pot', 'pot', { label: 'SPEED' }, { pos: 0.6 });
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('vfd', '+10V', 'pot', '1'); b.w('pot', '3', 'vfd', 'ACM'); b.w('pot', '2', 'plc', 'V0+');
      b.w('plc', 'AIG', 'vfd', 'ACM');
      b.w('plc', 'VO0', 'vfd', 'AVI'); b.w('plc', 'AOG', 'vfd', 'ACM');
      b.w('plc', 'C0', 'vfd', 'DCM'); b.w('plc', 'Y0', 'vfd', 'MI1');
      const prog = program([
        rung('Run latch → Y0 drives MI1 (FWD)', ['X0| X1 => OUT Y0', 'Y0']),
        rung('Analog pass-through: AI CH0 (D1110, 0–2000) → AO CH0 (D1116, 0–2000 = 0–10 V)', ['M1000 => MOV D1110 D1116']),
        rung('Keep a copy in D100 for monitoring', ['M1000 => MOV D1110 D100']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'VFD MI1 (FWD)', D1110: 'AI CH0 (pot)', D1116: 'AO CH0 → VFD AVI' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'star-delta', category: 'motor', name: 'Star-delta starter (timers)', level: 'intermediate', tags: ['TMR', 'Interlock', 'Contactors'],
    description: 'The classic reduced-voltage start: START closes the main contactor and the star contactor, after 5 s the star opens and — 0.5 s later — the delta contactor closes. Star and delta can never be on together (electrical interlock).',
    build() {
      const b = builder();
      base(b);
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('k1', 'lamp', { label: 'K1 MAIN', color: 'green' });
      b.dev('k2', 'lamp', { label: 'K2 STAR', color: 'yellow' });
      b.dev('k3', 'lamp', { label: 'K3 DELTA', color: 'red' });
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'k1', 'X1'); b.w('plc', 'Y1', 'k2', 'X1'); b.w('plc', 'Y2', 'k3', 'X1');
      b.w('k1', 'X2', 'psu', '-V2'); b.w('k1', 'X2', 'k2', 'X2', '#1e3a8a'); b.w('k2', 'X2', 'k3', 'X2', '#1e3a8a');
      const prog = program([
        rung('Run latch: START (X0) latches M0, STOP (X1, NC) releases it', ['X0| X1 => OUT M0', 'M0']),
        rung('K1 main contactor follows the run command', ['M0 => OUT Y0']),
        rung('T0: star time 5.0 s', ['M0 => TMR T0 K50']),
        rung('K2 star contactor: only during the star time and never together with delta (Y2)', ['M0 /T0 /Y2 => OUT Y1']),
        rung('T1: 0.5 s changeover pause once the star time is over', ['T0 => TMR T1 K5']),
        rung('K3 delta contactor: after the pause, interlocked with star (Y1)', ['T1 /Y1 => OUT Y2']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'K1 main contactor', Y1: 'K2 star contactor', Y2: 'K3 delta contactor', T0: 'star time', T1: 'changeover pause' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'bottle-filling', category: 'process', name: 'Bottle filling station', level: 'intermediate', tags: ['TMR', 'CNT', 'Sensor'],
    description: 'A bottle arrives (sensor X2), the PLC waits 1 s for it to settle, opens the fill valve for 3 s, counts the full bottle and, after 5 bottles, lights the BATCH DONE lamp and beeps. Tap the sensor to move a bottle in and out.',
    build() {
      const b = builder();
      base(b);
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('bottle', 'prox', { label: 'BOTTLE' });
      b.dev('reset', 'pb', { label: 'NEW BATCH', color: 'blue', contact: 'NO' });
      b.dev('valve', 'lamp', { label: 'FILL VALVE', color: 'yellow' });
      b.dev('done', 'lamp', { label: 'BATCH DONE', color: 'green' });
      b.dev('buz', 'buzzer', { label: 'HORN' });
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626'); b.w('stop', '11', 'reset', '13', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1'); b.w('reset', '14', 'plc', 'X3');
      b.w('psu', '+V1', 'bottle', 'BN'); b.w('bottle', 'BU', 'psu', '-V1'); b.w('bottle', 'BK', 'plc', 'X2');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'valve', 'X1'); b.w('plc', 'Y1', 'done', 'X1'); b.w('plc', 'Y2', 'buz', '+');
      b.w('valve', 'X2', 'psu', '-V2'); b.w('valve', 'X2', 'done', 'X2', '#1e3a8a'); b.w('done', 'X2', 'buz', '-', '#1e3a8a');
      const prog = program([
        rung('Run latch', ['X0| X1 => OUT M0', 'M0']),
        rung('T0: the bottle must stand still for 1.0 s before filling', ['M0 X2 /C0 => TMR T0 K10']),
        rung('Fill valve is open from 1 s until 4 s after the bottle arrived', ['T0 /T1 => OUT Y0']),
        rung('T1: fill time 3.0 s', ['T0 => TMR T1 K30']),
        rung('Count every filled bottle (T1 rising edge) — batch size 5', ['T1 => CNT C0 K5']),
        rung('Batch finished: lamp + horn that beeps (1 s clock)', ['C0 =>| OUT Y1', 'C0 M1013 => OUT Y2']),
        rung('NEW BATCH button (X3) resets the counter', ['X3 => RST C0']),
      ], { X0: 'START', X1: 'STOP (NC)', X2: 'Bottle sensor', X3: 'NEW BATCH', Y0: 'Fill valve', Y1: 'BATCH DONE lamp', Y2: 'Horn', C0: 'Bottle counter', T0: 'settle time', T1: 'fill time' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'tank-level', category: 'process', name: 'Tank level control + HMI', level: 'advanced', tags: ['Compare', 'ADD / SUB', 'HMI', 'Hysteresis'],
    description: 'The tank is simulated in register D10 (0–100 %): the pump adds 5 % per second, the process always takes 2 % per second and the DRAIN button opens a bigger valve. In AUTO the pump starts below 20 % and stops at 80 % (hysteresis). The HMI draws the level.',
    build() {
      const b = builder();
      base(b);
      b.dev('hmi', 'dop-107bv', { port: 'COM1', station: 1 });
      b.dev('mode', 'selector', { label: 'MODE', pos0: 'MANUAL', pos1: 'AUTO' }, { on: true });
      b.dev('man', 'pb', { label: 'PUMP (MAN)', color: 'green', contact: 'NO' });
      b.dev('drain', 'pb', { label: 'DRAIN', color: 'blue', contact: 'NO' });
      b.dev('pump', 'lamp', { label: 'PUMP', color: 'green' });
      b.dev('high', 'lamp', { label: 'HIGH', color: 'red' });
      b.dev('low', 'lamp', { label: 'LOW', color: 'yellow' });
      b.dev('buz', 'buzzer', { label: 'LOW ALARM' });
      b.w('psu', '+V1', 'mode', '13'); b.w('mode', '13', 'man', '13', '#dc2626'); b.w('man', '13', 'drain', '13', '#dc2626');
      b.w('mode', '14', 'plc', 'X0'); b.w('man', '14', 'plc', 'X1'); b.w('drain', '14', 'plc', 'X2');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'pump', 'X1'); b.w('plc', 'Y1', 'high', 'X1'); b.w('plc', 'Y2', 'low', 'X1'); b.w('plc', 'Y3', 'buz', '+');
      b.w('pump', 'X2', 'psu', '-V2'); b.w('pump', 'X2', 'high', 'X2', '#1e3a8a'); b.w('high', 'X2', 'low', 'X2', '#1e3a8a'); b.w('low', 'X2', 'buz', '-', '#1e3a8a');
      b.w('hmi', '+', 'psu', '+V2'); b.w('hmi', '-', 'psu', '-V2');
      b.w('hmi', 'COM1', 'plc', 'COM1');
      const prog = program([
        rung('First scan: tank starts half full (40 %)', ['M1002 => MOV K40 D10']),
        rung('Hysteresis: start the pump below 20 %', ['D10<K20 => SET M0']),
        rung('Hysteresis: stop the pump at 80 %', ['D10>=K80 => RST M0']),
        rung('Pump: AUTO (X0 = 1) follows M0, MANUAL (X0 = 0) follows the PUMP button (X1)', ['X0 M0| => OUT Y0', '/X0 X1']),
        rung('Inflow: +5 % every second while the pump runs', ['Y0 ^M1013 => ADDP D10 K5 D10']),
        rung('Consumption: −2 % every second', ['^M1013 => SUBP D10 K2 D10']),
        rung('DRAIN valve (X2): another −6 % every second', ['X2 ^M1013 => SUBP D10 K6 D10']),
        rung('Keep the level between 0 and 100 %', ['D10<K0 =>| MOV K0 D10', 'D10>K100 => MOV K100 D10']),
        rung('HIGH lamp ≥ 80 %, LOW lamp < 20 %', ['D10>=K80 =>| OUT Y1', 'D10<K20 => OUT Y2']),
        rung('LOW alarm buzzer below 10 % (beeps with the 1 s clock)', ['D10<K10 M1013 => OUT Y3']),
      ], { X0: 'MODE (1 = AUTO)', X1: 'PUMP button (manual)', X2: 'DRAIN button', Y0: 'Pump', Y1: 'HIGH lamp', Y2: 'LOW lamp', Y3: 'Low alarm buzzer', D10: 'Tank level (%)', M0: 'Pump request (auto)' });
      const hmi = {
        start: 0,
        screens: [{
          id: 's1', name: 'Tank', bg: '#0b1630', elements: [
            E('rect', 16, 14, 768, 64, { fill: '#10224a', stroke: '#2b4470', radius: 14, title: '' }),
            E('text', 36, 28, 600, 40, { text: 'TANK LEVEL CONTROL', size: 28, color: '#e2e8f0', align: 'left', bold: true }),
            E('rect', 16, 94, 380, 370, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'LEVEL' }),
            E('num', 40, 140, 330, 90, { word: 'D10', dec: 0, unit: '%', label: 'LEVEL' }),
            E('meter', 40, 250, 330, 190, { word: 'D10', dec: 0, unit: '%', label: 'LEVEL', min: 0, max: 100 }),
            E('rect', 412, 94, 372, 370, { fill: '#0f1d3a', stroke: '#2b4470', radius: 16, title: 'STATUS' }),
            E('lamp', 440, 140, 100, 100, { bit: 'Y0', text: 'PUMP', onColor: '#22c55e', offColor: '#334155', shape: 'circle' }),
            E('lamp', 570, 140, 100, 100, { bit: 'Y1', text: 'HIGH', onColor: '#ef4444', offColor: '#334155', shape: 'circle' }),
            E('lamp', 440, 260, 100, 100, { bit: 'Y2', text: 'LOW', onColor: '#f59e0b', offColor: '#334155', shape: 'circle' }),
            E('bar', 700, 140, 60, 290, { word: 'D10', dec: 0, label: 'TANK', min: 0, max: 100, color: '#22d3ee' }),
            E('trend', 412, 370, 290, 90, { word: 'D10', word2: 'D10', dec: 0, min: 0, max: 100, span: 60, label: 'LEVEL' }),
          ],
        }],
      };
      return finish(this, b, prog, { hmi });
    },
  },
  {
    id: 'alarm-annunciator', category: 'basics', name: 'Alarm annunciator with acknowledge', level: 'intermediate', tags: ['SET / RST', 'M1013', 'Edge'],
    description: 'Two alarm inputs (selectors). A new alarm makes its lamp flash and sounds the horn; ACK makes the lamp steady and silences the horn; when the input returns to normal the lamp goes out.',
    build() {
      const b = builder();
      base(b);
      b.dev('a1', 'selector', { label: 'TEMP HIGH', pos0: 'OK', pos1: 'ALARM' }, { on: false });
      b.dev('a2', 'selector', { label: 'DOOR OPEN', pos0: 'OK', pos1: 'ALARM' }, { on: false });
      b.dev('ack', 'pb', { label: 'ACK', color: 'blue', contact: 'NO' });
      b.dev('l1', 'lamp', { label: 'TEMP', color: 'red' });
      b.dev('l2', 'lamp', { label: 'DOOR', color: 'yellow' });
      b.dev('horn', 'buzzer', { label: 'HORN' });
      b.w('psu', '+V1', 'a1', '13'); b.w('a1', '13', 'a2', '13', '#dc2626'); b.w('a2', '13', 'ack', '13', '#dc2626');
      b.w('a1', '14', 'plc', 'X0'); b.w('a2', '14', 'plc', 'X1'); b.w('ack', '14', 'plc', 'X2');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'l1', 'X1'); b.w('plc', 'Y1', 'l2', 'X1'); b.w('plc', 'Y2', 'horn', '+');
      b.w('l1', 'X2', 'psu', '-V2'); b.w('l1', 'X2', 'l2', 'X2', '#1e3a8a'); b.w('l2', 'X2', 'horn', '-', '#1e3a8a');
      const rows = [];
      [[0, 10, 'Y0', 'Temperature'], [1, 11, 'Y1', 'Door']].forEach(([x, m, y, name]) => {
        rows.push(rung(`${name}: ACK (X2) while the alarm is active acknowledges it (M${m})`, [`X2 X${x} => SET M${m}`]));
        rows.push(rung(`${name}: the acknowledged flag is cleared when the input is back to normal`, [`/X${x} => RST M${m}`]));
        rows.push(rung(`${name} lamp: flashing while unacknowledged, steady after ACK`, [`X${x} /M${m} M1013| => OUT ${y}`, `X${x} M${m} -`]));
      });
      rows.push(rung('Horn: any alarm that is not acknowledged', ['X0 /M10| => OUT Y2', 'X1 /M11']));
      const prog = program(rows, { X0: 'Temperature alarm', X1: 'Door alarm', X2: 'ACK button', Y0: 'TEMP lamp', Y1: 'DOOR lamp', Y2: 'Horn', M10: 'Temp acknowledged', M11: 'Door acknowledged' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-lights', category: 'basics', name: 'Step ladder: sequential lamps', level: 'advanced', tags: ['STL', 'RET', 'Sequence'],
    description: 'A step-ladder (STL) sequence: START moves from the idle step S0 to S20, S21, S22 — one lamp per step for 2 s each — and back. STOP returns to idle from any step.',
    build() {
      const b = builder();
      base(b);
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('l1', 'lamp', { label: 'STEP 1', color: 'green' });
      b.dev('l2', 'lamp', { label: 'STEP 2', color: 'yellow' });
      b.dev('l3', 'lamp', { label: 'STEP 3', color: 'red' });
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      b.w('plc', 'Y0', 'l1', 'X1'); b.w('plc', 'Y1', 'l2', 'X1'); b.w('plc', 'Y2', 'l3', 'X1');
      b.w('l1', 'X2', 'psu', '-V2'); b.w('l1', 'X2', 'l2', 'X2', '#1e3a8a'); b.w('l2', 'X2', 'l3', 'X2', '#1e3a8a');
      const prog = program([
        rung('First scan: enter the idle step S0', ['M1002 => SET S0']),
        rung('S0 idle: START (X0) → step S20', ['$S0 X0 => SET S20']),
        rung('S20: lamp 1 for 2 s, then S21; STOP (X1 open) → S0', ['$S20 =>| OUT Y0', '=> TMR T0 K20', 'T0 => SET S21', '/X1 => SET S0']),
        rung('S21: lamp 2 for 2 s, then S22', ['$S21 =>| OUT Y1', '=> TMR T1 K20', 'T1 => SET S22', '/X1 => SET S0']),
        rung('S22: lamp 3 for 2 s, then back to idle', ['$S22 =>| OUT Y2', '=> TMR T2 K20', 'T2 => SET S0', '/X1 => SET S0']),
        rung('End of the step ladder', ['=> RET']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'Step 1 lamp', Y1: 'Step 2 lamp', Y2: 'Step 3 lamp', S0: 'Idle', S20: 'Step 1', S21: 'Step 2', S22: 'Step 3' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'vfd-auto-cycle', category: 'vfd', name: 'VFD automatic speed cycle (STL)', level: 'advanced', tags: ['STL', 'VFD', 'MS300', 'Multi-step'],
    description: 'A step-ladder program drives the MS300 through three multi-step speeds: 10 Hz, 30 Hz and 50 Hz, 5 s each, then stops. MI3 / MI4 select the speed (binary code), MI1 runs the drive forward.',
    build() {
      const b = builder();
      base(b);
      b.dev('vfd', 'ms300', {}, { params: { '00-21': 1, '00-20': 0, '02-00': 0, '01-12': 2, '01-13': 2, '04-00': 10, '04-01': 30, '04-02': 50 } });
      b.dev('motor', 'motor', { load: 40 });
      b.dev('start', 'pb', { label: 'START', color: 'green', contact: 'NO' });
      b.dev('stop', 'pb', { label: 'STOP', color: 'red', contact: 'NC' });
      b.dev('run', 'lamp', { label: 'CYCLE', color: 'green' });
      b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
      b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
      b.w('psu', '+V1', 'start', '13'); b.w('start', '13', 'stop', '11', '#dc2626');
      b.w('start', '14', 'plc', 'X0'); b.w('stop', '12', 'plc', 'X1');
      b.w('plc', 'C0', 'psu', '+V2'); b.w('plc', 'Y0', 'run', 'X1'); b.w('run', 'X2', 'psu', '-V2');
      b.w('plc', 'C1', 'vfd', 'DCM');
      b.w('plc', 'Y4', 'vfd', 'MI1'); b.w('plc', 'Y6', 'vfd', 'MI3'); b.w('plc', 'Y7', 'vfd', 'MI4');
      const prog = program([
        rung('First scan: enter the idle step S0', ['M1002 => SET S0']),
        rung('S0 idle: START (X0) → S20', ['$S0 X0 => SET S20']),
        rung('S20: forward + MI3 → multi-step 1 (Pr.04-00 = 10 Hz) for 5 s', ['$S20 =>| OUT Y4', '=>| OUT Y6', '=>| OUT Y0', '=> TMR T0 K50', 'T0 => SET S21', '/X1 => SET S0']),
        rung('S21: forward + MI4 → multi-step 2 (Pr.04-01 = 30 Hz) for 5 s', ['$S21 =>| OUT Y4', '=>| OUT Y7', '=>| OUT Y0', '=> TMR T1 K50', 'T1 => SET S22', '/X1 => SET S0']),
        rung('S22: forward + MI3 + MI4 → multi-step 3 (Pr.04-02 = 50 Hz) for 5 s, then stop', ['$S22 =>| OUT Y4', '=>| OUT Y6', '=>| OUT Y7', '=>| OUT Y0', '=> TMR T2 K50', 'T2 => SET S0', '/X1 => SET S0']),
        rung('End of the step ladder', ['=> RET']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'CYCLE lamp', Y4: 'VFD MI1 (FWD)', Y6: 'VFD MI3 (step 1)', Y7: 'VFD MI4 (step 2)', S0: 'Idle', S20: '10 Hz', S21: '30 Hz', S22: '50 Hz' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'blank', category: 'practice', name: 'Blank lab (PLC + power)', level: 'beginner', tags: ['Empty'],
    description: 'A powered DVP-16ES2 with its 24 V supply and the programming laptop. Add devices and write your own program.',
    build() {
      const b = builder();
      base(b);
      return finish(this, b, program([rung('', [''])], {}), { noDownload: true });
    },
  },
];

export function buildExample(id) {
  const ex = LAB_EXAMPLES.find((e) => e.id === id);
  if (!ex) return null;
  const p = ex.build();
  p.name = ex.name;
  return p;
}
