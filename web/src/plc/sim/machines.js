// Process models on the bench: the belt conveyor (boxes, four sensors, the reject pusher), the
// water tank (pump, drain valve, hand valve, floats, level transmitter) and the pneumatic cylinder
// with its 5/2 valve and reed sensors. system.js does the wiring (which coil has 24 V, what a
// sensor output drives); these functions move the boxes, the water and the piston.

/** Conveyor geometry (mm along the belt, 0 = feeder end) and where its sensors and pusher sit. */
export const CONV = {
  L: 700, box: 60, gap: 96, speed: 250, // belt speed at the gear motor's rated speed (mm/s)
  at: { S1: 0.1, S2: 0.4, S3: 0.6, S4: 0.94, push: 0.64 },
  pushOut: 0.18, pushBack: 0.3, // pusher stroke time out / back (s)
};

let boxSeq = 1;

/** Put a box on the belt at the feeder (when there is room). Returns true when one was placed. */
export function feedBox(dev, props) {
  const s = dev.state;
  s.boxes = s.boxes || [];
  if (s.boxes.some((b) => b.x < CONV.gap + 4 && !b.push)) return false;
  if (s.boxes.length >= 9) return false;
  const mix = props.mix || 'mixed';
  s.fed = (s.fed || 0) + 1;
  const metal = mix === 'metal' ? 1 : mix === 'plastic' ? 0 : (s.fed % 3 === 1 ? 1 : 0) ^ (s.fed % 7 === 0 ? 1 : 0);
  s.boxes.push({ id: boxSeq++, x: 4, m: metal, push: 0 });
  return true;
}

/** Which conveyor sensors see a box now: {S1, S2, S3, S4}. S2 is inductive: metal only. */
export function conveyorSensors(dev) {
  const out = { S1: 0, S2: 0, S3: 0, S4: 0 };
  for (const b of dev.state.boxes || []) {
    if (b.push > 0.45) continue;
    for (const k of ['S1', 'S3', 'S4']) if (Math.abs(b.x - CONV.at[k] * CONV.L) < CONV.box / 2) out[k] = 1;
    if (b.m && Math.abs(b.x - CONV.at.S2 * CONV.L) < CONV.box / 2 - 8) out.S2 = 1;
  }
  return out;
}

/**
 * Move the belt: rt.belt = belt speed (mm/s, from the gear motor), rt.coil = pusher solenoid.
 * Returns events ('done' / 'reject') for the counters.
 */
export function stepConveyor(rt, props, dt) {
  const s = rt.dev.state;
  s.boxes = s.boxes || [];
  // automatic feeder
  const every = props.feed === 'fast' ? 2 : props.feed === 'slow' ? 4 : 0;
  if (every) {
    rt.feedT = (rt.feedT ?? 0.5) - dt;
    if (rt.feedT <= 0) { if (feedBox(rt.dev, props) || rt.feedT < -every) rt.feedT = every; }
  }
  // the pusher (pneumatic, single solenoid with spring return)
  const target = rt.coil ? 1 : 0;
  const k = rt.coil ? dt / CONV.pushOut : dt / CONV.pushBack;
  rt.push = rt.push === undefined ? 0 : target > rt.push ? Math.min(1, rt.push + k) : Math.max(0, rt.push - k);
  const px = CONV.at.push * CONV.L;
  const v = rt.belt || 0;
  const done = [];
  // boxes ride the belt together; one being pushed off slides sideways
  for (const b of s.boxes) {
    if (b.push > 0) { b.push = Math.min(1, b.push + dt / 0.22); continue; }
    b.x += v * dt;
    if (b.x < 0) b.x = 0;
    if (rt.push > 0.25 && Math.abs(b.x - px) < CONV.box / 2 + 6) b.push = 0.01;
  }
  for (let i = s.boxes.length - 1; i >= 0; i--) {
    const b = s.boxes[i];
    if (b.push >= 1) { s.boxes.splice(i, 1); s.rejected = (s.rejected || 0) + 1; done.push({ kind: 'reject', m: b.m }); continue; }
    if (b.x > CONV.L + CONV.box / 2) { s.boxes.splice(i, 1); s.done = (s.done || 0) + 1; done.push({ kind: 'done', m: b.m }); }
  }
  return done;
}

// ---------------------------------------------------------------- water tank
/** Tank: level in mm (0 … 360). 1 L ≈ 33 mm (200 × 150 mm). */
export const TANK = { H: 360, low: 60, high: 300, over: 350, area: 30000, pump: 200, drain: 250, hand: 120 };

/**
 * Fill / drain the tank. rt.pump = 0 … 1 (pump speed), rt.valve = drain valve open, state.demand =
 * hand valve 0 … 1. Flows in mL/s; returns true when it overflows.
 */
export function stepTank(rt, dt) {
  const s = rt.dev.state;
  let h = Math.max(0, Math.min(TANK.H, s.level ?? 0));
  const head = Math.sqrt(h / TANK.H);
  const qIn = TANK.pump * (rt.pump || 0);
  const qOut = (rt.valve ? TANK.drain * head : 0) + TANK.hand * (s.demand || 0) * head;
  rt.qIn = qIn; rt.qOut = qOut;
  h += ((qIn - qOut) * 1000 / TANK.area) * dt; // mL/s → mm³/s → mm/s
  const over = h >= TANK.over;
  s.level = Math.max(0, Math.min(TANK.over, h));
  return over && (rt.qIn > 0);
}

// ---------------------------------------------------------------- pneumatic cylinder
export const CYL_TIME = { slow: 1.5, normal: 0.8, fast: 0.4 };

/** Move the piston: rt.y1 / rt.y2 = solenoids, props.valve single | double. state.pos 0 … 1. */
export function stepCylinder(rt, props, dt) {
  const s = rt.dev.state;
  if (props.valve === 'double') {
    if (rt.y1 && !rt.y2) rt.spool = 1;
    else if (rt.y2 && !rt.y1) rt.spool = 0;
    else if (rt.spool === undefined) rt.spool = s.pos > 0.5 ? 1 : 0;
  } else rt.spool = rt.y1 ? 1 : 0;
  const t = CYL_TIME[props.speed] || CYL_TIME.normal;
  const pos = s.pos ?? 0;
  const step = dt / t;
  s.pos = rt.spool ? Math.min(1, pos + step) : Math.max(0, pos - step);
  rt.moving = s.pos !== pos;
  return s.pos;
}
