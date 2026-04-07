<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="Screen Translator">
</p>

<h1 align="center">Screen Translator</h1>

<p align="center"><strong>macOS 屏幕翻译工具 — 一键截屏、OCR、翻译、像素级覆盖</strong></p>

<p align="center">
  <a href="https://github.com/Archer-SQ/screen-translator/releases"><img src="https://img.shields.io/github/v/release/Archer-SQ/screen-translator?style=flat&label=Release" alt="Release"></a>
  <a href="https://github.com/Archer-SQ/screen-translator/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Archer-SQ/screen-translator?style=flat" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-macOS%2013%2B-lightgrey?style=flat" alt="macOS">
  <img src="https://img.shields.io/badge/Electron-33-47848f?style=flat" alt="Electron">
</p>

<p align="center">
  <a href="https://github.com/Archer-SQ/screen-translator/releases">下载</a> · 
  <a href="https://archer-sq.github.io/screen-translator/">官网</a> · 
  <a href="./README_EN.md">English</a>
</p>

---

## 这是什么？

Screen Translator 可以一键截取屏幕内容，通过 macOS 原生 OCR 识别文字，调用翻译 API，然后将译文直接覆盖在原文位置上 — 像素级还原，仿佛应用本身就是你的语言。

不需要复制粘贴，不需要切换窗口。按下快捷键，直接阅读。

## 特性

- **一键翻译** — `Shift+Z+X` 完成截屏、识别、翻译、覆盖全流程
- **像素级覆盖** — Canvas 直接绘制，自动匹配字号、背景色和位置
- **开箱即用** — 内置 Google 翻译，无需 API Key
- **多种引擎** — Google（免费）、OpenAI、Anthropic/Claude、DeepL、Ollama（本地）
- **原生 OCR** — 基于 Apple Vision 框架，识别速度快、精度高
- **辅助增强** — 结合 macOS Accessibility API 精确定位文字元素
- **翻译缓存** — `Shift+S` 保存翻译结果，相同内容瞬间显示
- **自动代理** — 自动读取 macOS 系统代理设置
- **纯托盘应用** — 常驻菜单栏，不占 Dock 位置
- **快捷键可配** — 所有键位均可在设置中自定义

## 安装

### 下载安装

从 [Releases](https://github.com/Archer-SQ/screen-translator/releases) 下载最新版本。

### 从源码构建

```bash
git clone https://github.com/Archer-SQ/screen-translator.git
cd screen-translator
npm install
npm run dev
```

打包为 .app：

```bash
npx electron-builder --mac --dir
# 输出：dist/mac-arm64/Screen Translator.app
```

### 系统要求

- macOS 13.0+（Ventura 或更高）
- 需要授予 **屏幕录制** 权限（用于截屏）
- 需要授予 **辅助功能** 权限（用于全局快捷键和文字检测）

## 使用方法

1. 启动应用 — 菜单栏出现 **T** 图标
2. 按 **Shift + Z + X** 翻译当前屏幕
3. 按 **ESC** 或点击任意位置关闭浮层
4. 在浮层显示时按 **Shift + S** 缓存当前翻译

| 快捷键 | 功能 |
|--------|------|
| `Shift + Z + X` | 截屏翻译 |
| `ESC` | 关闭浮层 / 取消翻译 |
| `Shift + S` | 缓存当前翻译 |

所有快捷键均可在设置中修改。

## 翻译服务

| 服务 | 需要 API Key | 说明 |
|------|:---:|------|
| **Google 翻译** | 否 | 免费内置，自动检测系统代理 |
| **OpenAI 兼容** | 是 | 支持 GPT-4o-mini，可自定义端点 |
| **Anthropic 兼容** | 是 | Claude、MiniMax 等 |
| **DeepL** | 是 | 欧洲语言翻译质量极高 |
| **Ollama** | 否 | 本地模型，完全离线运行 |

## 工作原理

```
Shift+Z+X → 截屏 → OCR + AX 并行识别 → 过滤 → 分批翻译 → Canvas 绘制覆盖
```

- **坐标系统**：OCR 返回物理像素，AX 返回逻辑像素，主进程统一归一化
- **字号匹配**：用 `measureText()` 反推原始字号
- **背景采样**：文字周围 14 点采样取中位数
- **原生热键**：通过 `CGEventTap` 监听，绕过安全软件对 Electron 的拦截

## 项目结构

```
src/main/            主进程（TypeScript）
  index.ts           翻译流程编排
  providers/         翻译服务：google | openai | claude | deepl | ollama
  overlay.ts         覆盖层窗口管理
  hotkey.ts          原生热键进程管理
  ocr.ts / accessibility.ts  文字识别

src/renderer/        渲染层（HTML/JS）
  overlay.html/js    Canvas 绘制翻译覆盖
  settings.html/js   设置界面（中英双语）

scripts/             原生 macOS 工具（Objective-C）
  ocr-macos.m        Vision 框架 OCR
  hotkey-macos.m     CGEventTap 全局热键
  axtext-macos.m     Accessibility API 文字读取
```

## 开源协议

MIT

## 致谢

- [google-translate-api-x](https://github.com/AidanWelch/google-translate-api) — 免费 Google 翻译
- [Electron](https://www.electronjs.org/) — 桌面应用框架
