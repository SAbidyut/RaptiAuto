# dht: DHT11 / DHT22 temperature and humidity sensors (MicroPython API).
import _rpi_js as J


class DHTBase:
    def __init__(self, pin):
        self._id = pin._id if hasattr(pin, '_id') else int(pin)
        self._t = None
        self._h = None

    def measure(self):
        t = J.dht(self._id, 0)
        if t < -100:
            raise OSError(110)  # ETIMEDOUT: no sensor on this pin
        self._t = t
        self._h = J.dht(self._id, 1)


class DHT11(DHTBase):
    def temperature(self):
        return int(round(self._t))

    def humidity(self):
        return int(round(self._h))


class DHT22(DHTBase):
    def temperature(self):
        return round(float(self._t), 1)

    def humidity(self):
        return round(float(self._h), 1)
