// MicroPython / Python support (sketch language "python").
// A project's language is project.lang: 'cpp' (default, Arduino C/C++) or 'python'.
// Boards list the languages they can run in def.board.langs (default ['cpp']).

/** Languages a board can be programmed in. */
export function boardLangs(board) { return (board && board.langs) || ['cpp']; }

/** Starter program for a new Python project on `board` (a def.board object). */
export function defaultPythonCode(board) {
  const led = board && board.ledBuiltin != null ? board.ledBuiltin : 2;
  return `# RaptiAuto — MicroPython Blink
from machine import Pin
import time

led = Pin(${led}, Pin.OUT)

while True:
    led.value(1)
    time.sleep(0.5)
    led.value(0)
    time.sleep(0.5)
`;
}
