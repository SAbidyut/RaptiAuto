# gpiozero for the RaptiAuto virtual Raspberry Pi: the commonly used devices with the
# same names and behaviour as gpiozero 2.0 (pins are BCM numbers, "GPIO17", "BOARD11" ...).
import _rpi_js as J
import _rpi_hw as H
import time as _time

__version__ = '2.0.1'

_BOARD = {3: 2, 5: 3, 7: 4, 8: 14, 10: 15, 11: 17, 12: 18, 13: 27, 15: 22, 16: 23, 18: 24, 19: 10, 21: 9, 22: 25,
          23: 11, 24: 8, 26: 7, 27: 0, 28: 1, 29: 5, 31: 6, 32: 12, 33: 13, 35: 19, 36: 16, 37: 26, 38: 20, 40: 21}
_used = {}


class GPIOZeroError(Exception):
    pass


class DeviceClosed(GPIOZeroError):
    pass


class BadPinFactory(GPIOZeroError):
    pass


class PinInvalidPin(GPIOZeroError):
    pass


class GPIOPinInUse(GPIOZeroError):
    pass


class PinFixedPull(GPIOZeroError):
    pass


def _pin(p):
    if isinstance(p, str):
        s = p.upper().strip()
        for pre in ('GPIO', 'BCM'):
            if s.startswith(pre):
                s = s[len(pre):]
                break
        else:
            for pre in ('BOARD', 'J8:', 'P1:'):
                if s.startswith(pre):
                    n = int(s[len(pre):])
                    if n not in _BOARD:
                        raise PinInvalidPin('%s is not a valid pin' % p)
                    return _BOARD[n]
        try:
            p = int(s)
        except ValueError:
            raise PinInvalidPin('%s is not a valid pin name' % p)
    if not isinstance(p, int) or p < 0 or p > 27:
        raise PinInvalidPin('%r is not a valid pin' % (p,))
    return p


class Device:
    def __init__(self):
        self._closed = False
        self._pins = []
        self._handles = []

    def _claim(self, *pins):
        out = []
        for p in pins:
            b = _pin(p)
            if b in _used and _used[b] is not self:
                raise GPIOPinInUse('pin GPIO%d is already in use by %r' % (b, _used[b]))
            _used[b] = self
            J.claim(b, 'zero')
            self._pins.append(b)
            out.append(b)
        return out[0] if len(out) == 1 else out

    def _check(self):
        if self._closed:
            raise DeviceClosed('%s is closed or uninitialized' % self.__class__.__name__)

    def close(self):
        if self._closed:
            return
        for hdl in self._handles:
            H.stop(hdl)
        self._handles = []
        for b in self._pins:
            J.release(b)
            if _used.get(b) is self:
                del _used[b]
        self._closed = True

    @property
    def closed(self):
        return self._closed

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def __repr__(self):
        if self._closed:
            return '<gpiozero.%s object closed>' % self.__class__.__name__
        pins = ', '.join('GPIO%d' % b for b in self._pins)
        return '<gpiozero.%s object on pin %s, is_active=%s>' % (self.__class__.__name__, pins, getattr(self, 'is_active', '?'))

    # gpiozero "source" / "values": led.source = button
    @property
    def values(self):
        def gen():
            while True:
                yield self.value
        return gen()

    @property
    def source(self):
        return getattr(self, '_source', None)

    @source.setter
    def source(self, src):
        hdl = getattr(self, '_src_handle', None)
        if hdl:
            H.stop(hdl)
            if hdl in self._handles:
                self._handles.remove(hdl)
        self._source = src
        self._src_handle = None
        if src is None:
            return
        it = None if hasattr(src, 'value') else iter(src)

        def tick():
            try:
                self.value = src.value if it is None else next(it)
            except StopIteration:
                H.stop(self._src_handle)

        self._src_handle = H.every(10, tick)
        self._handles.append(self._src_handle)


