// Delta MS300 (VFD7A5MS21ANSAA) variable frequency drive, modelled on the MS300 user manual:
// parameter groups 00–09 with the manual's numbers, settings and defaults (50 Hz base), the
// KPMS-LE01 style keypad (RUN, STOP/RESET, ▲, ◀/▼, MODE, ENTER and the speed knob), F / H / U pages,
// frequency sources (keypad, RS-485, AVI, UP/DOWN terminals, keypad knob), operation sources
// (keypad, terminals, RS-485), 2- / 3-wire control, multi-function inputs, multi-step speeds,
// JOG, four accel / decel sets with S-curves, skip frequencies, the V/F curve, stall prevention, DC
// braking (start and stop), PID control (group 08) with sleep / wake-up, the terminal counter,
// over-torque detection, auto-restart after a fault, protections with the manual's fault codes and
// fault record, MI1–MI7, AVI and ACI (0/4–20 mA), the RA/RB/RC relay, MO1 / MO2, AFM and the Modbus
// registers. Control terminals as in chapter 6 of the manual: MI1–MI7, DCM, +24V, +10V, AVI, ACI,
// ACM, AFM, MO1, MO2, MCM, RA, RB, RC (DFM, S1/S2 STO and SG± are not simulated).

const opts = (o) => o;
const hz = (id, name, def, o = {}) => ({ id, name, def, dec: 2, unit: 'Hz', min: 0, max: 599, ...o });
const sec = (id, name, def, o = {}) => ({ id, name, def, dec: 2, unit: 's', min: 0, max: 600, ...o });

/** Multi-function input settings (Pr.02-01 ~ 02-07) that the simulator acts on. */
function MI_OPTS() {
  return {
    0: 'No function', 1: 'Multi-step speed command 1', 2: 'Multi-step speed command 2', 3: 'Multi-step speed command 3', 4: 'Multi-step speed command 4',
    5: 'Reset', 6: 'JOG operation', 7: 'Acceleration / deceleration speed inhibit', 8: 'The 1st, 2nd acceleration / deceleration time selection',
    9: 'The 3rd, 4th acceleration / deceleration time selection',
    10: 'External fault input (EF, Pr.07-20)', 11: 'Base block input (B.B)', 12: 'Output stop', 15: 'Operation speed command from AVI', 16: 'Operation speed command from ACI',
    18: 'Force to stop (Pr.07-20)', 19: 'Frequency UP command', 20: 'Frequency DOWN command', 21: 'PID function disabled',
    22: 'Clear the counter', 23: 'Input the counter value (MI6)', 24: 'FWD JOG command', 25: 'REV JOG command',
    28: 'Emergency stop (EF1)', 40: 'Force coasting to stop', 49: 'Drive enable',
  };
}
/** Multi-function output settings (Pr.02-13 relay, 02-16 MO1, 02-17 MO2). */
function MO_OPTS() {
  return {
    0: 'No function', 1: 'Indication during RUN', 2: 'Operation speed reached', 3: 'Desired frequency reached 1 (Pr.02-22)', 4: 'Desired frequency reached 2 (Pr.02-24)',
    5: 'Zero speed (frequency command)', 6: 'Zero speed, including STOP', 7: 'Over-torque 1 (Pr.06-06 ~ 06-08)', 9: 'Drive is ready', 11: 'Malfunction indication',
    13: 'Over-heat warning (Pr.06-15)', 15: 'PID feedback error (Pr.08-08)', 17: 'Terminal count value reached (Pr.02-19, returns to 0)', 18: 'Preliminary count value reached (Pr.02-20)',
    19: 'External base block', 20: 'Warning output', 22: 'Over-current stall prevention warning', 23: 'Over-voltage stall prevention warning',
    24: 'Operation source is not the keypad (Pr.00-21 ≠ 0)', 25: 'Forward command', 26: 'Reverse command',
    27: 'Output when the current ≥ Pr.02-33', 28: 'Output when the current ≤ Pr.02-33', 29: 'Output when the frequency ≥ Pr.02-34', 30: 'Output when the frequency ≤ Pr.02-34',
  };
}
/** Analog input functions (Pr.03-00 AVI, 03-01 ACI). */
const AI_OPTS = () => ({ 0: 'No function', 1: 'Frequency command', 5: 'PID feedback signal' });
function PROTO_OPTS() {
  const o = {};
  const list = ['7,N,2 ASCII', '7,E,1 ASCII', '7,O,1 ASCII', '7,E,2 ASCII', '7,O,2 ASCII', '8,N,1 ASCII', '8,N,2 ASCII', '8,E,1 ASCII', '8,O,1 ASCII', '8,E,2 ASCII', '8,O,2 ASCII', '8,N,1 RTU', '8,N,2 RTU', '8,E,1 RTU', '8,O,1 RTU', '8,E,2 RTU', '8,O,2 RTU'];
  list.forEach((t, i) => { o[i + 1] = t; });
  return o;
}

/** Fault codes as the MS300 shows them and stores them in Pr.06-17 ~ 06-22 (sim = simulated here). */
export const FAULTS = {
  ocA: { n: 1, sim: true, text: 'Over-current during acceleration: the acceleration time (Pr.01-12) is too short and stall prevention (Pr.06-03) is off, or the load is too heavy' },
  ocd: { n: 2, sim: true, text: 'Over-current during deceleration' },
  ocn: { n: 3, sim: true, text: 'Over-current at constant speed' },
  GFF: { n: 4, text: 'Ground fault on the output (U/T1, V/T2, W/T3)' },
  occ: { n: 5, text: 'Short circuit in the IGBT module' },
  ocS: { n: 6, text: 'Over-current at stop (hardware failure in current detection)' },
  ovA: { n: 7, text: 'Over-voltage during acceleration' },
  ovd: { n: 8, sim: true, text: 'Over-voltage during deceleration: the deceleration time (Pr.01-13) is too short and over-voltage stall prevention (Pr.06-01) is off' },
  ovn: { n: 9, text: 'Over-voltage at constant speed' },
  ovS: { n: 10, text: 'Over-voltage at stop' },
  LvA: { n: 11, text: 'Low voltage during acceleration' },
  Lvd: { n: 12, text: 'Low voltage during deceleration' },
  Lvn: { n: 13, text: 'Low voltage at constant speed' },
  LvS: { n: 14, text: 'Low voltage at stop' },
  OrP: { n: 15, text: 'Phase loss protection of the input power' },
  oH1: { n: 16, text: 'IGBT over-heat' },
  tH1o: { n: 18, text: 'IGBT temperature detection failure' },
  oL: { n: 21, sim: true, text: 'Drive over-load: output current above 150 % of the drive rated current (Pr.00-01) for 60 s' },
  EoL1: { n: 22, sim: true, text: 'Electronic thermal relay 1 (motor over-load): reduce the load or check Pr.05-01 / 06-13 / 06-14' },
  EoL2: { n: 23, text: 'Electronic thermal relay 2' },
  oH3: { n: 24, text: 'Motor over-heat (PTC)' },
  ot1: { n: 26, sim: true, text: 'Over-torque 1: the output current stayed above Pr.06-07 for Pr.06-08 seconds (Pr.06-06 = 2 or 4)' },
  ot2: { n: 27, text: 'Over-torque 2' },
  uC: { n: 28, text: 'Under current' },
  cF1: { n: 30, text: 'EEPROM write error' },
  cF2: { n: 31, text: 'EEPROM read error' },
  cd1: { n: 33, text: 'U-phase current detection error' },
  Hd0: { n: 36, text: 'cc (current clamp) hardware error' },
  AUE: { n: 40, text: 'Auto-tuning error' },
  AFE: { n: 41, sim: true, text: 'PID feedback loss: no feedback signal for Pr.08-08 seconds (Pr.08-09 decides what the drive does)' },
  ACE: { n: 48, sim: true, text: 'ACI signal loss: below 2 mA in 4–20 mA mode with Pr.03-19 = 3' },
  EF: { n: 49, sim: true, text: 'External fault: a multi-function input set to 10 (EF) is ON (Pr.07-20 decides how the drive stops)' },
  EF1: { n: 50, sim: true, text: 'Emergency stop: a multi-function input set to 28 (EF1) is ON' },
  bb: { n: 51, text: 'External base block' },
  Pcod: { n: 52, text: 'Password locked (three wrong passwords)' },
  CE1: { n: 54, text: 'Illegal Modbus function code' },
  CE2: { n: 55, text: 'Illegal Modbus data address' },
  CE3: { n: 56, text: 'Illegal Modbus data value' },
  CE4: { n: 57, text: 'Modbus data written to a read-only address' },
  CE10: { n: 58, sim: true, text: 'Modbus communication time-out (Pr.09-03)' },
  CP10: { n: 59, text: 'Keypad communication time-out' },
  STo: { n: 76, text: 'Safe torque off' },
};
const FAULT_BY_N = Object.fromEntries(Object.entries(FAULTS).map(([k, f]) => [f.n, k]));
export const faultName = (n) => (n ? FAULT_BY_N[n] || String(n) : 'none');
function FAULT_OPTS() { const o = { 0: 'No fault record' }; for (const [k, f] of Object.entries(FAULTS)) o[f.n] = k; return o; }

