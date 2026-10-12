import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, pre, code, openPi, k } from '../helpers.js';

export default {
  id: 'pi-os', no: 'P7', title: 'The Desktop and the Terminal', icon: 'terminal',
  blurb: 'The Raspberry Pi OS desktop, windows, File Manager, Text Editor, the file system, the Terminal and its real commands.',
  sections: [
    {
      id: 'desktop', title: 'The desktop at a glance',
      html: `
${A.heroDesktop()}
<p>The <b>Desktop</b> tab of a Pi 5 / Pi 4 lab is a small <b>Raspberry Pi OS</b> (Bookworm) desktop. You use it the way you use the real one: a panel at the top, windows for programs, a file manager, a terminal.</p>
${A.desktopAnatomy()}
${ul(
  '<b>The raspberry</b> (top left) opens the program menu.',
  '<b>Launchers</b> next to it: <b>Chromium</b> (web), <b>File Manager</b>, <b>Terminal</b>. Tap once to start.',
  '<b>Task buttons</b> appear for every open window.',
  'On the right: the tray (Bluetooth, Wi-Fi <i>RaptiNet</i>, volume) and the <b>clock</b>.',
  'The desktop itself shows a <b>Wastebasket</b> and your <b>pi</b> folder, plus anything you put in <code>~/Desktop</code>. Double-tap an icon to open it.')}
${note('The desktop exists on the <b>Pi 5 and Pi 4</b> only. A Pico has no operating system, so its tab bar has no Desktop.')}`,
    },
    {
      id: 'menu', title: 'The raspberry menu',
      html: `
${A.raspMenu()}
${table(['Group', 'Programs'], [
  ['<b>Programming</b>', 'Thonny'],
  ['<b>Internet</b>', 'Chromium'],
  ['<b>Accessories</b>', 'File Manager · Terminal · Text Editor · Calculator'],
  ['<b>Preferences</b>', 'Raspberry Pi Configuration'],
  ['<b>Help</b>', 'Opens a short help text in the Text Editor.'],
  ['<b>Shutdown…</b>', 'Shutdown · Reboot · Logout · Cancel'],
])}
<p><b>Shutdown</b> shows a black "Power off" screen with a <b>Power on</b> button; <b>Reboot</b> restarts after a moment and puts all GPIO pins back to their start state. Both stop a running program. (The power button on the Pi 5\'s drawing in the Pinout tab opens the same dialog.)</p>`,
    },
    {
      id: 'windows', title: 'Windows',
      html: `
${A.windowAnatomy()}
<p>Every program opens in a <b>window</b> with a title bar and three buttons: <b>minimise</b>, <b>maximise</b> and <b>close</b>. On a phone every window is <b>maximised</b> — the whole desktop is the window. On a tablet or in landscape full screen the windows float and you can <b>drag</b> them by the title bar; a double tap on the title bar maximises.</p>
${ul(
  'The <b>task button</b> of a window: tap to bring it to the front, tap again to minimise it.',
  '<b>File Manager</b>, <b>Thonny</b>, <b>Chromium</b>, <b>Calculator</b> and <b>Raspberry Pi Configuration</b> open once; <b>Terminal</b> and <b>Text Editor</b> can be opened several times.',
  '<b>Thonny</b> has just one home: the Thonny / Output tabs <b>or</b> a window on the desktop. Opening it in a window takes it from the tabs, and the other way round.',
  'The phone\'s <b>Back</b> button closes the front window.')}
${tip('To write a program the Pi way, open <b>Thonny</b> from the menu (Programming ▸ Thonny) in a desktop window; for the best view use full screen (chapter P1).')}`,
    },
    {
      id: 'files', title: 'File Manager and Text Editor',
      html: `
${A.fileManagerFig()}
<p>The <b>File Manager</b> shows folders and files of the Pi. The left side lists <b>Home</b>, <b>Desktop</b>, <b>Documents</b>, <b>Downloads</b>, <b>projects</b> and the <b>Filesystem root</b>. The bar on top has <b>Back</b>, <b>Up</b>, <b>Home</b>, the path (you can type one) and <b>+ folder</b> / <b>+ file</b>.</p>
${ul(
  'Tap a <b>folder</b> to enter it.',
  'Tap a <b>.py</b> file: it opens in <b>Thonny</b>. Tap any other file: it opens in the <b>Text Editor</b>.',
  '<b>Touch and hold</b> a file or folder: <b>Rename</b> or <b>Delete</b>.',
  'The status bar counts the items.')}
<p>The <b>Text Editor</b> is a plain notepad with <b>New · Open · Save · Save As</b>. Save asks for a path (the default is <code>/home/pi/Documents/untitled.txt</code>); <kbd>Ctrl</kbd>+<kbd>S</kbd> also saves. Use it for notes, <code>config.txt</code> or data files — and Thonny for Python.</p>`,
    },
    {
      id: 'fs', title: 'The file system and paths',
      html: `
${A.vfsTree()}
<p>All programs see the <b>same files</b>: what you save in Thonny appears in the File Manager and in the Terminal, and vice versa. Files are kept on the phone (the "SD card"). Your home folder is <code>/home/pi</code>, written <code>~</code> for short; the example programs are in it.</p>
${A.pathsFig()}
${table(['Path', 'Meaning'], [
  ['<code>/home/pi/blink.py</code>', 'an absolute path: works from anywhere'],
  ['<code>~/projects</code>', 'the same as <code>/home/pi/projects</code>'],
  ['<code>blink.py</code>', 'relative: the file in the folder you are in'],
  ['<code>..</code>', 'the folder above'],
  ['<code>/boot/firmware/config.txt</code>', 'the boot settings; the SPI and I2C switches of Raspberry Pi Configuration edit it'],
])}
<p>A <b>Pico</b> has a much smaller file system: the root <code>/</code> of its flash, with <code>main.py</code> and a <code>lib</code> folder. It is reached through Thonny\'s <b>Files</b> button.</p>
${warn('Deleting is for good: there is no bin that keeps files. The <b>Wastebasket</b> icon of the desktop is only decoration.')}`,
    },
    {
      id: 'term', title: 'The Terminal',
      html: `
${A.terminalAnatomy()}
<p>The <b>Terminal</b> (launcher in the panel, or <i>Accessories ▸ Terminal</i>) is a simulated <b>bash</b>. The prompt tells you who and where you are:</p>
${pre(`pi@raspberrypi:~ $
 │   │          │  └ $ = ready for a command
 │   │          └ the folder (~ = /home/pi)
 │   └ the computer
 └ the user`)}
${ul(
  '<b>Enter</b> runs the command. <b>Tab</b> completes a command or a file name. <b>↑ ↓</b> bring back old commands.',
  '<b>Ctrl+C</b> stops a running program, <b>Ctrl+L</b> clears the screen, <b>Ctrl+D</b> (or <code>exit</code>) closes the Terminal. The key bar under the text holds these keys and <code>| / - ~</code> for phones.',
  'Shell tricks work: <code>cmd1 | cmd2</code> (pipe), <code>cmd1 ; cmd2</code>, <code>cmd1 &amp;&amp; cmd2</code>, <code>cmd &gt; file</code> and <code>&gt;&gt;</code> (write / append), <code>$HOME</code>, <code>~</code>, <code>sudo</code> (accepted, not needed).',
  '<code>help</code> lists every command of this shell.',
  '<b>nano</b> opens a small editor over the Terminal: <kbd>Ctrl</kbd>+<kbd>O</kbd> writes, <kbd>Ctrl</kbd>+<kbd>X</kbd> exits (it also has buttons).')}
${note('This is a <b>simulated</b> shell. Commands that need a real Linux (installing software with <code>apt</code> or <code>pip</code>) explain what is built in instead: <i>gpiozero, RPi.GPIO, requests, flask, paho-mqtt, neopixel, adafruit_dht …</i>')}`,
    },
    {
      id: 'cmds', title: 'The commands that exist',
      html: `
<p>Four cheat-sheets with <b>real</b> commands of the lab\'s Terminal. Tip: type the first letters and press <b>Tab</b>.</p>
${A.cmdFiles()}
${A.cmdSystem()}
${A.cmdGpio()}
${A.cmdNet()}
<p>Other commands: <code>echo</code>, <code>env</code>, <code>export</code>, <code>which</code>, <code>sleep</code>, <code>kill</code>, <code>reboot</code>, <code>shutdown</code>, <code>systemctl status</code>, <code>raspi-config</code> (which points you to <i>Raspberry Pi Configuration</i>), <code>rpicam-hello</code> (there is no camera in the lab), <code>mosquitto_pub</code> / <code>mosquitto_sub</code>.</p>
${tryIt('In the Terminal type <code>pinout</code>, then <code>pinctrl get 17</code>, then <code>pinctrl set 17 op dh</code> and look at GPIO17 in the Pinout tab. Then <code>pinctrl set 17 op dl</code>.')}`,
    },
    {
      id: 'run', title: 'From the Terminal to the circuit',
      html: `
${A.oneProcess()}
<p>Start a program from the Terminal like on a real Pi:</p>
${pre(`pi@raspberrypi:~ $ python3 blink.py
pi@raspberrypi:~ $ python3 -c "print(2 + 3)"
5
pi@raspberrypi:~ $ python3
>>> exit()`)}
${ul(
  '<code>python3 file.py</code> runs a file; <code>./file.py</code> works too. <code>python3 -c "…"</code> runs one line; <code>python3</code> alone gives the <code>&gt;&gt;&gt;</code> prompt.',
  'The program <b>powers the circuit</b> of the Circuit tab, exactly as if you had pressed Run: the LED blinks, the pins turn colour in the Pinout tab, and a <code>print()</code> goes to the Terminal.',
  '<b>Ctrl+C</b> stops it.',
  'Only <b>one Python</b> runs at a time. Starting a program in Thonny stops the Terminal\'s one, and the other way round: the old window then says <i>Backend terminated. Press Stop to restart.</i>',
  '<code>nano hello.py</code> writes a program in the Terminal; <code>thonny hello.py</code> opens it in Thonny.')}
${openPi('rpi_gpio_blink.py', 'Open: Blink with RPi.GPIO (then run it with python3 in the Terminal)')}`,
    },
    {
      id: 'more', title: 'Chromium, Calculator, Configuration',
      html: `
${A.chromiumFig()}
<p><b>Chromium</b> is a browser on the lab\'s <b>simulated network</b>. It opens the lab\'s start page, the IoT dashboard, and the web page of <b>your own</b> Flask or <code>http.server</code> program at <code>http://localhost:5000/</code>. With the phone online and <i>Settings ▸ Internet (IoT) ▸ Real internet</i> on, pages also come from the real internet. Bookmarks: Start · RAPTI · Google · Wikipedia · Dashboard · localhost:5000 · localhost:8000 · Weather …</p>
${A.piConfigFig()}
<p><b>Raspberry Pi Configuration</b> (Preferences) has five tabs: <b>System</b> (hostname, board), <b>Display</b>, <b>Interfaces</b>, <b>Performance</b>, <b>Localisation</b>. In <b>Interfaces</b> the <b>SPI</b> and <b>I2C</b> switches change the lines <code>dtparam=spi=on</code> and <code>dtparam=i2c_arm=on</code> in <code>/boot/firmware/config.txt</code> — just as on a real Pi, where a SPI or I²C device needs them on. The <b>Calculator</b> is a simple four-function calculator.</p>
${note('<b>Remember:</b> the Desktop is Pi 5 / Pi 4 only · tap a launcher or use the raspberry menu · on a phone windows are maximised · one file system for Thonny, File Manager and Terminal · a program from the Terminal powers the circuit · only one Python at a time.')}
${tryIt('<b>Exercises.</b> (1) With the File Manager create a folder <code>projects/led</code> and move <code>blink.py</code> into it. (2) In the Terminal, find it again with <code>find</code> or <code>tree</code>, then run it. (3) Write <code>hello.txt</code> with <code>echo "Hi" &gt; hello.txt</code> and show it with <code>cat</code>.')}`,
    },
  ],
};
