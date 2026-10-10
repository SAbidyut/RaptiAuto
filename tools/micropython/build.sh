#!/usr/bin/env bash
# Rebuilds web/vendor/micropython/micropython.{mjs,wasm}: MicroPython's WebAssembly port with the
# "raptipi" variant (time.sleep / input / long loops yield to the browser through Asyncify).
# Needs git, make, python3 and the Emscripten SDK (emcc on PATH, e.g. `source emsdk_env.sh`).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
MP="${MICROPYTHON_DIR:-/tmp/micropython}"
TAG=v1.29.0
if [[ ! -d "$MP" ]]; then
  git clone --depth 1 -b "$TAG" https://github.com/micropython/micropython.git "$MP"
  (cd "$MP" && git apply "$HERE/port.patch")
fi
# the patched port files must not turn the version into "v1.29.0-dirty"
(cd "$MP" && git diff --name-only | xargs -r git update-index --assume-unchanged)
(cd "$MP" && git submodule update --init --depth 1 lib/micropython-lib)
mkdir -p "$MP/ports/webassembly/variants/raptipi"
cp "$HERE"/variant/* "$MP/ports/webassembly/variants/raptipi/"
make -C "$MP/mpy-cross" -j"$(nproc)"
make -C "$MP/ports/webassembly" VARIANT=raptipi -j"$(nproc)"
cp "$MP/ports/webassembly/build-raptipi/micropython.mjs" "$MP/ports/webassembly/build-raptipi/micropython.wasm" "$ROOT/web/vendor/micropython/"
echo "micropython -> web/vendor/micropython ($(du -h "$ROOT/web/vendor/micropython/micropython.wasm" | cut -f1) wasm)"
