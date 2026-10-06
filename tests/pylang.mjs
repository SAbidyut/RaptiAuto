// MicroPython interpreter tests: language semantics (no hardware) and a few engine-level checks.
import { PyRunner } from '../web/src/sim/py/runner.js';

let failed = 0;
function run(code, { expect, error, hw = null, board = null, maxMs = 20000 } = {}) {
  let out = '';
  const r = new PyRunner({ code, board, hw, print: (t) => { out += t; } });
  const c = r.compile();
  if (!c.ok) {
    if (error && c.error.message.includes(error)) return;
    console.log('✗ compile error', c.error.message, 'line', c.error.line, '\n' + code.slice(0, 200)); failed++; return;
  }
  r.start();
  let status = 'ok';
  const t0 = Date.now();
  while (status === 'ok' && r.rt.t < maxMs * 1000 && Date.now() - t0 < 5000) status = r.step(r.rt.t + 100000, 50);
  if (error) {
    if (status === 'error' && r.error.message.includes(error)) { console.log('✓', error); return; }
    console.log('✗ expected error', error, 'got', status, r.error && r.error.message, JSON.stringify(out)); failed++; return;
  }
  if (status === 'error') { console.log('✗ runtime error:', r.error.message, 'line', r.error.line, '\n' + out); failed++; return; }
  if (expect !== undefined && out !== expect) { console.log('✗ expected', JSON.stringify(expect), 'got', JSON.stringify(out)); failed++; return; }
  console.log('✓', JSON.stringify(out.slice(0, 50)));
}

