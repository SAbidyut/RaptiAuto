// A small web browser for the simulated network: address bar, back / forward / reload, bookmarks and a
// sandboxed page view. Pages come from VirtualNet (a Raspberry Pi's Flask app, an ESP32's WebServer,
// the simulated internet); their links, forms, fetch() and XMLHttpRequest are routed through the same
// network, so a dashboard page with JavaScript works like on a real device. Used by the Raspberry Pi's
// Chromium window and by the IoT tab of the Arduino editor.
import { h } from './widgets.js';
import { icon } from './icons.js';

/** Runs inside the page (iframe): network calls, links and forms go to the parent browser. */
const SHIM = (base) => `<script>(function(){
var BASE=${JSON.stringify(base)},seq=0,pend={};
window.addEventListener('message',function(e){var m=e.data;if(m&&m.__rapti==='res'&&pend[m.id]){var f=pend[m.id];delete pend[m.id];f(m);}});
function rpc(msg){return new Promise(function(ok){var id=++seq;pend[id]=ok;msg.__rapti='req';msg.id=id;parent.postMessage(msg,'*');});}
function abs(u){try{return new URL(u,BASE).href;}catch(e){return u;}}
function hdrs(h){var o={};if(!h)return o;if(typeof h.forEach==='function'&&!Array.isArray(h)){h.forEach(function(v,k){o[k]=v;});return o;}if(Array.isArray(h)){h.forEach(function(p){o[p[0]]=p[1];});return o;}for(var k in h)o[k]=h[k];return o;}
function bodyOf(b,o){if(b==null)return '';if(typeof b==='string')return b;if(typeof URLSearchParams!=='undefined'&&b instanceof URLSearchParams)return b.toString();if(typeof FormData!=='undefined'&&b instanceof FormData){var p=new URLSearchParams();b.forEach(function(v,k){p.append(k,v);});if(!o['content-type'])o['content-type']='application/x-www-form-urlencoded';return p.toString();}return String(b);}
window.fetch=function(input,init){init=init||{};var req=(typeof input==='object'&&input&&input.url)?input:null;var url=abs(req?req.url:String(input));var o=hdrs(init.headers||(req&&req.headers));var method=(init.method||(req&&req.method)||'GET').toUpperCase();var body=bodyOf(init.body,o);
return rpc({kind:'http',method:method,url:url,headers:o,body:body}).then(function(m){if(m.error)throw new TypeError('Failed to fetch');return new Response(m.status===204||m.status===304?null:m.body,{status:m.status||200,statusText:m.statusText||'',headers:m.headers});});};
function XHR(){this.readyState=0;this.status=0;this.responseText='';this.response='';this._h={};this._rh={};this.onreadystatechange=null;this.onload=null;this.onerror=null;this.responseType='';this.timeout=0;}
XHR.prototype.open=function(m,u){this._m=m;this._u=abs(u);this.readyState=1;};
XHR.prototype.setRequestHeader=function(k,v){this._h[k]=v;};
XHR.prototype.getResponseHeader=function(k){return this._rh[String(k).toLowerCase()]||null;};
XHR.prototype.getAllResponseHeaders=function(){var s='';for(var k in this._rh)s+=k+': '+this._rh[k]+'\\r\\n';return s;};
XHR.prototype.abort=function(){};
XHR.prototype.send=function(b){var x=this;var o=hdrs(x._h);rpc({kind:'http',method:x._m,url:x._u,headers:o,body:bodyOf(b,o)}).then(function(m){if(m.error){x.readyState=4;x.status=0;if(x.onerror)x.onerror();if(x.onreadystatechange)x.onreadystatechange();return;}x.status=m.status;x.statusText=m.statusText||'';x._rh=m.headers||{};x.responseText=m.body;x.response=x.responseType==='json'?(function(){try{return JSON.parse(m.body);}catch(e){return null;}})():m.body;x.readyState=4;if(x.onreadystatechange)x.onreadystatechange();if(x.onload)x.onload();});};
window.XMLHttpRequest=XHR;
function nav(msg){msg.__rapti='nav';parent.postMessage(msg,'*');}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a||e.defaultPrevented)return;var hr=a.getAttribute('href');if(!hr||hr.charAt(0)==='#'||/^javascript:/i.test(hr))return;if(a.hasAttribute('download'))return;e.preventDefault();nav({url:abs(hr)});},true);
document.addEventListener('submit',function(e){var f=e.target;if(e.defaultPrevented||!f||f.tagName!=='FORM')return;e.preventDefault();var method=(f.getAttribute('method')||'GET').toUpperCase();var act=abs(f.getAttribute('action')||BASE);var p=new URLSearchParams();new FormData(f).forEach(function(v,k){if(typeof v==='string')p.append(k,v);});var sb=e.submitter;if(sb&&sb.name)p.append(sb.name,sb.value);
if(method==='GET'){var u=new URL(act);p.forEach(function(v,k){u.searchParams.set(k,v);});nav({url:u.href});}else nav({url:act,method:method,body:p.toString(),headers:{'content-type':'application/x-www-form-urlencoded'}});},true);
window.addEventListener('load',function(){parent.postMessage({__rapti:'title',title:document.title},'*');var m=document.querySelector('meta[http-equiv="refresh" i]');if(m){var c=(m.getAttribute('content')||'').split(';');var s=parseFloat(c[0])||0;var t=/url=(.+)/i.exec(c[1]||'');setTimeout(function(){nav({url:t?abs(t[1].trim()):BASE,reload:!t});},s*1000);}});
window.alert=function(t){parent.postMessage({__rapti:'alert',text:String(t)},'*');};
})();<\/script>`;

