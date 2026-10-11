// Wear-and-burn model. Nothing burns because a number crossed a line for one instant: every part that
// can be damaged collects "stress" (0 = fresh, 1 = destroyed) at the rate of the time-to-failure of
// the real thing for the current it carries, so
//   • an LED at its 20–30 mA never wears out, at 60 mA (directly on an Arduino pin) it lasts ~20 s,
//     at 90 mA a few seconds, and straight across a 5 V supply it goes within milliseconds;
//   • a ¼ W resistor at twice its rating cooks in ~20 s, at four times in about a second;
//   • a microcontroller pin carrying 80 mA dies in ~10 s, one shorted to GND/5 V in a fraction of a second, a 3.3 V pin that is fed 5 V
//     (an HC-SR04 ECHO without a divider) dies a little later;
//   • a module given double its supply voltage, or the supply the wrong way round, goes in seconds.
// A part that burns stays burnt until the next run (like swapping in a new one), burns only once, makes
// a puff of smoke for a few seconds and leaves a scorch mark.

/** Stress per second of a 5 mm LED carrying i amps (30 mA = limit: time to failure 600 s). */
export function ledStress(i) { return i > 0.004 ? Math.pow(i / 0.03, 5) / 600 : 0; }

/** Stress per second of a resistor dissipating p watts (rated: its power rating). */
export function resistorStress(p, rated = 0.25) { return p > rated * 1.15 ? Math.pow(p / rated, 4) / 300 : 0; }

/** Incandescent bulb at `ratio` times its rated power (a bulb runs at 1.0 all day). */
export function bulbStress(ratio) { return ratio > 1.25 ? Math.pow(ratio, 3) / 30 : 0; }

/** Microcontroller pin driving i amps (absolute maximum lim = 40 mA per pin on an AVR). */
export function pinCurrentStress(i, lim = 0.04) { return i > lim ? Math.pow(i / lim, 5) / 300 : 0; }

/** A pin held more than `over` volts outside its supply (ESD diodes conduct); 5 V on a 3.3 V pin ≈ 1 V. */
export function pinVoltageStress(over) { return over > 0.4 ? Math.pow(over / 1.0, 2) / 25 : 0; }

/** A module whose supply is v volts although it is good for max volts (and v < −0.7 V = reversed). */
export function supplyStress(v, max) {
  if (v < -0.7) return v < -1.5 ? 3 : 0.5;
  if (v <= max * 1.12) return 0;
  return Math.pow((v / max - 1) / 0.25, 2) / 10;
}

/** A battery or supply delivering i amps (rated: its safe current). */
export function sourceStress(i, rated) { return i > rated ? Math.pow(i / rated, 2) / 20 : 0; }

export class Stress {
  constructor(cool = 0.02) { this.v = 0; this.cool = cool; }

  /** Add `rate` (per second) for dt microseconds; a part carrying nothing much cools down slowly. */
  add(rate, dtUs) {
    const dt = dtUs / 1e6;
    if (rate > 0) this.v += rate * dt;
    else if (this.v > 0) this.v = Math.max(0, this.v - this.cool * dt);
    return this.v;
  }

  get burnt() { return this.v >= 1; }
  /** 0 … 1 for visuals (a part that is about to go glows hot). */
  get level() { return Math.min(1, this.v); }
}

/** One sentence for the warning list: what burnt and what to do about it. */
export function burnMessage(what, why, fix) {
  return `💥 ${what} burned out — ${why}${fix ? '. ' + fix : ''}`;
}
