const { ipcMain, BrowserWindow, screen } = require('electron')
const path = require('path')
const IPC = require('../shared/ipc-channels')
const { getSources } = require('./desktop-capturer')
const store = require('./store')

// --- desktopCapturer ---
ipcMain.handle(IPC.GET_SOURCES, async () => {
  return getSources()
})

// --- Calibration persistence ---
ipcMain.handle(IPC.LOAD_CALIBRATION, () => {
  return store.get('calibration', null)
})

ipcMain.handle(IPC.SAVE_CALIBRATION, (_, zone) => {
  store.set('calibration', zone)
})

// --- Open calibration window ---
let calibWin = null

ipcMain.handle(IPC.OPEN_CALIBRATION_WINDOW, async (_, sourceId) => {
  if (calibWin) {
    calibWin.focus()
    return
  }

  const { width, height } = screen.getPrimaryDisplay().bounds

  calibWin = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    alwaysOnTop: true,
    focusable: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-calibration.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  calibWin.loadFile(path.join(__dirname, '../renderer/calibration/calibration.html'))

  calibWin.webContents.once('did-finish-load', () => {
    calibWin.webContents.send(IPC.CALIBRATION_INIT, { sourceId })
  })

  calibWin.setContentProtection(true)
  calibWin.setAlwaysOnTop(true, 'screen-saver')
  calibWin.show()
  calibWin.focus()
  calibWin.on('blur', () => { if (calibWin) calibWin.focus() })
  calibWin.on('closed', () => { calibWin = null })
})

// --- Calibration submit (from calibration renderer) ---
ipcMain.handle(IPC.CALIBRATION_SUBMIT, (_, zone) => {
  store.set('calibration', zone)

  if (calibWin) {
    calibWin.close()
  }

  // Notify config window
  const { getConfigWin } = require('./main')
  const configWin = getConfigWin()
  if (configWin) {
    configWin.webContents.send(IPC.CALIBRATION_DONE, zone)
  }
})

// --- Connect / Disconnect (config → overlay forwarding) ---
ipcMain.on(IPC.CONNECT, (_, settings) => {
  const { getOverlayWin } = require('./main')
  const overlayWin = getOverlayWin()
  if (overlayWin) {
    overlayWin.webContents.send(IPC.CONNECT, settings)
  }
})

ipcMain.on(IPC.DISCONNECT, () => {
  const { getOverlayWin } = require('./main')
  const overlayWin = getOverlayWin()
  if (overlayWin) {
    overlayWin.webContents.send(IPC.DISCONNECT)
  }
})
