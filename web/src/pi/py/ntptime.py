# ntptime (MicroPython): sets the RTC from the simulated NTP server (the phone's clock).
import time as _t

host = 'pool.ntp.org'
timeout = 1


def time():
    return int(_t.time())


def settime():
    try:
        import machine
        tm = _t.gmtime(int(_t.time()))
        machine.RTC().datetime((tm[0], tm[1], tm[2], tm[6], tm[3], tm[4], tm[5], 0))
    except Exception:
        pass
