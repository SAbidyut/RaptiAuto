// "Step by step" — small PLC labs that build on each other, one new idea per step (the projects of
// the Step-by-step part of the manual; each has a full guide in guides.js). Each is fully wired and
// downloaded like the other examples.
import { rung, program } from './sim/dsl.js';
import { builder, base, finish, comRung, VFD_MODBUS } from './example-kit.js';

/** +24 V → button 13, 14 → PLC input; `from` = where its +24 V comes from (the supply, or the button before it). */
function button(b, id, label, color, plcIn, contact = 'NO', from = ['psu', '+V1']) {
  b.dev(id, 'pb', { label, color, contact });
  const red = from[0] === 'psu' ? undefined : '#dc2626';
  if (contact === 'NC') { b.w(from[0], from[1], id, '11', red); b.w(id, '12', 'plc', plcIn); } else { b.w(from[0], from[1], id, '13', red); b.w(id, '14', 'plc', plcIn); }
}
/** PLC output → lamp X1, X2 → 0 V (C0 already on +24 V). */
function lamp(b, id, label, color, plcOut) {
  b.dev(id, 'lamp', { label, color });
  b.w('plc', plcOut, id, 'X1'); b.w(id, 'X2', 'psu', '-V2');
}
/** MS300 + motor, powered from the MCB. */
function drive(b, params, load = 35) {
  b.dev('vfd', 'ms300', {}, { params });
  b.dev('motor', 'motor', { load });
  b.w('mcb', 'L', 'vfd', 'R/L1'); b.w('mcb', 'N', 'vfd', 'S/L2'); b.w('vfd', 'PE', 'psu', 'PE');
  b.w('vfd', 'U/T1', 'motor', 'U'); b.w('vfd', 'V/T2', 'motor', 'V'); b.w('vfd', 'W/T3', 'motor', 'W'); b.w('vfd', 'PE', 'motor', 'PE');
}
/** DVP04AD-E2 on the right of the PLC, 24 V from the PLC's own 24 V output (+24V / 24G). */
function adModule(b) {
  b.dev('ad', 'dvp04ad-e2');
  b.w('plc', '+24V', 'ad', '24V'); b.w('ad', '0V', 'plc', '0V');
}

const STEP = (n, title) => `Step ${String(n).padStart(2, '0')} · ${title}`;
/** Drive on the terminals: keypad speed, RUN / STOP from MI1 (FWD) and MI2 (REV). */
const VFD_TERMINALS = { _v: 2, '00-20': 0, '00-21': 1, '02-00': 1, '01-12': 3, '01-13': 3 };

