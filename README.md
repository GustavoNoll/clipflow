# ClipFlow

Clipboard manager for macOS inspired by [Supaste](https://supaste.com). Built with **Tauri 2**, **React**, **TypeScript**, and **Rust**.

Fully offline. Local SQLite storage with FTS5 full-text search.

## Features (MVP v1)

- **Automatic clipboard capture** — text, URLs, code, images, files, HEX colors
- **Visual library** — responsive grid with previews, source app, category, and date
- **Instant search** — SQLite FTS5 across content, filenames, apps, and categories
- **Notch Shelf** — UI no topo da tela (estilo Supaste), ancorada no notch
- **Quick Paste** — `⌃⌘V` abre a Notch Shelf; `⌃⇧⌘V` abre Quick Paste clássico
- **Recent shortcuts** — `⌃⌘0` through `⌃⌘9` paste the 10 most recent items
- **Categories** — History, Prompts, Assets, Code, Screenshots, Colors (+ custom)
- **Favorites** — star items and filter them in the library and Quick Paste
- **Source app tracking** — filter by Chrome, Cursor, VS Code, Slack, etc.
- **Batch delete** and **clear history**
- **Menu bar tray** — click to Quick Paste, right-click for menu

## Requirements

- macOS 14.0+ (Sonoma)
- Apple Silicon or Intel
- **Accessibility** permission (for global hotkeys and auto-paste via `⌘V`)

## Development

```bash
npm install
npm run tauri dev
```

## Production build

```bash
npm run tauri build
```

Outputs:

- `src-tauri/target/release/bundle/macos/ClipFlow.app`
- `src-tauri/target/release/bundle/dmg/ClipFlow_<version>_aarch64.dmg`

## Permissions

On first use, macOS will prompt for:

1. **Accessibility** — required for `⌃⌘V`, `⌃⌘0–9`, and automatic paste
   - System Settings → Privacy & Security → Accessibility → enable ClipFlow

## Architecture

| Layer | Stack |
|-------|-------|
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| Backend | Rust (Tauri 2) |
| Database | SQLite + FTS5 (`~/Library/Application Support/ClipFlow/clipflow.db`) |
| Clipboard | `arboard` + AppleScript (files, paste simulation) |
| Hotkeys | `tauri-plugin-global-shortcut` |

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌃⌘V` | Toggle Notch Shelf |
| `⌃⇧⌘V` | Toggle Quick Paste (classic) |
| `⌃⌘0`–`⌃⌘9` | Paste recent item (0 = most recent) |
| Double-click card | Paste item |

## Roadmap

- [x] Sprint 1 — SQLite, clipboard capture, history
- [x] Sprint 2 — Search, categories, favorites
- [x] Sprint 3 — Quick Paste, global shortcuts
- [x] Sprint 4 — Visual library, previews
- [ ] Sprint 5 — Auto-classification, templates, tags
- [ ] Sprint 6 — Sync, backup, OCR

## License

Private — all rights reserved.