const ERRORS = {
  ERR_INTERNET_DISCONNECTED: ['No internet', ['Checking the network cables, modem and router', 'Reconnecting to Wi-Fi'], 'dino'],
  ERR_NAME_NOT_RESOLVED: ['This site can’t be reached', ['Checking the connection', 'Checking the proxy and the firewall'], 'sad'],
  ERR_CONNECTION_REFUSED: ['This site can’t be reached', ['Checking the connection', 'Is the program (Flask, http.server, the sketch’s server.begin()) still running?'], 'sad'],
  ERR_ADDRESS_UNREACHABLE: ['This site can’t be reached', ['Checking the Wi-Fi connection of that device', 'Checking the IP address'], 'sad'],
  ERR_TIMED_OUT: ['This site can’t be reached', ['The server took too long to respond', 'Does the program call handleClient() / serve requests?'], 'sad'],
  ERR_CONNECTION_TIMED_OUT: ['This site can’t be reached', ['The server took too long to respond'], 'sad'],
  ERR_NETWORK_CHANGED: ['Your connection was interrupted', ['Checking the router (Wi-Fi is off)'], 'dino'],
  ERR_INVALID_URL: ['This page isn’t available', ['The web address is not valid'], 'sad'],
};

function errorHtml(url, res) {
  const code = res.error || 'ERR_FAILED';
  const [title, tips, art] = ERRORS[code] || ['This site can’t be reached', [res.statusText || ''], 'sad'];
  let host = url;
  try { host = new URL(url).host; } catch (e) { /* keep */ }
  const face = art === 'dino'
    ? '<svg viewBox="0 0 44 47" width="70" height="74"><path fill="#6b7280" d="M22 0h20v4h2v13H32v3h8v3H29v3h5v6h-3v-3h-2v6h-3v3h-3v3h-3v3h2v3h-5v-6h-3v3h-3v3h2v3H9v-9H6v-3H3v-3H0v-9h3v3h3v3h3v3h3v-3h3v-3h3v-3h3V3h2z"/><rect x="27" y="3" width="3" height="3" fill="#fff"/></svg>'
    : '<svg viewBox="0 0 64 64" width="70" height="70"><rect x="12" y="6" width="40" height="52" rx="6" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/><circle cx="26" cy="26" r="3" fill="#6b7280"/><circle cx="38" cy="26" r="3" fill="#6b7280"/><path d="M24 44c4-6 12-6 16 0" stroke="#6b7280" stroke-width="3" fill="none" stroke-linecap="round"/></svg>';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#fff;color:#374151;font:15px/1.6 system-ui,sans-serif"><div style="max-width:560px;margin:9vh auto;padding:0 22px">${face}<h1 style="font-weight:500;font-size:26px;margin:.5em 0 .2em">${title}</h1>
<p style="color:#6b7280"><b>${host.replace(/</g, '&lt;')}</b> ${code === 'ERR_CONNECTION_REFUSED' ? 'refused to connect.' : code === 'ERR_NAME_NOT_RESOLVED' ? '’s server IP address could not be found.' : code === 'ERR_INTERNET_DISCONNECTED' ? '' : (res.statusText || '').replace(/</g, '&lt;')}</p>
<p>Try:</p><ul style="color:#4b5563">${tips.map((t) => `<li>${t}</li>`).join('')}</ul><p style="color:#9ca3af;font-size:13px">${code}</p>${res.statusText && ERRORS[code] ? `<p style="color:#9ca3af;font-size:13px">${String(res.statusText).replace(/</g, '&lt;')}</p>` : ''}</div></body>`;
}

function textHtml(body, type, status) {
  let text = body;
  if (/json/.test(type)) { try { text = JSON.stringify(JSON.parse(body), null, 2); } catch (e) { /* raw */ } }
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#fff;color:#111"><pre style="margin:0;padding:10px 12px;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word">${esc}</pre>${status >= 400 ? '' : ''}</body>`;
}

