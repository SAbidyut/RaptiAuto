// Headless runner for IoT sketches: an ESP32 / ESP8266 / R4 WiFi board on a shared virtual network.
import '../web/src/components/index.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { VirtualNet } from '../web/src/net/network.js';

export const BOARDS = { esp32: 'esp32-devkit', esp8266: 'nodemcu-esp8266', r4: 'uno-r4-wifi', uno: 'uno-r3' };

/**
 * Run `code` on a board. `net` can be shared between runs / boards. Frames are 16 ms; between frames the
 * JS event loop turns, so promises of the network (a browser calling the board) resolve.
 * opts: { board, ms, net, between(eng, t) → called each frame, parts, wires,
 *         nvs → what the board's flash (Preferences) holds from an earlier run, like a saved project }
 */
export async function runIot(code, opts = {}) {
  const net = opts.net || new VirtualNet();
  let serial = '';
  const warns = [];
  const errors = [];
  const project = {
    code,
    parts: [{ id: 'b', type: BOARDS[opts.board || 'esp32'], x: 0, y: 0, nvs: opts.nvs }, ...(opts.parts || [])],
    wires: opts.wires || [],
  };
  const eng = new SimEngine(project, { net, onSerial: (p, t) => { serial += t; }, onWarning: (m) => warns.push(m), onError: (e) => errors.push(e) });
  const r = eng.start();
  if (!r.ok) return { ok: false, error: r.error, net, serial, warns, errors };
  let wall = 1000;
  eng.tick(wall);
  const frames = Math.ceil((opts.ms || 3000) / 16);
  for (let i = 0; i < frames; i++) {
    wall += 16;
    eng.tick(wall);
    if (opts.between) await opts.between(eng, i * 16, net);
    if (i % 4 === 0) await new Promise((res) => setImmediate(res));
    if (errors.length) break;
  }
  const dev = net.devices.get('b');
  return { ok: true, eng, net, dev, project, get serial() { return serial; }, warns, errors, stop: () => eng.stop() };
}
