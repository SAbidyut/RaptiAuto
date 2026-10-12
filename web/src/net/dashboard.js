// dashboard.rapti.net — the cloud / phone-app side of the simulator: devices on the Wi-Fi, HTTP traffic,
// MQTT topics (with a publish form), ThingSpeak charts, Blynk pins you can change, Telegram / IFTTT
// messages, router switches. The page polls /api/state through the browser's fetch (see browser.js).
import { http } from './network.js';

export function dashboardApi(net, req, u) {
  const p = u.pathname;
  let b = {};
  try { b = req.body ? JSON.parse(req.body) : {}; } catch (e) { b = Object.fromEntries(new URLSearchParams(req.body)); }
  if (p === '/api/state') return http.json(net.snapshot());
  if (req.method !== 'POST') return http.json({ error: 'POST expected' }, 405);
  if (p === '/api/mqtt/publish') {
    if (!b.topic) return http.json({ error: 'topic missing' }, 400);
    net.mqtt.publish(null, String(b.topic), String(b.payload ?? ''), !!b.retain, b.broker || 'broker.hivemq.com');
    return http.json({ ok: true });
  }
  if (p === '/api/blynk/set') {
    const bl = net.cloud.blynk.get(b.token);
    if (!bl) return http.json({ error: 'unknown token' }, 404);
    bl.pins.set(String(b.pin).toUpperCase(), String(b.value));
    bl.dirty = bl.dirty || new Set();
    bl.dirty.add(String(b.pin).toUpperCase());
    net.changed();
    return http.json({ ok: true });
  }
  if (p === '/api/telegram/send') {
    const t = net.cloud.telegram;
    t.inbox.push({ update_id: ++t.offset, message: { message_id: t.offset, from: { id: 1, first_name: b.from || 'You' }, chat: { id: 1 }, date: Math.floor(net.clock() / 1000), text: String(b.text || '') } });
    net.note('telegram-in', 'You → bot', String(b.text || ''));
    return http.json({ ok: true });
  }
  if (p === '/api/bt/send') return http.json({ ok: net.btSend(b.dev, String(b.text || '')) });
  if (p === '/api/router') { net.setRouter(!!b.on); return http.json({ ok: true }); }
  if (p === '/api/internet') { net.setInternet(!!b.on); return http.json({ ok: true }); }
  if (p === '/api/live') { if (net.live) { net.live.setEnabled(!!b.on); net.changed(); } return http.json({ ok: !!net.live }); }
  if (p === '/api/strict') { net.opts.strict = !!b.on; net.changed(); return http.json({ ok: true }); }
  if (p === '/api/clear') { net.log.length = 0; net.notes.length = 0; net.mqtt.log.length = 0; net.changed(); return http.json({ ok: true }); }
  return http.json({ error: 'not found' }, 404);
}

