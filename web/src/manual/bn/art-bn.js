// Diagrams of the Bangla book: the same small inline SVG pictures as the rest of the manual, with
// Bangla labels (the device and terminal names stay as printed on the parts).
import { K, T, R, L, P, AR, DOT, BADGE, fig } from '../art.js';

/** Button → input → program → output → lamp / motor. */
export const plcIdea = () => fig(380, 150,
  [['বোতাম / সেন্সর', 'START, লিমিট', 14], ['ইনপুট X', 'X0 … X7', 104], ['প্রোগ্রাম', 'ল্যাডার', 194], ['আউটপুট Y', 'Y0 … Y7', 284]].map(([a, b, x], i) =>
    R(x, 34, 78, 54, { fill: i === 2 ? '#123a2a' : K.box2, stroke: i === 2 ? K.ok : K.line }) + T(x + 39, 56, a, { size: 10.5, anchor: 'middle', weight: 700 }) + T(x + 39, 74, b, { size: 9, anchor: 'middle', fill: K.dim }) +
    (i < 3 ? AR(x + 80, 61, x + 101, 61, { stroke: K.acc, m: 'mfb' }) : '')).join('') +
  AR(323, 90, 323, 112, { stroke: K.acc, m: 'mfb' }) + T(323, 130, 'বাতি · মোটর · VFD', { size: 10, anchor: 'middle', fill: K.ok, weight: 700 }) +
  T(190, 20, 'PLC = ছোট একটি কম্পিউটার: ইনপুট দেখে, প্রোগ্রাম অনুযায়ী আউটপুট চালায়', { size: 9.5, anchor: 'middle', fill: K.ink }),
  'বোতাম চাপলে ইনপুট X অন হয়, প্রোগ্রাম সিদ্ধান্ত নেয়, আউটপুট Y বাতি বা মোটর চালায়।');

/** The scan: read inputs → run the program top to bottom → write outputs, again and again. */
export const scanBn = () => fig(360, 210,
  `<circle cx="180" cy="108" r="70" fill="none" stroke="${K.box2}" stroke-width="14"/>` +
  P('M180 38 A70 70 0 0 1 240 143', { stroke: K.acc, sw: 3 }) + P('M240 143 A70 70 0 0 1 120 143', { stroke: K.ok, sw: 3 }) + P('M120 143 A70 70 0 0 1 180 38', { stroke: K.warn, sw: 3 }) +
  BADGE(180, 38, '১') + BADGE(240, 143, '২') + BADGE(120, 143, '৩') +
  T(258, 70, 'ইনপুট পড়ো', { size: 10.5, fill: K.acc, weight: 700 }) + T(258, 84, 'X0 … X7 এর অবস্থা', { size: 9, fill: K.dim }) +
  T(180, 198, 'প্রোগ্রাম চালাও: উপর থেকে নিচে, রাং ১ → শেষ', { size: 10.5, anchor: 'middle', fill: K.ok, weight: 700 }) +
  T(14, 70, 'আউটপুট লেখো', { size: 10.5, fill: K.warn, weight: 700 }) + T(14, 84, 'Y0 … Y7 অন / অফ', { size: 9, fill: K.dim }) +
  T(180, 104, 'স্ক্যান', { size: 13, anchor: 'middle', weight: 800 }) + T(180, 120, '≈ 1 ms, বারবার', { size: 9.5, anchor: 'middle', fill: K.dim }),
  'PLC এক মুহূর্তও থামে না: ইনপুট পড়ে, পুরো প্রোগ্রাম চালায়, আউটপুট লেখে — তারপর আবার শুরু (একে স্ক্যান বলে)।');

/** Digital (on / off) against analog (any value in between). */
export const analogVsDigital = () => fig(380, 168,
  R(14, 20, 170, 120, { fill: K.box }) + R(196, 20, 170, 120, { fill: K.box }) +
  T(99, 38, 'ডিজিটাল: শুধু অন / অফ', { size: 10.5, anchor: 'middle', weight: 700 }) + T(281, 38, 'অ্যানালগ: মাঝের যেকোনো মান', { size: 10.5, anchor: 'middle', weight: 700 }) +
  P('M28 120 H64 V64 H112 V120 H140 V64 H172', { stroke: K.ok, sw: 2.4 }) + T(24, 68, '1', { size: 9, fill: K.dim }) + T(24, 124, '0', { size: 9, fill: K.dim }) +
  P('M210 120 C 236 120, 246 60, 272 70 S 318 116, 352 58', { stroke: K.acc, sw: 2.4 }) + T(206, 62, '10 V', { size: 9, fill: K.dim, anchor: 'end' }) + T(206, 124, '0 V', { size: 9, fill: K.dim, anchor: 'end' }) +
  T(99, 158, 'বোতাম, লিমিট সুইচ → X ইনপুট', { size: 9.5, anchor: 'middle', fill: K.line }) + T(281, 158, 'তাপমাত্রা, চাপ, লেভেল, পট → AD মডিউল', { size: 9.5, anchor: 'middle', fill: K.line }),
  'ডিজিটাল সিগন্যাল দুই রকম: আছে বা নেই। অ্যানালগ সিগন্যাল অনেক রকম: 0 থেকে 10 V-এর ভেতরে যেকোনো মান।');

