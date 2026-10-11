# adafruit_ssd1306 (CircuitPython / Blinka) for the Raspberry Pi:
#     import board, busio, adafruit_ssd1306
#     i2c = board.I2C()
#     oled = adafruit_ssd1306.SSD1306_I2C(128, 64, i2c, addr=0x3C)
#     oled.fill(0); oled.text("Hello", 0, 0, 1); oled.show()
import ssd1306 as _s

class SSD1306_I2C(_s.SSD1306_I2C):
    def __init__(self, width, height, i2c, *, addr=0x3C, external_vcc=False, reset=None):
        if not i2c.try_lock():
            raise RuntimeError("I2C bus is in use")
        i2c.unlock()
        if addr not in i2c.scan():
            raise ValueError("No I2C device at address: 0x%x" % addr)
        super().__init__(width, height, _Bus(i2c), addr, external_vcc)

    def image(self, image):
        raise NotImplementedError("PIL images are not available in the simulator - draw with fill/text/line/rect/pixel")

    @property
    def power(self):
        return True


class _Bus:
    def __init__(self, i2c):
        self.i2c = i2c

    def writeto(self, addr, buf):
        self.i2c.writeto(addr, bytes(buf))
