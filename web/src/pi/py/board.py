# board: Adafruit Blinka pin names for the Raspberry Pi (board.D4 is BCM GPIO 4).
for _i in range(28):
    globals()['D%d' % _i] = _i
SDA = 2
SCL = 3
SCK = SCLK = 11
MOSI = 10
MISO = 9
CE0 = 8
CE1 = 7
TXD = 14
RXD = 15