export const VFD_PARAMS = [
  // ---- 00 drive parameters
  { id: '00-00', name: 'Identity code of the AC motor drive', def: 6, dec: 0, ro: true },
  { id: '00-01', name: 'Display AC motor drive rated current', def: 7.5, dec: 1, unit: 'A', ro: true },
  { id: '00-02', name: 'Parameter reset', def: 0, dec: 0, opts: opts({ 0: 'No function', 1: 'Parameter write protect', 9: 'Reset all parameters to factory defaults (base frequency 50 Hz)', 10: 'Reset all parameters to factory defaults (base frequency 60 Hz)' }) },
  { id: '00-03', name: 'Start-up display selection', def: 0, dec: 0, opts: opts({ 0: 'Frequency command (F)', 1: 'Output frequency (H)', 2: 'Multi-function display, see Pr.00-04 (U)', 3: 'Output current (A)' }) },
  { id: '00-04', name: 'Content of multi-function display (U page)', def: 3, dec: 0, opts: opts({ 0: 'Output current (A)', 1: 'Counter value (c)', 2: 'Actual output frequency (H)', 3: 'DC bus voltage (u)', 4: 'Output voltage (E)', 6: 'Output power in kW (P)', 7: 'Actual motor speed in rpm (r)', 8: 'Estimated output torque in % (t)', 10: 'PID feedback in % (b)', 11: 'AVI analog input in % (1.)', 12: 'ACI analog input in % (2.)', 14: 'IGBT temperature in °C (i.)', 16: 'Digital input status, hex (i)', 17: 'Digital output status, hex (o)', 18: 'Multi-step speed status (S)' }) },
  { id: '00-10', name: 'Control mode', def: 0, dec: 0, ro: true, opts: opts({ 0: 'Speed mode' }) },
  { id: '00-11', name: 'Speed control mode', def: 0, dec: 0, ro: true, opts: opts({ 0: 'IM V/F control' }) },
  { id: '00-17', name: 'Carrier frequency', def: 4, dec: 0, unit: 'kHz', min: 2, max: 15 },
  { id: '00-20', name: 'Source of master frequency command (AUTO)', def: 0, dec: 0, opts: opts({ 0: 'Digital keypad (▲ ▼)', 1: 'RS-485 serial communication', 2: 'External analog input (AVI / ACI, Pr.03-00 / 03-01)', 3: 'External UP / DOWN terminal (MI = 19 / 20)', 7: 'Digital keypad dial (the knob)' }) },
  { id: '00-21', name: 'Source of the operation command (AUTO)', def: 0, dec: 0, opts: opts({ 0: 'Digital keypad (RUN / STOP)', 1: 'External terminals (MI1 / MI2, Pr.02-00)', 2: 'RS-485 serial communication' }) },
  { id: '00-22', name: 'Stop method', def: 0, dec: 0, opts: opts({ 0: 'Ramp to stop', 1: 'Coast to stop' }) },
  { id: '00-23', name: 'Control of motor direction', def: 0, dec: 0, opts: opts({ 0: 'Enable forward / reverse', 1: 'Reverse disabled', 2: 'Forward disabled' }) },
  { id: '00-32', name: 'Digital keypad STOP function', def: 1, dec: 0, opts: opts({ 0: 'STOP key disabled (when the command is not from the keypad)', 1: 'STOP key enabled' }) },
  // ---- 01 basic parameters
  hz('01-00', 'Maximum operation frequency', 50, { min: 0, max: 599 }),
  hz('01-01', 'Output frequency of motor 1 (base frequency)', 50),
  { id: '01-02', name: 'Output voltage of motor 1 (base voltage)', def: 220, dec: 1, unit: 'V', min: 0, max: 255 },
  hz('01-03', 'Mid-point frequency 1 of motor 1', 3),
  { id: '01-04', name: 'Mid-point voltage 1 of motor 1', def: 11, dec: 1, unit: 'V', min: 0, max: 240 },
  hz('01-05', 'Mid-point frequency 2 of motor 1', 0.5),
  { id: '01-06', name: 'Mid-point voltage 2 of motor 1', def: 2, dec: 1, unit: 'V', min: 0, max: 240 },
  hz('01-07', 'Minimum output frequency of motor 1', 0),
  { id: '01-08', name: 'Minimum output voltage of motor 1', def: 0, dec: 1, unit: 'V', min: 0, max: 240 },
  hz('01-09', 'Start-up frequency', 0.5),
  hz('01-10', 'Output frequency upper limit', 599),
  hz('01-11', 'Output frequency lower limit', 0),
  sec('01-12', 'Acceleration time 1', 10),
  sec('01-13', 'Deceleration time 1', 10),
  sec('01-14', 'Acceleration time 2', 10),
  sec('01-15', 'Deceleration time 2', 10),
  sec('01-16', 'Acceleration time 3', 10),
  sec('01-17', 'Deceleration time 3', 10),
  sec('01-18', 'Acceleration time 4', 10),
  sec('01-19', 'Deceleration time 4', 10),
  sec('01-20', 'JOG acceleration time', 10),
  sec('01-21', 'JOG deceleration time', 10),
  hz('01-22', 'JOG frequency', 6),
  sec('01-24', 'S-curve acceleration begin time 1', 0.2, { max: 25 }),
  sec('01-25', 'S-curve acceleration arrival time 1', 0.2, { max: 25 }),
  sec('01-26', 'S-curve deceleration begin time 1', 0.2, { max: 25 }),
  sec('01-27', 'S-curve deceleration arrival time 1', 0.2, { max: 25 }),
  hz('01-28', 'Skip frequency 1 (upper limit)', 0),
  hz('01-29', 'Skip frequency 1 (lower limit)', 0),
  hz('01-30', 'Skip frequency 2 (upper limit)', 0),
  hz('01-31', 'Skip frequency 2 (lower limit)', 0),
  hz('01-32', 'Skip frequency 3 (upper limit)', 0),
  hz('01-33', 'Skip frequency 3 (lower limit)', 0),
  // ---- 02 digital input / output
  { id: '02-00', name: 'Two-wire / three-wire operation control', def: 1, dec: 0, opts: opts({ 0: 'No function (MI1 / MI2 are programmable)', 1: 'Two-wire mode 1: MI1 FWD / STOP, MI2 REV / STOP', 2: 'Two-wire mode 2: MI1 RUN / STOP, MI2 REV / FWD', 3: 'Three-wire: MI1 RUN, MI2 REV / FWD, MI3 STOP (NC)' }) },
  { id: '02-01', name: 'Multi-function input command 1 (MI1)', def: 0, dec: 0, opts: MI_OPTS() },
  { id: '02-02', name: 'Multi-function input command 2 (MI2)', def: 0, dec: 0, opts: MI_OPTS() },
  { id: '02-03', name: 'Multi-function input command 3 (MI3)', def: 1, dec: 0, opts: MI_OPTS() },
  { id: '02-04', name: 'Multi-function input command 4 (MI4)', def: 2, dec: 0, opts: MI_OPTS() },
  { id: '02-05', name: 'Multi-function input command 5 (MI5)', def: 3, dec: 0, opts: MI_OPTS() },
  { id: '02-06', name: 'Multi-function input command 6 (MI6)', def: 4, dec: 0, opts: MI_OPTS() },
  { id: '02-07', name: 'Multi-function input command 7 (MI7)', def: 0, dec: 0, opts: MI_OPTS() },
  { id: '02-12', name: 'Multi-function input mode selection (bit 0 = MI1 … bit 6 = MI7; 1 = N.C.)', def: 0, dec: 0, min: 0, max: 127 },
  { id: '02-09', name: 'UP / DOWN key mode', def: 0, dec: 0, opts: opts({ 0: 'UP / DOWN by the acceleration / deceleration time', 1: 'UP / DOWN at a constant speed (Pr.02-10)' }) },
  { id: '02-10', name: 'Constant speed of UP / DOWN key', def: 0.01, dec: 3, unit: 'Hz/ms', min: 0.001, max: 1 },
  { id: '02-13', name: 'Multi-function output 1 (relay RA / RB / RC)', def: 11, dec: 0, opts: MO_OPTS() },
  { id: '02-16', name: 'Multi-function output 2 (MO1)', def: 0, dec: 0, opts: MO_OPTS() },
  { id: '02-17', name: 'Multi-function output 3 (MO2)', def: 0, dec: 0, opts: MO_OPTS() },
  { id: '02-19', name: 'Terminal counting value reached (returns to 0)', def: 0, dec: 0, min: 0, max: 65500 },
  { id: '02-20', name: 'Preliminary counting value reached (does not return to 0)', def: 0, dec: 0, min: 0, max: 65500 },
  hz('02-22', 'Desired frequency reached 1', 50),
  hz('02-23', 'The width of the desired frequency reached 1', 2),
  hz('02-24', 'Desired frequency reached 2', 50),
  hz('02-25', 'The width of the desired frequency reached 2', 2),
  { id: '02-33', name: 'Output current level setting for multi-function output terminals', def: 0, dec: 0, unit: '%', min: 0, max: 100 },
  hz('02-34', 'Output boundary for multi-function output terminals', 0),
  // ---- 03 analog input / output
  { id: '03-00', name: 'AVI analog input selection', def: 1, dec: 0, opts: AI_OPTS() },
  { id: '03-01', name: 'ACI analog input selection', def: 0, dec: 0, opts: AI_OPTS() },
  { id: '03-03', name: 'Analog input bias 1 (AVI)', def: 0, dec: 1, unit: '%', min: -100, max: 100 },
  { id: '03-04', name: 'Analog input bias 2 (ACI)', def: 0, dec: 1, unit: '%', min: -100, max: 100 },
  { id: '03-11', name: 'Analog input gain 1 (AVI)', def: 100, dec: 1, unit: '%', min: -500, max: 500 },
  { id: '03-12', name: 'Analog input gain 2 (ACI)', def: 100, dec: 1, unit: '%', min: -500, max: 500 },
  { id: '03-19', name: 'Signal loss selection of the analog input 4–20 mA (ACI)', def: 0, dec: 0, opts: opts({ 0: 'Disabled', 1: 'Continue operation at the last frequency (warning AnL)', 2: 'Decelerate to 0 Hz (warning AnL)', 3: 'Stop immediately and display ACE' }) },
  { id: '03-20', name: 'Multi-function output 1 (AFM)', def: 0, dec: 0, opts: opts({ 0: 'Output frequency (0 – Pr.01-00)', 1: 'Frequency command', 2: 'Motor speed', 3: 'Output current (0 – 2 × rated)', 4: 'Output voltage', 5: 'DC bus voltage' }) },
  { id: '03-21', name: 'Gain of analog output 1 (AFM)', def: 100, dec: 1, unit: '%', min: 0, max: 500 },
  { id: '03-28', name: 'AVI terminal input selection', def: 0, dec: 0, ro: true, opts: opts({ 0: '0 – 10 V' }) },
  { id: '03-29', name: 'ACI terminal input selection', def: 0, dec: 0, opts: opts({ 0: '4 – 20 mA', 1: '0 – 10 V', 2: '0 – 20 mA' }) },
  // ---- 04 multi-step speed
  ...['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th'].map((n, i) => hz('04-' + String(i).padStart(2, '0'), `${n} step speed frequency`, 0)),
  // ---- 05 motor parameters
  { id: '05-01', name: 'Full-load current of induction motor 1', def: 3.2, dec: 2, unit: 'A', min: 0.75, max: 9 },
  { id: '05-02', name: 'Rated power of induction motor 1', def: 0.75, dec: 2, unit: 'kW', min: 0, max: 655.35 },
  { id: '05-03', name: 'Rated speed of induction motor 1', def: 1410, dec: 0, unit: 'rpm', min: 0, max: 65535 },
  { id: '05-04', name: 'Number of poles of induction motor 1', def: 4, dec: 0, min: 2, max: 20 },
  { id: '05-05', name: 'No-load current of induction motor 1', def: 1.3, dec: 2, unit: 'A', min: 0, max: 9 },
  // ---- 06 protection
  { id: '06-01', name: 'Over-voltage stall prevention (0 = disabled)', def: 380, dec: 1, unit: 'V', min: 0, max: 390 },
  { id: '06-03', name: 'Over-current stall prevention during acceleration (0 = disabled)', def: 150, dec: 0, unit: '%', min: 0, max: 250 },
  { id: '06-04', name: 'Over-current stall prevention during operation (0 = disabled)', def: 150, dec: 0, unit: '%', min: 0, max: 250 },
  { id: '06-06', name: 'Over-torque detection selection (motor 1)', def: 0, dec: 0, opts: opts({ 0: 'Disabled', 1: 'Detect at constant speed, continue operation (warning ot1)', 2: 'Detect at constant speed, stop (fault ot1)', 3: 'Detect during operation, continue operation (warning ot1)', 4: 'Detect during operation, stop (fault ot1)' }) },
  { id: '06-07', name: 'Over-torque detection level (% of the drive rated current)', def: 120, dec: 0, unit: '%', min: 10, max: 250 },
  { id: '06-08', name: 'Over-torque detection time', def: 0.1, dec: 1, unit: 's', min: 0, max: 60 },
  { id: '06-13', name: 'Electronic thermal relay selection 1 (motor 1)', def: 2, dec: 0, opts: opts({ 0: 'Inverter motor (with external forced cooling)', 1: 'Standard motor (motor with the fan on the shaft)', 2: 'Disable' }) },
  { id: '06-14', name: 'Electronic thermal relay action time 1 (150 % load)', def: 60, dec: 1, unit: 's', min: 30, max: 600 },
  { id: '06-15', name: 'Heat sink over-heat (oH) warning level', def: 100, dec: 1, unit: '°C', min: 0, max: 110 },
  ...['Present fault record', 'Second most recent fault record', 'Third most recent fault record', 'Fourth most recent fault record', 'Fifth most recent fault record', 'Sixth most recent fault record'].map((n, i) => ({ id: '06-' + (17 + i), name: n, def: 0, dec: 0, ro: true, opts: FAULT_OPTS() })),
  // ---- 07 special parameters
  { id: '07-01', name: 'DC brake current level', def: 0, dec: 0, unit: '%', min: 0, max: 100 },
  sec('07-02', 'DC brake time at start-up', 0, { max: 60 }),
  sec('07-03', 'DC brake time at stop', 0, { max: 60 }),
  hz('07-04', 'DC brake frequency at stop', 0),
  { id: '07-11', name: 'Number of times of auto-restart after a fault (ocA / ocd / ocn / ovA / ovd / ovn)', def: 0, dec: 0, min: 0, max: 10 },
  { id: '07-20', name: 'Emergency stop (EF) and force to stop selection', def: 0, dec: 0, opts: opts({ 0: 'Coast to stop', 1: 'Stop by the 1st deceleration time', 2: 'Stop by the 2nd deceleration time', 3: 'Stop by the 3rd deceleration time', 4: 'Stop by the 4th deceleration time' }) },
  sec('07-33', 'Auto-restart interval of fault', 60, { max: 6000 }),
  // ---- 08 PID control
  { id: '08-00', name: 'Input terminal for PID feedback', def: 0, dec: 0, opts: opts({ 0: 'No function', 1: 'Negative PID feedback: analog input set to 5 (Pr.03-00 / 03-01)', 4: 'Positive PID feedback: analog input set to 5 (Pr.03-00 / 03-01)' }) },
  { id: '08-01', name: 'Proportional gain (P)', def: 1, dec: 1, min: 0, max: 100 },
  sec('08-02', 'Integral time (I) (0 = no integral)', 1, { max: 100 }),
  sec('08-03', 'Derivative control (D)', 0, { max: 1 }),
  { id: '08-04', name: 'Upper limit of integral control', def: 100, dec: 1, unit: '%', min: 0, max: 100 },
  { id: '08-05', name: 'PID output command limit', def: 100, dec: 1, unit: '%', min: 0, max: 110 },
  { id: '08-07', name: 'PID delay time', def: 0, dec: 1, unit: 's', min: 0, max: 35 },
  { id: '08-08', name: 'Feedback signal detection time (0 = disabled)', def: 0, dec: 1, unit: 's', min: 0, max: 3600 },
  { id: '08-09', name: 'Feedback signal fault treatment', def: 0, dec: 0, opts: opts({ 0: 'Warn (AFE) and keep operating', 1: 'Fault AFE and ramp to stop', 2: 'Fault AFE and coast to stop', 3: 'Warn (AFE) and operate at the last frequency' }) },
  hz('08-10', 'Sleep frequency (0 = disabled)', 0),
  hz('08-11', 'Wake-up frequency', 0),
  sec('08-12', 'Sleep delay time', 0, { max: 6000 }),
  // ---- 09 communication
  { id: '09-00', name: 'COM1 communication address', def: 1, dec: 0, min: 1, max: 254 },
  { id: '09-01', name: 'COM1 transmission speed', def: 9.6, dec: 1, unit: 'kbps', min: 4.8, max: 115.2, opts: opts({ 4.8: '4800 bps', 9.6: '9600 bps', 19.2: '19200 bps', 38.4: '38400 bps', 57.6: '57600 bps', 115.2: '115200 bps' }) },
  { id: '09-02', name: 'COM1 transmission fault treatment', def: 3, dec: 0, opts: opts({ 0: 'Warn and continue operation', 1: 'Fault and ramp to stop', 2: 'Fault and coast to stop', 3: 'No warning, continue operation' }) },
  { id: '09-03', name: 'COM1 time-out detection (0 = disabled)', def: 0, dec: 1, unit: 's', min: 0, max: 100 },
  { id: '09-04', name: 'COM1 communication protocol', def: 1, dec: 0, opts: PROTO_OPTS() },
];

