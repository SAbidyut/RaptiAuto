// Device libraries (Servo, LiquidCrystal, NeoPixel, DHT, ...). Filled in by individual modules.
const installers = [];
export function addLibrary(fn) { installers.push(fn); }
export function makeLibraries(natives, rt, hw, board) {
  for (const fn of installers) fn(natives, rt, hw, board);
}
