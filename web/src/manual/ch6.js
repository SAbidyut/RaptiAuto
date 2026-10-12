import * as A from './art.js';
import { ladder, par } from './ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, pre, open } from './helpers.js';
import { requestBytes, encodeFrame, responseBytes } from '../plc/sim/modbus.js';

const rtu = (b) => encodeFrame(b, 'RTU');
const F = {
  readPvSv: rtu(requestBytes(2, 3, 0x1000, { count: 2 })),
  readPvSvReply: rtu(responseBytes(2, 3, 0x1000, { data: [406, 1000] })),
  writeSv: rtu(requestBytes(2, 6, 0x1001, { values: [1500] })),
  writeCmd: rtu(requestBytes(1, 6, 0x2000, { values: [0x12] })),
  runCoil: rtu(requestBytes(2, 5, 0x0814, { values: [1] })),
  readTemp: rtu(requestBytes(1, 3, 0x0000, { count: 2 })),
  exception: rtu(responseBytes(2, 3, 0x2222, { exception: 2 })),
  writeLimits: rtu(requestBytes(2, 16, 0x1002, { values: [2000, 500] })),
};

export default {
  id: 'modbus', no: 6, title: 'Modbus: talking to devices', icon: 'network',
  blurb: 'Masters, slaves, RS-485, stations, registers, function codes and the MODRW instruction.',
  sections: [
    {
      id: 'what', title: 'What Modbus is',
      html: `
<p><b>Modbus</b> is the most widely used language that industrial devices speak to each other. It is simple and old (1979) — and that is why drives, PLCs, temperature controllers, sensors and energy meters from every maker understand it.</p>
${A.modbusBus()}
<p>The rules are few:</p>
${ul(
  'There is <b>one master</b> and many <b>slaves</b> on the same wires. Only the master starts a conversation.',
  'The master sends a <b>request</b> to one slave, addressed by its <b>station number</b> (1 – 247). Every slave hears it, but only the addressed one <b>replies</b>.',
  'The request says <i>what to do</i> (a <b>function code</b>), <i>where</i> (a <b>register address</b>) and <i>how much</i> (a count or a value).',
  'In the lab the master is the <b>PLC</b>, through its <b>COM2</b> RS-485 port and the <code>MODRW</code> instruction. The slaves are the MS300 drive, the DTB4848 controller, the T/H sensor, the energy meter, or another PLC.')}
${note('The HMI uses a different link (COM1 RS-232, the Delta DVP protocol): there the HMI is the master and the PLC the slave. Because the PLC\'s COM2 is busy as a Modbus master, keep the HMI on COM1.')}`,
    },
    {
      id: 'wiring', title: 'RS-485: the two-wire bus',
      html: `
${A.rs485Wiring()}
${ul(
  'The signal pair is called <b>D+</b> and <b>D−</b> (sometimes A / B), plus <b>SG</b> (signal ground). Use twisted-pair cable.',
  '<b>Daisy chain</b>: from the master to the first slave, from the first to the second … Never make a star with long branches.',
  'A <b>120 Ω terminating resistor</b> belongs at both <b>ends</b> of the line (not in the middle). The Network view shows them in 3D.',
  'In the lab: <code>PLC COM2</code> → slave <code>RS485</code> → next slave <code>RS485</code> …; each RS-485 port can take <b>two</b> cables, so the chain simply continues from the same terminals (the D+ / D− / SG terminals of the PLC take two wires as well).',
  'Only <b>one master</b> may talk on a bus. If two PLCs both use MODRW on the same bus, the lab says so.')}
<p>Tap a cable and choose <b>Pin-out</b> to see both connectors: for example RS-485 <code>D+</code> → MS300 RJ45 pin 5, <code>D−</code> → pin 4, <code>SG</code> → pin 3.</p>`,
    },
    {
      id: 'settings', title: 'Station address and serial format',
      html: `
<p>For a conversation to work, all devices on the line must agree on these <b>four things</b>:</p>
${table(['Setting', 'Values', 'Where you set it in the lab'], [
  ['<b>Baud rate</b>', '4800 · 9600 · 19200 · 38400 · 57600 · 115200 bps', 'PLC: D1120 · drive: Pr.09-01 · other slaves: their device settings'],
  ['<b>Data format</b>', '8N1 · 8E1 · 8O1 · 8N2 · 7E1 · 7O1 · 7N2 (data bits / parity / stop bits)', 'PLC: D1120 · drive: Pr.09-04 · slaves: settings'],
  ['<b>Mode</b>', 'RTU (binary, compact) or ASCII (text, readable)', 'PLC: M1143 ON = RTU · drive: Pr.09-04 · slaves: settings'],
  ['<b>Station</b>', '1 … 247, <b>different for every device</b>', 'PLC slave: D1121 · drive: Pr.09-00 · slaves: settings'],
])}
<p>If baud, parity or mode differ, a device simply <b>does not understand</b> the frame and stays silent: the master gets a <b>time-out</b>. If two devices have the same station number, both answer and their replies <b>collide</b>.</p>
<h3>The PLC\'s COM2</h3>
<p>The PLC\'s COM2 setting is written into <b>D1120</b> (a hexadecimal word). Do it in the first scan with <code>M1002</code> and set <code>M1120</code> to keep it:</p>
${table(['D1120', 'Format', 'D1120', 'Format'], [
  ['<code>H81</code>', '9600 8N1', '<code>H86</code>', '9600 7E1 (default)'],
  ['<code>H87</code>', '9600 8E1', '<code>H89</code>', '9600 8N2'],
  ['<code>H91</code>', '19200 8N1', '<code>H97</code>', '19200 8E1'],
  ['<code>HA1</code>', '38400 8N1', '<code>HC1</code>', '115200 8N1'],
])}
${ladder([
  { note: 'First scan: COM2 = 9600 8E1, keep it, Modbus RTU', net: ['M1002'], out: ['MOV H87 D1120', 'SET M1120', 'SET M1143'] },
], 'The three lines every Modbus master program starts with. (The default PLC format is 7E1 ASCII — often a mismatch with the slaves!)')}
${ul(
  'The high digit of D1120 is the baud rate (8 = 9600, 9 = 19200, A = 38400, B = 57600, C = 115200); the low digit holds data bits, parity and stop bits.',
  '<code>D1129</code> is the reply <b>time-out</b> in ms (default 300).',
  'Decoded: the Monitor tab shows COM2 as "RS-485 9600 8E1 RTU".')}`,
    },
    {
      id: 'frame', title: 'What goes over the wire: the frame',
      html: `
${A.frame()}
<p>One conversation is a <b>request frame</b> and a <b>reply frame</b>:</p>
${table(['Field', 'Size', 'Meaning'], [
  ['Address', '1 byte', 'Station number of the slave (0 = broadcast to all, no reply).'],
  ['Function', '1 byte', 'What to do (see the table below). If the slave refuses, it answers with the function + 80H and an exception code.'],
  ['Data', 'n bytes', 'Start address and count (reads) or the value(s) to write.'],
  ['CRC-16', '2 bytes', 'A checksum (low byte first). A frame with a wrong CRC is ignored.'],
])}
<p>ASCII mode is the same content written as readable text between a colon <code>:</code> and a carriage-return / line-feed, with an <b>LRC</b> checksum instead of the CRC — easy to read in the log, twice as long.</p>
<h3>Three real frames from the lab</h3>
${table(['Request', 'Frame (hex)'], [
  ['Station 1 · read temperature + humidity (FC03, address 0000H, 2 registers)', '<code>' + F.readTemp + '</code>'],
  ['Station 2 · write SV = 150.0 °C (FC06, 1001H ← 1500 = 05DCH)', '<code>' + F.writeSv + '</code>'],
  ['Station 1 · MS300 command word (FC06, 2000H ← 0012H = run forward)', '<code>' + F.writeCmd + '</code>'],
  ['Station 2 · RUN the DTB (FC05, coil 0814H = FF00H)', '<code>' + F.runCoil + '</code>'],
  ['Station 2 · write both limits (FC16, 1002H, 2 registers: 2000, 500)', '<code>' + F.writeLimits + '</code>'],
])}
<p>You can see every one of these in <b>Monitor → Comm log</b>, together with the plain-language meaning ("Write SV = 150.0 °C (1001H)").</p>`,
    },
    {
      id: 'data', title: 'Registers, coils and function codes',
      html: `
${A.dataAreas()}
<p>A Modbus device presents its data as numbered <b>registers</b> (16 bit) and <b>coils</b> (1 bit). The <b>function code</b> says which kind you want and whether to read or write:</p>
${table(['FC', 'Name', 'Data', 'Example in the lab'], [
  ['<code>01</code>', 'Read coils', 'bits', 'Read the DTB RUN coil <code>0814H</code>'],
  ['<code>02</code>', 'Read discrete inputs', 'bits', 'Read PLC inputs'],
  ['<code>03</code>', 'Read holding registers', '16-bit words', 'Read PV / SV <code>1000H</code> ×2; drive status <code>2103H</code>'],
  ['<code>04</code>', 'Read input registers', '16-bit words', 'Sensor temperature <code>0000H</code> (same map as FC03)'],
  ['<code>05</code>', 'Write one coil', 'bit (FF00H = ON)', 'DTB RUN / STOP <code>0814H</code>, auto-tune <code>0813H</code>'],
  ['<code>06</code>', 'Write one register', 'a word', 'Drive frequency <code>2001H</code>, DTB SV <code>1001H</code>'],
  ['<code>15</code> (0F)', 'Write several coils', 'bits', 'Set a block of PLC bits'],
  ['<code>16</code> (10)', 'Write several registers', 'words', 'DTB PB, Ti, Td <code>1009H</code> ×3 in one request'],
])}
<h3>When the slave says no: exception codes</h3>
${table(['Code', 'Name', 'Cause', 'Shows in the PLC as'], [
  ['<b>01</b>', 'Illegal function', 'The device does not know that function code.', 'M1140 ON, D1130 = 1'],
  ['<b>02</b>', 'Illegal data address', 'The register does not exist (or is read-only for a write).', 'M1140 ON, D1130 = 2'],
  ['<b>03</b>', 'Illegal data value', 'The value is outside the allowed range (for example SV above the limit).', 'M1140 ON, D1130 = 3'],
  ['—', '<b>Time-out</b>', 'No answer at all: wrong station, baud, format or wiring, device off.', 'M1129 ON'],
])}
<p>For example the reply to a read of a missing register <code>2222H</code> from station 2 is <code>${F.exception}</code>: station 2, <b>83H</b> = 03 + 80H, exception <b>02</b>.</p>
<h3>Numbers in registers</h3>
${ul(
  '<b>Scaling</b>: devices send whole numbers; a decimal point is implied. 315 for temperature means <b>31.5 °C</b> (×0.1). Frequency 3000 = 30.00 Hz (×0.01). Read the device\'s register table — the lab shows the factor and unit of every register.',
  '<b>Signed</b>: a 16-bit register holds −32768 … 32767; temperatures below zero use the negative range.',
  '<b>32-bit values</b> use two registers. The lab\'s energy meter keeps energy in Wh in <code>0005H</code> (low word) and <code>0006H</code> (high word); in the PLC read both into <code>D64, D65</code> and use the 32-bit form (<code>DMOV D64 D70</code>).',
  '<b>Bits</b> read with FC01 / 02 arrive packed: bit 0 of the first register is the first coil.')}`,
    },
    {
      id: 'modrw', title: 'The MODRW instruction',
      html: `
<p><code>MODRW</code> turns the PLC into a Modbus master on COM2. It has five operands:</p>
${pre(`MODRW  S1   S2   S3     S    n
       |    |    |      |    └ number of registers (or bits)
       |    |    |      └ first PLC register used for the data (D…)
       |    |    └ register address in the slave (hex, e.g. H1000)
       |    └ function code (K3, K6, K16 …)
       └ station number of the slave (K1 … K247)`)}
<p>Example: <code>MODRW K2 K3 H1000 D30 K2</code> = "ask <b>station 2</b> to <b>read registers</b> (FC03) from <b>1000H</b>, <b>2</b> registers, and put them into <b>D30, D31</b>".</p>
${ladder([
  { note: 'Read PV and SV of the DTB4848 (station 2) → D30, D31', net: ['M1000'], out: 'MODRW K2 K3 H1000 D30 K2' },
  { note: 'Write the set value D40 to SV (FC06, 1001H)', net: ['M1000'], out: 'MODRW K2 K6 H1001 D40 K1' },
  { note: 'RUN / STOP coil (FC05, 0814H) from D41 (1 = RUN, 0 = STOP)', net: ['M1000'], out: 'MODRW K2 K5 H814 D41 K1' },
], 'Read, write a register, write a coil — the three patterns you use most.')}
<h3>How the PLC uses several MODRW</h3>
${ul(
  'While the rung of a MODRW is <b>ON</b>, its request is sent again and again. With several active MODRW the PLC serves them <b>one after the other</b> (round robin) — one request per turn.',
  '<b>Reading</b> (FC03 / 04): the replies are stored in the registers starting at S, S+1 … immediately.',
  '<b>Writing</b> (FC06 / 16 / 05): the value is taken from S (and following registers) at the moment of sending. Change D40 and the next request carries the new value.',
  '<b>Writing only on demand</b>: use a contact that is ON only while a button is held (an HMI button) so the PLC does not overwrite what an operator sets on the device itself. See the <i>function codes</i> example.',
  '<code>M1127</code> is ON for a scan after each transaction completes; <code>M1129</code> comes ON when a slave did not answer; <code>M1140</code> + <code>D1130</code> report an exception code.',
  'Instructions with a fixed function: <code>MODRD</code> (read, FC03, result in D1050 …) and <code>MODWR</code> (write one word, FC06).')}
${warn('If a slave stops answering, the PLC waits for the time-out (D1129) on <b>every</b> request to it, which slows the whole bus. Use M1129 to raise an alarm and, if you like, stop asking that station.')}`,
    },
    {
      id: 'plcmap', title: 'The PLC as a slave: its Modbus addresses',
      html: `
<p>Other masters (an HMI, a SCADA PC, another PLC) read the PLC\'s devices with Modbus too. A Delta DVP PLC maps its devices to fixed addresses, which is what you write as <b>S3</b> in a <code>MODRW</code> aimed at a second PLC:</p>
${table(['PLC device', 'Modbus address', 'Example'], [
  ['<code>S</code> step relay', '<code>0000H</code> + number', 'S10 → 000AH'],
  ['<code>X</code> input', '<code>0400H</code> + octal number', 'X10 (= 8) → 0408H'],
  ['<code>Y</code> output', '<code>0500H</code> + octal number', 'Y1 → 0501H'],
  ['<code>T</code> timer (bit / value)', '<code>0600H</code> + number', 'T5 → 0605H'],
  ['<code>M</code> relay', '<code>0800H</code> + number (M1536 and above: <code>B000H</code> + (n − 1536))', 'M0 → 0800H · M100 → 0864H'],
  ['<code>C</code> counter (bit / value)', '<code>0E00H</code> + number', 'C0 → 0E00H'],
  ['<code>D</code> register', '<code>1000H</code> + number (D4096 and above: <code>9000H</code> + (n − 4096))', 'D0 → 1000H · D100 → 1064H'],
])}
<p>That is why the master / slave example writes the slave's <code>D100</code> with address <code>H1064</code> and reads its counter <code>C0</code> with <code>H0E00</code>.</p>
${open('plc-master-slave', 'Open: Two PLCs: Master → Slave over RS-485')}`,
    },
    {
      id: 'slaves', title: 'The slaves of the lab and their registers',
      html: `
<h3>Delta MS300 drive (default station 1)</h3>
<p>See the register table in chapter 4: <code>2000H</code> command, <code>2001H</code> frequency, <code>2100H – 2107H</code> status, parameters as <code>GGNNH</code>.</p>
<h3>Delta DTB4848 PID temperature controller</h3>
${table(['Address', 'Name', 'Unit · access', 'Notes'], [
  ['<code>1000H</code>', 'PV', '0.1 °C · R', 'Process value: the oven temperature.'],
  ['<code>1001H</code>', 'SV', '0.1 °C · R/W', 'Set value, within the limits 1003H … 1002H (else exception 03).'],
  ['<code>1002H</code>', 'Upper limit', '0.1 °C · R/W', 'Top of the temperature range.'],
  ['<code>1003H</code>', 'Lower limit', '0.1 °C · R/W', ''],
  ['<code>1005H</code>', 'Control method', 'R/W', '0 = PID · 1 = ON/OFF · 2 = manual.'],
  ['<code>1009H</code>', 'PB (proportional band)', '0.1 °C · R/W', '0.1 … 999.9 °C. Default 8.0.'],
  ['<code>100AH</code>', 'Ti (integral time)', 's · R/W', '0 = no integral action. Default 30.'],
  ['<code>100BH</code>', 'Td (derivative time)', 's · R/W', 'Default 3.'],
  ['<code>1012H</code>', 'OUT1', '0.1 % · R (W in manual)', 'Heater output.'],
  ['<code>0813H</code>', 'AT (coil)', 'bit · R/W', 'Write 1 to start auto-tuning; back to 0 when done.'],
  ['<code>0814H</code>', 'RUN / STOP (coil)', 'bit · R/W', '1 = RUN.'],
])}
<p>Factory settings: station 1, 9600 bps, <b>7E1 ASCII</b>. In the lab you change station, baud, format and mode in the device\'s settings (tap the device in <b>Wire</b> mode, then <b>Settings</b> in the bar at the bottom).</p>
<h3>RS-485 temperature &amp; humidity sensor (factory station 1, 9600 8N1 RTU)</h3>
${table(['Address', 'Name', 'Unit', 'Function'], [
  ['<code>0000H</code>', 'Temperature (signed)', '0.1 °C', '03 or 04'],
  ['<code>0001H</code>', 'Relative humidity', '0.1 %RH', '03 or 04'],
  ['<code>0002H</code>', 'Dew point', '0.1 °C', '03 or 04'],
])}
<h3>Energy meter, 1-phase (factory station 1, 9600 8N1 RTU)</h3>
${table(['Address', 'Name', 'Unit'], [
  ['<code>0000H</code>', 'Voltage', '0.1 V'],
  ['<code>0001H</code>', 'Current', '0.01 A'],
  ['<code>0002H</code>', 'Active power', 'W'],
  ['<code>0003H</code>', 'Power factor', '0.01'],
  ['<code>0004H</code>', 'Frequency', '0.01 Hz'],
  ['<code>0005H</code> + <code>0006H</code>', 'Energy (32-bit, low word first)', 'Wh'],
])}
${tip('<b>Monitor → Network</b> shows the register map of every slave <b>with live values</b>. It is the quickest way to find the right address.')}`,
    },
    {
      id: 'tools', title: 'Seeing the communication',
      html: `
${ul(
  '<b>Network chip</b> (Lab tab): the panel becomes an x-ray of the communication. RS-485 glows violet, RS-232 amber, USB blue. Every device carries a tag with its role and station (MASTER, ID 1 … ID 4) and the serial format; the ends of the RS-485 line show their <b>120 Ω</b> resistors. A port <b>pulses white</b> when it is asked, <b>green</b> when it answers and <b>red</b> when it does not.',
  '<b>Monitor → Network</b>: every communication line as it is cabled, with the live state of each station (OK / no reply / idle), its last values and (tap it) its register map.',
  '<b>Monitor → Comm log</b>: every request and reply with direction (TX / RX / ERR), the real bytes and a plain description. Pause it to read.',
  '<b>Tap a communication cable → Pin-out</b>: both connectors with pins and wires, the station and format at both ends, and the rules of the bus.')}`,
    },
    {
      id: 'trouble', title: 'Troubleshooting: "COM2 time-out"',
      html: `
<p>A time-out (<code>M1129</code> ON, a red port in the Network view) means: <i>nobody answered</i>. Go through this list in order:</p>
${steps(
  '<b>Is the PLC in RUN</b> and is the MODRW rung ON? (A MODRW whose rung is OFF sends nothing.)',
  '<b>Cable</b>: PLC COM2 → slave RS485 connected? Is the slave powered (24 V for the sensor, mains for the DTB and the meter)?',
  '<b>Station</b>: does the S1 of the MODRW match the slave\'s station number?',
  '<b>Format</b>: baud, data bits, parity and RTU / ASCII equal on the PLC (D1120 + M1143) and on the slave? The default PLC format (9600 7E1 ASCII) rarely matches.',
  '<b>Register</b>: a missing register gives an <i>exception</i> (M1140), not a time-out.',
  'Open <b>Monitor → Comm log</b>: the line says why ("No response — time-out. Station 2 uses 9600 8N1 RTU but COM2 is 9600 8E1 RTU").')}
${table(['Mistake', 'You see'], [
  ['Two slaves with the same station', 'Both answer; the replies collide (error in the log, wrong data).'],
  ['A slave with another baud / format', 'That slave never answers: time-out only for it, the others work.'],
  ['PLC not set to RTU (M1143 OFF)', 'RTU slaves do not understand the ASCII frames: time-out.'],
  ['Value out of range written', 'Exception 03 (for example SV above the controller\'s upper limit).'],
  ['Drive shows CE10', 'The PLC stopped writing to it for longer than Pr.09-03.'],
])}
${tryIt('Open the oven network example, press Simulate, then change the T/H sensor\'s station to 1 (tap it in Wire mode → <b>Settings</b>). Watch the Comm log and the Network view show two slaves answering at once.')}`,
    },
    {
      id: 'examples', title: 'Modbus examples — from simple to complex',
      html: `
<p>All of these are in <b>PLC Lab → Examples</b>. Open them in this order:</p>
${table(['Example', 'What it teaches'], [
  ['<b>Modbus basics: read a temperature / humidity sensor</b>', 'COM2 setup, one slave, FC03, scaling, a fan with hysteresis, alarm on time-out.'],
  ['<b>VFD speed control · Modbus RTU + HMI</b>', 'Drive command word and frequency over RS-485, status read-back, HMI start / stop and speed.'],
  ['<b>Modbus: drive control + energy meter</b>', 'Two slaves, daisy chain, 32-bit energy, peak power, reset by HMI.'],
  ['<b>Modbus function codes lab</b>', 'FC01, 03, 05, 06 and 16 against one DTB4848, with buttons that send them on demand.'],
  ['<b>Two PLCs: master → slave over RS-485</b>', 'PLC-to-PLC communication, the PLC address map (H1064, H0E00).'],
  ['<b>Modbus RTU network: PLC · VFD · DTB · sensor · meter · HMI</b>', 'Everything together: four slaves, the Network view, two HMI screens.'],
  ['<b>PID oven line: recipes</b>', 'DTB4848 + drive + HMI recipes (chapter 7).'],
  ['<b>PID tuning lab</b>', 'Change PB, Ti, Td and run auto-tune over Modbus (chapter 7).'],
])}
${open('modbus-th-fan', 'Open: Modbus basics (sensor + fan)')}
${open('modbus-energy-vfd', 'Open: Drive control + energy meter')}
${open('modbus-function-codes', 'Open: Function codes lab')}
${open('modbus-network', 'Open: Modbus RTU network')}`,
    },
  ],
};
