// The network functions of the _rpi_js module (what the Python libraries requests, socket, http.server,
// flask, paho.mqtt, umqtt and network call): they reach the virtual network (src/net/network.js) as the
// Raspberry Pi or Pico W device. Requests are asynchronous inside the network, so Python starts one
// (net_request → id) and polls for the answer (net_poll), sleeping in between so the UI keeps running.

export function netBridge(gpio) {
  const net = () => gpio.net;
  const dev = () => gpio.netDev;
  let seq = 0;
  const reqs = new Map();
  const conns = new Map();
  const mq = new Map();
  const ok = () => !!(net() && dev());

  return {
    net_online: () => (ok() && net().online(dev()) ? 1 : 0),
    net_ip: () => (ok() ? dev().ip : ''),
    net_resolve: (host) => (ok() ? net().resolve(host, dev()) : ''),
    net_hostname: () => (ok() ? dev().hostname || 'raspberrypi' : 'raspberrypi'),
    net_request: (method, url, headersJson, body) => {
      const id = ++seq;
      const rec = { done: false, res: null };
      reqs.set(id, rec);
      if (!ok()) { rec.done = true; rec.res = { failed: true, error: 'ERR_INTERNET_DISCONNECTED', statusText: 'No network' }; return id; }
      let headers = {};
      try { headers = JSON.parse(headersJson || '{}'); } catch (e) { /* none */ }
      net().request({ method, url, headers, body, fromName: dev().name }, dev()).then((r) => { rec.done = true; rec.res = r; });
      return id;
    },
    net_poll: (id) => {
      const r = reqs.get(id);
      if (!r || !r.done) return '';
      reqs.delete(id);
      return JSON.stringify(r.res);
    },
    // ---- a web server on this device
    net_listen: (port) => {
      if (!ok()) return 0;
      if (net().serverFor(dev(), port)) return -1;
      net().listen(dev(), port, dev().name);
      return 1;
    },
    net_unlisten: (port) => { if (ok()) net().unlisten(dev(), port); },
    net_accept: (port) => {
      if (!ok()) return 0;
      const s = net().serverFor(dev(), port);
      if (!s || !s.pending.length) return 0;
      const id = ++seq;
      conns.set(id, s.pending.shift());
      return id;
    },
    net_req: (id) => { const c = conns.get(id); return c ? JSON.stringify(c.req) : '{}'; },
    net_respond: (id, status, headersJson, body) => {
      const c = conns.get(id);
      if (!c) return;
      conns.delete(id);
      let headers = {};
      try { headers = JSON.parse(headersJson || '{}'); } catch (e) { /* none */ }
      c.respond({ status, headers, body });
    },
    // ---- MQTT
    mqtt_connect: (clientId, host, port, user, pass, willTopic, willPayload) => {
      if (!ok()) return -4;
      const will = willTopic ? { topic: willTopic, payload: willPayload || '', retain: false } : null;
      const r = net().mqtt.connect(clientId, host, port, { user: user || undefined, pass, will }, dev());
      if (!r.ok) return r.code;
      const id = ++seq;
      mq.set(id, r.client);
      return id;
    },
    mqtt_subscribe: (id, filter) => (mq.has(id) && net().mqtt.subscribe(mq.get(id), filter) ? 1 : 0),
    mqtt_unsubscribe: (id, filter) => { if (mq.has(id)) net().mqtt.unsubscribe(mq.get(id), filter); },
    mqtt_publish: (id, topic, payload, retain) => (mq.has(id) && net().mqtt.publish(mq.get(id), topic, payload, !!retain) ? 1 : 0),
    mqtt_poll: (id) => { const c = mq.get(id); const m = c && net().mqtt.poll(c); return m ? JSON.stringify(m) : ''; },
    mqtt_connected: (id) => (mq.has(id) && mq.get(id).connected && net().online(dev()) ? 1 : 0),
    mqtt_disconnect: (id) => { const c = mq.get(id); if (c) { net().mqtt.disconnect(c); mq.delete(id); } },
    // ---- Wi-Fi (Pico W: network.WLAN)
    wifi_join: (ssid, pass) => {
      if (!ok()) return JSON.stringify({ status: 1, ip: '' });
      return JSON.stringify(net().join(dev(), ssid, pass));
    },
    wifi_leave: () => { if (ok()) net().leave(dev()); },
    wifi_info: () => JSON.stringify(ok() ? { connected: net().online(dev()), ip: dev().ip, ssid: dev().ssid, rssi: dev().rssi, mac: net().macString(dev()), router: net().opts.router } : { connected: false }),
    wifi_scan: () => JSON.stringify(ok() ? net().scan() : []),
  };
}
