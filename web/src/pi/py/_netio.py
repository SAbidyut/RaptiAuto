# RaptiAuto virtual network (Python side): one blocking HTTP call, one server poll. The network lives in
# JavaScript (module _rpi_js); every wait sleeps a little so the screen keeps running.
import _rpi_js as J
import json
import time

# True while threading.Thread.start() runs its target: servers started there keep running in the
# background (polled between the sleeps of the main program) instead of blocking
BG = [False]


def online():
    return bool(J.net_online())


def to_text(body):
    if body is None:
        return ''
    if isinstance(body, (bytes, bytearray)):
        try:
            return bytes(body).decode('utf-8')
        except Exception:
            return ''.join(chr(c) for c in body)
    return str(body)


def to_bytes(text):
    return text.encode('utf-8') if isinstance(text, str) else bytes(text)


def http(method, url, headers=None, body='', timeout=20):
    """Send one HTTP request; returns {'status', 'statusText', 'headers', 'body', 'ms'} or raises OSError."""
    if not J.net_online():
        raise OSError(101, 'Network is unreachable (the Pi has no Wi-Fi connection)')
    rid = J.net_request(method.upper(), url, json.dumps(headers or {}), to_text(body))
    t0 = time.ticks_ms()
    while True:
        r = J.net_poll(rid)
        if r:
            break
        if time.ticks_diff(time.ticks_ms(), t0) > timeout * 1000:
            raise OSError(110, 'Connection timed out')
        time.sleep(0.01)
    res = json.loads(r)
    if res.get('failed'):
        code = res.get('error', 'ERR_FAILED')
        if code == 'ERR_NAME_NOT_RESOLVED':
            raise OSError(-2, 'Name or service not known: ' + url)
        if code == 'ERR_CONNECTION_REFUSED':
            raise OSError(111, 'Connection refused: ' + url)
        raise OSError(101, '%s (%s)' % (res.get('statusText', code), code))
    # a little round-trip time, like a real connection
    ms = res.get('ms', 0)
    if ms:
        time.sleep(min(ms, 250) / 1000)
    return res
