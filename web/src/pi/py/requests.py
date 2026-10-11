# requests for the RaptiAuto virtual Raspberry Pi / Pico W: the usual calls on the simulated network.
#     import requests
#     r = requests.get("http://wttr.in/Dhaka?format=3")
#     print(r.status_code, r.text)
#     data = requests.get("http://api.open-meteo.com/v1/forecast?latitude=23.8&longitude=90.4&current_weather=true").json()
import json as _json
import _netio
from urllib.parse import urlencode as _urlencode


class RequestException(OSError):
    pass


class ConnectionError(RequestException):
    pass


class Timeout(RequestException):
    pass


class HTTPError(RequestException):
    def __init__(self, *a, response=None):
        super().__init__(*a)
        self.response = response


class InvalidURL(RequestException):
    pass


class _Headers(dict):
    """Case-insensitive headers."""
    def __init__(self, d=None):
        super().__init__()
        for k, v in (d or {}).items():
            self[k] = v

    def __setitem__(self, k, v):
        super().__setitem__(k.lower(), v)

    def __getitem__(self, k):
        return super().__getitem__(k.lower())

    def get(self, k, default=None):
        return super().get(k.lower(), default)

    def __contains__(self, k):
        return super().__contains__(k.lower())


class Response:
    def __init__(self, res, url):
        self.status_code = res['status']
        self.reason = res.get('statusText', '')
        self.headers = _Headers(res.get('headers', {}))
        self._text = res.get('body', '')
        self.url = url
        self.encoding = 'utf-8'
        self.elapsed = res.get('ms', 0)
        self.history = []
        self.cookies = {}

    @property
    def text(self):
        return self._text

    @property
    def content(self):
        return self._text.encode('utf-8')

    @property
    def ok(self):
        return self.status_code < 400

    def json(self, **kw):
        return _json.loads(self._text)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise HTTPError('%d %s Error: %s for url: %s' % (self.status_code, 'Client' if self.status_code < 500 else 'Server', self.reason, self.url), response=self)

    def iter_content(self, chunk_size=1024):
        c = self.content
        for i in range(0, len(c), chunk_size):
            yield c[i:i + chunk_size]

    def iter_lines(self):
        for line in self._text.split('\n'):
            yield line

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def __bool__(self):
        return self.ok

    def __repr__(self):
        return '<Response [%d]>' % self.status_code


def _b64(s):
    import base64
    return base64.b64encode(s.encode()).decode()


def request(method, url, params=None, data=None, headers=None, json=None, timeout=None, auth=None, allow_redirects=True, **kw):
    if not url.startswith('http://') and not url.startswith('https://'):
        raise InvalidURL("Invalid URL %r: No scheme supplied. Perhaps you meant https://%s?" % (url, url))
    h = {'User-Agent': 'python-requests/2.31.0', 'Accept': '*/*'}
    h.update(headers or {})
    if params:
        url += ('&' if '?' in url else '?') + _urlencode(params)
    body = ''
    if json is not None:
        body = _json.dumps(json)
        h.setdefault('Content-Type', 'application/json')
    elif data is not None:
        if isinstance(data, dict):
            body = _urlencode(data)
            h.setdefault('Content-Type', 'application/x-www-form-urlencoded')
        else:
            body = _netio.to_text(data)
    if auth:
        h['Authorization'] = 'Basic ' + _b64('%s:%s' % auth)
    try:
        res = _netio.http(method, url, h, body, timeout or 20)
    except OSError as e:
        if len(e.args) and e.args[0] == 110:
            raise Timeout(*e.args)
        raise ConnectionError(*e.args)
    r = Response(res, url)
    loc = r.headers.get('location')
    if allow_redirects and 300 <= r.status_code < 400 and loc:
        from urllib.parse import urljoin
        return request('GET', urljoin(url, loc), headers=headers, timeout=timeout)
    return r


def get(url, params=None, **kw):
    return request('GET', url, params=params, **kw)


def post(url, data=None, json=None, **kw):
    return request('POST', url, data=data, json=json, **kw)


def put(url, data=None, **kw):
    return request('PUT', url, data=data, **kw)


def patch(url, data=None, **kw):
    return request('PATCH', url, data=data, **kw)


def delete(url, **kw):
    return request('DELETE', url, **kw)


def head(url, **kw):
    return request('HEAD', url, **kw)


class Session:
    def __init__(self):
        self.headers = {}
        self.auth = None
        self.cookies = {}

    def request(self, method, url, **kw):
        h = dict(self.headers)
        h.update(kw.pop('headers', None) or {})
        if self.auth and 'auth' not in kw:
            kw['auth'] = self.auth
        return request(method, url, headers=h, **kw)

    def get(self, url, **kw):
        return self.request('GET', url, **kw)

    def post(self, url, **kw):
        return self.request('POST', url, **kw)

    def put(self, url, **kw):
        return self.request('PUT', url, **kw)

    def delete(self, url, **kw):
        return self.request('DELETE', url, **kw)

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass


class codes:
    ok = 200
    created = 201
    not_found = 404
    internal_server_error = 500


_RE, _CE, _TO, _HE, _IU = RequestException, ConnectionError, Timeout, HTTPError, InvalidURL


class exceptions:
    RequestException = _RE
    ConnectionError = _CE
    Timeout = _TO
    ConnectTimeout = _TO
    ReadTimeout = _TO
    HTTPError = _HE
    InvalidURL = _IU

