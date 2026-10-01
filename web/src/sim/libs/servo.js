// Servo library (also used for ESP32Servo).
import { addLibrary, defineClass, clamp } from './registry.js';

class Servo {
  constructor(rt, hw) {
    this.rt = rt; this.hw = hw;
    this.pin = -1; this.us = 1500; this.min = 544; this.max = 2400;
  }
  attach(pin, min = 544, max = 2400) {
    this.pin = pin; this.min = min; this.max = max;
    this.hw.setServo(pin, this.us);
    return 1;
  }
  write(v) {
    if (v < this.min) {
      v = clamp(v, 0, 180);
      this.us = Math.round(this.min + (v * (this.max - this.min)) / 180);
    } else this.us = v;
    if (this.pin >= 0) this.hw.setServo(this.pin, this.us);
  }
  writeMicroseconds(us) { this.us = us; if (this.pin >= 0) this.hw.setServo(this.pin, us); }
  read() { return Math.round(((this.us - this.min) * 180) / (this.max - this.min)); }
  readMicroseconds() { return this.us; }
  attached() { return this.pin >= 0 ? 1 : 0; }
  detach() { if (this.pin >= 0) this.hw.setServo(this.pin, null); this.pin = -1; }
  setPeriodHertz() {}
}

addLibrary((natives, rt, hw) => {
  defineClass(natives, 'Servo', {
    create: (r) => new Servo(r, hw),
    methods: {
      attach: { ret: 'u8' }, write: { ret: 'void' }, writeMicroseconds: { ret: 'void' }, read: { ret: 'int' },
      readMicroseconds: { ret: 'int' }, attached: { ret: 'bool' }, detach: { ret: 'void' }, setPeriodHertz: { ret: 'void' },
    },
  });
  natives.constants.MIN_PULSE_WIDTH = 544;
  natives.constants.MAX_PULSE_WIDTH = 2400;
  natives.constants.DEFAULT_PULSE_WIDTH = 1500;
});
