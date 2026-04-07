import { app, screen, systemPreferences, dialog } from 'electron';
import { takeScreenshot } from './screenshot';
import { performOCR, TextBlock } from './ocr';
import { getAccessibilityText, AXTextBlock } from './accessibility';
import { translate } from './translator';
import { getConfig } from './config';
import { ensureOverlayWindow, showOverlay, hideOverlay, isOverlayVisible, showLoading, hideLoading, showCancelled } from './overlay';
import { createTray, openSettings, setTranslateCallback, setHideCallback, setClearCacheCallback, setOverlayVisibleFn, updateTrayMenu } from './tray';
import { startHotkeyMonitor, stopHotkeyMonitor, restartWithHotkeys, sendHotkeyState } from './hotkey';
import * as fs from 'fs';
import * as crypto from 'crypto';

let isProcessing = false;
let isCancelled = false;
let lastTriggerTime = 0;
let activeProgressTimer: ReturnType<typeof setInterval> | null = null;
const DEBOUNCE_MS = 1500;

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
  if (isProcessing || now - lastTriggerTime < DEBOUNCE_MS) return;
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
  }

  createTray();
  ensureOverlayWindow(); // Pre-create for instant display
  setTranslateCallback(() => {
    const now = Date.now();
    if (isProcessing || isOverlayVisible() || now - lastTriggerTime < DEBOUNCE_MS) return;
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
    // onDismiss — overlay visible: close it
    () => {
      if (isOverlayVisible()) {
        hideOverlay();
        sendHotkeyState('HIDDEN');
        pendingCacheKey = null;
        pendingCacheBlocks = null;
        isProcessing = false;
        updateTrayMenu();
      }
    },
    // onSaveCache
    () => {
      if (isOverlayVisible() && pendingCacheKey && pendingCacheBlocks) {
        if (translationCache.size >= MAX_CACHE_SIZE) {
          const firstKey = translationCache.keys().next().value;
          if (firstKey) translationCache.delete(firstKey);
        }
        translationCache.set(pendingCacheKey, { blocks: pendingCacheBlocks });
        console.log(`[cache] Saved (Shift+S), hash: ${pendingCacheKey}`);
        pendingCacheKey = null;
        pendingCacheBlocks = null;
        hideOverlay();
        sendHotkeyState('HIDDEN');
        showLoading('Cached!');
        setTimeout(() => hideLoading(), 800);
        updateTrayMenu();
      }
    },
    // onCancel — ESC or re-trigger during translating
    () => {
      if (isProcessing) {
        isCancelled = true;
        if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }
        showCancelled();
        isProcessing = false;
        sendHotkeyState('HIDDEN');
        updateTrayMenu();
      }
    },
    { trigger: getConfig().hotkey, dismiss: getConfig().dismissKey, cache: getConfig().cacheKey }
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
    showLoading('Capturing... 5%');

    // 1. Screenshot
    const screenshotPath = await takeScreenshot();
    showLoading('Processing... 15%');
    if (isCancelled) { if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }; cleanup(screenshotPath); return; }

    const display = screen.getPrimaryDisplay();
    const scaleFactor = display.scaleFactor;

    showLoading('Detecting text... 25%');
    const [ocrBlocks, axBlocks] = await Promise.all([
      performOCR(screenshotPath),
      getAccessibilityText(),
    ]);
    showLoading('Analyzing... 40%');
    if (isCancelled) { if (activeProgressTimer) { clearInterval(activeProgressTimer); activeProgressTimer = null; }; cleanup(screenshotPath); return; }

    const textBlocks = refineWithAccessibility(ocrBlocks, axBlocks, scaleFactor);
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
      showOverlay({ screenshotPath, blocks: translationCache.get(hash)!.blocks });
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
    showOverlay({ screenshotPath, blocks: translatedBlocks });
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
    // Skip low-confidence OCR results (likely garbled from icons/small text)
    if (block.confidence < 0.3) return false;

    // Skip icons, symbols, pure numbers, URLs, file extensions, hex strings
    if (/^[\d\s.,:;!?@#$%^&*()\-+=<>{}[\]|/\\~`'"•●○◆★☆✓✗→←↑↓©®™℃°…]+$/.test(text)) return false;
    if (/^https?:\/\//.test(text)) return false;
    if (/^\.\w{1,4}$/.test(text)) return false; // .pdf, .jpg etc
    if (/^[0-9a-f]{6,}$/i.test(text)) return false; // hex hashes
    if (/^[\d.]+[KMGTkmgt]?[Bb]?\/s?$/.test(text)) return false; // 0.0M/s
    if (text.length <= 2 && !/[a-zA-Z]{2}/.test(text)) return false; // very short non-word

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

function mergeAdjacentBlocks(blocks: TextBlock[]): TextBlock[] {
  if (blocks.length <= 1) return blocks;

  // Sort by Y position, then X
  const sorted = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const merged: TextBlock[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const verticalGap = next.y - (current.y + current.height);
    const horizontalOverlap = Math.abs(current.x - next.x) < current.width * 0.3;
    const similarHeight = Math.abs(current.height - next.height) < current.height * 0.5;
    const isAdjacentLine = verticalGap >= 0 && verticalGap < current.height * 0.8
                           && horizontalOverlap && similarHeight;

    if (isAdjacentLine) {
      // Merge: expand bounding box, concatenate text
      const minX = Math.min(current.x, next.x);
      const minY = current.y;
      const maxX = Math.max(current.x + current.width, next.x + next.width);
      const maxY = next.y + next.height;
      current = {
        text: current.text + ' ' + next.text,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        confidence: Math.min(current.confidence, next.confidence),
      };
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

// Refine OCR positions using Accessibility API data
function refineWithAccessibility(
  ocrBlocks: TextBlock[],
  axBlocks: AXTextBlock[],
  scaleFactor: number
): TextBlock[] {
  if (axBlocks.length === 0) return ocrBlocks;

  // Convert AX logical coords to physical (to match OCR coordinate space)
  const axPhysical = axBlocks.map(b => ({
    text: b.text,
    x: b.x * scaleFactor,
    y: b.y * scaleFactor,
    width: b.width * scaleFactor,
    height: b.height * scaleFactor,
  }));

  return ocrBlocks.map(ocr => {
    // Find best matching AX element by text similarity
    let bestMatch: typeof axPhysical[0] | null = null;
    let bestScore = 0;

    for (const ax of axPhysical) {
      const score = textSimilarity(ocr.text, ax.text);
      if (score > bestScore && score > 0.6) {
        bestScore = score;
        bestMatch = ax;
      }
    }

    if (bestMatch) {
      // Use AX position (more precise), keep OCR text
      return {
        ...ocr,
        x: bestMatch.x,
        y: bestMatch.y,
        width: bestMatch.width,
        height: bestMatch.height,
      };
    }
    return ocr;
  });
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

function cleanup(filepath: string) {
  try { fs.unlinkSync(filepath); } catch {}
}

app.on('will-quit', () => {
  stopHotkeyMonitor();
});
