import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  onShowTranslation: (callback: (data: any) => void) => {
    ipcRenderer.on('show-translation', (_event, data) => callback(data));
  },
  close: () => {
    ipcRenderer.send('region-overlay-close');
  },
  moveBy: (dx: number, dy: number) => {
    ipcRenderer.send('region-overlay-move-by', { dx, dy });
  },
  resizeBy: (delta: number) => {
    ipcRenderer.send('region-overlay-resize-by', { delta });
  },
  resizeEdge: (mode: string, dx: number, dy: number) => {
    ipcRenderer.send('region-overlay-resize-edge', { mode, dx, dy });
  },
});
