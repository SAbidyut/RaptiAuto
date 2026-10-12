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
      '<b>Mirror</b> and <b>Flip</b> turn a part (or a whole selection, board included) left–right or upside-down; <b>Rotate</b> turns it in 90° steps. Labels stay readable.',
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
      'An LED without a resistor draws too much current and <b>burns out</b> 💥: it glares for a few seconds, flashes, smokes once and stays black (stop and run again = a new LED). Use 220 Ω – 1 kΩ.',
      'Heat builds up like in real life: an LED at 20 mA lives for ever, at 60 mA it lasts seconds; a ¼ W resistor at twice its rating cooks after a while; a pin that is shorted or fed 5 V on a 3.3 V board dies.',
      'A pin that supplies more than <b>40 mA</b> shows a warning. Use a transistor, MOSFET, relay or driver for motors and lamps.',
      'Connecting 5V straight to GND is a <b>short circuit</b>; the simulation stops and tells you.',
      'An input pin connected to nothing reads random values. Use <code>INPUT_PULLUP</code> or a pull-down resistor.',
      'Sensors and modules only work when their <b>VCC and GND</b> are connected.',
    ),
  },
  {
    icon: 'globe', title: 'IoT & Wi-Fi (ESP32, ESP8266, Uno R4 WiFi)',
    html: ol(
      'Open <b>Examples → IoT & Wi-Fi</b> (or add an <b>ESP32 / NodeMCU / Uno R4 WiFi</b> board) and press <b>Run</b>. The board joins the simulated router <code>RaptiNet</code> (password <code>rapti1234</code>) and gets an IP address like <code>192.168.1.50</code>.',
      'Open the <b>IoT</b> tab: it is the phone on the same Wi-Fi. Tap the board\'s address to see its web page, open the <b>Dashboard</b> for the devices, the MQTT topics (with a publish box), ThingSpeak charts, Blynk pins, Telegram chat and a Bluetooth terminal.',
      'The dashboard has switches for the <b>Router</b> and the <b>Internet</b> — turn them off to see how your sketch copes. <b>Strict Wi-Fi</b> makes a wrong network name fail like a real router.',
      '<b>Real internet:</b> with the phone online and <b>Settings → Real internet</b> on (also a switch in the dashboard), weather, time, air quality, prayer times, exchange rates, the ISS, quotes and any web page come from the real internet — the Pi\'s Chromium opens real websites. Services that need your own account (ThingSpeak, Blynk, Telegram, IFTTT, webhooks) stay simulated so their data shows in the dashboard. Offline, or when a real service fails, the simulator answers in the same format.',
      'Find a project fast: <b>Examples</b> has one search box for Arduino, Raspberry Pi and PLC examples (try <i>weather</i>, <i>MQTT</i>, <i>prayer</i>, <i>air quality</i>).',
    ) + ul(
      'Libraries: <code>WiFi</code>, <code>WiFiClient</code> / <code>WiFiClientSecure</code> (with <code>setInsecure()</code>), <code>WiFiServer</code>, <code>WebServer</code> / <code>ESP8266WebServer</code>, <code>HTTPClient</code>, <code>PubSubClient</code> (MQTT), <code>ArduinoJson</code> (with <code>DeserializationOption::Filter</code>), <code>ThingSpeak</code>, <code>Blynk</code>, <code>UniversalTelegramBot</code>, <code>NTPClient</code>, <code>ESPmDNS</code>, <code>Preferences</code>, <code>BluetoothSerial</code>, <code>WiFiMulti</code>, <code>time.h</code>.',
      'Mistakes fail like on real hardware: <code>#include &lt;WiFi.h&gt;</code> on an Uno, HTTPS without <code>setInsecure()</code>, a forgotten <code>server.handleClient()</code>, MQTT messages bigger than the 256-byte buffer, 5 V on a 3.3 V pin.',
    ) + tip('The Raspberry Pi Lab uses the same (simulated or real) internet and IoT dashboard (Chromium, <code>requests</code>, MQTT, Flask), so Python programs can call the same weather, ThingSpeak and Telegram services.'),
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
    icon: 'network', title: 'Modbus network (RS-485)',
    html: ol(
      'Open the lab exercise <b>Modbus RTU network</b>: the PLC COM2 is the master of one RS-485 line with four slaves — the MS300 drive (ID 1), a <b>DTB4848</b> temperature controller with an oven (ID 2), an RS-485 <b>temperature / humidity sensor</b> (ID 3) and an <b>energy meter</b> (ID 4). The HMI talks to the PLC on COM1.',
      'Press <b>Simulate</b>, then the <b>Network</b> chip in the Lab tab: the 3D panel turns into an x-ray of the communication. The RS-485 cable glows violet, RS-232 amber, USB blue; every device shows its role and station address; the two ends of the line get their 120 Ω resistors.',
      'While the lab runs, the ring of a port pulses <b>green</b> when its station answers the master and <b>red</b> when it does not. Zoom in to read the name of every port; the TX / RX LEDs of each device blink with its frames.',
      'Tap a communication cable → <b>Pin-out</b>: both connectors, which pin goes where (RS-232 crosses TX and RX), and the settings both ends must share.',
      '<b>Monitor → Network</b> lists the line as it is cabled with the live state of every station; tap a station for its register map with live values.',
    ) + ul(
      'Add Modbus devices with ＋ → <b>Modbus RS-485 devices</b>. Daisy-chain them: PLC COM2 → device → device (each RS-485 port takes two cables).',
      'Every slave needs its <b>own station address</b> and the master\'s <b>baud rate, data format and RTU / ASCII</b> (device Settings; the PLC uses D1120 / M1143). Two slaves with the same address answer together and their replies collide.',
      '<code>MODRW Kstation Kfunction Haddress Dn Kcount</code>: function 3 / 4 reads words, 1 / 2 reads bits (16 per register), 6 / 16 writes words, 5 / 15 writes bits. M1129 = time-out.',
    ) + tip('DTB4848: 1000H PV, 1001H SV (0.1 °C), bit 0814H RUN / STOP. Sensor: 0000H temperature, 0001H humidity. Meter: 0000H V, 0001H A, 0002H W, 0005H / 0006H Wh.'),
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
      'WiFi', 'WiFiClient', 'WebServer', 'HTTPClient', 'PubSubClient', 'ArduinoJson', 'ThingSpeak', 'Blynk', 'UniversalTelegramBot', 'NTPClient', 'Preferences', 'BluetoothSerial', 'ESPmDNS', 'WiFiMulti',
    ].map((l) => `<span>${l}</span>`).join('')}</div>`,
  },
];
