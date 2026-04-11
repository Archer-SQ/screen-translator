import { BrowserWindow, ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const regionWindows = new Set<BrowserWindow>();

export interface RegionOverlayData {
  screenshotPath: string;
  blocks: Array<{ text: string; translated: string; x: number; y: number; width: number; height: number }>;
  regionX: number;      // global screen coords
  regionY: number;
  regionWidth: number;  // CSS pixels
  regionHeight: number;
}

ipcMain.on('region-overlay-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    regionWindows.delete(win);
    win.destroy();
  }
});

ipcMain.on('region-overlay-move-by', (event, { dx, dy }: { dx: number; dy: number }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    win.setPosition(Math.round(x + dx), Math.round(y + dy));
  }
});

ipcMain.on('region-overlay-resize-by', (event, { delta }: { delta: number }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const [w, h] = win.getSize();
    const [x, y] = win.getPosition();
    const scale = 1 + delta * 0.02;
    const newW = Math.max(80, Math.round(w * scale));
    const newH = Math.max(60, Math.round(h * scale));
    const newX = Math.round(x + (w - newW) / 2);
    const newY = Math.round(y + (h - newH) / 2);
    win.setBounds({ x: newX, y: newY, width: newW, height: newH });
  }
});

ipcMain.on('region-overlay-resize-edge', (event, { mode, dx, dy }: { mode: string; dx: number; dy: number }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  let newX = x, newY = y, newW = w, newH = h;
  if (mode.includes('e')) newW = w + dx;
  if (mode.includes('s')) newH = h + dy;
  if (mode.includes('w')) { newX = x + dx; newW = w - dx; }
  if (mode.includes('n')) { newY = y + dy; newH = h - dy; }
  if (newW < 80 || newH < 60) return;
  win.setBounds({ x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) });
});

export function showRegionOverlay(data: RegionOverlayData) {
  // Min size to keep the titlebar usable
  const minW = Math.max(data.regionWidth, 120);
  const minH = Math.max(data.regionHeight, 80);

  const win = new BrowserWindow({
    x: Math.round(data.regionX),
    y: Math.round(data.regionY),
    width: Math.round(data.regionWidth),
    height: Math.round(data.regionHeight),
    minWidth: 80,
    minHeight: 60,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    resizable: true,
    movable: true,
    focusable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'region-overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'region-overlay.html'));

  let screenshotDataUrl = '';
  try {
    const buf = fs.readFileSync(data.screenshotPath);
    screenshotDataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    console.error('[region] Failed to read screenshot:', err);
  }

  const send = () => {
    win.webContents.send('show-translation', {
      blocks: data.blocks,
      screenshotDataUrl,
      regionWidth: data.regionWidth,
      regionHeight: data.regionHeight,
    });
    win.show();
    console.log('[region] Overlay shown');
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }

  regionWindows.add(win);
  win.on('closed', () => {
    regionWindows.delete(win);
    try { fs.unlinkSync(data.screenshotPath); } catch {}
  });
}

export function closeAllRegionOverlays() {
  for (const win of regionWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
  regionWindows.clear();
}
