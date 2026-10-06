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
    { text: 'Turn SPEED to HIGH — 45 Hz (multi-step 2)', check: (c) => near(hz(c), 45) },
    { text: 'Press STOP, then REV — the motor turns backwards', check: (c) => hz(c) < -1 },
    { text: 'Change Pr.04-00 (step 1) to 20 Hz in the VFD tab or with the keypad', check: (c) => !!(c.vfd && c.vfd.params['04-00'] === 20) },
    { text: 'Make it trip: set Pr.01-12 to 0.10 s and start — fault ocA', hint: 'Then press STOP/RESET and set the time back', check: (c) => !!(c.vfd && c.vfd.fault === 'ocA') },
  ],
  'vfd-modbus-hmi': [
    { text: 'Start the motor from the HMI touch screen (or the START button)', check: (c) => Math.abs(hz(c)) > 1 },
    { text: 'Set the speed to 45 Hz on the HMI keypad', check: (c) => near(Math.abs(hz(c)), 45) },
    { text: 'Find the “Write 2001H” frames in Monitor → Comm log', check: (c) => c.lab.tab === 'monitor' && c.lab.views.monitor.sub === 'log' && Math.abs(hz(c)) > 1 },
    { text: 'Press the E-STOP — the drive ramps down', check: (c) => !!(c.dev('es') && c.dev('es').state.pressed && c.vfd && c.vfd.powered && hz(c) === 0) },
    { text: 'Break the link: set VFD Pr.09-04 to 1 (7N2 ASCII) — the FAULT lamp lights', hint: 'Release the E-STOP first; put 14 back afterwards', check: (c) => !!(c.vfd && c.vfd.params['09-04'] !== 14 && c.cpu && c.cpu.M[1129] && c.rt('lflt') && c.rt('lflt').on) },
    { text: 'Swap two motor wires (e.g. V ↔ W) and run — the motor turns the other way', check: (c) => !!(c.motor && c.motor.rpm < -50 && hz(c) > 1) },
  ],
  'analog-speed': [
    { text: 'Press START and turn the SPEED pot to 80 % — the drive runs at 40 Hz', check: (c) => near(hz(c), 40, 0.6) },
    { text: 'Watch D1110 (AI CH0) in Monitor → Devices', check: (c) => c.lab.tab === 'monitor' && !!(c.cpu && c.cpu.running) },
    { text: 'Limit the speed to half: replace MOV with DIV D1110 K2 D1116 and Download', check: (c) => has(c, '"DIV"') && has(c, '"D1116"') },
  ],
  'star-delta': [
    { text: 'Press START — K1 (main) and K2 (star) close', check: (c) => { const ok = !!(c.rt('k1') && c.rt('k1').on && c.rt('k2') && c.rt('k2').on && !c.rt('k3').on); if (ok) c.memo.star = true; return !!c.memo.star; } },
    { text: 'After 5 s the star contactor opens and, half a second later, the delta contactor K3 closes', check: (c) => { const ok = !!(c.memo.star && c.rt('k1').on && c.rt('k3').on && !c.rt('k2').on); if (ok) c.memo.delta = true; return !!c.memo.delta; } },
    { text: 'Press STOP — all three contactors drop out', check: (c) => !!(c.memo.delta && !c.rt('k1').on && !c.rt('k2').on && !c.rt('k3').on) },
    { text: 'Change the star time to 8 s (TMR T0 K80) and Download', check: (c) => has(c, '"K80"') },
  ],
  'bottle-filling': [
    { text: 'Press START and tap the bottle sensor once: after 1 s the FILL VALVE opens', check: (c) => { const ok = !!(c.rt('valve') && c.rt('valve').on); if (ok) c.memo.fill = true; return !!c.memo.fill; } },
    { text: 'Fill 5 bottles (tap the sensor on and off for each) — BATCH DONE lights and the horn beeps', check: (c) => { const ok = !!(c.cpu && c.cpu.C[0] && c.rt('done') && c.rt('done').on); if (ok) c.memo.done = true; return !!c.memo.done; } },
    { text: 'Press NEW BATCH — the counter returns to 0', check: (c) => !!(c.memo.done && c.cpu && c.cpu.CV[0] === 0) },
    { text: 'Make a batch 3 bottles (CNT C0 K3) and Download', check: (c) => has(c, '"K3"') },
  ],
  'tank-level': [
    { text: 'Simulate in AUTO and watch the HMI: when the level falls below 20 % the pump starts by itself', check: (c) => { const ok = !!(c.cpu && c.cpu.running && c.cpu.Y[0] && c.cpu.D[10] < 80 && c.dev('mode') && c.dev('mode').state.on); if (ok) c.memo.auto = true; return !!c.memo.auto; } },
    { text: 'Hold the DRAIN button until the LOW lamp lights', check: (c) => !!(c.rt('low') && c.rt('low').on) },
    { text: 'Switch MODE to MANUAL and run the pump with the PUMP button', check: (c) => !!(c.dev('mode') && !c.dev('mode').state.on && c.cpu && c.cpu.Y[0]) },
    { text: 'Fill the tank until the HIGH lamp lights', check: (c) => !!(c.rt('high') && c.rt('high').on) },
    { text: 'Raise the pump-off level to 90 % (D10>=K90) and Download', check: (c) => has(c, '"K90"') },
  ],
  'alarm-annunciator': [
    { text: 'Switch TEMP HIGH to ALARM — its lamp flashes and the horn sounds', check: (c) => { const ok = !!(c.cpu && c.cpu.X[0] && c.rt('horn') && c.rt('horn').on && !c.cpu.M[10]); if (ok) c.memo.alarm = true; return !!c.memo.alarm; } },
    { text: 'Press ACK — the lamp turns steady and the horn is silent', check: (c) => { const ok = !!(c.memo.alarm && c.cpu && c.cpu.M[10] && c.rt('l1').on && !c.rt('horn').on); if (ok) c.memo.acked = true; return !!c.memo.acked; } },
    { text: 'Set the alarm back to OK — the lamp goes out', check: (c) => !!(c.memo.acked && c.cpu && !c.cpu.X[0] && !c.rt('l1').on) },
    { text: 'Raise two alarms at once and acknowledge them together', check: (c) => !!(c.cpu && c.cpu.M[10] && c.cpu.M[11] && c.cpu.X[0] && c.cpu.X[1]) },
  ],
  'step-lights': [
    { text: 'Simulate and press START — the lamps chase 1 → 2 → 3', check: (c) => { const on = (id) => !!(c.rt(id) && c.rt(id).on); if (on('l1')) c.memo.a = true; if (on('l2')) c.memo.b = true; if (on('l3')) c.memo.c = true; return !!(c.memo.a && c.memo.b && c.memo.c); } },
    { text: 'After step 3 the sequence returns to the idle step S0 by itself', check: (c) => !!(c.memo.c && c.cpu && c.cpu.S[0] && !c.cpu.Y[2]) },
    { text: 'Start again and press STOP during a step — back to idle', check: (c) => { if (c.cpu && c.cpu.S[20] && c.dev('stop') && c.dev('stop').state.pressed) c.memo.cut = true; return !!(c.memo.cut && c.cpu && c.cpu.S[0]); } },
    { text: 'Make every step last 3 s (K30) and Download', check: (c) => has(c, '"K30"') },
  ],
  'vfd-auto-cycle': [
    { text: 'Press START — the drive runs the first step at 10 Hz', check: (c) => near(hz(c), 10) },
    { text: 'Wait for the second (30 Hz) and the third step (50 Hz)', check: (c) => { if (near(hz(c), 30)) c.memo.b = true; if (near(hz(c), 50)) c.memo.c = true; return !!(c.memo.b && c.memo.c); } },
    { text: 'After the third step the drive stops by itself', check: (c) => !!(c.memo.c && hz(c) === 0 && c.cpu && c.cpu.S[0]) },
    { text: 'Change Pr.04-02 (step 3) to 40 Hz and run the cycle again', check: (c) => !!(c.vfd && c.vfd.params['04-02'] === 40) },
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
