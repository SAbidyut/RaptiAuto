# time: MicroPython's built-in time plus the CPython functions Raspberry Pi scripts often use.
from utime import *
import utime as _t

_MON = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')
_MONL = ('January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December')
_DAY = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
_DAYL = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')


try:
    from _rapti import ticks_us as _us  # 64-bit: does not wrap like ticks_us (2**30 us = 17.9 min)
except Exception:
    _us = _t.ticks_us


def perf_counter():
    return _us() / 1000000


def monotonic():
    return _t.ticks_ms() / 1000


def process_time():
    return _t.ticks_ms() / 1000


def perf_counter_ns():
    return _us() * 1000


def monotonic_ns():
    return _t.ticks_ms() * 1000000


# Local time everywhere (like CPython on a Pi): time() is UTC seconds; localtime(), localtime(secs),
# ctime(), mktime() and datetime (which calls these) all use the phone's time zone. On a Pico the
# RTC starts at local time (as Thonny sets it); machine.RTC().datetime(...) / ntptime.settime()
# move it, e.g. to UTC.
_rtc = [None]   # Pico RTC offset from UTC in seconds, once a program set the RTC


def _off(secs):
    if _rtc[0] is not None:
        return _rtc[0]
    try:
        import _rpi_js
        return int(_rpi_js.tz_offset(secs))
    except Exception:
        return 0


def _secs(secs):
    s = _t.time() if secs is None else secs
    return int(s // 1)


def _days(y, m, d):
    # days since 1970-01-01 of a proleptic Gregorian date (any year; utime stops at 1970..2106)
    y += (m - 1) // 12
    m = (m - 1) % 12 + 1
    y -= m <= 2
    era = y // 400
    yoe = y - era * 400
    doy = (153 * (m + (-3 if m > 2 else 9)) + 2) // 5 + d - 1
    return era * 146097 + yoe * 365 + yoe // 4 - yoe // 100 + doy - 719468


def _gm(s):
    z, r = divmod(s, 86400)
    days = z
    z += 719468
    era = z // 146097
    doe = z - era * 146097
    yoe = (doe - doe // 1460 + doe // 36524 - doe // 146096) // 365
    doy = doe - (365 * yoe + yoe // 4 - yoe // 100)
    mp = (5 * doy + 2) // 153
    d = doy - (153 * mp + 2) // 5 + 1
    m = mp + (3 if mp < 10 else -9)
    y = yoe + era * 400 + (m <= 2)
    return (y, m, d, r // 3600, r % 3600 // 60, r % 60, (days + 3) % 7, days - _days(y, 1, 1) + 1)


def _mk(t):
    return _days(t[0], t[1], t[2]) * 86400 + t[3] * 3600 + t[4] * 60 + t[5]


def localtime(secs=None):
    s = _secs(secs)
    return _gm(s + _off(s))


def gmtime(secs=None):
    return _gm(_secs(secs))


def mktime(t):
    u = _mk(t)   # the tuple read as UTC
    return u - _off(u - _off(u))


def _set_rtc(t):
    # machine.RTC().datetime(...): the RTC now shows this local time
    _rtc[0] = _mk((t[0], t[1], t[2], t[3], t[4], t[5], 0, 0)) - int(_t.time())


def _tm(t):
    if t is None or isinstance(t, (int, float)):
        return localtime(t)
    return t


try:
    timezone = -_off(int(_t.time()))
    altzone = timezone
except Exception:
    timezone = altzone = 0


def strftime(fmt, t=None):
    t = _tm(t)
    y, mo, d, hh, mm, ss, wd, yd = t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7]
    rep = {
        'Y': '%04d' % y, 'y': '%02d' % (y % 100), 'm': '%02d' % mo, 'd': '%02d' % d, 'e': '%2d' % d,
        'H': '%02d' % hh, 'I': '%02d' % ((hh % 12) or 12), 'M': '%02d' % mm, 'S': '%02d' % ss,
        'p': 'AM' if hh < 12 else 'PM', 'b': _MON[mo - 1], 'B': _MONL[mo - 1], 'a': _DAY[wd], 'A': _DAYL[wd],
        'j': '%03d' % yd, 'w': str((wd + 1) % 7), '%': '%',
    }
    rep['c'] = '%s %s %s %s:%s:%s %s' % (rep['a'], rep['b'], rep['e'], rep['H'], rep['M'], rep['S'], rep['Y'])
    rep['x'] = '%s/%s/%s' % (rep['m'], rep['d'], rep['y'])
    rep['X'] = '%s:%s:%s' % (rep['H'], rep['M'], rep['S'])
    rep['T'] = rep['X']
    rep['D'] = rep['x']
    out = []
    i = 0
    while i < len(fmt):
        c = fmt[i]
        if c == '%' and i + 1 < len(fmt):
            out.append(rep.get(fmt[i + 1], '%' + fmt[i + 1]))
            i += 2
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def asctime(t=None):
    return strftime('%a %b %e %H:%M:%S %Y', t)


def ctime(secs=None):
    return asctime(_tm(secs))


struct_time = tuple
