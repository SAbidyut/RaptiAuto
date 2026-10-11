class _GC:
    def __init__(self, gen):
        self._gen = gen

    def __enter__(self):
        return next(self._gen)

    def __exit__(self, t, v, tb):
        try:
            if t is None:
                next(self._gen)
            else:
                try:
                    self._gen.throw(v)
                except StopIteration:
                    return True
        except StopIteration:
            pass
        return False


def contextmanager(fn):
    def helper(*a, **k):
        return _GC(fn(*a, **k))
    return helper


class closing:
    def __init__(self, thing):
        self.thing = thing

    def __enter__(self):
        return self.thing

    def __exit__(self, *a):
        self.thing.close()


class suppress:
    def __init__(self, *exc):
        self.exc = exc

    def __enter__(self):
        return None

    def __exit__(self, t, v, tb):
        return t is not None and issubclass(t, self.exc)
