# RaptiAuto

An Android app for designing and simulating Arduino and microcontroller projects — and now a 3D **Delta PLC / HMI / VFD** automation lab — on a phone, in the spirit of Wokwi. Made for RAPTI (Resonance Automation Professional Training Institute).

**Download:** [`release/RaptiAuto.apk`](release/RaptiAuto.apk) — Android 7.0+ (API 24), signed.

## Delta PLC Lab (new in 2.0)

A virtual industrial-automation trainer with Delta equipment, built for touch screens:

- **3D trainer (three.js):** a control panel with DIN rails and wire ducts, a Delta **DVP-16ES2 / 32ES2 / 20EX2** PLC, **DOP-107BV** 7" HMI on a stand, **MS300** VFD, Delta CliQ 24 V supply, MCB, an operator console (push buttons, E-stop, selector, pilot lamps, buzzer, PNP proximity sensor, speed pot), a 0.75 kW induction motor and the programming laptop. Orbit / pinch / pan, focus chips per device.
- **2D wiring schematic ↔ 3D (new in 2.1):** the 2D / 3D switch at the bottom left of the Lab tab shows the same lab as a wiring diagram: every device as a terminal-block symbol, each wire routed through the wire ducts on its own track, with live LEDs, lamps, the drive display, the HMI screen and current flow. Wire, operate and select exactly as in 3D. Slow phones (few CPU cores, little memory, “Fast” 3D quality, no WebGL 2 or a 3D view that renders too slowly) open in 2D; the choice is remembered.
- **Panel-style 3D wiring (new in 2.2):** every wire is laid like in a real control panel: out of its terminal, into the nearest slotted wire duct (open at the front, so the wiring stays visible), along the duct on a track of its own, down the side or middle vertical ducts and out through the bottom duct. Front terminals (VFD, PLC comm ports) drop down on their own plane, cables on the bench go around the console, HMI stand, motor base and laptop and lie over each other where they cross, and console patch cords come over the back edge. No wire runs through a device or another wire (checked by `tests/routing.mjs`).
- **Fixed-layout ladder (new in 2.3):** the ladder always fills the width of the screen — no sideways panning or zooming. Networks are stacked as cards and the program grows downward (plain vertical scrolling); long network comments wrap, device comments sit under each contact on up to two lines, and big instruction boxes (MODRW, SCAL …) make their row taller instead of wider.
- **Many more ladder instructions (2.3):** MEP / MEF, word-logic contacts (LD& LD| LD^), ZCP, CML, BMOV, FMOV, XCH, BCD, BIN, SWAP, NEG, ABS, SQR, MEAN, SCAL, WAND / WOR / WXOR, ROR / ROL, SFTR / SFTL, DECO, ENCO, SUM, BON, master control (MC / MCR), jumps and subroutines (CJ, CALL, SRET, FEND with pointer labels P0–P255) and the step ladder (STL / RET), all simulated by the CPU and listed in a searchable instruction picker.
- **3D camera stays outside (2.3):** zooming, orbiting or panning stops just in front of a device, the enclosure, the console or the bench — the view never goes inside an object.
- **Smooth, flicker-free 3D (2.2):** no more z-fighting on the laptop and HMI screens and labels, no blank frames on resize, the laptop screen is only redrawn when it changes, the depth range follows the camera, and the resolution steps down on slow GPUs instead of stuttering. Switching 2D ↔ 3D shows "Loading 3D…" instead of freezing, never gets stuck on a lost touch, and a lost GPU context falls back to 2D.
- **Fixes in 2.3.1:** no more flicker on the top / bottom terminal strips of the PLC in 3D (the terminal blocks no longer share a face with the housing, and the 3D view asks the phone for a 24-bit depth buffer); the drive display in the 2D schematic stays inside its window; "Wire", 2D / 3D and the focus chips keep their dark glass over a bright 3D panel; in full screen every control and the ladder / HMI / VFD / monitor tool bars start below the punch-hole camera or notch.
- **Fixes in 2.3.2:** the 3D focus chips (Overview, Panel, PLC, HMI, VFD …) use the full width of the screen when the tool rail is out of the way, and fade at the edge when more can be scrolled to; the Delta PLC Lab card on the home screen no longer lays its picture over the text on wider phones (the picture goes below the buttons on any phone); in full screen the menus that ☰ brings up float on frosted (blurred) glass, and the tab bar now sits as a dock at the bottom centre with the run status just above it (above the ladder / HMI footer and the 3D focus chips), so the ladder, HMI, VFD and monitor tool bars at the top and the start of every rung stay uncovered. The programming laptop in 3D has a real keyboard: raised chiclet keycaps in a dark well with a full laptop layout (half-height function row, number row, QWERTY rows, wide Tab / Caps / Shift / Enter / Backspace, a long space bar, inverted-T arrow keys) and printed legends, plus a glass touchpad.
- **New in 2.4:** a **magnetic contactor** (3 main poles, 1NO + 1NC auxiliary, 24 V DC or 230 V AC coil, can be pushed in by hand), a **thermal overload relay** (95–96 / 97–98, test-trip and reset) and **industrial sensors**: inductive, capacitive and photoelectric sensors (PNP or NPN), a roller limit switch, a float level switch and 0–10 V temperature and pressure transmitters. New example lab *Motor starter: contactor + overload relay* with self-checking tasks. Fixes: switching from 3D to 2D no longer leaves the frozen 3D picture on screen; the online Set / Force menu on a ladder contact no longer closes right after it opens.
- **Wiring in 3D:** tap a terminal, tap the other end. Panel wires with ferrules, banana patch cords on the console, real connectors for COM1 (RS-232 mini-DIN ↔ D-sub), COM2 (RS-485 ↔ RJ45) and USB. Valid ends glow; U/V/W and L/N/PE are completed automatically; a wiring list editor is included.
- **Operate in 3D:** press buttons, flip the MCB and RUN/STOP switch, tap the live HMI touch screen and the VFD keypad. LEDs, lamps, the 7-segment drive display and the motor shaft react; powered wires show current flow, busy comm cables show data pulses.
- **Electrical model:** supply nets, sink/source inputs via S/S, relay output groups, VFD NPN/PNP inputs, 0–10 V analog (pot, AVI, EX2 AI/AO), shorts trip the PSU or the MCB, swapped motor phases reverse rotation.
- **Ladder editor (ISPSoft-style):** cursor grid, NO/NC/edge/parallel contacts, compare contacts, OUT/SET/RST/PLS/PLF, TMR, CNT, 40+ API instructions with pulse versions (see 2.3 above), an octal-aware operand keypad, device comments, live compile with errors, Delta IL listing (LD/AND/OR/ANB/ORB/MPS/MPP), download over USB, PLC RUN/STOP, live power flow and online force/set.
- **DVP CPU:** X/Y octal addressing, M/S/T/C/D, 100/10/1 ms and accumulative timers, counters, latched ranges, special relays (M1000, M1002, M1013 …), scan time D1010, COM2 settings D1120/M1143, MODRW Modbus master.
- **HMI (DOPSoft-style):** screens with buttons, lamps, numeric display/input with an on-screen keypad, meters, bars, trends, motor icons, screen buttons and alarm banners; drag/resize designer; Delta DVP protocol on COM1/COM2 with comm-error handling.
- **MS300 drive:** keypad (F/H/A/U, parameter mode), 35 parameters (00-20/00-21 sources, accel/decel, multi-step, MI functions, relay, RS-485 09-xx), terminal / RS-485 / AVI control, ramps, motor current and slip, ocA/ovd/EoL1/EF/CE10 faults, Modbus registers 2000H/2001H/21xxH.
- **Monitor:** device monitor (X/Y/M/T/C/D), watch list, and a communication analyser showing real Modbus RTU / ASCII frames with CRC / LRC.
- **Lab exercises:** start/stop latch, motor starter with contactor + overload relay, traffic light timers, part counter with HMI, VFD FWD/REV multi-speed, VFD speed via Modbus RTU + HMI, analog speed (pot → EX2 → AVI), and a blank lab.

