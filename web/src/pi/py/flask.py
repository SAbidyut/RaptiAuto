# A small Flask for the RaptiAuto virtual Raspberry Pi: routes, request, jsonify, render_template_string,
# redirect. The server answers browsers on the simulated network (Chromium: http://localhost:5000/).
#     from flask import Flask, jsonify
#     app = Flask(__name__)
#     @app.route("/")
#     def home(): return "Hello from the Pi!"
#     app.run(host="0.0.0.0", port=5000)
import json as _json
import time
import _rpi_js as J
import _netio
from urllib.parse import urlparse, parse_qs, unquote_plus


class Headers:
    def __init__(self, d=None):
        self._d = {}
        for k, v in (d or {}).items():
            self._d[k.lower()] = v

    def get(self, k, default=None):
        return self._d.get(k.lower(), default)

    def __getitem__(self, k):
        return self._d[k.lower()]

    def __setitem__(self, k, v):
        self._d[k.lower()] = v

    def __contains__(self, k):
        return k.lower() in self._d

    def items(self):
        return self._d.items()

    def add(self, k, v):
        self._d[k.lower()] = v


class _Args:
    """request.args / request.form: a dict that returns the first value (and has getlist)."""
    def __init__(self, multi):
        self._m = multi

    def get(self, k, default=None, type=None):
        v = self._m.get(k)
        if not v:
            return default
        v = v[0]
        if type is not None:
            try:
                return type(v)
            except Exception:
                return default
        return v

    def getlist(self, k):
        return list(self._m.get(k, []))

    def __getitem__(self, k):
        v = self._m.get(k)
        if not v:
            raise KeyError(k)
        return v[0]

    def __contains__(self, k):
        return k in self._m

    def keys(self):
        return self._m.keys()

    def items(self):
        return [(k, v[0]) for k, v in self._m.items()]

    def to_dict(self):
        return dict(self.items())

    def __iter__(self):
        return iter(self._m)

    def __len__(self):
        return len(self._m)


class Request:
    method = 'GET'
    path = '/'
    args = _Args({})
    form = _Args({})
    values = _Args({})
    headers = Headers()
    data = b''
    host = 'localhost'
    url = ''
    remote_addr = '127.0.0.1'

    def get_json(self, force=False, silent=False):
        try:
            return _json.loads(self.data.decode('utf-8'))
        except Exception:
            if silent:
                return None
            raise

    @property
    def json(self):
        ct = self.headers.get('content-type', '')
        return self.get_json(silent=True) if 'json' in ct else None


request = Request()


class Response:
    def __init__(self, response='', status=200, headers=None, mimetype=None, content_type=None):
        if isinstance(response, (bytes, bytearray)):
            response = bytes(response).decode('utf-8', 'replace')
        self.data = response
        self.status_code = status
        self.headers = Headers(headers)
        ct = content_type or (mimetype and (mimetype + ('; charset=utf-8' if mimetype.startswith('text/') else '')))
        if ct:
            self.headers['content-type'] = ct
        elif 'content-type' not in self.headers:
            self.headers['content-type'] = 'text/html; charset=utf-8'

    @property
    def status(self):
        return '%d' % self.status_code

    @property
    def mimetype(self):
        return self.headers.get('content-type', '').split(';')[0]

    def get_data(self, as_text=False):
        return self.data if as_text else self.data.encode('utf-8')

    def set_cookie(self, *a, **k):
        pass


def make_response(*args):
    return _to_response(args if len(args) > 1 else args[0] if args else '')


def jsonify(*args, **kwargs):
    obj = args[0] if len(args) == 1 else (list(args) if args else kwargs)
    return Response(_json.dumps(obj), 200, mimetype='application/json')


def redirect(location, code=302):
    return Response('Redirecting to ' + location, code, {'Location': location})


class HTTPException(Exception):
    def __init__(self, code, description=''):
        super().__init__(description)
        self.code = code
        self.description = description


def abort(code, description=''):
    raise HTTPException(code, description)


def url_for(endpoint, **values):
    app = _CURRENT[0]
    if endpoint == 'static':
        return '/static/' + values.get('filename', '')
    for rule, (fn, methods, name) in app._rules:
        if name == endpoint:
            url = rule
            for k, v in values.items():
                url = url.replace('<%s>' % k, str(v)).replace('<int:%s>' % k, str(v))
            return url
    return '/'


