// Example gallery.
import { resetIds } from './helpers.js';
import * as basics from './basics.js';

export const EXAMPLE_CATEGORIES = [
  { id: 'basics', name: 'Basics' },
  { id: 'sensors', name: 'Sensors' },
  { id: 'displays', name: 'Displays' },
  { id: 'motors', name: 'Motors' },
  { id: 'iot', name: 'ESP32 & Pico' },
  { id: 'electrical', name: 'Electrical' },
];

const builders = [
  basics.blink, basics.ledResistor, basics.buttonLed, basics.trafficLight, basics.fadePot, basics.rgbLed,
  basics.knightRider, basics.burnDemo, basics.serialCommands, basics.nightLight, basics.esp32Fade, basics.picoBlink,
  basics.voltageDivider,
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
