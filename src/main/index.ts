import { app, screen, systemPreferences, dialog } from 'electron';
import { takeScreenshot } from './screenshot';
import { performOCR, performOCRSplit, TextBlock } from './ocr';
import { getAccessibilityText, AXTextBlock } from './accessibility';
import { translate } from './translator';
import { getConfig } from './config';
import { ensureOverlayWindow, showOverlay, hideOverlay, isOverlayVisible, showLoading, hideLoading, showCancelled, setDismissCallback } from './overlay';
import { createTray, openSettings, setTranslateCallback, setHideCallback, setClearCacheCallback, setOverlayVisibleFn, updateTrayMenu } from './tray';
import { startHotkeyMonitor, stopHotkeyMonitor, restartWithHotkeys, sendHotkeyState } from './hotkey';
import { showSelection, cancelSelection, isSelectionActive } from './selection';
import { showRegionOverlay, closeAllRegionOverlays } from './region-overlay';
import * as fs from 'fs';
import * as crypto from 'crypto';

let isProcessing = false;
let isRegionProcessing = false;
let isCancelled = false;
let lastTriggerTime = 0;
let lastRegionTriggerTime = 0;
let activeProgressTimer: ReturnType<typeof setInterval> | null = null;
const DEBOUNCE_MS = 2000;

// Tray app: don't quit when all windows are closed
app.on('window-all-closed', () => {
  // Do nothing — keep running in tray
});

// Translation cache: text hash → translated blocks (only saved manually via Shift+S)
const translationCache = new Map<string, { blocks: any[] }>();
const MAX_CACHE_SIZE = 5;
let pendingCacheKey: string | null = null;
let pendingCacheBlocks: any[] | null = null;

function toggleTranslate() {
  if (isOverlayVisible()) {
    hideOverlay();
    sendHotkeyState('HIDDEN');
    pendingCacheKey = null;
    pendingCacheBlocks = null;
    updateTrayMenu();
    return;
  }
  const now = Date.now();
  if (isProcessing || isRegionProcessing || now - lastTriggerTime < DEBOUNCE_MS) return;
  lastTriggerTime = now;
  handleTranslate();
}