export function dashboardPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RAPTI IoT Cloud</title><style>
:root{--bg:#0b1020;--card:#121a33;--line:#24304f;--ink:#e5ecff;--mute:#8b9bc2;--acc:#22d3ee;--ok:#34d399;--bad:#f87171;--warn:#fbbf24}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;z-index:5;background:#0e1630ee;backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
header h1{font-size:17px;margin:0;color:var(--acc)}header .sp{flex:1}
.sw{display:inline-flex;align-items:center;gap:6px;background:#0b1328;border:1px solid var(--line);border-radius:999px;padding:4px 10px;font-size:12.5px;cursor:pointer;user-select:none}
.sw i{width:9px;height:9px;border-radius:50%;background:var(--bad)}.sw.on i{background:var(--ok)}
main{padding:12px;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));max-width:1200px;margin:0 auto}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;min-width:0}
h2{font-size:12.5px;letter-spacing:.09em;text-transform:uppercase;color:var(--mute);margin:0 0 8px;display:flex;justify-content:space-between}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:4px 6px;border-bottom:1px solid #1b2745;text-align:left;vertical-align:top;word-break:break-word}th{color:var(--mute);font-weight:600;font-size:12px}
.dev{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid #1b2745}.dev:last-child{border:0}.dot{width:10px;height:10px;border-radius:50%;background:var(--bad);flex:none}.dot.on{background:var(--ok);box-shadow:0 0 8px var(--ok)}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px}.mute{color:var(--mute)}.pill{display:inline-block;padding:1px 8px;border-radius:999px;background:#1b2a52;font-size:12px;margin-right:4px}
input,button,select{font:inherit;background:#0b1328;color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 9px}button{cursor:pointer;background:#16335c;border-color:#2b4d82}button:active{filter:brightness(1.2)}
.row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}.row input{flex:1;min-width:70px}.ok{color:var(--ok)}.bad{color:var(--bad)}.warn{color:var(--warn)}
.note{padding:7px 10px;border-radius:10px;background:#0f1e3d;margin:5px 0;border-left:3px solid var(--acc)}.note b{display:block;font-size:12.5px;color:var(--acc)}
.note.telegram{border-color:#38bdf8}.note.ifttt{border-color:#f97316}.note.telegram-in{border-color:#a78bfa;margin-left:24px}
svg{width:100%;height:56px;background:#0b1328;border-radius:8px}.big{font-size:22px;font-weight:700}
.empty{color:var(--mute);padding:8px 0}.pins{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}.pin{background:#0b1328;border:1px solid var(--line);border-radius:10px;padding:8px}
</style></head><body>
<header><h1>RAPTI IoT Cloud</h1><span class="mute" id="clock"></span><span class="sp"></span>
<span class="sw" id="swr" title="Wi-Fi router power"><i></i>Router</span><span class="sw" id="swi" title="Internet behind the router"><i></i>Internet</span><span class="sw" id="sws" title="Wrong Wi-Fi name / password fails"><i></i>Strict Wi-Fi</span><span class="sw" id="swl" title="Weather, time, IP, prices and web pages from the phone's real internet"><i></i>Real internet</span>
<button id="clr">Clear logs</button></header>
<main>
<section id="devices"><h2>Devices on the Wi-Fi <span id="wifiname"></span></h2><div id="devlist" class="empty">No device is online yet.</div></section>
<section id="mqtt"><h2>MQTT <span id="mqttn"></span></h2><div id="topics" class="empty">No messages yet.</div>
<div class="row"><input id="mt" placeholder="topic" value="rapti/demo/cmd"><input id="mp" placeholder="payload" value="ON"><button id="mpub">Publish</button></div>
<div class="row"><input id="mb" placeholder="broker" value="broker.hivemq.com"><label class="mute"><input type="checkbox" id="mr"> retain</label></div>
<h2 style="margin-top:12px">Log</h2><div id="mlog" class="mono"></div></section>
<section id="ts"><h2>ThingSpeak channels</h2><div id="tslist" class="empty">No channel yet (a device writes with /update?api_key=…).</div></section>
<section id="bl"><h2>Blynk virtual pins</h2><div id="bllist" class="empty">No Blynk device yet.</div></section>
<section id="nt"><h2>Notifications &amp; chat</h2><div id="notes" class="empty">Telegram / IFTTT / webhook messages sent by devices show here.</div>
<div class="row"><input id="tg" placeholder="Message the bot (Telegram getUpdates)"><button id="tgs">Send</button></div></section>
<section id="ht"><h2>HTTP requests <span id="htn"></span></h2><table id="http"></table></section>
<section id="bt"><h2>Bluetooth terminal</h2><div id="btlist" class="empty">A board that runs SerialBT.begin("name") shows up here — type to send text to it.</div></section>
<section id="af"><h2>Adafruit IO feeds</h2><div id="aflist" class="empty">No feed yet.</div></section>
</main>
<script>
const $=(i)=>document.getElementById(i);
const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const post=(p,b)=>fetch(p,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(()=>load());
let S=null;const cache={};
const put=(id,h)=>{if(cache[id]!==h){cache[id]=h;$(id).innerHTML=h;}};
const ago=(t)=>{const s=Math.max(0,Math.round((S.time-t)/1000));return s<60?s+' s ago':Math.round(s/60)+' min ago';};
function draw(){
  $('clock').textContent=new Date(S.time).toLocaleTimeString();
  $('swr').classList.toggle('on',S.router);$('swi').classList.toggle('on',S.internet);$('sws').classList.toggle('on',S.strict);$('swl').classList.toggle('on',S.liveOn);$('swl').style.display=S.liveOn===undefined?'none':'';
  const online=S.devices.filter(d=>d.connected);
  $('wifiname').textContent=online[0]?online[0].ssid:'';
  $('devlist').className=S.devices.length?'':'empty';
  const link=(h)=>'<a href="'+h+'">'+h.replace('http://','')+'</a>';
  put('devlist',S.devices.length?S.devices.map(d=>'<div class="dev"><span class="dot '+(d.connected||d.ap?'on':'')+'"></span><div style="flex:1"><b>'+esc(d.name)+'</b> <span class="pill">'+esc(d.kind)+'</span><br><span class="mono mute">'+(d.connected?esc(d.ip)+' · '+esc(d.mac)+' · '+esc(d.ssid)+' · '+d.rssi+' dBm':'not on the Wi-Fi')+'</span>'+(d.ap?'<br><span class="mono mute">Access point "'+esc(d.ap.ssid)+'" · '+esc(d.ap.ip)+'</span>':'')+((d.servers.length&&(d.connected||d.ap))?'<br>'+d.servers.map(p=>[d.connected?link('http://'+d.ip+(p===80?'':':'+p)+'/'):'',d.ap?link('http://'+d.ap.ip+(p===80?'':':'+p)+'/'):''].filter(Boolean).join(' · ')).join(' · ')+(d.connected&&d.hostname?'<br><span class="mute mono">or '+link('http://'+d.hostname+'.local/')+'</span>':''):'')+'</div></div>').join(''):'No device is online yet.');
  const m=S.mqtt;
  $('mqttn').textContent=m.clients.length+' client'+(m.clients.length==1?'':'s');
  $('topics').className=m.topics.length?'':'empty';
  $('topics').innerHTML=m.topics.length?'<table><tr><th>Topic</th><th>Last payload</th></tr>'+m.topics.map(t=>'<tr><td class="mono">'+esc(t.topic)+'</td><td class="mono">'+esc(t.payload.slice(0,80))+'</td></tr>').join('')+'</table>':'No messages yet.';
  $('mlog').innerHTML=m.log.slice(0,14).map(x=>'<div><span class="mute">'+new Date(x.t).toLocaleTimeString()+'</span> <b>'+esc(x.topic)+'</b> '+esc(x.payload.slice(0,60))+' <span class="mute">← '+esc(x.from)+'</span></div>').join('');
  $('tslist').className=S.thingspeak.length?'':'empty';
  $('tslist').innerHTML=S.thingspeak.length?S.thingspeak.map(c=>'<div style="margin-bottom:10px"><b>Channel '+c.id+'</b> <span class="mute">key '+esc(c.key)+' · '+c.entries.length+' entries</span>'+Object.keys(c.fields).map(f=>{const vals=c.entries.map(e=>parseFloat(e['field'+f])).filter(Number.isFinite);const lo=Math.min(...vals),hi=Math.max(...vals),sp=(hi-lo)||1;const pts=vals.map((v,i)=>(i/Math.max(1,vals.length-1)*300)+','+(52-(v-lo)/sp*46)).join(' ');return '<div class="mute" style="margin-top:6px">Field '+f+' <span class="big" style="color:var(--ink)">'+(vals.length?vals[vals.length-1]:'—')+'</span></div><svg viewBox="0 0 300 56" preserveAspectRatio="none"><polyline fill="none" stroke="#22d3ee" stroke-width="2" points="'+pts+'"/></svg>';}).join('')+'</div>').join(''):'No channel yet (a device writes with /update?api_key=…).';
  $('bllist').className=S.blynk.length?'':'empty';
  put('bllist',S.blynk.length?S.blynk.map(b=>'<div class="mute mono" style="margin-bottom:6px">token '+esc(b.token.slice(0,10))+'… '+(b.online?'<span class="ok">online</span>':'')+'</div><div class="pins">'+b.pins.map(p=>'<div class="pin"><b>'+esc(p.pin)+'</b><br><span class="big">'+esc(p.value)+'</span><div class="row" style="margin-top:4px"><input data-t="'+esc(b.token)+'" data-p="'+esc(p.pin)+'" value="'+esc(p.value)+'" style="width:60px"><button data-set="1">Set</button></div></div>').join('')+'</div><div class="row"><input id="bp_'+esc(b.token)+'" placeholder="V1" style="max-width:70px"><input id="bv_'+esc(b.token)+'" placeholder="value"><button data-add="'+esc(b.token)+'">Write pin</button></div>').join(''):'No Blynk device yet.');
  $('notes').className=S.notes.length?'':'empty';
  $('notes').innerHTML=S.notes.length?S.notes.slice(0,12).map(n=>'<div class="note '+esc(n.kind)+'"><b>'+esc(n.title)+'</b>'+esc(n.text)+' <span class="mute">'+ago(n.t)+'</span></div>').join(''):'Telegram / IFTTT / webhook messages sent by devices show here.';
  $('htn').textContent=S.http.length+' recent';
  $('http').innerHTML='<tr><th>From</th><th>Request</th><th>Status</th></tr>'+S.http.slice(0,12).map(h=>'<tr><td>'+esc(h.from)+'</td><td class="mono">'+(h.live?'<span class="pill" style="color:#4ade80;border-color:#4ade80">real</span> ':'')+esc(h.method)+' '+esc(h.url.replace(/^https?:\\/\\//,'').slice(0,60))+'</td><td class="'+(h.status>=400||!h.status?'bad':'ok')+'">'+(h.status||'ERR')+'</td></tr>').join('');
  const bts=S.devices.filter(d=>d.bt);
  $('btlist').className=bts.length?'':'empty';
  put('btlist',bts.length?bts.map(d=>'<div style="margin-bottom:10px"><b>'+esc(d.bt.name)+'</b> <span class="pill">'+esc(d.name)+'</span><div class="mono" style="background:#0b1328;border-radius:8px;padding:6px 8px;margin:6px 0;max-height:150px;overflow:auto;white-space:pre-wrap">'+(d.bt.log.map(l=>'<div class="'+(l.dir==='in'?'mute':'ok')+'">'+(l.dir==='in'?'→ ':'← ')+esc(l.text.replace(/\\r?\\n$/,''))+'</div>').join('')||'<span class="mute">(nothing yet)</span>')+'</div><div class="row"><input id="btt_'+esc(d.id)+'" placeholder="text to send"><button data-bt="'+esc(d.id)+'">Send</button></div></div>').join(''):'A board that runs SerialBT.begin("name") shows up here — type to send text to it.');
  $('aflist').className=S.adafruit.length?'':'empty';
  $('aflist').innerHTML=S.adafruit.length?S.adafruit.map(f=>'<div class="mono">'+esc(f.feed)+' = <b>'+esc(f.last)+'</b> <span class="mute">('+f.count+')</span></div>').join(''):'No feed yet.';
}
function load(){return fetch('/api/state').then(r=>r.json()).then(s=>{S=s;draw();}).catch(()=>{});}
$('swr').onclick=()=>post('/api/router',{on:!S.router});$('swi').onclick=()=>post('/api/internet',{on:!S.internet});$('sws').onclick=()=>post('/api/strict',{on:!S.strict});$('swl').onclick=()=>post('/api/live',{on:!S.liveOn});
$('clr').onclick=()=>post('/api/clear',{});
$('mpub').onclick=()=>post('/api/mqtt/publish',{topic:$('mt').value,payload:$('mp').value,retain:$('mr').checked,broker:$('mb').value});
$('tgs').onclick=()=>{if($('tg').value){post('/api/telegram/send',{text:$('tg').value});$('tg').value='';}};
document.addEventListener('click',(e)=>{const b=e.target;if(b.dataset&&b.dataset.set){const i=b.parentNode.querySelector('input');post('/api/blynk/set',{token:i.dataset.t,pin:i.dataset.p,value:i.value});}
 if(b.dataset&&b.dataset.bt){const i=document.getElementById('btt_'+b.dataset.bt);if(i.value){post('/api/bt/send',{dev:b.dataset.bt,text:i.value});i.value='';}}
 if(b.dataset&&b.dataset.add){const t=b.dataset.add;post('/api/blynk/set',{token:t,pin:document.getElementById('bp_'+t).value||'V0',value:document.getElementById('bv_'+t).value});}});
load();setInterval(load,1000);
</script></body></html>`;
}
