# Screen Translator

macOS 桌面截图翻译工具。截屏 → OCR → 翻译 → Canvas 直接绘制覆盖。

## Commands

```bash
cd ~/Desktop/code/screen-translator
npm run dev          # 编译 + 启动
npx tsc              # 仅编译 TypeScript
npx electron .       # 仅启动（需先编译）

# 编译原生工具（Objective-C）
clang -O2 scripts/ocr-macos.m -o scripts/ocr-macos -framework Foundation -framework Vision -framework AppKit -fobjc-arc
clang -O2 scripts/hotkey-macos.m -o scripts/hotkey-macos -framework Foundation -framework Carbon -framework AppKit -fobjc-arc
clang -O2 scripts/axtext-macos.m -o scripts/axtext-macos -framework Foundation -framework AppKit -framework ApplicationServices -fobjc-arc
```

## Architecture

```
src/main/           Electron 主进程 (TypeScript → dist/main/)
  index.ts          入口：翻译流程编排、防抖、缓存、进度
  screenshot.ts     screencapture 截屏（无光标）
  ocr.ts            调用 ocr-macos 二进制，返回 TextBlock[]
  accessibility.ts  调用 axtext-macos 二进制，返回 AXTextBlock[]
  translator.ts     翻译调度器 → providers/
  providers/        openai.ts | claude.ts | deepl.ts | ollama.ts
  overlay.ts        覆盖层窗口管理（预创建、show/hide/destroy）
  hotkey.ts         启动 hotkey-macos 进程，监听 stdout
  tray.ts           系统托盘菜单
  config.ts         配置读写 ~/Library/Application Support/screen-translator/config.json
  http.ts           Electron net 模块 HTTP 请求

src/renderer/       渲染层（纯 HTML/JS，不用框架）
  overlay.html/js   Canvas 直接绘制：擦除原文 + 绘制译文
  settings.html/js  设置页面

src/preload/        Electron preload 脚本
  overlay-preload.ts   暴露 onShowTranslation / onClear / dismiss
  settings-preload.ts  暴露 getConfig / saveConfig

scripts/            原生 macOS 工具（Objective-C）
  ocr-macos.m       Vision 框架 OCR，输出 JSON [{text,x,y,width,height,confidence}]
  hotkey-macos.m    CGEventTap 全局热键监听，stdout 输出 TRIGGERED/DISMISS
  axtext-macos.m    Accessibility API 读取 UI 元素文本和精确坐标
```

## Key Technical Decisions

- **原生工具用 Objective-C + clang**，不用 Swift（系统 swiftc 版本冲突）
- **Canvas 直接绘制**替代 HTML div 覆盖（像素级精度，无 CSS 偏移）
- **OCR 坐标是物理像素**，主进程用 `/ scaleFactor` 转 CSS 像素，renderer 用 `* (imgWidth / windowWidth)` 转回截图像素绘制
- **字号反推**：用原文 + bounding box 宽度通过 measureText 反算原始字号
- **热键 Shift+Z+X** 通过 CGEventTap 原生监听（绕过安全软件对 Electron globalShortcut 的拦截）
- **覆盖层预创建**：启动时创建隐藏窗口，翻译完直接 show
- **翻译缓存**：用 OCR 文本内容 hash（非截图 hash），光标/动画变化不影响命中
- **分批翻译**：每 20 个文本一批调 API，避免 token 超限
- **dismiss 即 destroy**：关闭覆盖层销毁窗口，500ms 后预创建新窗口

## Translation Flow

1. Shift+Z+X → hotkey-macos 输出 TRIGGERED
2. screencapture 截屏（不含光标）
3. OCR + AX 并行：OCR 全覆盖，AX 修正坐标精度
4. 文本 hash → 检查缓存
5. 过滤：去掉母语、图标、符号、低置信度
6. 分批翻译（Anthropic/OpenAI 兼容 API）
7. Canvas 绘制：采样背景色 → 擦除原文 → 反推字号 → 绘制译文
8. ESC / 鼠标点击 → hotkey-macos 输出 DISMISS → destroy 窗口

## Rules

- 不要动 scripts/*.m 的编译方式，必须用 clang + fobjc-arc
- overlay 渲染必须用 Canvas 直接绘制，不要改回 HTML div 方案
- 覆盖层窗口必须设置 transparent: true + visibleOnAllWorkspaces + visibleOnFullScreen
- 翻译 provider 都走分批（BATCH_SIZE=20），prompt 发 JSON 数组收 JSON 数组
- dismiss 时必须同时 isCancelled = true + clearInterval + destroy 窗口
- 不要用 app.dock.show()，保持纯托盘应用
- 截图文件在覆盖层显示期间不要删除，下次翻译时清理上一次的
