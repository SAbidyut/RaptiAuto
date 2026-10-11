# MAX7219 8x8 LED matrix (the MicroPython driver API, plus the Raspberry Pi: pass a spidev device):
#     from machine import Pin, SPI
#     import max7219
#     spi = SPI(0, sck=Pin(2), mosi=Pin(3))
#     display = max7219.Matrix8x8(spi, Pin(5, Pin.OUT), 4)     # 4 modules = 32x8
#     display.text("Hi!", 0, 0, 1); display.show()
import framebuf

_DECODEMODE = 9
_INTENSITY = 10
_SCANLIMIT = 11
_SHUTDOWN = 12
_DISPLAYTEST = 15


class Matrix8x8:
    def __init__(self, spi, cs=None, num=1):
        self.spi = spi
        self.cs = cs
        self.num = num
        self.buffer = bytearray(8 * num)
        self.fb = framebuf.FrameBuffer(self.buffer, 8 * num, 8, framebuf.MONO_HLSB)
        self.width = 8 * num
        self.height = 8
        self.init()

    def _write(self, command, data):
        frame = bytearray([command, data] * self.num)
        if hasattr(self.spi, 'xfer2'):
            self.spi.xfer2(list(frame))
        else:
            if self.cs is not None:
                self.cs.value(0)
            self.spi.write(frame)
            if self.cs is not None:
                self.cs.value(1)

    def init(self):
        for command, data in ((_SHUTDOWN, 0), (_DISPLAYTEST, 0), (_SCANLIMIT, 7), (_DECODEMODE, 0), (_SHUTDOWN, 1)):
            self._write(command, data)
        self.fill(0)
        self.show()

    def brightness(self, value):
        if not 0 <= value <= 15:
            raise ValueError("Brightness out of range")
        self._write(_INTENSITY, value)

    def show(self):
        for y in range(8):
            frame = bytearray()
            for m in range(self.num - 1, -1, -1):
                frame.append(y + 1)
                frame.append(self.buffer[y * self.num + m])
            if hasattr(self.spi, 'xfer2'):
                self.spi.xfer2(list(frame))
            else:
                if self.cs is not None:
                    self.cs.value(0)
                self.spi.write(frame)
                if self.cs is not None:
                    self.cs.value(1)

    # framebuf API
    def fill(self, c):
        self.fb.fill(c)

    def pixel(self, x, y, c=None):
        return self.fb.pixel(x, y, c) if c is not None else self.fb.pixel(x, y)

    def text(self, s, x, y, c=1):
        self.fb.text(s, x, y, c)

    def line(self, x1, y1, x2, y2, c):
        self.fb.line(x1, y1, x2, y2, c)

    def rect(self, x, y, w, h, c):
        self.fb.rect(x, y, w, h, c)

    def fill_rect(self, x, y, w, h, c):
        self.fb.fill_rect(x, y, w, h, c)

    def hline(self, x, y, w, c):
        self.fb.hline(x, y, w, c)

    def vline(self, x, y, h, c):
        self.fb.vline(x, y, h, c)

    def scroll(self, dx, dy):
        self.fb.scroll(dx, dy)