def escape(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


class Markup(str):
    pass


# ---------------------------------------------------------------- templates (a small Jinja subset)
def _render(src, ctx):
    pos = 0
    toks = []
    while True:
        i = src.find('{', pos)
        while i >= 0 and src[i + 1:i + 2] not in ('{', '%', '#'):
            i = src.find('{', i + 1)
        if i < 0:
            toks.append(('t', src[pos:]))
            break
        toks.append(('t', src[pos:i]))
        kind = src[i + 1]
        end = src.find({'{': '}}', '%': '%}', '#': '#}'}[kind], i + 2)
        if end < 0:
            toks.append(('t', src[i:]))
            break
        toks.append((kind, src[i + 2:end].strip()))
        pos = end + 2
    out, _ = _run(toks, 0, ctx, None)
    return out


def _eval(expr, ctx):
    filt = None
    if '|' in expr and '||' not in expr:
        expr, _, filt = expr.rpartition('|')
        filt = filt.strip()
        expr = expr.strip()
    g = {'len': len, 'range': range, 'str': str, 'int': int, 'float': float, 'round': round, 'abs': abs, 'min': min, 'max': max, 'sum': sum, 'sorted': sorted, 'enumerate': enumerate, 'zip': zip, 'True': True, 'False': False, 'None': None}
    g.update(ctx)
    try:
        v = eval(expr, g)
    except Exception as e:
        v = ''
    if filt:
        if filt == 'safe':
            return Markup(str(v))
        if filt.startswith('round'):
            n = filt[filt.find('(') + 1:filt.find(')')]
            v = round(v, int(n) if n else 0)
        elif filt == 'int':
            v = int(v)
        elif filt == 'upper':
            v = str(v).upper()
        elif filt == 'lower':
            v = str(v).lower()
        elif filt == 'length':
            v = len(v)
        elif filt == 'tojson':
            return Markup(_json.dumps(v))
    return v


def _run(toks, i, ctx, stop):
    out = ''
    while i < len(toks):
        kind, val = toks[i]
        if kind == 't':
            out += val
        elif kind == '{':
            v = _eval(val, ctx)
            out += str(v) if isinstance(v, Markup) else escape(v)
        elif kind == '#':
            pass
        else:
            word = val.split(None, 1)[0] if val else ''
            if stop and word in stop:
                return out, i
            if word == 'for':
                rest = val[3:].strip()
                var, _, it = rest.partition(' in ')
                seq = _eval(it.strip(), ctx)
                names = [v.strip() for v in var.split(',')]
                # find the matching endfor
                depth, j = 1, i + 1
                while j < len(toks):
                    if toks[j][0] == '%':
                        w = toks[j][1].split(None, 1)[0] if toks[j][1] else ''
                        if w == 'for':
                            depth += 1
                        elif w == 'endfor':
                            depth -= 1
                            if depth == 0:
                                break
                    j += 1
                n = 0
                for item in seq:
                    c = dict(ctx)
                    if len(names) == 1:
                        c[names[0]] = item
                    else:
                        for a, b in zip(names, item):
                            c[a] = b
                    c['loop'] = {'index': n + 1, 'index0': n, 'first': n == 0}
                    o, _ = _run(toks[i + 1:j], 0, c, None)
                    out += o
                    n += 1
                i = j
            elif word == 'if':
                # collect branches until endif (nesting aware)
                depth, j, branches, cur_start, cur_cond = 1, i + 1, [], i + 1, val[2:].strip()
                while j < len(toks):
                    if toks[j][0] == '%':
                        w = toks[j][1].split(None, 1)[0] if toks[j][1] else ''
                        if w == 'if':
                            depth += 1
                        elif w == 'endif':
                            depth -= 1
                            if depth == 0:
                                branches.append((cur_cond, toks[cur_start:j]))
                                break
                        elif depth == 1 and w == 'elif':
                            branches.append((cur_cond, toks[cur_start:j]))
                            cur_cond, cur_start = toks[j][1][4:].strip(), j + 1
                        elif depth == 1 and w == 'else':
                            branches.append((cur_cond, toks[cur_start:j]))
                            cur_cond, cur_start = 'True', j + 1
                    j += 1
                for cond, body in branches:
                    if _eval(cond, ctx):
                        o, _ = _run(body, 0, ctx, None)
                        out += o
                        break
                i = j
            elif word == 'set':
                name, _, ex = val[3:].partition('=')
                ctx[name.strip()] = _eval(ex.strip(), ctx)
        i += 1
    return out, i


def render_template_string(source, **context):
    return _render(source, context)


def render_template(name, **context):
    import os
    for d in ('templates', '.'):
        try:
            with open(d + '/' + name) as f:
                return _render(f.read(), context)
        except OSError:
            pass
    raise OSError('TemplateNotFound: ' + name)


_CURRENT = [None]


def _to_response(rv):
    status, headers = 200, None
    if isinstance(rv, tuple):
        if len(rv) == 3:
            rv, status, headers = rv
        elif len(rv) == 2:
            rv, x = rv
            if isinstance(x, int):
                status = x
            else:
                headers = x
    if isinstance(rv, Response):
        if status != 200:
            rv.status_code = status
        if headers:
            for k, v in headers.items():
                rv.headers[k] = v
        return rv
    if isinstance(rv, (dict, list)):
        return Response(_json.dumps(rv), status, headers, mimetype='application/json')
    if rv is None:
        raise TypeError('The view function did not return a valid response. The function either returned None or ended without a return statement.')
    return Response(rv, status, headers)


class Flask:
    def __init__(self, import_name='app', **kw):
        self.name = import_name
        self.config = {}
        self._rules = []
        self._before = []
        self._after = []
        self._errors = {}
        self.debug = False
        self.static_folder = 'static'
        self._stop = False
        self._bg = None
        self._port = 5000
        _CURRENT[0] = self

    def route(self, rule, methods=None, **kw):
        def deco(fn):
            self._rules.append((rule, (fn, [m.upper() for m in (methods or ['GET'])], kw.get('endpoint') or fn.__name__)))
            return fn
        return deco

    def get(self, rule, **kw):
        return self.route(rule, methods=['GET'], **kw)

    def post(self, rule, **kw):
        return self.route(rule, methods=['POST'], **kw)

    def add_url_rule(self, rule, endpoint=None, view_func=None, methods=None, **kw):
        self._rules.append((rule, (view_func, [m.upper() for m in (methods or ['GET'])], endpoint or view_func.__name__)))

    def before_request(self, fn):
        self._before.append(fn)
        return fn

    def after_request(self, fn):
        self._after.append(fn)
        return fn

    def errorhandler(self, code):
        def deco(fn):
            self._errors[code] = fn
            return fn
        return deco

    def _match(self, path):
        for rule, (fn, methods, name) in self._rules:
            rp, pp = rule.strip('/').split('/'), path.strip('/').split('/')
            if len(rp) != len(pp):
                continue
            kw = {}
            ok = True
            for a, b in zip(rp, pp):
                if a.startswith('<') and a.endswith('>'):
                    spec = a[1:-1]
                    conv, _, nm = spec.rpartition(':')
                    b = unquote_plus(b)
                    if conv == 'int':
                        if not b.lstrip('-').isdigit():
                            ok = False
                            break
                        b = int(b)
                    elif conv == 'float':
                        try:
                            b = float(b)
                        except ValueError:
                            ok = False
                            break
                    kw[nm] = b
                elif a != b:
                    ok = False
                    break
            if ok:
                return fn, methods, kw
        return None

    def _dispatch(self, info):
        u = urlparse(info.get('path', '/'))
        method = info.get('method', 'GET')
        req = request
        req.method = method
        req.path = u.path
        req.url = 'http://' + info.get('host', 'localhost') + info.get('path', '/')
        req.host = info.get('host', 'localhost')
        req.args = _Args(parse_qs(u.query))
        body = info.get('body', '')
        req.data = body.encode('utf-8')
        req.headers = Headers(info.get('headers') or {})
        ct = req.headers.get('content-type', '')
        req.form = _Args(parse_qs(body) if 'urlencoded' in ct else {})
        m = {}
        for k in req.args.keys():
            m[k] = req.args._m[k]
        for k in req.form.keys():
            m[k] = req.form._m[k]
        req.values = _Args(m)
        try:
            for fn in self._before:
                r = fn()
                if r is not None:
                    return _to_response(r)
            if u.path.startswith('/static/'):
                try:
                    with open(self.static_folder + u.path[7:]) as f:
                        data = f.read()
                    ctype = 'text/css' if u.path.endswith('.css') else 'application/javascript' if u.path.endswith('.js') else 'text/html' if u.path.endswith('.html') else 'text/plain'
                    return Response(data, 200, mimetype=ctype)
                except OSError:
                    raise HTTPException(404, 'Not Found')
            hit = self._match(u.path)
            if hit is None:
                raise HTTPException(404, 'The requested URL was not found on the server. If you entered the URL manually please check your spelling and try again.')
            fn, methods, kw = hit
            if method not in methods and not (method == 'HEAD' and 'GET' in methods):
                raise HTTPException(405, 'The method is not allowed for the requested URL.')
            resp = _to_response(fn(**kw))
        except HTTPException as e:
            h = self._errors.get(e.code)
            if h:
                resp = _to_response(h(e))
            else:
                names = {404: 'Not Found', 405: 'Method Not Allowed', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 500: 'Internal Server Error'}
                resp = Response('<!doctype html>\n<html lang=en>\n<title>%d %s</title>\n<h1>%s</h1>\n<p>%s</p>\n' % (e.code, names.get(e.code, 'Error'), names.get(e.code, 'Error'), e.description), e.code)
        except Exception as e:
            import sys
            sys.print_exception(e)
            h = self._errors.get(500)
            resp = _to_response(h(e)) if h else Response('<!doctype html>\n<html lang=en>\n<title>500 Internal Server Error</title>\n<h1>Internal Server Error</h1>\n<p>The server encountered an internal error and was unable to complete your request. Either the server is overloaded or there is an error in the application.</p>\n', 500)
        for fn in self._after:
            resp = fn(resp) or resp
        return resp

    def _serve_one(self):
        rid = J.net_accept(self._port)
        if not rid:
            return False
        info = _json.loads(J.net_req(rid))
        resp = self._dispatch(info)
        hdrs = dict(resp.headers.items())
        J.net_respond(rid, resp.status_code, _json.dumps(hdrs), resp.data)
        print('%s - - [%s] "%s %s HTTP/1.1" %d -' % (info.get('from', '192.168.1.2'), time.strftime('%d/%b/%Y %H:%M:%S'), info.get('method', 'GET'), info.get('path', '/'), resp.status_code))
        return True

    def test_client(self):
        return _TestClient(self)

    def run(self, host=None, port=None, debug=None, use_reloader=None, threaded=True, **kw):
        self._port = int(port or 5000)
        r = J.net_listen(self._port)
        if r == -1:
            raise OSError(98, 'Address already in use')
        if r == 0:
            raise OSError(101, 'Network is unreachable (the Pi has no Wi-Fi / network connection)')
        ip = J.net_ip() or '127.0.0.1'
        print(' * Serving Flask app %r' % self.name)
        print(' * Debug mode: %s' % ('on' if debug else 'off'))
        print('WARNING: This is a development server. Do not use it in a production deployment.')
        print(' * Running on all addresses (0.0.0.0)' if host == '0.0.0.0' else ' * Running on http://127.0.0.1:%d' % self._port)
        print(' * Running on http://127.0.0.1:%d' % self._port)
        if host == '0.0.0.0':
            print(' * Running on http://%s:%d' % (ip, self._port))
        print('Press CTRL+C to quit')
        self._stop = False
        if _netio.BG[0]:
            import _rpi_hw
            self._bg = _rpi_hw.every(20, self._serve_one)
            return
        while not self._stop:
            if not self._serve_one():
                time.sleep(0.02)


class _TestClient:
    def __init__(self, app):
        self.app = app

    def open(self, path, method='GET', data=None, json=None, headers=None):
        info = {'method': method, 'path': path, 'host': 'localhost', 'headers': dict(headers or {}), 'body': ''}
        if json is not None:
            info['body'] = _json.dumps(json)
            info['headers']['content-type'] = 'application/json'
        elif data:
            from urllib.parse import urlencode
            info['body'] = urlencode(data)
            info['headers']['content-type'] = 'application/x-www-form-urlencoded'
        return self.app._dispatch(info)

    def get(self, path, **kw):
        return self.open(path, 'GET', **kw)

    def post(self, path, **kw):
        return self.open(path, 'POST', **kw)
