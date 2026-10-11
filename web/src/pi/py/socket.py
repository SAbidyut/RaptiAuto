# socket for the RaptiAuto virtual Raspberry Pi / Pico W. TCP sockets speak HTTP: a client socket sends
# a request (GET / HTTP/1.1 …) to a host on the simulated network and reads the answer; a server socket
# (bind / listen / accept) receives the requests a browser sends to this device and replies. That is
# what Pico W "web server" and Raspberry Pi socket examples need.
import _rpi_js as J
import json
import time
import _netio

def _title(k):
    """str.title() for header names (MicroPython has none): content-type -> Content-Type."""
    return '-'.join(p[:1].upper() + p[1:] for p in k.split('-'))

AF_INET = 2
AF_INET6 = 10
SOCK_STREAM = 1
SOCK_DGRAM = 2
SOL_SOCKET = 1
SO_REUSEADDR = 2
SO_BROADCAST = 6
IPPROTO_TCP = 6
IPPROTO_UDP = 17
SHUT_RD = 0
SHUT_WR = 1
SHUT_RDWR = 2
error = OSError
timeout = OSError
gaierror = OSError
herror = OSError

_default_timeout = [None]


def setdefaulttimeout(t):
    _default_timeout[0] = t


def getdefaulttimeout():
    return _default_timeout[0]


def gethostname():
    return J.net_hostname()


def gethostbyname(host):
    ip = J.net_resolve(host)
    if not ip:
        raise gaierror(-2, 'Name or service not known')
    return ip


def getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    ip = gethostbyname(host)
    return [(AF_INET, SOCK_STREAM, 6, '', (ip, int(port) if port else 0))]


def inet_aton(s):
    return bytes(int(x) for x in s.split('.'))


def inet_ntoa(b):
    return '.'.join(str(x) for x in b)


def _my_ip():
    return J.net_ip() or '0.0.0.0'


