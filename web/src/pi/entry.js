// Entry of the lazily loaded Raspberry Pi bundle (build/www/pi.js): the Pi lab screen, the
// MicroPython WebAssembly runtime and the Python editor. Shared app modules come from
// window.__raptiMods (see build.mjs).
import { PiScreen } from './screen.js';

window.__raptiPi = { PiScreen };
