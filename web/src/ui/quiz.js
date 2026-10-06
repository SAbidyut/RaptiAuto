// Quiz: multiple-choice questions about electronics, Arduino, MicroPython and PLC / VFD. Best scores are kept on the phone.
import { h } from './widgets.js';
import { icon } from './icons.js';

export const QUIZ_TOPICS = [
  { id: 'electronics', name: 'Electronics' },
  { id: 'arduino', name: 'Arduino' },
  { id: 'python', name: 'MicroPython' },
  { id: 'plc', name: 'PLC & VFD' },
];

// [topic, question, [options], index of the correct option, explanation]
const Q = [
  ['electronics', 'A 9 V battery is connected across a 450 Ω resistor. What current flows?', ['2 mA', '20 mA', '200 mA', '4.05 A'], 1, 'Ohm\'s law: I = V / R = 9 V / 450 Ω = 0.02 A = 20 mA.'],
  ['electronics', 'Why does an LED need a series resistor?', ['The resistor makes it brighter', 'A conducting LED has almost no resistance, so the current must be limited', 'LEDs only work on AC', 'It converts 5 V into 3 V AC'], 1, 'Above its forward voltage an LED conducts freely. Without a resistor the current rises until the LED burns out.'],
  ['electronics', 'What is the total resistance of 100 Ω and 220 Ω in series?', ['69 Ω', '120 Ω', '320 Ω', '22 000 Ω'], 2, 'Series resistances add: 100 + 220 = 320 Ω.'],
  ['electronics', 'Two 100 Ω resistors are connected in parallel. Their total resistance is…', ['200 Ω', '100 Ω', '50 Ω', '10 Ω'], 2, 'Equal resistors in parallel: R / 2 = 50 Ω.'],
  ['electronics', 'How much power does a 100 Ω resistor dissipate when 0.1 A flows through it?', ['0.1 W', '1 W', '10 W', '100 W'], 1, 'P = I² × R = 0.01 × 100 = 1 W — a ¼ W resistor would overheat.'],
  ['electronics', 'Two 10 kΩ resistors form a voltage divider on 5 V. The middle voltage is…', ['1.25 V', '2.5 V', '3.3 V', '5 V'], 1, 'Vout = Vin × R2 / (R1 + R2) = 5 × 10k / 20k = 2.5 V.'],
  ['electronics', 'Which component blocks DC but lets AC pass?', ['Resistor', 'Diode', 'Capacitor', 'Fuse'], 2, 'A capacitor charges up and then blocks steady DC, while a changing voltage keeps charging and discharging it.'],
  ['electronics', 'A silicon diode starts to conduct when…', ['the cathode is 5 V above the anode', 'the anode is about 0.7 V above the cathode', 'it is heated', 'the voltage is exactly 0 V'], 1, 'In the forward direction (anode positive) a silicon diode conducts after roughly 0.6 – 0.7 V.'],
  ['electronics', 'An NPN transistor works as a switch when…', ['a small base current flows into the base', 'the emitter is left open', 'the collector is connected to ground', 'a magnet is nearby'], 0, 'A small base current allows a much larger collector-emitter current: the "switch" is on.'],
  ['electronics', 'Why is a diode placed across a relay or solenoid coil?', ['To make the coil stronger', 'To absorb the voltage spike when the coil is switched off', 'To reduce the supply voltage', 'To count pulses'], 1, 'The collapsing magnetic field produces a high-voltage spike; the flyback diode lets the current circulate safely.'],

  ['arduino', 'How often does setup() run?', ['Forever, in a loop', 'Once, at power-up or reset', 'Every second', 'Only when a button is pressed'], 1, 'setup() runs once; loop() repeats forever afterwards.'],
  ['arduino', 'What range does analogRead() return on an Arduino Uno?', ['0 – 255', '0 – 1023', '0 – 4095', '0 – 65535'], 1, 'The Uno has a 10-bit ADC: 2¹⁰ = 1024 values (0 – 1023).'],
  ['arduino', 'What does analogWrite(9, 128) do?', ['Reads pin 9', 'Outputs a PWM signal with about 50 % duty cycle', 'Sets pin 9 permanently HIGH', 'Writes 128 to the EEPROM'], 1, 'analogWrite takes 0 – 255, so 128 is about half: a 50 % PWM duty cycle.'],
  ['arduino', 'A button connects pin 2 to GND. Which pinMode makes it read LOW when pressed and HIGH otherwise?', ['OUTPUT', 'INPUT', 'INPUT_PULLUP', 'ANALOG'], 2, 'INPUT_PULLUP enables the internal pull-up resistor, so the pin is HIGH until the button pulls it to GND.'],
  ['arduino', 'Which pins can do PWM on an Arduino Uno?', ['0, 1, 2, 3', '3, 5, 6, 9, 10, 11', 'All digital pins', 'Only A0 – A5'], 1, 'The Uno marks its PWM pins with a ~: 3, 5, 6, 9, 10 and 11.'],
  ['arduino', 'What does millis() return?', ['The time of day', 'Milliseconds since the board started', 'The number of loop() runs', 'The analog value in millivolts'], 1, 'millis() counts milliseconds since power-up — ideal for non-blocking timers.'],
  ['arduino', 'What does Serial.begin(9600) set?', ['The baud rate: 9600 bits per second', 'The pin number', 'The delay in ms', 'The ADC resolution'], 0, 'Both sides of a serial link must use the same baud rate.'],
  ['arduino', 'pulseIn(echoPin, HIGH) is used with an HC-SR04 to measure…', ['the supply voltage', 'the length of the HIGH pulse in microseconds', 'the temperature', 'the number of pulses per second'], 1, 'The echo pulse width is proportional to the distance: distance (cm) ≈ µs / 58.'],
  ['arduino', 'Which two lines does I²C use?', ['TX and RX', 'MOSI and MISO', 'SDA and SCL', 'D+ and D−'], 2, 'SDA = data, SCL = clock. Many devices share the same two wires, each with its own address.'],
  ['arduino', 'delay(1000) …', ['pauses the program for 1 second', 'waits 1000 seconds', 'runs the next line 1000 times', 'turns off all pins'], 0, 'delay() takes milliseconds and blocks the sketch while it waits.'],

  ['python', 'What does Pin(2, Pin.OUT) create?', ['An analog input on GPIO 2', 'An output pin on GPIO 2', 'A PWM signal', 'A timer'], 1, 'machine.Pin(id, mode): Pin.OUT makes the pin an output.'],
  ['python', 'Which line pauses a MicroPython program for 500 milliseconds?', ['time.sleep(500)', 'time.sleep_ms(500)', 'delay(500)', 'wait(0.5ms)'], 1, 'time.sleep_ms(500) — or time.sleep(0.5). time.sleep(500) would wait 500 seconds!'],
  ['python', 'ADC(Pin(34)).read() on an ESP32 returns values from…', ['0 to 255', '0 to 1023', '0 to 4095', '0 to 65535'], 2, 'The ESP32 ADC is 12 bit: 0 – 4095. read_u16() scales to 0 – 65535.'],
  ['python', 'What PWM frequency does a hobby servo expect?', ['50 Hz', '5 kHz', '38 kHz', '1 MHz'], 0, 'A servo wants a pulse every 20 ms (50 Hz); the pulse width of 0.5 – 2.4 ms sets the angle.'],
  ['python', 'Where does print("hello") show its text in RaptiAuto?', ['On the OLED automatically', 'In the Serial Monitor', 'In the circuit canvas', 'Nowhere'], 1, 'print() writes to the console (REPL), which RaptiAuto shows in the Serial tab.'],
  ['python', 'Pin(14, Pin.IN, Pin.PULL_UP) with a button to GND reads … when the button is pressed.', ['1', '0', 'None', 'True'], 1, 'With the pull-up the pin is 1 until the button connects it to GND — then value() is 0.'],
  ['python', 'How do you run a function when a pin goes from HIGH to LOW?', ['pin.on(f)', 'pin.irq(trigger=Pin.IRQ_FALLING, handler=f)', 'pin.value(f)', 'time.sleep(f)'], 1, 'Pin.irq() registers an interrupt handler for a rising and/or falling edge.'],
  ['python', 'In Python, what marks the body of an if / while / def block?', ['Curly braces { }', 'begin … end', 'Indentation', 'Semicolons'], 2, 'Python uses indentation (usually 4 spaces) to show which lines belong together.'],
  ['python', 'Timer(0).init(period=1000, mode=Timer.PERIODIC, callback=f) calls f…', ['once after 1 s', 'every second', 'every millisecond', 'when a pin changes'], 1, 'PERIODIC repeats; ONE_SHOT would call f only once.'],
  ['python', 'What does i2c.scan() return?', ['The temperature', 'A list of the addresses of the devices that answered', 'The clock speed', 'Nothing'], 1, 'scan() probes all addresses and returns the ones that acknowledge, e.g. [60] for an OLED at 0x3C.'],

  ['plc', 'How are the inputs and outputs of a Delta DVP PLC named?', ['A0… and B0…', 'X0… (inputs) and Y0… (outputs)', 'I0 and Q0', 'IN1 and OUT1'], 1, 'Delta uses X for inputs and Y for outputs; the numbers are octal (X0 – X7, X10 …).'],
  ['plc', 'What makes a "self-holding" (latching) ladder circuit?', ['A timer in series with the coil', 'A contact of the output in parallel with the START button', 'Two outputs with the same address', 'A counter'], 1, 'The output contact keeps the rung true after START is released; STOP breaks it.'],
  ['plc', 'With 100 ms timers, TMR T0 K50 waits…', ['50 ms', '0.5 s', '5 s', '50 s'], 2, 'K50 × 100 ms = 5000 ms = 5 s.'],
  ['plc', 'A normally-closed STOP button is wired to X1. When the button is NOT pressed, X1 is…', ['OFF', 'ON', 'undefined', 'flashing'], 1, 'An NC contact conducts when released, so X1 is ON — and a broken wire stops the machine (fail-safe).'],
  ['plc', 'Which special relay gives a 1-second clock (0.5 s ON / 0.5 s OFF) in Delta DVP PLCs?', ['M1000', 'M1002', 'M1013', 'M1143'], 2, 'M1013 is the 1 s clock pulse — handy for flashing lamps. M1002 is the first-scan pulse.'],
  ['plc', 'What is M1002 used for?', ['A one-scan pulse when the PLC goes to RUN (initialisation)', 'A 1 s clock', 'Always ON', 'A fault flag'], 0, 'M1002 is ON for the first scan only — perfect for setting start values like MOV K5 D0.'],
  ['plc', 'What does a VFD change to control the speed of an induction motor?', ['Only the voltage', 'The supply frequency (and voltage with it)', 'The number of poles', 'The motor\'s resistance'], 1, 'Speed ≈ 120 × f / poles. A drive varies the output frequency (V/f control).'],
  ['plc', 'Which kind of CRC does Modbus RTU use?', ['8-bit sum', '16-bit CRC', '32-bit CRC', 'No error check'], 1, 'Modbus RTU frames end with a 16-bit CRC (low byte first).'],
  ['plc', 'What is the step ladder (STL) instruction used for?', ['Sequential processes made of steps (S0, S20 …)', 'Arithmetic', 'Communication', 'Analog scaling'], 0, 'STL splits a machine cycle into steps: only the active step\'s outputs are on.'],
  ['plc', 'A counter CNT C0 K5 counts…', ['every scan', 'each rising edge of its input until it reaches 5', 'seconds', 'only falling edges'], 1, 'Each OFF→ON transition adds 1; when the count reaches the set value the contact C0 turns on.'],
];

