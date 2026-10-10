# time: MicroPython's built-in time plus the CPython functions Raspberry Pi scripts often use.
from utime import *
import utime as _t

_MON = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')
_MONL = ('January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December')
_DAY = ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')
_DAYL = ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')


def perf_counter():
    return _t.ticks_us() / 1000000


def monotonic():
    return _t.ticks_ms() / 1000


def process_time():
    return _t.ticks_ms() / 1000


def perf_counter_ns():
    return _t.ticks_us() * 1000


def monotonic_ns():
    return _t.ticks_ms() * 1000000


def _tm(t):
    if t is None:
        return _t.localtime()
    if isinstance(t, (int, float)):
        return _t.localtime(int(t))
    return t


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