run('print("hello", 1+2, 3/2, 4/2, 7//2, -7//2, 7%3, -7%3, 2**10, 2**-1)', { expect: 'hello 3 1.5 2.0 3 -4 1 2 1024 0.5\n' });
run('print(0.1+0.2, 1/3, 3.14159265, 1e16, 1e-5, 123456789.0, float("2.50"))', { expect: '0.3 0.3333333 3.141593 1e+16 1e-05 123456792.0 2.5\n'.replace('123456792.0', '123456800.0') });
run(`
x = [1, 2, 3]
x.append(4)
d = {"a": 1, "b": 2}
d["c"] = 3
print(x, d, len(x), len(d), x[-1], x[1:3], x[::-1])
print(sorted(d), list(d.items()), "b" in d, 5 in x)
t = (1, 2, 3)
a, b, c = t
print(a, b, c, t, (1,), ())
`, { expect: "[1, 2, 3, 4] {'a': 1, 'b': 2, 'c': 3} 4 3 4 [2, 3] [4, 3, 2, 1]\n['a', 'b', 'c'] [('a', 1), ('b', 2), ('c', 3)] True False\n1 2 3 (1, 2, 3) (1,) ()\n" });
run(`
def fib(n):
    return n if n < 2 else fib(n-1) + fib(n-2)
print(fib(15))
def f(a, b=2, *args, c=3, **kw):
    return (a, b, args, c, kw)
print(f(1), f(1, 5, 6, 7, c=9, z=1))
sq = lambda v: v * v
print(list(map(sq, range(5))), [i*i for i in range(6) if i % 2 == 0], {i: i*2 for i in range(3)})
`, { expect: "610\n(1, 2, (), 3, {}) (1, 5, (6, 7), 9, {'z': 1})\n[0, 1, 4, 9, 16] [0, 4, 16] {0: 0, 1: 2, 2: 4}\n" });
run(`
class Animal:
    count = 0
    def __init__(self, name):
        self.name = name
        Animal.count += 1
    def speak(self):
        return self.name + " makes a sound"
    def __str__(self):
        return "Animal(" + self.name + ")"
class Dog(Animal):
    def __init__(self, name):
        super().__init__(name)
        self.tricks = []
    def speak(self):
        return super().speak() + ": woof"
    @property
    def n(self):
        return len(self.tricks)
d = Dog("Rex")
d.tricks.append("sit")
print(d.speak(), d, Animal.count, d.n, isinstance(d, Animal), isinstance(d, Dog), isinstance(5, int), isinstance("a", (int, str)))
`, { expect: 'Rex makes a sound: woof Animal(Rex) 1 1 True True True True\n' });
run(`
try:
    x = 1 / 0
except ZeroDivisionError as e:
    print("caught", e)
finally:
    print("fin")
try:
    {}["k"]
except KeyError as e:
    print("key", e)
try:
    int("abc")
except (ValueError, TypeError) as e:
    print("val")
class MyErr(Exception):
    pass
try:
    raise MyErr("boom")
except Exception as e:
    print(type(e).__name__, e, e.args)
`, { expect: "caught divide by zero\nfin\nkey 'k'\nval\nMyErr boom ('boom',)\n" });
run(`
def counter():
    n = 0
    def inc():
        nonlocal n
        n += 1
        return n
    return inc
c = counter()
c(); c()
print(c())
g = 10
def setg():
    global g
    g = 20
setg()
print(g)
print(f"{3.14159:.2f} {42:05d} {'x':>4} {255:#x} {1234567:,} {g=}")
print("%d items, %s, %5.1f%%" % (3, "ok", 99.5), "{} and {:>3}".format("a", 7), "{0}{0}".format("z"))
`, { expect: '3\n20\n3.14 00042    x 0xff 1,234,567 g=20\n3 items, ok,  99.5% a and   7 zz\n' });
run(`
s = "Hello, World"
print(s.upper(), s.lower(), s.split(", "), s.replace("l", "L"), s[::-1], s.find("W"), "-".join(["a","b"]), s.startswith("He"))
print("  x ".strip(), "a,b".split(","), "abc".center(7, "*"), str(12) + "3", int("12") + 1, float("1.5") * 2, bool(0), bool("a"))
print(min(3,1,2), max([4,9,2]), sum(range(5)), abs(-3), round(2.5), round(3.5), round(2.675, 2), divmod(7, 2), hex(255), bin(5), chr(65), ord("a"))
`, { expect: "HELLO, WORLD hello, world ['Hello', 'World'] HeLLo, WorLd dlroW ,olleH 7 a-b True\nx ['a', 'b'] **abc** 123 13 3.0 False True\n1 9 10 3 2 4 2.67 (3, 1) 0xff 0b101 A 97\n" });
run(`
import time
t0 = time.ticks_ms()
time.sleep(1.5)
time.sleep_ms(500)
dt = time.ticks_diff(time.ticks_ms(), t0)
print(dt)
for i in range(3):
    time.sleep_us(1000)
print(time.ticks_diff(time.ticks_us(), 0) > 2000000)
`, { expect: '2000\nTrue\n' });
run(`
import math, random
print(math.sqrt(16), math.pi, math.floor(2.7), math.ceil(2.1), round(math.sin(math.pi/2), 3), math.isnan(float("nan")))
random.seed(5)
r = [random.randint(1, 6) for _ in range(100)]
print(min(r) >= 1, max(r) <= 6, len(set(r)))
`, { expect: '4.0 3.141593 2 3 1.0 True\nTrue True 6\n' });
run('while True:\n    pass\n', { expect: '', maxMs: 50 });
run('x = [1,2,3]\nprint(x[5])', { error: 'IndexError: list index out of range' });
run('print(undefined_name)', { error: "NameError: name 'undefined_name' isn't defined" });
run('x = 1 +', { error: 'SyntaxError' });
run('def f(:\n  pass', { error: 'SyntaxError' });
run('import nosuchmod', { error: 'ImportError' });
run('def f(n):\n    return f(n+1)\nf(0)', { error: 'maximum recursion depth exceeded' });
run('print("a" + 1)', { error: 'TypeError' });
run(`
x = 5
def f():
    print(x)
    x = 3
f()
`, { error: 'UnboundLocalError' });
run(`
nums = [5, 3, 9, 1]
nums.sort()
print(nums, sorted(nums, reverse=True), sorted(["b", "A", "c"], key=lambda s: s.lower()))
words = "the quick brown fox".split()
print({w: len(w) for w in words}, [w for w in words if len(w) > 3], list(enumerate("ab")), list(zip([1,2],[3,4])))
a = [1,2,3]; b = a; b.append(4); print(a, a is b, a == [1,2,3,4])
print(any([0, 1]), all([1, 0]), list(reversed([1,2,3])), tuple([1,2]), set([1,1,2]) == {1,2})
i = 0
while i < 10:
    i += 1
    if i == 3: continue
    if i == 6: break
else:
    print("no")
print(i)
for k in range(2):
    pass
else:
    print("for-else")
print(not None, None is None, 1 < 2 < 3, 1 if 0 else 2, [] or "x", 0 and 1)
`, { expect: "[1, 3, 5, 9] [9, 5, 3, 1] ['A', 'b', 'c']\n{'the': 3, 'quick': 5, 'brown': 5, 'fox': 3} ['quick', 'brown'] [(0, 'a'), (1, 'b')] [(1, 3), (2, 4)]\n[1, 2, 3, 4] True True\nTrue False [3, 2, 1] (1, 2) True\n6\nfor-else\nTrue True True 2 x 0\n" });
run('print(list(range(10, 0, -3)), len(range(180, -1, -5)), list(range(5, 5)), list(range(3, 0)), list(range(0, 10, 4)), range(4)[2], 7 in range(10))', { expect: '[10, 7, 4, 1] 37 [] [] [0, 4, 8] 2 True\n' });
console.log(failed ? `\n${failed} FAILED` : '\nall python language tests passed');
process.exit(failed ? 1 : 0);
