<p align="center">
  <img src="resources/icon.png" width="128" height="128" alt="Screen Translator">
</p>

<h1 align="center">Screen Translator</h1>

<p align="center"><strong>macOS 屏幕翻译工具 · 全屏翻译 · 选区翻译 · 像素级原位覆盖</strong></p>

<p align="center">
  <a href="https://github.com/Archer-SQ/screen-translator/releases"><img src="https://img.shields.io/github/v/release/Archer-SQ/screen-translator?style=flat&label=Release" alt="Release"></a>
  <a href="https://github.com/Archer-SQ/screen-translator/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Archer-SQ/screen-translator?style=flat" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-macOS%2013%2B-lightgrey?style=flat" alt="macOS">
  <img src="https://img.shields.io/badge/Electron-33-47848f?style=flat" alt="Electron">
</p>

<p align="center">
  <a href="https://github.com/Archer-SQ/screen-translator/releases/latest">下载</a> · 
  <a href="https://archer-sq.github.io/screen-translator/">官网</a> · 
  <a href="./README_EN.md">English</a>
</p>

---

## 这是什么？

Screen Translator 让你在 macOS 上一键翻译屏幕上的任何文字 — 网页、应用、游戏、设置、错误提示，都能直接在原位置覆盖译文，像原生汉化一样。

两种模式：
- **全屏翻译**（`Shift+Z+X`）— 按一下翻译整个屏幕
- **选区翻译**（`Shift+Z+C`）— 像 Snipaste 一样拖拽框选，只翻译你关心的部分

## 特性

### 核心
- **两种翻译模式** — 全屏一键翻译 / 选区框选翻译
- **冻结截图** — 按下快捷键瞬间画面冻结，动态视频、游戏、动画也能精确框选
- **像素级原位覆盖** — Canvas 直接绘制，自动匹配字号和背景色，看起来像原生汉化
- **多屏支持** — 自动检测光标所在屏，翻译那一屏

### 浮层交互
- **任意位置可拖拽** — 不限于标题栏，整个浮层都能抓取移动
- **8 方向边缘缩放** — 窗口边缘鼠标自动切换 resize 光标
- **触控板双指捏合缩放** — 支持 Apple 触控板手势
- **双击关闭** — 简洁统一
- **常驻置顶** — 可覆盖全屏应用

### OCR & 翻译
- **2x2 象限分割 OCR** — 大屏截图切成 4 个重叠象限并行 OCR，精度更高
- **对比度增强预处理** — Core Image 改善低对比度文字（终端、dim UI）
- **Vision Revision 3** — 使用 macOS 最新 OCR 模型
- **多引擎** — Google（免费）/ OpenAI / Anthropic / DeepL / Ollama
- **翻译缓存** — `Shift+S` 手动保存，相同内容秒显
- **自动代理** — 自动读取 macOS 系统代理设置

### 隐私
- 所有处理在本地完成，截图不上传
- API 密钥仅存储在本地配置文件

## 安装

### 从 Release 下载

从 [Releases](https://github.com/Archer-SQ/screen-translator/releases/latest) 下载最新 DMG，双击打开后拖入 Applications。

**首次打开提示「已损坏」？** 应用未经 Apple 签名，终端执行一次即可：
```bash
xattr -cr /Applications/Screen\ Translator.app
```

### 从源码构建

```bash
git clone https://github.com/Archer-SQ/screen-translator.git
cd screen-translator
npm install
npm run dev
```

打包 .app：
```bash
npx electron-builder --mac --dir
```

### 系统要求

- macOS 13.0+（Apple Silicon）
- **屏幕录制** 权限（截图）
- **辅助功能** 权限（全局热键、UI 元素定位）

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Shift + Z + X` | 全屏翻译 |
| `Shift + Z + C` | 选区翻译 |
| `ESC` | 关闭浮层 / 取消翻译 |
| `Shift + S` | 保存当前翻译到缓存 |

所有快捷键可在设置页面自定义。

## 翻译服务

| 服务 | API Key | 说明 |
|------|:---:|------|
| **Google 翻译** | 否 | 免费内置，自动代理 |
| **OpenAI 兼容** | 是 | GPT-4o-mini，支持自定义端点 |
| **Anthropic 兼容** | 是 | Claude、MiniMax 等 |
| **DeepL** | 是 | 欧洲语言高质量 |
| **Ollama** | 否 | 本地模型，完全离线 |

## 工作原理

```
快捷键 → 截屏 → OCR + AX 并行识别 → 过滤 → 分批翻译 → Canvas 绘制覆盖
```

**全屏翻译**：截整屏 → 2x2 象限分割 OCR → 合并去重 → 按行翻译 → 覆盖层渲染

**选区翻译**：先冻结整屏截图 → 弹出半透明选框 → 用户拖拽 → 裁剪截图 → OCR → 翻译 → 可拖拽可缩放的独立结果窗口

**关键技术**：
- macOS Vision framework OCR（zh-Hans / zh-Hant / ja / ko / en 等）
- 原生 CGEventTap 全局热键监听
- Canvas 直接绘制（自动字号反推、背景色采样、译文覆盖）
- Accessibility API 精确定位（配合 OCR 提升坐标精度）

## 项目结构

```
src/main/                主进程（TypeScript）
  index.ts               翻译流程编排
  screenshot.ts          区域截图（screencapture -R）
  ocr.ts                 调用 OCR 二进制 + 2x2 象限分割
  accessibility.ts       AX API 包装
  translator.ts          翻译服务调度
  providers/             google | openai | claude | deepl | ollama
  overlay.ts             全屏覆盖层窗口管理
  region-overlay.ts      选区结果浮层管理（可拖拽可缩放，可多开）
  selection.ts           选区绘制窗口（Snipaste 式冻结背景）
  hotkey.ts              原生热键进程管理
  tray.ts                系统托盘菜单

src/renderer/            渲染层（纯 HTML/JS）
  overlay.html/js        Canvas 绘制全屏覆盖层
  region-overlay.html/js 选区结果浮层
  selection.html/js      选区框选 UI
  settings.html/js       设置页面（中英双语）

scripts/                 原生 macOS 工具（Objective-C）
  ocr-macos.m            Vision OCR + Core Image 对比度增强
  hotkey-macos.m         CGEventTap 全局热键
  axtext-macos.m         Accessibility 文字读取
```

## 开源协议

MIT

## 致谢

- [google-translate-api-x](https://github.com/AidanWelch/google-translate-api) — 免费 Google 翻译
- [Electron](https://www.electronjs.org/) — 桌面应用框架
- Apple Vision Framework — 原生 OCR
