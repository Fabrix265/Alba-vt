const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('alba', {
  onState: (callback) => subscribe('pet:state', callback),
  onInteractive: (callback) => subscribe('pet:interactive', callback),
  onConnection: (callback) => subscribe('pet:connection', callback),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('pet:ignore', Boolean(ignore)),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  getConfig: () => ipcRenderer.invoke('pet:config')
});