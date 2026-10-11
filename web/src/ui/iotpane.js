// The IoT tab of the Arduino editor: a browser on the simulated network — the phone / PC that is on the
// same Wi-Fi as the board. It opens the board's web pages (http://192.168.1.50/), the IoT dashboard
// (devices, MQTT, ThingSpeak, Blynk, Telegram, Bluetooth terminal, router/internet switches) and the
// simulated internet.
import { h } from './widgets.js';
import { icon } from './icons.js';
import { VirtualBrowser } from './browser.js';

const MARKS = [['Dashboard', 'http://dashboard.rapti.net/'], ['Weather', 'http://wttr.in/Dhaka'], ['ThingSpeak', 'http://thingspeak.com/'], ['Docs', 'http://docs.rapti.net/'], ['Start', 'http://rapti.net/']];

export class IotPane {
  constructor(net, host, opts = {}) {
    this.net = net;
    this.host = host;
    this.onActivity = opts.onActivity || (() => {});
    this.browser = null;
    this.chips = h('div', { class: 'iot-chips' });
    this.body = h('div', { class: 'iot-body' }, h('div', { class: 'iot-wait' }, 'Opening the browser…'));
    host.append(this.chips, this.body);
    this.sig = '';
    this.unsub = net.onChange(() => this.schedule());
    this.draw();
  }

  schedule() { if (this.pending) return; this.pending = true; requestAnimationFrame(() => { this.pending = false; this.draw(); }); }

  ensure() {
    if (this.browser) return;
    this.body.innerHTML = '';
    this.browser = new VirtualBrowser({ net: this.net, origin: null, home: 'http://dashboard.rapti.net/', bookmarks: MARKS });
    this.body.appendChild(this.browser.el);
  }

  /** The tab was opened. */
  shown() { this.ensure(); this.draw(); }

  open(url) { this.ensure(); this.browser.go(url); }

  /** Chips: the boards on the Wi-Fi and the web servers they run. */
  draw() {
    const devs = [...this.net.devices.values()].filter((d) => d.kind !== 'pi' && d.kind !== 'pico');
    const rows = [];
    for (const d of devs) {
      const on = d.connected && this.net.opts.router;
      const ports = [...this.net.servers.values()].filter((s) => s.dev === d).map((s) => s.port);
      rows.push({ d, on, ports });
    }
    const sig = JSON.stringify([this.net.opts.router, this.net.opts.internet, rows.map((r) => [r.d.id, r.d.ip, r.on, r.ports, r.d.hostname, !!r.d.apOn, !!r.d.bt])]);
    if (sig === this.sig) return;
    this.sig = sig;
    this.chips.innerHTML = '';
    const wifi = h('span', { class: 'iot-wifi' + (this.net.opts.router ? ' on' : ''), html: `${icon('wifi', 15)}<b>${this.net.opts.router ? 'RaptiNet' : 'router off'}</b>${this.net.opts.router && !this.net.opts.internet ? '<i>no internet</i>' : ''}` });
    this.chips.appendChild(wifi);
    if (!rows.length) this.chips.appendChild(h('span', { class: 'iot-hint' }, 'Run a sketch that uses WiFi — the board shows up here.'));
    for (const r of rows) {
      const label = r.on ? `${r.d.name} · ${r.d.ip}` : `${r.d.name} · offline`;
      this.chips.appendChild(h('span', { class: 'iot-dev' + (r.on ? ' on' : '') }, h('i', {}), label));
      if (r.on || r.d.apOn) {
        const ip = r.on ? r.d.ip : r.d.apIp;
        for (const p of r.ports) this.chips.appendChild(h('button', { class: 'iot-link', onclick: () => this.open(`http://${ip}${p === 80 ? '' : ':' + p}/`) }, `${ip}${p === 80 ? '' : ':' + p}`));
        if (r.on && r.d.hostname && r.ports.length) this.chips.appendChild(h('button', { class: 'iot-link', onclick: () => this.open(`http://${r.d.hostname}.local/`) }, `${r.d.hostname}.local`));
      }
    }
    if (rows.some((r) => r.ports.length && r.on)) this.onActivity();
  }

  destroy() { this.unsub(); if (this.browser) this.browser.destroy(); }
}
