#!/usr/bin/env bash
# Rebuild Mochi.apk from the original game files.
# Usage: from anywhere:  bash build-apk.sh
set -e
cd "$(dirname "$0")/mochi-apk"

echo "[1/3] Copying original game files into www/ ..."
cp ../index.html ../game.js ../style.css www/
rm -rf www/sounds
cp -r ../sounds www/

echo "[2/3] Compiling APK (Android SDK + Temurin 21 are pre-wired) ..."
(
  cd android
  ./gradlew assembleDebug --console=plain > ../build.log 2>&1
)

echo "[3/3] Updating /home/marco/Desktop/Mochi.apk ..."
cp android/app/build/outputs/apk/debug/app-debug.apk /home/marco/Desktop/Mochi.apk
echo "✅ Done — new APK at /home/marco/Desktop/Mochi.apk"