export const PARAM_BY_ID = Object.fromEntries(VFD_PARAMS.map((p) => [p.id, p]));
export const PARAM_GROUPS = [...new Set(VFD_PARAMS.map((p) => p.id.slice(0, 2)))];
export const GROUP_NAMES = { '00': 'Drive parameters', '01': 'Basic parameters', '02': 'Digital input / output', '03': 'Analog input / output', '04': 'Multi-step speed', '05': 'Motor parameters', '06': 'Protection parameters', '07': 'Special parameters', '08': 'High-function PID parameters', '09': 'Communication parameters' };

export const paramAddr = (id) => (parseInt(id.slice(0, 2), 10) << 8) | parseInt(id.slice(3), 10);
export const paramByAddr = (addr) => VFD_PARAMS.find((p) => paramAddr(p.id) === addr);

/** Version of the stored parameter layout (dev.state.params._v). */
export const PARAMS_VERSION = 2;

/**
 * Stored parameters from RaptiAuto ≤ 2.8 used a different numbering (02-00 = 0…2, MI3–MI5 on
 * 02-01…02-03, the no-load current on 05-02, other 00-04 codes); convert them to the manual's.
 */
export function migrateParams(p) {
  if (!p || typeof p !== 'object') return { _v: PARAMS_VERSION };
  if (p._v === PARAMS_VERSION) return p;
  const o = { ...p, _v: PARAMS_VERSION };
  if ('02-00' in p) o['02-00'] = { 0: 1, 1: 2, 2: 3 }[p['02-00']] ?? 1;
  delete o['02-01']; delete o['02-02']; delete o['02-03'];
  if ('02-01' in p) o['02-03'] = p['02-01'];
  if ('02-02' in p) o['02-04'] = p['02-02'];
  if ('02-03' in p) o['02-05'] = p['02-03'];
  if ('05-02' in p) { o['05-05'] = p['05-02']; delete o['05-02']; }
  if ('00-04' in p) o['00-04'] = { 0: 0, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7 }[p['00-04']] ?? 3;
  if ('03-00' in p) o['03-00'] = 1;
  return o;
}

