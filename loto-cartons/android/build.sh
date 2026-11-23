#!/usr/bin/env bash
# Fabrique LotoCartons.apk sans Gradle : aapt2 (ressources), javac + d8 (code), zipalign, apksigner.
# Usage : ./build.sh   (outils Android dans $ANDROID_HOME, sinon ~/android-sdk)
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$HOME/android-sdk}"
BT="$SDK/build-tools/34.0.0"
JAR="$SDK/platforms/android-34/android.jar"
if [ ! -f "$JAR" ] || [ ! -x "$BT/aapt2" ]; then
  echo "Outils Android manquants : installer « platforms;android-34 » et « build-tools;34.0.0 » avec sdkmanager." >&2
  exit 1
fi

rm -rf build
mkdir -p build/classes build/dex

# Ressources + manifeste
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$JAR" --manifest AndroidManifest.xml \
  --min-sdk-version 21 --target-sdk-version 34 build/res.zip

# Code
javac --release 11 -classpath "$JAR" -d build/classes $(find src -name '*.java')
"$BT/d8" --release --min-api 21 --lib "$JAR" --output build/dex $(find build/classes -name '*.class')
cp build/base.apk build/unaligned.apk
(cd build/dex && zip -q ../unaligned.apk classes.dex)
"$BT/zipalign" -f -p 4 build/unaligned.apk build/aligned.apk

# Signature (clé gardée hors du dépôt ; une nouvelle clé oblige à désinstaller l'ancienne version)
KS="${LOTO_KEYSTORE:-$HOME/.loto-cartons.keystore}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass loto-cartons -keypass loto-cartons \
    -alias loto -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Loto Cartons" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:loto-cartons --key-pass pass:loto-cartons \
  --ks-key-alias loto --out LotoCartons.apk build/aligned.apk
"$BT/apksigner" verify LotoCartons.apk
echo "OK : $(pwd)/LotoCartons.apk"
