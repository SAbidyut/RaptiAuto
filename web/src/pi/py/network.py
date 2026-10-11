# network: Wi-Fi for the Pico W on the simulated network (see src/net). Networks in range: RaptiNet
# (password rapti1234), RAPTI-Lab (password123), Wokwi-GUEST and Guest (open), Home-WiFi (12345678),
# Office-5G (admin1234). Any other name works too when the password has 8+ characters (turn on
# "Strict Wi-Fi" in http://dashboard.rapti.net/ to make a wrong name fail).
import _rpi_js as J
import json
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
        self._res = None
        self._join = None

    def active(self, a=None):
        if a is None:
            return self._active
        self._active = bool(a)
        J.wifi(1 if self._active else 0, '')
        if not self._active:
            J.wifi_leave()

    def connect(self, ssid=None, key=None, **kw):
        if not self._active:
            raise OSError('wifi is not active')
        self._ssid = ssid
        self._t = _time.ticks_ms()
        self._res = json.loads(J.wifi_join(ssid or '', key or ''))
        J.wifi(2, ssid or '')

    def disconnect(self):
        self._t = None
        self._res = None
        J.wifi_leave()
        J.wifi(1, '')

    def status(self, param=None):
        if param == 'rssi':
            return json.loads(J.wifi_info()).get('rssi', -48)
        if self._t is None:
            return STAT_IDLE
        if _time.ticks_diff(_time.ticks_ms(), self._t) < 1800:
            return STAT_CONNECTING
        st = self._res['status'] if self._res else 1
        if st == 3:
            if not json.loads(J.wifi_info()).get('connected'):
                return STAT_CONNECT_FAIL
            J.wifi(3, self._ssid or '')
            return STAT_GOT_IP
        return STAT_WRONG_PASSWORD if st == 4 else STAT_NO_AP_FOUND

    def isconnected(self):
        return self.status() == STAT_GOT_IP

    def ifconfig(self, cfg=None):
        if self.isconnected():
            ip = json.loads(J.wifi_info()).get('ip', '192.168.1.50')
            return (ip, '255.255.255.0', '192.168.1.1', '8.8.8.8')
        return ('0.0.0.0', '0.0.0.0', '0.0.0.0', '0.0.0.0')

    def ipconfig(self, *a):
        return self.ifconfig()[0]

    def scan(self):
        out = []
        for n in json.loads(J.wifi_scan()):
            out.append((n['ssid'].encode(), bytes(n['bssid']), n['ch'], n['rssi'], 3 if n['enc'] != 'open' else 0, 0))
        return out

    def config(self, *a, **k):
        if a and a[0] == 'mac':
            return bytes(int(x, 16) for x in json.loads(J.wifi_info()).get('mac', '28:cd:c1:0a:4b:2e').split(':'))
        if a and a[0] == 'ssid':
            return self._ssid or ''
        return None


def hostname(name=None):
    return 'PicoW' if name is None else None


def country(c=None):
    return 'BD' if c is None else None
