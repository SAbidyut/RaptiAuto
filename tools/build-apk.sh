#!/usr/bin/env bash
# Builds RaptiAuto.apk without Gradle/AGP using the Debian/Ubuntu Android SDK packages:
#   apt-get install aapt zipalign apksigner android-sdk-platform-23 dalvik-exchange
# Steps: web bundle -> aapt (resources + assets) -> javac -> dx -> zipalign -> apksigner.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_DIR:-/usr/lib/android-sdk}"
PLATFORM_JAR="$SDK/platforms/android-23/android.jar"
OUT="$ROOT/build/android"
APK_NAME="RaptiAuto.apk"
KEYSTORE="$ROOT/android/keystore/raptiauto.jks"
KS_PASS="${RAPTI_KS_PASS:-raptiauto}"

if [[ "${SKIP_WEB:-0}" != "1" ]]; then
  echo "==> Building web app"
  (cd "$ROOT/web" && npm run build --silent)
fi

echo "==> Preparing build dirs"
rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets"
cp -r "$ROOT/build/www" "$OUT/assets/www"

echo "==> aapt package"
aapt package -f -m \
  -M "$ROOT/android/AndroidManifest.xml" \
  -S "$ROOT/android/res" \
  -A "$OUT/assets" \
  -I "$PLATFORM_JAR" \
  -J "$OUT/gen" \
  -F "$OUT/app.unaligned.apk" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --no-version-vectors

echo "==> javac"
# android/stubs: newer framework classes (e.g. RenderProcessGoneDetail, API 26) for javac only — not dexed
mkdir -p "$OUT/stubs"
find "$ROOT/android/stubs" -name '*.java' > "$OUT/stubs.txt"
javac -nowarn -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$PLATFORM_JAR" -classpath "$PLATFORM_JAR" \
  -d "$OUT/stubs" @"$OUT/stubs.txt" 2>&1 | grep -v "^warning: \[options\]" || true
find "$ROOT/android/src" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -nowarn -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$PLATFORM_JAR" -classpath "$PLATFORM_JAR:$OUT/stubs" \
  -d "$OUT/classes" @"$OUT/sources.txt" 2>&1 | grep -v "^warning: \[options\]" || true
test -f "$OUT/classes/net/rapti/raptiauto/MainActivity.class"

echo "==> dx"
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && aapt add -f app.unaligned.apk classes.dex >/dev/null)

echo "==> zipalign"
zipalign -f -p 4 "$OUT/app.unaligned.apk" "$OUT/app.aligned.apk"

if [[ ! -f "$KEYSTORE" ]]; then
  echo "==> Creating signing key"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias raptiauto -keyalg RSA -keysize 2048 -validity 36500 \
    -dname "CN=RaptiAuto, OU=RAPTI, O=Resonance Automation Professional Training Institute, L=Dhaka, C=BD"
fi

echo "==> apksigner"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --ks-key-alias raptiauto --min-sdk-version 24 \
  --out "$OUT/$APK_NAME" "$OUT/app.aligned.apk"
apksigner verify --min-sdk-version 24 "$OUT/$APK_NAME"

mkdir -p "$ROOT/release"
cp "$OUT/$APK_NAME" "$ROOT/release/$APK_NAME"
echo "==> Done: release/$APK_NAME ($(du -h "$ROOT/release/$APK_NAME" | cut -f1))"
