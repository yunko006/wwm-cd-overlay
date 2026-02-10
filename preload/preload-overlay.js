const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../shared/ipc-channels')

contextBridge.exposeInMainWorld('overlayAPI', {
  getSources:           ()   => ipcRenderer.invoke(IPC.GET_SOURCES),
  loadCalibration:      ()   => ipcRenderer.invoke(IPC.LOAD_CALIBRATION),

  onConnect: (cb) => {
    ipcRenderer.removeAllListeners(IPC.CONNECT)
    ipcRenderer.on(IPC.CONNECT, (_, s) => cb(s))
  },
  onDisconnect: (cb) => {
    ipcRenderer.removeAllListeners(IPC.DISCONNECT)
    ipcRenderer.on(IPC.DISCONNECT, () => cb())
  },
  onToggleClickThrough: (cb) => {
    ipcRenderer.removeAllListeners(IPC.TOGGLE_CLICK_THROUGH)
    ipcRenderer.on(IPC.TOGGLE_CLICK_THROUGH, (_, v) => cb(v))
  },

  setOverlayBounds: (bounds) => ipcRenderer.invoke(IPC.OVERLAY_SET_BOUNDS, bounds),
  getOverlayBounds: ()       => ipcRenderer.invoke(IPC.OVERLAY_GET_BOUNDS),

  getOverlayAppearance: () => ipcRenderer.invoke(IPC.OVERLAY_GET_APPEARANCE),
  onAppearanceChange: (cb) => {
    ipcRenderer.removeAllListeners(IPC.OVERLAY_SET_APPEARANCE)
    ipcRenderer.on(IPC.OVERLAY_SET_APPEARANCE, (_, appearance) => cb(appearance))
  },
  setIgnoreMouse: (ignore) => ipcRenderer.send(IPC.OVERLAY_SET_IGNORE_MOUSE, ignore),
  onToggleDragMode: (cb) => {
    ipcRenderer.removeAllListeners(IPC.OVERLAY_TOGGLE_DRAG_MODE)
    ipcRenderer.on(IPC.OVERLAY_TOGGLE_DRAG_MODE, () => cb())
  },
})