# ------------------------------------------------------------------ outputs
class OutputDevice(Device):
    def __init__(self, pin=None, active_high=True, initial_value=False, pin_factory=None):
        super().__init__()
        if pin is None:
            raise GPIOZeroError('No pin given')
        self.pin = self._claim(pin)
        self.active_high = active_high
        J.setup(self.pin, 'out', 'none')
        self._v = 0
        if initial_value is not None:
            self._write(1 if initial_value else 0)

    def _write(self, v):
        self._check()
        self._v = v
        J.stop_bg(self.pin)
        J.write(self.pin, v if self.active_high else 1 - v)

    def on(self):
        self._write(1)

    def off(self):
        self._write(0)

    def toggle(self):
        self._write(0 if self.value else 1)

    @property
    def value(self):
        lvl = J.level(self.pin)
        return lvl if self.active_high else 1 - lvl

    @value.setter
    def value(self, v):
        self._write(1 if v else 0)

    @property
    def is_active(self):
        return bool(self.value)


class DigitalOutputDevice(OutputDevice):
    def blink(self, on_time=1, off_time=1, n=None, background=True):
        self._check()
        on = 1 if self.active_high else 0
        J.blink(self.pin, float(on_time), float(off_time), int(n or 0), on, 1 - on, 0.0, 0.0)
        if not background:
            if n is None:
                while True:
                    _time.sleep(1)
            _time.sleep((on_time + off_time) * n)


class LED(DigitalOutputDevice):
    @property
    def is_lit(self):
        return self.is_active


class Buzzer(DigitalOutputDevice):
    def beep(self, on_time=1, off_time=1, n=None, background=True):
        self.blink(on_time, off_time, n, background)


class PWMOutputDevice(OutputDevice):
    def __init__(self, pin=None, active_high=True, initial_value=0, frequency=100, pin_factory=None):
        self._freq = float(frequency)
        self._d = 0.0
        super().__init__(pin, active_high, None)
        self.value = initial_value

    def _write(self, v):
        self._set(float(v))

    def _set(self, v):
        self._check()
        if not 0 <= v <= 1:
            raise ValueError('PWM value must be between 0 and 1')
        self._d = v
        J.stop_bg(self.pin)
        J.pwm(self.pin, self._freq, v if self.active_high else 1 - v)

    @property
    def value(self):
        d = J.duty(self.pin)
        return d if self.active_high else 1 - d

    @value.setter
    def value(self, v):
        self._set(float(v))

    def on(self):
        self._set(1.0)

    def off(self):
        self._set(0.0)

    def toggle(self):
        self._set(1 - self.value)

    @property
    def frequency(self):
        return self._freq

    @frequency.setter
    def frequency(self, f):
        self._freq = float(f)
        self._set(self._d)

    @property
    def is_active(self):
        return self.value > 0

    def blink(self, on_time=1, off_time=1, fade_in_time=0, fade_out_time=0, n=None, background=True):
        self._check()
        on, off = (1.0, 0.0) if self.active_high else (0.0, 1.0)
        J.pwm(self.pin, self._freq, off)
        J.blink(self.pin, float(on_time), float(off_time), int(n or 0), on, off, float(fade_in_time), float(fade_out_time))
        if not background:
            if n is None:
                while True:
                    _time.sleep(1)
            _time.sleep((on_time + off_time + fade_in_time + fade_out_time) * n)

    def pulse(self, fade_in_time=1, fade_out_time=1, n=None, background=True):
        self.blink(0, 0, fade_in_time, fade_out_time, n, background)


class PWMLED(PWMOutputDevice):
    @property
    def is_lit(self):
        return self.is_active


class TonalBuzzer(Device):
    def __init__(self, pin=None, initial_value=None, mid_tone=440, octaves=1, pin_factory=None):
        super().__init__()
        self.pin = self._claim(pin)
        self.mid_tone = mid_tone
        J.setup(self.pin, 'out', 'none')
        if initial_value is not None:
            self.play(initial_value)

    def play(self, tone):
        f = float(tone) if isinstance(tone, (int, float)) else 440.0
        J.pwm(self.pin, f, 0.5)

    def stop(self):
        J.pwm_off(self.pin)

    @property
    def is_active(self):
        return J.duty(self.pin) > 0


