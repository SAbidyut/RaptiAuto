# spidev: SPI on the Raspberry Pi header (SPI0: SCLK GPIO11, MOSI GPIO10, MISO GPIO9, CE0 GPIO8, CE1 GPIO7)
import _rpi_js as J

_PINS = {0: (11, 10), 1: (21, 20)}


class SpiDev:
    def __init__(self):
        self._bus = 0
        self._dev = 0
        self.max_speed_hz = 500000
        self.mode = 0
        self.bits_per_word = 8
        self.cshigh = False
        self._open = False

    def open(self, bus, device):
        if bus not in _PINS:
            raise FileNotFoundError(2, "No such file or directory")
        self._bus = bus
        self._dev = device
        self._open = True

    def close(self):
        self._open = False

    def _xfer(self, data):
        if not self._open:
            raise OSError(9, "Bad file descriptor")
        sck, mosi = _PINS[self._bus]
        r = J.spi_xfer(sck, mosi, bytes(data).hex())
        return list(bytes.fromhex(r))

    def xfer(self, data, speed_hz=0, delay_usec=0, bits_per_word=0):
        return self._xfer(data)

    def xfer2(self, data, speed_hz=0, delay_usec=0, bits_per_word=0):
        return self._xfer(data)

    def writebytes(self, data):
        self._xfer(data)

    writebytes2 = writebytes

    def readbytes(self, n):
        return self._xfer([0] * n)
