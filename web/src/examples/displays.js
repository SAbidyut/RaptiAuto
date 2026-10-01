// Display examples: character LCDs, OLED, 7-segment modules, LED matrices, NeoPixels.
import { P, W, C, at, R, UNO } from './helpers.js';

export function lcdI2cHello() {
  const u = UNO();
  const lcd = at('lcd-i2c', 'GND', 300, 290, { size: '1602', backlight: 'blue', address: '39' }, 0, 'lcd');
  return {
    id: 'lcd-i2c-hello', name: 'LCD 16×2 I²C — Hello World', category: 'displays', level: 'beginner',
    description: 'Only four wires: an LCD with an I²C backpack (address 0x27) shows text and a running timer.',
    parts: [u, lcd],
    wires: [
      R(u, '5V', lcd, 'VCC', C.red, [270]),
      R(u, 'GND.2', lcd, 'GND', C.black, [260]),
      R(u, 'A4', lcd, 'SDA', C.blue, [250]),
      R(u, 'A5', lcd, 'SCL', C.yellow, [240]),
    ],
    code: `// LCD 16x2 with I2C backpack (SDA = A4, SCL = A5 on the Uno)
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);   // address, columns, rows

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Hello RaptiAuto!");
}

void loop() {
  unsigned long s = millis() / 1000;
  lcd.setCursor(0, 1);
  lcd.print("Uptime: ");
  if (s / 60 < 10) lcd.print('0');
  lcd.print(s / 60);
  lcd.print(':');
  if (s % 60 < 10) lcd.print('0');
  lcd.print(s % 60);
  delay(200);
}
`,
  };
}

export function lcdParallel() {
  const u = UNO();
  const lcd = at('lcd1602', 'VSS', 320, 60, { size: '1602', backlight: 'green' }, 0, 'lcd');
  return {
    id: 'lcd-parallel', name: 'LCD 16×2 (parallel, 4-bit)', category: 'displays', level: 'intermediate',
    description: 'The classic LiquidCrystal wiring: RS, E and four data lines. Custom characters make a heart and a smiley.',
    parts: [u, lcd],
    wires: [
      R(u, 'D2', lcd, 'RS', C.orange, [-6]),
      R(u, 'D3', lcd, 'E', C.yellow, [-12]),
      R(u, 'D4', lcd, 'D4', C.green, [-18]),
      R(u, 'D5', lcd, 'D5', C.blue, [-24]),
      R(u, 'D6', lcd, 'D6', C.purple, [-30]),
      R(u, 'D7', lcd, 'D7', C.white, [-36]),
      R(u, 'GND.2', lcd, 'VSS', C.black, [222, 296, 44]),
      R(u, '5V', lcd, 'VDD', C.red, [232, 304, 36]),
      R(u, 'GND.3', lcd, 'K', C.black, [252, 620, 44]),
      R(u, '5V', lcd, 'A', C.red, [262, 630, 36]),
    ],
    code: `// LCD 16x2 in 4-bit mode: LiquidCrystal(rs, en, d4, d5, d6, d7)
// RW is tied LOW (write only) and V0 sets the contrast.
#include <LiquidCrystal.h>

LiquidCrystal lcd(2, 3, 4, 5, 6, 7);

byte heart[8] = { 0b00000, 0b01010, 0b11111, 0b11111, 0b01110, 0b00100, 0b00000, 0b00000 };
byte smile[8] = { 0b00000, 0b01010, 0b01010, 0b00000, 0b10001, 0b01110, 0b00000, 0b00000 };

void setup() {
  lcd.begin(16, 2);
  lcd.createChar(0, heart);
  lcd.createChar(1, smile);
  lcd.print("I ");
  lcd.write(byte(0));
  lcd.print(" Arduino ");
  lcd.write(byte(1));
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Count: ");
  lcd.print(millis() / 500);
  delay(250);
}
`,
  };
}

