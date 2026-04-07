<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="Screen Translator">
</p>

<h1 align="center">Screen Translator</h1>

<p align="center">
  <strong>Instant screen translation overlay for macOS</strong>
</p>

<p align="center">
  One hotkey. Screenshot. OCR. Translate. Overlay. Seamless.
</p>

<p align="center">
  <a href="#installation">Installation</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#usage">Usage</a> &bull;
  <a href="#configuration">Configuration</a> &bull;
  <a href="#development">Development</a>
</p>

---

## What is Screen Translator?

Screen Translator captures your screen, detects text via macOS native OCR, translates it through your preferred translation service, and overlays the translated text directly on top of the original — pixel-perfect, as if the app was natively localized.

No copy-pasting. No switching windows. Just press a hotkey and read your screen in your language.

## Features

- **One-Key Translation** — Press `Shift+Z+X` to capture, OCR, translate, and overlay in one step
- **Pixel-Perfect Overlay** — Canvas-based rendering matches original font size, background color, and position
- **Free by Default** — Google Translate built-in, no API key required
- **Multiple Providers** — Google (free), OpenAI, Anthropic/Claude, DeepL, Ollama (local)
- **Native macOS OCR** — Uses Apple Vision framework for fast, accurate text detection
- **Accessibility Enhanced** — Combines OCR with macOS Accessibility API for precise text positioning
- **Smart Caching** — Save translations with `Shift+S` for instant re-display
- **Auto Proxy Detection** — Reads macOS system proxy settings automatically
- **Pure Tray App** — Lives in your menu bar, no dock icon, no window clutter
- **Configurable Hotkeys** — Customize all keyboard shortcuts in Settings

## Installation

### Download

Download the latest release from [Releases](https://github.com/user/screen-translator/releases).

### Build from Source

```bash
# Clone
git clone https://github.com/user/screen-translator.git
cd screen-translator

# Install dependencies
npm install

# Build & run
npm run dev

# Package as .app
npx electron-builder --mac --dir
# Output: dist/mac-arm64/Screen Translator.app
```

### Requirements

- macOS 13.0+ (Ventura or later)
- **Screen Recording** permission (for screenshot capture)
- **Accessibility** permission (for global hotkeys and text detection)

## Usage

### Quick Start

1. Launch Screen Translator — it appears as a **T** icon in your menu bar
2. Press **Shift + Z + X** to translate your screen
3. Press **ESC** or click anywhere to dismiss the overlay
4. Press **Shift + S** while overlay is visible to cache the translation

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift + Z + X` | Capture & translate screen |
| `ESC` | Dismiss overlay / Cancel translation |
| `Shift + S` | Save current translation to cache |

All shortcuts are configurable in Settings.

### Tray Menu

Right-click (or click) the **T** menu bar icon to access:

- **Translate** — Trigger translation manually
- **Hide** — Dismiss current overlay
- **Clear Cache** — Remove all cached translations
- **Settings** — Open configuration window
- **Quit** — Exit the application

## Configuration

Open **Settings** from the tray menu to configure:

### Translation Provider

| Provider | API Key Required | Notes |
|----------|:---:|-------|
| **Google Translate** | No | Free, auto-detects system proxy |
| **OpenAI Compatible** | Yes | GPT-4o-mini default, custom endpoint supported |
| **Anthropic Compatible** | Yes | Claude, MiniMax, etc. |
| **DeepL** | Yes | High quality European languages |
| **Ollama** | No | Local models, requires Ollama running |

### Target Language

Supports all major languages: Chinese (Simplified/Traditional), Japanese, Korean, English, French, German, Spanish, and more.

### Proxy Support

Screen Translator automatically detects your macOS system proxy settings. No manual configuration needed — if your system proxy is set in **System Settings → Network → Proxies**, the app will use it.

## How It Works

```
Shift+Z+X
    ↓
┌─────────────┐
│  Screenshot  │  macOS screencapture (no cursor)
└──────┬──────┘
       ↓
┌──────┴──────┐
│  OCR + AX   │  Vision framework + Accessibility API (parallel)
└──────┬──────┘
       ↓
┌──────┴──────┐
│   Filter    │  Remove target-language text, symbols, icons
└──────┬──────┘
       ↓
┌──────┴──────┐
│  Translate  │  Batch API calls (20 texts per batch)
└──────┬──────┘
       ↓
┌──────┴──────┐
│   Overlay   │  Canvas: sample background → erase → draw translated text
└─────────────┘
```

### Key Technical Details

- **Coordinate System**: OCR returns physical pixels; Accessibility API returns CSS pixels. Both are normalized before rendering.
- **Font Size Matching**: The original font size is reverse-engineered by measuring the original text against bounding box width using `measureText()`.
- **Background Sampling**: 14 points around each text block are sampled to determine the median background color.
- **Native Hotkeys**: Uses macOS `CGEventTap` for reliable global hotkey capture, bypassing restrictions that block Electron's `globalShortcut`.

## Development

### Project Structure

```
src/main/            Electron main process (TypeScript)
  index.ts           Entry point: translation flow orchestration
  screenshot.ts      Screen capture
  ocr.ts             Vision framework OCR wrapper
  accessibility.ts   macOS Accessibility API wrapper
  translator.ts      Translation provider dispatcher
  providers/         google | openai | claude | deepl | ollama
  overlay.ts         Overlay window management
  hotkey.ts          Native hotkey process manager
  tray.ts            System tray menu
  config.ts          Configuration (~/Library/Application Support/)

src/renderer/        Renderer (plain HTML/JS)
  overlay.html/js    Canvas-based translation overlay
  settings.html/js   Settings UI with i18n (CN/EN)

scripts/             Native macOS tools (Objective-C)
  ocr-macos.m        Vision framework OCR
  hotkey-macos.m     CGEventTap global hotkey monitor
  axtext-macos.m     Accessibility API text reader
```

### Commands

```bash
npm run dev          # Build + launch
npm run build        # TypeScript compile only
npm start            # Build + launch (same as dev)
npx electron .       # Launch without rebuild
```

### Native Tools

The Objective-C tools are compiled automatically on first run. To compile manually:

```bash
clang -O2 scripts/ocr-macos.m -o scripts/ocr-macos \
  -framework Foundation -framework Vision -framework AppKit -fobjc-arc

clang -O2 scripts/hotkey-macos.m -o scripts/hotkey-macos \
  -framework Foundation -framework Carbon -framework AppKit -fobjc-arc

clang -O2 scripts/axtext-macos.m -o scripts/axtext-macos \
  -framework Foundation -framework AppKit -framework ApplicationServices -fobjc-arc
```

## License

MIT

## Acknowledgments

- [google-translate-api-x](https://github.com/AidanWelch/google-translate-api) — Free Google Translate API
- [Electron](https://www.electronjs.org/) — Cross-platform desktop framework
- Apple Vision Framework — Native macOS OCR
- Apple Accessibility API — UI element text detection
