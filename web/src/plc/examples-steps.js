// "Step by step" — small PLC labs that build on each other, one new idea per step (the projects of
// the Bangla book in the manual). Each is fully wired and downloaded like the other examples.
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
    id: 'step-01-button-lamp', step: 1, name: STEP(1, 'একটি বোতাম → একটি বাতি'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'Ladder'],
    description: 'সবচেয়ে ছোট প্রোগ্রাম: বোতাম (X0) চাপলে বাতি (Y0) জ্বলে, ছাড়লে নিভে যায়। One button, one lamp: X0 → OUT Y0.',
    build() {
      const b = builder();
      base(b);
      button(b, 'pb1', 'PUSH', 'green', 'X0');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'l1', 'LAMP', 'green', 'Y0');
      const prog = program([
        rung('X0 চাপা থাকলে Y0 অন (বোতাম ছাড়লে বাতি নিভে যায়)', ['X0 => OUT Y0']),
      ], { X0: 'PUSH বোতাম', Y0: 'বাতি' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-02-no-nc', step: 2, name: STEP(2, 'NO আর NC কন্টাক্ট'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'Ladder'],
    description: 'একই বোতাম দিয়ে দুটি বাতি: NO কন্টাক্ট (X0) সবুজ বাতি জ্বালায়, NC কন্টাক্ট (/X0) লাল বাতি — বোতাম চাপলে উল্টে যায়।',
    build() {
      const b = builder();
      base(b);
      button(b, 'pb1', 'PUSH', 'green', 'X0');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lg', 'NO', 'green', 'Y0');
      lamp(b, 'lr', 'NC', 'red', 'Y1');
      const prog = program([
        rung('NO কন্টাক্ট: X0 অন হলে পাওয়ার যায় → Y0 (সবুজ)', ['X0 => OUT Y0']),
        rung('NC কন্টাক্ট: X0 অফ থাকলে পাওয়ার যায় → Y1 (লাল)', ['/X0 => OUT Y1']),
      ], { X0: 'PUSH বোতাম', Y0: 'সবুজ বাতি (NO)', Y1: 'লাল বাতি (NC)' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-03-latch', step: 3, name: STEP(3, 'Start / Stop ল্যাচ (self-holding)'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'Ladder'],
    description: 'START একবার চাপলেই মোটর (Y0) চালু থাকে — Y0 নিজের কন্টাক্ট দিয়ে নিজেকে ধরে রাখে। STOP (NC বোতাম, X1) চাপলে বন্ধ।',
    build() {
      const b = builder();
      base(b);
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lrun', 'RUN', 'green', 'Y0');
      const prog = program([
        rung('START (X0) অথবা Y0 নিজেই → Y0 চালু থাকে; STOP বোতাম NC, তাই X1 সাধারণত অন — চাপলে অফ হয়ে ল্যাচ ভাঙে', ['X0| X1 => OUT Y0', 'Y0']),
      ], { X0: 'START', X1: 'STOP (NC)', Y0: 'RUN বাতি / মোটর' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-04-set-rst', step: 4, name: STEP(4, 'SET আর RST'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'Ladder'],
    description: 'ল্যাচের আরেকটি উপায়: X0 চাপলে SET Y0 (অন থেকে যায়), X1 চাপলে RST Y0 (অফ)। দুটি বোতামই NO।',
    build() {
      const b = builder();
      base(b);
      button(b, 'on', 'ON', 'green', 'X0');
      button(b, 'off', 'OFF', 'red', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'l1', 'LAMP', 'yellow', 'Y0');
      const prog = program([
        rung('ON বোতাম → SET Y0 (বোতাম ছেড়ে দিলেও Y0 অন থাকে)', ['X0 => SET Y0']),
        rung('OFF বোতাম → RST Y0 (Y0 অফ)', ['X1 => RST Y0']),
      ], { X0: 'ON বোতাম', X1: 'OFF বোতাম', Y0: 'বাতি' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-05-timer', step: 5, name: STEP(5, 'টাইমার: ৫ সেকেন্ড পরে বাতি'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'TMR'],
    description: 'START চাপলে M0 ল্যাচ হয়, টাইমার T0 গোনা শুরু করে (K50 × 100 ms = 5 s)। ৫ সেকেন্ড পরে বাতি Y1 জ্বলে। STOP চাপলে সব রিসেট।',
    build() {
      const b = builder();
      base(b);
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lwait', 'WAIT', 'yellow', 'Y0');
      lamp(b, 'ldone', 'DONE', 'green', 'Y1');
      const prog = program([
        rung('START → M0 ল্যাচ, STOP (NC) ভাঙে', ['X0| X1 => OUT M0', 'M0']),
        rung('M0 অন থাকলে T0 গোনে: K50 = 50 × 0.1 s = 5 s', ['M0 => TMR T0 K50']),
        rung('অপেক্ষার সময় হলুদ বাতি', ['M0 /T0 => OUT Y0']),
        rung('৫ সেকেন্ড শেষ → T0 কন্টাক্ট অন → সবুজ বাতি', ['T0 => OUT Y1']),
      ], { X0: 'START', X1: 'STOP (NC)', M0: 'চালু আছে', T0: '৫ সেকেন্ড টাইমার', Y0: 'WAIT বাতি', Y1: 'DONE বাতি' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-06-blink', step: 6, name: STEP(6, 'জ্বলা-নেভা (M1013 ঘড়ি)'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'Special M'],
    description: 'সিলেক্টর অন করলে বাতি প্রতি সেকেন্ডে জ্বলে-নেভে। M1013 হলো PLC-র ভেতরের ১ সেকেন্ডের ঘড়ি (0.5 s অন, 0.5 s অফ)।',
    build() {
      const b = builder();
      base(b);
      b.dev('sel', 'selector', { label: 'BLINK', pos0: 'OFF', pos1: 'ON' });
      b.w('psu', '+V1', 'sel', '13'); b.w('sel', '14', 'plc', 'X0');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'l1', 'ALARM', 'red', 'Y0');
      const prog = program([
        rung('সিলেক্টর (X0) অন আর M1013 ঘড়ি অন → Y0 অন: বাতি জ্বলে-নেভে', ['X0 M1013 => OUT Y0']),
      ], { X0: 'BLINK সিলেক্টর', Y0: 'ALARM বাতি' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-07-counter', step: 7, name: STEP(7, 'কাউন্টার: ৫ বার গোনো'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'CNT'],
    description: 'সেন্সর বোতাম (X0) প্রতিবার চাপলে C0 এক বাড়ে। ৫ হলে বাতি জ্বলে। RESET (X1) চাপলে গোনা শূন্য।',
    build() {
      const b = builder();
      base(b);
      button(b, 'cnt', 'COUNT', 'blue', 'X0');
      button(b, 'rst', 'RESET', 'black', 'X1');
      b.w('plc', 'C0', 'psu', '+V2');
      lamp(b, 'lfull', 'FULL', 'green', 'Y0');
      const prog = program([
        rung('X0 যতবার অফ → অন হয়, C0 তত গোনে (K5 পর্যন্ত)', ['X0 => CNT C0 K5']),
        rung('৫ বার হলে C0 কন্টাক্ট অন → FULL বাতি', ['C0 => OUT Y0']),
        rung('RESET বোতাম → C0 শূন্য', ['X1 => RST C0']),
      ], { X0: 'COUNT বোতাম', X1: 'RESET বোতাম', C0: 'কাউন্টার (৫)', Y0: 'FULL বাতি' });
      return finish(this, b, prog);
    },
  },

  // ------------------------------------------------------------------ part 2: the drive on its terminals
  {
    id: 'step-08-vfd-run', step: 8, name: STEP(8, 'VFD চালাও: PLC → MI1'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'VFD'],
    description: 'PLC-র রিলে Y4 বন্ধ হলে VFD-র MI1 আর DCM জুড়ে যায় → ড্রাইভ FWD চলে। স্পিড কিপ্যাড থেকে (Pr.00-20 = 0), কমান্ড টার্মিনাল থেকে (Pr.00-21 = 1)।',
    build() {
      const b = builder();
      base(b);
      drive(b, { ...VFD_TERMINALS });
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'C1', 'vfd', 'DCM'); b.w('plc', 'Y4', 'vfd', 'MI1');
      const prog = program([
        rung('START → M0 ল্যাচ, STOP (NC) ভাঙে', ['X0| X1 => OUT M0', 'M0']),
        rung('M0 → Y4: রিলে MI1-কে DCM-এর সাথে জোড়ে → VFD সামনের দিকে চলে', ['M0 => OUT Y4']),
      ], { X0: 'START', X1: 'STOP (NC)', M0: 'চালু', Y4: 'VFD MI1 (FWD)' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-09-vfd-fwd-rev', step: 9, name: STEP(9, 'FWD / REV টার্মিনাল দিয়ে (ইন্টারলক)'), level: 'beginner', tags: ['Step by step', 'বাংলা', 'VFD', 'Interlock'],
    description: 'FWD (X0) আর REV (X1) দুটো আলাদা ল্যাচ, একটি অন থাকলে অন্যটি অন হতে পারে না (ইন্টারলক)। Y4 → MI1 (FWD), Y5 → MI2 (REV)।',
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
        rung('সামনে M0: FWD ল্যাচ; STOP (NC) আর M1 (পেছনে চলছে) থাকলে হবে না — ইন্টারলক', ['X0| X2 /M1 => OUT M0', 'M0']),
        rung('পেছনে M1: REV ল্যাচ; M0 চললে হবে না', ['X1| X2 /M0 => OUT M1', 'M1']),
        rung('সামনে → MI1 (Y4) + FWD বাতি', ['M0 =>| OUT Y4', '=> OUT Y0']),
        rung('পেছনে → MI2 (Y5) + REV বাতি', ['M1 =>| OUT Y5', '=> OUT Y1']),
      ], { X0: 'FWD', X1: 'REV', X2: 'STOP (NC)', M0: 'সামনে চলছে', M1: 'পেছনে চলছে', Y4: 'VFD MI1 (FWD)', Y5: 'VFD MI2 (REV)' });
      return finish(this, b, prog);
    },
  },

  // ------------------------------------------------------------------ part 3: Modbus RTU (RS-485)
  {
    id: 'step-10-modbus-run', step: 10, name: STEP(10, 'Modbus: এক বোতামে VFD চালু / বন্ধ'), level: 'intermediate', tags: ['Step by step', 'বাংলা', 'Modbus', 'MODRW'],
    description: 'কোনো MI তার নেই — শুধু RS-485 কেবল (PLC COM2 → VFD RJ45)। PLC 2000H রেজিস্টারে H12 (RUN FWD) বা H1 (STOP) লেখে, 2001H-এ স্পিড (K3000 = 30.00 Hz)।',
    build() {
      const b = builder();
      base(b);
      drive(b, { ...VFD_MODBUS.params });
      button(b, 'start', 'START', 'green', 'X0');
      button(b, 'stop', 'STOP', 'red', 'X1', 'NC');
      b.w('plc', 'COM2', 'vfd', 'RS485');
      const prog = program([
        comRung(['MOV K3000 D11']),
        rung('START → M0 ল্যাচ, STOP (NC) ভাঙে', ['X0| X1 => OUT M0', 'M0']),
        rung('কমান্ড ওয়ার্ড D10: চালু থাকলে H12 = RUN + FWD', ['M0 => MOV H12 D10']),
        rung('বন্ধ থাকলে H1 = STOP', ['/M0 => MOV H1 D10']),
        rung('স্টেশন 1-এর 2000H-এ D10 লেখো (ফাংশন 06)', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('স্টেশন 1-এর 2001H-এ স্পিড D11 লেখো (0.01 Hz একক)', ['M1000 => MODRW K1 K6 H2001 D11 K1']),
      ], { X0: 'START', X1: 'STOP (NC)', M0: 'চালু', D10: 'কমান্ড ওয়ার্ড (2000H)', D11: 'স্পিড, 0.01 Hz (2001H)' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-11-modbus-fwd-rev', step: 11, name: STEP(11, 'Modbus: FWD / REV / STOP'), level: 'intermediate', tags: ['Step by step', 'বাংলা', 'Modbus', 'MODRW', 'Interlock'],
    description: 'তিনটি বোতাম, একটি RS-485 কেবল। FWD → H12, REV → H22, STOP → H1 — কমান্ড ওয়ার্ড 2000H-এ। দুই দিকের ল্যাচে ইন্টারলক।',
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
        rung('সামনে M0: FORWARD ল্যাচ, STOP (NC) আর M1 থাকলে না', ['X0| X2 /M1 => OUT M0', 'M0']),
        rung('পেছনে M1: REVERSE ল্যাচ, STOP (NC) আর M0 থাকলে না', ['X1| X2 /M0 => OUT M1', 'M1']),
        rung('সামনে: কমান্ড H12 (RUN + FWD), FWD বাতি', ['M0 =>| MOV H12 D10', '=> OUT Y0']),
        rung('পেছনে: কমান্ড H22 (RUN + REV), REV বাতি', ['M1 =>| MOV H22 D10', '=> OUT Y1']),
        rung('কোনোটাই না: কমান্ড H1 (STOP)', ['/M0 /M1 => MOV H1 D10']),
        rung('2000H ← D10 (কমান্ড)', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('2001H ← D11 (স্পিড 30.00 Hz)', ['M1000 => MODRW K1 K6 H2001 D11 K1']),
      ], { X0: 'FORWARD', X1: 'REVERSE', X2: 'STOP (NC)', M0: 'সামনে', M1: 'পেছনে', D10: 'কমান্ড ওয়ার্ড (2000H)', D11: 'স্পিড (2001H)', Y0: 'FWD বাতি', Y1: 'REV বাতি' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-12-modbus-speed', step: 12, name: STEP(12, 'Modbus: স্পিড বাড়াও / কমাও, ফ্রিকোয়েন্সি পড়ো'), level: 'intermediate', tags: ['Step by step', 'বাংলা', 'Modbus', 'MODRW', 'FC03'],
    description: '+5 Hz / −5 Hz বোতাম D11 বদলায় (ADDP / SUBP, 0–50 Hz সীমা)। PLC ফাংশন 03 দিয়ে 2103H (আউটপুট Hz) আর 2104H (কারেন্ট) পড়ে D20, D21-এ রাখে।',
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
        rung('START / STOP ল্যাচ', ['X0| X1 => OUT M0', 'M0']),
        rung('কমান্ড: H12 চালু, H1 বন্ধ', ['M0 => MOV H12 D10']),
        rung('', ['/M0 => MOV H1 D10']),
        rung('+5 Hz: প্রতি চাপে একবার (P = পালস) D11 + 500', ['X2 => ADDP D11 K500 D11']),
        rung('−5 Hz: D11 − 500', ['X3 => SUBP D11 K500 D11']),
        rung('উপরের সীমা 50.00 Hz', ['D11>K5000 => MOV K5000 D11']),
        rung('নিচের সীমা 0', ['D11<K0 => MOV K0 D11']),
        rung('লেখো: 2000H কমান্ড', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('লেখো: 2001H স্পিড', ['M1000 => MODRW K1 K6 H2001 D11 K1']),
        rung('পড়ো (ফাংশন 03): 2103H আউটপুট Hz আর 2104H কারেন্ট → D20, D21', ['M1000 => MODRW K1 K3 H2103 D20 K2']),
      ], { X0: 'START', X1: 'STOP (NC)', X2: '+5 Hz', X3: '−5 Hz', D10: 'কমান্ড ওয়ার্ড', D11: 'সেট স্পিড (0.01 Hz)', D20: 'আউটপুট Hz (0.01)', D21: 'কারেন্ট (0.01 A)' });
      return finish(this, b, prog);
    },
  },

  // ------------------------------------------------------------------ part 4: analog input (DVP04AD-E2)
  {
    id: 'step-13-analog-read', step: 13, name: STEP(13, 'অ্যানালগ ইনপুট: 0–10 V পড়ো'), level: 'intermediate', tags: ['Step by step', 'বাংলা', 'Analog', 'FROM', '04AD'],
    description: 'DVP04AD-E2 মডিউল PLC-র ডান পাশে লাগানো। টেম্পারেচার ট্রান্সমিটার (0–100 °C → 0–10 V) CH1-এ। FROM K0 K12 D0 K1 → D0 = 0…32000। DIV D0 K32 → D10 = 0…1000 = 0.0…100.0 °C। 60 °C-এর বেশি হলে বাতি।',
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
        rung('মডিউল K0-এর CR#12 (CH1-এর এখনকার মান) → D0; 0–10 V = 0–32000', ['M1000 => FROM K0 K12 D0 K1']),
        rung('D0 ÷ 32 → D10 = 0…1000, মানে 0.0…100.0 °C (ভাগশেষ যায় D11-এ)', ['M1000 => DIV D0 K32 D10']),
        rung('60.0 °C-এর বেশি (D10 > K600) → HOT বাতি', ['D10>K600 => OUT Y0']),
      ], { D0: 'CH1 কাঁচা মান (0–32000)', D10: 'তাপমাত্রা, 0.1 °C', Y0: 'HOT বাতি' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-14-analog-4-20ma', step: 14, name: STEP(14, 'অ্যানালগ ইনপুট: 4–20 mA আর TO'), level: 'intermediate', tags: ['Step by step', 'বাংলা', 'Analog', 'TO', '4-20mA', '04AD'],
    description: 'প্রেশার ট্রান্সমিটার 4–20 mA (0–10 bar) CH2-তে: I2+ আর V2+ জোড়া (কারেন্ট ইনপুট)। প্রথম স্ক্যানে TO K0 K1 H40 K1 → CH2 মোড 4 (4–20 mA)। D11 = 0.0…10.0 bar। চাপ 3 bar-এর নিচে পাম্প চালু, 6 bar-এর উপরে বন্ধ।',
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
        rung('প্রথম স্ক্যান: CR#1 = H0040 → CH1 মোড 0 (±10 V), CH2 মোড 4 (4–20 mA)', ['M1002 => TO K0 K1 H40 K1']),
        rung('CR#13 (CH2 এখনকার মান) → D1; 4 mA = 0, 20 mA = 32000', ['M1000 => FROM K0 K13 D1 K1']),
        rung('D1 ÷ 320 → D11 = 0…100 = 0.0…10.0 bar', ['M1000 => DIV D1 K320 D11']),
        rung('3.0 bar-এর নিচে → পাম্প চালু (SET)', ['D11<K30 => SET Y0']),
        rung('6.0 bar-এর উপরে → পাম্প বন্ধ (RST) — মাঝখানে যা ছিল তাই থাকে (হিস্টেরিসিস)', ['D11>K60 => RST Y0']),
      ], { D1: 'CH2 কাঁচা মান', D11: 'চাপ, 0.1 bar', Y0: 'পাম্প' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-15-analog-average', step: 15, name: STEP(15, 'অ্যানালগ: চার চ্যানেল একসাথে, গড় মান'), level: 'intermediate', tags: ['Step by step', 'বাংলা', 'Analog', 'FROM', '04AD'],
    description: 'একটি FROM-এ চারটি চ্যানেল: FROM K0 K6 D0 K4 → CR#6–9 (গড় মান) → D0–D3। CR#2 = K20 → CH1 শেষ ২০টি রিডিংয়ের গড় নেয়, তাই মান কম কাঁপে। তাপমাত্রা CH1-এ, চাপ (0–10 V) CH2-তে।',
    build() {
      const b = builder();
      base(b);
      adModule(b);
      b.dev('tt', 'temp-tx', { label: 'TEMP', min: 0, max: 100 }, { pos: 0.25 });
      b.dev('pt', 'press-tx', { label: 'PRESSURE', min: 0, max: 10 }, { pos: 0.4 });
      b.w('psu', '+V1', 'tt', 'BN'); b.w('tt', 'BU', 'psu', '-V1'); b.w('tt', 'BK', 'ad', 'V1+'); b.w('ad', 'VI1-', 'psu', '-V1');
      b.w('psu', '+V1', 'pt', 'BN'); b.w('pt', 'BU', 'psu', '-V1'); b.w('pt', 'BK', 'ad', 'V2+'); b.w('ad', 'VI2-', 'psu', '-V1');
      const prog = program([
        rung('প্রথম স্ক্যান: CH1 শেষ 20টি রিডিংয়ের গড় নেবে (CR#2 = K20)', ['M1002 => TO K0 K2 K20 K1']),
        rung('CR#6…9 = চার চ্যানেলের গড় মান → D0…D3', ['M1000 => FROM K0 K6 D0 K4']),
        rung('CR#12, 13 = CH1, CH2-এর এখনকার (গড় ছাড়া) মান → D4, D5 — Monitor-এ তুলনা করো', ['M1000 => FROM K0 K12 D4 K2']),
        rung('তাপমাত্রা: D0 ÷ 32 → D10 = 0.0…100.0 °C', ['M1000 => DIV D0 K32 D10']),
        rung('চাপ: D1 ÷ 320 → D12 = 0.0…10.0 bar', ['M1000 => DIV D1 K320 D12']),
      ], { D0: 'CH1 গড়', D1: 'CH2 গড়', D4: 'CH1 এখন', D5: 'CH2 এখন', D10: 'তাপমাত্রা 0.1 °C', D12: 'চাপ 0.1 bar' });
      return finish(this, b, prog);
    },
  },
  {
    id: 'step-16-analog-modbus-speed', step: 16, name: STEP(16, 'ফাইনাল প্রজেক্ট: পট → 04AD → PLC → Modbus → VFD'), level: 'advanced', tags: ['Step by step', 'বাংলা', 'Analog', 'Modbus', 'MODRW', 'FROM', '04AD'],
    description: 'সব একসাথে: পট ঘুরিয়ে স্পিড (CH1, 0–10 V → 0–50.00 Hz), FORWARD / REVERSE / STOP বোতাম, সব কমান্ড RS-485 Modbus দিয়ে। PLC আউটপুট ফ্রিকোয়েন্সি পড়ে D20-তে রাখে।',
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
        rung('সামনে M0 (ইন্টারলক M1)', ['X0| X2 /M1 => OUT M0', 'M0']),
        rung('পেছনে M1 (ইন্টারলক M0)', ['X1| X2 /M0 => OUT M1', 'M1']),
        rung('কমান্ড: H12 সামনে', ['M0 => MOV H12 D10']),
        rung('কমান্ড: H22 পেছনে', ['M1 => MOV H22 D10']),
        rung('কমান্ড: H1 বন্ধ', ['/M0 /M1 => MOV H1 D10']),
        rung('পট (CH1) → D0 = 0…32000', ['M1000 => FROM K0 K12 D0 K1']),
        rung('D0 ÷ 32 → D12 = 0…1000 (0.0…100.0 %)', ['M1000 => DIV D0 K32 D12']),
        rung('% × 5 → D14 = 0…5000 = 0.00…50.00 Hz (32-বিট ফল D14, D15)', ['M1000 => MUL D12 K5 D14']),
        rung('2000H ← কমান্ড', ['M1000 => MODRW K1 K6 H2000 D10 K1']),
        rung('2001H ← স্পিড D14', ['M1000 => MODRW K1 K6 H2001 D14 K1']),
        rung('2103H আউটপুট ফ্রিকোয়েন্সি → D20', ['M1000 => MODRW K1 K3 H2103 D20 K1']),
      ], { X0: 'FORWARD', X1: 'REVERSE', X2: 'STOP (NC)', M0: 'সামনে', M1: 'পেছনে', D0: 'পট কাঁচা মান', D10: 'কমান্ড', D12: 'পট %', D14: 'সেট স্পিড (0.01 Hz)', D20: 'আউটপুট Hz (0.01)' });
      return finish(this, b, prog);
    },
  },
];
