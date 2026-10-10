// Electrical behaviour of the parts that can be wired to the virtual Raspberry Pi / Pico header.
// Each part instance: { id, type, pins: { key: gpio }, props: {}, state: {} }.
// drive(part, pin, now, gpio) returns the level a part forces onto an input pin (0 / 1) or null.

const SPEED_OF_SOUND = 343; // m/s

export const PART_SIM = {
  led: {},
  rgb: {},
  buzzer: {},
  relay: {},
  servo: {},
  motor: {},
  neopixel: {},
  lcd: {},
  button: {
    drive(p, n) {
      if (n !== p.pins.a || !p.state.pressed) return null;
      return p.props.to === '3v3' ? 1 : 0;
    },
  },
  switch: {
    drive(p, n) {
      if (n !== p.pins.a) return null;
      if (!p.state.on) return null;
      return p.props.to === '3v3' ? 1 : 0;
    },
  },
  pir: {
    drive(p, n, now) {
      if (n !== p.pins.out) return null;
      return now < (p.state.until || 0) ? 1 : 0;
    },
  },
  ultrasonic: {
    // the echo pin goes high ~0.4 ms after the trigger pulse ends, for the time sound needs to
    // travel to the object and back (58 µs per cm)
    onWrite(p, n, v, gpio, now) {
      if (n === p.pins.trig) {
        if (v) p.state.trigHigh = now;
        else if (p.state.trigHigh != null) { p.state.tFall = now; p.state.trigHigh = null; gpio.quietUntil(now + 0.4 + echoMs(p) + 6); }
      }
    },
    drive(p, n, now) {
      if (n !== p.pins.echo) return null;
      const t = p.state.tFall;
      if (t == null) return 0;
      const dt = now - t;
      return dt >= 0.4 && dt < 0.4 + echoMs(p) ? 1 : 0;
    },
  },
  pot: {},
  ldr: {
    drive(p, n) {
      if (n !== p.pins.a) return null;
      return (p.props.light ?? 0.6) >= 0.5 ? 0 : 1; // module DO: LOW when it is bright
    },
  },
  dht: {
    drive(p, n) { return n === p.pins.data ? 1 : null; },
  },
};

export function echoMs(p) {
  const cm = Math.max(2, Math.min(400, p.props.cm ?? 50));
  return (cm / 100) * 2 / SPEED_OF_SOUND * 1000;
}
