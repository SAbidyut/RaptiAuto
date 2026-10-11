import time
from paho.mqtt.client import Client


def simple(topics, hostname='localhost', port=1883, msg_count=1, **kw):
    out = []
    c = Client()

    def on_message(client, userdata, msg):
        out.append(msg)

    c.on_message = on_message
    c.connect(hostname, port)
    c.subscribe(topics)
    while len(out) < msg_count:
        c.loop(0.2)
    c.disconnect()
    return out[0] if msg_count == 1 else out
