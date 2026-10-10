# signal.pause() keeps a gpiozero script alive while callbacks and blinking run.
import time

SIGINT = 2
SIGTERM = 15


def pause():
    while True:
        time.sleep(1)


def signal(sig, handler):
    return None
