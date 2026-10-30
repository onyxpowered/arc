// Arc 1 Bridge: the only door between a window and the Engine (preload script).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Arc', {
  Call: function () { return ipcRenderer.invoke.apply(ipcRenderer, arguments); },
  Send: function () { ipcRenderer.send.apply(ipcRenderer, arguments); },
  On: (Name, Handler) => ipcRenderer.on(Name, (Event, Value) => Handler(Value)),
});
