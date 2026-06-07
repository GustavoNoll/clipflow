#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="$HOME/Library/Application Support/ClipFlow/clipflow.db"

fail() { echo "FAIL: $*"; exit 1; }
ok() { echo "OK: $*"; }

set_hover_db() {
  local enabled="$1"
  local json
  if [[ "$enabled" == "true" ]]; then
    json='{"theme":"light","accent":"#5b5fc7","autoPaste":true,"capturePaused":false,"defaultLauncher":"notch","compactGrid":false,"showSourceApp":true,"historyLimit":0,"notchHoverEnabled":true}'
  else
    json='{"theme":"light","accent":"#5b5fc7","autoPaste":true,"capturePaused":false,"defaultLauncher":"notch","compactGrid":false,"showSourceApp":true,"historyLimit":0,"notchHoverEnabled":false}'
  fi
  sqlite3 "$DB" "INSERT OR REPLACE INTO settings (key,value) VALUES ('app_settings', '$json');"
}

restart_app() {
  killall clipflow 2>/dev/null || true
  sleep 1
  open /Applications/ClipFlow.app
  sleep 4
  pgrep -x clipflow >/dev/null || fail "clipflow not running after restart"
}

count_notch_windows() {
  swift -e '
import AppKit
let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
let info = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] ?? []
let count = info.filter { ($0[kCGWindowOwnerName as String] as? String)?.lowercased() == "clipflow" && ($0[kCGWindowName as String] as? String)?.contains("Shelf") == true }.count
print(count)
'
}

echo "== E2E: notch hover =="
bash "$ROOT/scripts/install-mac.sh" | tail -3

set_hover_db false
restart_app
ok "startup with hover OFF"

set_hover_db true
restart_app
ok "startup with hover ON (no crash)"

PID=$(pgrep -x clipflow)
swift "$ROOT/scripts/test-notch-hover-extended.swift" "$PID" | tee /tmp/notch-hover-test.log
grep -qE "heightDelta=[1-9][0-9]*|widthDelta=[1-9][0-9]*" /tmp/notch-hover-test.log || fail "notch shelf did not expand on hover"

ok "notch shelf expands after hover"
echo "== ALL TESTS PASSED =="
