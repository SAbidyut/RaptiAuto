# busio (Adafruit Blinka): I2C, SPI and UART on the Raspberry Pi
import _rpi_js as J


class I2C:
    def __init__(self, scl=None, sda=None, frequency=100000):
        self.frequency = frequency
        self._locked = False

    def try_lock(self):
        if self._locked:
            return False
        self._locked = True
        return True

    def unlock(self):
        self._locked = False

    def deinit(self):
        pass

    def scan(self):
        s = J.i2c_scan()
        return [int(a) for a in s.split(',')] if s else []

    def writeto(self, address, buffer, *, start=0, end=None, stop=True):
        end = len(buffer) if end is None else end
        J.i2c_write(address, bytes(buffer[start:end]).hex())

    def readfrom_into(self, address, buffer, *, start=0, end=None, stop=True):
        end = len(buffer) if end is None else end
        data = bytes.fromhex(J.i2c_read(address, end - start))
        for i in range(end - start):
            buffer[start + i] = data[i]

    def writeto_then_readfrom(self, address, buffer_out, buffer_in, *, out_start=0, out_end=None, in_start=0, in_end=None, stop=False):
        self.writeto(address, buffer_out, start=out_start, end=out_end)
        self.readfrom_into(address, buffer_in, start=in_start, end=in_end)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.deinit()


class SPI:
    def __init__(self, clock=None, MOSI=None, MISO=None):
        self._sck = clock if clock is not None else 11
        self._mosi = MOSI if MOSI is not None else 10
        self._locked = False

    def try_lock(self):
        self._locked = True
        return True

    def unlock(self):
        self._locked = False

    def configure(self, **kw):
        pass

    def write(self, buf, start=0, end=None):
        end = len(buf) if end is None else end
        J.spi_xfer(self._sck, self._mosi, bytes(buf[start:end]).hex())

    def deinit(self):
        pass