class _Conn:
    """The connection a server socket hands out: recv() the request, send() the reply, close() delivers it."""
    def __init__(self, rid, addr):
        info = json.loads(J.net_req(rid))
        self._id = rid
        self._addr = addr
        path = info.get('path', '/')
        lines = ['%s %s HTTP/1.1' % (info.get('method', 'GET'), path), 'Host: ' + info.get('host', '')]
        for k, v in (info.get('headers') or {}).items():
            if k != 'host':
                lines.append('%s: %s' % (_title(k), v))
        body = info.get('body', '')
        self._in = ('\r\n'.join(lines) + '\r\n\r\n' + body).encode('utf-8')
        self._out = b''
        self._closed = False

    def recv(self, n=1024):
        d = self._in[:n]
        self._in = self._in[n:]
        return d

    def recvfrom(self, n=1024):
        return self.recv(n), self._addr

    def send(self, data):
        if isinstance(data, str):
            data = data.encode('utf-8')
        self._out += bytes(data)
        return len(data)

    def sendall(self, data):
        self.send(data)

    def write(self, data):
        return self.send(data)

    def read(self, n=-1):
        return self.recv(n if n and n > 0 else 100000)

    def readline(self):
        i = self._in.find(b'\n')
        j = len(self._in) if i < 0 else i + 1
        d = self._in[:j]
        self._in = self._in[j:]
        return d

    def settimeout(self, t):
        pass

    def setblocking(self, f):
        pass

    def makefile(self, mode='rwb', *a, **k):
        return self

    def fileno(self):
        return self._id

    def close(self):
        if self._closed:
            return
        self._closed = True
        raw = self._out
        status, headers, body = 200, {}, b''
        if raw:
            head, _, body = raw.partition(b'\r\n\r\n')
            lines = head.decode('utf-8', 'replace').split('\r\n')
            parts = lines[0].split(' ', 2)
            if len(parts) > 1 and parts[1].isdigit():
                status = int(parts[1])
            for l in lines[1:]:
                k, _, v = l.partition(':')
                if k:
                    headers[k.strip().lower()] = v.strip()
        else:
            status = 500
        J.net_respond(self._id, status, json.dumps(headers), body.decode('utf-8', 'replace'))

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class socket:
    def __init__(self, family=AF_INET, type=SOCK_STREAM, proto=0, fileno=None):
        self.family = family
        self.type = type
        self._timeout = _default_timeout[0]
        self._block = True
        self._port = None
        self._listening = False
        self._peer = None
        self._buf = b''
        self._out = b''
        self._resp = None
        self._pos = 0
        self._closed = False

    # ---- options
    def setsockopt(self, *a):
        pass

    def settimeout(self, t):
        self._timeout = t

    def gettimeout(self):
        return self._timeout

    def setblocking(self, flag):
        self._block = bool(flag)
        self._timeout = None if flag else 0

    def getsockname(self):
        return (_my_ip(), self._port or 0)

    # ---- server
    def bind(self, addr):
        self._port = int(addr[1])

    def listen(self, backlog=5):
        if self._port is None:
            raise OSError(22, 'Invalid argument')
        r = J.net_listen(self._port)
        if r == -1:
            raise OSError(98, 'Address already in use')
        if r == 0:
            raise OSError(101, 'Network is unreachable (no Wi-Fi connection)')
        self._listening = True

    def accept(self):
        t0 = time.ticks_ms()
        while True:
            rid = J.net_accept(self._port)
            if rid:
                return _Conn(rid, ('192.168.1.2', 50000 + rid % 1000)), ('192.168.1.2', 50000 + rid % 1000)
            if self._timeout == 0:
                raise OSError(11, 'EAGAIN')
            if self._timeout is not None and time.ticks_diff(time.ticks_ms(), t0) > self._timeout * 1000:
                raise OSError(110, 'timed out')
            time.sleep(0.02)

    # ---- client
    def connect(self, addr):
        host, port = addr[0], int(addr[1])
        if not J.net_online():
            raise OSError(101, 'Network is unreachable')
        if not J.net_resolve(host):
            raise gaierror(-2, 'Name or service not known')
        self._peer = (host, port)

    def _flush(self):
        # one HTTP request is complete: send it and keep the answer for recv()
        raw = self._out
        self._out = b''
        head, _, body = raw.partition(b'\r\n\r\n')
        lines = head.decode('utf-8', 'replace').split('\r\n')
        parts = lines[0].split(' ')
        method = parts[0]
        path = parts[1] if len(parts) > 1 else '/'
        headers = {}
        for l in lines[1:]:
            k, _, v = l.partition(':')
            if k:
                headers[k.strip()] = v.strip()
        host, port = self._peer
        scheme = 'https' if port == 443 else 'http'
        url = '%s://%s%s%s' % (scheme, host, '' if port in (80, 443) else ':%d' % port, path)
        res = _netio.http(method, url, headers, body)
        out = 'HTTP/1.1 %d %s\r\n' % (res['status'], res.get('statusText', ''))
        for k, v in res.get('headers', {}).items():
            out += '%s: %s\r\n' % (_title(k), v)
        out += 'Connection: close\r\n\r\n' + res.get('body', '')
        self._buf = out.encode('utf-8')

    def send(self, data):
        if self._peer is None:
            raise OSError(107, 'Transport endpoint is not connected')
        if isinstance(data, str):
            data = data.encode('utf-8')
        self._out += bytes(data)
        head, sep, body = self._out.partition(b'\r\n\r\n')
        if sep:
            n = 0
            for l in head.split(b'\r\n'):
                if l.lower().startswith(b'content-length:'):
                    n = int(l.split(b':')[1])
            if len(body) >= n:
                self._flush()
        return len(data)

    def sendall(self, data):
        self.send(data)

    def recv(self, n=1024):
        if self._out:
            self._flush()
        d = self._buf[:n]
        self._buf = self._buf[n:]
        return d

    def recv_into(self, buf, n=0):
        d = self.recv(n or len(buf))
        buf[:len(d)] = d
        return len(d)

    def sendto(self, data, addr):
        return len(data)

    def recvfrom(self, n=1024):
        return self.recv(n), self._peer

    def makefile(self, mode='rb', *a, **k):
        return self

    def read(self, n=-1):
        return self.recv(n if n and n > 0 else 100000)

    def readline(self):
        if self._out:
            self._flush()
        i = self._buf.find(b'\n')
        j = len(self._buf) if i < 0 else i + 1
        d = self._buf[:j]
        self._buf = self._buf[j:]
        return d

    def write(self, data):
        return self.send(data)

    def shutdown(self, how):
        pass

    def close(self):
        if self._closed:
            return
        self._closed = True
        if self._listening and self._port is not None:
            J.net_unlisten(self._port)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


def create_connection(addr, timeout=None, **kw):
    s = socket()
    s.connect(addr)
    return s