app.whenReady().then(() => {
  // Hide dock icon — pure tray app, prevents Space switching
  app.dock?.hide();

  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    console.log(`Accessibility trusted: ${trusted}`);
    if (!trusted) {
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Permission Required',
        message: 'Screen Translator needs Accessibility permission to use global hotkeys.\n\nPlease grant permission in System Settings → Privacy & Security → Accessibility, then restart the app.',
        buttons: ['OK'],
      });
    }

    // Check Screen Recording permission
    const hasScreenAccess = systemPreferences.getMediaAccessStatus('screen');
    console.log(`Screen Recording: ${hasScreenAccess}`);
    if (hasScreenAccess !== 'granted') {
      dialog.showMessageBoxSync({
        type: 'warning',
        title: 'Screen Recording Permission',
        message: 'Screen Translator needs Screen Recording permission to capture your screen.\n\nWithout this permission, screenshots will only show the desktop wallpaper.\n\nPlease grant permission in:\nSystem Settings → Privacy & Security → Screen Recording\n\nThen restart the app.',
        buttons: ['Open Settings', 'Later'],
      });
      // Try to open the settings pane
      const { exec } = require('child_process');
      exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"');
    }
  }

  createTray();
  ensureOverlayWindow(); // Pre-create for instant display

  const dismissOverlay = () => {
    if (isOverlayVisible()) {
      hideOverlay();
      sendHotkeyState('HIDDEN');
      pendingCacheKey = null;
      pendingCacheBlocks = null;
      isProcessing = false;
      updateTrayMenu();
    }
  };
  setDismissCallback(dismissOverlay);

  // Open settings on first launch so user knows the app is running
  setTimeout(() => openSettings(), 500);
  setTranslateCallback(() => {
    const now = Date.now();
    if (isProcessing || isRegionProcessing || isOverlayVisible() || now - lastTriggerTime < DEBOUNCE_MS) return;
    lastTriggerTime = now;
    handleTranslate().then(() => updateTrayMenu());
  });
  setHideCallback(() => {
    hideOverlay();
    sendHotkeyState('HIDDEN');
    updateTrayMenu();
  });
  setOverlayVisibleFn(isOverlayVisible);
  setClearCacheCallback(() => {
    translationCache.clear();
    console.log('[cache] Cleared by user');
    showLoading('Cache cleared!');
    setTimeout(() => hideLoading(), 800);
  });

  startHotkeyMonitor(
    // onTrigger
    () => { toggleTranslate(); },
    // onDismiss — overlay visible: close it; also cancel any in-progress selection
    () => {
      cancelSelection();
      if (isOverlayVisible()) {
        hideOverlay();
        sendHotkeyState('HIDDEN');
        pendingCacheKey = null;
        pendingCacheBlocks = null;
        isProcessing = false;
        isRegionProcessing = false;
        updateTrayMenu();
      }
    },
    // onSaveCache — save but keep overlay visible
    () => {
      if (isOverlayVisible() && pendingCacheKey && pendingCacheBlocks) {
        if (!translationCache.has(pendingCacheKey)) {
          if (translationCache.size >= MAX_CACHE_SIZE) {
            const firstKey = translationCache.keys().next().value;
            if (firstKey) translationCache.delete(firstKey);
          }
          translationCache.set(pendingCacheKey, { blocks: pendingCacheBlocks });
          console.log(`[cache] Saved (Shift+S), hash: ${pendingCacheKey}`);
        } else {
          console.log(`[cache] Already cached, hash: ${pendingCacheKey}`);
        }
        // Don't hide overlay — just show brief toast
        showLoading('Cached!');
        setTimeout(() => hideLoading(), 800);
      }
    },
    // onCancel — ESC or re-trigger during translating
    () => {
      cancelSelection();
      if (isProcessing) {
        isCancelled = true;
        if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }
        showCancelled();
        isProcessing = false;
        isRegionProcessing = false;
        sendHotkeyState('HIDDEN');
        updateTrayMenu();
      }
      if (isRegionProcessing) {
        isRegionProcessing = false;
        hideLoading();
      }
    },
    // onRegion — toggle: if selection is open, close it; otherwise start region translate
    () => {
      // Already in selection mode — close it (toggle off)
      if (isSelectionActive()) {
        cancelSelection();
        isRegionProcessing = false;
        return;
      }
      const now = Date.now();
      if (isProcessing || isRegionProcessing || now - lastRegionTriggerTime < DEBOUNCE_MS) return;
      lastRegionTriggerTime = now;
      handleRegionTranslate();
    },
    {
      trigger: getConfig().hotkey,
      dismiss: getConfig().dismissKey,
      cache: getConfig().cacheKey,
      region: getConfig().regionKey,
    }
  );

  const config = getConfig();
  console.log(`Screen Translator started. Hotkey: ${config.hotkey}`);
  // Google is free, no API key needed. Only show settings if using a paid provider without key.
  const providerConf = config.providers[config.provider];
  if (!providerConf?.apiKey && !['google', 'ollama'].includes(config.provider)) {
    openSettings();
  }

  // Settings via tray icon only (dock is hidden)
});

