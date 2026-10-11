# TM1637 4-digit 7-segment display (the popular micropython-tm1637 / tm1637 PyPI API):
#     import tm1637
#     tm = tm1637.TM1637(clk=Pin(2), dio=Pin(3))     # Pico  (Raspberry Pi: clk=23, dio=24)
#     tm.number(1234)    tm.show("HELP")    tm.numbers(12, 34)    tm.temperature(25)
import _rpi_js as J
import time

_SEGMENTS = bytearray(b'\x3F\x06\x5B\x4F\x66\x6D\x7D\x07\x7F\x6F\x77\x7C\x39\x5E\x79\x71\x3D\x76\x06\x1E\x76\x38\x55\x54\x3F\x73\x67\x50\x6D\x78\x3E\x1C\x2A\x76\x6E\x5B\x00\x40\x63')


def _gpio(p):
    if isinstance(p, int):
        return p
    return p._id if hasattr(p, '_id') else int(p)


class TM1637:
    def __init__(self, clk, dio, brightness=7):
        self.clk = _gpio(clk)
        self.dio = _gpio(dio)
        self._brightness = brightness
        self._frame = bytearray(6)
        self._send(self._frame[:4])

    def _send(self, segs):
        for i in range(len(segs)):
            self._frame[i] = segs[i]
        J.disp_tm1637(self.clk, self.dio, bytes(self._frame).hex(), self._brightness, 1)

    def brightness(self, val=None):
        """Set the display brightness 0-7."""
        if val is None:
            return self._brightness
        if not 0 <= val <= 7:
            raise ValueError("Brightness out of range")
        self._brightness = val
        self._send(self._frame[:4])

    def write(self, segments, pos=0):
        """Display up to 6 segments (a segment is one byte: bit 0 = A ... bit 6 = G, bit 7 = dot)."""
        if not 0 <= pos <= 5:
            raise ValueError("Position out of range")
        for i in range(len(segments)):
            if pos + i < 6:
                self._frame[pos + i] = segments[i]
        self._send(self._frame[:4])

    def encode_digit(self, digit):
        return _SEGMENTS[digit & 0x0f]

    def encode_string(self, string):
        segments = bytearray(len(string))
        for i in range(len(string)):
            segments[i] = self.encode_char(string[i])
        return segments

    def encode_char(self, char):
        o = ord(char)
        if o == 32:
            return _SEGMENTS[36]
        if o == 42:
            return _SEGMENTS[38]
        if o == 45:
            return _SEGMENTS[37]
        if o >= 65 and o <= 90:
            return _SEGMENTS[o - 55]
        if o >= 97 and o <= 122:
            return _SEGMENTS[o - 87]
        if o >= 48 and o <= 57:
            return _SEGMENTS[o - 48]
        raise ValueError("Character out of range: {:d} '{:s}'".format(o, chr(o)))

    def hex(self, val):
        string = '{:04x}'.format(val & 0xffff)
        self.write(self.encode_string(string))

    def number(self, num):
        num = max(-999, min(num, 9999))
        string = '{0: >4d}'.format(num)
        self.write(self.encode_string(string))

    def numbers(self, num1, num2, colon=True):
        num1 = max(-9, min(num1, 99))
        num2 = max(-9, min(num2, 99))
        segments = self.encode_string('{0:0>2d}{1:0>2d}'.format(num1, num2))
        if colon:
            segments[1] |= 0x80
        self.write(segments)

    def temperature(self, num):
        if num < -9:
            self.show('lo')
        elif num > 99:
            self.show('hi')
        else:
            string = '{0: >2d}'.format(num)
            self.write(self.encode_string(string))
        self.write([_SEGMENTS[38], _SEGMENTS[12]], 2)

    def show(self, string, colon=False):
        segments = self.encode_string(string)
        if len(segments) > 1 and colon:
            segments[1] |= 128
        self.write(segments[:4])

    def scroll(self, string, delay=250):
        segments = string if isinstance(string, list) else self.encode_string(string)
        data = [0] * 8
        data[4:0] = list(segments)
        for i in range(len(segments) + 5):
            self.write(data[0 + i:4 + i])
            time.sleep_ms(delay) if hasattr(time, 'sleep_ms') else time.sleep(delay / 1000)


class TM1637Decimal(TM1637):
    def number(self, num):
        self.show(str(num)[:5].rjust(4))
