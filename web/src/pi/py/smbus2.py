# smbus2 for the RaptiAuto virtual Raspberry Pi: I2C bus 1 (GPIO2 = SDA, GPIO3 = SCL).
# Talks to the parts on the circuit canvas: an I2C LCD backpack, or an Arduino running
# Wire.begin(address) as a slave (its onReceive / onRequest handlers answer).
#     from smbus2 import SMBus
#     bus = SMBus(1)
#     bus.write_i2c_block_data(8, 0, [90, 1])
#     data = bus.read_i2c_block_data(8, 0, 2)
import _rpi_js as J


def _check(addr):
    if not J.i2c_has(addr):
        raise OSError(121, 'Remote I/O error - no I2C device at 0x%02X (check SDA = GPIO2, SCL = GPIO3, GND)' % addr)


class i2c_msg:
    def __init__(self, addr, data, read):
        self.addr = addr
        self.buf = list(data)
        self.read_ = read
        self.len = len(self.buf)

    @staticmethod
    def write(addr, buf):
        return i2c_msg(addr, buf, False)

    @staticmethod
    def read(addr, length):
        return i2c_msg(addr, [0] * length, True)

    def __iter__(self):
        return iter(self.buf)

    def __len__(self):
        return self.len


class SMBus:
    def __init__(self, bus=1, force=False):
        if bus is not None and bus not in (1, '/dev/i2c-1'):
            raise FileNotFoundError(2, "No such file or directory: '/dev/i2c-%s'" % bus)
        self.bus = 1

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    def open(self, bus):
        self.bus = bus

    def close(self):
        pass

    def write_quick(self, addr, force=None):
        _check(addr)

    def write_byte(self, addr, value, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([value & 255]).hex())

    def write_byte_data(self, addr, register, value, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([register & 255, value & 255]).hex())

    def write_word_data(self, addr, register, value, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([register & 255, value & 255, (value >> 8) & 255]).hex())

    def write_block_data(self, addr, register, data, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([register & 255, len(data)] + [d & 255 for d in data]).hex())

    def write_i2c_block_data(self, addr, register, data, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([register & 255] + [d & 255 for d in data]).hex())

    def read_byte(self, addr, force=None):
        _check(addr)
        return bytes.fromhex(J.i2c_read(addr, 1))[0]

    def read_byte_data(self, addr, register, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([register & 255]).hex())
        return bytes.fromhex(J.i2c_read(addr, 1))[0]

    def read_word_data(self, addr, register, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([register & 255]).hex())
        b = bytes.fromhex(J.i2c_read(addr, 2))
        return b[0] | (b[1] << 8)

    def read_i2c_block_data(self, addr, register, length, force=None):
        _check(addr)
        J.i2c_write(addr, bytes([register & 255]).hex())
        return list(bytes.fromhex(J.i2c_read(addr, length)))

    def i2c_rdwr(self, *msgs):
        for m in msgs:
            _check(m.addr)
            if m.read_:
                m.buf = list(bytes.fromhex(J.i2c_read(m.addr, m.len)))
            else:
                J.i2c_write(m.addr, bytes(m.buf).hex())

    def scan(self):
        s = J.i2c_scan()
        return [int(a) for a in s.split(',')] if s else []
