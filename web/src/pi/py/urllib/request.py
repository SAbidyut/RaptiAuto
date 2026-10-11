# urllib.request.urlopen on the simulated network.
#     from urllib.request import urlopen
#     print(urlopen("http://wttr.in/Dhaka?format=3").read().decode())
import _netio
from urllib.error import URLError, HTTPError


class Request:
    def __init__(self, url, data=None, headers=None, method=None, **kw):
        self.full_url = url
        self.data = data
        self.headers = dict(headers or {})
        self.method = method or ('POST' if data is not None else 'GET')

    def add_header(self, k, v):
        self.headers[k] = v


class _Resp:
    def __init__(self, res, url):
        self.status = res['status']
        self.code = res['status']
        self.reason = res.get('statusText', '')
        self.headers = res.get('headers', {})
        self._b = res.get('body', '').encode('utf-8')
        self._url = url
        self._p = 0

    def read(self, n=-1):
        if n is None or n < 0:
            d = self._b[self._p:]
            self._p = len(self._b)
        else:
            d = self._b[self._p:self._p + n]
            self._p += len(d)
        return d

    def readline(self):
        i = self._b.find(b'\n', self._p)
        j = len(self._b) if i < 0 else i + 1
        d = self._b[self._p:j]
        self._p = j
        return d

    def getcode(self):
        return self.status

    def geturl(self):
        return self._url

    def info(self):
        return self.headers

    def getheader(self, k, default=None):
        return self.headers.get(k.lower(), default)

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def __iter__(self):
        while True:
            l = self.readline()
            if not l:
                break
            yield l


def urlopen(url, data=None, timeout=20, **kw):
    if isinstance(url, Request):
        req = url
    else:
        req = Request(url, data)
    h = {'User-Agent': 'Python-urllib/3.11'}
    h.update(req.headers)
    if req.data is not None and 'Content-Type' not in h:
        h['Content-Type'] = 'application/x-www-form-urlencoded'
    try:
        res = _netio.http(req.method, req.full_url, h, req.data if req.data is not None else '', timeout)
    except OSError as e:
        raise URLError(e)
    if res['status'] >= 400:
        raise HTTPError(req.full_url, res['status'], res.get('statusText', ''), res.get('headers', {}), _Resp(res, req.full_url))
    return _Resp(res, req.full_url)


def urlretrieve(url, filename=None, **kw):
    r = urlopen(url)
    if filename:
        with open(filename, 'wb') as f:
            f.write(r.read())
    return filename, r.headers
