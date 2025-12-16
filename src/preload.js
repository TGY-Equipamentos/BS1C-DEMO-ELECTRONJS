const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bs1c', {
  listPorts: () => ipcRenderer.invoke('serial:listPorts'),
  connect: (args) => ipcRenderer.invoke('serial:connect', args),
  disconnect: () => ipcRenderer.invoke('serial:disconnect'),
  writeAndCapture: (args) => ipcRenderer.invoke('serial:writeAndCapture', args),

  onSerialData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('serial:data', listener);
    return () => ipcRenderer.removeListener('serial:data', listener);
  },
  onSerialError: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('serial:error', listener);
    return () => ipcRenderer.removeListener('serial:error', listener);
  },
  onSerialClosed: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('serial:closed', listener);
    return () => ipcRenderer.removeListener('serial:closed', listener);
  },
});