export const STEP_EXAMPLES = [
  // ------------------------------------------------------------------ part 1: ladder basics
  {
    id: 'step-01-button-lamp', step: 1, name: STEP(1, 'One button → one lamp'), level: 'beginner', tags: ['Step by step', 'Ladder'],
    description: 'The smallest program there is: while the button (X0) is pressed the lamp (Y0) is on; let go and it goes out. X0 → OUT Y0.',
    build() {
      const b = builder();
      base(b);
      button(b, 'pb1', 'PUSH', 'green', 'X0');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'l1', 'LAMP', 'green', 'Y0');
      const prog = program([
        rung('While X0 is ON, Y0 is ON (let go of the button and the lamp goes out)', ['X0 => OUT Y0']),
      ], { X0: 'PUSH button', Y0: 'Lamp' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-02-no-nc', step: 2, name: STEP(2, 'NO and NC contacts'), level: 'beginner', tags: ['Step by step', 'Ladder'],
    description: 'One button, two lamps: the NO contact (X0) lights the green lamp, the NC contact (/X0) the red one — pressing the button swaps them.',
    build() {
      const b = builder();
      base(b);
      button(b, 'pb1', 'PUSH', 'green', 'X0');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lg', 'NO', 'green', 'Y0');
      lamp(b, 'lr', 'NC', 'red', 'Y1');
      const prog = program([
        rung('NO contact: passes power when X0 is ON → Y0 (green)', ['X0 => OUT Y0']),
        rung('NC contact: passes power when X0 is OFF → Y1 (red)', ['/X0 => OUT Y1']),
      ], { X0: 'PUSH button', Y0: 'Green lamp (NO)', Y1: 'Red lamp (NC)' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-03-latch', step: 3, name: STEP(3, 'Start / Stop latch (self-holding)'), level: 'beginner', tags: ['Step by step', 'Ladder'],
    description: 'Press START once and the motor output (Y0) stays on — Y0 holds itself through its own contact. The NC STOP button (X1) breaks the latch.',
    build() {
      const b = builder();
      base(b);
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lrun', 'RUN', 'green', 'Y0');
      const prog = program([
        rung('START (X0) or Y0 itself keeps Y0 on; STOP is an NC button, so X1 is normally ON — pressing it turns X1 OFF and breaks the latch', ['X0| X1 => OUT Y0', 'Y0']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'RUN lamp / motor' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-04-set-rst', step: 4, name: STEP(4, 'SET and RST'), level: 'beginner', tags: ['Step by step', 'Ladder'],
    description: 'Another way to latch: ON (X0) → SET Y0 (it stays on), OFF (X1) → RST Y0 (off). Both buttons are NO.',
    build() {
      const b = builder();
      base(b);
      button(b, 'on', 'ON', 'green', 'X0');
      button(b, 'off', 'OFF', 'red', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'l1', 'LAMP', 'yellow', 'Y0');
      const prog = program([
        rung('ON button → SET Y0 (Y0 stays on after you let go)', ['X0 => SET Y0']),
        rung('OFF button → RST Y0 (Y0 off)', ['X1 => RST Y0']),
      ], { X0: 'ON button', X1: 'OFF button', Y0: 'Lamp' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-05-timer', step: 5, name: STEP(5, 'Timer: lamp after 5 seconds'), level: 'beginner', tags: ['Step by step', 'TMR'],
    description: 'START latches M0 and timer T0 starts counting (K50 × 100 ms = 5 s). After 5 s the DONE lamp (Y1) lights. STOP resets everything.',
    build() {
      const b = builder();
      base(b);
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lwait', 'WAIT', 'yellow', 'Y0');
      lamp(b, 'ldone', 'DONE', 'green', 'Y1');
      const prog = program([
        rung('START → latch M0, STOP (NC) breaks it', ['X0| X1 => OUT M0', 'M0']),
        rung('While M0 is ON, T0 counts: K50 = 50 × 0.1 s = 5 s', ['M0 => TMR T0 K50']),
        rung('Waiting: yellow lamp', ['M0 /T0 => OUT Y0']),
        rung('5 s are up → the T0 contact turns ON → green lamp', ['T0 => OUT Y1']),
      ], { X0: 'START', X1: 'STOP (NC)', M0: 'Running', T0: '5 s timer', Y0: 'WAIT lamp', Y1: 'DONE lamp' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-06-blink', step: 6, name: STEP(6, 'Flashing lamp (M1013 clock)'), level: 'beginner', tags: ['Step by step', 'Special M'],
    description: 'Turn the selector ON and the lamp flashes once a second. M1013 is the PLC\'s built-in 1 s clock (0.5 s ON, 0.5 s OFF).',
    build() {
      const b = builder();
      base(b);
      b.dev('sel', 'selector', { label: 'BLINK', pos0: 'OFF', pos1: 'ON' });
      b.w('psu', '+V1', 'sel', '13'); b.w('sel', '14', 'plc', 'X0');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'l1', 'ALARM', 'red', 'Y0');
      const prog = program([
        rung('Selector (X0) ON and the M1013 clock ON → Y0 ON: the lamp flashes', ['X0 M1013 => OUT Y0']),
      ], { X0: 'BLINK selector', Y0: 'ALARM lamp' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-07-counter', step: 7, name: STEP(7, 'Counter: count to 5'), level: 'beginner', tags: ['Step by step', 'CNT'],
    description: 'Every press of COUNT (X0) adds one to C0. At 5 the FULL lamp lights. RESET (X1) sets the count back to 0.',
    build() {
      const b = builder();
      base(b);
      button(b, 'cnt', 'COUNT', 'blue', 'X0');
      button(b, 'rst', 'RESET', 'black', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lfull', 'FULL', 'green', 'Y0');
      const prog = program([
        rung('Each time X0 goes OFF → ON, C0 counts one (up to K5)', ['X0 => CNT C0 K5']),
        rung('At 5 the C0 contact turns ON → FULL lamp', ['C0 => OUT Y0']),
        rung('RESET button → C0 back to 0', ['X1 => RST C0']),
      ], { X0: 'COUNT button', X1: 'RESET button', C0: 'Counter (5)', Y0: 'FULL lamp' });
      return finish(this, b, prog);
    },
  },

  // ------------------------------------------------------------------ part 2: the drive on its terminals
  {
    id: 'step-08-vfd-run', step: 8, name: STEP(8, 'Run the VFD: PLC → MI1'), level: 'beginner', tags: ['Step by step', 'VFD'],
    description: 'When PLC relay Y4 closes it joins the drive\'s MI1 to DCM → the drive runs forward. Speed from the keypad (Pr.00-20 = 0), run command from the terminals (Pr.00-21 = 1).',
    build() {
      const b = builder();
      base(b);
      drive(b, { ...VFD_TERMINALS });
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'C1', 'vfd', 'DCM'); b.w('plc', 'Y4', 'vfd', 'MI1');
      const prog = program([
        rung('START → latch M0, STOP (NC) breaks it', ['X0| X1 => OUT M0', 'M0']),
        rung('M0 → Y4: the relay joins MI1 to DCM → the VFD runs forward', ['M0 => OUT Y4']),
      ], { X0: 'START', X1: 'STOP (NC)', M0: 'Running', Y4: 'VFD MI1 (FWD)' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-09-vfd-fwd-rev', step: 9, name: STEP(9, 'FWD / REV on the terminals (interlock)'), level: 'beginner', tags: ['Step by step', 'VFD', 'Interlock'],
    description: 'FWD (X0) and REV (X1) are two separate latches; while one is on the other cannot turn on (interlock). Y4 → MI1 (FWD), Y5 → MI2 (REV).',
    build() {
      const b = builder();
      base(b);
      drive(b, { ...VFD_TERMINALS });
      button(b, 'fwd', 'FWD', 'green', 'X0');
      button(b, 'rev', 'REV', 'yellow', 'X1');
      button(b, 'stop', 'STOP', 'red', 'X2', 'NC');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lf', 'FWD', 'green', 'Y0');
      lamp(b, 'lr', 'REV', 'yellow', 'Y1');
      b.w('plc', 'C1', 'vfd', 'DCM'); b.w('plc', 'Y4', 'vfd', 'MI1'); b.w('plc', 'Y5', 'vfd', 'MI2');
      const prog = program([
        rung('Forward M0: FWD latches; not while STOP (NC) is pressed or M1 (reverse) runs — interlock', ['X0| X2 /M1 => OUT M0', 'M0']),
        rung('Reverse M1: REV latches; not while M0 runs', ['X1| X2 /M0 => OUT M1', 'M1']),
        rung('Forward → MI1 (Y4) + FWD lamp', ['M0 =>| OUT Y4', '=> OUT Y0']),
        rung('Reverse → MI2 (Y5) + REV lamp', ['M1 =>| OUT Y5', '=> OUT Y1']),
      ], { X0: 'FWD', X1: 'REV', X2: 'STOP (NC)', M0: 'Forward', M1: 'Reverse', Y4: 'VFD MI1 (FWD)', Y5: 'VFD MI2 (REV)' });
      return finish(this, b, prog);
    },
  },

  // ------------------------------------------------------------------ part 3: Modbus RTU (RS-485)
  {
    id: 'step-10-modbus-run', step: 10, name: STEP(10, 'Modbus: start / stop the VFD'), level: 'intermediate', tags: ['Step by step', 'Modbus', 'MODRW'],
    description: 'No MI wires at all — only an RS-485 cable (PLC COM2 → VFD RJ45). The PLC writes H12 (RUN FWD) or H1 (STOP) to register 2000H and the speed to 2001H (K3000 = 30.00 Hz).',
    build() {
      const b = builder();
      base(b);
      drive(b, { ...VFD_MODBUS.params });
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'COM2', 'vfd', 'RS485');
      const prog = program([
        comRung(['MOV K3000 D11']),
        rung('START → latch M0, STOP (NC) breaks it', ['X0| X1 => OUT M0', 'M0']),
        rung('Command word D10: running → H12 = RUN + FWD', ['M0 => MOV H12 D10']),
        rung('Stopped → H1 = STOP', ['/M0 => MOV H1 D10']),
        rung('Write D10 to 2000H of station 1 (function 06)', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('Write the speed D11 to 2001H of station 1 (0.01 Hz units)', ['M1000 => MODRW K1 K6 H2001 D11 K1']),
      ], { X0: 'START', X1: 'STOP (NC)', M0: 'Running', D10: 'Command word (2000H)', D11: 'Speed, 0.01 Hz (2001H)' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-11-modbus-fwd-rev', step: 11, name: STEP(11, 'Modbus: FORWARD / REVERSE / STOP'), level: 'intermediate', tags: ['Step by step', 'Modbus', 'MODRW', 'Interlock'],
    description: 'Three buttons, one RS-485 cable. FORWARD → H12, REVERSE → H22, STOP → H1 in the command word 2000H. The two direction latches are interlocked.',
    build() {
      const b = builder();
      base(b);
      drive(b, { ...VFD_MODBUS.params });
      button(b, 'fwd', 'FORWARD', 'green', 'X0');
      button(b, 'rev', 'REVERSE', 'yellow', 'X1');
      button(b, 'stop', 'STOP', 'red', 'X2', 'NC');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lf', 'FWD', 'green', 'Y0');
      lamp(b, 'lr', 'REV', 'yellow', 'Y1');
      b.w('plc', 'COM2', 'vfd', 'RS485');
      const prog = program([
        comRung(['MOV K3000 D11']),
        rung('Forward M0: FORWARD latches; not with STOP (NC) pressed or M1 running', ['X0| X2 /M1 => OUT M0', 'M0']),
        rung('Reverse M1: REVERSE latches; not with STOP (NC) pressed or M0 running', ['X1| X2 /M0 => OUT M1', 'M1']),
        rung('Forward: command H12 (RUN + FWD), FWD lamp', ['M0 =>| MOV H12 D10', '=> OUT Y0']),
        rung('Reverse: command H22 (RUN + REV), REV lamp', ['M1 =>| MOV H22 D10', '=> OUT Y1']),
        rung('Neither: command H1 (STOP)', ['/M0 /M1 => MOV H1 D10']),
        rung('2000H ← D10 (command)', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('2001H ← D11 (speed 30.00 Hz)', ['M1000 => MODRW K1 K6 H2001 D11 K1']),
      ], { X0: 'FORWARD', X1: 'REVERSE', X2: 'STOP (NC)', M0: 'Forward', M1: 'Reverse', D10: 'Command word (2000H)', D11: 'Speed (2001H)', Y0: 'FWD lamp', Y1: 'REV lamp' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-12-modbus-speed', step: 12, name: STEP(12, 'Modbus: speed up / down, read the frequency'), level: 'intermediate', tags: ['Step by step', 'Modbus', 'MODRW', 'FC03'],
    description: '+5 Hz / −5 Hz buttons change D11 (ADDP / SUBP, limited to 0–50 Hz). With function 03 the PLC reads 2103H (output Hz) and 2104H (current) into D20, D21.',
    build() {
      const b = builder();
      base(b);
      drive(b, { ...VFD_MODBUS.params });
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      button(b, 'up', '+5 Hz', 'blue', 'X2');
      button(b, 'dn', '-5 Hz', 'white', 'X3', 'NO', ['up', '13']);
      b.w('plc', 'COM2', 'vfd', 'RS485');
      const prog = program([
        comRung(['MOV K2000 D11']),
        rung('START / STOP latch', ['X0| X1 => OUT M0', 'M0']),
        rung('Command: H12 running', ['M0 => MOV H12 D10']),
        rung('Command: H1 stopped', ['/M0 => MOV H1 D10']),
        rung('+5 Hz: once per press (P = pulse): D11 + 500', ['X2 => ADDP D11 K500 D11']),
        rung('−5 Hz: D11 − 500', ['X3 => SUBP D11 K500 D11']),
        rung('Upper limit 50.00 Hz', ['D11>K5000 => MOV K5000 D11']),
        rung('Lower limit 0', ['D11<K0 => MOV K0 D11']),
        rung('Write: 2000H command', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('Write: 2001H speed', ['M1000 => MODRW K1 K6 H2001 D11 K1']),
        rung('Read (function 03): 2103H output Hz and 2104H current → D20, D21', ['M1000 => MODRW K1 K3 H2103 D20 K2']),
      ], { X0: 'START', X1: 'STOP (NC)', X2: '+5 Hz', X3: '−5 Hz', D10: 'Command word', D11: 'Set speed (0.01 Hz)', D20: 'Output Hz (0.01)', D21: 'Current (0.01 A)' });
      return finish(this, b, prog);
    },
  },

  // ------------------------------------------------------------------ part 4: analog input (DVP04AD-E2)
  {
    id: 'step-13-analog-read', step: 13, name: STEP(13, 'Analog input: read 0–10 V'), level: 'intermediate', tags: ['Step by step', 'Analog', 'FROM', '04AD'],
    description: 'A DVP04AD-E2 module clips onto the right of the PLC. A temperature transmitter (0–100 °C → 0–10 V) on CH1. FROM K0 K12 D0 K1 → D0 = 0 … 32000; DIV D0 K32 → D10 = 0 … 1000 = 0.0 … 100.0 °C. Above 60 °C the HOT lamp lights.',
    build() {
      const b = builder();
      base(b);
      adModule(b);
      b.dev('tt', 'temp-tx', { label: 'TEMP', min: 0, max: 100 }, { pos: 0.35 });
      b.w('psu', '+V1', 'tt', 'BN'); b.w('tt', 'BU', 'psu', '-V1');
      b.w('tt', 'BK', 'ad', 'V1+'); b.w('ad', 'VI1-', 'psu', '-V1');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lhot', 'HOT', 'red', 'Y0');
      const prog = program([
        rung('Module K0, CR#12 (present value of CH1) → D0; 0–10 V = 0–32000', ['M1000 => FROM K0 K12 D0 K1']),
        rung('D0 ÷ 32 → D10 = 0 … 1000, i.e. 0.0 … 100.0 °C (the remainder goes to D11)', ['M1000 => DIV D0 K32 D10']),
        rung('Above 60.0 °C (D10 > K600) → HOT lamp', ['D10>K600 => OUT Y0']),
      ], { D0: 'CH1 raw value (0–32000)', D10: 'Temperature, 0.1 °C', Y0: 'HOT lamp' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-14-analog-4-20ma', step: 14, name: STEP(14, 'Analog input: 4–20 mA and TO'), level: 'intermediate', tags: ['Step by step', 'Analog', 'TO', '4-20mA', '04AD'],
    description: 'A 4–20 mA pressure transmitter (0–10 bar) on CH2 with I2+ bridged to V2+ (current input). On the first scan TO K0 K1 H40 K1 sets CH2 to mode 4 (4–20 mA). D11 = 0.0 … 10.0 bar. Below 3 bar the pump starts, above 6 bar it stops.',
    build() {
      const b = builder();
      base(b);
      adModule(b);
      b.dev('pt', 'press-tx', { label: 'PRESSURE', min: 0, max: 10, signal: '4-20mA' }, { pos: 0.5 });
      b.w('psu', '+V1', 'pt', 'BN'); b.w('pt', 'BU', 'psu', '-V1');
      b.w('pt', 'BK', 'ad', 'I2+'); b.w('ad', 'I2+', 'ad', 'V2+', '#a855f7'); b.w('ad', 'VI2-', 'psu', '-V1');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lpump', 'PUMP', 'green', 'Y0');
      const prog = program([
        rung('First scan: CR#1 = H0040 → CH1 mode 0 (±10 V), CH2 mode 4 (4–20 mA)', ['M1002 => TO K0 K1 H40 K1']),
        rung('CR#13 (present value of CH2) → D1; 4 mA = 0, 20 mA = 32000', ['M1000 => FROM K0 K13 D1 K1']),
        rung('D1 ÷ 320 → D11 = 0 … 100 = 0.0 … 10.0 bar', ['M1000 => DIV D1 K320 D11']),
        rung('Below 3.0 bar → pump on (SET)', ['D11<K30 => SET Y0']),
        rung('Above 6.0 bar → pump off (RST); in between it keeps its state (hysteresis)', ['D11>K60 => RST Y0']),
      ], { D1: 'CH2 raw value', D11: 'Pressure, 0.1 bar', Y0: 'Pump' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-15-analog-average', step: 15, name: STEP(15, 'Analog: four channels at once, averaging'), level: 'intermediate', tags: ['Step by step', 'Analog', 'FROM', '04AD'],
    description: 'Four channels in one FROM: FROM K0 K6 D0 K4 → CR#6–9 (averaged values) → D0–D3. CR#2 = K20 makes CH1 average its last 20 readings, so the value is steadier. Temperature on CH1, pressure (0–10 V) on CH2.',
    build() {
      const b = builder();
      base(b);
      adModule(b);
      b.dev('tt', 'temp-tx', { label: 'TEMP', min: 0, max: 100 }, { pos: 0.25 });
      b.dev('pt', 'press-tx', { label: 'PRESSURE', min: 0, max: 10 }, { pos: 0.4 });
      b.w('psu', '+V1', 'tt', 'BN'); b.w('tt', 'BU', 'psu', '-V1'); b.w('tt', 'BK', 'ad', 'V1+'); b.w('ad', 'VI1-', 'psu', '-V1');
      b.w('psu', '+V1', 'pt', 'BN'); b.w('pt', 'BU', 'psu', '-V1'); b.w('pt', 'BK', 'ad', 'V2+'); b.w('ad', 'VI2-', 'psu', '-V1');
      const prog = program([
        rung('First scan: CH1 averages its last 20 readings (CR#2 = K20)', ['M1002 => TO K0 K2 K20 K1']),
        rung('CR#6 … 9 = the averaged values of the four channels → D0 … D3', ['M1000 => FROM K0 K6 D0 K4']),
        rung('CR#12, 13 = present (not averaged) values of CH1, CH2 → D4, D5 — compare them in Monitor', ['M1000 => FROM K0 K12 D4 K2']),
        rung('Temperature: D0 ÷ 32 → D10 = 0.0 … 100.0 °C', ['M1000 => DIV D0 K32 D10']),
        rung('Pressure: D1 ÷ 320 → D12 = 0.0 … 10.0 bar', ['M1000 => DIV D1 K320 D12']),
      ], { D0: 'CH1 average', D1: 'CH2 average', D4: 'CH1 now', D5: 'CH2 now', D10: 'Temperature 0.1 °C', D12: 'Pressure 0.1 bar' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-16-analog-modbus-speed', step: 16, name: STEP(16, 'Final project: pot → 04AD → PLC → Modbus → VFD'), level: 'advanced', tags: ['Step by step', 'Analog', 'Modbus', 'MODRW', 'FROM', '04AD'],
    description: 'Everything together: turn the pot for the speed (CH1, 0–10 V → 0–50.00 Hz), FORWARD / REVERSE / STOP buttons, every command over RS-485 Modbus. The PLC reads the output frequency back into D20.',
    build() {
      const b = builder();
      base(b);
      adModule(b);
      drive(b, { ...VFD_MODBUS.params });
      button(b, 'fwd', 'FORWARD', 'green', 'X0');
      button(b, 'rev', 'REVERSE', 'yellow', 'X1');
      button(b, 'stop', 'STOP', 'red', 'X2', 'NC');
      b.dev('pot', 'pot', { label: 'SPEED' }, { pos: 0.6 });
      b.w('vfd', '+10V', 'pot', '1'); b.w('pot', '3', 'vfd', 'ACM'); b.w('pot', '2', 'ad', 'V1+'); b.w('ad', 'VI1-', 'vfd', 'ACM');
      b.w('plc', 'COM2', 'vfd', 'RS485');
      const prog = program([
        comRung(),
        rung('Forward M0 (interlocked with M1)', ['X0| X2 /M1 => OUT M0', 'M0']),
        rung('Reverse M1 (interlocked with M0)', ['X1| X2 /M0 => OUT M1', 'M1']),
        rung('Command: H12 forward', ['M0 => MOV H12 D10']),
        rung('Command: H22 reverse', ['M1 => MOV H22 D10']),
        rung('Command: H1 stop', ['/M0 /M1 => MOV H1 D10']),
        rung('Pot (CH1) → D0 = 0 … 32000', ['M1000 => FROM K0 K12 D0 K1']),
        rung('D0 ÷ 32 → D12 = 0 … 1000 (0.0 … 100.0 %)', ['M1000 => DIV D0 K32 D12']),
        rung('% × 5 → D14 = 0 … 5000 = 0.00 … 50.00 Hz (32-bit result in D14, D15)', ['M1000 => MUL D12 K5 D14']),
        rung('2000H ← command', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('2001H ← speed D14', ['M1000 => MODRW K1 K6 H2001 D14 K1']),
        rung('2103H output frequency → D20', ['M1000 => MODRW K1 K3 H2103 D20 K1']),
      ], { X0: 'FORWARD', X1: 'REVERSE', X2: 'STOP (NC)', M0: 'Forward', M1: 'Reverse', D0: 'Pot raw value', D10: 'Command', D12: 'Pot %', D14: 'Set speed (0.01 Hz)', D20: 'Output Hz (0.01)' });
      return finish(this, b, prog);
    },
  },
];
