import * as A from '../art.js';
import { ladder, par } from '../ladder.js';
import { note, tip, warn, tryIt, steps, ul, table } from '../helpers.js';
import { stepLab } from './kit.js';

export default {
  id: 'st-ladder', no: 2, title: 'Ladder: the first steps', icon: 'ladder',
  blurb: 'Steps 1–4: one button → one lamp, NO and NC, the start / stop latch, SET and RST.',
  sections: [
    {
      id: 'read', title: 'How to read a ladder',
      html: `
<p>A ladder diagram looks like a ladder: a vertical line on the left (+) and one on the right (−). Every horizontal line between them is a <b>rung</b>. Power flows <b>from left to right</b> — only when every contact on the way is "closed" does the coil on the right turn on.</p>
${A.symbols()}
${table(['Symbol', 'Name', 'Passes power when'], [
  ['<code>—| |—</code>', 'NO contact (normally open)', 'the address is <b>ON</b>'],
  ['<code>—|/|—</code>', 'NC contact (normally closed)', 'the address is <b>OFF</b>'],
  ['<code>—( )—</code>', 'coil (OUT)', 'ON while the rung has power, OFF when not'],
  ['<code>—(S)—</code> / <code>—(R)—</code>', 'SET / RST', 'turn ON / OFF once — and stay that way'],
])}
${A.andOr()}
<p>Two contacts <b>in series</b> (one after the other) = <b>AND</b> (both needed). <b>In parallel</b> (one above the other) = <b>OR</b> (either one is enough).</p>`,
    },
    {
      id: 's1', title: 'Step 1 · One button → one lamp',
      html: `
${ladder([{ note: 'While X0 is pressed, Y0 is ON', net: ['X0|PUSH'], out: 'OUT Y0' }], 'The smallest program: one contact, one coil.', { on: { X0: 1 } })}
<p>Press the button → X0 is ON → the NO contact closes → power reaches coil Y0 → the PLC relay closes → the lamp lights. Let go and the opposite happens.</p>
${steps(
  'Open the lab, press <b>Simulate</b>.',
  'In <b>Operate</b> mode hold the PUSH button.',
  'Look at the <b>IN 0</b> and <b>OUT 0</b> LEDs on the front of the PLC — both light.')}
${stepLab('step-01-button-lamp', 1)}
${tryIt('In the Ladder tab tap the contact, make it <b>NC</b> (<code>/X0</code>) and Download. Now the lamp is always on and goes out while you press.')}`,
    },
    {
      id: 's2', title: 'Step 2 · NO and NC contacts',
      html: `
${ladder([
  { note: 'NO: X0 ON → Y0 (green)', net: ['X0|PUSH'], out: 'OUT Y0' },
  { note: 'NC: X0 OFF → Y1 (red)', net: ['/X0|PUSH'], out: 'OUT Y1' },
], 'Same input, two kinds of contact: not pressed → red, pressed → green.', { on: { X0: 0 } })}
<p>One important point: <b>the NO / NC of the ladder and the NO / NC of the button are different things</b>.</p>
${ul(
  'The <b>button\'s</b> NO (13–14) closes when pressed; its NC (11–12) opens when pressed. That is about the wiring.',
  'The <b>ladder\'s</b> NO (<code>X0</code>) means "pass when X0 is ON"; NC (<code>/X0</code>) means "pass when X0 is OFF". That is about the program.')}
${note('On a real machine the STOP button is almost always an <b>NC</b> button. If its wire breaks, the PLC sees "STOP pressed" and the machine stops. That is the safe way (fail-safe).')}
${stepLab('step-02-no-nc', 2)}`,
    },
    {
      id: 's3', title: 'Step 3 · The start / stop latch (self-holding)',
      html: `
${A.latch()}
${ladder([
  { note: 'START (X0) or Y0 itself; STOP is an NC button (X1)', net: [par(['X0|START'], ['Y0|holds']), 'X1|STOP (NC)'], out: 'OUT Y0' },
], 'Self-holding: once Y0 is ON it keeps itself on through its own contact.', { on: { X0: 0, Y0: 1, X1: 1 } })}
<p>Nobody holds START down for as long as the motor runs. So:</p>
${steps(
  'Press START → X0 closes → Y0 ON.',
  'Because Y0 is ON, the <code>Y0</code> contact below is closed too — when you let go of START the power still gets through that way. Y0 is "latched".',
  'The STOP button is NC — normally X1 is ON, so the ladder uses <code>X1</code> (NO). Press STOP → X1 OFF → the path is cut → Y0 OFF.')}
${warn('For an NC STOP button write <code>X1</code> (NO) in the ladder, not <code>/X1</code>! It is the most common beginner mistake. The rule: <i>NC button → NO contact in the ladder</i>.')}
${stepLab('step-03-latch', 3)}
${tryIt('With the lamp on, look at the Ladder tab: after you let go of START, which way does the green go? (Through the Y0 contact.)')}`,
    },
    {
      id: 's4', title: 'Step 4 · SET and RST',
      html: `
${ladder([
  { note: 'ON button → SET Y0', net: ['X0|ON'], out: 'SET Y0' },
  { note: 'OFF button → RST Y0', net: ['X1|OFF'], out: 'RST Y0' },
], 'Another latch: SET switches on and leaves it on, RST switches off.')}
<p><code>SET</code> turns the output on as soon as the rung has power — and it <b>stays</b> on when the power is gone. <code>RST</code> turns it off. Same job as step 3, written differently.</p>
${table(['', 'OUT + own contact (step 3)', 'SET / RST (step 4)'], [
  ['Looks like', 'one rung', 'two rungs'],
  ['After a power cut', 'off', 'off (normal M / Y); a "latched" M keeps its state'],
  ['Both buttons pressed', 'STOP wins (it is in series)', 'the lower rung wins'],
])}
${tip('M0, M1 … are "notes" in the PLC\'s memory — no wire goes outside. In bigger programs latch an M first, then <code>M0 → OUT Y0</code>. The next steps do it that way.')}
${stepLab('step-04-set-rst', 4)}`,
    },
  ],
};
