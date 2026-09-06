const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  markDirty: (value) => ipcRenderer.send('document:dirty', value),
  save: (saveAs = false) => ipcRenderer.invoke('document:save', saveAs),
  open: () => ipcRenderer.invoke('document:open'),
  confirmReplace: () => ipcRenderer.invoke('document:confirm-replace'),
  newCreated: () => ipcRenderer.send('document:new-created'),
  onNewRequested: (callback) => ipcRenderer.on('document:new-requested', callback),
  onOpened: (callback) => ipcRenderer.on('document:opened', (_event, value) => callback(value)),
  onSaved: (callback) => ipcRenderer.on('document:saved', (_event, value) => callback(value)),
  onSerialize: (callback) => ipcRenderer.on('document:serialize-request', async (_event, requestId) => {
    ipcRenderer.send('document:serialize-response', requestId, await callback());
  })
});
