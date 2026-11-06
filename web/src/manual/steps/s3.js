import * as A from '../art.js';
import { ladder, par } from '../ladder.js';
import { note, tip, warn, tryIt, ul, table } from '../helpers.js';
import { stepLab } from './kit.js';

export default {
  id: 'st-timer', no: 3, title: 'Timers, clocks and counters', icon: 'target',
  blurb: 'Steps 5–7: a delay with TMR, a flashing lamp with M1013, counting with CNT.',
  sections: [
    {
      id: 's5', title: 'Step 5 · Timer: after 5 seconds',
      html: `
${A.timerChart()}
<p>A timer works like a stopwatch. <code>TMR T0 K50</code> means: while the rung has power, T0 counts, each count = 0.1 s (100 ms). At 50 counts (5 s) the <b>T0 contact turns ON</b>. When the rung loses power T0 goes back to zero.</p>
${ladder([
  { note: 'START → latch M0, STOP (NC) breaks it', net: [par(['X0|START'], ['M0']), 'X1|STOP'], out: 'OUT M0' },
  { note: 'While M0 is ON, T0 counts (5 s)', net: ['M0'], out: 'TMR T0 K50' },
  { note: 'Waiting: yellow', net: ['M0', '/T0'], out: 'OUT Y0' },
  { note: 'Time is up: green', net: ['T0'], out: 'OUT Y1' },
], 'On-delay: start, wait 5 seconds, then act.')}
${table(['Timer', 'One count', 'K50 means'], [
  ['T0 – T199', '100 ms', '5.0 s'],
  ['T200 – T239', '10 ms', '0.50 s'],
  ['T240 – T255', '1 ms', '0.050 s'],
])}
${tip('Type T0 in the Monitor tab — the number goes from 0 up to 50. That is the timer\'s "present value".')}
${stepLab('step-05-timer', 5)}
${tryIt('Make it 10 seconds instead of 5. Which K do you need? (K100.)')}`,
    },
    {
      id: 's6', title: 'Step 6 · Flashing: the PLC\'s own clock',
      html: `
${ladder([{ note: 'Selector ON and the 1 s clock', net: ['X0|BLINK', 'M1013|1 s clock'], out: 'OUT Y0' }], 'M1013 turns on for 0.5 s and off for 0.5 s by itself — AND it with a switch and the lamp flashes.')}
<p>A Delta PLC has some <b>special M bits</b> that the PLC drives itself — you do nothing:</p>
${table(['Special M', 'What it is'], [
  ['<code>M1000</code>', 'always ON in RUN — for "always do this" rungs'],
  ['<code>M1002</code>', 'ON for the first scan only — for start-up settings'],
  ['<code>M1011</code>', '10 ms clock'],
  ['<code>M1012</code>', '100 ms clock'],
  ['<code>M1013</code>', '1 s clock'],
  ['<code>M1014</code>', '1 minute clock'],
])}
${stepLab('step-06-blink', 6)}
${tryIt('Replace M1013 with M1012. How fast does the lamp flash now?')}`,
    },
    {
      id: 's7', title: 'Step 7 · Counter: counting',
      html: `
${A.counterChart()}
${ladder([
  { note: 'Every time X0 goes OFF → ON: one count', net: ['X0|COUNT'], out: 'CNT C0 K5' },
  { note: 'At 5: FULL lamp', net: ['C0'], out: 'OUT Y0' },
  { note: 'RESET → zero', net: ['X1|RESET'], out: 'RST C0' },
], 'A counter only counts the moment a press starts (the rising edge) — holding the button counts once.')}
${ul(
  '<code>CNT C0 K5</code>: C0 counts up to 5, then the <b>C0 contact turns ON</b>.',
  'A counter does not reset by itself — it needs <code>RST C0</code>.',
  'In real life: counting boxes, bottles, machine cycles.')}
${warn('Remember the difference: a timer goes back to zero as soon as its rung loses power; a counter does not — you must RST it.')}
${stepLab('step-07-counter', 7)}`,
    },
  ],
};
