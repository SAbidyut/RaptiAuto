from paho.mqtt.client import Client


def single(topic, payload=None, qos=0, retain=False, hostname='localhost', port=1883, client_id='', auth=None, **kw):
    c = Client(client_id=client_id)
    if auth:
        c.username_pw_set(auth.get('username'), auth.get('password'))
    c.connect(hostname, port)
    c.publish(topic, payload, qos, retain)
    c.disconnect()


def multiple(msgs, hostname='localhost', port=1883, client_id='', auth=None, **kw):
    c = Client(client_id=client_id)
    c.connect(hostname, port)
    for m in msgs:
        if isinstance(m, dict):
            c.publish(m['topic'], m.get('payload'), m.get('qos', 0), m.get('retain', False))
        else:
            c.publish(*m[:4])
    c.disconnect()
