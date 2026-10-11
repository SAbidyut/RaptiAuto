# urllib.parse: quoting, query strings and URL splitting.
_SAFE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~'


def quote(s, safe='/'):
    if isinstance(s, str):
        s = s.encode('utf-8')
    out = []
    for c in s:
        ch = chr(c)
        if ch in _SAFE or ch in safe:
            out.append(ch)
        else:
            out.append('%%%02X' % c)
    return ''.join(out)


def quote_plus(s, safe=''):
    return quote(s, safe + ' ').replace(' ', '+')


def unquote(s):
    if '%' not in s:
        return s
    b = bytearray()
    i = 0
    while i < len(s):
        c = s[i]
        if c == '%' and i + 3 <= len(s):
            try:
                b.append(int(s[i + 1:i + 3], 16))
                i += 3
                continue
            except ValueError:
                pass
        b.extend(c.encode('utf-8'))
        i += 1
    return bytes(b).decode('utf-8')


def unquote_plus(s):
    return unquote(s.replace('+', ' '))


def urlencode(query, doseq=False, **kw):
    items = query.items() if hasattr(query, 'items') else query
    parts = []
    for k, v in items:
        if doseq and isinstance(v, (list, tuple)):
            for x in v:
                parts.append(quote_plus(str(k)) + '=' + quote_plus(str(x)))
        else:
            parts.append(quote_plus(str(k)) + '=' + quote_plus(str(v)))
    return '&'.join(parts)


def parse_qs(qs, **kw):
    out = {}
    for part in qs.split('&'):
        if not part:
            continue
        k, _, v = part.partition('=')
        out.setdefault(unquote_plus(k), []).append(unquote_plus(v))
    return out


def parse_qsl(qs, **kw):
    return [(k, v) for k, vs in parse_qs(qs).items() for v in vs]


class ParseResult:
    """urlparse() result: a 6-item sequence with named parts (MicroPython can't subclass tuple)."""
    def __init__(self, scheme, netloc, path, params, query, fragment):
        self.scheme, self.netloc, self.path, self.params, self.query, self.fragment = scheme, netloc, path, params, query, fragment

    def _t(self):
        return (self.scheme, self.netloc, self.path, self.params, self.query, self.fragment)

    def __iter__(self):
        return iter(self._t())

    def __getitem__(self, i):
        return self._t()[i]

    def __len__(self):
        return 6

    def __eq__(self, o):
        return tuple(self) == tuple(o)

    def __repr__(self):
        return "ParseResult(scheme=%r, netloc=%r, path=%r, params=%r, query=%r, fragment=%r)" % self._t()

    @property
    def hostname(self):
        h = self.netloc.rpartition('@')[2].partition(':')[0]
        return h or None

    @property
    def port(self):
        p = self.netloc.rpartition(':')[2]
        return int(p) if self.netloc.count(':') and p.isdigit() else None

    def geturl(self):
        return urlunparse(self)


def urlparse(url, scheme=''):
    fragment = ''
    query = ''
    if '#' in url:
        url, _, fragment = url.partition('#')
    if '?' in url:
        url, _, query = url.partition('?')
    netloc = ''
    if '://' in url:
        scheme, _, rest = url.partition('://')
        if '/' in rest:
            netloc, _, path = rest.partition('/')
            path = '/' + path
        else:
            netloc, path = rest, ''
    else:
        path = url
    return ParseResult(scheme, netloc, path, '', query, fragment)


def urlunparse(p):
    scheme, netloc, path, params, query, fragment = p
    u = path
    if netloc:
        u = scheme + '://' + netloc + path if scheme else '//' + netloc + path
    if query:
        u += '?' + query
    if fragment:
        u += '#' + fragment
    return u


def urljoin(base, url):
    if '://' in url:
        return url
    b = urlparse(base)
    if url.startswith('//'):
        return b.scheme + ':' + url
    if url.startswith('/'):
        return b.scheme + '://' + b.netloc + url
    path = b.path.rsplit('/', 1)[0] + '/' + url if '/' in b.path else '/' + url
    return b.scheme + '://' + b.netloc + path