class RGBLED(Device):
    def __init__(self, red=None, green=None, blue=None, active_high=True, initial_value=(0, 0, 0), pwm=True, pin_factory=None):
        super().__init__()
        self._leds = [PWMLED(p, active_high) if pwm else LED(p, active_high) for p in (red, green, blue)]
        self.red_led, self.green_led, self.blue_led = self._leds
        self._pins = []
        self.color = initial_value

    def close(self):
        for led in self._leds:
            led.close()
        self._closed = True

    @property
    def value(self):
        return tuple(led.value for led in self._leds)

    @value.setter
    def value(self, v):
        for led, x in zip(self._leds, v):
            led.value = x

    color = value

    @property
    def red(self):
        return self._leds[0].value

    @red.setter
    def red(self, v):
        self._leds[0].value = v

    @property
    def green(self):
        return self._leds[1].value

    @green.setter
    def green(self, v):
        self._leds[1].value = v

    @property
    def blue(self):
        return self._leds[2].value

    @blue.setter
    def blue(self, v):
        self._leds[2].value = v

    @property
    def is_active(self):
        return self.value != (0, 0, 0)

    is_lit = is_active

    def on(self):
        self.value = (1, 1, 1)

    def off(self):
        self.value = (0, 0, 0)

    def toggle(self):
        self.value = tuple(1 - x for x in self.value)

    def blink(self, on_time=1, off_time=1, fade_in_time=0, fade_out_time=0, on_color=(1, 1, 1), off_color=(0, 0, 0), n=None, background=True):
        for led, a, b in zip(self._leds, on_color, off_color):
            J.pwm(led.pin, 100.0, float(b))
            J.blink(led.pin, float(on_time), float(off_time), int(n or 0), float(a), float(b), float(fade_in_time), float(fade_out_time))
        if not background and n:
            _time.sleep((on_time + off_time + fade_in_time + fade_out_time) * n)

    def pulse(self, fade_in_time=1, fade_out_time=1, on_color=(1, 1, 1), off_color=(0, 0, 0), n=None, background=True):
        self.blink(0, 0, fade_in_time, fade_out_time, on_color, off_color, n, background)


class Motor(Device):
    def __init__(self, forward=None, backward=None, enable=None, pwm=True, pin_factory=None):
        super().__init__()
        self.forward_device = PWMOutputDevice(forward) if pwm else DigitalOutputDevice(forward)
        self.backward_device = PWMOutputDevice(backward) if pwm else DigitalOutputDevice(backward)
        self.enable_device = DigitalOutputDevice(enable, initial_value=True) if enable is not None else None

    def close(self):
        for d in (self.forward_device, self.backward_device, self.enable_device):
            if d:
                d.close()
        self._closed = True

    @property
    def value(self):
        return self.forward_device.value - self.backward_device.value

    @value.setter
    def value(self, v):
        if v > 0:
            self.forward(v)
        elif v < 0:
            self.backward(-v)
        else:
            self.stop()

    @property
    def is_active(self):
        return self.value != 0

    def forward(self, speed=1):
        self.backward_device.off()
        self.forward_device.value = speed

    def backward(self, speed=1):
        self.forward_device.off()
        self.backward_device.value = speed

    def reverse(self):
        self.value = -self.value

    def stop(self):
        self.forward_device.off()
        self.backward_device.off()


class PhaseEnableMotor(Device):
    def __init__(self, phase=None, enable=None, pwm=True, pin_factory=None):
        super().__init__()
        self.phase_device = DigitalOutputDevice(phase)
        self.enable_device = PWMOutputDevice(enable) if pwm else DigitalOutputDevice(enable)

    def forward(self, speed=1):
        self.phase_device.off()
        self.enable_device.value = speed

    def backward(self, speed=1):
        self.phase_device.on()
        self.enable_device.value = speed

    def stop(self):
        self.enable_device.off()

    @property
    def value(self):
        return -self.enable_device.value if self.phase_device.value else self.enable_device.value

    @value.setter
    def value(self, v):
        if v >= 0:
            self.forward(v)
        else:
            self.backward(-v)


