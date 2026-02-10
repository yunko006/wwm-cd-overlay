const { app, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')
const store = require('./store')

// Force GDI fallback for desktop capture (avoids DXGI mutex errors with fullscreen games)
app.commandLine.appendSwitch('disable-features', 'DesktopCaptureMacV2,DirectXCapturer')

require('./ipc-handlers')

let configWin, overlayWin
let overlayClickThrough = true
let alwaysOnTopInterval = null

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
  const savedBounds = store.get('overlayBounds', null)
  overlayWin = new BrowserWindow({
    width:  savedBounds?.width ?? 650,
    height: 24,
    ...(savedBounds?.x != null && savedBounds?.y != null ? { x: savedBounds.x, y: savedBounds.y } : {}),
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
    overlayClickThrough = !overlayClickThrough
    overlayWin.setIgnoreMouseEvents(overlayClickThrough, { forward: true })
    overlayWin.setAlwaysOnTop(true, 'screen-saver')
    overlayWin.webContents.send('overlay:toggle-click-through', overlayClickThrough)

    if (!overlayClickThrough) {
      // Mode interactif : forcer alwaysOnTop en continu pour rester au-dessus du jeu
      alwaysOnTopInterval = setInterval(() => {
        if (overlayWin) overlayWin.setAlwaysOnTop(true, 'screen-saver')
      }, 200)
    } else {
      // Retour click-through : arrêter l'interval et sauvegarder la position
      clearInterval(alwaysOnTopInterval)
      alwaysOnTopInterval = null
      if (overlayWin) {
        const { x, y, width } = overlayWin.getBounds()
        store.set('overlayBounds', { x, y, width })
      }
    }
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
