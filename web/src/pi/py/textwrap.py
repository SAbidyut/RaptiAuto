def wrap(text, width=70, **kw):
    lines, cur = [], ''
    for w in text.split():
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + ' ' + w) if cur else w
    if cur:
        lines.append(cur)
    return lines


def fill(text, width=70, **kw):
    return '\n'.join(wrap(text, width))


def shorten(text, width, placeholder=' [...]', **kw):
    t = ' '.join(text.split())
    if len(t) <= width:
        return t
    return t[:max(0, width - len(placeholder))].rstrip() + placeholder


def dedent(text):
    lines = text.split('\n')
    ind = min((len(l) - len(l.lstrip()) for l in lines if l.strip()), default=0)
    return '\n'.join(l[ind:] for l in lines)


def indent(text, prefix):
    return ''.join(prefix + l if l.strip() else l for l in text.splitlines(True))