export function oledGraphics() {
  const u = UNO();
  const oled = at('oled-ssd1306', 'GND', 150, -40, { color: 'white', address: '60' }, 0, 'oled');
  return {
    id: 'oled-graphics', name: 'OLED Graphics (SSD1306)', category: 'displays', level: 'intermediate',
    description: 'Draw text, shapes and a bouncing ball on a 128×64 OLED with the Adafruit GFX API.',
    parts: [u, oled],
    wires: [
      R(oled, 'SCL', u, 'SCL', C.yellow, [-30]),
      R(oled, 'SDA', u, 'SDA', C.blue, [-20]),
      R(oled, 'GND', u, 'GND.1', C.black, [-10]),
      R(oled, 'VCC', u, '5V', C.red, [-36, -24, 236]),
    ],
    code: `// OLED 128x64 (SSD1306, I2C address 0x3C)
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

int x = 20, y = 30, dx = 3, dy = 2;
const int R = 5;

void setup() {
  Serial.begin(9600);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("SSD1306 not found");
    for (;;);
  }
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(10, 20);
  display.println("RaptiAuto");
  display.display();
  delay(1500);
}

void loop() {
  display.clearDisplay();
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(4, 4);
  display.print("t=");
  display.print(millis() / 1000);
  display.print("s");

  // Bouncing ball
  x += dx; y += dy;
  if (x < R + 1 || x > 126 - R) dx = -dx;
  if (y < R + 1 || y > 62 - R) dy = -dy;
  display.fillCircle(x, y, R, SSD1306_WHITE);

  // Little bar graph
  for (int i = 0; i < 6; i++) {
    int h = 4 + (millis() / 100 + i * 7) % 16;
    display.fillRect(84 + i * 7, 60 - h, 5, h, SSD1306_WHITE);
  }
  display.display();
  delay(30);
}
`,
  };
}

export function tm1637Counter() {
  const u = UNO();
  const tm = at('tm1637', 'CLK', 230, -40, {}, 0, 'tm');
  return {
    id: 'tm1637-counter', name: '4-Digit Clock (TM1637)', category: 'displays', level: 'beginner',
    description: 'A TM1637 module needs only CLK and DIO. Shows a mm:ss stopwatch with a blinking colon.',
    parts: [u, tm],
    wires: [
      R(tm, 'CLK', u, 'D3', C.yellow),
      R(tm, 'DIO', u, 'D2', C.green),
      R(tm, 'VCC', u, '5V', C.red, [-20, 284, 236]),
      R(tm, 'GND', u, 'GND.2', C.black, [-28, 292, 226]),
    ],
    code: `// TM1637 4-digit display: stopwatch
#include <TM1637Display.h>

#define CLK 3
#define DIO 2

TM1637Display display(CLK, DIO);

void setup() {
  display.setBrightness(5);       // 0..7
  display.clear();
}

void loop() {
  unsigned long s = millis() / 1000;
  int mmss = (s / 60) * 100 + s % 60;
  bool colon = (millis() / 500) % 2;
  // 0b01000000 switches on the colon between the digits
  display.showNumberDecEx(mmss, colon ? 0b01000000 : 0, true);
  delay(100);
}
`,
  };
}

export function max7219Matrix() {
  const u = UNO();
  const mx = at('max7219', 'DIN', 134, -40, { modules: '1' }, 0, 'mx');
  return {
    id: 'max7219-matrix', name: '8×8 LED Matrix (MAX7219)', category: 'displays', level: 'intermediate',
    description: 'Drive 64 LEDs with three wires using LedControl. Shows animated icons: heart, smiley and arrow.',
    parts: [u, mx],
    wires: [
      R(mx, 'DIN', u, 'D12', C.green),
      R(mx, 'CS', u, 'D11', C.orange),
      R(mx, 'CLK', u, 'D10', C.yellow),
      R(mx, 'GND', u, 'GND.1', C.black, [-16]),
      R(mx, 'VCC', u, '5V', C.red, [-26, -24, 236]),
    ],
    code: `// MAX7219 8x8 matrix with the LedControl library
#include <LedControl.h>

// LedControl(DIN, CLK, CS, number of modules)
LedControl lc(12, 10, 11, 1);

byte heart[8] = { 0x00, 0x66, 0xFF, 0xFF, 0xFF, 0x7E, 0x3C, 0x18 };
byte smile[8] = { 0x3C, 0x42, 0xA5, 0x81, 0xA5, 0x99, 0x42, 0x3C };
byte arrow[8] = { 0x18, 0x3C, 0x7E, 0xFF, 0x18, 0x18, 0x18, 0x18 };

void show(byte img[]) {
  for (int row = 0; row < 8; row++) lc.setRow(0, row, img[row]);
}

void setup() {
  lc.shutdown(0, false);    // wake up the MAX7219
  lc.setIntensity(0, 8);    // brightness 0..15
  lc.clearDisplay(0);
}

void loop() {
  show(heart); delay(700);
  show(smile); delay(700);
  // Scroll the arrow upwards
  for (int s = 0; s < 8; s++) {
    for (int row = 0; row < 8; row++) lc.setRow(0, row, arrow[(row + s) % 8]);
    delay(80);
  }
}
`,
  };
}

