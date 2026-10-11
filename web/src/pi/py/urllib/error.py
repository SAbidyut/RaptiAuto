class URLError(OSError):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class HTTPError(URLError):
    def __init__(self, url, code, msg, hdrs, fp):
        super().__init__(msg)
        self.url = url
        self.code = code
        self.msg = msg
        self.headers = hdrs
        self.fp = fp

    def read(self):
        return self.fp.read() if self.fp else b''

    def __str__(self):
        return 'HTTP Error %d: %s' % (self.code, self.msg)