## Features

- **Boards:** Arduino Uno R3, Uno R4 Minima, Uno R4 WiFi (12×8 LED matrix), Nano, Mega 2560, Leonardo, ESP32 DevKit, NodeMCU ESP8266, Raspberry Pi Pico, STM32 Blue Pill, ATtiny85.
- **80+ components:** LEDs, RGB LEDs, resistors, buttons, switches, potentiometers, transistors, MOSFETs, diodes, batteries, multimeter, LCD 16×2 (parallel and I²C), OLED SSD1306, TM1637, MAX7219, 7-segment, NeoPixel, keypad, joystick, rotary encoder, IR remote, HC-SR04, DHT11/22, PIR, LM35, DS18B20, MPU6050, RTC, gas, soil, flame, sound and rain sensors, servo, DC motor, 28BYJ-48 and A4988 steppers, relay, L298N, 74HC595, and more.
- **Real simulation:** an Arduino C/C++ interpreter (`setup`/`loop`, `millis`, interrupts, `String`, `Serial`, `EEPROM`) and a DC circuit solver. LEDs burn out without a resistor, short circuits are detected, and floating inputs read noise.
- **Libraries:** Servo, LiquidCrystal(_I2C), Adafruit SSD1306/GFX, Adafruit NeoPixel, TM1637Display, LedControl, DHT, OneWire + DallasTemperature, Adafruit MPU6050, RTClib, Keypad, IRremote, Stepper, AccelStepper, NewPing, Arduino_LED_Matrix.
- **Touch gestures (Arduino and PLC alike):** pinch to zoom, or double-tap, hold and slide down / up to zoom in / out like Google Maps (a plain double tap on empty space zooms in). **AutoCAD-style selection:** with the Select tool (dashed box), or by pressing and holding on an empty spot and then dragging, drag to the right for a solid blue *window* (selects what is completely inside) or to the left for a dashed green *crossing* box (selects everything it touches). Tapping with the Select tool adds or removes single items. Selected parts can be moved together, copied (with the wires between them) or deleted; selected PLC wires can be recoloured or deleted together.
- **Full screen without menus:** full screen hides the top bar, the tabs and every tool bar; the small ☰ handle in the top right corner brings them back. The menus float over the circuit, the code or the Serial Monitor on frosted (blurred) glass, so showing them never shrinks the view or re-wraps the code (2.3).
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
| `node tests/routing.mjs` | 3D cable routing: no cable through a device, the console or the bench, no two cables overlapping, duct runs inside the ducts |
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
- `web/src/plc/devices/`: Delta device catalogue (ports, terminals), the automatic 3D layout and the 3D cable router (`routing.js`).
- `web/src/plc/three/`: three.js scene, procedural device models, cables.
- `web/src/plc/ui/`: lab screen, 3D panel, 2D wiring schematic (`schematic.js`, switched by `scene-switch.js`), ladder editor, HMI designer, VFD view, monitor.
- `web/src/ui/gestures.js`: double-tap zoom and the window / crossing selection box shared by both simulators.
