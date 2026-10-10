# network: simulated Wi-Fi for the Pico W (no real internet; the connection always succeeds).
import _rpi_js as J
import time as _time

STA_IF = 0
AP_IF = 1
STAT_IDLE = 0
STAT_CONNECTING = 1
STAT_WRONG_PASSWORD = -3
STAT_NO_AP_FOUND = -2
STAT_CONNECT_FAIL = -1
STAT_GOT_IP = 3


def _check():
    if J.board() not in ('picow', 'pico2w'):
        raise ImportError("no module named 'network'")


class WLAN:
    def __init__(self, interface_id=STA_IF):
        _check()
        self._if = interface_id
        self._active = False
        self._t = None
        self._ssid = None

    def active(self, a=None):
        if a is None:
            return self._active
        self._active = bool(a)
        J.wifi(1 if self._active else 0, '')

    def connect(self, ssid=None, key=None, **kw):
        if not self._active:
            raise OSError('wifi is not active')
        self._ssid = ssid
        self._t = _time.ticks_ms()
        J.wifi(2, ssid or '')

    def disconnect(self):
        self._t = None
        J.wifi(1, '')

    def status(self, param=None):
        if param == 'rssi':
            return -48
        if self._t is None:
            return STAT_IDLE
        if _time.ticks_diff(_time.ticks_ms(), self._t) < 1800:
            return STAT_CONNECTING
        J.wifi(3, self._ssid or '')
        return STAT_GOT_IP

    def isconnected(self):
        return self.status() == STAT_GOT_IP

    def ifconfig(self, cfg=None):
        if self.isconnected():
            return ('192.168.1.42', '255.255.255.0', '192.168.1.1', '8.8.8.8')
        return ('0.0.0.0', '0.0.0.0', '0.0.0.0', '0.0.0.0')

    def ipconfig(self, *a):
        return self.ifconfig()[0]

    def scan(self):
        return [(b'RAPTI-Lab', b'\x00\x11\x22\x33\x44\x55', 6, -45, 3, 0), (b'Home WiFi', b'\x66\x77\x88\x99\xaa\xbb', 11, -67, 3, 0)]

    def config(self, *a, **k):
        if a and a[0] == 'mac':
            return b'\x28\xcd\xc1\x0a\x4b\x2e'
        if a and a[0] == 'ssid':
            return self._ssid or ''
        return None


def hostname(name=None):
    return 'PicoW' if name is None else None


def country(c=None):
    return 'BD' if c is None else None
