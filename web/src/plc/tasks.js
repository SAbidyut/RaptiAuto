// Lab exercises: self-checking task lists for each example. Every check(ctx) runs a few times a
// second; ctx = { sys, lab, P, rt(id), dev(id), cpu, vfd, motor, dl (downloaded program JSON), memo }.

const hz = (c) => (c.vfd && c.vfd.powered ? c.vfd.f : 0);
const near = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;
const has = (c, s) => c.dl.includes(s);

export const LAB_TASKS = {
  'start-stop': [
    { text: 'Press Simulate — the PLC switches to RUN', check: (c) => !!(c.cpu && c.cpu.running) },
    { text: 'Press START (Operate mode): the RUN lamp lights and stays on after you let go', check: (c) => { const on = c.rt('lrun') && c.rt('lrun').on && !c.rt('start').pressed; if (on) c.memo.latched = true; return on; } },
    { text: 'Press STOP: the latch breaks and the STOPPED lamp lights', check: (c) => !!(c.memo.latched && c.rt('lstop') && c.rt('lstop').on) },
    { text: 'Open the Ladder tab while the lamp is on and watch the green power flow', check: (c) => c.lab.tab === 'ladder' && !!(c.cpu && c.cpu.Y[0]) },
    { text: 'Edit the ladder so the STOPPED lamp flashes (add an M1013 contact), then Download', hint: 'Network 2: /Y0 M1013 → OUT Y1', check: (c) => has(c, '"M1013"') },
  ],
  'traffic-light': [
    { text: 'Simulate and watch the lights: red → green → amber', check: (c) => { const r = (id) => c.rt(id) && c.rt(id).on; if (r('green')) c.memo.g = true; return !!(c.memo.g && r('amber')); } },
    { text: 'Turn the ENABLE selector OFF — the amber lamp flashes (M1013)', check: (c) => !!(c.cpu && c.cpu.running && c.dev('sel') && !c.dev('sel').state.on && c.rt('amber') && c.rt('amber').on) },
    { text: 'Make the green phase 6 s (TMR T1 K60) and Download', check: (c) => has(c, '"K60"') },
    { text: 'Open Monitor and watch T0, T1, T2 count', check: (c) => c.lab.tab === 'monitor' && !!(c.cpu && c.cpu.running) },
  ],
  'part-counter': [
    { text: 'Simulate, then tap the sensor 3 times to count 3 parts', check: (c) => !!(c.cpu && c.cpu.CV[0] >= 3) },
    { text: 'Set the TARGET to 8 on the HMI keypad', check: (c) => !!(c.cpu && c.cpu.D[0] === 8) },
    { text: 'Fill the box: BOX FULL lights and the buzzer beeps', check: (c) => { const ok = !!(c.cpu && c.cpu.C[0] && c.rt('full') && c.rt('full').on); if (ok) c.memo.full = true; return ok; } },
    { text: 'Reset the count with the HMI RESET button', check: (c) => !!(c.memo.full && c.cpu && c.cpu.CV[0] === 0) },
  ],
  'vfd-terminals': [
    { text: 'Press FWD — the drive runs forward at LOW speed (15 Hz)', check: (c) => near(hz(c), 15) },
    { text: 'Turn SPEED to HIGH — 50 Hz (multi-step 2)', check: (c) => near(hz(c), 50) },
    { text: 'Press STOP, then REV — the motor turns backwards', check: (c) => hz(c) < -1 },
    { text: 'Change Pr.04-00 (step 1) to 20 Hz in the VFD tab or with the keypad', check: (c) => !!(c.vfd && c.vfd.params['04-00'] === 20) },
    { text: 'Make it trip: switch stall prevention off (Pr.06-03 = 0), set Pr.01-12 to 0.10 s and start — fault ocA', hint: 'With Pr.06-03 = 150 % the drive just accelerates slower. Then press STOP/RESET and put both back', check: (c) => !!(c.vfd && c.vfd.fault === 'ocA') },
  ],
  'contactor-starter': [
    { text: 'Press START — KM1 pulls in, the RUN lamp lights and the conveyor motor turns', check: (c) => !!(c.rt('km1') && c.rt('km1').closed && c.motor && Math.abs(c.motor.rpm) > 300) },
    { text: 'Tap the photo sensor (a box reaches the belt end) — the drive stops, KM1 stays in', check: (c) => !!(c.dev('photo') && c.dev('photo').state.target && c.rt('km1') && c.rt('km1').closed && c.vfd && hz(c) === 0) },
    { text: 'Test-trip the overload relay F1 — KM1 drops out and the OVERLOAD lamp lights', check: (c) => { const ok = !!(c.dev('f1') && c.dev('f1').state.tripped && c.rt('km1') && !c.rt('km1').closed && c.rt('lfault') && c.rt('lfault').on); if (ok) c.memo.tripped = true; return ok; } },
    { text: 'Reset F1 and start again', check: (c) => !!(c.memo.tripped && c.dev('f1') && !c.dev('f1').state.tripped && c.rt('km1') && c.rt('km1').closed) },
    { text: 'Hold KM1 in by hand (Operate mode) with the PLC stopped — watch X3 in Monitor', hint: 'Shows why the PLC checks the auxiliary contact 13–14', check: (c) => !!(c.rt('km1') && c.rt('km1').pressed && c.cpu && c.cpu.X[3]) },
  ],
  'vfd-modbus-hmi': [
    { text: 'Start the motor from the HMI touch screen (or the START button)', check: (c) => Math.abs(hz(c)) > 1 },
    { text: 'Set the speed to 45 Hz on the HMI keypad', check: (c) => near(Math.abs(hz(c)), 45) },
    { text: 'Find the “Write 2001H” frames in Monitor → Comm log', check: (c) => c.lab.tab === 'monitor' && c.lab.views.monitor.sub === 'log' && Math.abs(hz(c)) > 1 },
    { text: 'Press the E-STOP — the drive ramps down', check: (c) => !!(c.dev('es') && c.dev('es').state.pressed && c.vfd && c.vfd.powered && hz(c) === 0) },
    { text: 'Break the link: set VFD Pr.09-04 to 1 (7N2 ASCII) — the FAULT lamp lights', hint: 'Release the E-STOP first; put 14 back afterwards', check: (c) => !!(c.vfd && c.vfd.params['09-04'] !== 14 && c.cpu && c.cpu.M[1129] && c.rt('lflt') && c.rt('lflt').on) },
    { text: 'Swap two motor wires (e.g. V ↔ W) and run — the motor turns the other way', check: (c) => !!(c.motor && c.motor.rpm < -50 && hz(c) > 1) },
  ],
  'plc-master-slave': [
    { text: 'Simulate and press START on the master — the slave turns the CONVEYOR on', check: (c) => !!(c.rt('lconv') && c.rt('lconv').on) },
    { text: 'Tap the PART sensor 5 times — the master reads the slave\'s count and lights BATCH OK', check: (c) => { const ok = !!(c.rt('lfull') && c.rt('lfull').on && c.rt('plc') && c.rt('plc').cpu.D[10] >= 5); if (ok) c.memo.full = true; return ok; } },
    { text: 'Press RESET — the master writes D101 = 1 and the slave clears its counter', check: (c) => !!(c.memo.full && c.rt('plc2') && c.rt('plc2').cpu.CV[0] === 0) },
    { text: 'Find the “Write D100…” and “Read C0” frames in Monitor → Comm log', check: (c) => c.lab.tab === 'monitor' && c.lab.views.monitor.sub === 'log' && !!(c.cpu && c.cpu.running) },
    { text: 'Tap the PLC chip at the top and open PLC 2 · Slave in the Ladder tab', check: (c) => c.P.activePlc === 'plc2' && c.lab.tab === 'ladder' },
  ],
  'modbus-network': [
    { text: 'Simulate and open the Network view (the Network chip in the Lab tab): find stations 1–4 on the RS-485 line', check: (c) => !!(c.cpu && c.cpu.running && c.lab.views.panel.netView) },
    { text: 'Press START: the conveyor waits for the oven (OVEN READY), then runs at 30 Hz', check: (c) => !!(c.cpu && c.cpu.M[1] && near(hz(c), 30, 0.3)) },
    { text: 'Set the oven to 180 °C on the HMI — the PLC writes SV (1001H) to the DTB4848', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.sv === 180) },
    { text: 'Tap the T/H sensor and make the cabinet 42 °C — the ALARM lamp flashes', check: (c) => { const ok = !!(c.cpu && c.cpu.D[50] > 400 && c.cpu.M[3]); if (ok) c.memo.hot = true; return ok; } },
    { text: 'Give the T/H sensor station 1 in its settings: two slaves answer and their replies collide', hint: 'Lab check (⚠) explains it. Put it back to 3 afterwards', check: (c) => !!(c.dev('th') && +c.dev('th').props.station === 1 && c.sys && c.sys.issues.some((i) => /station 1 is used by/.test(i.text))) },
    { text: 'Open Monitor → Network and find the DTB4848 register map (PV 1000H, SV 1001H)', check: (c) => c.lab.tab === 'monitor' && c.lab.views.monitor.sub === 'network' },
  ],
  'modbus-th-fan': [
    { text: 'Simulate — the sensor\'s temperature and humidity arrive in D50 / D51 (Monitor → Devices)', check: (c) => !!(c.cpu && c.cpu.D[50] > 0 && c.cpu.D[51] > 0 && !c.cpu.M[1129]) },
    { text: 'Tap the T/H sensor in 3D and make the room warmer than 30 °C — the fan starts', check: (c) => { const ok = !!(c.cpu && c.cpu.M[0] && c.cpu.D[50] > 300); if (ok) c.memo.fan = true; return ok; } },
    { text: 'Set FAN ON ABOVE to 20.0 °C on the HMI keypad', check: (c) => !!(c.cpu && c.cpu.D[60] > 0 && c.cpu.D[60] < 300) },
    { text: 'Raise the humidity above 70 %RH — the HUMID lamp lights', check: (c) => !!(c.rt('lhum') && c.rt('lhum').on) },
    { text: 'Delete the sensor\'s V− wire (Wire mode, tap the cable) — COMM FAIL flashes', hint: 'M1129 is the COM2 time-out relay; the lamp flashes with M1013', check: (c) => !!(c.cpu && c.cpu.M[1129]) },
    { text: 'Open Monitor → Comm log and find the “Read Temp, RH (0000H ×2)” frames', check: (c) => c.lab.tab === 'monitor' && c.lab.views.monitor.sub === 'log' && !!(c.cpu && c.cpu.running) },
  ],
  'modbus-energy-vfd': [
    { text: 'Simulate — the meter answers: D60 shows about 230 V (2300)', check: (c) => !!(c.cpu && c.cpu.D[60] > 2000 && !c.cpu.M[1129]) },
    { text: 'Press START (button or HMI) — the drive runs at 30 Hz', check: (c) => near(hz(c), 30, 0.3) },
    { text: 'Set the speed to 45 Hz on the HMI keypad', check: (c) => near(hz(c), 45, 0.3) },
    { text: 'Watch the power go up while the motor runs (D62 above 300 W)', check: (c) => !!(c.cpu && c.cpu.D[62] > 300) },
    { text: 'Open Monitor → Network and find the energy meter\'s registers (0000H … 0006H)', check: (c) => c.lab.tab === 'monitor' && c.lab.views.monitor.sub === 'network' },
    { text: 'Give the meter station 1 (the drive\'s address): the replies collide and COMM FAIL flashes', hint: 'Put it back to 2 afterwards', check: (c) => !!(c.dev('em') && +c.dev('em').props.station === 1 && c.cpu && c.cpu.M[1129]) },
  ],
  'modbus-function-codes': [
    { text: 'Simulate — D0 / D1 show PV and SV of the controller (FC03, 1000H)', check: (c) => !!(c.cpu && c.cpu.D[0] > 0 && c.cpu.D[1] > 0) },
    { text: 'Type SV 180 °C and hold WRITE SV (FC06) — the controller\'s SV becomes 180', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.sv === 180) },
    { text: 'Set UPPER 200 and LOWER 50 and hold LIMITS (FC16) — one request writes both registers', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.hi === 200 && c.dev('dtb').state.lo === 50) },
    { text: 'Hold STOP (FC05, coil 0814H) — the controller shows StoP and the RUN lamp goes out', check: (c) => { const ok = !!(c.dev('dtb') && c.dev('dtb').state.run === false && c.cpu && c.cpu.D[45] === 0); if (ok) c.memo.stopped = true; return ok; } },
    { text: 'Hold RUN (FC05) — the lamp lights again (FC01 reads the coil back)', check: (c) => !!(c.memo.stopped && c.dev('dtb') && c.dev('dtb').state.run && c.cpu && c.cpu.D[45] === 1) },
    { text: 'Find the FC 01, 03, 05, 06 and 16 frames in Monitor → Comm log', check: (c) => c.lab.tab === 'monitor' && c.lab.views.monitor.sub === 'log' && !!(c.cpu && c.cpu.running) },
  ],
  'pid-oven-recipes': [
    { text: 'Press START — the belt waits until the oven is stable (OVEN STABLE), then runs at 30 Hz', check: (c) => !!(c.cpu && c.cpu.M[1] && near(hz(c), 30, 0.3)) },
    { text: 'On the HMI open RECIPES and load DRY — the PLC writes SV 80 °C and the belt speed 20 Hz', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.sv === 80 && c.cpu && c.cpu.D[10] === 2000) },
    { text: 'Wait until the oven has settled at 80 °C: the belt runs at 20 Hz', check: (c) => !!(c.cpu && c.cpu.M[1] && near(hz(c), 20, 0.3)) },
    { text: 'Open the HMI Line screen and watch PV, SV and the heater output (trend)', check: (c) => c.lab.tab === 'hmi' && !!(c.cpu && c.cpu.running) },
    { text: 'Tap the DTB4848 in 3D and press Auto-tune — the controller finds new PB / Ti / Td', hint: 'Needs PID mode and RUN. The AT lamp blinks for 12 s', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.pb !== 8) },
    { text: 'Switch OVEN RUN off on the HMI — the controller shows StoP', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.run === false) },
  ],
  'pid-tuning-lab': [
    { text: 'Simulate and watch the PV climb to the SV of 120 °C without a big overshoot', check: (c) => !!(c.cpu && c.cpu.D[30] >= 1190 && c.cpu.D[30] <= 1215) },
    { text: 'Set SV to 150 °C on the HMI keypad', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.sv === 150) },
    { text: 'Press AUTO-TUNE (FC05, coil 0813H) — the lamp lights for 12 s, then PB / Ti / Td change', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.pb !== 8) },
    { text: 'Type PB = 3.0, Ti = 0, Td = 0 and hold APPLY (FC16) — a P-only controller keeps a steady offset', hint: 'Without the integral action the PV stays below the SV', check: (c) => { const s = c.dev('dtb') && c.dev('dtb').state; return !!(s && s.pb === 3 && s.ti === 0 && s.td === 0); } },
    { text: 'Choose ON/OFF (1005H = 1) — the PV now swings around the SV', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.mode === 1) },
    { text: 'Choose MANUAL and type an output of 30 % (1012H) — the heater output stays at 30 %', check: (c) => !!(c.dev('dtb') && c.dev('dtb').state.mode === 2 && c.cpu && c.cpu.D[34] === 300) },
  ],
  'analog-speed': [
    { text: 'Press START and turn the SPEED pot to 80 % — the drive runs at 40 Hz', check: (c) => near(hz(c), 40, 0.6) },
    { text: 'Watch D1110 (AI CH0) in Monitor → Devices', check: (c) => c.lab.tab === 'monitor' && !!(c.cpu && c.cpu.running) },
    { text: 'Limit the speed to half: replace MOV with DIV D1110 K2 D1116 and Download', check: (c) => has(c, '"DIV"') && has(c, '"D1116"') },
  ],
  'blank': [
    { text: 'Add a push button and a pilot lamp with ＋ in the 3D lab', check: (c) => c.P.devices.some((d) => d.type === 'pb') && c.P.devices.some((d) => d.type === 'lamp') },
    { text: 'Wire the button: PSU +V → button 13, button 14 → PLC X0', check: (c) => wired(c, 'pb', ['13', '14'], 'X0') },
    { text: 'Wire the lamp: PLC C0 → PSU +V, Y0 → lamp X1, lamp X2 → PSU −V', check: (c) => wired(c, 'lamp', ['X1', 'X2'], 'Y0') },
    { text: 'Write the ladder X0 → OUT Y0, Download and RUN', check: (c) => has(c, '"X0"') && has(c, '"Y0"') && !!(c.cpu && c.cpu.running) },
    { text: 'Press the button in Operate mode — the lamp lights', check: (c) => !!(c.sys && c.sys.byKind('lamp').some((l) => l.on)) },
  ],
};

function wired(c, type, ports, plcPort) {
  const plc = c.P.devices.find((d) => /^dvp-/.test(d.type));
  if (!plc) return false;
  for (const d of c.P.devices.filter((x) => x.type === type)) {
    for (const cn of c.P.conns) {
      const a = cn.a, b = cn.b;
      if ((a.dev === d.id && ports.includes(a.port) && b.dev === plc.id && b.port === plcPort) || (b.dev === d.id && ports.includes(b.port) && a.dev === plc.id && a.port === plcPort)) return true;
    }
  }
  return false;
}
