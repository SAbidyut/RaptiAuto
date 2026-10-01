// Stepper and AccelStepper libraries (drive pins exactly like the real libraries).
import { addLibrary, defineClass } from './registry.js';

class Stepper {
  constructor(rt, hw, [steps, p1, p2, p3, p4]) {
    this.rt = rt; this.hw = hw;
    this.steps = steps;
    this.pins = p3 === undefined ? [p1, p2] : [p1, p2, p3, p4];
    this.n = 0;
    this.delay = 0;
    for (const p of this.pins) hw.pinMode(p, 1);
  }
  setSpeed(rpm) { this.delay = rpm > 0 ? (60 * 1000 * 1000) / this.steps / rpm : 0; }
  stepMotor(k) {
    const hw = this.hw;
    if (this.pins.length === 2) {
      const seq = [[0, 1], [1, 1], [1, 0], [0, 0]][k % 4];
      hw.digitalWrite(this.pins[0], seq[0]); hw.digitalWrite(this.pins[1], seq[1]);
      return;
    }
    const seq = [[1, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 1], [1, 0, 0, 1]][k % 4];
    for (let i = 0; i < 4; i++) hw.digitalWrite(this.pins[i], seq[i]);
  }
  * step(n) {
    const dir = n > 0 ? 1 : -1;
    let left = Math.abs(n);
    while (left > 0) {
      if (this.delay) yield* this.rt.waitUntil(this.rt.t + this.delay);
      this.n += dir;
      if (this.n >= this.steps) this.n = 0;
      if (this.n < 0) this.n = this.steps - 1;
      left--;
      this.stepMotor(((this.n % 4) + 4) % 4);
      this.rt.t += 20;
    }
  }
  version() { return 5; }
}

class AccelStepper {
  constructor(rt, hw, args) {
    this.rt = rt; this.hw = hw;
    const [iface = 4, p1 = 2, p2 = 3, p3 = 4, p4 = 5, enable = 1] = args;
    this.iface = iface;
    this.pins = [p1, p2, p3, p4];
    this.pos = 0; this.target = 0; this.speed = 0; this.maxSpeed = 1; this.accel = 0;
    this.stepInterval = 0; this.lastStep = 0; this.n = 0; this.c0 = 0; this.cn = 0; this.cmin = 1; this.dir = 0;
    this.inverted = [0, 0, 0, 0];
    const count = { 1: 2, 2: 2, 3: 3, 4: 4, 6: 3, 8: 4 }[iface] || 4;
    this.npins = count;
    if (enable) for (let i = 0; i < count; i++) hw.pinMode(this.pins[i], 1);
    this.setAcceleration(1);
    this.setMaxSpeed(1);
  }
  micros() { return Math.floor(this.rt.t); }
  moveTo(a) { if (this.target !== a) { this.target = a; this.computeNewSpeed(); } }
  move(r) { this.moveTo(this.pos + r); }
  distanceToGo() { return this.target - this.pos; }
  targetPosition() { return this.target; }
  currentPosition() { return this.pos; }
  setCurrentPosition(p) { this.target = this.pos = p; this.n = 0; this.stepInterval = 0; this.speed = 0; }
  setMaxSpeed(s) {
    if (s < 0) s = -s;
    if (this.maxSpeed !== s) {
      this.maxSpeed = s;
      this.cmin = 1e6 / s;
      if (this.n > 0) { this.n = Math.floor((this.speed * this.speed) / (2 * this.accel)); this.computeNewSpeed(); }
    }
  }
  maxSpeedGet() { return this.maxSpeed; }
  setAcceleration(a) {
    if (a === 0) return;
    if (a < 0) a = -a;
    if (this.accel !== a) {
      this.n = this.n * (this.accel / a);
      this.c0 = 0.676 * Math.sqrt(2 / a) * 1e6;
      this.accel = a;
      this.computeNewSpeed();
    }
  }
  setSpeed(s) {
    if (s === this.speed) return;
    s = Math.max(-this.maxSpeed, Math.min(this.maxSpeed, s));
    if (s === 0) this.stepInterval = 0;
    else { this.stepInterval = Math.abs(1e6 / s); this.dir = s > 0 ? 1 : 0; }
    this.speed = s;
  }
  speedGet() { return this.speed; }
  computeNewSpeed() {
    const d = this.distanceToGo();
    const toStop = Math.floor((this.speed * this.speed) / (2 * this.accel));
    if (d === 0 && toStop <= 1) { this.stepInterval = 0; this.speed = 0; this.n = 0; return; }
    if (d > 0) {
      if (this.n > 0) { if (toStop >= d || this.dir === 0) this.n = -toStop; }
      else if (this.n < 0) { if (toStop < d && this.dir === 1) this.n = -this.n; }
    } else if (d < 0) {
      if (this.n > 0) { if (toStop >= -d || this.dir === 1) this.n = -toStop; }
      else if (this.n < 0) { if (toStop < -d && this.dir === 0) this.n = -this.n; }
    }
    if (this.n === 0) { this.cn = this.c0; this.dir = d > 0 ? 1 : 0; }
    else { this.cn = this.cn - (2 * this.cn) / (4 * this.n + 1); this.cn = Math.max(this.cn, this.cmin); }
    this.n++;
    this.stepInterval = this.cn;
    this.speed = 1e6 / this.cn;
    if (this.dir === 0) this.speed = -this.speed;
  }
  runSpeed() {
    if (!this.stepInterval) return 0;
    const t = this.micros();
    if (t - this.lastStep >= this.stepInterval) {
      this.pos += this.dir === 1 ? 1 : -1;
      this.doStep(this.pos);
      this.lastStep = t;
      return 1;
    }
    return 0;
  }
  run() {
    this.rt.t += 4;
    if (this.runSpeed()) this.computeNewSpeed();
    return this.speed !== 0 || this.distanceToGo() !== 0 ? 1 : 0;
  }
  * runToPosition() {
    while (this.run()) {
      const next = this.lastStep + this.stepInterval;
      if (this.stepInterval && next > this.rt.t) yield* this.rt.waitUntil(next);
    }
  }
  * runToNewPosition(p) { this.moveTo(p); yield* this.runToPosition(); }
  runSpeedToPosition() {
    if (this.target === this.pos) return 0;
    if (this.target > this.pos) this.dir = 1; else this.dir = 0;
    return this.runSpeed();
  }
  stop() {
    if (this.speed !== 0) {
      const s = Math.floor((this.speed * this.speed) / (2 * this.accel)) + 1;
      this.move(this.speed > 0 ? s : -s);
    }
  }
  isRunning() { return !(this.speed === 0 && this.target === this.pos) ? 1 : 0; }
  setPinsInverted(d = 0, s = 0, e = 0) { this.inverted = [d, s, 0, 0]; void e; }
  disableOutputs() { for (let i = 0; i < this.npins; i++) this.hw.digitalWrite(this.pins[i], 0); }
  enableOutputs() { for (let i = 0; i < this.npins; i++) this.hw.pinMode(this.pins[i], 1); }
  setMinPulseWidth() {}
  setEnablePin() {}
  out(mask) { for (let i = 0; i < this.npins; i++) this.hw.digitalWrite(this.pins[i], ((mask >> i) & 1) ^ (this.inverted[i] ? 1 : 0)); }
  doStep(step) {
    const hw = this.hw;
    switch (this.iface) {
      case 1: // DRIVER: pins = step, dir
        hw.digitalWrite(this.pins[1], this.dir ^ this.inverted[0]);
        hw.digitalWrite(this.pins[0], 1 ^ this.inverted[1]);
        this.rt.t += 2;
        hw.digitalWrite(this.pins[0], 0 ^ this.inverted[1]);
        break;
      case 2: this.out([0b10, 0b11, 0b01, 0b00][step & 3]); break;
      case 4: this.out([0b0101, 0b0110, 0b1010, 0b1001][step & 3]); break;
      case 8: this.out([0b0001, 0b0101, 0b0100, 0b0110, 0b0010, 0b1010, 0b1000, 0b1001][step & 7]); break;
      case 3: this.out([0b100, 0b001, 0b010][((step % 3) + 3) % 3]); break;
      case 6: this.out([0b100, 0b101, 0b001, 0b011, 0b010, 0b110][((step % 6) + 6) % 6]); break;
      default:
    }
  }
}