function statusHtml(res) {
  const reason = res.statusText || '';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:15px system-ui,sans-serif;color:#374151"><div style="max-width:560px;margin:9vh auto;padding:0 22px"><h1 style="font-weight:500;font-size:24px">This page isn’t working</h1><p>The server answered with <b>HTTP ERROR ${res.status}</b> ${reason}.</p><p style="color:#9ca3af;font-size:13px">${res.status}</p></div></body>`;
}

export class VirtualBrowser {
  /**
   * opts: { net, origin (the device this browser runs on, null for a phone / PC), home, bookmarks: [[label, url]],
   *         onTitle(t), onUrl(u), start: bool }
   */
  constructor(opts) {
    this.net = opts.net;
    this.origin = opts.origin || null;
    this.home = opts.home || 'http://rapti.net/';
    this.onTitle = opts.onTitle || (() => {});
    this.onUrl = opts.onUrl || (() => {});
    this.hist = [];
    this.pos = -1;
    this.token = 0;
    this.build(opts.bookmarks || []);
    this.msgHandler = (e) => this.onMessage(e);
    window.addEventListener('message', this.msgHandler);
    if (opts.start !== false) this.go(this.home);
  }

  build(bookmarks) {
    const btn = (ic, title, fn) => h('button', { class: 'vb-btn', title, 'aria-label': title, html: icon(ic, 17), onclick: fn });
    this.backBtn = btn('arrowLeft', 'Back', () => this.back());
    this.fwdBtn = btn('arrowRight', 'Forward', () => this.forward());
    this.reloadBtn = btn('restart', 'Reload', () => this.reload());
    this.homeBtn = btn('home', 'Home', () => this.go(this.home));
    this.urlInput = h('input', { class: 'vb-url', type: 'text', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', onkeydown: (e) => { if (e.key === 'Enter') { this.go(this.fixUrl(this.urlInput.value)); e.target.blur(); } }, onfocus: (e) => e.target.select() });
    this.lock = h('span', { class: 'vb-lock', html: icon('globe', 14) });
    this.bar = h('div', { class: 'vb-bar' }, this.backBtn, this.fwdBtn, this.reloadBtn, this.homeBtn, h('div', { class: 'vb-omni' }, this.lock, this.urlInput));
    this.marks = h('div', { class: 'vb-marks' }, ...bookmarks.map(([label, url]) => h('button', { class: 'vb-mark', onclick: () => this.go(url) }, label)));
    this.progress = h('div', { class: 'vb-progress' });
    this.frame = h('iframe', { class: 'vb-frame', sandbox: 'allow-scripts allow-forms', title: 'page' });
    this.page = h('div', { class: 'vb-page' }, this.progress, this.frame);
    this.el = h('div', { class: 'vb' }, this.bar, bookmarks.length ? this.marks : null, this.page);
    this.updateButtons();
  }

  destroy() { window.removeEventListener('message', this.msgHandler); this.token++; }

  /** What was typed in the address bar → a URL (or a search). */
  fixUrl(t) {
    t = String(t || '').trim();
    if (!t) return this.home;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
    if (/\s/.test(t) || (!/[.:]/.test(t) && t !== 'localhost')) return 'http://google.com/search?q=' + encodeURIComponent(t);
    return 'http://' + t;
  }

  updateButtons() {
    this.backBtn.disabled = this.pos <= 0;
    this.fwdBtn.disabled = this.pos >= this.hist.length - 1;
    this.backBtn.classList.toggle('off', this.backBtn.disabled);
    this.fwdBtn.classList.toggle('off', this.fwdBtn.disabled);
  }

  get current() { return this.hist[this.pos] || null; }

  go(url, o = {}) {
    const entry = { url, method: o.method || 'GET', body: o.body || '', headers: o.headers || {} };
    if (o.replace && this.pos >= 0) this.hist[this.pos] = entry;
    else { this.hist = this.hist.slice(0, this.pos + 1); this.hist.push(entry); this.pos = this.hist.length - 1; }
    this.load(entry);
  }

  back() { if (this.pos > 0) { this.pos--; this.load(this.hist[this.pos]); } }
  forward() { if (this.pos < this.hist.length - 1) { this.pos++; this.load(this.hist[this.pos]); } }
  reload() { if (this.current) this.load(this.current); }

  async load(entry) {
    const token = ++this.token;
    this.urlInput.value = entry.url;
    this.onUrl(entry.url);
    this.updateButtons();
    this.progress.classList.add('on');
    this.reloadBtn.innerHTML = icon('close', 17);
    const res = await this.net.request({ method: entry.method, url: entry.url, headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) Chromium/126.0 RaptiAuto', accept: 'text/html,*/*', ...entry.headers }, body: entry.body }, this.origin);
    if (token !== this.token) return;
    this.progress.classList.remove('on');
    this.reloadBtn.innerHTML = icon('restart', 17);
    let html;
    let title = '';
    if (res.failed) { html = errorHtml(entry.url, res); title = 'Problem loading page'; }
    else {
      const type = (res.headers['content-type'] || '').toLowerCase();
      if (/html/.test(type)) html = await this.inline(res.body, entry.url);
      else if (res.status >= 400 && !res.body) html = statusHtml(res);
      else html = textHtml(res.body, type, res.status);
      if (res.status >= 300 && res.status < 400 && res.headers.location) { this.go(new URL(res.headers.location, entry.url).href, { replace: true }); return; }
      title = (/<title>([^<]*)<\/title>/i.exec(res.body) || [])[1] || entry.url.replace(/^https?:\/\//, '');
    }
    this.render(html, entry.url);
    this.setTitle(title);
    this.urlInput.value = entry.url;
    this.updateButtons();
  }

  setTitle(t) { this.title = t; this.onTitle(t); }

  render(html, url) {
    const shim = SHIM(url);
    let doc;
    if (/<head[^>]*>/i.test(html)) doc = html.replace(/<head[^>]*>/i, (m) => m + shim);
    else if (/<html[^>]*>/i.test(html)) doc = html.replace(/<html[^>]*>/i, (m) => m + '<head>' + shim + '</head>');
    else doc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + shim + '</head><body>' + html + '</body></html>';
    this.frame.srcdoc = doc;
  }

  /** CSS and scripts the page loads from the virtual network are put into the page itself. */
  async inline(html, base) {
    const jobs = [];
    const fetchText = async (src) => {
      try {
        const u = new URL(src, base).href;
        const r = await this.net.request({ method: 'GET', url: u, headers: {} }, this.origin);
        return r.failed || r.status >= 400 ? null : r.body;
      } catch (e) { return null; }
    };
    html = html.replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
      const m = /href=["']?([^"'\s>]+)/i.exec(tag);
      if (!m || /^https?:\/\/(fonts|cdn|cdnjs|unpkg|stackpath|maxcdn)/i.test(m[1])) return tag;
      const key = `\u0001css${jobs.length}\u0001`;
      jobs.push(fetchText(m[1]).then((t) => [key, t === null ? tag : `<style>${t}</style>`]));
      return key;
    });
    html = html.replace(/<script\b([^>]*)\bsrc=["']?([^"'\s>]+)["']?([^>]*)>\s*<\/script>/gi, (tag, a, src) => {
      if (/^https?:\/\/(cdn|cdnjs|unpkg|code\.jquery)/i.test(src)) return tag;
      const key = `\u0001js${jobs.length}\u0001`;
      jobs.push(fetchText(src).then((t) => [key, t === null ? tag : `<script>${t.replace(/<\/script/gi, '<\\/script')}<\/script>`]));
      return key;
    });
    for (const [key, rep] of await Promise.all(jobs)) html = html.replace(key, () => rep);
    return html;
  }

  async onMessage(e) {
    if (e.source !== this.frame.contentWindow) return;
    const m = e.data;
    if (!m || !m.__rapti) return;
    if (m.__rapti === 'req') {
      const res = await this.net.request({ method: m.method, url: m.url, headers: { 'user-agent': 'Mozilla/5.0 Chromium', ...(m.headers || {}) }, body: m.body }, this.origin);
      const reply = res.failed ? { __rapti: 'res', id: m.id, error: res.error } : { __rapti: 'res', id: m.id, status: res.status, statusText: res.statusText, headers: res.headers, body: res.body };
      try { this.frame.contentWindow.postMessage(reply, '*'); } catch (err) { /* page gone */ }
    } else if (m.__rapti === 'nav') {
      if (m.reload) this.reload(); else this.go(m.url, { method: m.method, body: m.body, headers: m.headers });
    } else if (m.__rapti === 'title') {
      if (m.title) this.setTitle(m.title);
    } else if (m.__rapti === 'alert') {
      // alert() inside a page: show it on the browser's bar
      const note = h('div', { class: 'vb-alert' }, m.text);
      this.page.appendChild(note);
      setTimeout(() => note.remove(), 3200);
    }
  }
}