const KEY = 'raptiauto.quiz.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage may be blocked */ } };

function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/** Builds the question list for a topic ('all' = every topic), `n` questions with shuffled answers. */
export function buildQuiz(topic, n = 10) {
  const pool = Q.filter((q) => topic === 'all' || q[0] === topic);
  return shuffle(pool).slice(0, n).map(([t, text, opts, ok, why]) => {
    const order = shuffle(opts.map((o, i) => i));
    return { topic: t, text, options: order.map((i) => opts[i]), answer: order.indexOf(ok), why };
  });
}
export const QUIZ_SIZE = Q.length;

/** Renders the quiz into `el`. */
export function quizPage(el) {
  const best = load();
  const root = h('div', { class: 'quiz' });
  el.appendChild(root);

  function home() {
    root.textContent = '';
    root.appendChild(h('p', { class: 'page-intro' }, `Test yourself: ${Q.length} questions on electronics, Arduino, MicroPython and PLC / VFD. Pick a topic and answer 10 questions.`));
    const grid = h('div', { class: 'quiz-topics' });
    for (const t of [{ id: 'all', name: 'Mixed' }, ...QUIZ_TOPICS]) {
      const n = t.id === 'all' ? Q.length : Q.filter((q) => q[0] === t.id).length;
      const b = best[t.id];
      grid.appendChild(h('button', { class: 'quiz-topic', onclick: () => run(t.id, t.name) },
        h('b', {}, t.name), h('span', {}, `${n} questions`), h('em', {}, b ? `Best: ${b}/10` : 'Not played yet')));
    }
    root.appendChild(grid);
  }

  function run(topic, name) {
    const qs = buildQuiz(topic);
    let i = 0, score = 0;
    const wrong = [];
    const show = () => {
      root.textContent = '';
      const q = qs[i];
      const card = h('div', { class: 'quiz-card' });
      const scoreEl = h('b', {}, `${score} ✓`);
      card.appendChild(h('div', { class: 'quiz-head' }, h('span', {}, `${name} · question ${i + 1} of ${qs.length}`), scoreEl));
      card.appendChild(h('div', { class: 'quiz-bar' }, h('i', { style: { width: Math.round((i / qs.length) * 100) + '%' } })));
      card.appendChild(h('h3', { class: 'quiz-q' }, q.text));
      const opts = h('div', { class: 'quiz-opts' });
      const info = h('div', { class: 'quiz-info hidden' });
      const next = h('button', { class: 'btn btn-primary hidden', onclick: () => { i++; if (i < qs.length) show(); else done(); } }, i + 1 < qs.length ? 'Next question' : 'See result');
      q.options.forEach((o, k) => {
        const b = h('button', { class: 'quiz-opt' }, o);
        b.addEventListener('click', () => {
          for (const x of opts.children) x.disabled = true;
          const right = k === q.answer;
          if (right) score++; else wrong.push(q);
          scoreEl.textContent = `${score} ✓`;
          b.classList.add(right ? 'right' : 'wrong');
          opts.children[q.answer].classList.add('right');
          info.textContent = (right ? 'Correct! ' : 'Not quite. ') + q.why;
          info.classList.remove('hidden');
          next.classList.remove('hidden');
        });
        opts.appendChild(b);
      });
      card.append(opts, info, next);
      root.appendChild(card);
    };
    const done = () => {
      if (!best[topic] || score > best[topic]) { best[topic] = score; save(best); }
      root.textContent = '';
      const msg = score >= 9 ? 'Excellent work!' : score >= 7 ? 'Well done!' : score >= 5 ? 'Good start — practise a little more.' : 'Keep practising — try the examples and the Guide.';
      const card = h('div', { class: 'quiz-card quiz-result' },
        h('div', { class: 'quiz-score' }, `${score}/${qs.length}`), h('h3', {}, msg),
        h('p', { class: 'muted' }, `Best in ${name}: ${best[topic]}/10`));
      if (wrong.length) {
        card.appendChild(h('h4', {}, 'Review'));
        for (const q of wrong) card.appendChild(h('div', { class: 'quiz-review' }, h('b', {}, q.text), h('span', {}, 'Answer: ' + q.options[q.answer]), h('em', {}, q.why)));
      }
      card.appendChild(h('div', { class: 'quiz-actions' },
        h('button', { class: 'btn btn-primary', html: `${icon('restart', 18)}<span>Try again</span>`, onclick: () => run(topic, name) }),
        h('button', { class: 'btn btn-glass', onclick: home }, 'All topics')));
      root.appendChild(card);
    };
    show();
  }
  home();
}
