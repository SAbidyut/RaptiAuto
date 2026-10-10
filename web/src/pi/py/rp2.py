# rp2: RP2040 specific functions (BOOTSEL button, country code).
import _rpi_js as J


def bootsel_button():
    return J.bootsel()


def country(c=None):
    return 'XX' if c is None else None


class PIO:
    IN_LOW = 0
    IN_HIGH = 1
    OUT_LOW = 2
    OUT_HIGH = 3
    SHIFT_LEFT = 0
    SHIFT_RIGHT = 1

    def __init__(self, id):
        raise OSError('PIO programs are not simulated in RaptiAuto')


class StateMachine:
    def __init__(self, *a, **k):
        raise OSError('PIO state machines are not simulated in RaptiAuto')


def asm_pio(*a, **k):
    def deco(f):
        return f
    return deco
