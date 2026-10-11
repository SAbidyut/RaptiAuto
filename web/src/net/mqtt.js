// A small in-memory MQTT broker for the virtual network: public brokers (broker.hivemq.com,
// test.mosquitto.org …) are shared by every device, "localhost" / raspberrypi.local belongs to the
// Raspberry Pi. Topics with + and # wildcards, retained messages, last will, QoS ignored.

export const PUBLIC_BROKERS = ['broker.hivemq.com', 'test.mosquitto.org', 'mqtt.eclipseprojects.io', 'broker.emqx.io', 'mqtt.rapti.net', 'io.adafruit.com', 'public.mqtthq.com'];

/** Does topic `t` match the subscription filter `f` (+ one level, # the rest)? */
export function topicMatches(f, t) {
  const fs = f.split('/'), ts = t.split('/');
  for (let i = 0; i < fs.length; i++) {
    if (fs[i] === '#') return !(t.startsWith('$') && i === 0);
    if (i >= ts.length) return false;
    if (fs[i] !== '+' && fs[i] !== ts[i]) return false;
  }
  return fs.length === ts.length;
}

export class MqttBroker {
  constructor(net) {
    this.net = net;
    this.clients = new Set();   // connected clients
    this.retained = new Map();  // broker → Map(topic → {payload, t})
    this.log = [];              // [{t, broker, topic, payload, from, retain}]
    this.seq = 0;
  }

  /** Broker key for a host: public brokers by name, local ones per device. */
  key(host, dev) {
    const h = String(host || '').toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return 'local:' + (dev ? dev.id : '?');
    const d = this.net.deviceByHost(h);
    if (d) return 'local:' + d.id;
    return h;
  }

  /** Is there a broker at host:port from device dev's point of view? Returns a reason when not. */
  reachable(host, port, dev) {
    const net = this.net;
    const h = String(host || '').toLowerCase();
    const local = h === 'localhost' || h === '127.0.0.1' || net.deviceByHost(h);
    if (local) {
      if (port && port !== 1883 && port !== 8883 && port !== 8080) return 'refused';
      const owner = h === 'localhost' || h === '127.0.0.1' ? dev : net.deviceByHost(h);
      return owner && owner.broker ? '' : 'refused';
    }
    if (!net.online(dev)) return 'offline';
    if (!PUBLIC_BROKERS.includes(h)) return net.resolve(h, dev) ? 'refused' : 'dns';
    if (port && ![1883, 8883, 8884, 8000, 8080, 80, 443].includes(port)) return 'refused';
    return '';
  }

  connect(id, host, port, opts = {}, dev = null) {
    const why = this.reachable(host, port, dev);
    if (why) return { ok: false, code: why === 'refused' ? -2 : -4, reason: why };
    if (opts.user !== undefined && String(host).toLowerCase() === 'io.adafruit.com' && !opts.pass) return { ok: false, code: 5, reason: 'not authorised' };
    const key = this.key(host, dev);
    let cid = id || 'client-' + (++this.seq);
    // a second client with the same id kicks the first (MQTT rule)
    for (const c of this.clients.values()) if (c.id === cid && c.broker === key) this.disconnect(c, true);
    const c = { id: cid, broker: key, host, dev, subs: new Set(), queue: [], connected: true, will: opts.will || null, name: dev ? dev.name : 'client', since: this.net.clock() };
    this.clients.add(c);
    this.net.changed();
    return { ok: true, client: c, code: 0 };
  }

  disconnect(c, abnormal = false) {
    if (!c || !c.connected) return;
    c.connected = false;
    this.clients.delete(c);
    if (abnormal && c.will) this.publish(null, c.will.topic, c.will.payload, c.will.retain, c.broker);
    this.net.changed();
  }

  subscribe(c, filter) {
    if (!c || !c.connected) return false;
    c.subs.add(filter);
    const r = this.retained.get(c.broker);
    if (r) for (const [topic, m] of r) if (topicMatches(filter, topic)) c.queue.push({ topic, payload: m.payload, retained: true });
    this.net.changed();
    return true;
  }

  unsubscribe(c, filter) { if (c) c.subs.delete(filter); return true; }

  /** Publish from client c (null = the dashboard / a phone) on broker key. */
  publish(c, topic, payload, retain = false, brokerKey = null) {
    const broker = c ? c.broker : brokerKey || 'broker.hivemq.com';
    const text = typeof payload === 'string' ? payload : String(payload ?? '');
    if (retain) {
      if (!this.retained.has(broker)) this.retained.set(broker, new Map());
      if (text === '') this.retained.get(broker).delete(topic); else this.retained.get(broker).set(topic, { payload: text, t: this.net.clock() });
    }
    this.log.push({ t: this.net.clock(), broker, topic, payload: text, from: c ? c.name + ' (' + c.id + ')' : 'dashboard', retain: !!retain });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    for (const o of this.clients.values()) {
      if (o.broker !== broker || !o.connected) continue;
      for (const f of o.subs) if (topicMatches(f, topic)) { if (o.queue.length < 500) o.queue.push({ topic, payload: text, retained: false }); break; }
    }
    this.net.changed();
    return true;
  }

  /** A device's program ended: its MQTT clients drop (their last will is sent). */
  dropDevice(dev) { for (const c of [...this.clients]) if (c.dev === dev) this.disconnect(c, true); }

  poll(c) { return c && c.queue.length ? c.queue.shift() : null; }

  /** Current topic table for the dashboard: broker → topic → last message. */
  snapshot() {
    const topics = new Map();
    for (const m of this.log) {
      const k = m.broker + '|' + m.topic;
      topics.set(k, m);
    }
    return { log: this.log.slice(-60).reverse(), topics: [...topics.values()].slice(-40).reverse(), clients: [...this.clients.values()].map((c) => ({ id: c.id, broker: c.broker, name: c.name, subs: [...c.subs] })) };
  }
}
