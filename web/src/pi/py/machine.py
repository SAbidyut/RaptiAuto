# machine for the RaptiAuto virtual Raspberry Pi Pico (RP2040 / RP2350) — the MicroPython API.
import _rpi_js as J
import _rpi_hw as H
import time as _time

_LED = 64   # id of the Pico W "LED" pin (WL_GPIO0 on the wireless chip)


def _pid(id):
    if isinstance(id, Pin):
        return id._id
    if isinstance(id, str):
        s = id.upper()
        if s in ('LED', 'WL_GPIO0'):
            return _LED if J.board() in ('picow', 'pico2w') else 25
        if s.startswith('GPIO'):
            s = s[4:]
        elif s.startswith('GP'):
            s = s[2:]
        try:
            id = int(s)
        except ValueError:
            raise ValueError('unknown named pin "%s"' % id)
    if not isinstance(id, int):
        raise TypeError("can't convert %s to int" % type(id).__name__)
    if id == 25 and J.board() in ('picow', 'pico2w'):
        # on the Pico W GPIO25 is the wireless chip's SPI clock; the LED is Pin("LED")
        return 25
    if id < 0 or id > 29:
        raise ValueError('invalid pin')
    return id


class Pin:
    IN = 0
    OUT = 1
    OPEN_DRAIN = 2
    ALT = 3
    PULL_UP = 1
    PULL_DOWN = 2
    IRQ_FALLING = 4
    IRQ_RISING = 8
    IRQ_LOW_LEVEL = 1
    IRQ_HIGH_LEVEL = 2
    ALT_SPI = 1
    ALT_UART = 2
    ALT_I2C = 3
    ALT_PWM = 4
    ALT_SIO = 5
    ALT_PIO0 = 6
    ALT_PIO1 = 7

    def __init__(self, id, mode=-1, pull=-1, *, value=None, alt=-1):
        self._id = _pid(id)
        self._mode = None
        self._irq = None
        self.init(mode, pull, value=value)

    def init(self, mode=-1, pull=-1, *, value=None, alt=-1):
        if mode != -1:
            self._mode = mode
        if pull != -1:
            self._pull = pull
        if mode == Pin.OUT or mode == Pin.OPEN_DRAIN:
            if value is not None:
                J.write(self._id, 1 if value else 0)
            J.setup(self._id, 'out', 'none')
        elif mode == Pin.IN:
            p = pull if pull != -1 else None
            J.setup(self._id, 'in', 'up' if p == Pin.PULL_UP else ('down' if p == Pin.PULL_DOWN else 'none'))
        elif pull != -1:
            J.set_pull(self._id, 'up' if pull == Pin.PULL_UP else ('down' if pull == Pin.PULL_DOWN else 'none'))
        if value is not None and mode == -1:
            J.write(self._id, 1 if value else 0)

    def value(self, x=None):
        if x is None:
            return J.read(self._id)
        J.write(self._id, 1 if x else 0)

    def __call__(self, x=None):
        return self.value(x)

    def on(self):
        J.write(self._id, 1)

    def off(self):
        J.write(self._id, 0)

    high = on
    low = off

    def toggle(self):
        J.write(self._id, 0 if J.level(self._id) else 1)

    def irq(self, handler=None, trigger=IRQ_FALLING | IRQ_RISING, hard=False):
        if self._irq is not None:
            J.unwatch(self._id)
            H.unregister(self._irq)
            self._irq = None
        if handler is None:
            return None
        if trigger & (Pin.IRQ_FALLING | Pin.IRQ_RISING) == (Pin.IRQ_FALLING | Pin.IRQ_RISING):
            edge = 'both'
        elif trigger & Pin.IRQ_RISING:
            edge = 'rising'
        else:
            edge = 'falling'
        self._irq = H.register(lambda _lvl: handler(self))
        J.watch(self._id, edge, 0)
        J.watch_cb(self._id, self._irq)
        return self

    def mode(self, m=None):
        if m is None:
            return self._mode
        self.init(m)

    def pull(self, p=None):
        if p is None:
            return getattr(self, '_pull', None)
        self.init(pull=p)

    def __repr__(self):
        name = 'EXT_GPIO0' if self._id == _LED else 'GPIO%d' % self._id
        m = {Pin.IN: 'IN', Pin.OUT: 'OUT', Pin.OPEN_DRAIN: 'OPEN_DRAIN', Pin.ALT: 'ALT'}.get(self._mode, 'IN')
        return 'Pin(%s, mode=%s)' % (name, m)