/** Three scales side by side: volts, raw counts, engineering units. */
export const scaleBn = () => {
  const x0 = 70, x1 = 330, y = [44, 98, 152];
  const at = (k) => x0 + (x1 - x0) * k;
  const row = (yy, label, a, b, mid, col) => L(x0, yy, x1, yy, { stroke: col, sw: 3 }) + DOT(x0, yy, col) + DOT(x1, yy, col) +
    T(x0, yy - 9, a, { size: 9.5, anchor: 'middle', fill: col, weight: 700 }) + T(x1, yy - 9, b, { size: 9.5, anchor: 'middle', fill: col, weight: 700 }) +
    T(at(0.35), yy - 9, mid, { size: 10, anchor: 'middle', fill: K.ink, weight: 800 }) + T(14, yy + 4, label, { size: 10, fill: K.line, weight: 700 });
  return fig(360, 190,
    row(y[0], 'সিগন্যাল', '0 V', '10 V', '3.5 V', K.acc) + row(y[1], 'AD মান', '0', '32000', '11200', K.warn) + row(y[2], '°C', '0.0', '100.0', '35.0', K.ok) +
    L(at(0.35), y[0] + 4, at(0.35), y[2] - 4, { stroke: K.ink, sw: 1.2, dash: '3 3' }) +
    T(180, 178, 'D10 = D0 ÷ 32   (32000 ÷ 32 = 1000 = 100.0 °C)', { size: 10, anchor: 'middle', fill: K.ink, mono: true }),
    'স্কেলিং: একই মান তিনভাবে — ভোল্ট, মডিউলের সংখ্যা (0–32000), আর আসল একক (°C)। ভাগ করে এক স্কেল থেকে আরেক স্কেলে যাই।');
};

