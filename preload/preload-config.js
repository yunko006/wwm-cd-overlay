const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../shared/ipc-channels')

contextBridge.exposeInMainWorld('configAPI', {
  getSources:           ()         => ipcRenderer.invoke(IPC.GET_SOURCES),
  openCalibrationWin:   (sourceId) => ipcRenderer.invoke(IPC.OPEN_CALIBRATION_WINDOW, sourceId),
  loadCalibration:      ()         => ipcRenderer.invoke(IPC.LOAD_CALIBRATION),
  onCalibrationDone:    (cb)       => ipcRenderer.on(IPC.CALIBRATION_DONE, (_, zone) => cb(zone)),

  connect:    (settings) => ipcRenderer.send(IPC.CONNECT, settings),
  disconnect: ()         => ipcRenderer.send(IPC.DISCONNECT),
})