class Robot(Device):
    def __init__(self, left=None, right=None, pwm=True, pin_factory=None):
        super().__init__()
        self.left_motor = Motor(*left, pwm=pwm)
        self.right_motor = Motor(*right, pwm=pwm)

    def forward(self, speed=1, curve_left=0, curve_right=0):
        self.left_motor.forward(speed * (1 - curve_left))
        self.right_motor.forward(speed * (1 - curve_right))

    def backward(self, speed=1, curve_left=0, curve_right=0):
        self.left_motor.backward(speed * (1 - curve_left))
        self.right_motor.backward(speed * (1 - curve_right))

    def left(self, speed=1):
        self.right_motor.forward(speed)
        self.left_motor.backward(speed)

    def right(self, speed=1):
        self.left_motor.forward(speed)
        self.right_motor.backward(speed)

    def stop(self):
        self.left_motor.stop()
        self.right_motor.stop()

    @property
    def value(self):
        return (self.left_motor.value, self.right_motor.value)


class Servo(Device):
    def __init__(self, pin=None, initial_value=0, min_pulse_width=1 / 1000, max_pulse_width=2 / 1000, frame_width=20 / 1000, pin_factory=None):
        super().__init__()
        self.pin = self._claim(pin)
        self.min_pulse_width = min_pulse_width
        self.max_pulse_width = max_pulse_width
        self.frame_width = frame_width
        J.setup(self.pin, 'out', 'none')
        self._value = None
        self.value = initial_value

    @property
    def pulse_width(self):
        if self._value is None:
            return None
        return self.min_pulse_width + (self._value + 1) / 2 * (self.max_pulse_width - self.min_pulse_width)

    @property
    def value(self):
        return self._value

    @value.setter
    def value(self, v):
        self._check()
        if v is None:
            self._value = None
            J.pwm_off(self.pin)
            return
        if not -1 <= v <= 1:
            raise ValueError('Servo value must be between -1 and 1, or None')
        self._value = float(v)
        J.pwm(self.pin, 1 / self.frame_width, self.pulse_width / self.frame_width)

    def min(self):
        self.value = -1

    def mid(self):
        self.value = 0

    def max(self):
        self.value = 1

    def detach(self):
        self.value = None

    @property
    def is_active(self):
        return self._value is not None


class AngularServo(Servo):
    def __init__(self, pin=None, initial_angle=0, min_angle=-90, max_angle=90, min_pulse_width=1 / 1000, max_pulse_width=2 / 1000, frame_width=20 / 1000, pin_factory=None):
        self.min_angle = min_angle
        self.max_angle = max_angle
        super().__init__(pin, self._a2v(initial_angle) if initial_angle is not None else None, min_pulse_width, max_pulse_width, frame_width)

    def _a2v(self, a):
        return (a - self.min_angle) / (self.max_angle - self.min_angle) * 2 - 1

    @property
    def angle(self):
        if self._value is None:
            return None
        return self.min_angle + (self._value + 1) / 2 * (self.max_angle - self.min_angle)

    @angle.setter
    def angle(self, a):
        self.value = None if a is None else self._a2v(a)


class LEDBoard(Device):
    def __init__(self, *pins, pwm=False, active_high=True, initial_value=False, pin_factory=None, **named):
        super().__init__()
        cls = PWMLED if pwm else LED
        self.leds = tuple(cls(p, active_high) for p in pins) + tuple(cls(p, active_high) for p in named.values())
        for k, led in zip(named.keys(), self.leds[len(pins):]):
            setattr(self, k, led)
        self.value = tuple(initial_value for _ in self.leds) if not isinstance(initial_value, tuple) else initial_value

    def __getitem__(self, i):
        return self.leds[i]

    def __len__(self):
        return len(self.leds)

    def __iter__(self):
        return iter(self.leds)

    def close(self):
        for led in self.leds:
            led.close()
        self._closed = True

    @property
    def value(self):
        return tuple(led.value for led in self.leds)

    @value.setter
    def value(self, v):
        for led, x in zip(self.leds, v):
            led.value = x

    def on(self, *idx):
        for i, led in enumerate(self.leds):
            if not idx or i in idx:
                led.on()

    def off(self, *idx):
        for i, led in enumerate(self.leds):
            if not idx or i in idx:
                led.off()

    def toggle(self, *idx):
        for i, led in enumerate(self.leds):
            if not idx or i in idx:
                led.toggle()

    def blink(self, on_time=1, off_time=1, n=None, background=True):
        for led in self.leds:
            led.blink(on_time, off_time, n, True)
        if not background and n:
            _time.sleep((on_time + off_time) * n)

    @property
    def is_active(self):
        return any(self.value)