async function handleTranslate() {
  isProcessing = true;
  isCancelled = false;
  const config = getConfig();

  try {
    // Capture frontmost app PID before showing any UI (for AX to query the right app)
    const { execSync } = require('child_process');
    let frontPid = 0;
    try {
      const pidStr = execSync("osascript -e 'tell application \"System Events\" to unix id of first process whose frontmost is true'", { timeout: 1000 }).toString().trim();
      frontPid = parseInt(pidStr, 10) || 0;
    } catch {}

    // Detect which display the cursor is on — translate that screen, not always primary
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const scaleFactor = display.scaleFactor;

    // Screenshot — hide any UI first so it doesn't get captured
    hideLoading();
    await new Promise(r => setTimeout(r, 200));
    const screenshotPath = await takeScreenshot(display.bounds);
    showLoading('Processing... 15%');
    if (isCancelled) { if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }; cleanup(screenshotPath); return; }

    showLoading('Detecting text... 25%');
    const [ocrBlocks, axBlocks] = await Promise.all([
      performOCRSplit(screenshotPath), // split large images into quadrants for better accuracy
      getAccessibilityText(frontPid),
    ]);
    showLoading('Analyzing... 40%');
    if (isCancelled) { if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }; cleanup(screenshotPath); return; }

    const textBlocks = refineWithAccessibility(ocrBlocks, axBlocks, scaleFactor, display.bounds);
    console.log(`[detect] OCR: ${ocrBlocks.length}, AX: ${axBlocks.length}, refined: ${textBlocks.length}`);

    if (textBlocks.length === 0) {
      if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }
      hideLoading(); cleanup(screenshotPath); return;
    }

    // Convert OCR physical pixel coords → CSS pixels using exact scaleFactor
    const cssBlocks = textBlocks.map(b => ({
      ...b,
      x: b.x / scaleFactor,
      y: b.y / scaleFactor,
      width: b.width / scaleFactor,
      height: b.height / scaleFactor,
    }));

    // Cache by text content
    const textKey = cssBlocks.map(b => b.text).sort().join('|');
    const hash = crypto.createHash('md5').update(textKey).digest('hex');

    if (translationCache.has(hash)) {
      console.log('[cache] HIT');
      if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }
      hideLoading();
      const cachedBlocks = translationCache.get(hash)!.blocks;
      pendingCacheKey = hash;
      pendingCacheBlocks = cachedBlocks;
      showOverlay({ screenshotPath, blocks: cachedBlocks, displayBounds: display.bounds });
      sendHotkeyState('SHOWN');
      updateTrayMenu();
      return;
    }

    // Filter
    const targetLang = config.targetLanguage || 'zh-CN';
    const blocksToTranslate = filterForeignBlocks(cssBlocks, targetLang);
    console.log(`[filter] ${blocksToTranslate.length} blocks to translate`);
    if (blocksToTranslate.length === 0) {
      if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }
      hideLoading(); cleanup(screenshotPath); return;
    }

    // Translate
    console.log(`[translate] ${blocksToTranslate.length} blocks via ${config.provider}...`);
    let tp = 45;
    activeProgressTimer = setInterval(() => {
      if (tp < 95) {
        const speed = tp < 85 ? (85 - tp) * 0.08 : (95 - tp) * 0.02;
        tp += Math.max(0.3, speed);
        showLoading(`Translating... ${Math.floor(tp)}%`);
      }
    }, 400);
    const texts = blocksToTranslate.map(b => b.text);
    const translations = await translate(texts, targetLang, config);
    if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }
    if (isCancelled) { cleanup(screenshotPath); return; }

    const translatedBlocks = blocksToTranslate.map((block, i) => ({
      ...block,
      translated: translations[i] || block.text,
    }));

    // Store pending cache — only saved if user presses Shift+S
    pendingCacheKey = hash;
    pendingCacheBlocks = translatedBlocks;

    // Show — instant because window is pre-created
    // Don't cleanup screenshotPath here — renderer needs the file for background
    showOverlay({ screenshotPath, blocks: translatedBlocks, displayBounds: display.bounds });
    sendHotkeyState('SHOWN');
    updateTrayMenu();
  } catch (err: any) {
    if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; };
    console.error('Translation failed:', err);
    const msg = err?.message || String(err);
    showLoading(`Error: ${msg.slice(0, 80)}`);
    setTimeout(() => hideLoading(), 3000);
  } finally {
    if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; };
    isProcessing = false;
  }
}

