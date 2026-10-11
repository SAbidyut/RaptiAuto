# paho-mqtt for the RaptiAuto virtual Raspberry Pi: a client for the simulated MQTT brokers
# (broker.hivemq.com, test.mosquitto.org, localhost = the Pi's own Mosquitto).
#     import paho.mqtt.client as mqtt
#     def on_message(client, userdata, msg): print(msg.topic, msg.payload.decode())
#     c = mqtt.Client(); c.on_message = on_message
#     c.connect("broker.hivemq.com", 1883); c.subscribe("rapti/#"); c.loop_forever()
import json
import time
import _rpi_js as J
import _netio

MQTT_ERR_SUCCESS = 0
MQTT_ERR_NO_CONN = 4
MQTT_ERR_CONN_REFUSED = 5
MQTTv31 = 3
MQTTv311 = 4
MQTTv5 = 5
MQTT_CLEAN_START_FIRST_ONLY = 3


class CallbackAPIVersion:
    VERSION1 = 1
    VERSION2 = 2


class MQTTMessage:
    def __init__(self, topic, payload, retain=False):
        self.topic = topic
        self.payload = payload.encode('utf-8') if isinstance(payload, str) else payload
        self.qos = 0
        self.retain = retain
        self.mid = 0


class MQTTMessageInfo:
    def __init__(self, rc=0):
        self.rc = rc
        self.mid = 1

    def wait_for_publish(self, timeout=None):
        pass

    def is_published(self):
        return True


def error_string(rc):
    return {0: 'No error.', 4: 'The client is not currently connected.', 5: 'Connection Refused: not authorised'}.get(rc, 'Unknown error.')


def connack_string(rc):
    return {0: 'Connection Accepted.', 5: 'Connection Refused: not authorised.'}.get(rc, 'Connection Refused: unknown reason.')


