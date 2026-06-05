#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
REPOSITORY="${GITHUB_REPOSITORY:-gustavonoll/clipflow}"
TAG="${RELEASE_TAG:-v$VERSION}"
ASSET_NAME="ClipFlow.app.tar.gz"
ARTIFACT="$ROOT/src-tauri/target/release/bundle/macos/$ASSET_NAME"
SIGNATURE_FILE="$ARTIFACT.sig"
OUT="$ROOT/src-tauri/target/release/bundle/macos/latest.json"

if [[ ! -f "$ARTIFACT" ]]; then
  echo "Missing updater artifact: $ARTIFACT" >&2
  exit 1
fi

if [[ ! -f "$SIGNATURE_FILE" ]]; then
  echo "Missing updater signature: $SIGNATURE_FILE" >&2
  exit 1
fi

SIGNATURE="$(cat "$SIGNATURE_FILE")"
URL="https://github.com/$REPOSITORY/releases/download/$TAG/$ASSET_NAME"
PUB_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "$OUT" <<EOF
{
  "version": "$VERSION",
  "notes": "ClipFlow $VERSION",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$SIGNATURE",
      "url": "$URL"
    }
  }
}
EOF

echo "Wrote $OUT"