/** Serial format from Pr.09-01 / 09-04. */
export function vfdFormat(params) {
  const code = params['09-04'] | 0;
  const t = PROTO_OPTS()[code] || '7,N,2 ASCII';
  const [bits, parity, stopMode] = t.split(',');
  const [stop, mode] = stopMode.split(' ');
  return { baud: Math.round(params['09-01'] * 1000), bits: +bits, parity, stop: +stop, mode };
}

export function defaultParams() { return { ...Object.fromEntries(VFD_PARAMS.map((p) => [p.id, p.def])), _v: PARAMS_VERSION }; }

/** Letters the 7-segment display puts in front of a U-page value (Pr.00-04). */
const U_PREFIX = { 0: 'A', 1: 'c', 2: 'H', 3: 'u', 4: 'E', 6: 'P', 7: 'r', 8: 't', 10: 'b', 11: '1.', 12: '2.', 14: 'i.', 16: 'i', 17: 'o', 18: 'S' };

/** "F" + "50.00" → a 5-digit text with the letter on the left and the number on the right. */
function pre(letter, num) {
  const cells = (s) => s.replace(/\./g, '').length;
  const room = 5 - cells(letter) - cells(num);
  return letter + ' '.repeat(Math.max(0, room)) + num;
}
const fmtHz = (v) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2));

export class VfdMS300 {
  constructor(params = {}) {
    this.params = { ...defaultParams(), ...migrateParams(params) };
    this.powered = false;
    this.fault = null;
    this.warning = null;
    this.fKey = 50; // F page, set with ▲ ▼ (Pr.00-20 = 0)
    this.knob = 0; // keypad dial 0 … 1 (Pr.00-20 = 7)
    this.fUD = 0; // UP / DOWN terminal frequency (Pr.00-20 = 3)
    this.fComm = 0;
    this.cmdWord = 0;
    this.cmd2002 = 0;
    this.commRun = false;
    this.commDir = 1;
    this.keyRun = false;
    this.keyDir = 1;
    this.keyStop = false;
    this.latch3 = false;
    this.f = 0;
    this.rate = 0; // present ramp rate, Hz/s (S-curve)
    this.dir = 1;
    this.cmdDir = 1;
    this.V = 0;
    this.I = 0;
    this.dc = 311;
    this.thermal = 0;
    this.drvLoad = 0;
    this.tempC = 30;
    this.runCmd = false;
    this.jog = false;
    this.fcmd = 0;
    this.step = 0;
    this.stall = null;
    this.dcBrakeT = 0;
    this.bb = false;
    this.standby = false;
    this.time = 0;
    this.lastComm = 0;
    this.bootT = 0;
    this.MI = [0, 0, 0, 0, 0, 0, 0]; // MI1–MI7 terminals (ON = closed to DCM)
    this.MIL = [0, 0, 0, 0, 0, 0, 0]; // after Pr.02-12 (N.O. / N.C.)
    this.prevMIL = [0, 0, 0, 0, 0, 0, 0];
    this.avi = 0; // V between AVI and ACM
    this.aci = 0; // ACI: V between ACI and ACM (a current is carried as the voltage across the 250 Ω input)
    this.counter = 0;
    this.cntPulseT = 0;
    this.pid = { i: 0, e: 0, out: 0, f: 0, fb: 0, sp: 0, sleep: false, sleepT: 0, lostT: 0, lost: false, hold: false };
    this.otT = 0;
    this.ot = false;
    this.restarts = 0;
    this.autoT = 0;
    this.dcStartT = 0;
    this.wasRun = false;
    this.lastAnalogF = 0;
    this.motor = { connected: false, sign: 1, load: 0.4 };
    this.rpm = 0;
    this.kp = { mode: 'F', group: 0, pidx: 0, edit: 0, pos: 2, flash: null, flashT: 0 };
  }

  P(id) { return this.params[id]; }

  setParam(id, v) {
    const d = PARAM_BY_ID[id];
    if (!d) return 'Unknown parameter';
    if (d.ro) return 'Read-only parameter';
    if (this.params['00-02'] === 1 && id !== '00-02') return 'Parameters are write-protected (Pr.00-02 = 1)';
    if (d.opts && d.opts[v] === undefined) return 'Value not allowed';
    if (d.min !== undefined && (v < d.min || v > d.max)) return `Range ${d.min} – ${d.max}`;
    if (id === '00-02' && (v === 9 || v === 10)) {
      const rec = VFD_PARAMS.filter((p) => /^06-(1[7-9]|2[0-2])$/.test(p.id)).map((p) => [p.id, this.params[p.id]]);
      this.params = defaultParams();
      for (const [k, x] of rec) this.params[k] = x; // the fault record survives a reset
      if (v === 10) { for (const k of ['01-00', '01-01', '02-22']) this.params[k] = 60; this.params['05-03'] = 1710; }
      return null;
    }
    this.params[id] = Math.round(v * 10 ** d.dec) / 10 ** d.dec;
    if (id === '01-00') this.fKey = Math.min(this.fKey, this.params['01-00']);
    return null;
  }

  powerOn() {
    if (this.powered) return;
    this.powered = true; this.bootT = 1.2; this.lastComm = this.time; this.keyRun = false; this.keyStop = false; this.commRun = false; this.f = 0; this.rate = 0;
    this.kp.mode = ['F', 'H', 'U', 'A'][this.P('00-03')] || 'F';
    if (this.kp.mode === 'A') { this.kp.mode = 'U'; this.kp.uOverride = 0; } else this.kp.uOverride = null;
  }
  powerOff() { if (this.powered) { this.powered = false; this.f = 0; this.rate = 0; this.V = 0; this.I = 0; this.dc = 0; this.runCmd = false; this.warning = null; } }

  get running() { return this.powered && !this.fault && (Math.abs(this.f) > 0.001 || this.runCmd); }

  // ------------------------------------------------------------------ inputs
  /** [parameter, MI index] of the programmable inputs (MI1 / MI2 only when Pr.02-00 = 0, MI3 is STOP in 3-wire). */
  miMap() {
    const m = this.P('02-00');
    const all = [['02-01', 0], ['02-02', 1], ['02-03', 2], ['02-04', 3], ['02-05', 4], ['02-06', 5], ['02-07', 6]];
    return all.filter(([, i]) => !(m !== 0 && i < 2) && !(m === 3 && i === 2));
  }
  miFn(fn) {
    for (const [id, i] of this.miMap()) if (this.P(id) === fn && this.MIL[i]) return true;
    return false;
  }
  miRise(fn) {
    for (const [id, i] of this.miMap()) if (this.P(id) === fn && this.MIL[i] && !this.prevMIL[i]) return true;
    return false;
  }
  /** Is any input programmed to `fn`? */
  miHas(fn) { return this.miMap().some(([id]) => this.P(id) === fn); }
  /** Terminal states after Pr.02-12 (a 1 bit makes that input N.C.). */
  readMI() { const nc = this.P('02-12') | 0; this.MIL = this.MI.map((b, i) => (b ? 1 : 0) ^ ((nc >> i) & 1)); }

  // ------------------------------------------------------------------ analog inputs
  /** AVI in % of full scale after bias (Pr.03-03) and gain (Pr.03-11). */
  aviPct() { return Math.max(0, Math.min(100, (Math.max(0, Math.min(10, this.avi)) * 10 + this.P('03-03')) * this.P('03-11') / 100)); }
  /** ACI current in mA (0 – 20 mA = 0 – 5 V across the 250 Ω input). */
  aciMA() { return Math.max(0, Math.min(25, this.aci / 0.25)); }
  /** ACI in % after the range (Pr.03-29), bias (Pr.03-04) and gain (Pr.03-12). */
  aciPct() {
    const mode = this.P('03-29');
    const raw = mode === 1 ? Math.max(0, Math.min(10, this.aci)) * 10 : mode === 2 ? this.aciMA() / 20 * 100 : (this.aciMA() - 4) / 16 * 100;
    return Math.max(0, Math.min(100, (Math.max(0, Math.min(100, raw)) + this.P('03-04')) * this.P('03-12') / 100));
  }
  /** 4–20 mA signal below 2 mA (ACI used and in 4–20 mA mode). */
  aciLost() { return this.P('03-01') !== 0 && this.P('03-29') === 0 && this.aciMA() < 2; }
  /** Frequency from the analog inputs set to 1 (AVI + ACI are added). */
  analogFreq() {
    const fmax = this.P('01-00');
    if (this.aciLost() && this.P('03-01') === 1) {
      const t = this.P('03-19');
      if (t === 1) return this.lastAnalogF;
      if (t === 2 || t === 3) return 0;
    }
    let pct = 0;
    if (this.P('03-00') === 1) pct += this.aviPct();
    if (this.P('03-01') === 1) pct += this.aciPct();
    const f = Math.min(100, pct) / 100 * fmax;
    this.lastAnalogF = f;
    return f;
  }
  /** PID feedback in % from the analog input set to 5, or null when there is none / it is lost. */
  pidFeedback() {
    if (this.P('03-00') === 5) return this.aviPct();
    if (this.P('03-01') === 5) return this.aciLost() ? null : this.aciPct();
    return null;
  }
  pidOn() { const m = this.P('08-00'); return (m === 1 || m === 4) && !this.miFn(21); }

