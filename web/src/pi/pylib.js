// The simulator's Python libraries, bundled as text (esbuild loader '.py': 'text').
import hw from './py/_rpi_hw.py';
import time from './py/time.py';
import random from './py/random.py';
import signal from './py/signal.py';
import rpiInit from './py/RPi/__init__.py';
import rpiGpio from './py/RPi/GPIO.py';
import gpiozero from './py/gpiozero/__init__.py';
import gpiozeroTones from './py/gpiozero/tones.py';
import board from './py/board.py';
import adafruitDht from './py/adafruit_dht.py';
import machine from './py/machine.py';
import rp2 from './py/rp2.py';
import network from './py/network.py';
import neopixel from './py/neopixel.py';
import dht from './py/dht.py';
import i2cLcd from './py/i2c_lcd.py';
import smbus2 from './py/smbus2.py';
import smbus from './py/smbus.py';
import serial from './py/serial.py';
import netio from './py/_netio.py';
import requests from './py/requests.py';
import urequests from './py/urequests.py';
import urllibInit from './py/urllib/__init__.py';
import urllibParse from './py/urllib/parse.py';
import urllibError from './py/urllib/error.py';
import urllibRequest from './py/urllib/request.py';
import socket from './py/socket.py';
import httpInit from './py/http/__init__.py';
import httpServer from './py/http/server.py';
import flask from './py/flask.py';
import pahoInit from './py/paho/__init__.py';
import pahoMqttInit from './py/paho/mqtt/__init__.py';
import pahoClient from './py/paho/mqtt/client.py';
import pahoPublish from './py/paho/mqtt/publish.py';
import pahoSubscribe from './py/paho/mqtt/subscribe.py';
import umqttInit from './py/umqtt/__init__.py';
import umqttSimple from './py/umqtt/simple.py';
import bisect from './py/bisect.py';
import textwrap from './py/textwrap.py';
import contextlib from './py/contextlib.py';
import threading from './py/threading.py';
import psutil from './py/psutil.py';
import ntptime from './py/ntptime.py';
import ssd1306 from './py/ssd1306.py';
import adafruitSsd1306 from './py/adafruit_ssd1306.py';
import busio from './py/busio.py';
import tm1637 from './py/tm1637.py';
import max7219 from './py/max7219.py';
import spidev from './py/spidev.py';
import rplcdInit from './py/RPLCD/__init__.py';
import rplcdI2c from './py/RPLCD/i2c.py';
import picoI2cLcd from './py/pico_i2c_lcd.py';
import lcdApi from './py/lcd_api.py';

export const LIBS = {
  '_rpi_hw.py': hw, 'time.py': time, 'random.py': random, 'signal.py': signal,
  'RPi/__init__.py': rpiInit, 'RPi/GPIO.py': rpiGpio, 'gpiozero/__init__.py': gpiozero, 'gpiozero/tones.py': gpiozeroTones, 'board.py': board, 'adafruit_dht.py': adafruitDht,
  'machine.py': machine, 'rp2.py': rp2, 'network.py': network, 'neopixel.py': neopixel, 'dht.py': dht, 'i2c_lcd.py': i2cLcd,
  'smbus2.py': smbus2, 'smbus.py': smbus, 'serial.py': serial,
  '_netio.py': netio, 'requests.py': requests, 'urequests.py': urequests, 'socket.py': socket,
  'urllib/__init__.py': urllibInit, 'urllib/parse.py': urllibParse, 'urllib/error.py': urllibError, 'urllib/request.py': urllibRequest,
  'http/__init__.py': httpInit, 'http/server.py': httpServer, 'flask.py': flask,
  'paho/__init__.py': pahoInit, 'paho/mqtt/__init__.py': pahoMqttInit, 'paho/mqtt/client.py': pahoClient, 'paho/mqtt/publish.py': pahoPublish, 'paho/mqtt/subscribe.py': pahoSubscribe,
  'umqtt/__init__.py': umqttInit, 'umqtt/simple.py': umqttSimple,
  'bisect.py': bisect, 'textwrap.py': textwrap, 'contextlib.py': contextlib, 'threading.py': threading, 'psutil.py': psutil, 'ntptime.py': ntptime,
  'ssd1306.py': ssd1306, 'adafruit_ssd1306.py': adafruitSsd1306, 'busio.py': busio, 'tm1637.py': tm1637, 'max7219.py': max7219, 'spidev.py': spidev,
  'RPLCD/__init__.py': rplcdInit, 'RPLCD/i2c.py': rplcdI2c, 'pico_i2c_lcd.py': picoI2cLcd, 'lcd_api.py': lcdApi,
};
