import { BrowserWindow, screen, ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

let overlayWin: BrowserWindow | null = null;
let loadingWin: BrowserWindow | null = null;
let currentScreenshotPath: string | null = null;

export interface OverlayBlock {
  text: string;
  translated: string;
  x: number; // CSS pixels
  y: number;
  width: number;
  height: number;
}

export interface OverlayData {
  screenshotPath: string; // file path, not data URL
  blocks: OverlayBlock[];
}

ipcMain.on('dismiss-overlay', () => hideOverlay());

export function showLoading(progress?: string) {
  const text = progress || 'Translating...';
  if (loadingWin && !loadingWin.isDestroyed()) {
    loadingWin.webContents.executeJavaScript(
      `document.getElementById('msg').textContent = ${JSON.stringify(text)}`
    ).catch(() => {});
    return;
  }

  const { width, height } = screen.getPrimaryDisplay().size;
  loadingWin = new BrowserWindow({
    width: 240, height: 56,
    x: Math.floor(width / 2 - 120), y: Math.floor(height / 2 - 28),
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, resizable: false, movable: false, focusable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  loadingWin.setIgnoreMouseEvents(true);
  loadingWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  loadingWin.setAlwaysOnTop(true, 'screen-saver');
  loadingWin.loadURL(`data:text/html,<html><body style="margin:0;background:transparent;display:flex;justify-content:center;align-items:center;height:100vh;"><div id="msg" style="background:rgba(0,0,0,0.8);color:white;padding:12px 24px;border-radius:10px;font-size:14px;font-family:-apple-system,sans-serif;white-space:nowrap;">${text}</div></body></html>`);
  loadingWin.showInactive();
}

export function hideLoading() {
  if (loadingWin && !loadingWin.isDestroyed()) { loadingWin.destroy(); loadingWin = null; }
}

export function showCancelled() {
  hideLoading(); hideOverlay();
  const { width, height } = screen.getPrimaryDisplay().size;
  const toast = new BrowserWindow({
    width: 200, height: 50,
    x: Math.floor(width / 2 - 100), y: Math.floor(height / 2 - 25),
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, focusable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  toast.setIgnoreMouseEvents(true);
  toast.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  toast.setAlwaysOnTop(true, 'screen-saver');
  toast.loadURL(`data:text/html,<html><body style="margin:0;background:transparent;display:flex;justify-content:center;align-items:center;height:100vh;"><div style="background:rgba(0,0,0,0.7);color:white;padding:12px 24px;border-radius:10px;font-size:14px;font-family:-apple-system,sans-serif;">Translation cancelled</div></body></html>`);
  toast.showInactive();
  setTimeout(() => { if (!toast.isDestroyed()) toast.destroy(); }, 1500);
}

// Pre-create the overlay window so it's instantly ready
export function ensureOverlayWindow(): BrowserWindow {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;

  overlayWin = new BrowserWindow({
    x, y, width, height,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, resizable: false, movable: false, focusable: false,
    show: false, enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local file:// images
    },
  });

  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setBounds({ x, y, width, height });
  overlayWin.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'overlay.html'));

  return overlayWin;
}

export function showOverlay(data: OverlayData) {
  // Clean up previous screenshot
  if (currentScreenshotPath) {
    try { fs.unlinkSync(currentScreenshotPath); } catch {}
  }
  currentScreenshotPath = data.screenshotPath;

  const win = ensureOverlayWindow();
  console.log(`[overlay] Sending ${data.blocks.length} blocks`);

  // Read screenshot file and convert to data URL for reliable access from asar context
  let screenshotDataUrl = '';
  try {
    const buf = fs.readFileSync(data.screenshotPath);
    screenshotDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    console.error('[overlay] Failed to read screenshot:', err);
  }

  const send = () => {
    win.webContents.send('show-translation', { ...data, screenshotDataUrl });
    win.showInactive();
    hideLoading();
    console.log('[overlay] Shown');
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

export function hideOverlay() {
  hideLoading();
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.destroy();
    overlayWin = null;
    console.log('[overlay] Destroyed');
    // Pre-create a fresh window for next use
    setTimeout(() => ensureOverlayWindow(), 500);
  }
}

export function isOverlayVisible(): boolean {
  return overlayWin !== null && !overlayWin.isDestroyed() && overlayWin.isVisible();
}
