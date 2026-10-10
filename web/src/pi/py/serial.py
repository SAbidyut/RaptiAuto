# pyserial for the RaptiAuto virtual Raspberry Pi: the GPIO UART /dev/serial0 (GPIO14 = TXD,
# GPIO15 = RXD). Wire TXD to an Arduino's RX (D0), RXD to its TX (D1) and GND to GND.
#     import serial
#     ser = serial.Serial('/dev/serial0', 9600, timeout=1)
#     ser.write(b'L1\n')
#     print(ser.readline())
import _rpi_js as J
import time as _time

PARITY_NONE = 'N'
PARITY_EVEN = 'E'
PARITY_ODD = 'O'
STOPBITS_ONE = 1
STOPBITS_TWO = 2
EIGHTBITS = 8
SEVENBITS = 7


class SerialException(OSError):
    pass


class SerialTimeoutException(SerialException):
    pass


_PORTS = ('/dev/serial0', '/dev/ttyAMA0', '/dev/ttyS0', 'serial0')


class Serial:
    def __init__(self, port=None, baudrate=9600, bytesize=8, parity='N', stopbits=1, timeout=None, **kw):
        self.baudrate = baudrate
        self.bytesize = bytesize
        self.parity = parity
        self.stopbits = stopbits
        self.timeout = timeout
        self._port = None
        self.is_open = False
        self.port = port
        if port is not None:
            self.open()

    def open(self):
        if self.port not in _PORTS:
            if str(self.port).startswith('/dev/ttyUSB') or str(self.port).startswith('/dev/ttyACM'):
                raise SerialException(2, "could not open port %s: no USB serial device - use /dev/serial0 (GPIO14 TXD, GPIO15 RXD)" % self.port)
            raise SerialException(2, "could not open port %s: [Errno 2] No such file or directory" % self.port)
        self._port = 'serial0'
        self.is_open = True

    def close(self):
        self.is_open = False

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def _need(self):
        if not self.is_open:
            raise SerialException('Attempting to use a port that is not open')

    @property
    def in_waiting(self):
        self._need()
        return J.uart_any(self._port)

    def inWaiting(self):
        return self.in_waiting

    def write(self, data):
        self._need()
        if isinstance(data, str):
            raise TypeError('unicode strings are not supported, please encode to bytes: %r' % data)
        J.uart_write(self._port, bytes(data).decode('utf-8', 'ignore'))
        return len(data)

    def flush(self):
        pass

    def reset_input_buffer(self):
        J.uart_read(self._port, -1)

    flushInput = reset_input_buffer

    def reset_output_buffer(self):
        pass

    def _wait(self, ready):
        if ready():
            return True
        if self.timeout == 0:
            return False
        end = None if self.timeout is None else _time.ticks_add(_time.ticks_ms(), int(self.timeout * 1000))
        while not ready():
            if end is not None and _time.ticks_diff(end, _time.ticks_ms()) <= 0:
                return False
            _time.sleep_ms(5)
        return True

    def read(self, size=1):
        self._need()
        self._wait(lambda: J.uart_any(self._port) >= size)
        return J.uart_read(self._port, size).encode()

    def read_all(self):
        self._need()
        return J.uart_read(self._port, -1).encode()

    def readline(self, size=-1):
        self._need()
        self._wait(lambda: J.uart_has_line(self._port))
        return J.uart_readline(self._port, 1).encode()

    def readlines(self):
        out = []
        while True:
            line = self.readline()
            if not line:
                return out
            out.append(line)

    def read_until(self, expected=b'\n', size=None):
        if expected == b'\n':
            return self.readline()
        return self.read(size or 1)

    def __repr__(self):
        return "Serial<id=0x0, open=%s>(port='%s', baudrate=%d, bytesize=%d, parity='%s', stopbits=%d, timeout=%s)" % (self.is_open, self.port, self.baudrate, self.bytesize, self.parity, self.stopbits, self.timeout)