function filterForeignBlocks(blocks: TextBlock[], targetLang: string): TextBlock[] {
  const targetPrefix = targetLang.split('-')[0];

  return blocks.filter(block => {
    const text = block.text.trim();
    if (text.length <= 1) return false;
    if (block.confidence < 0.15) return false;


    if (/^[\d\s.,:;!?@#$%^&*()\-+=<>{}[\]|/\\~`'"•●○◆★☆✓✗→←↑↓©®™℃°…]+$/.test(text)) return false;
    if (/^https?:\/\//.test(text)) return false;
    if (/^\.\w{1,4}$/.test(text)) return false;
    if (/^[0-9a-f]{6,}$/i.test(text)) return false;
    if (/^[\d.]+[KMGTkmgt]?[Bb]?\/s?$/.test(text)) return false;
    const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text);
    if (text.length <= 2 && !hasCJK && !/[a-zA-Z]{2}/.test(text)) return false;

    if (targetPrefix === 'zh') {
      const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
      return chineseChars / text.length < 0.5;
    }
    if (targetPrefix === 'ja') {
      const jpChars = text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g)?.length || 0;
      return jpChars / text.length < 0.5;
    }
    if (targetPrefix === 'ko') {
      const koChars = text.match(/[\uac00-\ud7af]/g)?.length || 0;
      return koChars / text.length < 0.5;
    }
    const latinChars = text.match(/[a-zA-Z]/g)?.length || 0;
    if (['en', 'fr', 'de', 'es', 'pt', 'it'].includes(targetPrefix)) {
      return latinChars / text.length < 0.5;
    }
    return true;
  });
}

function rectOverlapRatio(a: {x:number,y:number,width:number,height:number}, b: {x:number,y:number,width:number,height:number}): number {
  const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const bArea = b.width * b.height;
  return bArea > 0 ? (ix * iy) / bArea : 0;
}


function refineWithAccessibility(
  ocrBlocks: TextBlock[],
  axBlocks: AXTextBlock[],
  scaleFactor: number,
  displayOffset: { x: number; y: number } = { x: 0, y: 0 }
): TextBlock[] {
  // Strip SF Symbols / Private Use Area chars (macOS system icons rendered as glyphs)
  // U+E000-U+F8FF (BMP PUA) and U+F0000-U+10FFFD (supplementary PUAs)
  const stripIconChars = (s: string): string => {
    return s
      .replace(/[\uE000-\uF8FF]/g, '')
      .replace(/[\uDB80-\uDBFF][\uDC00-\uDFFF]/g, '') // surrogate pairs in PUA-A/B
      .replace(/^[\s\-_·•●○◆★☆▶◀▲▼■□+<>←→×✕✓✗]+/, '') // leading icon-like symbols
      .trim();
  };

  // Filter garbled OCR blocks (icons misread as text)
  const cleanOcr = ocrBlocks.flatMap(ocr => {
    let text = ocr.text.trim();

    // Reject icon-shaped blocks (small + square OR small + thin)
    const r = ocr.width / Math.max(ocr.height, 1);
    const isSmall = ocr.width < 50 * scaleFactor && ocr.height < 50 * scaleFactor;
    if (isSmall && r > 0.4 && r < 2.5) return []; // square-ish icon
    if (ocr.width < 30 * scaleFactor && ocr.height < 30 * scaleFactor) return []; // tiny

    // Has SF Symbols PUA chars → likely icon glyph mixed with text
    const hasPUA = /[\uE000-\uF8FF]/.test(text);
    if (hasPUA) {
      text = stripIconChars(text);
      if (text.length < 2) return []; // pure icon
    }

    // Garbled short text with icon-like symbols
    if (text.length <= 4 && /[+<>←→×✕✓✗■□●○◆★☆▶◀▲▼]/.test(text)) return [];

    // Strip leading icon symbols even on long text (e.g. "▶ Settings")
    const stripped = stripIconChars(text);
    if (stripped !== text && stripped.length >= 2) text = stripped;

    return [{ ...ocr, text }];
  });

  if (axBlocks.length === 0) return cleanOcr;

  // Convert AX global CSS coords → display-relative physical pixels (matching OCR space)
  const axPhysical = axBlocks.map(b => ({
    text: b.text,
    x: (b.x - displayOffset.x) * scaleFactor,
    y: (b.y - displayOffset.y) * scaleFactor,
    width: b.width * scaleFactor,
    height: b.height * scaleFactor,
  }));

  const matchedAx = new Set<number>();

  const refined = cleanOcr.map(ocr => {
    let bestMatch: typeof axPhysical[0] | null = null;
    let bestScore = 0;
    let bestIdx = -1;

    for (let i = 0; i < axPhysical.length; i++) {
      const ax = axPhysical[i];
      const score = textSimilarity(ocr.text, ax.text);
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = ax;
        bestIdx = i;
      }
    }

    if (bestMatch && bestIdx >= 0) {
      matchedAx.add(bestIdx);
      return {
        ...ocr,
        text: bestMatch.text, // AX text is clean — no icon glyphs
        x: bestMatch.x,
        y: bestMatch.y,
        width: bestMatch.width,
        height: bestMatch.height,
      };
    }
    return ocr;
  });

  // Add unmatched AX blocks — these are UI elements OCR missed or merged with icons
  for (let i = 0; i < axPhysical.length; i++) {
    if (matchedAx.has(i)) continue;
    const ax = axPhysical[i];
    const text = ax.text.trim();
    if (text.length < 2) continue;
    // Skip if it overlaps significantly with any existing OCR block
    const overlaps = refined.some(r => rectOverlapRatio(r, ax) > 0.3);
    if (!overlaps) {
      refined.push({
        text,
        x: ax.x,
        y: ax.y,
        width: ax.width,
        height: ax.height,
        confidence: 0.8,
      });
    }
  }

  return refined;
}

