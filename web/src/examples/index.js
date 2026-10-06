// Example gallery.
import { resetIds } from './helpers.js';
import * as basics from './basics.js';
import * as sensors from './sensors.js';
import * as displays from './displays.js';
import * as motors from './motors.js';
import * as projects from './projects.js';
import * as python from './python.js';
import * as extA from './ext-a.js';
import * as extB from './ext-b.js';

export const EXAMPLE_CATEGORIES = [
  { id: 'basics', name: 'Basics' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'displays', name: 'Displays' },
  { id: 'motors', name: 'Motors' },
  { id: 'iot', name: 'ESP32 & Pico' },
  { id: 'electrical', name: 'Electrical' },
  { id: 'comm', name: 'Communication' },
  { id: 'robotics', name: 'Robotics' },
  { id: 'smart', name: 'Smart home & IoT' },
  { id: 'python', name: 'MicroPython & Pi' },
];

const builders = [
  basics.blink, basics.ledResistor, basics.buttonLed, basics.trafficLight, basics.fadePot, basics.rgbLed,
  basics.knightRider, basics.burnDemo, basics.serialCommands, basics.nightLight, basics.esp32Fade, basics.picoBlink,
  basics.voltageDivider, projects.shiftRegister, projects.buzzerMelody,
  sensors.ultrasonic, sensors.dht22Monitor, sensors.pirAlarm, sensors.lm35Thermometer, sensors.gasAlarm, sensors.ds18b20Temp,
  sensors.mpu6050Tilt, sensors.joystick, sensors.plantWatering, projects.irRemote, projects.rotaryEncoder,
  displays.lcdI2cHello, displays.lcdParallel, displays.oledGraphics, displays.tm1637Counter, displays.max7219Matrix,
  displays.neopixelRing, displays.r4Matrix, displays.weatherStation, projects.rtcClock, projects.keypadLock,
  motors.servoSweep, motors.servoKnob, motors.stepper28byj, motors.stepperA4988, motors.relayLamp, motors.l298nMotor,
];

export const EXAMPLES = [];
export function addExamples(list) {
  for (const b of list) {
    try {
      resetIds();
      EXAMPLES.push(b());
    } catch (e) {
      console.error('example failed', b.name, e);
    }
  }
}
addExamples(builders);
addExamples(python.BUILDERS);
addExamples(extA.BUILDERS);
addExamples(extB.BUILDERS);