class Signal:
    def __init__(self, pin, *args, invert=False, **kw):
        self._pin = pin if isinstance(pin, Pin) else Pin(pin, *args, **kw)
        self._inv = invert

    def value(self, x=None):
        if x is None:
            return self._pin.value() ^ (1 if self._inv else 0)
        self._pin.value((1 if x else 0) ^ (1 if self._inv else 0))

    def on(self):
        self.value(1)

    def off(self):
        self.value(0)


class PWM:
    def __init__(self, dest, *, freq=None, duty_u16=None, duty_ns=None, invert=False):
        self._id = _pid(dest)
        self._f = 1000 if freq is None else freq
        self._d = 0
        self._inv = invert
        J.setup(self._id, 'out', 'none')
        if duty_u16 is not None:
            self._d = duty_u16
        elif duty_ns is not None:
            self._d = int(duty_ns * self._f * 65535 // 1000000000)
        self._apply()

    def _apply(self):
        d = min(65535, max(0, self._d)) / 65535
        J.pwm(self._id, float(self._f), 1 - d if self._inv else d)

    def init(self, *, freq=None, duty_u16=None, duty_ns=None):
        if freq is not None:
            self._f = freq
        if duty_u16 is not None:
            self._d = duty_u16
        if duty_ns is not None:
            self.duty_ns(duty_ns)
        self._apply()

    def freq(self, f=None):
        if f is None:
            return self._f
        if f < 8 or f > 62500000:
            raise ValueError('freq too small' if f < 8 else 'freq too large')
        self._f = f
        self._apply()

    def duty_u16(self, d=None):
        if d is None:
            return self._d
        self._d = int(d)
        self._apply()

    def duty_ns(self, ns=None):
        if ns is None:
            return int(self._d / 65535 * 1000000000 / self._f)
        self._d = int(ns * self._f * 65535 // 1000000000)
        self._apply()

    def deinit(self):
        J.pwm_off(self._id)

    def __repr__(self):
        return '<PWM slice=%d channel=%d invert=%d>' % ((self._id >> 1) & 7, self._id & 1, 1 if self._inv else 0)


class ADC:
    CORE_TEMP = 4

    def __init__(self, pin, *, atten=None):
        if isinstance(pin, Pin):
            pin = pin._id
        if isinstance(pin, int) and 26 <= pin <= 29:
            self._ch = pin - 26
        elif isinstance(pin, int) and 0 <= pin <= 4:
            self._ch = pin
        else:
            raise ValueError('Pin doesn\'t have ADC capabilities')

    def read_u16(self):
        v = J.adc(self._ch)
        return max(0, min(65535, int(v * 65535)))

    def __repr__(self):
        return '<ADC channel=%d>' % self._ch


class Timer:
    ONE_SHOT = 0
    PERIODIC = 1

    def __init__(self, id=-1, *, mode=PERIODIC, period=-1, freq=-1, tick_hz=1000, callback=None):
        self._t = None
        self._cid = None
        if callback is not None or period != -1 or freq != -1:
            self.init(mode=mode, period=period, freq=freq, tick_hz=tick_hz, callback=callback)

    def init(self, *, mode=PERIODIC, period=-1, freq=-1, tick_hz=1000, callback=None):
        self.deinit()
        if freq != -1:
            ms = 1000 / freq
        elif period != -1:
            ms = period * 1000 / tick_hz
        else:
            ms = 1000
        if callback is None:
            return
        self._cid = H.register(lambda _a: callback(self))
        self._t = J.timer(self._cid, max(1, ms), 1 if mode == Timer.PERIODIC else 0)

    def deinit(self):
        if self._t is not None:
            J.timer_stop(self._t)
            H.unregister(self._cid)
            self._t = None

    def __repr__(self):
        return '<Timer>'


class I2C:
    # The parts must be wired to the bus pins: SDA to sda, SCL to scl. I2C(0) defaults to GP4 / GP5,
    # I2C(1) to GP6 / GP7 (as on a real Pico).
    _DEF = {0: (4, 5), 1: (6, 7)}

    def __init__(self, id=0, *, scl=None, sda=None, freq=400000, timeout=50000):
        self._id = id
        self._freq = freq
        if id not in (0, 1):
            raise ValueError('I2C(%s) does not exist' % (id,))
        d = self._DEF[id]
        self._sda = d[0] if sda is None else _pid(sda)
        self._scl = d[1] if scl is None else _pid(scl)
        # RP2040 / RP2350: I2C0 SDA on GP0, 4, 8 ..., SCL on GP1, 5, 9 ...; I2C1 SDA on GP2, 6, 10 ..., SCL on GP3, 7, 11 ...
        if self._scl % 4 != 2 * id + 1:
            raise ValueError('bad SCL pin')
        if self._sda % 4 != 2 * id:
            raise ValueError('bad SDA pin')

    def scan(self):
        s = J.i2c_scan(self._sda, self._scl)
        return [int(a) for a in s.split(',')] if s else []

    def _w(self, addr, data):
        J.i2c_write(addr, bytes(data).hex(), self._sda, self._scl)

    def _r(self, addr, n):
        return bytes.fromhex(J.i2c_read(addr, n, self._sda, self._scl))

    def writeto(self, addr, buf, stop=True):
        self._w(addr, buf)
        return len(buf)

    def writevto(self, addr, vector, stop=True):
        data = b''.join(bytes(v) for v in vector)
        self._w(addr, data)
        return len(data)

    def readfrom(self, addr, n, stop=True):
        return self._r(addr, n)

    def readfrom_into(self, addr, buf, stop=True):
        b = self.readfrom(addr, len(buf))
        for i in range(len(buf)):
            buf[i] = b[i]

    def writeto_mem(self, addr, memaddr, buf, *, addrsize=8):
        self._w(addr, bytes([memaddr]) + bytes(buf))

    def readfrom_mem(self, addr, memaddr, n, *, addrsize=8):
        self._w(addr, bytes([memaddr]))
        return self._r(addr, n)

    def readfrom_mem_into(self, addr, memaddr, buf, *, addrsize=8):
        b = self.readfrom_mem(addr, memaddr, len(buf))
        for i in range(len(buf)):
            buf[i] = b[i]

    def __repr__(self):
        return 'I2C(%d, freq=%d, scl=%d, sda=%d)' % (self._id, self._freq, self._scl, self._sda)


class SoftI2C(I2C):
    # bit-banged I2C: any two GPIOs
    def __init__(self, scl, sda, *, freq=400000, timeout=50000):
        self._id = -1
        self._freq = freq
        self._sda = _pid(sda)
        self._scl = _pid(scl)

    def __repr__(self):
        return 'SoftI2C(scl=%d, sda=%d, freq=%d)' % (self._scl, self._sda, self._freq)


class SPI:
    """SPI bus: the bytes reach a MAX7219 chain (or an MCP3008) wired to the SCK / MOSI pins."""
    MSB = 0
    LSB = 1
    _DEFAULT = {0: (18, 19, 16), 1: (10, 11, 12)}   # id -> (sck, mosi, miso) on the Pico

    def __init__(self, id=0, baudrate=1000000, *, polarity=0, phase=0, bits=8, firstbit=0, sck=None, mosi=None, miso=None):
        self._id = id
        d = SPI._DEFAULT.get(id, (18, 19, 16))
        self._sck = _pid(sck) if sck is not None else d[0]
        self._mosi = _pid(mosi) if mosi is not None else d[1]
        self._miso = _pid(miso) if miso is not None else d[2]
        self._baud = baudrate

    def init(self, baudrate=1000000, **kw):
        self._baud = baudrate
        for k in ('sck', 'mosi', 'miso'):
            if kw.get(k) is not None:
                setattr(self, '_' + k, _pid(kw[k]))

    def _xfer(self, data):
        r = J.spi_xfer(self._sck, self._mosi, bytes(data).hex())
        return bytes.fromhex(r)

    def write(self, buf):
        self._xfer(buf)

    def read(self, n, write=0):
        return self._xfer(bytes([write]) * n)

    def readinto(self, buf, write=0):
        r = self.read(len(buf), write)
        for i in range(len(buf)):
            buf[i] = r[i]

    def write_readinto(self, wbuf, rbuf):
        r = self._xfer(wbuf)
        for i in range(len(rbuf)):
            rbuf[i] = r[i]

    def deinit(self):
        pass

    def __repr__(self):
        return 'SPI(%d, baudrate=%d, sck=%d, mosi=%d, miso=%d)' % (self._id, self._baud, self._sck, self._mosi, self._miso)


class SoftSPI(SPI):
    def __init__(self, baudrate=500000, *, polarity=0, phase=0, bits=8, firstbit=0, sck, mosi, miso):
        SPI.__init__(self, -1, baudrate, sck=sck, mosi=mosi, miso=miso)


class UART:
    def __init__(self, id=0, baudrate=115200, **kw):
        self._id = id
        self._baud = baudrate

    def init(self, baudrate=115200, **kw):
        self._baud = baudrate

    def write(self, buf):
        J.uart_write(self._id, bytes(buf).decode('utf-8', 'ignore') if not isinstance(buf, str) else buf)
        return len(buf)

    def any(self):
        return J.uart_any(self._id)

    def read(self, n=-1):
        s = J.uart_read(self._id, -1 if n is None else n)
        return s.encode() if s else None

    def readline(self):
        s = J.uart_readline(self._id, 1)
        return s.encode() if s else None

    def readinto(self, buf, nbytes=None):
        b = self.read(len(buf) if nbytes is None else nbytes)
        if not b:
            return None
        for i in range(len(b)):
            buf[i] = b[i]
        return len(b)

    def deinit(self):
        pass

    def __repr__(self):
        return 'UART(%d, baudrate=%d)' % (self._id, self._baud)


class RTC:
    def __init__(self, id=0):
        self._off = 0

    def datetime(self, dt=None):
        if dt is not None:
            # (year, month, day, weekday, hours, minutes, seconds, subseconds)
            _time._set_rtc((dt[0], dt[1], dt[2], dt[4], dt[5], dt[6]))
            return None
        t = _time.localtime()
        return (t[0], t[1], t[2], t[6], t[3], t[4], t[5], 0)


class WDT:
    def __init__(self, id=0, timeout=5000):
        self._timeout = timeout

    def feed(self):
        pass


PWRON_RESET = 1
WDT_RESET = 3


def freq(hz=None):
    if hz is None:
        return 150000000 if J.board() in ('pico2', 'pico2w') else 125000000


def unique_id():
    return b'\xe6\x61\x41\x04\x03\x2b\x5c\x29'


def reset():
    raise SystemExit('machine.reset()')


def soft_reset():
    raise SystemExit('soft reset')


def reset_cause():
    return PWRON_RESET


def bootloader(*a):
    raise SystemExit('BOOTSEL mode')


def idle():
    _time.sleep_ms(1)


def lightsleep(ms=None):
    if ms is None:
        while True:
            _time.sleep(1)
    _time.sleep_ms(ms)


deepsleep = lightsleep


def disable_irq():
    return 0


def enable_irq(state=0):
    pass


def time_pulse_us(pin, pulse_level, timeout_us=1000000):
    t0 = _time.ticks_us()
    while pin.value() != pulse_level:
        if _time.ticks_diff(_time.ticks_us(), t0) > timeout_us:
            return -2
    t1 = _time.ticks_us()
    while pin.value() == pulse_level:
        if _time.ticks_diff(_time.ticks_us(), t1) > timeout_us:
            return -1
    return _time.ticks_diff(_time.ticks_us(), t1)


class mem32:
    pass
