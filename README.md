# RaptiAuto

An Android app for designing and simulating Arduino and microcontroller projects — and now a 3D **Delta PLC / HMI / VFD** automation lab — on a phone, in the spirit of Wokwi. Made for RAPTI (Resonance Automation Professional Training Institute).

**Download:** [`release/RaptiAuto.apk`](release/RaptiAuto.apk) — Android 7.0+ (API 24), signed.

## Delta PLC Lab (new in 2.0)

A virtual industrial-automation trainer with Delta equipment, built for touch screens:

- **3D trainer (three.js):** a control panel with DIN rails and wire ducts, a Delta **DVP-16ES2 / 32ES2 / 20EX2** PLC, **DOP-107BV** 7" HMI on a stand, **MS300** VFD, Delta CliQ 24 V supply, MCB, an operator console (push buttons, E-stop, selector, pilot lamps, buzzer, PNP proximity sensor, speed pot), a 0.75 kW induction motor and the programming laptop. Orbit / pinch / pan, focus chips per device.
- **2D wiring schematic ↔ 3D (new in 2.1):** the 2D / 3D switch at the bottom left of the Lab tab shows the same lab as a wiring diagram: every device as a terminal-block symbol, each wire routed through the wire ducts on its own track, with live LEDs, lamps, the drive display, the HMI screen and current flow. Wire, operate and select exactly as in 3D. Slow phones (few CPU cores, little memory, “Fast” 3D quality, no WebGL 2 or a 3D view that renders too slowly) open in 2D; the choice is remembered.
- **Wiring in 3D:** tap a terminal, tap the other end. Panel wires with ferrules, banana patch cords on the console, real connectors for COM1 (RS-232 mini-DIN ↔ D-sub), COM2 (RS-485 ↔ RJ45) and USB. Valid ends glow; U/V/W and L/N/PE are completed automatically; a wiring list editor is included.
- **Operate in 3D:** press buttons, flip the MCB and RUN/STOP switch, tap the live HMI touch screen and the VFD keypad. LEDs, lamps, the 7-segment drive display and the motor shaft react; powered wires show current flow, busy comm cables show data pulses.
- **Electrical model:** supply nets, sink/source inputs via S/S, relay output groups, VFD NPN/PNP inputs, 0–10 V analog (pot, AVI, EX2 AI/AO), shorts trip the PSU or the MCB, swapped motor phases reverse rotation.
- **Ladder editor (ISPSoft-style):** cursor grid, NO/NC/edge/parallel contacts, compare contacts, OUT/SET/RST/PLS/PLF, TMR, CNT, MOV/ADD/SUB/MUL/DIV/INC/DEC/CMP/ZRST/ALT/MODRW with pulse versions, an octal-aware operand keypad, device comments, live compile with errors, Delta IL listing (LD/AND/OR/ANB/ORB/MPS/MPP), download over USB, PLC RUN/STOP, live power flow and online force/set.
- **DVP CPU:** X/Y octal addressing, M/S/T/C/D, 100/10/1 ms and accumulative timers, counters, latched ranges, special relays (M1000, M1002, M1013 …), scan time D1010, COM2 settings D1120/M1143, MODRW Modbus master.
- **HMI (DOPSoft-style):** screens with buttons, lamps, numeric display/input with an on-screen keypad, meters, bars, trends, motor icons, screen buttons and alarm banners; drag/resize designer; Delta DVP protocol on COM1/COM2 with comm-error handling.
- **MS300 drive:** keypad (F/H/A/U, parameter mode), 35 parameters (00-20/00-21 sources, accel/decel, multi-step, MI functions, relay, RS-485 09-xx), terminal / RS-485 / AVI control, ramps, motor current and slip, ocA/ovd/EoL1/EF/CE10 faults, Modbus registers 2000H/2001H/21xxH.
- **Monitor:** device monitor (X/Y/M/T/C/D), watch list, and a communication analyser showing real Modbus RTU / ASCII frames with CRC / LRC.
- **Lab exercises:** start/stop latch, traffic light timers, part counter with HMI, VFD FWD/REV multi-speed, VFD speed via Modbus RTU + HMI, analog speed (pot → EX2 → AVI), and a blank lab.

## Features

