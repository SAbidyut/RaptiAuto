// LXTerminal on the virtual Raspberry Pi: a bash-like shell with the usual Linux commands, the
// Raspberry Pi tools (pinout, pinctrl, raspi-gpio, vcgencmd) and python3 running MicroPython.
import { h } from '../ui/widgets.js';
import { Console } from './console.js';
import { normPath, basename, dirname } from './vfs.js';
import { PI_HEADER, BOARDS } from './boards.js';

const USER = 'pi', HOST = 'raspberrypi';
const COMMANDS = ['apt', 'apt-get', 'basename', 'cal', 'cat', 'cd', 'chmod', 'clear', 'cp', 'date', 'df', 'dirname', 'echo', 'env', 'exit', 'export', 'false', 'fastfetch', 'find', 'free',
  'grep', 'head', 'help', 'history', 'hostname', 'i2cdetect', 'id', 'ifconfig', 'ip', 'kill', 'logout', 'ls', 'lsb_release', 'lscpu', 'man', 'mkdir', 'mv', 'nano', 'neofetch', 'pinctrl', 'pinout',
  'ping', 'pip', 'pip3', 'poweroff', 'ps', 'pwd', 'python', 'python3', 'raspi-config', 'raspi-gpio', 'reboot', 'rm', 'rmdir', 'rpicam-hello', 'shutdown', 'sleep', 'sudo', 'tail', 'thonny',
  'top', 'touch', 'tree', 'true', 'uname', 'uptime', 'vcgencmd', 'vi', 'vim', 'wc', 'whoami', 'which', 'xdg-open'];

export class Terminal {
  /** ctx: { sys, onExit(), openThonny(path), openFile(path) } */
  constructor(ctx) {
    this.ctx = ctx;
    this.sys = ctx.sys;
    this.cwd = '/home/pi';
    this.prevCwd = this.cwd;
    this.env = { HOME: '/home/pi', USER, SHELL: '/bin/bash', PATH: '/home/pi/.local/bin:/usr/local/bin:/usr/bin:/bin', LANG: 'en_GB.UTF-8', TERM: 'xterm-256color' };
    this.status = 0;
    this.hist = [];
    this.con = new Console({
      cls: 'term',
      onKey: (e) => this.key(e),
      extraKeys: [
        ['Ctrl+C', () => this.ctrlC()], ['Tab', () => this.complete()], ['↑', (c) => c.histMove(-1)], ['↓', (c) => c.histMove(1)],
        ['Ctrl+D', () => this.ctrlD()], ['Ctrl+L', () => { this.con.clear(); }], ['|', (c) => c.insert('|')], ['/', (c) => c.insert('/')], ['-', (c) => c.insert('-')], ['~', (c) => c.insert('~')], ['"', (c) => c.insert('"')],
      ],
    });
    this.el = h('div', { class: 'term-app' }, this.con.el);
    this.alive = true;
    this.banner();
    this.loop();
  }

  get fs() { return this.sys.piFs; }

  banner() {
    const b = BOARDS[this.sys.board.startsWith('pico') ? 'pi5' : this.sys.board];
    const d = new Date(Date.now() - 3600e3);
    this.con.writeln(`Linux ${HOST} ${b.kernel} #1 SMP PREEMPT Debian 1:6.6.51-1+rpt3 (2024-10-08) aarch64`);
    this.con.writeln('');
    this.con.writeln('The programs included with the Debian GNU/Linux system are free software;');
    this.con.writeln('the exact distribution terms for each program are described in the');
    this.con.writeln('individual files in /usr/share/doc/*/copyright.');
    this.con.writeln('');
    this.con.writeln('Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent');
    this.con.writeln('permitted by applicable law.');
    this.con.writeln(`Last login: ${d.toDateString().replace(/ (\d{4})$/, '')} ${d.toTimeString().slice(0, 8)} ${d.getFullYear()} from 192.168.1.10`);
    this.con.writeln('Type "help" to see the commands of this simulated shell.', 'fg-K');
  }

  promptSegs() {
    const home = this.env.HOME;
    const p = this.cwd === home ? '~' : this.cwd.startsWith(home + '/') ? '~' + this.cwd.slice(home.length) : this.cwd;
    return [[`${USER}@${HOST}`, 'fg-G bold'], [':', ''], [p, 'fg-B bold'], [' $ ', '']];
  }

  async loop() {
    while (this.alive) {
      const line = await this.con.prompt(this.promptSegs());
      if (line === null) continue;
      if (line.trim()) { this.hist.push(line); }
      try { await this.run(line); } catch (e) { this.con.writeln(String(e.message || e), 'err'); this.status = 1; }
    }
  }

