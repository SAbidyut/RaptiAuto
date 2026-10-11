# http.server on the simulated network: a web server on the Raspberry Pi, reachable from Chromium
# (http://localhost:8000/) and from other devices (http://<pi ip>:8000/).
#     from http.server import HTTPServer, BaseHTTPRequestHandler
#     class H(BaseHTTPRequestHandler):
#         def do_GET(self):
#             self.send_response(200); self.send_header("Content-Type", "text/html"); self.end_headers()
#             self.wfile.write(b"<h1>Hello</h1>")
#     HTTPServer(("", 8000), H).serve_forever()
import json
import time
import _rpi_js as J
import _netio
from urllib.parse import urlparse

_REASON = {200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 400: 'Bad Request',
           401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 500: 'Internal Server Error'}


class _Headers:
    def __init__(self, d):
        self._d = {}
        for k, v in d.items():
            self._d[k.lower()] = v

    def get(self, k, default=None):
        return self._d.get(k.lower(), default)

    def __getitem__(self, k):
        return self._d[k.lower()]

    def __contains__(self, k):
        return k.lower() in self._d

    def items(self):
        return self._d.items()

    def keys(self):
        return self._d.keys()

    def get_content_type(self):
        return self._d.get('content-type', 'text/plain').split(';')[0]


class _In:
    def __init__(self, b):
        self._b = b
        self._p = 0

    def read(self, n=-1):
        if n is None or n < 0:
            d = self._b[self._p:]
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


class _Out:
    def __init__(self):
        self.data = b''

    def write(self, b):
        if isinstance(b, str):
            b = b.encode('utf-8')
        self.data += bytes(b)
        return len(b)

    def flush(self):
        pass


class BaseHTTPRequestHandler:
    server_version = 'BaseHTTP/0.6'
    sys_version = 'Python/3.11'
    protocol_version = 'HTTP/1.0'
    default_request_version = 'HTTP/0.9'

    def __init__(self, info, server):
        self.server = server
        self.client_address = ('192.168.1.2', 50000)
        self.command = info.get('method', 'GET')
        self.path = info.get('path', '/')
        self.request_version = 'HTTP/1.1'
        self.headers = _Headers(info.get('headers') or {})
        self.rfile = _In(info.get('body', '').encode('utf-8'))
        self.wfile = _Out()
        self._status = 200
        self._hdrs = []
        self._head_done = False
        self.requestline = '%s %s HTTP/1.1' % (self.command, self.path)

    def send_response(self, code, message=None):
        self._status = code
        self._msg = message

    def send_response_only(self, code, message=None):
        self._status = code

    def send_header(self, k, v):
        self._hdrs.append((k, str(v)))

    def end_headers(self):
        self._head_done = True

    def send_error(self, code, message=None, explain=None):
        msg = message or _REASON.get(code, '')
        body = '<!DOCTYPE HTML><html><head><title>Error response</title></head><body><h1>Error response</h1><p>Error code: %d</p><p>Message: %s.</p></body></html>' % (code, msg)
        self.send_response(code, msg)
        self.send_header('Content-Type', 'text/html;charset=utf-8')
        self.end_headers()
        self.wfile.write(body.encode('utf-8'))

    def log_message(self, fmt, *args):
        print('%s - - [%s] %s' % (self.client_address[0], time.strftime('%d/%b/%Y %H:%M:%S'), fmt % args))

    def log_request(self, code='-', size='-'):
        self.log_message('"%s" %s %s', self.requestline, str(code), str(size))

    def date_time_string(self, ts=None):
        return time.strftime('%a, %d %b %Y %H:%M:%S GMT')

    def address_string(self):
        return self.client_address[0]

    def handle_one(self):
        m = getattr(self, 'do_' + self.command, None)
        if m is None:
            self.send_error(501, 'Unsupported method (%r)' % self.command)
        else:
            try:
                m()
            except Exception as e:
                import sys
                sys.print_exception(e)
                if not self.wfile.data:
                    self.send_error(500, 'Internal Server Error')
        self.log_request(self._status)

    def respond(self, rid):
        hdrs = {}
        for k, v in self._hdrs:
            hdrs[k.lower()] = v
        J.net_respond(rid, self._status, json.dumps(hdrs), self.wfile.data.decode('utf-8', 'replace'))


class SimpleHTTPRequestHandler(BaseHTTPRequestHandler):
    """Serves the files of the current folder."""
    def do_GET(self):
        import os
        path = urlparse(self.path).path
        fs = '.' + path
        if fs.endswith('/'):
            if 'index.html' in os.listdir(fs):
                fs += 'index.html'
            else:
                names = sorted(os.listdir(fs))
                body = '<!DOCTYPE HTML><html><head><title>Directory listing for %s</title></head><body><h1>Directory listing for %s</h1><hr><ul>%s</ul><hr></body></html>' % (path, path, ''.join('<li><a href="%s%s">%s</a></li>' % (path, n, n) for n in names))
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(body.encode('utf-8'))
                return
        try:
            with open(fs, 'rb') as f:
                data = f.read()
        except OSError:
            self.send_error(404, 'File not found')
            return
        ctype = 'text/html' if fs.endswith('.html') else 'text/css' if fs.endswith('.css') else 'application/javascript' if fs.endswith('.js') else 'application/json' if fs.endswith('.json') else 'text/plain'
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class HTTPServer:
    allow_reuse_address = True

    def __init__(self, server_address, RequestHandlerClass, bind_and_activate=True):
        self.server_address = (server_address[0] or '0.0.0.0', server_address[1])
        self.server_name = 'raspberrypi'
        self.server_port = server_address[1]
        self.RequestHandlerClass = RequestHandlerClass
        self._stop = False
        self._bg = None
        if bind_and_activate:
            r = J.net_listen(self.server_port)
            if r == -1:
                raise OSError(98, 'Address already in use')
            if r == 0:
                raise OSError(101, 'Network is unreachable (the Pi has no Wi-Fi / network connection)')

    def _serve_one(self):
        rid = J.net_accept(self.server_port)
        if not rid:
            return False
        info = json.loads(J.net_req(rid))
        h = self.RequestHandlerClass(info, self)
        h.handle_one()
        h.respond(rid)
        return True

    def handle_request(self):
        while not self._serve_one():
            time.sleep(0.02)

    def serve_forever(self, poll_interval=0.5):
        self._stop = False
        if _netio.BG[0]:
            import _rpi_hw
            self._bg = _rpi_hw.every(20, self._serve_one)
            return
        while not self._stop:
            if not self._serve_one():
                time.sleep(0.02)

    def shutdown(self):
        self._stop = True
        if self._bg:
            import _rpi_hw
            _rpi_hw.stop(self._bg)
            self._bg = None

    def server_close(self):
        J.net_unlisten(self.server_port)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.server_close()


ThreadingHTTPServer = HTTPServer
