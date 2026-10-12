import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, code, openPi, k } from '../helpers.js';

export default {
  id: 'pi-python', no: 'P4', title: 'Python and Thonny', icon: 'code',
  blurb: 'Thonny\'s screen, running a file, the Output and the Shell, input(), errors, Python basics and MicroPython on the Pico.',
  sections: [
    {
      id: 'glance', title: 'Python and Thonny at a glance',
      html: `
${A.heroPython()}
<p><b>Python</b> is the language of the Raspberry Pi: short, readable and used by millions. <b>Thonny</b> is the program in which you write it — the same one that comes with Raspberry Pi OS. In the lab it has two screens: <b>Thonny</b> (the code) and <b>Output</b> (what the program says).</p>
<p>The workflow is always the same:</p>
${steps('<b>Write</b> the program in Thonny.', '<b>Run</b> it (the green ▶ in Thonny or the Run button on top).', '<b>Read</b> the Output: your <code>print()</code> lines, questions and errors.', '<b>Look</b> at the circuit: the LED, the buzzer, the display.', '<b>Stop</b>, change something, run again.')}
${note('Under the hood the lab runs a real <b>MicroPython 1.29</b> interpreter. On a Pi it plays the part of Python 3.11 (the banner says <code>Python 3.11.2 (/usr/bin/python3)</code>); on a Pico it is the real thing for that board.')}`,
    },
    {
      id: 'screen', title: 'Thonny\'s screen',
      html: `
${A.thonnyAnatomy()}
${table(['Button', 'What it does'], [
  ['<b>New</b>', 'Opens an empty tab, <code>&lt;untitled&gt;</code>.'],
  ['<b>Load</b> · <b>Files</b>', 'A file list: tap a folder to enter, tap a file to open it, the bin icon deletes a file.'],
  ['<b>Save</b>', 'Stores the tab as a file. The first time it asks for a name (<code>.py</code> is added for you).'],
  ['<b>Run</b>', 'Saves the file (Pi) and runs it. Output opens, the circuit is powered.'],
  ['<b>Stop</b>', 'Stops the program and starts a fresh Python.'],
  ['<b>Examples</b>', 'A list of ready programs for your board. Tap one to open it — and to build its circuit.'],
  ['<b>⋮</b>', 'Save as… · Close tab · Find in file · Zoom in / out · Interrupt execution (Ctrl+C) · Restart backend (Ctrl+D) · Clear shell.'],
])}
<p>The tabs show the file names; <b>×</b> closes a tab. A <b>*</b> after the name means you changed the text since you saved. The editor colours your code, numbers the lines, indents after a <code>:</code> and zooms with <b>⋮ ▸ Zoom</b>. The thin line at the bottom says which Python runs your code: <i>Local Python 3 • /usr/bin/python3</i>.</p>
${tip('Thonny remembers your tabs. Close the lab and come back tomorrow: your open files, even unsaved text, are still there.')}`,
    },
    {
      id: 'run', title: 'Running a file',
      html: `
${A.runFlow()}
<p>You can start a program in three ways, and all of them power the circuit:</p>
${ul(
  'The green <b>Run</b> button of <b>Thonny</b>.',
  'The <b>Run</b> button on top of every Pi tab: it runs the file shown in the <b>file chip</b> of the Circuit tab.',
  'The <b>Terminal</b>: <code>python3 blink.py</code> (chapter P7).')}
<p>Thonny starts a <b>fresh Python</b> for every run, so variables and pins of the last run never hang around. In the Output you see the line Thonny typed for you: <code>%Run blink.py</code>.</p>
<h3>Stopping</h3>
${ul(
  '<b>Stop</b> (Thonny or the top bar) interrupts the program and gets a clean Python ready. Pins are released.',
  '<b>Ctrl+C</b> (key bar of the Output, or <b>⋮ ▸ Interrupt execution</b>) raises a <code>KeyboardInterrupt</code> in your program. That is how you leave <code>while True:</code> — and how a <code>try … except KeyboardInterrupt:</code> block can tidy up.',
  'A program that ignores Ctrl+C is thrown away by Stop after a moment.')}
${openPi('hello.py', 'Open: Hello, Raspberry Pi')}`,
    },
    {
      id: 'output', title: 'The Output screen and the Shell',
      html: `
${A.outputAnatomy()}
<p>The <b>Output</b> tab is Thonny\'s <b>Shell</b>. Three things appear in it: what your program prints, the questions of <code>input()</code>, and the <code>&gt;&gt;&gt;</code> prompt where you can type Python yourself.</p>
${A.shellRepl()}
${ul(
  'Type a line after <code>&gt;&gt;&gt;</code> and press Enter: it runs at once. Great for trying <code>2 + 3</code>, a string, or a function.',
  'A line that opens a block (<code>for</code>, <code>if</code>, <code>def</code> … ending with <code>:</code>) continues with <code>...</code> and is indented for you. An <b>empty line</b> runs it.',
  '<b>↑ ↓</b> bring back old lines, <b>Tab</b> inserts four spaces. Phones have no Ctrl key, so the <b>key bar</b> under the console holds <b>Ctrl+C</b>, <b>Ctrl+D</b>, arrows, <b>Tab</b> and the characters <code>: ( )</code> that are hard to reach.',
  '<b>Clear</b> wipes the text (also <b>⋮ ▸ Clear shell</b>).',
  'The Shell stays alive after your program ends: you can keep typing Python.')}
${tryIt('Press Run on <b>hello.py</b>, then type <code>print(5 * 7)</code> after the prompt.')}`,
    },
    {
      id: 'input', title: 'input(): the program asks you',
      html: `
${A.inputFlow()}
<p><code>input("question")</code> stops the program and waits for you. The lab switches to the <b>Output</b> tab by itself, shows the question and a text line; type the answer and press <b>Enter</b>. The program then goes on, and the answer is a <b>string</b> (text):</p>
${code(`name = input("What is your name? ")
print(f"Hello {name}, welcome to the Raspberry Pi!")

age = int(input("How old are you? "))   # int() turns the text into a number
print("Next year you will be", age + 1)`, 'py', { mark: [4] })}
${warn('A program that seems frozen may simply be <b>waiting for input()</b>. Open the Output tab and look for a question at the bottom.')}`,
    },
    {
      id: 'errors', title: 'Errors and tracebacks',
      html: `
${A.tracebackFig()}
<p>When Python cannot go on it prints a <b>traceback</b> in red and the program stops. Do not panic — read it <b>from the bottom up</b>:</p>
${steps(
  'The <b>last line</b> says the kind of error and what is wrong: <code>NameError: name \'LEd\' isn\'t defined</code>.',
  'The line above says <b>where</b>: the file and the <b>line number</b>.',
  'Thonny has already <b>jumped to that line</b> in the editor and highlights it.')}
${table(['Message', 'Usually means'], [
  ['<code>NameError: name \'x\' isn\'t defined</code>', 'A typo in a name, or you forgot an <code>import</code>. Python distinguishes <code>led</code> and <code>LED</code>.'],
  ['<code>SyntaxError: invalid syntax</code>', 'A missing <code>:</code>, bracket or quote — or a block that is not indented.'],
  ['<code>ImportError: no module named \'numpy\'</code>', 'That library does not exist in the lab. (Real Python says <code>ModuleNotFoundError</code>.)'],
  ['<code>ZeroDivisionError: divide by zero</code>', 'A division by 0.'],
  ['<code>AttributeError: … has no attribute …</code>', 'A misspelt method, such as <code>led.blnk()</code>.'],
  ['<code>KeyboardInterrupt</code>', 'You pressed Stop or Ctrl+C. Not a bug.'],
])}
<p>Errors about pins and libraries (<code>GPIOPinInUse</code>, <code>RuntimeError: Please set pin numbering mode</code> …) are explained in chapters P5 and P8.</p>`,
    },
    {
      id: 'basics', title: 'Python basics in five pictures',
      html: `
<h3>Variables</h3>
${A.pyVariables()}
${code(`count = 3          # a whole number
temp = 21.5        # a number with decimals
name = "Pi"        # text (in quotes)
lit = True         # yes / no
print(count, temp, name, lit)`, 'py')}
<h3>Indentation: the structure</h3>
${A.pyIndent()}
<p>Python has no curly brackets: <b>spaces at the start of a line</b> show what belongs together. Use <b>4 spaces</b> per level (Thonny does it for you after a colon).</p>
<h3>Decisions: if / else</h3>
${A.pyIf()}
${code(`temp = 24
if temp > 30:
    print("Hot: fan on")
elif temp > 20:
    print("Pleasant")
else:
    print("Cool: fan off")`, 'py', { mark: [2, 4, 6] })}
<h3>Repeating: for and while</h3>
${A.pyFor()}
${A.pyWhile()}
${code(`for i in range(3):        # 0, 1, 2
    print("round", i)

while True:                # for ever, until Stop
    print("tick")`, 'py')}
<h3>Functions</h3>
${A.pyFunction()}
${code(`from time import sleep

def blink_n(n):
    for i in range(n):
        print("blink", i)
        sleep(0.2)

blink_n(3)
blink_n(10)`, 'py', { mark: [3] })}
${note('Comments start with <code>#</code>. Python ignores them: they are notes for people. Write many of them.')}`,
    },
    {
      id: 'files', title: 'Saving, examples and files',
      html: `
${A.tabStates()}
${ul(
  '<b>Save</b> asks for a file name the first time: <i>Save to /home/pi as</i> (on a Pico: <i>Save to Raspberry Pi Pico as</i>). Without an extension the lab adds <code>.py</code>. If the name exists it asks before replacing.',
  '<b>Examples</b> opens <i>Python examples</i> (Pico: <i>MicroPython examples</i>) — a list with title, file name and tags. Tap one: the program opens in a tab, and its <b>circuit is built</b> on the Circuit tab. Undo there brings your old circuit back.',
  '<b>Files / Load</b> shows <i>This computer: /home/pi</i> (Pico: <i>Raspberry Pi Pico: /</i>) with folders first.',
  'Your files appear in the <b>File Manager</b> and the <b>Terminal</b> (<code>ls</code>) too: it is one file system (chapter P7).')}
<p>Closing a tab with unsaved text asks <i>Close … without saving?</i> — Thonny does not throw your work away silently.</p>`,
    },
    {
      id: 'pico', title: 'MicroPython on the Pico',
      html: `
${A.picoThonny()}
<p>On a Pico, Thonny uses the interpreter <b>MicroPython (Raspberry Pi Pico)</b>: the status line says <i>• Board CDC @ /dev/ttyACM0</i>. Small but important differences:</p>
${ul(
  '<b>Run</b> sends the <b>text of the editor</b> to the board (the Output shows <code>%Run -c $EDITOR_CONTENT</code>) after a <code>MPY: soft reboot</code>. Files in tabs are written <code>[ main.py ]</code>.',
  '<b>Stop</b> sends Ctrl+C and soft-reboots the board. <b>Ctrl+D</b> (key bar) soft-reboots and then runs <b>main.py</b>, as if you had just plugged the Pico in.',
  'A file called <code>main.py</code> on the board starts by itself at power-up. That is how a Pico project is delivered.',
  'The Pico has <b>no Desktop and no Terminal</b>: just Circuit, Pinout, Thonny and Output.')}
<p>Everything else you learned here — variables, <code>if</code>, loops, functions, <code>input()</code>, tracebacks — is the same.</p>
${note('<b>Remember:</b> Thonny edits, Output talks · Run starts a fresh Python and powers the circuit · read errors from the bottom up · four spaces make a block · Stop / Ctrl+C leave a <code>while True</code> loop · on a Pico, Run sends the editor text to the board.')}
${tryIt('<b>Exercises.</b> (1) Write a program that asks for a name with <code>input()</code> and prints it five times with a <code>for</code> loop. (2) Make an error on purpose (type <code>pritn("hi")</code>) and find the line in the traceback. (3) Write a function <code>shout(text)</code> that prints the text in capital letters (<code>text.upper()</code>).')}`,
    },
  ],
};
