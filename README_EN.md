<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="Screen Translator">
</p>

<h1 align="center">Screen Translator</h1>

<p align="center">Instant screen translation overlay for macOS</p>

<p align="center">
  <a href="https://github.com/Archer-SQ/screen-translator/releases">Download</a> · 
  <a href="https://archer-sq.github.io/screen-translator/">Website</a> · 
  <a href="./README.md">中文</a>
</p>

---

## What is Screen Translator?

Screen Translator captures your screen, detects text via macOS native OCR, translates it through your preferred service, and overlays the translated text directly on top of the original — pixel-perfect, as if the app was natively localized.

No copy-pasting. No switching windows. Just press a hotkey and read.

## Features

- **One-Key Translation** — `Shift+Z+X` to capture, OCR, translate, and overlay in one step
- **Pixel-Perfect Overlay** — Canvas-based rendering matches original font size, background color, and position
- **Free by Default** — Google Translate built-in, no API key required
- **Multiple Providers** — Google (free), OpenAI, Anthropic/Claude, DeepL, Ollama (local)
- **Native macOS OCR** — Apple Vision framework for fast, accurate text detection
- **Accessibility Enhanced** — Combines OCR with Accessibility API for precise positioning
- **Translation Cache** — Save translations with `Shift+S` for instant re-display
- **Auto Proxy Detection** — Reads macOS system proxy settings automatically
- **Pure Tray App** — Lives in your menu bar, no dock icon
- **Configurable Hotkeys** — Customize all shortcuts in Settings

## Installation

### Download

Download the latest release from [Releases](https://github.com/Archer-SQ/screen-translator/releases).

### Build from Source

```bash
git clone https://github.com/Archer-SQ/screen-translator.git
cd screen-translator
npm install
npm run dev
```

Package as .app:

```bash
npx electron-builder --mac --dir
# Output: dist/mac-arm64/Screen Translator.app
```

### Requirements

- macOS 13.0+ (Ventura or later)
- **Screen Recording** permission (for screenshot capture)
- **Accessibility** permission (for global hotkeys and text detection)

## Usage

1. Launch the app — a **T** icon appears in your menu bar
2. Press **Shift + Z + X** to translate your screen
3. Press **ESC** or click anywhere to dismiss the overlay
4. Press **Shift + S** while overlay is visible to cache the translation

| Shortcut | Action |
|----------|--------|
| `Shift + Z + X` | Capture & translate |
| `ESC` | Dismiss overlay / Cancel |
| `Shift + S` | Cache translation |

All shortcuts are customizable in Settings.

## Translation Providers

| Provider | API Key | Notes |
|----------|:---:|-------|
| **Google Translate** | No | Free, auto-detects system proxy |
| **OpenAI Compatible** | Yes | GPT-4o-mini, custom endpoint |
| **Anthropic Compatible** | Yes | Claude, MiniMax, etc. |
| **DeepL** | Yes | Premium European languages |
| **Ollama** | No | Local models, fully offline |

## How It Works

```
Hotkey → Screenshot → OCR + AX parallel → Filter → Batch translate → Canvas overlay
```

- **Coordinates**: OCR returns physical pixels, AX returns logical pixels, normalized in main process
- **Font Matching**: Original font size reverse-engineered via `measureText()`
- **Background Sampling**: 14-point median sampling around text blocks
- **Native Hotkeys**: `CGEventTap` bypasses security software blocking Electron's `globalShortcut`

## Project Structure

```
src/main/            Main process (TypeScript)
  index.ts           Translation flow orchestration
  providers/         google | openai | claude | deepl | ollama
  overlay.ts         Overlay window management
  hotkey.ts          Native hotkey process manager
  ocr.ts / accessibility.ts  Text detection

src/renderer/        Renderer (plain HTML/JS)
  overlay.html/js    Canvas-based translation overlay
  settings.html/js   Settings UI (CN/EN)

scripts/             Native macOS tools (Objective-C)
  ocr-macos.m        Vision framework OCR
  hotkey-macos.m     CGEventTap global hotkeys
  axtext-macos.m     Accessibility API text reader
```

## License

MIT

## Acknowledgments

- [google-translate-api-x](https://github.com/AidanWelch/google-translate-api) — Free Google Translate
- [Electron](https://www.electronjs.org/) — Desktop framework
