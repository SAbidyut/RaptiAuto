# RPLCD.i2c.CharLCD: HD44780 character LCD with a PCF8574 I2C backpack
#     from RPLCD.i2c import CharLCD
#     lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
#     lcd.write_string("Hello"); lcd.cursor_pos = (1, 0); lcd.clear()
from i2c_lcd import I2cLcd


class CharLCD(I2cLcd):
    def __init__(self, i2c_expander='PCF8574', address=0x27, port=1, charmap='A02', cols=16, rows=2, **kw):
        I2cLcd.__init__(self, address, rows, cols)

    @property
    def backlight_enabled(self):
        return self._bl != 0

    @backlight_enabled.setter
    def backlight_enabled(self, on):
        if on:
            self.backlight_on()
        else:
            self.backlight_off()

    def create_char(self, location, bitmap):
        self.custom_char(location, bitmap)
