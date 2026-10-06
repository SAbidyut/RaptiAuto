// In-app guide: how to use RaptiAuto (shown on the Guide page of the menu).
const ol = (...items) => `<ol>${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
const ul = (...items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const tip = (t) => `<p class="gi-tip">💡 ${t}</p>`;

export const GUIDE = [
  {
    icon: 'sparkles', title: 'Getting started',
    html: ol(
      'Open the <b>☰ Menu</b> and tap <b>New Project</b>, then pick a board. <b>Arduino Uno R3</b> is the best board for beginners.',
      'Tap the round <b>＋</b> button to add parts such as a breadboard, LED and resistor.',
      'Connect the parts with wires (see <i>Wiring</i> below).',
      'Open the <b>Code</b> tab and write your Arduino sketch.',
      'Press <b>Run</b>. LEDs light up, motors turn and the Serial Monitor shows your messages.',
    ) + tip('The fastest way to learn: open <b>Examples</b>, press Run, then change the code or the circuit.'),
  },
  {
    icon: 'plus', title: 'Adding and moving parts',
    html: ul(
      '<b>＋</b> opens the parts library. Search by name ("servo", "sensor") or browse by category.',
      '<b>Drag</b> a part to move it. Its legs snap into breadboard holes and header pins like a magnet, which connects them.',
      '<b>Tap</b> a part to select it. The bar at the bottom lets you <b>Rotate</b>, <b>Edit</b> its value (resistance, LED colour…), <b>Copy</b> or <b>Delete</b> it.',
      '<b>Long-press</b> a part or wire for more options.',
      '<b>Pinch</b> with two fingers to zoom, drag the empty canvas to pan. <b>Undo</b>, <b>redo</b>, zoom and <b>fit to screen</b> are in the side toolbar.',
    ),
  },
  {
    icon: 'wire', title: 'Wiring',
    html: ol(
      'Tap a pin. Its name pops up and a wire starts from it.',
      'Tap the pin you want to connect to. Done!',
    ) + ul(
      'While a wire is being drawn, tap empty space to add a <b>bend</b>. That keeps wires tidy.',
      'You can also drag from one pin straight to another.',
      'Tap a wire to change its <b>colour</b> or delete it. Use red for 5 V, black for GND.',
    ),
  },
  {
    icon: 'layers', title: 'Breadboard basics',
    html: ul(
      'In each half of the breadboard, the five holes of one column (<b>a–e</b> or <b>f–j</b>) are connected together.',
      'The two halves are <b>not</b> connected across the middle channel. ICs straddle the channel.',
      'The long <b>+</b> (red) and <b>−</b> (blue) rails along the edges carry power. Connect them to 5V and GND of the board.',
    ) + tip('Two legs of the same part in the same column are short-circuited. Place resistors and LEDs across different columns.'),
  },
  {
    icon: 'code', title: 'Writing code',
    html: ul(
      'Sketches are Arduino C++: <code>setup()</code> runs once, <code>loop()</code> repeats forever.',
      'Supported: <code>pinMode</code>, <code>digitalWrite/Read</code>, <code>analogRead/Write</code>, <code>delay</code>, <code>millis</code>, <code>tone</code>, <code>pulseIn</code>, <code>attachInterrupt</code>, <code>String</code>, <code>Serial</code>, <code>EEPROM</code>, arrays, structs and classes.',
      'The key bar above the keyboard has <code>{ } ( ) ; = &lt; &gt;</code> and other symbols, plus <b>Tab</b> and arrow keys.',
      '<b>A− / A+</b> change the text size. 🔍 searches. The full-screen button gives the code the whole display.',
      'If compilation fails, the error message shows the line number and the line is highlighted.',
    ),
  },
  {
    icon: 'play', title: 'Running the simulation',
    html: ul(
      '<b>Run</b> compiles and starts the sketch; <b>Stop</b> ends it. Stop the simulation to edit the circuit.',
      'While running, <b>press buttons</b>, <b>turn potentiometers</b>, flip switches and type on keypads directly on the canvas.',
      '<b>Tap a sensor</b> (ultrasonic, DHT22, PIR, gas, soil, MPU6050…) to open its controls and change the distance, temperature, motion or gas level.',
      'The bar at the top shows the simulated time and speed. Moving dots on the wires show where current flows.',
    ),
  },
  {
    icon: 'terminal', title: 'Serial Monitor & Plotter',
    html: ul(
      'Open the <b>Serial</b> tab to see everything printed with <code>Serial.print()</code>.',
      'Type in the box at the bottom and press send to give input to <code>Serial.read()</code> / <code>readStringUntil()</code>.',
      'Switch to the <b>Plotter</b> to draw graphs. Print numbers on one line, e.g. <code>Serial.print("temp:"); Serial.println(t);</code>. Use <code>name:value</code> pairs separated by spaces for several lines.',
    ),
  },
  {
    icon: 'fullscreen', title: 'Full-screen mode',
    html: ul(
      'Tap the <b>full-screen</b> button in the side toolbar (or above the code). The phone\'s status and navigation bars hide and the circuit or code uses the whole display.',
      'In full screen each job gets the <b>whole display</b>: switch between circuit, code and serial with the tool rail on the left.',
      'Press <b>Run</b> in full screen and, if your sketch prints or reads with <code>Serial</code>, the circuit and the <b>Serial Monitor</b> appear together: side by side in landscape, one above the other in portrait. Sketches without Serial keep the whole screen for the circuit. Press <b>Stop</b> and you are back to one panel at a time.',
      'Exit with the top button of the rail or the phone\'s <b>Back</b> button.',
      'Turn the phone sideways (landscape): the circuit and the code can appear side by side. The <b>Split</b> button turns that on or off — in normal view and in full screen.',
    ) + tip('For the biggest workspace, turn the phone sideways and tap full screen.'),
  },
  {
    icon: 'warning', title: 'Real electronics lessons',
    html: ul(
      'An LED without a resistor draws too much current and <b>burns out</b> 💥. Use 220 Ω – 1 kΩ.',
      'A pin that supplies more than <b>40 mA</b> shows a warning. Use a transistor, MOSFET, relay or driver for motors and lamps.',
      'Connecting 5V straight to GND is a <b>short circuit</b>; the simulation stops and tells you.',
      'An input pin connected to nothing reads random values. Use <code>INPUT_PULLUP</code> or a pull-down resistor.',
      'Sensors and modules only work when their <b>VCC and GND</b> are connected.',
    ),
  },
  {
    icon: 'cpu', title: 'Delta PLC Lab (3D)',
    html: ol(
      'Open <b>PLC Lab</b> from the bottom bar. Start with a <b>Lab exercise</b> — every one is wired, programmed and ready.',
      'Press <b>Simulate</b>. The MCB powers the PLC, the 24 V supply, the HMI and the VFD. Switch to <b>✋ Operate</b> and press the buttons, the HMI touch screen or the VFD keypad right in 3D.',
      'In <b>⚡ Wire</b> mode tap a terminal, then the terminal it goes to. Green rings show valid ends; communication ports only accept matching cables (RS-232, RS-485, USB).',
      'In <b>Ladder</b> tap a cell and add contacts, coils, timers (TMR), counters (CNT) and instructions (MOV, ADD, CMP, MODRW…). Press <b>Download</b> to write the program to the PLC through the laptop USB cable, then <b>RUN</b>.',
      'While online the ladder shows live power flow. Tap an element to force an input or change a value. <b>Monitor</b> shows every device and the real Modbus frames on COM1 / COM2.',
      '<b>HMI</b> → <b>Design</b> to add buttons, lamps, numeric inputs, meters and trends linked to PLC devices. <b>VFD</b> shows the keypad, live data and all drive parameters.',
    ) + tip('Delta X / Y numbers are <b>octal</b> (X0–X7, X10–X17). <code>M1000</code> is always ON, <code>M1002</code> pulses at the first scan, <code>M1013</code> is a 1 s clock.')
      + tip('VFD by RS-485: PLC <code>MOV H87 D1120</code> + <code>SET M1143</code> (9600 8E1 RTU), drive Pr.09-04 = 14, Pr.00-20 = 1, Pr.00-21 = 2. Then <code>MODRW K1 K6 H2000 D0 K1</code> writes the run command (H12 = RUN FWD).'),
  },
  {
    icon: 'save', title: 'Saving, export & sharing',
    html: ul(
      'Projects are saved automatically on this phone. Find them in <b>My Projects</b>.',
      'In a project, the <b>⋮</b> menu lets you rename, export the project (<code>.rapti</code>) or the sketch (<code>.ino</code>), and share the code.',
      '<b>Menu → Open / import file</b> loads <code>.rapti</code> projects or <code>.ino</code> sketches.',
    ),
  },
  {
    icon: 'code', title: 'MicroPython (new in 3.0)',
    html: ol(
      'Create a project for an <b>ESP32</b>, <b>NodeMCU ESP8266</b> or <b>Raspberry Pi Pico</b> and choose <b>MicroPython</b>. In an existing project use <b>⋮ → Switch to MicroPython</b>.',
      'Write Python in the <b>Code</b> tab (<code>main.py</code>) — <code>from machine import Pin</code>, <code>time.sleep()</code>, <code>print()</code> and the rest of the basics work.',
      'Press <b>Run</b>. <code>print()</code> and <code>input()</code> use the Serial Monitor; errors show the line and the Python exception.',
    ) + ul(
      '<b>machine</b>: Pin (value / irq), ADC (read, read_u16), PWM (freq, duty, duty_u16, duty_ns), Timer, I2C / SoftI2C, UART, SPI, WDT, RTC, time_pulse_us.',
      '<b>time / utime</b>: sleep, sleep_ms, sleep_us, ticks_ms, ticks_us, ticks_diff.',
      'Drivers: <b>neopixel</b>, <b>dht</b> (DHT11 / DHT22), <b>ssd1306</b> (SSD1306_I2C with text, pixels, lines and rectangles), <b>onewire + ds18x20</b>, <b>hcsr04</b>, <b>math</b>, <b>random</b>, <b>json</b>, <b>sys</b>, <b>gc</b>, <b>os</b>.',
      'The language includes functions, classes, closures, comprehensions, f-strings, <code>try / except</code>, lambda, default and keyword arguments. Generators (<code>yield</code>) and <code>async</code> are not supported.',
    ) + tip('Open <b>Examples → MicroPython &amp; Pi</b>: blink, button, PWM fade, ADC, DHT22, OLED, NeoPixel, servo, timers + interrupts, Bluetooth and GPS.'),
  },
  {
    icon: 'activity', title: 'Oscilloscope, logic analyzer & function generator',
    html: ul(
      'Find them in <b>Parts → Measurement</b>. Connect the channel pins to the signals and the <b>GND</b> pin to ground.',
      '<b>Oscilloscope (4 ch)</b>: shows levels, <code>analogWrite()</code> PWM, <code>tone()</code>, servo pulses, MicroPython PWM and anything else once per frame. It measures frequency, duty and peak-to-peak. Tap it while running to change the time per division, freeze the trace (<i>Running</i>) or switch the CH1 rising-edge trigger.',
      '<b>Logic analyzer (8 ch)</b>: D0–D7 as a timing diagram — great for bit-banged data, clocks and latches.',
      '<b>Logic probe</b>: HI / LO / PULSE lamps plus frequency and duty.',
      '<b>Function generator</b>: sine, square, triangle, sawtooth or DC from 0.1 Hz to 20 kHz. Below 20 Hz the circuit follows it live (an <code>analogRead()</code> sees the moving voltage); above that the circuit sees the average, while the scope shows the true wave.',
    ) + tip('The simulator solves DC circuits: capacitors do not charge over time, so RC filters and 555 timers are not simulated. Instruments read the signals your code produces.'),
  },
  {
    icon: 'wifi', title: 'Bluetooth, GPS and other new parts',
    html: ul(
      '<b>HC-05 Bluetooth</b> + <b>virtual phone</b>: wire <code>TXD → RX pin</code> and <code>RXD → TX pin</code> (SoftwareSerial, <code>Serial1/2</code> or <code>machine.UART</code>). While running, tap the module, press <b>Connect phone</b> and send text or the quick buttons (ON, OFF, FWD …). Edit the button list in the part properties.',
      '<b>GPS NEO-6M</b>: sends NMEA sentences (GPGGA, GPRMC, GPGSA) at 9600 baud after a few seconds. Tap it to set the position, speed and heading, or drive it around on the map.',
      '<b>SoftwareSerial</b> is now supported on every Arduino board.',
      '<b>Power &amp; sensing</b>: 7805 / 7812 / AMS1117 regulator, ACS712 current sensor, 0–25 V voltage sensor, BMP280 (library <code>Adafruit_BMP280</code>).',
      '<b>Drivers &amp; robots</b>: TB6612FNG motor driver, solenoid, 8-way DIP switch, optocoupler, and a two-wheel <b>robot car</b> that drives around an arena.',
    ),
  },
  {
    icon: 'folder', title: 'Folders & quiz',
    html: ul(
      '<b>My Projects</b> now has <b>folders</b>: tap <b>＋ Folder</b>, then open a project\'s <b>⋮ → Move to folder</b>. Rename or delete a folder with the buttons under the chips (projects are kept).',
      '<b>Menu → Quiz</b>: multiple-choice questions on electronics, Arduino, MicroPython and PLC / VFD. Your best score for each topic is remembered.',
      '<b>PLC Lab</b> exercises are grouped by topic (ladder basics, motor control, VFD, process, complete projects) with six new labs: star-delta starter, bottle filling, tank level with HMI, alarm annunciator, step-ladder sequence and an automatic VFD speed cycle.',
    ),
  },
  {
    icon: 'book', title: 'Supported libraries',
    html: `<p>Use these <code>#include</code> libraries just like on a real board:</p><div class="gi-libs">${[
      'Servo', 'LiquidCrystal', 'LiquidCrystal_I2C', 'Wire', 'Adafruit_SSD1306', 'Adafruit_GFX', 'Adafruit_NeoPixel', 'TM1637Display', 'LedControl',
      'Arduino_LED_Matrix', 'DHT', 'DHTesp', 'NewPing', 'OneWire', 'DallasTemperature', 'Adafruit_MPU6050', 'MPU6050', 'RTClib', 'Keypad', 'IRremote',
      'Stepper', 'AccelStepper', 'EEPROM', 'SoftwareSerial', 'Adafruit_BMP280',
    ].map((l) => `<span>${l}</span>`).join('')}</div>`,
  },
];
