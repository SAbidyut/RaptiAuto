// About screen — RAPTI (rapti.net) and the RaptiAuto app.
import { h } from './widgets.js';
import { icon } from './icons.js';
import { logoMark, wordmark } from './brand.js';
import { Native } from '../native.js';

export const RAPTI = {
  name: 'RAPTI',
  full: 'Resonance Automation Professional Training Institute',
  established: 2019,
  website: 'https://rapti.net',
  goal: 'Developing skilled manpower for the automation industry.',
  mission: 'Courses are designed by experienced, competent engineers so that every student can work independently in any industry after completing a course — with the knowledge and skills that real job positions demand.',
  address: '88/A, Kamal Shikdar Tower (Beside Rafiqul Islam School & College), Signboard, Matuail, Demra, Dhaka-1362, Bangladesh',
  phones: ['+8801685953204', '+8801617345534'],
  hours: 'Saturday – Friday · 9:00 AM – 8:00 PM',
  mode: 'Online & offline classes',
  courses: {
    'Electrical & Automation': ['House Wiring', 'General Electrician', 'Industrial Electrical Control', 'Industrial Automation (PLC)'],
    'Computer & IT': ['Computer Office Application', 'Graphic Design', 'Web Design & Development', 'App Development', 'AutoCAD 2D / 3D'],
  },
  features: [
    ['factory', 'Multi-brand PLC training', 'Hands-on practice on 5+ brands in one course: Siemens LOGO!, S7-200, Mitsubishi, Delta and LS.'],
    ['users', 'Expert engineers', 'Every course is taught by industry-experienced, competent engineers.'],
    ['target', 'Job-focused curriculum', 'Targeted training designed around the requirements of real job positions.'],
    ['award', 'Verifiable certificate', 'Earn a certificate on completion that can be verified online any time.'],
  ],
};

/** About RAPTI page content (sections only — the app shell provides the top bar). */
export function aboutPage() {
  const R = RAPTI;
  const hero = h('section', { class: 'about-hero' },
    h('div', { class: 'about-badge', html: icon('graduation', 34) }),
    h('h1', {}, R.name),
    h('p', { class: 'about-full' }, R.full),
    h('div', { class: 'about-pills' },
      h('span', { class: 'pill', html: `${icon('star', 14)}<span>Since ${R.established}</span>` }),
      h('span', { class: 'pill', html: `${icon('pin', 14)}<span>Dhaka, Bangladesh</span>` }),
      h('span', { class: 'pill', html: `${icon('globe', 14)}<span>${R.mode}</span>` })));

  const mission = h('section', { class: 'card about-card' },
    h('div', { class: 'card-kicker', html: `${icon('target', 16)}<span>Our goal</span>` }),
    h('h3', {}, R.goal),
    h('p', {}, `RAPTI — ${R.full} — was established in ${R.established} with one goal: developing skilled manpower for the automation industry. ${R.mission}`),
    h('p', { class: 'bn', lang: 'bn' }, 'RAPTI ২০১৯ সালে প্রতিষ্ঠিত হয় একটি লক্ষ্য নিয়ে — অটোমেশন ইন্ডাস্ট্রির জন্য দক্ষ জনশক্তি তৈরি করা। অভিজ্ঞ ইঞ্জিনিয়ারদের দ্বারা ডিজাইন করা কোর্স শেষে প্রত্যেক শিক্ষার্থী যেন যেকোনো ইন্ডাস্ট্রিতে স্বাধীনভাবে কাজ করতে পারে।'));

  const feats = h('section', { class: 'feat-grid' });
  for (const [ic, t, d] of R.features) feats.appendChild(h('div', { class: 'feat' }, h('div', { class: 'feat-ic', html: icon(ic, 22) }), h('b', {}, t), h('p', {}, d)));

  const courses = h('section', { class: 'card about-card' }, h('div', { class: 'card-kicker', html: `${icon('book', 16)}<span>Courses</span>` }));
  for (const [group, list] of Object.entries(R.courses)) {
    courses.appendChild(h('h4', {}, group));
    const wrap = h('div', { class: 'course-list' });
    for (const c of list) wrap.appendChild(h('span', { class: 'course' }, c));
    courses.appendChild(wrap);
  }

  const call = (n) => () => Native.openUrl('tel:' + n);
  const contact = h('section', { class: 'card about-card contact', id: 'contact' },
    h('div', { class: 'card-kicker', html: `${icon('phone', 16)}<span>Contact</span>` }),
    row('pin', 'Address', R.address, () => Native.openUrl('https://maps.google.com/?q=' + encodeURIComponent('Kamal Shikdar Tower, Signboard, Matuail, Demra, Dhaka 1362'))),
    ...R.phones.map((p) => row('phone', 'Phone', p, call(p))),
    row('clock', 'Office hours', R.hours),
    row('globe', 'Website', 'rapti.net', () => Native.openUrl(R.website)),
    h('div', { class: 'contact-actions' },
      h('button', { class: 'btn btn-primary', html: `${icon('phone', 18)}<span>Call now</span>`, onclick: call(R.phones[0]) }),
      h('button', { class: 'btn btn-glass', html: `${icon('external', 18)}<span>Visit rapti.net</span>`, onclick: () => Native.openUrl(R.website) })));

  const app = h('section', { class: 'card about-card app-card' },
    h('div', { class: 'app-head', html: `${logoMark(48, 'ab')}<div>${wordmark()}<small>Version ${Native.version()}</small></div>` }),
    h('p', {}, 'RaptiAuto is an electronics & microcontroller simulator for learners. Build circuits with real components, write Arduino code, and simulate everything on your phone — no hardware needed.'),
    h('ul', { class: 'app-feats' },
      li('Arduino Uno R3 / R4, Nano, Mega, Leonardo, ESP32, ESP8266, Raspberry Pi Pico, STM32 Blue Pill, ATtiny85'),
      li('Real circuit physics: LEDs need resistors, shorts and overloads are detected'),
      li('Arduino C++ runs on-device — Serial Monitor & Plotter included'),
      li('Sensors, displays, motors, breadboards and 60+ parts with live animations'),
      li('Full-screen circuit and code editors made for touch')),
    h('p', { class: 'muted small' }, 'Information about RAPTI is taken from rapti.net.'));

  return h('div', { class: 'about-body' }, hero, mission, feats, courses, contact, app,
    h('p', { class: 'muted small center about-copy' }, `© ${new Date().getFullYear()} RAPTI · RaptiAuto`));
}

function row(ic, label, value, onclick) {
  return h(onclick ? 'button' : 'div', { class: 'c-row' + (onclick ? ' tap' : ''), onclick },
    h('span', { class: 'c-ic', html: icon(ic, 18) }),
    h('div', {}, h('small', {}, label), h('span', {}, value)),
    onclick ? h('span', { class: 'c-go', html: icon('forward', 18) }) : null);
}

function li(t) { return h('li', { html: `${icon('check', 16)}<span>${t}</span>` }); }