  key(e) {
    if (e.key === 'Tab') { this.complete(); return true; }
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { this.ctrlC(); return true; }
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) { this.ctrlD(); return true; }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { this.con.clear(); return true; }
    return false;
  }

  ctrlC() {
    if (this.fg && this.fg.interrupt) { this.fg.interrupt(); return; }
    this.con.cancel('^C');
  }

  ctrlD() {
    if (this.fg && this.fg.eof) { this.fg.eof(); return; }
    if (!this.con.input.value) { this.con.cancel(''); this.con.writeln('logout'); this.exit(); }
  }

  exit() {
    this.alive = false;
    this.con.hideInput();
    if (this.ctx.onExit) this.ctx.onExit();
    else { this.con.writeln('[Process completed — tap to start a new shell]', 'fg-K'); this.el.addEventListener('click', () => this.restart(), { once: true }); }
  }

  restart() { this.alive = true; this.cwd = this.env.HOME; this.con.clear(); this.loop(); }

  complete() {
    const v = this.con.input.value;
    const m = /(\S*)$/.exec(v);
    const word = m[1];
    const first = !v.trim().includes(' ');
    let cands = [];
    if (first && !word.includes('/')) cands = COMMANDS.filter((c) => c.startsWith(word));
    else {
      const dir = word.includes('/') ? normPath(word.slice(0, word.lastIndexOf('/') + 1) || '/', this.cwd) : this.cwd;
      const pre = word.slice(word.lastIndexOf('/') + 1);
      try { cands = this.fs.list(dir).filter((n) => n.startsWith(pre) && (pre.startsWith('.') || !n.startsWith('.'))).map((n) => word.slice(0, word.lastIndexOf('/') + 1) + n + (this.fs.isDir(normPath(n, dir)) ? '/' : '')); } catch (e) { cands = []; }
    }
    if (cands.length === 1) this.con.input.value = v.slice(0, v.length - word.length) + cands[0] + (cands[0].endsWith('/') ? '' : ' ');
    else if (cands.length > 1) {
      let common = cands[0];
      for (const c of cands) while (!c.startsWith(common)) common = common.slice(0, -1);
      if (common.length > word.length) this.con.input.value = v.slice(0, v.length - word.length) + common;
      else { const pr = this.con.prefix.cloneNode(true); this.con.writeln(cands.map((c) => basename(c.replace(/\/$/, '')) + (c.endsWith('/') ? '/' : '')).join('  ')); void pr; }
    }
    this.con.focus();
  }

  // ---------------------------------------------------------------- parsing
  tokenize(line) {
    const out = [];
    let cur = '', q = null, has = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q) q = null; else if (c === '\\' && q === '"' && i + 1 < line.length) cur += line[++i]; else cur += c; continue; }
      if (c === '"' || c === "'") { q = c; has = true; continue; }
      if (c === '\\' && i + 1 < line.length) { cur += line[++i]; has = true; continue; }
      if (/\s/.test(c)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
      if (c === '|' || c === ';' || c === '>' || c === '&') {
        if (cur || has) out.push(cur); cur = ''; has = false;
        if ((c === '>' || c === '&' || c === '|') && line[i + 1] === c) { out.push({ op: c + c }); i++; } else out.push({ op: c });
        continue;
      }
      if (c === '$' && !q) {
        const m = /^\$(\?|\w+|\{\w+\})/.exec(line.slice(i));
        if (m) { const n = m[1].replace(/[{}]/g, ''); cur += n === '?' ? String(this.status) : n === 'PWD' ? this.cwd : (this.env[n] ?? ''); i += m[0].length - 1; continue; }
      }
      cur += c;
    }
    if (q) throw new Error('bash: unexpected EOF while looking for matching `' + q + "'");
    if (cur || has) out.push(cur);
    return out;
  }

  async run(line) {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const toks = this.tokenize(line);
    // split on ; && ||
    let seq = [], cmd = [];
    for (const t of toks) {
      if (typeof t === 'object' && (t.op === ';' || t.op === '&&' || t.op === '||')) { seq.push({ cmd, next: t.op }); cmd = []; } else cmd.push(t);
    }
    seq.push({ cmd, next: null });
    let prevOp = null;
    for (const s of seq) {
      if (prevOp === '&&' && this.status !== 0) { prevOp = s.next; continue; }
      if (prevOp === '||' && this.status === 0) { prevOp = s.next; continue; }
      if (s.cmd.length) await this.pipeline(s.cmd);
      prevOp = s.next;
    }
  }

  async pipeline(toks) {
    const stages = [[]];
    let redirect = null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (typeof t === 'object' && t.op === '|') stages.push([]);
      else if (typeof t === 'object' && (t.op === '>' || t.op === '>>')) { redirect = { append: t.op === '>>', file: toks[i + 1] }; i++; }
      else if (typeof t === 'object' && t.op === '&') { /* background: ignored */ }
      else stages[stages.length - 1].push(t);
    }
    let input = null;
    for (let i = 0; i < stages.length; i++) {
      const last = i === stages.length - 1;
      const capture = !last || !!redirect;
      const res = await this.command(stages[i], { input, capture });
      input = res;
    }
    if (redirect) {
      if (!redirect.file) throw new Error('bash: syntax error near unexpected token `newline\'');
      const p = normPath(redirect.file, this.cwd);
      const prev = redirect.append && this.fs.isFile(p) ? this.fs.read(p) : '';
      this.fs.write(p, prev + (input || ''));
    } else if (input) this.con.write(input);
  }

  /** Runs one command. With capture the output is returned as text, else written to the console. */
  async command(argv, { input, capture }) {
    let out = '';
    const w = (s) => { out += s; };
    const wl = (s = '') => { out += s + '\n'; };
    const err = (s) => { this.con.writeln(s, 'err'); this.status = 1; };
    const done = () => (capture ? out : (this.con.write(out), null));
    let [cmd, ...args] = argv;
    if (cmd === 'sudo') { [cmd, ...args] = args; if (!cmd) { err('usage: sudo command'); return done(); } }
    if (cmd && cmd.startsWith('./')) { args = [cmd, ...args]; cmd = 'python3'; }
    this.status = 0;
    const p = (a) => normPath(a, this.cwd, this.env.HOME);
    const flags = (a) => args.filter((x) => x.startsWith('-') && x.length > 1).join('').replace(/-/g, '');
    const files = () => args.filter((x) => !x.startsWith('-') || x === '-');
    const textOf = (f) => { const path = p(f); if (this.fs.isDir(path)) throw new Error(`${cmd}: ${f}: Is a directory`); if (path.startsWith('/proc/')) return this.procFile(path); return this.fs.read(path).replace(/^/, ''); };
    switch (cmd) {
      case 'help':
        wl('RaptiAuto virtual Raspberry Pi — simulated bash. Commands:');
        for (let i = 0; i < COMMANDS.length; i += 8) wl('  ' + COMMANDS.slice(i, i + 8).map((c) => c.padEnd(12)).join(''));
        wl('');
        wl('Try:  pinout · python3 blink.py · python3 · nano hello.py · pinctrl get 17 · vcgencmd measure_temp');
        break;
      case 'pwd': wl(this.cwd); break;
      case 'cd': {
        let t = args[0] || this.env.HOME;
        if (t === '-') { t = this.prevCwd; wl(t); }
        const path = p(t);
        if (!this.fs.exists(path)) { err(`bash: cd: ${args[0]}: No such file or directory`); break; }
        if (!this.fs.isDir(path)) { err(`bash: cd: ${args[0]}: Not a directory`); break; }
        this.prevCwd = this.cwd; this.cwd = path; break;
      }
      case 'ls': case 'll': case 'dir': {
        const f = flags() + (cmd === 'll' ? 'l' : '');
        const targets = files().length ? files() : ['.'];
        for (const t of targets) {
          const path = p(t);
          if (!this.fs.exists(path)) { err(`ls: cannot access '${t}': No such file or directory`); continue; }
          if (targets.length > 1) wl(t + ':');
          let names = this.fs.isDir(path) ? this.fs.list(path) : [basename(path)];
          if (!f.includes('a')) names = names.filter((n) => !n.startsWith('.'));
          else names = ['.', '..', ...names];
          const base = this.fs.isDir(path) ? path : dirname(path);
          const col = (n) => { const fp = normPath(n, base); const st = this.fs.stat(fp); if (!st || st.dir || n === '.' || n === '..') return 'fg-B bold'; if (st.x || n.endsWith('.sh')) return 'fg-G bold'; return ''; };
          if (f.includes('l')) {
            wl(`total ${names.length * 4}`);
            for (const n of names) {
              const fp = normPath(n, base); const st = this.fs.stat(fp) || { dir: true, size: 4096, mtime: 0 };
              const d = new Date(st.mtime || Date.now() - 86400e3 * 3);
              const size = f.includes('h') ? human(st.size) : String(st.size);
              const line = `${st.dir ? 'd' : '-'}rw${st.dir || st.x ? 'x' : '-'}r-${st.dir || st.x ? 'x' : '-'}r-${st.dir || st.x ? 'x' : '-'} ${st.dir ? 2 : 1} pi pi ${size.padStart(6)} ${d.toDateString().slice(4, 10)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} `;
              if (capture) wl(line + n); else { this.con.write(out + line); out = ''; this.con.writeln(n, col(n)); }
            }
          } else if (capture) for (const n of names) wl(n);
          else {
            this.con.write(out); out = '';
            names.forEach((n, i) => { this.con.write(n, col(n)); this.con.write(i < names.length - 1 ? '  ' : '\n'); });
          }
        }
        break;
      }
      case 'cat': {
        if (!files().length && input != null) { w(input); break; }
        for (const f of files()) { try { const t = textOf(f); w(t); } catch (e) { err(e.message.startsWith('cat') ? e.message : `cat: ${f}: No such file or directory`); } }
        break;
      }
      case 'echo': { const n = args[0] === '-n'; const a = n ? args.slice(1) : args; w(a.join(' ').replace(/\\n/g, args.includes('-e') ? '\n' : '\\n') + (n ? '' : '\n')); break; }
      case 'touch': for (const f of files()) { const path = p(f); if (!this.fs.exists(path)) this.fs.write(path, ''); else if (this.fs.isFile(path)) this.fs.write(path, this.fs.read(path)); } break;
      case 'mkdir': for (const f of files()) { try { if (this.fs.exists(p(f)) && !flags().includes('p')) throw new Error(`mkdir: cannot create directory '${f}': File exists`); this.fs.mkdir(p(f), flags().includes('p')); } catch (e) { err(e.message.startsWith('mkdir') ? e.message : 'mkdir: ' + e.message); } } break;
      case 'rmdir': for (const f of files()) { try { if (this.fs.list(p(f)).length) throw new Error(`rmdir: failed to remove '${f}': Directory not empty`); this.fs.remove(p(f), true); } catch (e) { err(e.message); } } break;
      case 'rm': {
        const fl = flags();
        for (const f of files()) {
          const path = p(f);
          if (!this.fs.exists(path)) { if (!fl.includes('f')) err(`rm: cannot remove '${f}': No such file or directory`); continue; }
          if (this.fs.isDir(path) && !fl.includes('r') && !fl.includes('R')) { err(`rm: cannot remove '${f}': Is a directory`); continue; }
          if (path === '/' || path === '/home' || path === '/home/pi') { err(`rm: refusing to remove '${f}'`); continue; }
          this.fs.remove(path, true);
        }
        break;
      }
      case 'cp': case 'mv': {
        const fs = files();
        if (fs.length < 2) { err(`${cmd}: missing destination file operand after '${fs[0] || ''}'`); break; }
        const dst = p(fs[fs.length - 1]);
        for (const s of fs.slice(0, -1)) {
          const src = p(s);
          if (!this.fs.exists(src)) { err(`${cmd}: cannot stat '${s}': No such file or directory`); continue; }
          if (cmd === 'cp' && this.fs.isDir(src) && !/r/i.test(flags())) { err(`cp: -r not specified; omitting directory '${s}'`); continue; }
          if (cmd === 'cp') this.fs.copy(src, dst); else this.fs.move(src, dst);
        }
        break;
      }
      case 'chmod': { const mode = args[0] || ''; for (const f of args.slice(1)) { const path = p(f); if (!this.fs.isFile(path)) { err(`chmod: cannot access '${f}': No such file or directory`); continue; } if (mode.includes('+x') || /^7/.test(mode)) this.fs.chmodX(path, true); else if (mode.includes('-x')) this.fs.chmodX(path, false); } break; }
      case 'head': case 'tail': {
        const ni = args.indexOf('-n'); let n = ni >= 0 ? Number(args[ni + 1]) : 10;
        const m = args.find((a) => /^-\d+$/.test(a)); if (m) n = Number(m.slice(1));
        const fs = args.filter((a, i) => !a.startsWith('-') && (ni < 0 || i !== ni + 1));
        const text = fs.length ? fs.map((f) => { try { return textOf(f); } catch (e) { err(`${cmd}: cannot open '${f}' for reading: No such file or directory`); return ''; } }).join('') : (input || '');
        const lines = text.replace(/\n$/, '').split('\n');
        const sel = cmd === 'head' ? lines.slice(0, n) : lines.slice(-n);
        if (text) wl(sel.join('\n'));
        break;
      }
      case 'wc': {
        const fs = files();
        const text = fs.length ? fs.map((f) => { try { return textOf(f); } catch (e) { return ''; } }).join('') : (input || '');
        const l = (text.match(/\n/g) || []).length, wd = text.split(/\s+/).filter(Boolean).length, c = new TextEncoder().encode(text).length;
        const f = flags();
        if (f === 'l') wl(`${l}${fs[0] ? ' ' + fs[0] : ''}`); else if (f === 'w') wl(String(wd)); else if (f === 'c') wl(String(c));
        else wl(`${String(l).padStart(3)} ${String(wd).padStart(4)} ${String(c).padStart(5)}${fs[0] ? ' ' + fs[0] : ''}`);
        break;
      }
      case 'grep': {
        const f = flags();
        const rest = args.filter((a) => !a.startsWith('-'));
        const pat = rest[0];
        if (pat == null) { err('Usage: grep [OPTION]... PATTERNS [FILE]...'); break; }
        let re;
        try { re = new RegExp(pat, f.includes('i') ? 'i' : ''); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), f.includes('i') ? 'i' : ''); }
        const srcs = rest.slice(1);
        const scan = (text, name) => { text.split('\n').forEach((line, i) => { if (re.test(line) !== f.includes('v') && line !== '') wl((srcs.length > 1 ? name + ':' : '') + (f.includes('n') ? i + 1 + ':' : '') + line); }); };
        if (srcs.length) for (const s of srcs) { try { scan(textOf(s), s); } catch (e) { err(`grep: ${s}: No such file or directory`); } }
        else scan(input || '', '');
        if (!out) this.status = 1;
        break;
      }
      case 'find': {
        const start = p(args.find((a) => !a.startsWith('-') && args[args.indexOf(a) - 1] !== '-name') || '.');
        const ni = args.indexOf('-name');
        const pat = ni >= 0 ? new RegExp('^' + args[ni + 1].replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;
        const walk = (d) => {
          for (const n of this.fs.list(d)) {
            const fp = normPath(n, d);
            if (!pat || pat.test(n)) wl((args[0] && !args[0].startsWith('-') ? args[0].replace(/\/$/, '') : '.') + fp.slice(start.length));
            if (this.fs.isDir(fp)) walk(fp);
          }
        };
        try { if (!pat) wl(args[0] && !args[0].startsWith('-') ? args[0] : '.'); walk(start); } catch (e) { err(`find: '${args[0]}': No such file or directory`); }
        break;
      }
      case 'tree': {
        const start = p(files()[0] || '.');
        let nd = 0, nf = 0;
        wl(files()[0] || '.');
        const walk = (d, pre) => {
          const names = this.fs.list(d).filter((n) => !n.startsWith('.'));
          names.forEach((n, i) => {
            const fp = normPath(n, d), lastOne = i === names.length - 1;
            wl(pre + (lastOne ? '└── ' : '├── ') + n);
            if (this.fs.isDir(fp)) { nd++; walk(fp, pre + (lastOne ? '    ' : '│   ')); } else nf++;
          });
        };
        try { walk(start, ''); wl(`\n${nd} directories, ${nf} files`); } catch (e) { err(e.message); }
        break;
      }
      case 'basename': wl(basename(args[0] || '')); break;
      case 'dirname': wl(dirname(args[0] || '')); break;
      case 'clear': this.con.clear(); break;
      case 'history': this.hist.forEach((l, i) => wl(`${String(i + 1).padStart(5)}  ${l}`)); break;
      case 'whoami': wl(USER); break;
      case 'id': wl('uid=1000(pi) gid=1000(pi) groups=1000(pi),4(adm),20(dialout),24(cdrom),27(sudo),29(audio),44(video),46(plugdev),60(games),100(users),104(input),106(render),108(netdev),997(gpio),998(i2c),999(spi)'); break;
      case 'hostname': wl(args.includes('-I') ? '192.168.1.42 fd00::ba27:ebff:fe12:3456 ' : HOST); break;
      case 'uname': {
        const b = this.piInfo();
        wl(args.includes('-a') ? `Linux ${HOST} ${b.kernel} #1 SMP PREEMPT Debian 1:6.6.51-1+rpt3 (2024-10-08) aarch64 GNU/Linux` : args.includes('-r') ? b.kernel : args.includes('-m') ? 'aarch64' : 'Linux');
        break;
      }
      case 'lsb_release': wl('No LSB modules are available.\nDistributor ID:\tDebian\nDescription:\tDebian GNU/Linux 12 (bookworm)\nRelease:\t12\nCodename:\tbookworm'); break;
      case 'date': wl(new Date().toString().replace(/ GMT.*$/, '') + ' ' + new Date().getFullYear()); break;
      case 'cal': wl(calendar()); break;
      case 'uptime': { const m = Math.floor(performance.now() / 60000); wl(` ${new Date().toTimeString().slice(0, 8)} up ${m < 60 ? m + ' min' : Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0')},  1 user,  load average: 0.${this.sys.running ? '98' : '08'}, 0.12, 0.09`); break; }
      case 'free': {
        const pi5 = this.sys.board === 'pi5';
        if (args.includes('-h')) wl(`               total        used        free      shared  buff/cache   available\nMem:           ${pi5 ? '7.9Gi' : '3.7Gi'}       812Mi       ${pi5 ? '6.4Gi' : '2.3Gi'}        52Mi       847Mi       ${pi5 ? '7.1Gi' : '2.9Gi'}\nSwap:          511Mi          0B       511Mi`);
        else wl(`               total        used        free      shared  buff/cache   available\nMem:         ${pi5 ? '8245104' : '3884096'}      831488     ${pi5 ? '6545916' : '2185432'}       53248      867700     ${pi5 ? '7413616' : '3052608'}\nSwap:         524284           0      524284`);
        break;
      }
      case 'df': wl('Filesystem      Size  Used Avail Use% Mounted on\nudev            3.8G     0  3.8G   0% /dev\ntmpfs           806M  6.6M  799M   1% /run\n/dev/mmcblk0p2   29G  5.2G   22G  20% /\ntmpfs           4.0G  208K  4.0G   1% /dev/shm\n/dev/mmcblk0p1  510M   75M  436M  15% /boot/firmware'); break;
      case 'ps': {
        wl('    PID TTY          TIME CMD');
        wl('   1842 pts/0    00:00:00 bash');
        if (this.sys.proc && !this.sys.proc.dead) wl(`   ${2051} pts/0    00:00:01 python3`);
        wl(`   ${2100 + this.hist.length} pts/0    00:00:00 ps`);
        break;
      }
      case 'top': {
        const t = this.sys.gpio.cpuTemp();
        wl(`top - ${new Date().toTimeString().slice(0, 8)} up 1:12,  1 user,  load average: 0.21, 0.15, 0.10`);
        wl('Tasks: 187 total,   1 running, 186 sleeping,   0 stopped,   0 zombie');
        wl(`%Cpu(s):  ${this.sys.running ? '24.6' : ' 1.3'} us,  0.8 sy,  0.0 ni, ${this.sys.running ? '74.1' : '97.6'} id,  0.0 wa,  0.0 hi,  0.3 si,  0.0 st`);
        wl('MiB Mem :   8052.0 total,   6392.4 free,    812.2 used,    847.4 buff/cache');
        wl('');
        wl('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND');
        if (this.sys.proc && !this.sys.proc.dead) wl('   2051 pi        20   0   27812  14336   7680 S  24.3   0.2   0:01.82 python3');
        wl('    987 pi        20   0  418924  98112  71424 S   1.3   1.2   0:12.40 labwc');
        wl('   1012 pi        20   0  320188  51200  38912 S   0.7   0.6   0:03.11 wf-panel-pi');
        wl('   1840 pi        20   0  402560  60416  45056 S   0.3   0.7   0:01.05 lxterminal');
        wl('      1 root      20   0  168696  12032   8960 S   0.0   0.1   0:02.31 systemd');
        wl(`(snapshot · CPU ${t}°C)`);
        break;
      }
      case 'lscpu': {
        const b = this.piInfo(); const pi5 = this.sys.board === 'pi5';
        wl(`Architecture:            aarch64\n  CPU op-mode(s):        32-bit, 64-bit\n  Byte Order:            Little Endian\nCPU(s):                  4\n  On-line CPU(s) list:   0-3\nVendor ID:               ARM\n  Model name:            ${pi5 ? 'Cortex-A76' : 'Cortex-A72'}\n    Thread(s) per core:  1\n    Core(s) per cluster: 4\n    CPU max MHz:         ${pi5 ? '2400.0000' : '1800.0000'}\n    CPU min MHz:         ${pi5 ? '1500.0000' : '600.0000'}\nModel:                   ${b.model}`);
        break;
      }
      case 'env': case 'printenv': for (const [k, v] of Object.entries(this.env)) wl(`${k}=${v}`); wl(`PWD=${this.cwd}`); break;
      case 'export': for (const a of args) { const m = /^(\w+)=(.*)$/.exec(a); if (m) this.env[m[1]] = m[2]; } break;
      case 'which': for (const a of args) { if (COMMANDS.includes(a)) wl(a === 'python' || a === 'python3' ? '/usr/bin/python3' : '/usr/bin/' + a); else this.status = 1; } break;
      case 'true': break;
      case 'false': this.status = 1; break;
      case 'man': wl(args[0] ? `No manual entry for ${args[0]} (this is a simulated shell; try "help").` : 'What manual page do you want?\nFor example, try \'man man\'.'); break;
      case 'kill': wl(''); break;
      case 'exit': case 'logout': this.exit(); break;
      case 'sleep': this.con.write(out); out = ''; await this.wait(Number(args[0] || 1) * 1000); break;
      case 'ping': this.con.write(out); out = ''; await this.ping(args); break;
      case 'ifconfig': case 'ip': wl(ipText(cmd === 'ip')); break;
      case 'vcgencmd': wl(this.vcgencmd(args)); if (/^error/.test(out)) this.status = 1; break;
      case 'pinout': this.con.write(out); out = ''; this.pinout(); break;
      case 'pinctrl': wl(this.pinctrl(args)); break;
      case 'raspi-gpio': wl(this.raspiGpio(args)); break;
      case 'gpio': err('bash: gpio: command not found (wiringPi is deprecated — use pinctrl or gpiozero)'); break;
      case 'i2cdetect': wl(this.i2cdetect(args)); break;
      case 'neofetch': case 'fastfetch': this.con.write(out); out = ''; this.neofetch(); break;
      case 'raspi-config': wl('raspi-config needs a full-screen text terminal. Open the Raspberry Pi menu → Preferences → Raspberry Pi Configuration on the Desktop tab.'); break;
      case 'rpicam-hello': case 'libcamera-hello': case 'rpicam-still': err('ERROR: *** no cameras available ***'); break;
      case 'apt': case 'apt-get': this.con.write(out); out = ''; await this.apt(args); break;
      case 'pip': case 'pip3': wl(pipText(args)); if (args[0] === 'install') this.status = 1; break;
      case 'nano': case 'vi': case 'vim': case 'mousepad': case 'geany': await this.nano(args.filter((a) => !a.startsWith('-'))[0]); break;
      case 'thonny': if (this.ctx.openThonny) this.ctx.openThonny(args[0] ? p(args[0]) : null); else err('thonny: cannot open display'); break;
      case 'xdg-open': case 'open': if (args[0] && this.ctx.openFile) this.ctx.openFile(p(args[0])); break;
      case 'reboot': await this.reboot(); break;
      case 'shutdown': case 'poweroff': case 'halt': this.con.writeln(`Broadcast message from root@${HOST} on pts/0:\n\nThe system will power off now!`, 'fg-Y'); this.sys.killProcess(); await this.wait(800); this.con.writeln('Connection to raspberrypi closed.'); this.exit(); break;
      case 'python': case 'python3': case 'python3.11': this.con.write(out); out = ''; await this.python(args); break;
      case undefined: break;
      default: {
        const m = /^(\w+)=(.*)$/.exec(cmd);
        if (m) { this.env[m[1]] = m[2]; break; }
        if (cmd.endsWith('.py') && this.fs.isFile(p(cmd))) { err(`bash: ${cmd}: command not found — run it with: python3 ${cmd}`); this.status = 127; break; }
        err(`bash: ${cmd}: command not found`);
        this.status = 127;
      }
    }
    return done();
  }

  wait(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.fg = null; resolve(); }, ms);
      this.fg = { interrupt: () => { clearTimeout(t); this.con.writeln('^C'); this.fg = null; this.status = 130; resolve(); } };
    });
  }

  piInfo() { return BOARDS[this.sys.board.startsWith('pico') ? 'pi5' : this.sys.board]; }

  procFile(path) {
    const b = this.piInfo(); const pi5 = this.sys.board === 'pi5';
    if (path === '/proc/cpuinfo') {
      let s = '';
      for (let i = 0; i < 4; i++) s += `processor\t: ${i}\nBogoMIPS\t: ${pi5 ? '108.00' : '108.00'}\nFeatures\t: fp asimd evtstrm aes pmull sha1 sha2 crc32 atomics fphp asimdhp cpuid asimdrdm lrcpc dcpop asimddp\nCPU implementer\t: 0x41\nCPU architecture: 8\nCPU variant\t: ${pi5 ? '0x4' : '0x0'}\nCPU part\t: ${pi5 ? '0xd0b' : '0xd08'}\nCPU revision\t: ${pi5 ? '1' : '3'}\n\n`;
      return s + `Revision\t: ${b.revision}\nSerial\t\t: 1a2b3c4d5e6f7a8b\nModel\t\t: ${b.model}\n`;
    }
    if (path === '/proc/meminfo') return `MemTotal:        ${pi5 ? '8245104' : '3884096'} kB\nMemFree:         ${pi5 ? '6545916' : '2185432'} kB\nMemAvailable:    ${pi5 ? '7413616' : '3052608'} kB\n`;
    if (path === '/proc/device-tree/model') return b.model + '\n';
    if (path === '/proc/version') return `Linux version ${b.kernel} (gcc-12 (Debian 12.2.0-14) 12.2.0) #1 SMP PREEMPT Debian 1:6.6.51-1+rpt3 (2024-10-08)\n`;
    throw new Error(`cat: ${path}: No such file or directory`);
  }

  vcgencmd(args) {
    const pi5 = this.sys.board === 'pi5';
    switch (args[0]) {
      case 'measure_temp': return `temp=${this.sys.gpio.cpuTemp().toFixed(1)}'C`;
      case 'get_throttled': return 'throttled=0x0';
      case 'measure_clock': return args[1] === 'arm' || !args[1] ? `frequency(0)=${pi5 ? (this.sys.running ? 2400000000 : 1500000000) : (this.sys.running ? 1800000000 : 600000000)}` : `frequency(0)=${pi5 ? 960000000 : 500000000}`;
      case 'measure_volts': return `volt=${pi5 ? '0.7200' : '0.8500'}V`;
      case 'get_mem': return args[1] === 'gpu' ? 'gpu=8M' : `arm=${pi5 ? 8064 : 3968}M`;
      case 'version': return `2024/09/23 14:02:56\nCopyright (c) 2012 Broadcom\nversion 26826259 (release) (embedded)`;
      case 'commands': return 'commands="measure_temp, get_throttled, measure_clock, measure_volts, get_mem, version"';
      default: return args[0] ? `error=1 error_msg="Command not registered"` : 'Usage: vcgencmd measure_temp | get_throttled | measure_clock arm | measure_volts | get_mem arm | version';
    }
  }

  pinout() {
    const b = this.piInfo(); const pi5 = this.sys.board === 'pi5';
    const G = 'fg-G', Y = 'fg-Y', R = 'fg-R', K = 'fg-K', C = 'fg-C';
    const art = pi5 ? [
      ',--------------------------------.',
      '| oooooooooooooooooooo J8   : +====',
      '| 1ooooooooooooooooooo      : |USB2',
      '|  Wi    +---+      +----+  : +====',
      '|  Fi    |RAM|      |RP1 |    +====',
      '||p      +---+      +----+    |USB3',
      '||c       ------              +====',
      '||i       |SoC|               +======',
      '||e       ------  J14         |   Net',
      '| pwr      |hd|   |hd| |cd|   +======',
      '`-| |------| |-----| |--------------\'',
    ] : [
      ',--------------------------------.',
      '| oooooooooooooooooooo J8   +======',
      '| 1ooooooooooooooooooo  PoE |   Net',
      '|  Wi                    1o +======',
      '|  Fi  Pi Model 4B  V1.5 oo      |',
      '|        ,----. +---+         +====',
      '| |D|    |SoC | |RAM|         |USB3',
      '| |S|    |    | |   |         +====',
      '| |I|    `----\' +---+            |',
      '|                   |C|       +====',
      '|                   |S|       |USB2',
      '| pwr   |hd|   |hd| |I||A|    +====',
      '`-| |---|m0|---|m1|----|V|-------\'',
    ];
    for (const l of art) this.con.writeln(l, G);
    this.con.writeln('');
    const kv = (k, v) => { this.con.write(k.padEnd(19), 'bold'); this.con.writeln(': ' + v); };
    kv('Revision', b.revision); kv('SoC', b.soc.replace('Broadcom ', '')); kv('RAM', pi5 ? '8GB' : '4GB'); kv('Storage', 'MicroSD');
    kv('USB ports', '4 (of which 2 USB3)'); kv('Ethernet ports', '1 (1000Mbps max. speed)'); kv('Wi-fi', 'True'); kv('Bluetooth', 'True'); kv('Camera ports (CSI)', pi5 ? '2' : '1'); kv('Display ports (DSI)', pi5 ? '2' : '1');
    this.con.writeln('');
    this.con.writeln('J8:', 'bold');
    const colOf = (p) => (p.type === 'power3' ? Y : p.type === 'power5' ? R : p.type === 'gnd' ? K : p.type === 'gpio' ? G : C);
    for (let i = 1; i <= 40; i += 2) {
      const a = PI_HEADER[i - 1], c = PI_HEADER[i];
      this.con.write(a.name.padStart(8), colOf(a)); this.con.write(` (${i}) `.padStart(6)); this.con.write(`(${i + 1})`.padEnd(5)); this.con.writeln(' ' + c.name, colOf(c));
    }
    this.con.writeln('');
    this.con.writeln('For further information, please refer to https://pinout.xyz/', K);
  }

  pinState(g) {
    const gp = this.sys.gpio; const pn = gp.pins.get(g);
    const lvl = gp.read(g);
    return { pn, lvl };
  }

  pinctrl(args) {
    if (this.sys.board === 'pi4' && args[0] === undefined) { /* pinctrl exists on Pi 4 too */ }
    const fmt = (g) => {
      const { pn, lvl } = this.pinState(g);
      const fn = pn.mode === 'out' ? 'op' : pn.mode === 'pwm' ? 'a0' : 'ip';
      const pull = pn.pull === 'up' ? 'pu' : pn.pull === 'down' ? 'pd' : 'pn';
      const name = PI_HEADER.find((x) => x.gpio === g);
      return `${String(g).padStart(2)}: ${fn}    ${pull} | ${lvl ? 'hi' : 'lo'} // ${name ? 'GPIO' + g : ''} = ${pn.mode === 'out' ? 'output' : pn.mode === 'pwm' ? 'PWM' : 'input'}`;
    };
    const sub = args[0];
    if (!sub || sub === 'get') {
      const pins = (args.slice(1).length ? args.slice(1) : [...Array(28).keys()].map(String)).flatMap((a) => (a.includes('-') ? range(a) : [Number(a)]));
      return pins.filter((g) => g >= 0 && g <= 27).map(fmt).join('\n');
    }
    if (sub === 'set') {
      const g = Number(args[1]); const ops = args.slice(2);
      if (!(g >= 0 && g <= 27)) return 'pinctrl: invalid GPIO';
      const gp = this.sys.gpio;
      if (ops.includes('op')) gp.setup(g, 'out');
      if (ops.includes('ip')) gp.setup(g, 'in', gp.pins.get(g).pull);
      if (ops.includes('pu')) gp.setPull(g, 'up'); if (ops.includes('pd')) gp.setPull(g, 'down'); if (ops.includes('pn')) gp.setPull(g, 'none');
      if (ops.includes('dh')) { if (gp.pins.get(g).mode !== 'out') gp.setup(g, 'out'); gp.write(g, 1); }
      if (ops.includes('dl')) { if (gp.pins.get(g).mode !== 'out') gp.setup(g, 'out'); gp.write(g, 0); }
      return '';
    }
    if (sub === 'help' || sub === '-h') return 'Use:\n  pinctrl [get] [GPIO]          show the state of pins\n  pinctrl set GPIO [op|ip] [pu|pd|pn] [dh|dl]\n\n  op = output, ip = input, pu/pd/pn = pull up / down / none, dh/dl = drive high / low';
    return this.pinctrl(['get', ...args]);
  }

  raspiGpio(args) {
    if (this.sys.board === 'pi5') return 'raspi-gpio is not supported on Pi 5 - use `pinctrl`';
    if (args[0] === 'get') {
      const pins = args[1] ? args.slice(1).flatMap((a) => (a.includes('-') ? range(a) : [Number(a)])) : [...Array(28).keys()];
      return pins.map((g) => { const { pn, lvl } = this.pinState(g); return `GPIO ${g}: level=${lvl} fsel=${pn.mode === 'out' ? 1 : 0} func=${pn.mode === 'out' ? 'OUTPUT' : 'INPUT'} pull=${(pn.pull || 'none').toUpperCase()}`; }).join('\n');
    }
    if (args[0] === 'set') return this.pinctrl(args);
    return 'Usage: raspi-gpio get [GPIO]  |  raspi-gpio set <GPIO> [op|ip] [pu|pd|pn] [dh|dl]';
  }

  i2cdetect(args) {
    if (!args.includes('-y')) return 'Usage: i2cdetect -y 1';
    let s = '     0  1  2  3  4  5  6  7  8  9  a  b  c  d  e  f';
    const has = new Set(this.sys.gpio.parts.filter((p) => p.type === 'lcd').map((p) => Number(p.props.addr ?? 0x27)));
    for (let r = 0; r < 8; r++) {
      s += `\n${(r * 16).toString(16).padStart(2, '0')}: `;
      for (let c = 0; c < 16; c++) { const a = r * 16 + c; s += (a < 3 || a > 0x77) ? '   ' : has.has(a) ? a.toString(16).padStart(2, '0') + ' ' : '-- '; }
    }
    return s;
  }

  neofetch() {
    const b = this.piInfo();
    const logo = ['   .~~.   .~~.  ', '  \'. \\ \' \' / .\'  ', '   .~ .~~~..~.   ', '  : .~.\'~\'.~. :  ', ' ~ (   ) (   ) ~ ', '( : \'~\'.~.\'~\' : )', ' ~ .~ (   ) ~. ~ ', '  (  : \'~\' :  )  ', '   \'~ .~~~. ~\'   ', '       \'~\'       '];
    const info = [[`pi@raspberrypi`, ''], ['--------------', ''], ['OS', 'Debian GNU/Linux 12 (bookworm) aarch64'], ['Host', b.model], ['Kernel', b.kernel], ['Uptime', Math.floor(performance.now() / 60000) + ' mins'],
      ['Shell', 'bash 5.2.15'], ['DE', 'labwc (Wayland)'], ['Terminal', 'lxterminal'], ['CPU', `${b.soc.replace('Broadcom ', '')} (4) @ ${this.sys.board === 'pi5' ? '2.400' : '1.800'}GHz`], ['Memory', `812MiB / ${this.sys.board === 'pi5' ? '8052' : '3793'}MiB`], ['Temp', this.sys.gpio.cpuTemp() + '°C']];
    for (let i = 0; i < Math.max(logo.length, info.length); i++) {
      this.con.write((logo[i] || '').padEnd(20), i < 2 ? 'fg-G bold' : 'fg-R bold');
      const it = info[i];
      if (it) { if (it[1]) { this.con.write(it[0], 'fg-R bold'); this.con.write(': ' + it[1]); } else this.con.write(it[0], 'fg-G bold'); }
      this.con.write('\n');
    }
  }

  async ping(args) {
    const host = args.filter((a) => !a.startsWith('-') && args[args.indexOf(a) - 1] !== '-c')[0];
    if (!host) { this.con.writeln('ping: usage error: Destination address required', 'err'); this.status = 1; return; }
    const ci = args.indexOf('-c'); const count = ci >= 0 ? Number(args[ci + 1]) : Infinity;
    const ip = /^\d+\.\d+\.\d+\.\d+$/.test(host) ? host : '142.250.' + (host.length * 7 % 255) + '.' + (host.length * 13 % 255);
    this.con.writeln(`PING ${host} (${ip}) 56(84) bytes of data.`);
    let n = 0, stop = false; const times = [];
    this.fg = { interrupt: () => { stop = true; } };
    while (!stop && n < count) {
      n++;
      const t = 8 + Math.random() * 14; times.push(t);
      this.con.writeln(`64 bytes from ${ip}: icmp_seq=${n} ttl=117 time=${t.toFixed(1)} ms`);
      await new Promise((r) => { const tm = setTimeout(r, 1000); this.fg.interrupt = () => { stop = true; clearTimeout(tm); r(); }; });
    }
    this.fg = null;
    if (stop) this.con.writeln('^C');
    this.con.writeln(`\n--- ${host} ping statistics ---\n${n} packets transmitted, ${n} received, 0% packet loss, time ${n * 1001}ms\nrtt min/avg/max/mdev = ${Math.min(...times).toFixed(3)}/${(times.reduce((a, b) => a + b, 0) / n).toFixed(3)}/${Math.max(...times).toFixed(3)}/2.114 ms`);
  }

  async apt(args) {
    const sub = args.find((a) => !a.startsWith('-'));
    const pk = args.filter((a) => !a.startsWith('-')).slice(1);
    const step = (t, ms = 250) => { this.con.writeln(t); return this.wait(ms); };
    if (sub === 'update') {
      for (const l of ['Hit:1 http://deb.debian.org/debian bookworm InRelease', 'Hit:2 http://deb.debian.org/debian-security bookworm-security InRelease', 'Hit:3 http://deb.debian.org/debian bookworm-updates InRelease', 'Hit:4 http://archive.raspberrypi.com/debian bookworm InRelease', 'Reading package lists... Done', 'Building dependency tree... Done', 'Reading state information... Done', 'All packages are up to date.']) await step(l, 280);
    } else if (sub === 'install' || sub === 'upgrade' || sub === 'full-upgrade') {
      await step('Reading package lists... Done'); await step('Building dependency tree... Done'); await step('Reading state information... Done');
      if (sub !== 'install' || !pk.length) { await step('Calculating upgrade... Done'); await step('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.'); return; }
      const builtin = { 'python3-gpiozero': 1, 'python3-rpi.gpio': 1, 'python3-rpi-lgpio': 1, 'python3': 1, 'thonny': 1, 'python3-pip': 1 };
      for (const p of pk) {
        if (builtin[p]) await step(`${p} is already the newest version.`);
        else { this.con.writeln(`E: Unable to locate package ${p}`, 'err'); this.con.writeln('   (The virtual Pi is offline; gpiozero, RPi.GPIO, neopixel and adafruit_dht are built in.)', 'fg-K'); this.status = 100; }
      }
      if (!this.status) await step('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.');
    } else this.con.writeln('apt 2.6.1 (arm64)\nUsage: apt [options] command\n\nMost used commands:\n  update - retrieve new lists of packages\n  upgrade - upgrade the system by installing/upgrading packages\n  install - install packages');
  }

  async nano(file) {
    if (!file) file = 'New Buffer';
    const path = file === 'New Buffer' ? null : normPath(file, this.cwd, this.env.HOME);
    if (path && this.fs.isDir(path)) { this.con.writeln(`"${file}" is a directory`, 'err'); return; }
    const text = path && this.fs.isFile(path) ? this.fs.read(path) : '';
    await new Promise((resolve) => {
      const ta = h('textarea', { class: 'nano-text', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' });
      ta.value = text;
      const status = h('div', { class: 'nano-status' }, path && !this.fs.isFile(path) ? '[ New File ]' : `[ Read ${text.split('\n').length - 1} lines ]`);
      let dirty = false;
      ta.addEventListener('input', () => { dirty = true; title.lastChild.textContent = 'Modified'; });
      const save = () => { if (!path) { status.textContent = '[ No file name: open nano with a file name ]'; return false; } this.fs.write(path, ta.value); dirty = false; title.lastChild.textContent = ''; status.textContent = `[ Wrote ${ta.value.split('\n').length - (ta.value.endsWith('\n') ? 1 : 0)} lines ]`; return true; };
      const close = () => { ov.remove(); this.con.focus(); resolve(); };
      const exit = () => {
        if (!dirty) return close();
        status.innerHTML = '';
        status.append('Save modified buffer? ', h('button', { class: 'nano-btn', onclick: () => { if (save()) close(); } }, 'Y Yes'), h('button', { class: 'nano-btn', onclick: close }, 'N No'), h('button', { class: 'nano-btn', onclick: () => { status.textContent = ''; } }, '^C Cancel'));
      };
      const title = h('div', { class: 'nano-title' }, h('span', {}, '  GNU nano 7.2'), h('b', {}, path ? basename(path) : 'New Buffer'), h('span', {}, ''));
      const k = (key, label, fn) => h('button', { class: 'nano-key', onclick: fn }, h('b', {}, key), ' ' + label);
      const foot = h('div', { class: 'nano-foot' }, k('^O', 'Write Out', save), k('^X', 'Exit', exit), k('^K', 'Cut', () => cutLine(ta)), k('^U', 'Paste', () => pasteLine(ta)), k('Tab', 'Indent', () => insertAt(ta, '    ')), k('^W', 'Where Is', () => { const q = prompt('Search:'); if (q) { const i = ta.value.indexOf(q, ta.selectionEnd); if (i >= 0) { ta.setSelectionRange(i, i + q.length); ta.focus(); } } }));
      ta.addEventListener('keydown', (e) => {
        if (e.ctrlKey && (e.key === 'o' || e.key === 's')) { e.preventDefault(); save(); }
        else if (e.ctrlKey && e.key === 'x') { e.preventDefault(); exit(); }
        else if (e.key === 'Tab') { e.preventDefault(); insertAt(ta, '    '); }
      });
      const ov = h('div', { class: 'nano' }, title, ta, status, foot);
      this.el.appendChild(ov);
      setTimeout(() => ta.focus(), 50);
    });
  }

  async reboot() {
    this.sys.killProcess();
    this.sys.gpio.reset();
    this.con.writeln(`Broadcast message from root@${HOST} on pts/0:\n\nThe system will reboot now!`, 'fg-Y');
    await this.wait(700);
    this.con.clear();
    const msgs = ['[    0.000000] Booting Linux on physical CPU 0x0000000000 [0x414fd0b1]', `[    0.000000] Linux version ${this.piInfo().kernel}`, `[    0.000000] Machine model: ${this.piInfo().model}`, '[    1.023112] mmc0: new ultra high speed DDR50 SDXC card at address aaaa', '[    1.511904] EXT4-fs (mmcblk0p2): mounted filesystem', '[  OK  ] Started systemd-udevd.service', '[  OK  ] Reached target network.target', '[  OK  ] Started ssh.service - OpenBSD Secure Shell server', '[  OK  ] Started lightdm.service', '', `Raspberry Pi OS (Debian GNU/Linux 12) ${HOST} tty1`, ''];
    for (const m of msgs) { this.con.writeln(m, m.includes('OK') ? 'fg-G' : ''); await this.wait(90); }
    this.cwd = this.env.HOME;
    this.banner();
  }

  // ---------------------------------------------------------------- python3
  async python(args) {
    if (args[0] === '--version' || args[0] === '-V') { this.con.writeln('Python 3.11.2 (simulated by MicroPython 1.29.0)'); return; }
    if (args[0] === '-m' && (args[1] === 'pip')) { this.con.writeln(pipText(args.slice(2))); return; }
    if (args[0] === '-m' && args[1] === 'venv') { this.con.writeln(`Created virtual environment ${args[2] || ''} (simulated)`); return; }
    const sys = this.sys;
    if (sys.isPico) { this.con.writeln('python3: switch the board to a Raspberry Pi 4 / 5 to use the terminal', 'err'); return; }
    let code = null, file = null;
    if (args[0] === '-c') code = args[1] || '';
    else if (args[0] && !args[0].startsWith('-')) {
      file = normPath(args[0], this.cwd, this.env.HOME);
      if (!this.fs.isFile(file)) { this.con.writeln(`python3: can't open file '${file}': [Errno 2] No such file or directory`, 'err'); this.status = 2; return; }
    }
    const proc = await sys.spawn({
      owner: this,
      cwd: this.cwd,
      out: (t, s) => this.con.write(t, s === 'err' ? 'err' : ''),
      readLine: (prompt) => this.con.prompt(prompt, { keepHistory: false }).then((v) => (v == null ? '' : v)),
    });
    this.fg = { interrupt: () => { if (proc.busy) proc.interrupt(); else this.con.cancel('^C'); }, eof: () => { this.replEof = true; this.con.cancel(''); } };
    if (file || code != null) {
      await proc.exec(`import sys\nsys.argv = ${JSON.stringify([file || '-c', ...args.slice(1)])}`);
      const st = file ? await proc.runFile(file) : await proc.runSource(code, '<string>');
      this.status = st;
      this.fg = null;
      if (sys.proc === proc) sys.killProcess();
      return;
    }
    // interactive interpreter
    this.con.writeln('Python 3.11.2 · MicroPython 1.29.0 engine (RaptiAuto virtual Raspberry Pi) on linux');
    this.con.writeln('Type "help()" for more information, exit() or Ctrl+D to leave.');
    this.replEof = false;
    let buf = [];
    while (!proc.dead && sys.proc === proc) {
      const prev = buf.length ? buf[buf.length - 1] : '';
      const indent = buf.length ? (/^(\s*)/.exec(prev)[1] + (/:\s*$/.test(prev) ? '    ' : '')) : '';
      const line = await this.con.prompt(buf.length ? '... ' : '>>> ', { value: indent });
      if (this.replEof) break;
      if (line == null) { buf = []; if (proc.busy) continue; this.con.writeln('KeyboardInterrupt', 'err'); continue; }
      if (!buf.length && /^\s*(exit|quit)\(\)\s*$/.test(line)) break;
      if (!buf.length && !line.trim()) continue;
      buf.push(line);
      if (needsMore(buf, line)) continue;
      const src = buf.join('\n').replace(/\s+$/, '') + '\n';
      buf = [];
      await proc.replExec(src);
    }
    this.fg = null;
    if (sys.proc === proc) sys.killProcess();
  }
}

/** Is a REPL block still open? (ends with ':', open brackets / triple quotes, or inside a block) */
export function needsMore(buf, line) {
  const src = buf.join('\n');
  let depth = 0, q = null, tq = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (tq && src.startsWith(q.repeat(3), i)) { q = null; tq = false; i += 2; } else if (!tq && c === q) q = null; else if (c === '\\') i++;
      continue;
    }
    if (c === '#') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'") { if (src.startsWith(c.repeat(3), i)) { q = c; tq = true; i += 2; } else q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
  }
  if (q && tq) return true;
  if (depth > 0) return true;
  if (buf.length === 1) return /:\s*(#.*)?$/.test(line) || /^\s*@/.test(line);
  return line.trim() !== '';
}

