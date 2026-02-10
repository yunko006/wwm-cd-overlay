const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../shared/ipc-channels')

contextBridge.exposeInMainWorld('calibrationAPI', {
  onInit:     (cb)   => ipcRenderer.on(IPC.CALIBRATION_INIT, (_, data) => cb(data)),
  submitZone: (zone) => ipcRenderer.invoke(IPC.CALIBRATION_SUBMIT, zone),
})
