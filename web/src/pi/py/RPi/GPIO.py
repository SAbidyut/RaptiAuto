# RPi.GPIO for the RaptiAuto virtual Raspberry Pi (same API as RPi.GPIO 0.7).
import _rpi_js as J
import _rpi_hw as H
import time as _time

BOARD = 10
BCM = 11
OUT = 0
IN = 1
LOW = 0
HIGH = 1
PUD_OFF = 20
PUD_DOWN = 21
PUD_UP = 22
RISING = 31
FALLING = 32
BOTH = 33
SERIAL = 40
SPI = 41
I2C = 42
HARD_PWM = 43
UNKNOWN = -1
VERSION = '0.7.1'
RPI_REVISION = 3
RPI_INFO = {'P1_REVISION': 3, 'RAM': '8G', 'REVISION': 'd04170', 'TYPE': 'Pi 5 Model B', 'PROCESSOR': 'BCM2712', 'MANUFACTURER': 'Raspberry Pi Ltd'}

_BOARD = {3: 2, 5: 3, 7: 4, 8: 14, 10: 15, 11: 17, 12: 18, 13: 27, 15: 22, 16: 23, 18: 24, 19: 10, 21: 9, 22: 25,
          23: 11, 24: 8, 26: 7, 27: 0, 28: 1, 29: 5, 31: 6, 32: 12, 33: 13, 35: 19, 36: 16, 37: 26, 38: 20, 40: 21}
_mode = None
_warn = True
_setup = {}     # bcm -> IN / OUT
_events = {}    # bcm -> [callback ids]
_pwm = {}

if J.board() == 'pi4':
    RPI_INFO = {'P1_REVISION': 3, 'RAM': '4G', 'REVISION': 'c03115', 'TYPE': 'Pi 4 Model B', 'PROCESSOR': 'BCM2711', 'MANUFACTURER': 'Sony'}


def _warning(msg):
    if _warn:
        print('<stdin>: RuntimeWarning: ' + msg)


def setwarnings(flag):
    global _warn
    _warn = bool(flag)


def setmode(mode):
    global _mode
    if mode not in (BOARD, BCM):
        raise ValueError('An invalid mode was passed to setmode()')
    if _mode is not None and mode != _mode:
        raise ValueError('A different mode has already been set!')
    _mode = mode


def getmode():
    return _mode


def _bcm(channel):
    if _mode is None:
        raise RuntimeError('Please set pin numbering mode using GPIO.setmode(GPIO.BOARD) or GPIO.setmode(GPIO.BCM)')
    if not isinstance(channel, int):
        raise ValueError('Channel must be an integer or list/tuple of integers')
    if _mode == BOARD:
        if channel not in _BOARD:
            raise ValueError('The channel sent is invalid on a Raspberry Pi')
        return _BOARD[channel]
    if channel < 0 or channel > 27:
        raise ValueError('The channel sent is invalid on a Raspberry Pi')
    return channel


def _each(channel):
    if isinstance(channel, (list, tuple)):
        return list(channel)
    return [channel]


def setup(channel, direction, pull_up_down=PUD_OFF, initial=-1):
    for ch in _each(channel):
        b = _bcm(ch)
        if direction not in (IN, OUT):
            raise ValueError('An invalid direction was passed to setup()')
        if b in _setup or J.in_use(b):
            _warning('This channel is already in use, continuing anyway.  Use GPIO.setwarnings(False) to disable warnings.')
        if direction == OUT:
            if pull_up_down != PUD_OFF:
                raise ValueError('pull_up_down parameter is not valid for outputs')
            J.setup(b, 'out', 'none')
            if initial != -1:
                J.write(b, 1 if initial else 0)
        else:
            if initial != -1:
                raise ValueError('initial parameter is not valid for inputs')
            pull = 'up' if pull_up_down == PUD_UP else ('down' if pull_up_down == PUD_DOWN else 'none')
            J.setup(b, 'in', pull)
        _setup[b] = direction


def output(channel, value):
    chans = _each(channel)
    vals = _each(value)
    if len(vals) == 1:
        vals = vals * len(chans)
    if len(vals) != len(chans):
        raise RuntimeError('Number of channels != number of values')
    for ch, v in zip(chans, vals):
        b = _bcm(ch)
        if _setup.get(b) != OUT:
            raise RuntimeError('The GPIO channel has not been set up as an OUTPUT')
        J.write(b, 1 if v else 0)