  /** PID (group 08): set point = the frequency command of Pr.00-20 in % of Pr.01-00. */
  stepPid(dt, running) {
    const pd = this.pid;
    const fmax = Math.max(1, this.P('01-00'));
    if (!this.pidOn()) { pd.i = 0; pd.out = 0; pd.f = 0; pd.sleep = false; pd.lost = false; pd.lostT = 0; return; }
    const fb = this.pidFeedback();
    pd.sp = Math.max(0, Math.min(100, this.sourceFreq() / fmax * 100));
    // feedback signal loss (Pr.08-08 / 08-09)
    const det = this.P('08-08');
    if (fb === null && det > 0) { pd.lostT += dt; } else { pd.lostT = 0; }
    pd.lost = det > 0 && pd.lostT >= det;
    pd.hold = pd.lost && this.P('08-09') === 3;
    if (pd.lost && (this.P('08-09') === 1 || this.P('08-09') === 2)) this.trip('AFE');
    pd.fb = fb ?? 0;
    if (!running) { pd.i = 0; pd.e = 0; pd.out = 0; pd.f = 0; pd.sleep = false; pd.sleepT = 0; return; }
    if (pd.hold) return; // keep the last frequency
    const e = this.P('08-00') === 1 ? pd.sp - pd.fb : pd.fb - pd.sp;
    const kp = this.P('08-01'), ti = this.P('08-02'), td = this.P('08-03');
    const lim = this.P('08-04');
    if (ti > 0) pd.i = Math.max(-lim, Math.min(lim, pd.i + e * dt / ti));
    const d = dt > 0 ? td * (e - pd.e) / dt : 0;
    pd.e = e;
    const raw = Math.max(0, Math.min(this.P('08-05'), kp * (e + pd.i + d)));
    const tau = this.P('08-07');
    pd.out = tau > 0 ? pd.out + (raw - pd.out) * Math.min(1, dt / tau) : raw;
    pd.f = pd.out / 100 * fmax;
    // sleep / wake-up (Pr.08-10 ~ 08-12)
    const fs = this.P('08-10');
    if (fs > 0) {
      if (!pd.sleep) { pd.sleepT = pd.f < fs ? pd.sleepT + dt : 0; if (pd.sleepT >= this.P('08-12')) pd.sleep = true; }
      else if (pd.f >= Math.max(fs, this.P('08-11'))) { pd.sleep = false; pd.sleepT = 0; }
    } else pd.sleep = false;
  }

  resetFault() {
    if (!this.fault) return;
    if (this.fault === 'EF' && this.miFn(10)) return;
    if (this.fault === 'EF1' && this.miFn(28)) return;
    this.fault = null;
    this.autoT = 0;
    this.restarts = 0;
    this.keyRun = false;
    this.latch3 = false;
    this.thermal = 0;
    this.drvLoad = 0;
  }

  trip(code) {
    if (this.fault) return;
    this.fault = code;
    this.faultT = this.time;
    // auto-restart after ocA / ocd / ocn / ovA / ovd / ovn (Pr.07-11 times, Pr.07-33 later)
    if (/^(oc|ov)[Adn]$/.test(code) && this.restarts < this.P('07-11')) { this.autoT = Math.max(0.1, this.P('07-33')); this.autoRun = { key: this.keyRun, comm: this.commRun }; }
    this.keyRun = false;
    this.commRun = false;
    this.latch3 = false;
    // fault record Pr.06-17 (newest) … 06-22
    for (let i = 22; i > 17; i--) this.params['06-' + i] = this.params['06-' + (i - 1)];
    this.params['06-17'] = FAULTS[code] ? FAULTS[code].n : 0;
  }

  /** Operation command and direction from the selected source (Pr.00-21). */
  command() {
    const src = this.P('00-21');
    let run = false, dir = 1;
    if (src === 0) { run = this.keyRun; dir = this.keyDir; }
    else if (src === 1) {
      const [mi1, mi2] = this.MIL;
      const m = this.P('02-00');
      if (m === 1) { run = (mi1 ^ mi2) === 1; dir = mi2 && !mi1 ? -1 : 1; }
      else if (m === 2) { run = !!mi1; dir = mi2 ? -1 : 1; }
      else if (m === 3) {
        if (!this.MIL[2]) this.latch3 = false; else if (mi1 && !this.prevMIL[0]) this.latch3 = true;
        run = this.latch3; dir = mi2 ? -1 : 1;
      }
    } else { run = this.commRun; dir = this.commDir; }
    // STOP pressed on the keypad (Pr.00-32 = 1) holds an external / RS-485 run command off
    // until that command is switched off and on again
    if (src !== 0 && this.keyStop) { if (!run) this.keyStop = false; run = false; }
    // JOG input (MI = 6) when the drive is not running from its normal command
    let jog = false;
    if (!run && (src === 0 || src === 1)) {
      if (this.miFn(6)) { run = true; jog = true; dir = src === 0 ? this.keyDir : 1; }
      else if (this.miFn(24) !== this.miFn(25)) { run = true; jog = true; dir = this.miFn(25) ? -1 : 1; } // FWD / REV JOG
    }
    if (this.miFn(18) || this.miFn(40)) run = false; // force to stop / force coasting
    if (this.miHas(49) && !this.miFn(49)) run = false; // drive enable input OFF
    const lock = this.P('00-23');
    if ((lock === 1 && dir < 0) || (lock === 2 && dir > 0)) run = false;
    return { run, dir, jog };
  }

  /** Frequency command from the selected source, inside the limits. */
  freqCommand(jog) {
    const fmax = this.P('01-00');
    const bits = (this.miFn(1) ? 1 : 0) | (this.miFn(2) ? 2 : 0) | (this.miFn(3) ? 4 : 0) | (this.miFn(4) ? 8 : 0);
    this.step = bits;
    let f;
    if (jog) f = this.P('01-22');
    else if (bits) f = this.P('04-' + String(bits - 1).padStart(2, '0'));
    else if (this.miFn(15)) f = this.aviPct() / 100 * fmax;
    else if (this.miFn(16)) f = this.aciPct() / 100 * fmax;
    else if (this.pidOn()) f = this.pid.f;
    else f = this.sourceFreq();
    // skip frequencies (Pr.01-28 ~ 01-33): a command inside a band stays at its lower limit
    for (let k = 0; k < 3; k++) {
      const hi = this.P('01-' + (28 + 2 * k)), lo = this.P('01-' + (29 + 2 * k));
      if (hi > lo && f > lo && f < hi) f = lo;
    }
    const hiLim = Math.min(fmax, this.P('01-10'));
    return Math.max(0, Math.min(hiLim, Math.max(this.P('01-11'), f)));
  }

  /** Frequency of Pr.00-20 alone (no multi-step / JOG). */
  sourceFreq() {
    const fmax = this.P('01-00');
    switch (this.P('00-20')) {
      case 0: return this.fKey;
      case 1: return this.fComm;
      case 2: return this.analogFreq();
      case 3: return this.fUD;
      case 7: return Math.max(0, Math.min(1, this.knob)) * fmax;
      default: return 0;
    }
  }

