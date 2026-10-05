// WebAudio tones for buzzers / speakers in the simulation.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.voices = new Map();
    this.enabled = true;
  }

  ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.18;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }

  set(id, freq, vol = 1, type = 'square') {
    if (id === '*') { this.stopAll(); return; }
    if (!this.enabled) return;
    const c = this.ensure();
    if (!c) return;
    let v = this.voices.get(id);
    if (!freq || vol <= 0) {
      if (v) {
        v.g.gain.setTargetAtTime(0, c.currentTime, 0.01);
        const osc = v.o;
        setTimeout(() => { try { osc.stop(); } catch (e) { /* ignore */ } }, 80);
        this.voices.delete(id);
      }
      return;
    }
    freq = Math.max(20, Math.min(12000, freq));
    if (!v) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = 0;
      o.connect(g);
      g.connect(this.master);
      o.start();
      v = { o, g, f: freq };
      this.voices.set(id, v);
    }
    if (Math.abs(v.f - freq) > 0.5) { v.o.frequency.setValueAtTime(freq, c.currentTime); v.f = freq; }
    v.g.gain.setTargetAtTime(Math.min(1, vol) * 0.5, c.currentTime, 0.005);
  }

  stopAll() { for (const id of [...this.voices.keys()]) this.set(id, 0, 0); }

  /** Short mechanical click (relays, switches). */
  click(vol = 0.5) {
    if (!this.enabled) return;
    const c = this.ensure();
    if (!c) return;
    const len = Math.floor(c.sampleRate * 0.014);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  close() {
    this.stopAll();
    if (this.ctx) { setTimeout(() => { try { this.ctx.close(); } catch (e) { /* ignore */ } }, 200); }
  }
}
