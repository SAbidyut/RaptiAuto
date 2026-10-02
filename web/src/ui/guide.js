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
    icon: 'save', title: 'Saving, export & sharing',
    html: ul(
      'Projects are saved automatically on this phone. Find them in <b>My Projects</b>.',
      'In a project, the <b>⋮</b> menu lets you rename, export the project (<code>.rapti</code>) or the sketch (<code>.ino</code>), and share the code.',
      '<b>Menu → Open / import file</b> loads <code>.rapti</code> projects or <code>.ino</code> sketches.',
    ),
  },
  {
    icon: 'book', title: 'Supported libraries',
    html: `<p>Use these <code>#include</code> libraries just like on a real board:</p><div class="gi-libs">${[
      'Servo', 'LiquidCrystal', 'LiquidCrystal_I2C', 'Wire', 'Adafruit_SSD1306', 'Adafruit_GFX', 'Adafruit_NeoPixel', 'TM1637Display', 'LedControl',
      'Arduino_LED_Matrix', 'DHT', 'DHTesp', 'NewPing', 'OneWire', 'DallasTemperature', 'Adafruit_MPU6050', 'MPU6050', 'RTClib', 'Keypad', 'IRremote',
      'Stepper', 'AccelStepper', 'EEPROM',
    ].map((l) => `<span>${l}</span>`).join('')}</div>`,
  },
];
