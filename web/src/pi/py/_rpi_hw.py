# RaptiAuto virtual hardware core: callbacks (edges, timers) and pin bookkeeping.
# The simulated GPIO lives in JavaScript (module _rpi_js); this file runs callbacks
# that JavaScript queues while Python sleeps or loops.
import _rpi_js as J
import _rapti

_cbs = {}
_next = [1]


def register(cb):
    i = _next[0]
    _next[0] += 1
    _cbs[i] = cb
    return i


def unregister(i):
    if i in _cbs:
        del _cbs[i]


def call(cb, *args):
    # gpiozero style: call with no argument, or with the device if the function wants one
    try:
        return cb()
    except TypeError as e:
        if args and 'argument' in str(e):
            return cb(*args)
        raise


def _dispatch(_):
    while True:
        cid = J.next_event()
        if not cid:
            break
        cb = _cbs.get(cid)
        if cb is not None:
            cb(J.event_arg())


_rapti.set_dispatch(_dispatch)


def board():
    return J.board()


def every(ms, fn):
    """Call fn() every ms milliseconds (in the background). Returns a handle for stop()."""
    cid = register(lambda _: fn())
    return (J.timer(cid, ms, 1), cid)


def stop(handle):
    if handle:
        J.timer_stop(handle[0])
        unregister(handle[1])
