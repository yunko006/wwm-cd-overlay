const { app, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')

// Force GDI fallback for desktop capture (avoids DXGI mutex errors with fullscreen games)
app.commandLine.appendSwitch('disable-features', 'DesktopCaptureMacV2,DirectXCapturer')

require('./ipc-handlers')

let configWin, overlayWin

function createConfigWindow() {
  configWin = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-config.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  configWin.loadFile(path.join(__dirname, '../renderer/config/config.html'))
  configWin.on('closed', () => { configWin = null })
}

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: 650,
    height: 160,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  overlayWin.loadFile(path.join(__dirname, '../renderer/overlay/overlay.html'))
  overlayWin.setIgnoreMouseEvents(true, { forward: true })
  overlayWin.on('closed', () => { overlayWin = null })
}

app.whenReady().then(() => {
  createConfigWindow()
  createOverlayWindow()

  globalShortcut.register('Alt+O', () => {
    if (!overlayWin) return
    const isIgnoring = overlayWin.isIgnoreMouseEvents()
    overlayWin.setIgnoreMouseEvents(!isIgnoring, { forward: true })
    overlayWin.webContents.send('overlay:toggle-click-through', !isIgnoring)
  })
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

module.exports = {
  getConfigWin:  () => configWin,
  getOverlayWin: () => overlayWin,
}
