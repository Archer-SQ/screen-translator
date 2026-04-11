import { BrowserWindow, screen, ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { takeScreenshot } from './screenshot';

let selectionWin: BrowserWindow | null = null;

export interface SelectionRect {
  x: number;      // CSS pixels, global screen space
  y: number;
  width: number;
  height: number;
  displayBounds: { x: number; y: number; width: number; height: number };
  screenshotPath: string; // pre-captured full display screenshot
}

export async function showSelection(): Promise<SelectionRect | null> {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { x, y, width, height } = display.bounds;

  // Freeze the screen: capture BEFORE showing selection window so user sees a static image
  const screenshotPath = await takeScreenshot(display.bounds);
  const dataUrl = `data:image/png;base64,${fs.readFileSync(screenshotPath).toString('base64')}`;

  return new Promise((resolve) => {
    if (selectionWin && !selectionWin.isDestroyed()) {
      selectionWin.destroy();
      selectionWin = null;
    }

    selectionWin = new BrowserWindow({
      x, y, width, height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      focusable: true,
      show: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'selection-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    selectionWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    selectionWin.setAlwaysOnTop(true, 'screen-saver');
    selectionWin.loadFile(path.join(app.getAppPath(), 'src', 'renderer', 'selection.html'));

    const cleanup = () => {
      ipcMain.removeListener('selection-confirm', onConfirm);
      ipcMain.removeListener('selection-cancel', onCancel);
      if (selectionWin && !selectionWin.isDestroyed()) {
        selectionWin.destroy();
      }
      selectionWin = null;
    };

    const onConfirm = (_e: any, rect: { x: number; y: number; width: number; height: number }) => {
      cleanup();
      resolve({
        x: display.bounds.x + rect.x,
        y: display.bounds.y + rect.y,
        width: rect.width,
        height: rect.height,
        displayBounds: display.bounds,
        screenshotPath,
      });
    };

    const onCancel = () => {
      cleanup();
      try { fs.unlinkSync(screenshotPath); } catch {}
      resolve(null);
    };

    ipcMain.once('selection-confirm', onConfirm);
    ipcMain.once('selection-cancel', onCancel);

    selectionWin.webContents.once('did-finish-load', () => {
      selectionWin?.webContents.send('selection-background', dataUrl);
      selectionWin?.show();
      selectionWin?.focus();
    });
  });
}

export function cancelSelection() {
  if (selectionWin && !selectionWin.isDestroyed()) {
    selectionWin.destroy();
    selectionWin = null;
  }
}
