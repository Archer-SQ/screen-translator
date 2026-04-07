import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  onShowTranslation: (callback: (data: any) => void) => {
    ipcRenderer.on('show-translation', (_event, data) => callback(data));
  },
  onClear: (callback: () => void) => {
    ipcRenderer.on('clear', () => callback());
  },
  dismiss: () => {
    ipcRenderer.send('dismiss-overlay');
  },
});
