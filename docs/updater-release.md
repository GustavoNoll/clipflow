# ClipFlow Updater Release

ClipFlow uses the official Tauri v2 updater plugin with signed update artifacts.

## Private Key

The private updater key was generated outside the repository:

```sh
~/.clipflow/updater.key
```

Do not commit this file. In CI, store its content as `TAURI_SIGNING_PRIVATE_KEY`.
If the key is regenerated, replace the `plugins.updater.pubkey` value in `src-tauri/tauri.conf.json`.

## Build Signed Artifacts

For local release builds:

```sh
TAURI_SIGNING_PRIVATE_KEY="$(cat "$HOME/.clipflow/updater.key")" npm run release:mac
```

The Tauri bundler creates updater artifacts because `bundle.createUpdaterArtifacts` is enabled.
The release script also writes `src-tauri/target/release/bundle/macos/latest.json`.

## GitHub Release Endpoint

The app checks:

```text
https://github.com/gustavonoll/clipflow/releases/latest/download/latest.json
```

Upload `latest.json` plus the generated macOS updater asset and signature files to the latest GitHub release.

## Static JSON Shape

For Tauri static updater JSON, the platform key is `darwin-aarch64` on Apple Silicon:

```json
{
  "version": "0.1.1",
  "notes": "Release notes shown in ClipFlow settings.",
  "pub_date": "2026-06-05T00:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "CONTENT_OF_GENERATED_SIG_FILE",
      "url": "https://github.com/gustavonoll/clipflow/releases/download/v0.1.1/ClipFlow.app.tar.gz"
    }
  }
}
```

The exact asset name can vary by Tauri output. Use the `.sig` content generated beside the updater artifact.

## Validation

1. Install an older signed version.
2. Publish a newer release with `latest.json`.
3. Open `Settings > Data > Updates`.
4. Click `Check`.
5. Click `Install`.
6. Confirm ClipFlow relaunches into the newer version.