function textSimilarity(a: string, b: string): number {
  const la = a.trim().toLowerCase();
  const lb = b.trim().toLowerCase();
  if (la === lb) return 1;
  if (la.includes(lb) || lb.includes(la)) return 0.8;
  // Check word overlap
  const wordsA = new Set(la.split(/\s+/));
  const wordsB = new Set(lb.split(/\s+/));
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

async function handleRegionTranslate() {
  const config = getConfig();
  isRegionProcessing = true;
  try {
    const selection = await showSelection();
    if (!selection) { isRegionProcessing = false; return; } // user cancelled

    isCancelled = false;
    showLoading('Translating... 20%');

    // Crop the pre-captured frozen screenshot to the selection region
    // (the user sees the frozen image in the selection window, so we must use the same pixels)
    const scaleFactor = screen.getDisplayNearestPoint({ x: selection.x, y: selection.y }).scaleFactor;
    const { nativeImage } = require('electron');
    const fullImg = nativeImage.createFromPath(selection.screenshotPath);
    const localX = selection.x - selection.displayBounds.x; // CSS pixels within display
    const localY = selection.y - selection.displayBounds.y;
    const cropped = fullImg.crop({
      x: Math.round(localX * scaleFactor),
      y: Math.round(localY * scaleFactor),
      width: Math.round(selection.width * scaleFactor),
      height: Math.round(selection.height * scaleFactor),
    });
    const os = require('os');
    const screenshotPath = require('path').join(os.tmpdir(), `region-${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, cropped.toPNG());
    cleanup(selection.screenshotPath); // discard full display screenshot

    showLoading('Translating... 40%');
    const ocrBlocks = await performOCR(screenshotPath);
    if (ocrBlocks.length === 0) {
      hideLoading();
      cleanup(screenshotPath);
      isProcessing = false;
      return;
    }

    // OCR returns physical pixels; convert to CSS pixels relative to region
    const cssBlocks = ocrBlocks.map(b => ({
      ...b,
      x: b.x / scaleFactor,
      y: b.y / scaleFactor,
      width: b.width / scaleFactor,
      height: b.height / scaleFactor,
    }));

    const targetLang = config.targetLanguage || 'zh-CN';
    const blocksToTranslate = filterForeignBlocks(cssBlocks, targetLang);
    if (blocksToTranslate.length === 0) {
      hideLoading();
      cleanup(screenshotPath);
      isProcessing = false;
      return;
    }

    showLoading('Translating... 70%');
    const texts = blocksToTranslate.map(b => b.text);
    const translations = await translate(texts, targetLang, config);

    const translatedBlocks = blocksToTranslate.map((block, i) => ({
      ...block,
      translated: translations[i] || block.text,
    }));

    hideLoading();
    showRegionOverlay({
      screenshotPath,
      blocks: translatedBlocks,
      regionX: selection.x,
      regionY: selection.y,
      regionWidth: selection.width,
      regionHeight: selection.height,
    });
  } catch (err: any) {
    console.error('[region] Translation failed:', err);
    const msg = err?.message || String(err);
    showLoading(`Error: ${msg.slice(0, 80)}`);
    setTimeout(() => hideLoading(), 3000);
  } finally {
    isRegionProcessing = false;
  }
}

function cleanup(filepath: string) {
  try { fs.unlinkSync(filepath); } catch {}
}

app.on('will-quit', () => {
  stopHotkeyMonitor();
});
