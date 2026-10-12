// Example gallery.
import { resetIds } from './helpers.js';
import * as basics from './basics.js';
import * as sensors from './sensors.js';
import * as displays from './displays.js';
import * as motors from './motors.js';
import * as projects from './projects.js';
import * as multi from './multi.js';
import * as iot from './iot.js';
import * as iotCloud from './iot-cloud.js';
import * as iotMore from './iot-more.js';
import * as iotData from './iot-data.js';

export const EXAMPLE_CATEGORIES = [
  { id: 'basics', name: 'Basics' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'displays', name: 'Displays' },
  { id: 'motors', name: 'Motors' },
  { id: 'iot', name: 'IoT & Wi-Fi' },
  { id: 'electrical', name: 'Electrical' },
  { id: 'multi', name: 'Master–Slave' },
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
  multi.i2cMasterSlave, multi.uartMasterSlave,
  iot.iotHello, iot.iotWebLed, iot.iotDhtWeb, iot.iotRestApi, iot.iotAccessPoint, iot.iotWifiScanner, iot.iotBluetoothLed,
  iot.iotEsp8266Relay, iot.iotR4Web,
  iotCloud.iotMqttLight, iotCloud.iotMqttDht, iotCloud.iotThingspeak, iotCloud.iotBlynk, iotCloud.iotTelegramPir, iotCloud.iotNtpClock, iotCloud.iotCryptoLcd, iotCloud.iotIftttDoor,
  iotMore.iotGasMqtt, iotMore.iotSoilPlant, iotMore.iotParkingWeb, iotMore.iotNeopixelWeb, iotMore.iotTwoBoardsMqtt, iotMore.iotWifiMulti, iotMore.iotIpLocation, iotMore.iotPrefsCounter,
  iotData.iotAirQuality, iotData.iotPrayerTimes, iotData.iotCurrencyOled, iotData.iotIssTracker, iotData.iotSunsetLight, iotData.iotForecastDial,
  iotData.iotWeatherNeopixel, iotData.iotQuoteLcd, iotData.iotTm1637Temp, iotData.iotEarthquakeAlert,
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