function range(a) { const [x, y] = a.split('-').map(Number); const r = []; for (let i = x; i <= y; i++) r.push(i); return r; }
function human(n) { return n < 1024 ? String(n) : n < 1048576 ? (n / 1024).toFixed(1) + 'K' : (n / 1048576).toFixed(1) + 'M'; }
function insertAt(ta, t) { const s = ta.selectionStart, e = ta.selectionEnd; ta.value = ta.value.slice(0, s) + t + ta.value.slice(e); ta.setSelectionRange(s + t.length, s + t.length); ta.dispatchEvent(new Event('input')); ta.focus(); }
let cutBuf = '';
function cutLine(ta) { const v = ta.value; const s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1; let e = v.indexOf('\n', ta.selectionStart); e = e < 0 ? v.length : e + 1; cutBuf = v.slice(s, e); ta.value = v.slice(0, s) + v.slice(e); ta.setSelectionRange(s, s); ta.dispatchEvent(new Event('input')); ta.focus(); }
function pasteLine(ta) { if (cutBuf) insertAt(ta, cutBuf); }

function calendar() {
  const d = new Date(); const y = d.getFullYear(), m = d.getMonth();
  const name = d.toLocaleString('en', { month: 'long' }) + ' ' + y;
  let s = name.padStart(10 + Math.ceil(name.length / 2)) + '\nSu Mo Tu We Th Fr Sa\n';
  const first = new Date(y, m, 1).getDay(); const days = new Date(y, m + 1, 0).getDate();
  s += '   '.repeat(first);
  for (let i = 1; i <= days; i++) { s += String(i).padStart(2) + ((first + i) % 7 ? ' ' : '\n'); }
  return s.trimEnd();
}

