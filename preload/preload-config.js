const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../shared/ipc-channels')

contextBridge.exposeInMainWorld('configAPI', {
  getSources:           ()         => ipcRenderer.invoke(IPC.GET_SOURCES),
  openCalibrationWin:   (sourceId) => ipcRenderer.invoke(IPC.OPEN_CALIBRATION_WINDOW, sourceId),
  loadCalibration:      ()         => ipcRenderer.invoke(IPC.LOAD_CALIBRATION),
  onCalibrationDone: (cb) => {
    ipcRenderer.removeAllListeners(IPC.CALIBRATION_DONE)
    ipcRenderer.on(IPC.CALIBRATION_DONE, (_, zone) => cb(zone))
  },

  connect:    (settings) => ipcRenderer.send(IPC.CONNECT, settings),
  disconnect: ()         => ipcRenderer.send(IPC.DISCONNECT),

  saveFields: (fields) => ipcRenderer.invoke(IPC.CONFIG_SAVE_FIELDS, fields),
  loadFields: ()       => ipcRenderer.invoke(IPC.CONFIG_LOAD_FIELDS),

  getOverlayBounds:      ()           => ipcRenderer.invoke(IPC.OVERLAY_GET_BOUNDS),
  setOverlayBounds:      (bounds)     => ipcRenderer.invoke(IPC.OVERLAY_SET_BOUNDS, bounds),
  getOverlayAppearance:  ()           => ipcRenderer.invoke(IPC.OVERLAY_GET_APPEARANCE),
  setOverlayAppearance:  (appearance) => ipcRenderer.invoke(IPC.OVERLAY_SET_APPEARANCE, appearance),
})