export function neopixelRing() {
  const u = UNO();
  const ring = at('neopixel', 'DIN', 200, -40, { layout: 'ring16' }, 0, 'ring');
  return {
    id: 'neopixel-ring', name: 'NeoPixel Rainbow Ring', category: 'displays', level: 'beginner',
    description: '16 addressable RGB LEDs (WS2812B) on one data pin: a spinning rainbow with the Adafruit NeoPixel library.',
    parts: [u, ring],
    wires: [
      R(ring, 'DIN', u, 'D6', C.green),
      R(ring, 'GND', u, 'GND.1', C.black, [-20]),
      R(ring, 'VCC', u, '5V', C.red, [-28, -24, 236]),
    ],
    code: `// NeoPixel ring: rainbow animation
#include <Adafruit_NeoPixel.h>

#define PIN 6
#define NUM 16

Adafruit_NeoPixel ring(NUM, PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  ring.begin();
  ring.setBrightness(80);
}

void loop() {
  static uint16_t hue = 0;
  for (int i = 0; i < NUM; i++) {
    uint16_t h = hue + i * 65536L / NUM;
    ring.setPixelColor(i, ring.gamma32(ring.ColorHSV(h)));
  }
  ring.show();
  hue += 512;
  delay(20);
}
`,
  };
}

export function r4Matrix() {
  const u = P('uno-r4-wifi', 0, 0, {}, 0, 'uno');
  return {
    id: 'r4-matrix', name: 'Uno R4 WiFi LED Matrix', category: 'displays', level: 'beginner',
    description: 'The Uno R4 WiFi has a 12×8 red LED matrix on the board. Scroll text and show a heart — no wiring needed.',
    parts: [u], wires: [],
    code: `// Arduino Uno R4 WiFi: built-in 12x8 LED matrix
#include "ArduinoGraphics.h"
#include "Arduino_LED_Matrix.h"

ArduinoLEDMatrix matrix;

// 12 x 8 heart, one byte per LED
uint8_t heart[8][12] = {
  { 0,0,1,1,0,0,0,1,1,0,0,0 },
  { 0,1,0,0,1,0,1,0,0,1,0,0 },
  { 0,1,0,0,0,1,0,0,0,1,0,0 },
  { 0,0,1,0,0,0,0,0,1,0,0,0 },
  { 0,0,0,1,0,0,0,1,0,0,0,0 },
  { 0,0,0,0,1,0,1,0,0,0,0,0 },
  { 0,0,0,0,0,1,0,0,0,0,0,0 },
  { 0,0,0,0,0,0,0,0,0,0,0,0 }
};

void setup() {
  Serial.begin(115200);
  matrix.begin();
}

void loop() {
  matrix.renderBitmap(heart, 8, 12);
  delay(1000);

  matrix.beginDraw();
  matrix.stroke(0xFFFFFFFF);
  matrix.textScrollSpeed(60);
  matrix.textFont(Font_5x7);
  matrix.beginText(0, 1, 0xFFFFFF);
  matrix.println("  RaptiAuto  ");
  matrix.endText(SCROLL_LEFT);
  matrix.endDraw();
}
`,
  };
}

export function weatherStation() {
  const u = UNO();
  const dht = at('dht22', 'VCC', 230, -40, { model: '22' }, 0, 'dht');
  const lcd = at('lcd-i2c', 'GND', 300, 290, { size: '1602', backlight: 'blue', address: '39' }, 0, 'lcd');
  return {
    id: 'weather-station', name: 'Mini Weather Station', category: 'displays', level: 'intermediate',
    description: 'DHT22 + I²C LCD: temperature, humidity and a comfort message. Tap the DHT22 to change the weather.',
    parts: [u, dht, lcd],
    wires: [
      R(dht, 'DATA', u, 'D2', C.green),
      R(dht, 'VCC', u, '5V', C.red, [-22, -24, 236]),
      R(dht, 'GND', u, 'GND.3', C.black, [-28, 292, 232]),
      R(u, '5V', lcd, 'VCC', C.red, [270]),
      R(u, 'GND.2', lcd, 'GND', C.black, [260]),
      R(u, 'A4', lcd, 'SDA', C.blue, [250]),
      R(u, 'A5', lcd, 'SCL', C.yellow, [240]),
    ],
    code: `// Mini weather station: DHT22 + LCD 16x2 I2C
#include <DHT.h>
#include <LiquidCrystal_I2C.h>

DHT dht(2, DHT22);
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  dht.begin();
  lcd.init();
  lcd.backlight();
  lcd.print("Weather station");
  delay(1000);
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  lcd.clear();
  if (isnan(t) || isnan(h)) {
    lcd.print("Sensor error!");
  } else {
    lcd.print(t, 1);
    lcd.print((char)223);       // degree symbol
    lcd.print("C  ");
    lcd.print(h, 0);
    lcd.print("% RH");
    lcd.setCursor(0, 1);
    if (t > 30) lcd.print("Hot! Drink water");
    else if (t < 15) lcd.print("Cold - wear coat");
    else if (h > 70) lcd.print("Humid & sticky");
    else lcd.print("Comfortable :)");
  }
  delay(2000);
}
`,
  };
}
