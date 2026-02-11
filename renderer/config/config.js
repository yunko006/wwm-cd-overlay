const playerNameInput  = document.getElementById('playerName')
const roomIdInput      = document.getElementById('roomId')
const signalingInput   = document.getElementById('signalingURL')
const sourceSelect     = document.getElementById('sourceSelect')
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
let sources = []

// --- Load persisted data ---
async function init() {
  const fields = await window.configAPI.loadFields()
  if (fields) {
    if (fields.playerName)   playerNameInput.value = fields.playerName
    if (fields.roomId)       roomIdInput.value     = fields.roomId
    if (fields.signalingURL) signalingInput.value  = fields.signalingURL
  }

  sources = await window.configAPI.getSources()
  sourceSelect.innerHTML = ''
  for (const src of sources) {
    const opt = document.createElement('option')
    opt.value = src.id
    opt.textContent = src.name
    sourceSelect.appendChild(opt)
  }

  const calibration = await window.configAPI.loadCalibration()
  if (calibration) {
    showCalibration(calibration)
    currentSourceId = calibration.sourceId
    // Pre-select the source matching the saved calibration
    if (calibration.sourceId) {
      sourceSelect.value = calibration.sourceId
    }
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

// --- Source dropdown change — invalidate calibration ---
sourceSelect.addEventListener('change', () => {
  const newSourceId = sourceSelect.value
  if (newSourceId !== currentSourceId) {
    currentSourceId = null
    calibStatus.textContent = 'Aucune zone configurée'
    calibStatus.classList.remove('configured')
    btnConnect.disabled = true
  }
})

// --- Calibration ---
btnCalibrate.addEventListener('click', () => {
  const sourceId = sourceSelect.value
  if (!sourceId) {
    alert('Aucune source d\'écran détectée.')
    return
  }
  window.configAPI.openCalibrationWin(sourceId)
})

window.configAPI.onCalibrationDone(zone => {
  showCalibration(zone)
  currentSourceId = zone.sourceId
  sourceSelect.value = zone.sourceId
  btnConnect.disabled = false
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

// --- Auto-save fields on blur ---
function saveFields() {
  window.configAPI.saveFields({
    playerName:   playerNameInput.value,
    roomId:       roomIdInput.value,
    signalingURL: signalingInput.value,
  })
}
playerNameInput.addEventListener('blur', saveFields)
roomIdInput.addEventListener('blur', saveFields)
signalingInput.addEventListener('blur', saveFields)

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

  saveFields()

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
