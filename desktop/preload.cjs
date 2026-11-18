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
  resizeStart: (edge) => ipcRenderer.send('pet:resize-start', String(edge)),
  resizeEnd: () => ipcRenderer.send('pet:resize-end'),
  clipSize: (size) => ipcRenderer.send('pet:clip-size', size),
  scale: (direction) => ipcRenderer.send('pet:scale', Number(direction) > 0 ? 1 : -1),
  getConfig: () => ipcRenderer.invoke('pet:config')
});