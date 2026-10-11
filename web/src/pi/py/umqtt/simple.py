# umqtt.simple (MicroPython): MQTT client for the Pico W on the simulated brokers.
#     from umqtt.simple import MQTTClient
#     c = MQTTClient("pico", "broker.hivemq.com"); c.connect(); c.publish(b"rapti/pico", b"hello")
import json
import time
import _rpi_js as J


class MQTTException(Exception):
    pass


class MQTTClient:
    def __init__(self, client_id, server, port=0, user=None, password=None, keepalive=0, ssl=False, ssl_params={}):
        self.client_id = client_id if isinstance(client_id, str) else client_id.decode()
        self.server = server
        self.port = port or (8883 if ssl else 1883)
        self.user = user
        self.pswd = password
        self.cb = None
        self._h = 0
        self._will = None

    def set_callback(self, f):
        self.cb = f

    def set_last_will(self, topic, msg, retain=False, qos=0):
        self._will = (topic.decode() if isinstance(topic, bytes) else topic, msg.decode() if isinstance(msg, bytes) else msg)

    def connect(self, clean_session=True, timeout=None):
        w = self._will
        h = J.mqtt_connect(self.client_id, self.server, self.port, self.user or '', (self.pswd or ''), w[0] if w else '', w[1] if w else '')
        if h < 0:
            if h == 5:
                raise MQTTException(5)
            raise OSError(-1 if h == -4 else 111, 'MQTT connect failed')
        self._h = h
        return False

    def disconnect(self):
        if self._h:
            J.mqtt_disconnect(self._h)
            self._h = 0

    def ping(self):
        pass

    def publish(self, topic, msg, retain=False, qos=0):
        if not self._h or not J.mqtt_connected(self._h):
            raise OSError(104, 'ECONNRESET')
        J.mqtt_publish(self._h, topic.decode() if isinstance(topic, bytes) else topic, msg.decode() if isinstance(msg, (bytes, bytearray)) else str(msg), 1 if retain else 0)

    def subscribe(self, topic, qos=0):
        if not self.cb:
            raise MQTTException('subscribe callback is not set')
        J.mqtt_subscribe(self._h, topic.decode() if isinstance(topic, bytes) else topic)

    def check_msg(self):
        r = J.mqtt_poll(self._h) if self._h else ''
        if not r:
            return None
        m = json.loads(r)
        self.cb(m['topic'].encode(), m['payload'].encode())
        return None

    def wait_msg(self):
        while True:
            r = J.mqtt_poll(self._h)
            if r:
                m = json.loads(r)
                self.cb(m['topic'].encode(), m['payload'].encode())
                return None
            time.sleep(0.02)
