// The Raspberry Pi Lab's GPIO on a real circuit: GpioSim (what Python sees) drives the pins of the
// board part in a SimEngine (the Arduino editor's circuit solver), and inputs, ADCs and sensors are
// read back from the solved circuit. Python runs in wall-clock time; before every pin access the
// circuit's clock is moved to "now" so tight polling loops (an HC-SR04 echo) see time pass.
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class CircuitHw {
  /** engine: a started SimEngine (opts.external) whose board is a Pi Lab board part. */
  constructor(engine) {
    this.engine = engine;
    this.warned = new Set();
    // text an Arduino on the canvas sent to the Pi's RX pin (crossed TX → RX), per UART port
    this.rx = {};
    engine.opts.onUart = (port, text) => { this.rx[port] = ((this.rx[port] || '') + text).slice(-4096); };
  }

  has(n) { return !!(this.engine.pins && this.engine.pins.has(n)); }
  advance() { this.pace(); this.engine.advanceTo(now()); }

  /** A TRIG pulse just started an HC-SR04 echo: no UI turn for Python until the echo is over, or a
   *  pause of a few ms inside its timing loop would make the measured distance wrong. */
  quietForEcho() {
    if (!this.quiet) return;
    const e = this.engine, t = e.time();
    let end = 0;
    for (const rt of e.parts.values()) if (rt && rt.def && rt.def.type === 'hc-sr04' && rt.pending) end = Math.max(end, rt.pending.start + rt.pending.width);
    if (end > t) this.quiet(now() + (end - t) / 1000 + 6);
  }

  /** Python here is much slower than on a real Pi (a pin access takes 50–400 µs, there ~1 µs), so an
   *  RPi.GPIO loop waiting for an HC-SR04 ECHO to rise could miss the low phase (450 µs) and never set
   *  its start time. The echo therefore starts after max(450 µs, six pin accesses) — measured as the
   *  program runs, so a slow phone gets more. The pulse width (the distance) stays exact. */
  pace() {
    const t = now();
    if (this.lastAccess != null) {
      const gap = (t - this.lastAccess) * 1000; // µs; pauses (time.sleep) are not counted
      if (gap < 5000) this.gapUs = this.gapUs ? this.gapUs * 0.8 + gap * 0.2 : gap;
    }
    this.lastAccess = t;
    const delay = Math.max(450, Math.min(20000, 6 * (this.gapUs || 0)));
    for (const rt of this.engine.parts.values()) if (rt && rt.def && rt.def.type === 'hc-sr04') rt.echoDelayUs = delay;
  }

  /** Push what Python set on a pin (mode, level, pull, PWM) into the circuit. */
  syncPin(p) {
    const e = this.engine;
    const n = p.n;
    const st = e.pins && e.pins.get(n);
    if (!st) return;
    this.advance();
    if (p.mode === 'out') {
      if (st.servoUs != null) e.setServo(n, null);
      if (st.tone) e.noTone(n);
      if (st.mode !== 1) e.pinMode(n, 1);
      e.digitalWrite(n, p.out ? 1 : 0);
      if (!p.out) this.quietForEcho();
    } else if (p.mode === 'pwm') {
      const f = p.freq || 0, d = Math.max(0, Math.min(1, p.duty));
      if (st.mode !== 1) e.pinMode(n, 1);
      if (f >= 40 && f <= 330 && d > 0 && d < 0.2 && this.on(n, 'servo', 'PWM')) {
        if (st.tone) e.noTone(n);
        e.setServo(n, (d * 1e6) / f); // pulse width in µs (gpiozero Servo, machine.PWM duty_ns …)
      } else if (f >= 20 && this.on(n, 'buzzer') && this.passive(n)) {
        if (st.servoUs != null) e.setServo(n, null);
        if (d > 0.02 && d < 0.98) e.tone(n, f, 0); else { e.noTone(n); e.digitalWrite(n, d >= 0.98 ? 1 : 0); }
      } else {
        if (st.servoUs != null) e.setServo(n, null);
        if (st.tone) e.noTone(n);
        e.analogWrite(n, d, Math.round(d * 255), 255);
      }
    } else {
      // input: the Pi's GPIOs have ~50 kΩ pulls
      const m = p.pull === 'up' ? 2 : p.pull === 'down' ? 3 : 0;
      if (st.servoUs != null) e.setServo(n, null);
      if (st.tone) e.noTone(n);
      if (st.mode !== m) e.pinMode(n, m);
    }
  }

  /** Logic level of an input pin from the solved circuit. */
  read(n) {
    const e = this.engine;
    if (!this.has(n)) return 0;
    this.advance();
    const v = e.digitalRead(n);
    const st = e.pins.get(n);
    if (st && st.node >= 0 && st.mode !== 1 && e.vAvg(st.node) - e.vAvg(e.gnd) > 3.9) this.warnOnce('5v' + n, `${st.id} sees ${(e.vAvg(st.node) - e.vAvg(e.gnd)).toFixed(1)} V — Raspberry Pi GPIOs are 3.3 V only! Use a voltage divider (e.g. 1 kΩ + 2 kΩ) on 5 V signals such as the HC-SR04 ECHO.`);
    return v;
  }

  /** Part runtimes of `type` with pin `pinId` (any pin if null) on the node of GPIO n. */
  partsOn(n, type, pinId = null) {
    const e = this.engine;
    if (!this.has(n)) return [];
    return e.partsOnPin(n, (rt) => rt.def && rt.def.type === type, pinId).map((x) => x.rt);
  }
  on(n, type, pinId = null) { return this.partsOn(n, type, pinId).length > 0; }
  /** Like partsOn, but also parts reached through up to two resistors (the 1 k / 2 k divider on an HC-SR04 ECHO). */
  partsBehind(n, type, pinId = null) {
    const direct = this.partsOn(n, type, pinId);
    if (direct.length) return direct;
    const e = this.engine;
    if (!this.has(n)) return [];
    const out = [];
    for (const nd of e.resistiveNeighbours(e.pinNode(n))) out.push(...e.partsOnNode(nd, (rt) => rt.def && rt.def.type === type, pinId).map((x) => x.rt));
    return out;
  }
  passive(n) { return this.partsOn(n, 'buzzer').some((rt) => (rt.part.props || {}).kind !== 'active'); }

  // ---------------------------------------------------------------- analog & sensors
  /** Pico ADC channel 0–3 (GP26–GP29) as a fraction of 3.3 V; null = not handled here. */
  adc(ch) {
    const n = 26 + ch;
    if (ch > 2 || !this.has(n)) return null;
    this.advance();
    return Math.max(0, Math.min(1, this.engine.analogRead(n) / 3.3));
  }

  /** gpiozero MCP3008(channel=ch): an MCP3008 wired to SPI0 (SCLK GPIO11, MISO GPIO9, MOSI GPIO10). */
  mcp3008(ch) {
    const e = this.engine;
    this.advance();
    e.ensureSolved();
    const node = (g) => e.pinNode(g);
    for (const rt of e.parts.values()) {
      if (!rt.mcp3008) continue;
      const id = rt.part.id;
      const spi = e.nodeOf(id, 'CLK') === node(11) && e.nodeOf(id, 'DOUT') === node(9) && e.nodeOf(id, 'DIN') === node(10);
      const cs = [node(8), node(7)].includes(e.nodeOf(id, 'CS'));
      if (!spi || !cs) { this.warnOnce('mcpwire', 'MCP3008: wire CLK → GPIO11 (SCLK), DOUT → GPIO9 (MISO), DIN → GPIO10 (MOSI) and CS → GPIO8 (CE0)'); continue; }
      if (!rt.powered()) { this.warnOnce('mcppwr', 'MCP3008 has no power: VDD and VREF to 3V3, AGND and DGND to GND'); return 0; }
      return rt.read(ch);
    }
    this.warnOnce('mcpnone', 'gpiozero MCP3008: add an MCP3008 ADC to the circuit (the Pi has no analog inputs)');
    return 0;
  }

  /** gpiozero DistanceSensor: metres to the object of the HC-SR04 whose ECHO is on this pin; −1 = none. */
  distance(echo) {
    const rt = this.partsBehind(echo, 'hc-sr04', 'ECHO')[0];
    if (!rt) return -1;
    if (!rt.powered()) { this.warnOnce('srpwr', 'HC-SR04 has no power: VCC to 5V, GND to GND'); return -1; }
    rt.visual.ping = now();
    return Math.max(0.02, Math.min(4, rt.distance / 100));
  }

  /** DHT11 / DHT22 on GPIO n: temperature (which = 0) or humidity (1); −999 = no sensor. */
  dht(n, which) {
    const rt = this.partsOn(n, 'dht22', 'DATA')[0];
    if (!rt) return -999;
    if (rt.powered && !rt.powered()) return -999;
    const r = rt.read();
    return which ? r.h : r.t;
  }

  /** gpiozero LightSensor: 0 (dark) … 1 (bright) from an LDR module whose DO is on this pin. */
  light(n) {
    const rt = this.partsOn(n, 'ldr-module', 'DO')[0] || this.partsOn(n, 'ldr-module', 'AO')[0];
    if (rt) return Math.max(0, Math.min(1, Math.log10(1 + rt.values.lux) / Math.log10(1001)));
    return this.read(n) ? 0 : 1;
  }

  neo(n, colors) {
    if (!this.has(n)) return;
    this.engine.sendWs2812(n, colors);
  }

  // ---------------------------------------------------------------- UART (an Arduino slave on the canvas)
  /** Python wrote to UART `port`: boards whose RX is on the Pi's TX pin receive it. Returns the count. */
  uartWrite(port, text) {
    this.advance();
    return this.engine.externalUartOut(port, text);
  }
  /** Is anything wired to this port's RX or TX pin? */
  uartWired(port) {
    const e = this.engine, u = (e.board && e.board.uart || {})[port];
    if (!u) return false;
    const rx = e.pinNode(u.rx), tx = e.pinNode(u.tx);
    return (e.boards || []).slice(1).some((b) => Object.values(b.board.uart || { s: { rx: 0, tx: 1 } }).some((u2) => b.pinNode(u2.rx) === tx || b.pinNode(u2.tx) === rx));
  }
  uartAny(port) { return (this.rx[port] || '').length; }
  uartRead(port, n) {
    const buf = this.rx[port] || '';
    const k = n < 0 ? buf.length : Math.min(n, buf.length);
    this.rx[port] = buf.slice(k);
    return buf.slice(0, k);
  }

  // ---------------------------------------------------------------- I²C (LCD backpack, or an Arduino as a slave)
  i2cDevices() {
    const e = this.engine;
    const gpioNodes = new Set([...e.pins.values()].map((st) => st.node).filter((x) => x >= 0));
    const out = [];
    for (const rt of e.parts.values()) {
      if (!rt.i2c || rt === e.boardRt) continue;
      const pa = rt.i2cPins || rt.def.i2cPins || { sda: 'SDA', scl: 'SCL' };
      if (gpioNodes.has(e.nodeOf(rt.part.id, pa.sda)) && gpioNodes.has(e.nodeOf(rt.part.id, pa.scl))) out.push(rt);
    }
    return out;
  }

  i2cHas(addr) {
    this.engine.ensureSolved();
    return this.i2cDevices().some((rt) => rt.i2c.address === addr && (!rt.powered || rt.powered()));
  }

  i2cScan() {
    this.engine.ensureSolved();
    return this.i2cDevices().filter((rt) => !rt.powered || rt.powered()).map((rt) => rt.i2c.address).sort((a, b) => a - b);
  }

  /** Bytes the master read back from a slave (an Arduino's onRequest handler); 0xFF when none answers. */
  i2cRead(addr, n) {
    this.advance();
    const rt = this.i2cDevices().find((r) => r.i2c.address === addr);
    if (rt && rt.i2cRead) { const out = rt.i2cRead(n); this.engine.dirty = true; return out; }
    return new Array(n).fill(rt ? 0 : 255);
  }

  /** Bytes written to a PCF8574 LCD backpack: P0 RS, P1 RW, P2 EN, P3 backlight, P4–P7 = D4–D7. */
  i2cWrite(addr, bytes) {
    const rt = this.i2cDevices().find((r) => r.i2c.address === addr);
    if (rt && rt.i2cWrite) { this.advance(); rt.i2cWrite(bytes); this.engine.dirty = true; return; }
    if (rt && rt.ssd1306) { this.advance(); this.ssd1306Write(rt, bytes); return; }
    if (!rt || !rt.hd44780) return;
    const lcd = rt.hd44780;
    const s = rt._pcf || (rt._pcf = { en: 0, hi: null, rs: 0, mode8: true, cg: -1 });
    for (const b of bytes) {
      lcd.backlight = !!(b & 8);
      const en = (b >> 2) & 1;
      if (s.en && !en) { // falling edge of EN latches a nibble
        const nib = b >> 4, rs = b & 1;
        if (s.mode8) {
          // power-up: the 8-bit "function set" 0x3x / 0x2x nibbles until 4-bit mode is selected
          if (nib === 2) s.mode8 = false;
        } else if (s.hi === null) { s.hi = nib; s.rs = rs; } else {
          const v = (s.hi << 4) | nib;
          s.hi = null;
          if (s.rs) this.lcdData(lcd, s, v); else this.lcdCmd(lcd, s, v);
        }
      }
      s.en = en;
    }
    lcd.touch();
    this.engine.dirty = true;
  }

  lcdCmd(lcd, s, c) {
    if (c & 0x80) { lcd.addr = c & 0x7f; s.cg = -1; } else if (c & 0x40) { s.cg = c & 0x3f; } else if (c & 0x20) { if (!lcd.initialized) lcd.init(); if ((c & 0x10) === 0x10) s.mode8 = true; } else if (c & 0x10) {
      if (c & 0x08) lcd.scroll(c & 0x04 ? 1 : -1); else lcd.step(c & 0x04 ? 1 : -1);
    } else if (c & 0x08) { lcd.on = !!(c & 4); lcd.cursor = !!(c & 2); lcd.blink = !!(c & 1); if (!lcd.initialized) lcd.init(); } else if (c & 0x04) { lcd.inc = !!(c & 2); lcd.autoShift = !!(c & 1); } else if (c & 0x02) lcd.home(); else if (c & 0x01) { if (!lcd.initialized) lcd.init(); lcd.clear(); }
  }

  lcdData(lcd, s, v) {
    if (s.cg >= 0) { lcd.cgram[s.cg & 63] = v & 0x1f; s.cg = (s.cg + 1) & 63; return; }
    if (!lcd.initialized) lcd.init();
    lcd.write(v);
  }

  // ---------------------------------------------------------------- displays on I²C / SPI / pins
  /**
   * SSD1306 OLED on I²C: the control byte says "commands" (0x00 / 0x80) or "display data" (0x40 / 0xC0). Data goes
   * to the GDDRAM like on the chip: pages of 8 rows, columns of 1 byte (LSB at the top), with horizontal, vertical
   * and page addressing, so every SSD1306 driver (MicroPython ssd1306, Adafruit) draws the same picture.
   */
  ssd1306Write(rt, bytes) {
    const d = rt.ssd1306;
    if (rt.powered && !rt.powered()) return;
    const s = rt._ssd || (rt._ssd = { mode: 0, col: 0, pg: 0, c0: 0, c1: 127, p0: 0, p1: 7, need: 0, cur: 0, args: [] });
    let i = 0;
    while (i < bytes.length) {
      const ctl = bytes[i++];
      const dc = ctl & 0x40;
      if (ctl & 0x80) { if (i < bytes.length) this.ssdItem(d, s, dc, bytes[i++]); } else while (i < bytes.length) this.ssdItem(d, s, dc, bytes[i++]);
    }
    d.version++;
    this.engine.dirty = true;
  }

  ssdItem(d, s, dc, b) {
    if (dc) {
      if (s.pg >= 0 && s.pg < d.h / 8 && s.col >= 0 && s.col < d.w) for (let k = 0; k < 8; k++) d.fb[(s.pg * 8 + k) * d.w + s.col] = (b >> k) & 1;
      if (s.mode === 1) { if (++s.pg > s.p1) { s.pg = s.p0; if (++s.col > s.c1) s.col = s.c0; } } else if (s.mode === 2) { s.col = (s.col + 1) % d.w; } else if (++s.col > s.c1) { s.col = s.c0; if (++s.pg > s.p1) s.pg = s.p0; }
      return;
    }
    if (s.need) {
      s.args.push(b);
      if (--s.need) return;
      const a = s.args;
      switch (s.cur) {
        case 0x20: s.mode = a[0] & 3; break;
        case 0x21: s.c0 = a[0] & 127; s.c1 = a[1] & 127; s.col = s.c0; break;
        case 0x22: s.p0 = a[0] & 7; s.p1 = a[1] & 7; s.pg = s.p0; break;
        case 0x81: d.contrast = a[0] / 255; break;
        default: break;
      }
      return;
    }
    if ([0x20, 0x81, 0xD3, 0xD5, 0xD9, 0xDA, 0xDB, 0x8D, 0xA8, 0xAD].includes(b)) { s.cur = b; s.need = 1; s.args = []; return; }
    if (b === 0x21 || b === 0x22) { s.cur = b; s.need = 2; s.args = []; return; }
    if (b === 0x26 || b === 0x27) { s.cur = b; s.need = 6; s.args = []; return; }
    if (b === 0x29 || b === 0x2A) { s.cur = b; s.need = 5; s.args = []; return; }
    if (b === 0xA3) { s.cur = b; s.need = 2; s.args = []; return; }
    if (b === 0xAE) d.on = false;
    else if (b === 0xAF) d.on = true;
    else if (b === 0xA6) d.invert = false;
    else if (b === 0xA7) d.invert = true;
    else if (b >= 0xB0 && b <= 0xB7) s.pg = b & 7;
    else if (b <= 0x0F) { s.col = (s.col & 0x70) | (b & 15); if (s.mode === 2) s.c0 = 0; }
    else if (b >= 0x10 && b <= 0x1F) s.col = (s.col & 15) | ((b & 7) << 4);
  }

  /** TM1637 on CLK / DIO (the drivers send whole frames; the pins' edges are not simulated). */
  dispTm1637(clk, dio, bytes, brightness, on) {
    const rt = this.partsOn(clk, 'tm1637', 'CLK').find((r) => this.partsOn(dio, 'tm1637', 'DIO').includes(r));
    if (!rt) { this.warnOnce('tmwire', `TM1637 display not found on CLK=GPIO${clk}, DIO=GPIO${dio}. Wire CLK, DIO, VCC and GND.`); return 0; }
    if (rt.powered && !rt.powered()) { this.warnOnce('tmpwr', 'TM1637 has no power: VCC to 3V3 / 5V, GND to GND'); return 0; }
    const d = rt.tm1637;
    d.brightness = brightness & 7; d.on = !!on;
    if (bytes.length) d.set(0, bytes);
    d.version++;
    this.engine.dirty = true;
    return 1;
  }

  /**
   * One SPI transfer on pins sck / mosi (Raspberry Pi SPI0 = GPIO11 / GPIO10): a MAX7219 chain wired to them gets
   * register / value pairs (the first pair ends up in the LAST module of a cascade); an MCP3008 answers like the chip.
   * Returns the bytes clocked back.
   */
  spiXfer(sck, mosi, bytes) {
    this.advance();
    const out = new Array(bytes.length).fill(0);
    for (const rt of this.partsOn(mosi, 'max7219', 'DIN')) {
      if (!this.partsOn(sck, 'max7219', 'CLK').includes(rt)) continue;
      if (rt.powered && !rt.powered()) { this.warnOnce('mxpwr', 'MAX7219 has no power: VCC to 5V, GND to GND'); continue; }
      const devs = rt.max7219, n = devs.length;
      for (let k = 0; k + 1 < bytes.length; k += 2) {
        const d = devs[n - 1 - ((k / 2) % n)], reg = bytes[k] & 15, v = bytes[k + 1] & 255;
        if (reg >= 1 && reg <= 8) d.rows[reg - 1] = v;
        else if (reg === 0x0A) d.intensity = v & 15;
        else if (reg === 0x0C) d.shutdown = !(v & 1);
        d.version++;
      }
      this.engine.dirty = true;
      return out;
    }
    if (bytes.length === 3 && bytes[0] === 1 && (bytes[1] & 0x80)) {
      const raw = Math.round(Math.max(0, Math.min(1, this.mcp3008((bytes[1] >> 4) & 7))) * 1023);
      return [0, (raw >> 8) & 3, raw & 255];
    }
    return out;
  }

  // ---------------------------------------------------------------- board drawing & messages
  /** Live state of every GPIO for the board drawing (same colours as the Pinout tab). */
  pinStates(gpio) {
    const out = new Map();
    for (const p of gpio.pins.values()) {
      if (!this.has(p.n)) continue;
      const lvl = p.mode === 'out' ? p.out : p.mode === 'pwm' ? (p.duty >= 0.5 ? 1 : 0) : (p.used || p.watch) ? this.quietLevel(p.n) : null;
      out.set(p.n, p.mode === 'pwm' ? 'pwm' : p.mode === 'out' ? (p.out ? 'ohi' : 'olo') : lvl == null ? '' : lvl ? 'ihi' : 'ilo');
    }
    return out;
  }

  quietLevel(n) {
    const e = this.engine, st = e.pins.get(n);
    if (!st || st.node < 0) return 0;
    return e.vAvg(st.node) - e.vAvg(e.gnd) > 1.65 ? 1 : 0;
  }

  warnOnce(key, msg) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.engine.warn(msg, null, 'pi:' + key);
  }
}