- **Boards:** Arduino Uno R3, Uno R4 Minima, Uno R4 WiFi (12×8 LED matrix), Nano, Mega 2560, Leonardo, ESP32 DevKit, NodeMCU ESP8266, Raspberry Pi Pico, STM32 Blue Pill, ATtiny85.
- **80+ components:** LEDs, RGB LEDs, resistors, buttons, switches, potentiometers, transistors, MOSFETs, diodes, batteries, multimeter, LCD 16×2 (parallel and I²C), OLED SSD1306, TM1637, MAX7219, 7-segment, NeoPixel, keypad, joystick, rotary encoder, IR remote, HC-SR04, DHT11/22, PIR, LM35, DS18B20, MPU6050, RTC, gas, soil, flame, sound and rain sensors, servo, DC motor, 28BYJ-48 and A4988 steppers, relay, L298N, 74HC595, and more.
- **Real simulation:** an Arduino C/C++ interpreter (`setup`/`loop`, `millis`, interrupts, `String`, `Serial`, `EEPROM`) and a DC circuit solver. LEDs burn out without a resistor, short circuits are detected, and floating inputs read noise.
- **Libraries:** Servo, LiquidCrystal(_I2C), Adafruit SSD1306/GFX, Adafruit NeoPixel, TM1637Display, LedControl, DHT, OneWire + DallasTemperature, Adafruit MPU6050, RTClib, Keypad, IRremote, Stepper, AccelStepper, NewPing, Arduino_LED_Matrix.
- **Touch gestures (Arduino and PLC alike):** pinch to zoom, or double-tap, hold and slide down / up to zoom in / out like Google Maps (a plain double tap on empty space zooms in). **AutoCAD-style selection:** with the Select tool (dashed box), or by pressing and holding on an empty spot and then dragging, drag to the right for a solid blue *window* (selects what is completely inside) or to the left for a dashed green *crossing* box (selects everything it touches). Tapping with the Select tool adds or removes single items. Selected parts can be moved together, copied (with the wires between them) or deleted; selected PLC wires can be recoloured or deleted together.
- **Full screen without menus:** full screen hides the top bar, the tabs and every tool bar; the small ☰ handle in the top right corner brings them back.
- **Mobile-first editor:** pinch-zoom canvas, magnetic snapping onto breadboards, true full-screen mode for both the circuit and the code editor, a code editor with Arduino-aware highlighting and an extra key bar, a Serial Monitor and Plotter, and live controls for sensors (drag the distance, temperature, gas level, ...).
- **42 example projects** across basics, sensors, displays, motors, ESP32/Pico and pure electronics.
- **About** section with information about RAPTI from [rapti.net](https://www.rapti.net/).

## Building

The APK is built without Gradle, using the Android SDK command-line tools from Ubuntu packages (`aapt`, `dx`, `zipalign`, `apksigner`, `android.jar` API 23+) plus Node.js 20+.

```sh
cd web && npm install && cd ..
./tools/build-apk.sh          # → release/RaptiAuto.apk
```

Other scripts:

| Command | Purpose |
| --- | --- |
| `node tests/examples.mjs` | Run every example headless, with functional checks |
| `node tests/devices.mjs` | Device and library tests |
| `node tests/plc.mjs` | PLC lab: ladder/IL, CPU, Modbus, VFD, wiring and full lab simulations |
| `node tests/schematic.mjs` | 2D wiring schematic: layout, wire routing through the ducts, window / crossing selection |
| `node tools/icons.mjs` | Regenerate launcher icons and the splash logo from the logo SVG |
| `node tools/shot.mjs <dir> home run:<example>:<ms>` | Screenshots in a phone-sized Chromium |

## Layout

- `android/`: the native shell (a WebView with an asset server, a JS bridge for fullscreen, files, sharing and haptics).
- `web/src/sim/lang/`: the C++ preprocessor, parser, compiler and runtime.
- `web/src/sim/`: the circuit solver, netlist, simulation engine and libraries.
- `web/src/components/`: component definitions (artwork plus simulation models).
- `web/src/ui/`: the app screens.
- `web/src/examples/`: the example gallery.
- `web/src/plc/sim/`: PLC lab simulation (DVP CPU, ladder compiler/IL, MS300 drive, Modbus, HMI runtime, lab system).
- `web/src/plc/devices/`: Delta device catalogue (ports, terminals) and the automatic 3D layout.
- `web/src/plc/three/`: three.js scene, procedural device models, cables.
- `web/src/plc/ui/`: lab screen, 3D panel, 2D wiring schematic (`schematic.js`, switched by `scene-switch.js`), ladder editor, HMI designer, VFD view, monitor.
- `web/src/ui/gestures.js`: double-tap zoom and the window / crossing selection box shared by both simulators.