  // ------------------------------------------------------------------ simulation step (dt in seconds)
  stepSim(dt) {
    this.time += dt;
    this.readMI();
    if (!this.powered) { this.decayMotor(dt); this.prevMIL = this.MIL.slice(); return; }
    if (this.bootT > 0) this.bootT -= dt;
    if (this.kp.flashT > 0) { this.kp.flashT -= dt; if (this.kp.flashT <= 0) this.kp.flash = null; }
    if (this.miFn(10)) this.trip('EF');
    if (this.miFn(28)) this.trip('EF1');
    if (this.miRise(5)) this.resetFault();
    // auto-restart after a fault (Pr.07-11 / 07-33)
    if (this.fault && this.autoT > 0) {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        const r = this.restarts + 1, run = this.autoRun || {};
        this.fault = null; this.restarts = r; this.thermal = 0;
        this.keyRun = !!run.key; this.commRun = !!run.comm;
      }
    }
    const warn = [];
    // communication time-out
    const usesComm = this.P('00-20') === 1 || this.P('00-21') === 2;
    const tmo = this.P('09-03');
    if (usesComm && tmo > 0 && !(this.bootT > 0) && this.time - this.lastComm > tmo) {
      const tr = this.P('09-02');
      if (tr === 0) warn.push('CE10');
      else if (tr === 1 || tr === 2) { this.trip('CE10'); if (tr === 2) this.f = 0; }
    }
    // ACI 4–20 mA signal loss (Pr.03-19)
    if (this.aciLost()) { const t = this.P('03-19'); if (t === 1 || t === 2) warn.push('AnL'); else if (t === 3) this.trip('ACE'); }
    // terminal counter (MI = 23 counts, 22 clears; Pr.02-19 / 02-20)
    if (this.cntPulseT > 0) this.cntPulseT -= dt;
    if (this.miFn(22)) this.counter = 0;
    else if (this.miRise(23)) {
      this.counter = Math.min(65535, this.counter + 1);
      const end = this.P('02-19');
      if (end > 0 && this.counter >= end) { this.counter = 0; this.cntPulseT = 0.5; }
    }
    // UP / DOWN terminals (Pr.00-20 = 3)
    const fmax = Math.max(1, this.P('01-00'));
    const up = this.miFn(19), dn = this.miFn(20);
    if (up !== dn) {
      const r = this.P('02-09') === 1 ? this.P('02-10') * 1000 : fmax / Math.max(0.01, up ? this.P('01-12') : this.P('01-13'));
      this.fUD = Math.max(0, Math.min(fmax, this.fUD + (up ? 1 : -1) * r * dt));
    }
    const cmd = this.command();
    this.cmdDir = cmd.dir;
    this.jog = cmd.jog;
    this.bb = this.miFn(11) || this.miFn(12);
    this.runCmd = cmd.run && !this.fault;
    this.stepPid(dt, this.runCmd && !cmd.jog);
    if (this.pid.lost) warn.push('AFE');
    this.fcmd = this.freqCommand(cmd.jog);
    const startF = this.P('01-09');
    const pidSleep = this.pidOn() && this.pid.sleep && !cmd.jog && !this.step;
    this.standby = this.runCmd && (this.fcmd < startF || pidSleep) && Math.abs(this.f) < 0.005;
    // DC brake at start-up (Pr.07-02)
    if (this.runCmd && !this.wasRun && this.f === 0 && this.P('07-02') > 0 && this.P('07-01') > 0) this.dcStartT = this.P('07-02');
    if (!this.runCmd) this.dcStartT = 0;
    this.wasRun = this.runCmd;
    let target = this.runCmd && !this.standby && !pidSleep ? cmd.dir * this.fcmd : 0;
    // how the drive stops: fault / EF / EF1 / force stop (Pr.07-20), stop method (Pr.00-22)
    const forced = this.fault === 'EF' || this.fault === 'EF1' || this.fault === 'CE10' || (this.fault === 'AFE' && this.P('08-09') === 1) || this.miFn(18);
    const forceMode = this.fault === 'CE10' ? (this.P('09-02') === 1 ? 1 : 0) : this.fault === 'AFE' ? 1 : this.P('07-20');
    const coast = this.bb || this.miFn(40) || (!this.runCmd && !forced && this.P('00-22') === 1) || (!!this.fault && !forced) || (forced && forceMode === 0);
    const prevF = this.f;
    const m = this.motor;
    const Ifl = this.P('05-01'), Inl = this.P('05-05');
    const fb = Math.max(1, this.P('01-01'));
    const Irated = this.P('00-01');
    this.stall = null;
    if (coast) { this.f = 0; this.rate = 0; this.dcBrakeT = 0; this.dcStartT = 0; }
    else if (this.dcStartT > 0) { this.dcStartT -= dt; this.f = 0; this.rate = 0; }
    else if (this.dcBrakeT > 0) { this.dcBrakeT -= dt; this.f = 0; if (this.runCmd && target !== 0) this.dcBrakeT = 0; }
    else if (!this.miFn(7) || !this.runCmd) {
      // accel / decel set: MI = 8 / 9 (1st … 4th), JOG, or the 07-20 stop selection
      let set = (this.miFn(8) ? 1 : 0) | (this.miFn(9) ? 2 : 0);
      if (forced && forceMode >= 1) set = forceMode - 1;
      const T = [['01-12', '01-13'], ['01-14', '01-15'], ['01-16', '01-17'], ['01-18', '01-19']][set];
      let tAcc = this.P(T[0]), tDec = this.P(T[1]);
      if (cmd.jog) { tAcc = this.P('01-20'); tDec = this.P('01-21'); }
      if (Math.sign(target) !== Math.sign(this.f) && this.f !== 0) target = 0; // pass through zero first
      const away = Math.abs(target) > Math.abs(this.f);
      const R = fmax / Math.max(0.01, away ? tAcc : tDec);
      const Tb = away ? this.P('01-24') : this.P('01-26'), Ta = away ? this.P('01-25') : this.P('01-27');
      const diff = target - this.f;
      let r = Tb > 0 ? Math.min(R, this.rate + R / Tb * dt) : R;
      if (Ta > 0) r = Math.min(r, Math.max(Math.sqrt(2 * Math.abs(diff) * R / Ta), R * 0.04));
      // stall prevention: hold the ramp instead of tripping
      if (m.connected && Math.abs(diff) > 1e-6) {
        const k = Math.min(1, Math.abs(this.f) / fb + 0.15);
        const Ist = Inl * k + (Ifl - Inl) * m.load * k;
        const perHz = Ifl * 1.2 / 50; // accelerating the motor and load inertia
        if (away) {
          const lvl = this.P('06-03') / 100 * Irated;
          if (lvl > 0 && Ist + perHz * r > lvl) { r = Math.max(0, (lvl - Ist) / perHz); this.stall = 'oc'; }
        } else {
          const lvl = this.P('06-01');
          const perV = 0.9 * (0.5 + m.load);
          if (lvl > 0 && 311 + perV * r > lvl) { r = Math.max(0, (lvl - 311) / perV); this.stall = 'ov'; }
        }
      }
      const stepHz = r * dt;
      if (Math.abs(diff) <= stepHz) { this.f = target; this.rate = 0; } else { this.f += Math.sign(diff) * stepHz; this.rate = r; }
      if (prevF === 0 && this.f !== 0 && this.runCmd && Math.abs(this.f) < startF) this.f = Math.sign(this.f) * Math.min(startF, Math.abs(target));
      // stopping: below the start-up frequency the output switches off; DC braking (Pr.07-01 / 03 / 04)
      if (!this.runCmd || target === 0) {
        const fdc = this.P('07-04');
        if (Math.abs(this.f) < Math.max(0.005, startF) || (fdc > 0 && Math.abs(this.f) <= fdc)) {
          if (this.f !== 0 && this.P('07-01') > 0 && this.P('07-03') > 0 && !this.runCmd) this.dcBrakeT = this.P('07-03');
          if (!this.runCmd || target === 0) { this.f = 0; this.rate = 0; }
        }
      }
    }
    if (this.f !== 0) this.dir = Math.sign(this.f);
    else if (this.runCmd) this.dir = cmd.dir;
    const dfdt = (Math.abs(this.f) - Math.abs(prevF)) / Math.max(dt, 1e-6);
    // electrical outputs
    const af = Math.abs(this.f);
    this.V = this.vf(af);
    const dcI = this.P('07-01') / 100 * Irated;
    if (m.connected && af > 0) {
      const k = Math.min(1, af / fb + 0.15);
      const accelI = Ifl * 1.2 * Math.abs(dfdt) / 50;
      this.I = Inl * k + (Ifl - Inl) * m.load * k + accelI;
      const hw = 2 * Irated; // hardware over-current level
      if (this.I > hw) this.trip(dfdt > 0.01 ? 'ocA' : dfdt < -0.01 ? 'ocd' : 'ocn');
      // regenerated energy during deceleration raises the DC bus
      this.dc = 311 + Math.max(0, -dfdt) * 0.9 * (0.5 + m.load);
      if (this.dc > 410) this.trip('ovd');
      // motor electronic thermal relay (Pr.06-13 / 06-14): 150 % for Pr.06-14 seconds trips
      if (this.P('06-13') !== 2) {
        const x = (this.I / Ifl) ** 2 - (this.P('06-13') === 1 && af < fb / 2 ? 0.7 : 1);
        this.thermal = Math.max(0, this.thermal + dt * x / (1.25 * this.P('06-14')));
        if (this.thermal >= 1) this.trip('EoL1');
      } else this.thermal = 0;
      // drive over-load: 150 % of Pr.00-01 for 60 s
      this.drvLoad = Math.max(0, this.drvLoad + dt * ((this.I / Irated) ** 2 - 1) / (1.25 * 60));
      if (this.drvLoad >= 1) this.trip('oL');
    } else if (this.dcBrakeT > 0 || this.dcStartT > 0) { this.I = dcI; this.dc = 311; }
    else { this.I = 0; this.dc = 311; }
    // over-torque detection (Pr.06-06 ~ 06-08)
    const otm = this.P('06-06');
    const constant = Math.abs(dfdt) < 0.01 && af > 0;
    if (otm > 0 && af > 0 && (otm >= 3 || constant) && this.I > this.P('06-07') / 100 * Irated) this.otT += dt; else this.otT = 0;
    this.ot = otm > 0 && this.otT >= this.P('06-08');
    if (this.ot) { if (otm === 2 || otm === 4) this.trip('ot1'); else warn.push('ot1'); }
    this.tempC += ((30 + this.I * 3.2) - this.tempC) * Math.min(1, dt / 20);
    if (this.tempC >= this.P('06-15')) warn.push('oH1');
    // motor speed
    if (m.connected && af > 0 && !this.fault) {
      const poles = Math.max(2, this.P('05-04'));
      const sync = 120 * af / poles;
      const syncRated = 120 * fb / poles;
      const slip = Math.max(0, (syncRated - this.P('05-03')) / syncRated) * m.load;
      this.rpm = Math.sign(this.f) * m.sign * sync * (1 - slip);
    } else if (this.dcBrakeT > 0 || this.dcStartT > 0) { this.rpm *= Math.exp(-dt / 0.15); if (Math.abs(this.rpm) < 1) this.rpm = 0; }
    else this.decayMotor(dt);
    this.warning = warn[0] || null;
    this.prevMIL = this.MIL.slice();
  }

  /** Output voltage from the V/F curve (Pr.01-01 ~ 01-08). */
  vf(af) {
    if (af <= 0) return 0;
    const pts = [[this.P('01-07'), this.P('01-08')], [this.P('01-05'), this.P('01-06')], [this.P('01-03'), this.P('01-04')], [Math.max(0.01, this.P('01-01')), this.P('01-02')]]
      .filter((p, i, a) => i === a.length - 1 || p[0] < a[a.length - 1][0]).sort((x, y) => x[0] - y[0]);
    if (af >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
    let prev = [0, 0];
    for (const p of pts) {
      if (af <= p[0]) return p[0] > prev[0] ? prev[1] + (p[1] - prev[1]) * (af - prev[0]) / (p[0] - prev[0]) : p[1];
      prev = p;
    }
    return pts[pts.length - 1][1];
  }

  decayMotor(dt) {
    this.rpm *= Math.exp(-dt / 1.6);
    if (Math.abs(this.rpm) < 1) this.rpm = 0;
  }

  /** State of a multi-function output with setting `fn` (Pr.02-13 / 02-16 / 02-17). */
  out(fn) {
    if (!this.powered) return false;
    const af = Math.abs(this.f);
    const Irated = this.P('00-01');
    switch (fn) {
      case 1: return this.running;
      case 2: return this.runCmd && af > 0 && Math.abs(af - this.fcmd) < 0.05;
      case 3: return Math.abs(af - this.P('02-22')) <= this.P('02-23') && af > 0;
      case 4: return Math.abs(af - this.P('02-24')) <= this.P('02-25') && af > 0;
      case 5: return this.fcmd < 0.005 && this.runCmd;
      case 6: return af < 0.005;
      case 7: return this.ot;
      case 9: return !this.fault && this.bootT <= 0;
      case 11: return !!this.fault;
      case 13: return this.tempC >= this.P('06-15');
      case 15: return this.pid.lost;
      case 17: return this.cntPulseT > 0;
      case 18: return this.P('02-20') > 0 && this.counter >= this.P('02-20');
      case 19: return this.bb;
      case 20: return !!this.warning;
      case 22: return this.stall === 'oc';
      case 23: return this.stall === 'ov';
      case 24: return this.P('00-21') !== 0;
      case 25: return this.runCmd && this.cmdDir > 0;
      case 26: return this.runCmd && this.cmdDir < 0;
      case 27: return af > 0 && this.I >= this.P('02-33') / 100 * Irated;
      case 28: return this.I <= this.P('02-33') / 100 * Irated;
      case 29: return af >= this.P('02-34');
      case 30: return af <= this.P('02-34');
      default: return false;
    }
  }

  /** Relay RA–RC closed (RB–RC is the opposite). */
  relay() { return this.out(this.P('02-13')); }
  /** MO1 / MO2 open-collector output ON (conducts to MCM). */
  mo(k) { return this.out(this.P(k === 1 ? '02-16' : '02-17')); }

  /** AFM analog output 0–10 V (Pr.03-20 / 03-21). */
  afm() {
    if (!this.powered) return 0;
    const fmax = Math.max(1, this.P('01-00'));
    const x = [Math.abs(this.f) / fmax, this.fcmd / fmax, Math.abs(this.f) / fmax, this.I / (2 * this.P('00-01')), this.V / Math.max(1, this.P('01-02')), this.dc / 410][this.P('03-20')] ?? 0;
    return Math.max(0, Math.min(10, 10 * x * this.P('03-21') / 100));
  }

  // ------------------------------------------------------------------ Modbus slave
  status() {
    let s = 0;
    if (this.runCmd) s |= 3; else if (this.f !== 0) s |= 1;
    if (this.dir < 0) s |= 0x18;
    if (this.jog) s |= 0x4;
    if (this.P('00-20') === 1) s |= 0x100;
    if (this.P('00-20') === 2) s |= 0x200;
    if (this.P('00-21') === 2) s |= 0x400;
    if (this.P('00-02') === 1) s |= 0x800;
    return s;
  }

  readReg(a) {
    switch (a) {
      case 0x2000: return this.cmdWord;
      case 0x2001: return Math.round(this.fComm * 100);
      case 0x2002: return this.cmd2002;
      case 0x2100: return (this.warning === 'CE10' ? FAULTS.CE10.n << 8 : 0) | (this.fault ? FAULTS[this.fault].n : 0);
      case 0x2101: return this.status();
      case 0x2102: return Math.round(this.fcmd * 100);
      case 0x2103: return Math.round(Math.abs(this.f) * 100);
      case 0x2104: return Math.round(this.I * 100);
      case 0x2105: return Math.round(this.dc * 10);
      case 0x2106: return Math.round(this.V * 10);
      case 0x2107: return this.step;
      case 0x2109: return 0;
      case 0x210C: return Math.round(Math.abs(this.rpm));
      default: {
        const p = paramByAddr(a);
        if (p) return Math.round(this.params[p.id] * 10 ** p.dec);
        return null;
      }
    }
  }

  writeReg(a, v) {
    v &= 0xFFFF;
    if (a === 0x2000) {
      this.cmdWord = v;
      const run = v & 3, dir = (v >> 4) & 3;
      if (run === 1) this.commRun = false;
      else if (run === 2 || run === 3) this.commRun = !this.fault;
      if (dir === 1) this.commDir = 1; else if (dir === 2) this.commDir = -1; else if (dir === 3) this.commDir = -this.commDir;
      return null;
    }
    if (a === 0x2001) { this.fComm = v / 100; return null; }
    if (a === 0x2002) {
      this.cmd2002 = v;
      if (v & 1) this.trip('EF');
      if (v & 2) this.resetFault();
      return null;
    }
    const p = paramByAddr(a);
    if (!p) return 2;
    if (p.ro) return 3;
    const raw = p.min < 0 && v > 0x7FFF ? v - 0x10000 : v; // signed parameters (e.g. -10.0 %)
    const err = this.setParam(p.id, raw / 10 ** p.dec);
    return err ? 3 : null;
  }

  /** Handle a Modbus request addressed to this drive. Returns {data} | {exception} | null (no reply). */
  modbus(req) {
    if (!this.powered || this.bootT > 0.6) return null;
    const station = this.P('09-00');
    if (req.station !== station && req.station !== 0) return null;
    this.lastComm = this.time;
    if (this.warning === 'CE10') this.warning = null;
    let res;
    if (req.fc === 3) {
      const data = [];
      for (let i = 0; i < req.count; i++) { const v = this.readReg(req.addr + i); if (v === null) { res = { exception: 2 }; break; } data.push(v); }
      res = res || { data };
    } else if (req.fc === 6) {
      const e = this.writeReg(req.addr, req.values[0]);
      res = e ? { exception: e } : { ok: true };
    } else if (req.fc === 16) {
      let e = null;
      req.values.forEach((v, i) => { if (!e) e = this.writeReg(req.addr + i, v); });
      res = e ? { exception: e } : { ok: true };
    } else res = { exception: 1 };
    return req.station === 0 ? null : res;
  }

  // ------------------------------------------------------------------ keypad
  /** Turn the keypad dial (0 … 1). Returns a hint when the dial is not the frequency source. */
  setKnob(x) {
    this.knob = Math.max(0, Math.min(1, x));
    if (!this.powered) return null;
    if (this.P('00-20') !== 7) return `The knob sets the frequency only when Pr.00-20 = 7 (now ${this.P('00-20')}: ${PARAM_BY_ID['00-20'].opts[this.P('00-20')]})`;
    if (this.kp.mode !== 'edit' && this.kp.mode !== 'param' && this.kp.mode !== 'PrG') { this.kp.mode = 'F'; }
    return null;
  }

  /** Number of digits ▲ ▼ can step on the F page (0.01 … 100 Hz). */
  fDigits() { return this.P('01-00') >= 100 ? 5 : 4; }

  /**
   * A key on the digital keypad: RUN, STOP, MODE, ENTER, UP, DOWN (short press of ◀/▼) and
   * LEFT (long press of ◀/▼: next digit to the left). When a key cannot act, the answer is a short
   * hint for the UI, otherwise null.
   */
  key(k) {
    if (!this.powered) return 'The drive has no power — check R/L1 and S/L2';
    if (this.bootT > 0) return null;
    const kp = this.kp;
    const groups = PARAM_GROUPS;
    const inGroup = () => VFD_PARAMS.filter((p) => p.id.startsWith(groups[kp.group] + '-'));
    const runSrc = this.P('00-21');
    const srcText = (id) => `${PARAM_BY_ID[id].opts[this.P(id)]} (Pr.${id} = ${this.P(id)})`;
    const flash = (t, s = 0.7) => { kp.flash = t; kp.flashT = s; };
    switch (k) {
      case 'RUN':
        if (this.fault) return `Fault ${this.fault} — press STOP/RESET first`;
        if (runSrc !== 0) return `RUN key is not the run command now: it comes from ${srcText('00-21')}. Set Pr.00-21 = 0 to run from the keypad.`;
        if (this.miFn(18)) return 'A force-to-stop input (MI = 18) is ON';
        this.keyRun = true;
        if (this.fcmd < this.P('01-09') && this.step === 0) return `The frequency command ${this.fcmd.toFixed(2)} Hz is below the start-up frequency (Pr.01-09 = ${this.P('01-09')} Hz) — raise it with ${this.P('00-20') === 7 ? 'the knob' : '▲'}`;
        return null;
      case 'STOP':
        if (this.fault) {
          const was = this.fault;
          this.resetFault();
          if (this.fault) return `${was} cannot be reset while the EF input is still ON`;
          flash('rESEt', 0.5);
          return null;
        }
        if (runSrc === 0) { this.keyRun = false; return null; }
        if (this.P('00-32') !== 1) return 'STOP key is disabled (Pr.00-32 = 0)';
        if (this.runCmd || this.f !== 0) {
          this.keyStop = true;
          return `Stopped from the keypad — switch the ${runSrc === 1 ? 'MI terminal' : 'RS-485'} run command OFF and ON again to restart`;
        }
        return null;
      case 'MODE': {
        // F → H → U → parameter groups → direction → F; inside the parameters MODE goes one level back
        const order = ['F', 'H', 'U', 'PrG', 'dir'];
        if (kp.mode === 'edit') kp.mode = 'param';
        else if (kp.mode === 'param') kp.mode = 'PrG';
        else kp.mode = order[(order.indexOf(kp.mode) + 1) % order.length] || 'F';
        if (kp.mode === 'F') kp.pos = Math.min(kp.pos, this.fDigits() - 1);
        kp.uOverride = null;
        return null;
      }
      case 'ENTER':
        if (kp.mode === 'PrG') { kp.mode = 'param'; kp.pidx = 0; }
        else if (kp.mode === 'param') {
          const p = inGroup()[kp.pidx];
          kp.mode = 'edit'; kp.edit = this.params[p.id]; kp.pos = p.opts ? 0 : Math.min(p.dec, 3);
          if (p.ro) return `Pr.${p.id} is read-only (shown only)`;
        } else if (kp.mode === 'edit') {
          const p = inGroup()[kp.pidx];
          if (p.ro) { kp.mode = 'param'; return null; }
          const err = this.setParam(p.id, kp.edit);
          flash(err ? 'Err' : 'End', 0.8);
          kp.mode = 'param';
          return err;
        } else if (kp.mode === 'F') {
          const why = this.freqKeyBlocked();
          if (why) return why;
          flash('End', 0.6); // frequency command stored
        } else if (kp.mode === 'dir') return this.toggleKeyDir();
        else { kp.mode = 'PrG'; } // H / U page: ENTER opens the parameter setup
        return null;
      case 'UP': case 'DOWN': {
        const s = k === 'UP' ? 1 : -1;
        if (kp.mode === 'F' || kp.mode === 'H') {
          if (kp.mode !== 'F') { kp.mode = 'F'; }
          const why = this.freqKeyBlocked();
          if (why) return why;
          const was = this.fKey;
          const fmax = this.P('01-00');
          this.fKey = Math.max(0, Math.min(fmax, Math.round((this.fKey + s * 10 ** (kp.pos - 2)) * 100) / 100));
          if (this.fKey === was) return s > 0 ? `Already at the maximum operation frequency (Pr.01-00 = ${fmax} Hz)` : 'Already at 0.00 Hz';
        } else if (kp.mode === 'U') {
          // ▲▼ on the U page pick what it shows (Pr.00-04)
          const keys = Object.keys(PARAM_BY_ID['00-04'].opts).map(Number);
          const i = keys.indexOf(this.P('00-04'));
          this.params['00-04'] = keys[(Math.max(0, i) + s + keys.length) % keys.length];
          kp.uOverride = null;
          flash(U_PREFIX[this.params['00-04']] + '-', 0.45);
        } else if (kp.mode === 'dir') return this.toggleKeyDir();
        else if (kp.mode === 'PrG') kp.group = (kp.group + s + groups.length) % groups.length;
        else if (kp.mode === 'param') { const n = inGroup().length; kp.pidx = (kp.pidx + s + n) % n; }
        else if (kp.mode === 'edit') {
          const p = inGroup()[kp.pidx];
          if (p.ro) return `Pr.${p.id} is read-only`;
          if (p.opts) {
            const keys = Object.keys(p.opts).map(Number).sort((a, b) => a - b);
            const i = keys.indexOf(kp.edit);
            kp.edit = keys[(Math.max(0, i) + s + keys.length) % keys.length];
          } else {
            const step = 10 ** (kp.pos - p.dec);
            kp.edit = Math.round((kp.edit + s * step) * 10 ** p.dec) / 10 ** p.dec;
            if (p.min !== undefined) kp.edit = Math.max(p.min, Math.min(p.max, kp.edit));
          }
        }
        return null;
      }
      case 'LEFT':
        // ◀ (hold ◀/▼): the blinking digit moves one place left while a number is set; elsewhere one level back
        if (kp.mode === 'F') kp.pos = (kp.pos + 1) % this.fDigits();
        else if (kp.mode === 'edit' && !inGroup()[kp.pidx].opts) kp.pos = (kp.pos + 1) % 5;
        else if (kp.mode === 'edit') kp.mode = 'param';
        else if (kp.mode === 'param') kp.mode = 'PrG';
        else kp.mode = 'F';
        return null;
      default: return null;
    }
  }

  /** Why ▲▼ cannot change the keypad frequency now (null = they can). */
  freqKeyBlocked() {
    if (this.step) return `Multi-step speed ${this.step} is selected by the MI inputs — it uses Pr.04-${String(this.step - 1).padStart(2, '0')}`;
    if (this.jog) return 'JOG is active — it uses Pr.01-22';
    const fSrc = this.P('00-20');
    if (fSrc === 7) return 'The frequency comes from the keypad dial (Pr.00-20 = 7): turn the knob. Set Pr.00-20 = 0 to set it with ▲ ▼.';
    if (fSrc !== 0) return `The frequency command comes from ${PARAM_BY_ID['00-20'].opts[fSrc]} (Pr.00-20 = ${fSrc}). Set Pr.00-20 = 0 to set it with ▲ ▼.`;
    return null;
  }

  /** Direction page: ▲ ▼ / ENTER switch the keypad run direction (Frd ↔ rEv). */
  toggleKeyDir() {
    if (this.P('00-21') !== 0) return `The direction comes from ${PARAM_BY_ID['00-21'].opts[this.P('00-21')]} (Pr.00-21 = ${this.P('00-21')})`;
    const next = -this.keyDir;
    const lock = this.P('00-23');
    if ((lock === 1 && next < 0) || (lock === 2 && next > 0)) return `${next < 0 ? 'Reverse' : 'Forward'} is disabled (Pr.00-23 = ${lock})`;
    this.keyDir = next;
    return null;
  }

  /** U page value for Pr.00-04 code `sel`. */
  uText(sel) {
    const p = U_PREFIX[sel] ?? '';
    switch (sel) {
      case 0: return pre(p, this.I.toFixed(2));
      case 2: return pre(p, fmtHz(Math.abs(this.f)));
      case 3: return pre(p, this.dc.toFixed(1));
      case 4: return pre(p, this.V.toFixed(1));
      case 6: return pre(p, (this.V * this.I * 1.732 * 0.8 / 1000).toFixed(2));
      case 7: return pre(p, Math.round(Math.abs(this.rpm)).toString());
      case 8: return pre(p, (this.f !== 0 && this.motor.connected ? this.motor.load * 100 : 0).toFixed(1));
      case 14: return pre(p, this.tempC.toFixed(1));
      case 1: return pre(p, String(this.counter));
      case 10: return pre(p, this.pid.fb.toFixed(1));
      case 11: return pre(p, this.aviPct().toFixed(1));
      case 12: return pre(p, this.aciPct().toFixed(1));
      case 16: return pre(p, this.MIL.reduce((a, b, i) => a | (b << i), 0).toString(16).toUpperCase().padStart(4, '0'));
      case 17: return pre(p, ((this.relay() ? 1 : 0) | (this.mo(1) ? 2 : 0) | (this.mo(2) ? 4 : 0)).toString(16).padStart(4, '0'));
      case 18: return pre(p, String(this.step));
      default: return '';
    }
  }

  /** What the 5-digit LED display shows: {text, leds:{RUN,STOP,FWD,REV,PLC}, cursor, editing, fault}. */
  display(t = this.time) {
    const kp = this.kp;
    const leds = { RUN: false, STOP: false, FWD: false, REV: false, PLC: false };
    if (!this.powered) return { text: '', leds, off: true };
    const blink = Math.floor(t * 2.5) % 2 === 0;
    const moving = this.f !== 0 || this.dcBrakeT > 0;
    // RUN: on while running, blinks while decelerating to stop or in base block
    leds.RUN = (this.runCmd && moving && !this.bb) || ((!this.runCmd && moving) || (this.bb && this.runCmd) ? blink : false);
    // STOP: on when stopped, blinks in standby (run command but no output)
    leds.STOP = !moving && (this.runCmd || this.keyStop ? blink : true);
    // FWD / REV: the direction; blinks while the direction is changing
    const changing = this.runCmd && this.f !== 0 && Math.sign(this.f) !== this.cmdDir;
    const d = moving ? this.dir : this.runCmd ? this.cmdDir : (this.P('00-21') === 0 ? this.keyDir : this.dir);
    leds.FWD = d > 0 && (!changing || blink);
    leds.REV = d < 0 && (!changing || blink);
    if (changing) { leds.FWD = this.dir > 0 ? blink : !blink; leds.REV = !leds.FWD; }
    if (this.bootT > 0) return { text: this.bootT > 0.6 ? '88888' : 'dELtA', leds: this.bootT > 0.6 ? { RUN: true, STOP: true, FWD: true, REV: true, PLC: true } : leds };
    if (kp.flash) return { text: kp.flash, leds };
    if (this.fault) return { text: blink ? this.fault : '', leds, fault: true };
    if (this.bb && blink) return { text: 'bb', leds, warn: true };
    if (this.warning && blink) return { text: this.warning, leds, warn: true };
    const groups = PARAM_GROUPS;
    const fmt = (v, dec) => v.toFixed(dec);
    switch (kp.mode) {
      case 'F': {
        const fc = this.freqCommand(this.jog);
        const cur = this.freqKeyBlocked() ? -1 : fc >= 100 ? kp.pos - 1 : kp.pos;
        return { text: pre('F', fmtHz(fc)), leds, cursor: cur, page: 'F' };
      }
      case 'H': return { text: pre('H', fmtHz(Math.abs(this.f))), leds, page: 'H' };
      case 'U': return { text: this.uText(kp.uOverride ?? this.P('00-04')), leds, page: 'U' };
      case 'dir': return { text: this.keyDir < 0 ? 'rEv' : 'Frd', leds };
      case 'PrG': return { text: groups[kp.group] + '-', leds };
      case 'param': { const p = VFD_PARAMS.filter((x) => x.id.startsWith(groups[kp.group] + '-'))[kp.pidx]; return { text: p.id, leds }; }
      case 'edit': {
        const p = VFD_PARAMS.filter((x) => x.id.startsWith(groups[kp.group] + '-'))[kp.pidx];
        const txt = fmt(kp.edit, p.dec);
        return { text: txt.replace(/\./g, '').length > 5 ? fmt(kp.edit, Math.max(0, p.dec - 1)) : txt, leds, cursor: p.opts || p.ro ? -1 : kp.pos, editing: true };
      }
      default: return { text: '', leds };
    }
  }

  snapshotParams() { return { ...this.params }; }
}