addLibrary((natives, rt, hw) => {
  defineClass(natives, 'Stepper', {
    create: (r, args) => new Stepper(r, hw, args),
    methods: { setSpeed: { ret: 'void' }, step: { ret: 'void', gen: true }, version: { ret: 'int' } },
  });
  defineClass(natives, 'AccelStepper', {
    create: (r, args) => new AccelStepper(r, hw, args),
    methods: {
      moveTo: { ret: 'void' }, move: { ret: 'void' }, run: { ret: 'bool' }, runSpeed: { ret: 'bool' }, runToPosition: { ret: 'void', gen: true },
      runToNewPosition: { ret: 'void', gen: true }, runSpeedToPosition: { ret: 'bool' }, distanceToGo: { ret: 'long' }, targetPosition: { ret: 'long' },
      currentPosition: { ret: 'long' }, setCurrentPosition: { ret: 'void' }, setMaxSpeed: { ret: 'void' }, maxSpeed: { ret: 'float', method: 'maxSpeedGet' },
      setAcceleration: { ret: 'void' }, setSpeed: { ret: 'void' }, speed: { ret: 'float', method: 'speedGet' }, stop: { ret: 'void' },
      isRunning: { ret: 'bool' }, setPinsInverted: { ret: 'void' }, disableOutputs: { ret: 'void' }, enableOutputs: { ret: 'void' },
      setMinPulseWidth: { ret: 'void' }, setEnablePin: { ret: 'void' },
    },
    constants: { DRIVER: 1, FULL2WIRE: 2, FULL3WIRE: 3, FULL4WIRE: 4, HALF3WIRE: 6, HALF4WIRE: 8, FUNCTION: 0 },
  });
  Object.assign(natives.constants, { DRIVER: 1, FULL2WIRE: 2, FULL3WIRE: 3, FULL4WIRE: 4, HALF3WIRE: 6, HALF4WIRE: 8 });
});
