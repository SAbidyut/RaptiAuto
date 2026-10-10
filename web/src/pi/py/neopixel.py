# neopixel: WS2812 LEDs. Works like MicroPython's NeoPixel(Pin(0), 8) + write(), and like
# Adafruit's neopixel.NeoPixel(board.D18, 8, auto_write=True) + show() on a Raspberry Pi.
import _rpi_js as J

GRB = 'GRB'
RGB = 'RGB'


class NeoPixel:
    def __init__(self, pin, n, bpp=3, timing=1, *, brightness=1.0, auto_write=None, pixel_order=None):
        self._id = pin._id if hasattr(pin, '_id') else int(pin)
        self.n = n
        self.bpp = bpp
        self.brightness = brightness
        # Adafruit's library (board pins are ints) writes after every change
        self.auto_write = (not hasattr(pin, '_id')) if auto_write is None else auto_write
        self._buf = [(0, 0, 0)] * n
        J.setup(self._id, 'out', 'none')

    def __len__(self):
        return self.n

    def __setitem__(self, i, v):
        if isinstance(i, slice):
            for k, c in zip(range(*i.indices(self.n)), v):
                self._buf[k] = tuple(c)[:3]
        else:
            if i < 0:
                i += self.n
            self._buf[i] = tuple(v)[:3]
        if self.auto_write:
            self.write()

    def __getitem__(self, i):
        return self._buf[i]

    def fill(self, v):
        self._buf = [tuple(v)[:3]] * self.n
        if self.auto_write:
            self.write()

    def write(self):
        b = self.brightness
        s = ''.join('%02x%02x%02x' % (int(c[0] * b) & 255, int(c[1] * b) & 255, int(c[2] * b) & 255) for c in self._buf)
        J.neo(self._id, self.n, s)

    show = write

    def deinit(self):
        self.fill((0, 0, 0))
        self.write()
