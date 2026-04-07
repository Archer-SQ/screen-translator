import { Tray, Menu, nativeImage, BrowserWindow, ipcMain, app } from 'electron';
import { getConfig, saveConfig } from './config';
import * as path from 'path';

let tray: Tray | null = null;
let settingsWin: BrowserWindow | null = null;

let onTranslateCallback: (() => void) | null = null;
let onHideCallback: (() => void) | null = null;
let onClearCacheCallback: (() => void) | null = null;
let isOverlayVisibleFn: (() => boolean) | null = null;

export function setTranslateCallback(cb: () => void) {
  onTranslateCallback = cb;
}

export function setHideCallback(cb: () => void) {
  onHideCallback = cb;
}

export function setClearCacheCallback(cb: () => void) {
  onClearCacheCallback = cb;
}

export function setOverlayVisibleFn(fn: () => boolean) {
  isOverlayVisibleFn = fn;
}

const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVR42mNgGCzgP5l4EBlAjLcoDpdRA0amAfQBAJD/TbNSEdbvAAAAAElFTkSuQmCC';

export function createTray() {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`);
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Screen Translator');

  updateTrayMenu();

  ipcMain.handle('get-config', () => getConfig());
  ipcMain.handle('save-config', (_event, config) => {
    const result = saveConfig(config);
    if (config.hotkey || config.dismissKey || config.cacheKey) {
      const { restartWithHotkeys } = require('./hotkey');
      restartWithHotkeys({ trigger: config.hotkey, dismiss: config.dismissKey, cache: config.cacheKey });
    }
    return result;
  });
  ipcMain.handle('resize-settings', (_event, contentHeight: number) => {
    if (settingsWin && !settingsWin.isDestroyed()) {
      const titleBarHeight = 28;
      const bounds = settingsWin.getBounds();
      settingsWin.setBounds(
        { x: bounds.x, y: bounds.y, width: bounds.width, height: contentHeight + titleBarHeight },
        true // animate on macOS
      );
    }
  });
}

export function updateTrayMenu() {
  if (!tray) return;
  const overlayVisible = isOverlayVisibleFn ? isOverlayVisibleFn() : false;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Translate',
      enabled: !overlayVisible,
      click: () => {
        if (onTranslateCallback) onTranslateCallback();
        setTimeout(() => updateTrayMenu(), 1000);
      },
    },
    {
      label: 'Hide',
      enabled: overlayVisible,
      click: () => {
        if (onHideCallback) onHideCallback();
        setTimeout(() => updateTrayMenu(), 300);
      },
    },
    { type: 'separator' },
    {
      label: 'Clear Cache',
      click: () => {
        if (onClearCacheCallback) onClearCacheCallback();
      },
    },
    {
      label: 'Settings',
      click: openSettings,
    },
    {
      label: 'Quit',
      role: 'quit',
    },
  ]);
  tray.setContextMenu(contextMenu);
}

export function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 480,
    height: 450,
    resizable: true,
    minimizable: false,
    title: 'Screen Translator Settings',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWin.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'settings.html'));

  settingsWin.on('closed', () => {
    settingsWin = null;
  });
}
