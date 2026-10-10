# random: MicroPython's built-in random plus shuffle / sample.
from urandom import *
import urandom as _r


def shuffle(x):
    for i in range(len(x) - 1, 0, -1):
        j = _r.randrange(i + 1)
        x[i], x[j] = x[j], x[i]


def sample(population, k):
    pool = list(population)
    if k > len(pool):
        raise ValueError('Sample larger than population or is negative')
    shuffle(pool)
    return pool[:k]


def choices(population, weights=None, k=1):
    pool = list(population)
    if not weights:
        return [_r.choice(pool) for _ in range(k)]
    total = sum(weights)
    out = []
    for _ in range(k):
        r = _r.random() * total
        acc = 0
        for p, w in zip(pool, weights):
            acc += w
            if r < acc:
                out.append(p)
                break
        else:
            out.append(pool[-1])
    return out
