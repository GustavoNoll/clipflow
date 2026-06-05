#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/ClipFlow.app"

if [[ ! -d "$APP" ]]; then
  echo "Build not found. Run: npm run tauri build"
  exit 1
fi

echo "Installing ClipFlow to /Applications..."
if pgrep -xq clipflow; then
  echo "Stopping running ClipFlow..."
  pkill -x clipflow || true
  sleep 1
fi
rm -rf /Applications/ClipFlow.app
ditto "$APP" /Applications/ClipFlow.app

echo "Signing app bundle..."
codesign --force --sign - "/Applications/ClipFlow.app/Contents/MacOS/app-icon-helper"
codesign --force --sign - "/Applications/ClipFlow.app/Contents/MacOS/notch-layout-helper"
codesign --force --sign - "/Applications/ClipFlow.app/Contents/MacOS/ocr-helper"
codesign --force --sign - "/Applications/ClipFlow.app/Contents/MacOS/auth-helper"
codesign --force --sign - "/Applications/ClipFlow.app/Contents/MacOS/clipflow"
codesign --force --deep --sign - "/Applications/ClipFlow.app"
xattr -cr "/Applications/ClipFlow.app"

echo "Done. Opening ClipFlow..."
open /Applications/ClipFlow.app