/** Transmitter → DVP04AD-E2 CH1, module on the right of the PLC, 24 V from the supply. */
export const adWiringBn = () => fig(380, 236,
  // supply
  R(14, 20, 80, 92, { fill: K.box2 }) + T(54, 36, '24 V সাপ্লাই', { size: 10, anchor: 'middle', weight: 700 }) +
  T(84, 62, '+V', { size: 10, anchor: 'end', fill: K.err, weight: 700 }) + DOT(94, 58, K.err) + T(84, 96, '−V', { size: 10, anchor: 'end', fill: K.blue, weight: 700 }) + DOT(94, 92, K.blue) +
  // PLC + module
  R(170, 20, 82, 100, { fill: '#16181b', stroke: K.line }) + T(211, 64, 'DVP16ES2', { size: 10, anchor: 'middle', weight: 700 }) + T(211, 80, 'PLC', { size: 9, anchor: 'middle', fill: K.dim }) +
  R(254, 20, 112, 100, { fill: '#16181b', stroke: K.acc }) + T(310, 36, 'DVP04AD-E2', { size: 10, anchor: 'middle', weight: 800, fill: K.acc }) + T(310, 50, 'ডান পাশে লাগানো', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  [['24V', 268, K.err], ['24G', 292, K.blue], ['V1+', 322, K.vio], ['VI1−', 350, K.blue]].map(([n, x, c]) => DOT(x, 120, c) + T(x, 112, n, { size: 8.5, anchor: 'middle', fill: c, weight: 700 })).join('') +
  // transmitter (terminals on its top edge)
  R(96, 166, 120, 50, { fill: K.box2 }) + T(156, 196, 'টেম্পারেচার ট্রান্সমিটার', { size: 9.5, anchor: 'middle', weight: 700 }) + T(156, 209, '0–100 °C → 0–10 V', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  [['BN', 116, K.err], ['BU', 156, K.blue], ['BK', 196, K.vio]].map(([n, x, c]) => DOT(x, 166, c) + T(x, 180, n, { size: 8.5, anchor: 'middle', fill: c, weight: 700 })).join('') +
  // wires
  P('M94 58 H140 V138 H268 V120', { stroke: K.err }) + P('M140 138 H116 V166', { stroke: K.err }) +
  P('M94 92 H130 V146 H292 V120', { stroke: K.blue }) + P('M156 146 V166', { stroke: K.blue }) +
  P('M196 166 V156 H322 V120', { stroke: K.vio, sw: 2 }) + P('M350 120 V146 H292', { stroke: K.blue, dash: '4 3' }),
  'মডিউলের তার: 24V / 0V সাপ্লাই থেকে; ট্রান্সমিটারের BN +24 V, BU 0 V, সিগন্যাল BK → V1+; চ্যানেলের কমন VI1− → 0 V।');

/** 4–20 mA: a current loop, I+ bridged to V+. */
export const loop420Bn = () => fig(380, 196,
  R(20, 30, 110, 96, { fill: K.box2 }) + T(75, 48, 'প্রেশার ট্রান্সমিটার', { size: 10, anchor: 'middle', weight: 700 }) + T(75, 64, '4–20 mA (0–10 bar)', { size: 9, anchor: 'middle', fill: K.dim }) +
  R(250, 30, 110, 96, { fill: '#16181b', stroke: K.acc }) + T(305, 48, 'CH2', { size: 11, anchor: 'middle', weight: 800, fill: K.acc }) +
  [['I2+', 272], ['V2+', 305], ['VI2−', 338]].map(([n, x]) => DOT(x, 126, K.vio) + T(x, 118, n, { size: 8.5, anchor: 'middle', fill: K.vio, weight: 700 })).join('') +
  P('M272 126 V140 H305 V126', { stroke: K.warn, sw: 2.4 }) + T(289, 154, 'জাম্পার', { size: 9, anchor: 'middle', fill: K.warn, weight: 700 }) +
  P('M130 70 H200 V170 H272 V126', { stroke: K.vio, sw: 2 }) + T(165, 64, 'BK', { size: 9, anchor: 'middle', fill: K.vio, weight: 700 }) +
  P('M338 126 V176 H190 V100 H130', { stroke: K.blue, sw: 1.6, dash: '4 3' }) + T(160, 96, '0 V', { size: 9, anchor: 'middle', fill: K.blue }) +
  T(190, 22, 'কারেন্ট একটি লুপে ঘোরে: তার লম্বা হলেও মান বদলায় না', { size: 9.5, anchor: 'middle', fill: K.ink }),
  '4–20 mA: I+ আর V+ একটি ছোট তার (জাম্পার) দিয়ে জোড়া — তখন মডিউল কারেন্ট মাপে। 4 mA = 0 (শূন্য চাপ), 20 mA = 32000 (পূর্ণ চাপ)।');

/** One Modbus RTU request from the PLC: station, function, address, data, CRC. */
export const frameBn = () => {
  const cells = [['01', 'স্টেশন', K.acc], ['06', 'ফাংশন', K.warn], ['20 00', 'ঠিকানা 2000H', K.ok], ['00 12', 'ডেটা H12', K.vio], ['CRC', 'চেক', K.dim]];
  let x = 14;
  const parts = cells.map(([v, n, c]) => { const w = v.length > 3 ? 78 : 58; const s = R(x, 44, w, 40, { fill: K.box2, stroke: c }) + T(x + w / 2, 69, v, { size: 12, anchor: 'middle', fill: c, weight: 800, mono: true }) + T(x + w / 2, 102, n, { size: 9, anchor: 'middle', fill: K.line }); x += w + 6; return s; });
  return fig(380, 150, T(190, 28, 'PLC → VFD: "স্টেশন 1, 2000H রেজিস্টারে H12 লেখো"', { size: 10.5, anchor: 'middle', weight: 700 }) + parts.join('') +
    T(190, 132, 'VFD একই ফ্রেম ফেরত পাঠায় = "ঠিক আছে, লিখেছি"', { size: 9.5, anchor: 'middle', fill: K.ok }),
  'একটি Modbus RTU ফ্রেম: কাকে (স্টেশন), কী কাজ (ফাংশন 06 = একটি রেজিস্টার লেখা), কোথায় (2000H), কী (H12 = সামনে চলো), আর ভুল ধরার CRC।');
};

/** PLC master asks, the drive (slave) answers. */
export const masterSlaveBn = () => fig(380, 170,
  R(14, 40, 120, 70, { fill: K.box2, stroke: K.acc }) + T(74, 64, 'PLC = মাস্টার', { size: 11, anchor: 'middle', weight: 800, fill: K.acc }) + T(74, 82, 'প্রশ্ন করে / আদেশ দেয়', { size: 9, anchor: 'middle', fill: K.dim }) + T(74, 98, 'COM2 (RS-485)', { size: 9, anchor: 'middle', fill: K.line }) +
  R(246, 40, 120, 70, { fill: K.box2 }) + T(306, 64, 'VFD = স্লেভ', { size: 11, anchor: 'middle', weight: 800 }) + T(306, 82, 'শুধু উত্তর দেয়', { size: 9, anchor: 'middle', fill: K.dim }) + T(306, 98, 'স্টেশন 1 (Pr.09-00)', { size: 9, anchor: 'middle', fill: K.line }) +
  AR(136, 62, 244, 62, { stroke: K.acc, m: 'mfb' }) + T(190, 54, 'অনুরোধ (TX)', { size: 9.5, anchor: 'middle', fill: K.acc }) +
  AR(244, 92, 136, 92, { stroke: K.ok, m: 'mfc' }) + T(190, 108, 'উত্তর (RX)', { size: 9.5, anchor: 'middle', fill: K.ok }) +
  T(190, 140, 'একই বাস-এ ৩২টি পর্যন্ত স্লেভ — প্রত্যেকের আলাদা স্টেশন নম্বর', { size: 9.5, anchor: 'middle', fill: K.ink }) +
  T(190, 156, 'দুই দিকে একই সেটিং: 9600 bps, 8 বিট, Even, 1 স্টপ, RTU', { size: 9.5, anchor: 'middle', fill: K.line }),
  'Modbus-এ একজন কথা বলে (মাস্টার), বাকিরা শুধু ডাক পেলে উত্তর দেয় (স্লেভ)।');
