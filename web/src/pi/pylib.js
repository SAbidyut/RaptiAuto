// The simulator's Python libraries, bundled as text (esbuild loader '.py': 'text').
import hw from './py/_rpi_hw.py';
import time from './py/time.py';
import random from './py/random.py';
import signal from './py/signal.py';
import rpiInit from './py/RPi/__init__.py';
import rpiGpio from './py/RPi/GPIO.py';
import gpiozero from './py/gpiozero.py';
import board from './py/board.py';
import adafruitDht from './py/adafruit_dht.py';
import machine from './py/machine.py';
import rp2 from './py/rp2.py';
import network from './py/network.py';
import neopixel from './py/neopixel.py';
import dht from './py/dht.py';
import i2cLcd from './py/i2c_lcd.py';

export const LIBS = {
  '_rpi_hw.py': hw, 'time.py': time, 'random.py': random, 'signal.py': signal,
  'RPi/__init__.py': rpiInit, 'RPi/GPIO.py': rpiGpio, 'gpiozero.py': gpiozero, 'board.py': board, 'adafruit_dht.py': adafruitDht,
  'machine.py': machine, 'rp2.py': rp2, 'network.py': network, 'neopixel.py': neopixel, 'dht.py': dht, 'i2c_lcd.py': i2cLcd,
};
