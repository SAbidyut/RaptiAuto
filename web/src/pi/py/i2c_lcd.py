# Character LCD (HD44780, 16x2 / 20x4) on an I2C backpack (PCF8574, address 0x27 or 0x3F) for the
# Raspberry Pi and the Pico:
#     from i2c_lcd import I2cLcd
#     lcd = I2cLcd(0x27, 2, 16)              # Raspberry Pi: SDA = GPIO2, SCL = GPIO3
#     lcd = I2cLcd(i2c, 0x27, 2, 16)         # Pico: i2c = machine.I2C(0, sda=Pin(4), scl=Pin(5))
#     lcd.putstr("Hello!")
import _rpi_js as J
import time

_RS = 0x01
_EN = 0x04
_BL = 0x08


class I2cLcd:
    def __init__(self, *args, **kw):
        a = list(args)
        self._bus = (None, None)   # Raspberry Pi: the I2C bus on GPIO2 (SDA) / GPIO3 (SCL)
        if a and not isinstance(a[0], int):
            i2c = a.pop(0)  # pico_i2c_lcd style: I2cLcd(i2c, addr, rows, cols)
            self._bus = (getattr(i2c, '_sda', None), getattr(i2c, '_scl', None))
        self.addr = a[0] if len(a) > 0 else kw.get('addr', 0x27)
        self.rows = a[1] if len(a) > 1 else kw.get('rows', 2)
        self.cols = a[2] if len(a) > 2 else kw.get('cols', 16)
        if not J.i2c_has(self.addr, self._bus[0], self._bus[1]):
            if self._bus[0] is None:
                pins = 'SDA to GPIO2, SCL to GPIO3' if J.board()[:4] != 'pico' else 'SDA, SCL'
            else:
                pins = 'SDA to GP%d, SCL to GP%d' % self._bus
            raise OSError(19, 'no I2C device at 0x%02X - wire the LCD: %s, VCC to 5V, GND' % (self.addr, pins))
        self._bl = _BL
        self.col = 0
        self.row = 0
        for n in (0x03, 0x03, 0x03, 0x02):
            self._nibble(n << 4, 0)
            time.sleep(0.005)
        self._cmd(0x28)  # 4-bit, 2 lines, 5x8 dots
        self._cmd(0x0C)  # display on, cursor off
        self._cmd(0x06)  # entry mode: increment
        self.clear()

    def _write(self, data):
        J.i2c_write(self.addr, bytes(data).hex(), self._bus[0], self._bus[1])

    def _nibble(self, hi, rs):
        b = (hi & 0xF0) | self._bl | rs
        self._write([b | _EN, b])

    def _send(self, v, rs):
        b1 = (v & 0xF0) | self._bl | rs
        b2 = ((v << 4) & 0xF0) | self._bl | rs
        self._write([b1 | _EN, b1, b2 | _EN, b2])

    def _cmd(self, c):
        self._send(c, 0)

    def clear(self):
        self._cmd(0x01)
        self.col = 0
        self.row = 0

    def home(self):
        self._cmd(0x02)
        self.col = 0
        self.row = 0

    def move_to(self, col, row):
        self.col = col
        self.row = row
        base = (0x00, 0x40, self.cols, 0x40 + self.cols)[row % 4]
        self._cmd(0x80 | (base + col))

    def putchar(self, ch):
        if ch == '\n':
            self.move_to(0, (self.row + 1) % self.rows)
            return
        self._send(ord(ch) if isinstance(ch, str) else ch, _RS)
        self.col += 1
        if self.col >= self.cols:
            self.move_to(0, (self.row + 1) % self.rows)

    def putstr(self, s):
        for ch in str(s):
            self.putchar(ch)

    def custom_char(self, location, charmap):
        self._cmd(0x40 | ((location & 7) << 3))
        for b in charmap:
            self._send(b, _RS)
        self.move_to(self.col, self.row)

    def backlight_on(self):
        self._bl = _BL
        self._write([self._bl])

    def backlight_off(self):
        self._bl = 0
        self._write([0])

    def display_on(self):
        self._cmd(0x0C)

    def display_off(self):
        self._cmd(0x08)

    def show_cursor(self):
        self._cmd(0x0E)

    def hide_cursor(self):
        self._cmd(0x0C)

    def blink_cursor_on(self):
        self._cmd(0x0F)

    def blink_cursor_off(self):
        self._cmd(0x0E)

    # RPLCD-style names
    def write_string(self, s):
        self.putstr(s)

    @property
    def cursor_pos(self):
        return (self.row, self.col)

    @cursor_pos.setter
    def cursor_pos(self, rc):
        self.move_to(rc[1], rc[0])

    def close(self, clear=False):
        if clear:
            self.clear()
