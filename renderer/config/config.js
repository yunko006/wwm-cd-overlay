const playerNameInput  = document.getElementById('playerName')
const roomIdInput      = document.getElementById('roomId')
const signalingInput   = document.getElementById('signalingURL')
const calibStatus      = document.getElementById('calibrationStatus')
const btnCalibrate     = document.getElementById('btnCalibrate')
const btnConnect       = document.getElementById('btnConnect')
const btnDisconnect    = document.getElementById('btnDisconnect')
const overlayXInput    = document.getElementById('overlayX')
const overlayYInput    = document.getElementById('overlayY')
const overlayWInput    = document.getElementById('overlayW')
const btnApplyBounds   = document.getElementById('btnApplyBounds')
const tileSizeInput    = document.getElementById('tileSize')
const nameSizeInput    = document.getElementById('nameSize')
const tileSizeVal      = document.getElementById('tileSizeVal')
const nameSizeVal      = document.getElementById('nameSizeVal')

let currentSourceId = null

// --- Load persisted data ---
async function init() {
  const calibration = await window.configAPI.loadCalibration()
  if (calibration) {
    showCalibration(calibration)
    currentSourceId = calibration.sourceId
  }

  const bounds = await window.configAPI.getOverlayBounds()
  if (bounds) {
    if (bounds.x     != null) overlayXInput.value = bounds.x
    if (bounds.y     != null) overlayYInput.value = bounds.y
    if (bounds.width != null) overlayWInput.value = bounds.width
  }

  const appearance = await window.configAPI.getOverlayAppearance()
  tileSizeInput.value = appearance.tileSize
  nameSizeInput.value = appearance.nameSize
  tileSizeVal.textContent = appearance.tileSize
  nameSizeVal.textContent = appearance.nameSize
}

function showCalibration(zone) {
  calibStatus.textContent = `Zone : ${zone.width}×${zone.height} px à (${zone.x}, ${zone.y})`
  calibStatus.classList.add('configured')
}

// --- Calibration ---
btnCalibrate.addEventListener('click', async () => {
  const sources = await window.configAPI.getSources()
  if (!sources || sources.length === 0) {
    alert('Aucune source d\'écran détectée.')
    return
  }
  // Use first screen source
  const sourceId = sources[0].id
  currentSourceId = sourceId
  window.configAPI.openCalibrationWin(sourceId)
})

window.configAPI.onCalibrationDone(zone => {
  showCalibration(zone)
  currentSourceId = zone.sourceId
})

// --- Overlay bounds ---
btnApplyBounds.addEventListener('click', () => {
  const x = overlayXInput.value !== '' ? parseInt(overlayXInput.value, 10) : null
  const y = overlayYInput.value !== '' ? parseInt(overlayYInput.value, 10) : null
  const width = overlayWInput.value !== '' ? parseInt(overlayWInput.value, 10) : null
  window.configAPI.setOverlayBounds({ x, y, width })
})

// --- Appearance sliders ---
tileSizeInput.addEventListener('input', () => {
  tileSizeVal.textContent = tileSizeInput.value
  window.configAPI.setOverlayAppearance({ tileSize: +tileSizeInput.value, nameSize: +nameSizeInput.value })
})
nameSizeInput.addEventListener('input', () => {
  nameSizeVal.textContent = nameSizeInput.value
  window.configAPI.setOverlayAppearance({ tileSize: +tileSizeInput.value, nameSize: +nameSizeInput.value })
})

// --- Connect / Disconnect ---
btnConnect.addEventListener('click', async () => {
  const playerName  = playerNameInput.value.trim()
  const roomId      = roomIdInput.value.trim()
  const signalingURL = signalingInput.value.trim()

  if (!playerName || !roomId || !signalingURL) {
    alert('Remplissez tous les champs.')
    return
  }
  if (!currentSourceId) {
    alert('Veuillez d\'abord sélectionner une zone de capture.')
    return
  }

  const calibration = await window.configAPI.loadCalibration()

  window.configAPI.connect({
    playerName,
    roomId,
    signalingURL,
    sourceId: currentSourceId,
    calibration,
  })

  btnConnect.disabled    = true
  btnDisconnect.disabled = false
})

btnDisconnect.addEventListener('click', () => {
  window.configAPI.disconnect()
  btnConnect.disabled    = false
  btnDisconnect.disabled = true
})

init()