class LEDBarGraph(LEDBoard):
    @property
    def value(self):
        return sum(led.value for led in self.leds) / len(self.leds)

    @value.setter
    def value(self, v):
        n = len(self.leds)
        for i, led in enumerate(self.leds):
            led.value = 1 if v * n >= i + 1 else 0


class TrafficLights(Device):
    def __init__(self, red=None, amber=None, green=None, pwm=False, initial_value=False, yellow=None, pin_factory=None):
        super().__init__()
        cls = PWMLED if pwm else LED
        if amber is None:
            amber = yellow
        self.red = cls(red)
        self.amber = cls(amber)
        self.yellow = self.amber
        self.green = cls(green)
        self.leds = (self.red, self.amber, self.green)

    def close(self):
        for led in self.leds:
            led.close()
        self._closed = True

    @property
    def value(self):
        return tuple(led.value for led in self.leds)

    @value.setter
    def value(self, v):
        for led, x in zip(self.leds, v):
            led.value = x

    def on(self):
        self.value = (1, 1, 1)

    def off(self):
        self.value = (0, 0, 0)


# ------------------------------------------------------------------ inputs
class InputDevice(Device):
    def __init__(self, pin=None, pull_up=False, active_state=None, pin_factory=None):
        super().__init__()
        if pin is None:
            raise GPIOZeroError('No pin given')
        self.pin = self._claim(pin)
        self.pull_up = pull_up
        J.setup(self.pin, 'in', 'up' if pull_up is True else ('down' if pull_up is False else 'none'))
        self._active_low = bool(pull_up) if active_state is None else not active_state

    @property
    def value(self):
        self._check()
        v = J.read(self.pin)
        return 1 - v if self._active_low else v

    @property
    def is_active(self):
        return bool(self.value)


class DigitalInputDevice(InputDevice):
    def __init__(self, pin=None, pull_up=False, active_state=None, bounce_time=None, pin_factory=None):
        super().__init__(pin, pull_up, active_state)
        self.bounce_time = bounce_time
        self._when_act = None
        self._when_deact = None
        self._cid = H.register(self._edge)
        J.watch(self.pin, 'both', int((bounce_time or 0) * 1000))
        J.watch_cb(self.pin, self._cid)
        self._t_act = None

    def close(self):
        if not self._closed:
            J.unwatch(self.pin)
            H.unregister(self._cid)
        super().close()

    def _edge(self, level):
        active = (1 - level if self._active_low else level) == 1
        if active:
            self._t_act = _time.ticks_ms()
            if self._when_act:
                H.call(self._when_act, self)
        else:
            self._t_act = None
            if self._when_deact:
                H.call(self._when_deact, self)

    @property
    def when_activated(self):
        return self._when_act

    @when_activated.setter
    def when_activated(self, fn):
        self._when_act = fn

    @property
    def when_deactivated(self):
        return self._when_deact

    @when_deactivated.setter
    def when_deactivated(self, fn):
        self._when_deact = fn

    def wait_for_active(self, timeout=None):
        return self._wait(True, timeout)

    def wait_for_inactive(self, timeout=None):
        return self._wait(False, timeout)

    def _wait(self, state, timeout):
        t0 = _time.ticks_ms()
        while self.is_active != state:
            if timeout is not None and _time.ticks_diff(_time.ticks_ms(), t0) >= timeout * 1000:
                return False
            _time.sleep_ms(5)
        return True

    @property
    def active_time(self):
        if self._t_act is None:
            return None
        return _time.ticks_diff(_time.ticks_ms(), self._t_act) / 1000


