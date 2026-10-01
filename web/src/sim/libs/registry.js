// Library registry: each Arduino library module registers an installer.
const installers = [];
export function addLibrary(fn) { installers.push(fn); }
export function makeLibraries(natives, rt, hw, board) {
  for (const fn of installers) fn(natives, rt, hw, board);
}

/** Register a native class for the compiler/runtime. */
export function defineClass(natives, name, spec) {
  natives.classes[name] = { name, ...spec };
  return natives.classes[name];
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const map = (x, a, b, c, d) => (x - a) * (d - c) / (b - a) + c;

/** Print support for display libraries: needs obj._write(str) */
export const PRINT_METHODS = {
  print: { ret: 'uint', print: true },
  println: { ret: 'uint', print: true },
};
