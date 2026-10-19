import * as A from '../art.js';
import { ladder, par } from '../ladder.js';
import { steps, ul, table } from '../helpers.js';
import { jano, tipsB, sabdhan, koro, kholo } from './kit.js';

export default {
  id: 'bn-vfd', no: 4, title: 'VFD চালানো: টার্মিনাল দিয়ে', icon: 'motor',
  blurb: 'ধাপ ৮–৯: VFD কী, কিপ্যাড, তিনটি জরুরি প্যারামিটার, MI1 / MI2 / DCM, সামনে-পেছনে ইন্টারলক।',
  sections: [
    {
      id: 'what', title: 'VFD কী',
      html: `
${A.vfdBlocks()}
<p><b>VFD</b> (Variable Frequency Drive, ইনভার্টার) মোটরের স্পিড বদলায়। লাইনের 50 Hz-কে সে যেকোনো ফ্রিকোয়েন্সিতে (0 – 50 Hz বা বেশি) বদলে মোটরে দেয়। 4-পোল মোটরে প্রায় <b>Hz × 28 = rpm</b> (50 Hz ≈ 1420 rpm, 25 Hz ≈ 710 rpm)।</p>
${ul(
  'ইনপুট: <code>R/L1</code>, <code>S/L2</code> → MCB থেকে 230 V।',
  'আউটপুট: <code>U/T1</code>, <code>V/T2</code>, <code>W/T3</code> → মোটর। যেকোনো দুটো ফেজ বদলালে মোটর উল্টো ঘোরে।',
  'কন্ট্রোল টার্মিনাল: <code>MI1 … MI7</code> (কমান্ড ইনপুট), <code>DCM</code> (তাদের কমন), <code>AVI</code> / <code>ACI</code> (অ্যানালগ স্পিড), <code>RS-485</code> (Modbus)।')}`,
    },
    {
      id: 'params', title: 'তিনটি প্যারামিটার যা সবার আগে জানতে হবে',
      html: `
${A.keypad()}
<p>VFD কাকে মানবে — কিপ্যাড, তার, নাকি Modbus — সেটা ঠিক হয় প্যারামিটার দিয়ে। VFD ট্যাবে বা কিপ্যাডে (MODE → গ্রুপ → ENTER) বদলানো যায়।</p>
${table(['প্যারামিটার', 'মানে', 'ধাপ ৮–৯', 'ধাপ ১০–১৬ (Modbus)'], [
  ['<b>00-20</b>', 'স্পিড কোথা থেকে আসবে', '0 = কিপ্যাড', '1 = RS-485'],
  ['<b>00-21</b>', 'RUN / STOP কোথা থেকে', '1 = টার্মিনাল (MI1 / MI2)', '2 = RS-485'],
  ['<b>02-00</b>', 'দুই-তার কন্ট্রোলের ধরন', '1 = MI1 FWD, MI2 REV', '—'],
  ['<b>01-12 / 01-13</b>', 'অ্যাক্সেলারেশন / ডিসেলারেশন সময়', '3 s', '4 s'],
  ['<b>09-00</b>', 'Modbus স্টেশন নম্বর', '—', '1'],
  ['<b>09-01 / 09-04</b>', 'বড রেট / ফরম্যাট', '—', '9.6 kbps / 14 = 8,E,1 RTU'],
])}
${sabdhan('ভুল প্যারামিটারে VFD চুপচাপ আদেশ উপেক্ষা করে। Check the lab (⚠) বলে দেয়: "Pr.00-21 is not 2 — ignores RS-485 RUN/STOP"।')}`,
    },
    {
      id: 's8', title: 'ধাপ ৮ · PLC দিয়ে VFD চালু (MI1)',
      html: `
${A.vfdTerminals()}
<p>MS300-এর MI ইনপুট "সিংক" মোডে: <b>MI1 আর DCM জোড়া লাগলেই</b> MI1 অন। PLC-র রিলে আউটপুট ঠিক এই কাজটাই করে — Y4 অন হলে Y4 আর C1-এর মধ্যে কন্টাক্ট বন্ধ হয়।</p>
${steps(
  'তার: PLC <code>C1</code> → VFD <code>DCM</code>, PLC <code>Y4</code> → VFD <code>MI1</code>।',
  'প্যারামিটার: 00-21 = 1 (টার্মিনাল), 00-20 = 0 (স্পিড কিপ্যাডে, ▲ ▼ দিয়ে)।',
  'প্রোগ্রাম: START/STOP ল্যাচ M0, তারপর <code>M0 → OUT Y4</code>।')}
${ladder([
  { note: 'START / STOP ল্যাচ', net: [par(['X0|START'], ['M0']), 'X1|STOP'], out: 'OUT M0' },
  { note: 'M0 → Y4 → MI1 (FWD)', net: ['M0'], out: 'OUT Y4' },
], 'রিলে Y4 = VFD-র "চালাও" বোতাম।')}
${jano('Y0–Y3 (C0 গ্রুপ) 24 V বাতিতে, Y4–Y7 (C1 গ্রুপ) VFD-র DCM-এ — দুটো গ্রুপ আলাদা থাকায় দুই সার্কিট মিশে যায় না।')}
${kholo('step-08-vfd-run', 8)}
${koro('VFD ট্যাবে কিপ্যাডের ▲ চেপে স্পিড 40 Hz করো। তারপর Pr.01-12 = 1 s করে দেখো মোটর কত দ্রুত স্পিডে ওঠে।')}`,
    },
    {
      id: 's9', title: 'ধাপ ৯ · সামনে / পেছনে + ইন্টারলক',
      html: `
${ladder([
  { note: 'সামনে M0: পেছনে (M1) চললে না', net: [par(['X0|FWD'], ['M0']), 'X2|STOP', '/M1|ইন্টারলক'], out: 'OUT M0' },
  { note: 'পেছনে M1: সামনে (M0) চললে না', net: [par(['X1|REV'], ['M1']), 'X2|STOP', '/M0|ইন্টারলক'], out: 'OUT M1' },
  { note: 'সামনে → MI1', net: ['M0'], out: ['OUT Y4', 'OUT Y0'] },
  { note: 'পেছনে → MI2', net: ['M1'], out: ['OUT Y5', 'OUT Y1'] },
], 'ইন্টারলক: একটার রাংয়ে অন্যটার NC কন্টাক্ট। দুটো একসাথে কখনো অন হবে না।')}
<p>কেন ইন্টারলক? একসাথে FWD আর REV দিলে আসল মোটর-স্টার্টারে শর্ট সার্কিট হতে পারে, আর VFD-তে আদেশ গুলিয়ে যায়। তাই <b>সামনে চলার সময় পেছনের বোতাম কাজ করবে না</b> — আগে STOP।</p>
${kholo('step-09-vfd-fwd-rev', 9)}
${koro('ইন্টারলক (<code>/M1</code>, <code>/M0</code>) মুছে Download করো। তারপর FWD আর REV দুটোই চাপো — Monitor-এ দেখো M0 আর M1 দুটোই অন! কেন এটা বিপদ, ভাবো।')}`,
    },
  ],
};