class Client:
    def __init__(self, *args, client_id='', clean_session=True, userdata=None, protocol=MQTTv311, transport='tcp', **kw):
        # Client(), Client("id"), Client(CallbackAPIVersion.VERSION2, "id")
        self._v2 = False
        a = list(args)
        if a and isinstance(a[0], int) and not isinstance(a[0], bool):
            self._v2 = a[0] == 2
            a = a[1:]
        if a and isinstance(a[0], str):
            client_id = a[0]
        self._cid = client_id or 'rapti-%d' % (time.ticks_ms() % 100000)
        self._userdata = userdata
        self._h = 0
        self._host = None
        self._user = None
        self._pass = None
        self._will = None
        self._subs = []
        self._cbs = {}
        self._bg = None
        self._stop = False
        self._connected = False
        self.on_connect = None
        self.on_disconnect = None
        self.on_message = None
        self.on_publish = None
        self.on_subscribe = None
        self.on_unsubscribe = None
        self.on_log = None

    def user_data_set(self, u):
        self._userdata = u

    def username_pw_set(self, username, password=None):
        self._user = username
        self._pass = password

    def will_set(self, topic, payload=None, qos=0, retain=False):
        self._will = (topic, payload if isinstance(payload, str) else (payload or b'').decode('utf-8'))

    def tls_set(self, *a, **k):
        pass

    def tls_insecure_set(self, *a):
        pass

    def enable_logger(self, *a):
        pass

    def reconnect_delay_set(self, *a, **k):
        pass

    def message_callback_add(self, sub, cb):
        self._cbs[sub] = cb

    def message_callback_remove(self, sub):
        self._cbs.pop(sub, None)

    def connect(self, host, port=1883, keepalive=60, bind_address='', *a, **k):
        if not J.net_online():
            raise OSError(101, 'Network is unreachable')
        w = self._will
        h = J.mqtt_connect(self._cid, host, int(port), self._user or '', self._pass or '', w[0] if w else '', w[1] if w else '')
        if h < 0:
            if h == -4 and not J.net_resolve(host):
                raise OSError(-2, 'Name or service not known')
            if h == 5:
                self._fire_connect(5)
                return 5
            raise OSError(111, 'Connection refused')
        self._h = h
        self._host = host
        self._connected = True
        for t in self._subs:
            J.mqtt_subscribe(h, t)
        self._fire_connect(0)
        return MQTT_ERR_SUCCESS

    def connect_async(self, host, port=1883, keepalive=60, *a, **k):
        self.connect(host, port, keepalive)

    def reconnect(self):
        return self.connect(self._host)

    def _fire_connect(self, rc):
        if self.on_connect:
            if self._v2:
                self.on_connect(self, self._userdata, {'session present': 0}, rc, None)
            else:
                self.on_connect(self, self._userdata, {'session present': 0}, rc)

    def disconnect(self):
        if self._h:
            J.mqtt_disconnect(self._h)
            self._h = 0
        was = self._connected
        self._connected = False
        self._stop = True
        if was and self.on_disconnect:
            if self._v2:
                self.on_disconnect(self, self._userdata, {}, 0, None)
            else:
                self.on_disconnect(self, self._userdata, 0)
        return MQTT_ERR_SUCCESS

    def is_connected(self):
        return bool(self._h and J.mqtt_connected(self._h))

    def subscribe(self, topic, qos=0, *a, **k):
        topics = topic if isinstance(topic, list) else [topic]
        for t in topics:
            if isinstance(t, tuple):
                t = t[0]
            self._subs.append(t)
            if self._h:
                J.mqtt_subscribe(self._h, t)
        if self.on_subscribe:
            if self._v2:
                self.on_subscribe(self, self._userdata, 1, [0], None)
            else:
                self.on_subscribe(self, self._userdata, 1, (qos,))
        return (MQTT_ERR_SUCCESS, 1)

    def unsubscribe(self, topic, *a):
        for t in (topic if isinstance(topic, list) else [topic]):
            if t in self._subs:
                self._subs.remove(t)
            if self._h:
                J.mqtt_unsubscribe(self._h, t)
        return (MQTT_ERR_SUCCESS, 1)

    def publish(self, topic, payload=None, qos=0, retain=False, properties=None):
        if not self._h or not J.mqtt_connected(self._h):
            return MQTTMessageInfo(MQTT_ERR_NO_CONN)
        if isinstance(payload, (bytes, bytearray)):
            payload = bytes(payload).decode('utf-8', 'replace')
        elif payload is None:
            payload = ''
        elif not isinstance(payload, str):
            payload = str(payload)
        J.mqtt_publish(self._h, topic, payload, 1 if retain else 0)
        if self.on_publish:
            if self._v2:
                self.on_publish(self, self._userdata, 1, 0, None)
            else:
                self.on_publish(self, self._userdata, 1)
        return MQTTMessageInfo(0)

    def _deliver(self, m):
        msg = MQTTMessage(m['topic'], m['payload'], m.get('retained', False))
        for sub, cb in self._cbs.items():
            if _match(sub, msg.topic):
                cb(self, self._userdata, msg)
                return
        if self.on_message:
            self.on_message(self, self._userdata, msg)

    def loop(self, timeout=1.0, max_packets=1):
        if not self._h:
            return MQTT_ERR_NO_CONN
        n = 0
        t0 = time.ticks_ms()
        while True:
            r = J.mqtt_poll(self._h)
            if r:
                self._deliver(json.loads(r))
                n += 1
                if n >= 50:
                    break
            elif n or time.ticks_diff(time.ticks_ms(), t0) >= timeout * 1000:
                break
            else:
                time.sleep(0.01)
        return MQTT_ERR_SUCCESS

    def _tick(self):
        if not self._h:
            return
        for _ in range(20):
            r = J.mqtt_poll(self._h)
            if not r:
                break
            self._deliver(json.loads(r))

    def loop_start(self):
        import _rpi_hw
        if self._bg is None:
            self._bg = _rpi_hw.every(20, self._tick)
        return MQTT_ERR_SUCCESS

    def loop_stop(self, force=False):
        if self._bg is not None:
            import _rpi_hw
            _rpi_hw.stop(self._bg)
            self._bg = None
        return MQTT_ERR_SUCCESS

    def loop_forever(self, timeout=1.0, retry_first_connection=False):
        self._stop = False
        while not self._stop and self._h:
            self._tick()
            time.sleep(0.02)
        return MQTT_ERR_SUCCESS

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.disconnect()


def _match(f, t):
    fs, ts = f.split('/'), t.split('/')
    for i, p in enumerate(fs):
        if p == '#':
            return True
        if i >= len(ts):
            return False
        if p != '+' and p != ts[i]:
            return False
    return len(fs) == len(ts)


def topic_matches_sub(sub, topic):
    return _match(sub, topic)
