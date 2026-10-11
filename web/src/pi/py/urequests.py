# urequests (MicroPython): the same calls as requests with the small Response of MicroPython.
#     import urequests
#     r = urequests.get(url); print(r.text); r.close()
import requests as _r

Response = _r.Response


def request(method, url, data=None, json=None, headers=None, stream=None, parse_headers=True, **kw):
    return _r.request(method, url, data=data, json=json, headers=headers)


def get(url, **kw):
    return request('GET', url, **kw)


def post(url, **kw):
    return request('POST', url, **kw)


def put(url, **kw):
    return request('PUT', url, **kw)


def patch(url, **kw):
    return request('PATCH', url, **kw)


def delete(url, **kw):
    return request('DELETE', url, **kw)


def head(url, **kw):
    return request('HEAD', url, **kw)