def input(channel):
    b = _bcm(channel)
    if b not in _setup:
        raise RuntimeError('You must setup() the GPIO channel first')
    return J.read(b)


def gpio_function(channel):
    b = _bcm(channel)
    return _setup.get(b, IN)


def cleanup(channel=None):
    global _mode
    chans = list(_setup.keys()) if channel is None else [_bcm(c) for c in _each(channel)]
    for b in chans:
        remove_event_detect_bcm(b)
        if b in _pwm:
            _pwm[b].stop()
        J.release(b)
        if b in _setup:
            del _setup[b]
    if channel is None:
        _mode = None


def _edge(edge):
    if edge == RISING:
        return 'rising'
    if edge == FALLING:
        return 'falling'
    if edge == BOTH:
        return 'both'
    raise ValueError('The edge must be set to RISING, FALLING or BOTH')


def add_event_detect(channel, edge, callback=None, bouncetime=None):
    b = _bcm(channel)
    if _setup.get(b) != IN:
        raise RuntimeError('You must setup() the GPIO channel as an input first')
    if b in _events:
        raise RuntimeError('Conflicting edge detection already enabled for this GPIO channel')
    _events[b] = []
    J.watch(b, _edge(edge), int(bouncetime or 0))
    if callback is not None:
        add_event_callback(channel, callback)


def add_event_callback(channel, callback):
    b = _bcm(channel)
    if b not in _events:
        raise RuntimeError('Add event detection using add_event_detect first before adding a callback')
    cid = H.register(lambda _arg, ch=channel, cb=callback: cb(ch))
    _events[b].append(cid)
    J.watch_cb(b, cid)


def remove_event_detect_bcm(b):
    if b in _events:
        for cid in _events[b]:
            H.unregister(cid)
        del _events[b]
        J.unwatch(b)


def remove_event_detect(channel):
    remove_event_detect_bcm(_bcm(channel))


def event_detected(channel):
    return bool(J.detected(_bcm(channel)))


def wait_for_edge(channel, edge, bouncetime=None, timeout=None):
    b = _bcm(channel)
    if _setup.get(b) != IN:
        raise RuntimeError('You must setup() the GPIO channel as an input first')
    e = _edge(edge)
    t0 = _time.ticks_ms()
    last = J.read(b)
    while True:
        v = J.read(b)
        if v != last:
            if e == 'both' or (e == 'rising' and v) or (e == 'falling' and not v):
                if bouncetime:
                    _time.sleep_ms(int(bouncetime))
                return channel
            last = v
        if timeout is not None and _time.ticks_diff(_time.ticks_ms(), t0) >= timeout:
            return None
        _time.sleep_ms(1)


class PWM:
    def __init__(self, channel, frequency):
        b = _bcm(channel)
        if _setup.get(b) != OUT:
            raise RuntimeError('You must setup() the GPIO channel as an output first')
        if b in _pwm:
            raise RuntimeError('A PWM object already exists for this GPIO channel')
        if frequency <= 0:
            raise ValueError('frequency must be greater than 0.0')
        self._b = b
        self._f = float(frequency)
        self._dc = 0.0
        self._on = False
        _pwm[b] = self

    def start(self, dutycycle):
        if not 0 <= dutycycle <= 100:
            raise ValueError('dutycycle must have a value from 0.0 to 100.0')
        self._dc = float(dutycycle)
        self._on = True
        J.pwm(self._b, self._f, self._dc / 100)

    def ChangeDutyCycle(self, dutycycle):
        if not 0 <= dutycycle <= 100:
            raise ValueError('dutycycle must have a value from 0.0 to 100.0')
        self._dc = float(dutycycle)
        if self._on:
            J.pwm(self._b, self._f, self._dc / 100)

    def ChangeFrequency(self, frequency):
        if frequency <= 0:
            raise ValueError('frequency must be greater than 0.0')
        self._f = float(frequency)
        if self._on:
            J.pwm(self._b, self._f, self._dc / 100)

    def stop(self):
        if self._on:
            J.pwm_off(self._b)
        self._on = False
        if _pwm.get(self._b) is self:
            del _pwm[self._b]