class SmoothedInputDevice(DigitalInputDevice):
    pass


class Button(DigitalInputDevice):
    def __init__(self, pin=None, pull_up=True, active_state=None, bounce_time=None, hold_time=1, hold_repeat=False, pin_factory=None):
        super().__init__(pin, pull_up, active_state, bounce_time)
        self.hold_time = hold_time
        self.hold_repeat = hold_repeat
        self._when_held = None
        self._hold_handle = None

    def _edge(self, level):
        super()._edge(level)
        if self._hold_handle:
            H.stop(self._hold_handle)
            self._hold_handle = None
        if self.is_active and self._when_held:
            t0 = _time.ticks_ms()
            fired = [0]

            def chk():
                if not self.is_active:
                    H.stop(self._hold_handle)
                    self._hold_handle = None
                    return
                # when_held after hold_time, then (hold_repeat) once every further hold_time
                n = fired[0]
                if (n == 0 or self.hold_repeat) and _time.ticks_diff(_time.ticks_ms(), t0) >= self.hold_time * 1000 * (n + 1):
                    fired[0] = n + 1
                    H.call(self._when_held, self)

            self._hold_handle = H.every(20, chk)

    is_pressed = property(lambda self: self.is_active)
    is_held = property(lambda self: self.is_active and self.active_time is not None and self.active_time >= self.hold_time)
    held_time = property(lambda self: self.active_time)
    pressed_time = held_time

    @property
    def when_pressed(self):
        return self._when_act

    @when_pressed.setter
    def when_pressed(self, fn):
        self._when_act = fn

    @property
    def when_released(self):
        return self._when_deact

    @when_released.setter
    def when_released(self, fn):
        self._when_deact = fn

    @property
    def when_held(self):
        return self._when_held

    @when_held.setter
    def when_held(self, fn):
        self._when_held = fn

    def wait_for_press(self, timeout=None):
        return self.wait_for_active(timeout)

    def wait_for_release(self, timeout=None):
        return self.wait_for_inactive(timeout)


class MotionSensor(DigitalInputDevice):
    def __init__(self, pin=None, pull_up=False, active_state=None, queue_len=1, sample_rate=10, threshold=0.5, partial=False, pin_factory=None):
        super().__init__(pin, pull_up, active_state)

    motion_detected = property(lambda self: self.is_active)

    @property
    def when_motion(self):
        return self._when_act

    @when_motion.setter
    def when_motion(self, fn):
        self._when_act = fn

    @property
    def when_no_motion(self):
        return self._when_deact

    @when_no_motion.setter
    def when_no_motion(self, fn):
        self._when_deact = fn

    def wait_for_motion(self, timeout=None):
        return self.wait_for_active(timeout)

    def wait_for_no_motion(self, timeout=None):
        return self.wait_for_inactive(timeout)


class LineSensor(DigitalInputDevice):
    def __init__(self, pin=None, pull_up=False, active_state=None, queue_len=5, sample_rate=100, threshold=0.5, partial=False, pin_factory=None):
        super().__init__(pin, pull_up, active_state)

    line_detected = property(lambda self: not self.is_active)

    @property
    def when_line(self):
        return self._when_deact

    @when_line.setter
    def when_line(self, fn):
        self._when_deact = fn

    @property
    def when_no_line(self):
        return self._when_act

    @when_no_line.setter
    def when_no_line(self, fn):
        self._when_act = fn


class LightSensor(DigitalInputDevice):
    def __init__(self, pin=None, queue_len=5, charge_time_limit=0.01, threshold=0.1, partial=False, pin_factory=None):
        super().__init__(pin, False, None)

    @property
    def value(self):
        return J.light(self.pin)

    light_detected = property(lambda self: self.value > 0.5)

    def wait_for_light(self, timeout=None):
        return self._wait(True, timeout)

    def wait_for_dark(self, timeout=None):
        return self._wait(False, timeout)