function ipText(ipCmd) {
  if (ipCmd) return '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n2: eth0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 state DOWN\n    link/ether d8:3a:dd:12:34:56 brd ff:ff:ff:ff:ff:ff\n3: wlan0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    link/ether d8:3a:dd:12:34:57 brd ff:ff:ff:ff:ff:ff\n    inet 192.168.1.42/24 brd 192.168.1.255 scope global dynamic noprefixroute wlan0';
  return 'eth0: flags=4099<UP,BROADCAST,MULTICAST>  mtu 1500\n        ether d8:3a:dd:12:34:56  txqueuelen 1000  (Ethernet)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n\nwlan0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.1.42  netmask 255.255.255.0  broadcast 192.168.1.255\n        ether d8:3a:dd:12:34:57  txqueuelen 1000  (Ethernet)';
}

function pipText(args) {
  if (args[0] === 'install') return 'error: externally-managed-environment\n\n× This environment is externally managed\n╰─> To install Python packages system-wide, try apt install\n    python3-xyz, where xyz is the package you are trying to\n    install.\n\n(RaptiAuto: the virtual Pi is offline. Built in: gpiozero, RPi.GPIO, neopixel, adafruit_dht, board.)';
  if (args[0] === 'list') return 'Package    Version\n---------- -------\ngpiozero   2.0.1\nRPi.GPIO   0.7.1\nadafruit-circuitpython-dht 4.0.4\nadafruit-circuitpython-neopixel 6.3.12';
  return 'pip 23.0.1 from /usr/lib/python3/dist-packages/pip (python 3.11)';
}
