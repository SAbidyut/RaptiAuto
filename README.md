# RaptiAuto

An Android app for designing and simulating Arduino and microcontroller projects on a phone, in the spirit of Wokwi. Made for RAPTI (Resonance Automation Professional Training Institute).

**Download:** [`release/RaptiAuto.apk`](release/RaptiAuto.apk) — Android 7.0+ (API 24), signed, ~0.7 MB.

## Features

- **Boards:** Arduino Uno R3, Uno R4 Minima, Uno R4 WiFi (12×8 LED matrix), Nano, Mega 2560, Leonardo, ESP32 DevKit, NodeMCU ESP8266, Raspberry Pi Pico, STM32 Blue Pill, ATtiny85.
- **80+ components:** LEDs, RGB LEDs, resistors, buttons, switches, potentiometers, transistors, MOSFETs, diodes, batteries, multimeter, LCD 16×2 (parallel and I²C), OLED SSD1306, TM1637, MAX7219, 7-segment, NeoPixel, keypad, joystick, rotary encoder, IR remote, HC-SR04, DHT11/22, PIR, LM35, DS18B20, MPU6050, RTC, gas, soil, flame, sound and rain sensors, servo, DC motor, 28BYJ-48 and A4988 steppers, relay, L298N, 74HC595, and more.
- **Real simulation:** an Arduino C/C++ interpreter (`setup`/`loop`, `millis`, interrupts, `String`, `Serial`, `EEPROM`) and a DC circuit solver. LEDs burn out without a resistor, short circuits are detected, and floating inputs read noise.
- **Libraries:** Servo, LiquidCrystal(_I2C), Adafruit SSD1306/GFX, Adafruit NeoPixel, TM1637Display, LedControl, DHT, OneWire + DallasTemperature, Adafruit MPU6050, RTClib, Keypad, IRremote, Stepper, AccelStepper, NewPing, Arduino_LED_Matrix.
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
| `node tools/icons.mjs` | Regenerate launcher icons and the splash logo from the logo SVG |
| `node tools/shot.mjs <dir> home run:<example>:<ms>` | Screenshots in a phone-sized Chromium |

## Layout

- `android/`: the native shell (a WebView with an asset server, a JS bridge for fullscreen, files, sharing and haptics).
- `web/src/sim/lang/`: the C++ preprocessor, parser, compiler and runtime.
- `web/src/sim/`: the circuit solver, netlist, simulation engine and libraries.
- `web/src/components/`: component definitions (artwork plus simulation models).
- `web/src/ui/`: the app screens.
- `web/src/examples/`: the example gallery.