class DistanceSensor(Device):
    def __init__(self, echo=None, trigger=None, queue_len=9, max_distance=1, threshold_distance=0.3, partial=False, pin_factory=None):
        super().__init__()
        self.echo, self.trigger = self._claim(echo, trigger)
        J.setup(self.echo, 'in', 'none')
        J.setup(self.trigger, 'out', 'none')
        self.max_distance = max_distance
        self.threshold_distance = threshold_distance
        self._in = None
        self._out = None

    @property
    def distance(self):
        self._check()
        d = J.distance(self.echo)
        if d < 0:
            return self.max_distance
        return min(self.max_distance, d)

    @property
    def value(self):
        return self.distance / self.max_distance

    @property
    def in_range(self):
        return self.distance < self.threshold_distance

    is_active = in_range

    def wait_for_in_range(self, timeout=None):
        t0 = _time.ticks_ms()
        while not self.in_range:
            if timeout is not None and _time.ticks_diff(_time.ticks_ms(), t0) >= timeout * 1000:
                return False
            _time.sleep_ms(20)
        return True

    def wait_for_out_of_range(self, timeout=None):
        t0 = _time.ticks_ms()
        while self.in_range:
            if timeout is not None and _time.ticks_diff(_time.ticks_ms(), t0) >= timeout * 1000:
                return False
            _time.sleep_ms(20)
        return True

    def _poll(self):
        r = self.in_range
        if r != self._last:
            self._last = r
            fn = self._in if r else self._out
            if fn:
                H.call(fn, self)

    def _ensure_poll(self):
        if not getattr(self, '_ph', None):
            self._last = self.in_range
            self._ph = H.every(50, self._poll)
            self._handles.append(self._ph)

    @property
    def when_in_range(self):
        return self._in

    @when_in_range.setter
    def when_in_range(self, fn):
        self._in = fn
        self._ensure_poll()

    @property
    def when_out_of_range(self):
        return self._out

    @when_out_of_range.setter
    def when_out_of_range(self, fn):
        self._out = fn
        self._ensure_poll()


# ------------------------------------------------------------------ SPI ADC (MCP3008 + pot)
class AnalogInputDevice(Device):
    bits = 10

    def __init__(self, channel=0, differential=False, max_voltage=3.3, **spi):
        super().__init__()
        self.channel = channel
        self.max_voltage = max_voltage

    @property
    def value(self):
        return J.mcp3008(self.channel)

    @property
    def raw_value(self):
        return int(self.value * ((1 << self.bits) - 1))

    @property
    def voltage(self):
        return self.value * self.max_voltage

    @property
    def is_active(self):
        return self.value > 0


class MCP3008(AnalogInputDevice):
    pass


class MCP3004(AnalogInputDevice):
    pass


class MCP3208(AnalogInputDevice):
    bits = 12


class Potentiometer(MCP3008):
    pass


# ------------------------------------------------------------------ internal devices
class CPUTemperature(Device):
    def __init__(self, sensor_file='/sys/class/thermal/thermal_zone0/temp', min_temp=0.0, max_temp=100.0, threshold=80.0, event_delay=5.0, pin_factory=None):
        super().__init__()
        self.min_temp = min_temp
        self.max_temp = max_temp
        self.threshold = threshold

    @property
    def temperature(self):
        return J.cpu_temp()

    @property
    def value(self):
        return min(1, max(0, (self.temperature - self.min_temp) / (self.max_temp - self.min_temp)))

    @property
    def is_active(self):
        return self.temperature > self.threshold


class LoadAverage(Device):
    @property
    def load_average(self):
        return 0.25

    value = property(lambda self: 0.25)


class PingServer(Device):
    def __init__(self, host='google.com', event_delay=10.0, pin_factory=None):
        super().__init__()
        self.host = host

    @property
    def value(self):
        return True

    is_active = value


class TimeOfDay(Device):
    def __init__(self, start_time=None, end_time=None, utc=True, event_delay=10.0, pin_factory=None):
        super().__init__()
        self.start_time = start_time
        self.end_time = end_time

    @property
    def value(self):
        return True


class Device_pin_factory:
    pass


Device.pin_factory = None
