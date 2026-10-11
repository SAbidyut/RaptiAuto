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
    id: 'blank', name: 'Blank lab (PLC + power)', level: 'beginner', tags: ['Empty'],
    description: 'A powered DVP16ES2 with its 24 V supply and the programming laptop. Add devices and write your own program.',
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
