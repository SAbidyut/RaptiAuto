# threading for the virtual Pi (one interpreter, no real threads): Thread(target).start() runs the
# target at once. A web server started in it (Flask app.run, HTTPServer.serve_forever) keeps running
# in the background, and mqtt loop_start() does too, so the main program carries on.
import time
import _netio


class Thread:
    def __init__(self, group=None, target=None, name=None, args=(), kwargs=None, daemon=None):
        self._target = target
        self._args = args
        self._kwargs = kwargs or {}
        self.name = name or 'Thread-1'
        self.daemon = bool(daemon)
        self._alive = False

    def start(self):
        self._alive = True
        _netio.BG[0] = True
        try:
            self.run()
        finally:
            _netio.BG[0] = False
            self._alive = False

    def run(self):
        if self._target:
            self._target(*self._args, **self._kwargs)

    def join(self, timeout=None):
        pass

    def is_alive(self):
        return self._alive

    def setDaemon(self, d):
        self.daemon = d


class Event:
    def __init__(self):
        self._f = False

    def set(self):
        self._f = True

    def clear(self):
        self._f = False

    def is_set(self):
        return self._f

    def wait(self, timeout=None):
        t0 = time.ticks_ms()
        while not self._f:
            if timeout is not None and time.ticks_diff(time.ticks_ms(), t0) > timeout * 1000:
                break
            time.sleep(0.01)
        return self._f


class Lock:
    def acquire(self, *a, **k):
        return True

    def release(self):
        pass

    def locked(self):
        return False

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


RLock = Lock


class Timer(Thread):
    def __init__(self, interval, function, args=None, kwargs=None):
        super().__init__(target=function, args=args or (), kwargs=kwargs)
        self.interval = interval

    def start(self):
        import _rpi_hw
        h = [None]

        def fire():
            _rpi_hw.stop(h[0])
            self._target(*self._args, **self._kwargs)
        h[0] = _rpi_hw.every(int(self.interval * 1000), fire)
        self._h = h

    def cancel(self):
        h = getattr(self, '_h', None)
        if h and h[0]:
            import _rpi_hw
            _rpi_hw.stop(h[0])
            h[0] = None


def current_thread():
    return Thread(name='MainThread')


def active_count():
    return 1
