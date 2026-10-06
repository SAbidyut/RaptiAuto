// Simulated Arduino libraries for the group B parts (communication): SoftwareSerial.
import { addLibrary, defineClass } from './registry.js';
import { HardwareSerial, serialClassMeta } from '../lang/core.js';

/** SoftwareSerial: bit-banged UART on any two pins. Bytes written go to modules (HC-05, GPS …) wired to the TX pin. */
class SoftwareSerial extends HardwareSerial {
  constructor(rt, hw, args) {
    super(rt, hw, 'SoftwareSerial', hw.board);
    this.rxPin = args[0] ?? -1;
    this.txPin = args[1] ?? -1;
    this.listening = true;
    this.rxMax = 64;
    if (hw.registerUart) hw.registerUart(this);
  }
  begin(baud) {
    this.baud = baud || 9600;
    this.begun = true;
    if (this.txPin >= 0) { this.hw.pinMode(this.txPin, 1); this.hw.digitalWrite(this.txPin, 1); }
    if (this.rxPin >= 0) this.hw.pinMode(this.rxPin, 0);
  }
  _write(s) {
    const rt = this.rt;
    if (!this.begun) { rt.warnOnce('softserial-begin', 'SoftwareSerial.begin() was not called — nothing is sent. Add it in setup().'); return 0; }
    if (!s.length) return 0;
    // software serial blocks the CPU for the whole byte time
    rt.t += s.length * this.byteTime();
    if (this.hw.uartSend && !this.hw.uartSend(this.txPin, s)) {
      rt.warnOnce('softserial-nopeer:' + this.txPin, `SoftwareSerial TX pin ${this.txPin} is not connected to the RXD pin of a module.`);
    }
    return s.length;
  }
  feed(text) { if (this.listening) super.feed(text); }
  listen() { this.listening = true; return 1; }
  stopListening() { this.listening = false; return 1; }
  isListening() { return this.listening ? 1 : 0; }
  overflow() { return 0; }
}

addLibrary((natives, rt, hw, board) => {
  const meta = serialClassMeta(board.arch);
  defineClass(natives, 'SoftwareSerial', {
    ...meta,
    name: 'SoftwareSerial',
    create: (r, args) => new SoftwareSerial(r, hw, args),
    methods: { ...meta.methods, listen: { ret: 'bool' }, stopListening: { ret: 'bool' }, isListening: { ret: 'bool' }, overflow: { ret: 'bool' } },
  });
});
