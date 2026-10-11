// Supply ratings of the modules: a module given far more than `max` volts (or its supply the wrong way
// round) burns after a few seconds (see sim/damage.js, SimEngine.wear). vcc / gnd are the pin ids.
import { getDef } from './registry.js';

const M5 = (vcc, gnd, max = 5.5) => ({ vcc, gnd, max });

const RATINGS = {
  'hc-sr04': M5('VCC', 'GND'), dht22: M5('VCC', 'GND'), 'ds18b20': M5('VDD', 'GND'), mpu6050: M5('VCC', 'GND', 6), 'rtc-ds1307': M5('VCC', 'GND'),
  'ldr-module': M5('VCC', 'GND', 6), 'sound-sensor': M5('VCC', 'GND', 6), 'flame-sensor': M5('VCC', 'GND', 6), 'gas-sensor': M5('VCC', 'GND', 6),
  'soil-sensor': M5('VCC', 'GND', 6), 'rain-sensor': M5('VCC', 'GND', 6), 'water-level': M5('VCC', 'GND', 6), 'ir-obstacle': M5('VCC', 'GND', 6),
  'line-sensor': M5('VCC', 'GND', 6), 'hall-sensor': M5('VCC', 'GND', 6), 'vibration-sensor': M5('VCC', 'GND', 6), 'ntc-module': M5('VCC', 'GND', 6),
  'touch-sensor': M5('VCC', 'GND'), 'ir-receiver': M5('VCC', 'GND', 6),
  servo: M5('V+', 'GND', 6.5), 'stepper-28byj': M5('+', '-', 8), 'stepper-a4988': M5('VDD', 'GND'), relay: M5('VCC', 'GND', 6.5),
  '74hc595': M5('VCC', 'GND', 6), mcp3008: M5('VDD', 'DGND', 6),
  'lcd-i2c': M5('VCC', 'GND'), lcd1602: M5('VDD', 'VSS'), 'oled-ssd1306': M5('VCC', 'GND'), tm1637: M5('VCC', 'GND'), max7219: M5('VCC', 'GND', 6),
  neopixel: M5('VCC', 'GND', 5.5),
};

for (const [type, r] of Object.entries(RATINGS)) {
  const def = getDef(type);
  if (def) def.ratings = r;
}
