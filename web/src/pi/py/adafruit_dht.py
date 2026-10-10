# adafruit_dht: DHT11 / DHT22 on a Raspberry Pi (Adafruit CircuitPython API).
import _rpi_js as J


class DHTBase:
    def __init__(self, pin, use_pulseio=True):
        self._id = int(pin)

    def _read(self, which):
        v = J.dht(self._id, which)
        if v < -100:
            raise RuntimeError('DHT sensor not found, check wiring')
        return v

    def exit(self):
        pass


class DHT11(DHTBase):
    @property
    def temperature(self):
        return int(round(self._read(0)))

    @property
    def humidity(self):
        return int(round(self._read(1)))


class DHT22(DHTBase):
    @property
    def temperature(self):
        return round(self._read(0), 1)

    @property
    def humidity(self):
        return round(self._read(1), 1)
