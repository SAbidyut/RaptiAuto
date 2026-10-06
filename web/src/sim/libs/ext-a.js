// Simulated Arduino libraries for the group A parts: Adafruit_BMP280.
import { addLibrary, defineClass } from './registry.js';

const hex2 = (n) => '0x' + n.toString(16).toUpperCase().padStart(2, '0');

class BMP280Lib {
  constructor(rt, hw) { this.rt = rt; this.hw = hw; this.addr = 0x77; this.dev = null; }
  begin(addr = 0x77) {
    this.addr = addr || 0x77;
    this.rt.t += 3000;
    const d = this.hw.i2cBus().find((x) => x.bmp && x.i2c.address === this.addr);
    if (!d) {
      const any = this.hw.i2cBus().find((x) => x.bmp);
      if (any) this.hw.warn(`No BMP280 at address ${hex2(this.addr)} — the sensor in the circuit answers at ${hex2(any.i2c.address)}. Use bmp.begin(${hex2(any.i2c.address)}).`, null, 'bmpaddr');
      else this.hw.warn('BMP280 not found on I²C — connect SDA / SCL, VCC and GND.', null, 'bmpi2c');
      return 0;
    }
    if (d.powered && !d.powered()) return 0;
    this.dev = d;
    return 1;
  }
  reading() { return this.dev && this.dev.powered() ? this.dev.read() : null; }
  readTemperature() { const r = this.reading(); this.rt.t += 6000; return r ? Math.round(r.t * 100) / 100 : NaN; }
  readPressure() { const r = this.reading(); this.rt.t += 6000; return r ? Math.round(r.p * 100) : NaN; }
  readAltitude(sea = 1013.25) { const r = this.reading(); return r ? 44330 * (1 - (r.p / sea) ** (1 / 5.255)) : NaN; }
  takeForcedMeasurement() { return this.dev ? 1 : 0; }
  sensorID() { return 0x58; }
  setSampling() {}
}

addLibrary((natives, rt, hw) => {
  defineClass(natives, 'Adafruit_BMP280', {
    create: (r) => new BMP280Lib(r, hw),
    methods: {
      begin: { ret: 'bool', args: ['num', 'num'] }, readTemperature: { ret: 'float' }, readPressure: { ret: 'float' }, readAltitude: { ret: 'float' },
      takeForcedMeasurement: { ret: 'bool' }, sensorID: { ret: 'u32' }, setSampling: { ret: 'void', args: ['raw', 'raw', 'raw', 'raw', 'raw'] },
    },
  });
  Object.assign(natives.constants, { BMP280_ADDRESS: 0x77, BMP280_ADDRESS_ALT: 0x76, BMP280_CHIPID: 0x58 });
});
