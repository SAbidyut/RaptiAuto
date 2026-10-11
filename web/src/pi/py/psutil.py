# psutil (a few calls) for dashboards: CPU load, memory, temperature of the virtual Pi.
import random as _r
import time as _t


class _N:
    def __init__(self, **k):
        self.__dict__.update(k)

    def __iter__(self):
        return iter(self.__dict__.values())


def cpu_percent(interval=None, percpu=False):
    v = 6 + (_t.ticks_ms() // 700) % 17 + _r.random() * 4
    return [v, v + 1, v - 1, v + 2] if percpu else round(v, 1)


def cpu_count(logical=True):
    return 4


def virtual_memory():
    total = 8 * 1024 ** 3
    used = int(total * (0.11 + ((_t.ticks_ms() // 3000) % 9) * 0.004))
    return _N(total=total, available=total - used, used=used, free=total - used, percent=round(used * 100 / total, 1))


def disk_usage(path='/'):
    total = 29 * 1024 ** 3
    used = int(6.6 * 1024 ** 3)
    return _N(total=total, used=used, free=total - used, percent=round(used * 100 / total, 1))


def sensors_temperatures(fahrenheit=False):
    t = 44 + ((_t.ticks_ms() // 2000) % 7) * 0.5
    return {'cpu_thermal': [_N(label='', current=t, high=None, critical=None)]}


def boot_time():
    return _t.time() - 3600


def net_if_addrs():
    import _rpi_js as J
    return {'wlan0': [_N(family=2, address=J.net_ip() or '0.0.0.0', netmask='255.255.255.0')]}
