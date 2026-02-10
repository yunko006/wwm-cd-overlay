const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../shared/ipc-channels')

contextBridge.exposeInMainWorld('overlayAPI', {
  getSources:           ()   => ipcRenderer.invoke(IPC.GET_SOURCES),
  loadCalibration:      ()   => ipcRenderer.invoke(IPC.LOAD_CALIBRATION),

  onConnect:            (cb) => ipcRenderer.on(IPC.CONNECT,              (_, s) => cb(s)),
  onDisconnect:         (cb) => ipcRenderer.on(IPC.DISCONNECT,            ()    => cb()),
  onToggleClickThrough: (cb) => ipcRenderer.on(IPC.TOGGLE_CLICK_THROUGH,  (_, v) => cb(v)),
})
