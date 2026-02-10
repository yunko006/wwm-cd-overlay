const playerNameInput  = document.getElementById('playerName')
const roomIdInput      = document.getElementById('roomId')
const signalingInput   = document.getElementById('signalingURL')
const calibStatus      = document.getElementById('calibrationStatus')
const btnCalibrate     = document.getElementById('btnCalibrate')
const btnConnect       = document.getElementById('btnConnect')
const btnDisconnect    = document.getElementById('btnDisconnect')

let currentSourceId = null

// --- Load persisted data ---
async function init() {
  const calibration = await window.configAPI.loadCalibration()
  if (calibration) {
    showCalibration(calibration)
    currentSourceId = calibration.sourceId
  }
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

// --- Connect / Disconnect ---
btnConnect.addEventListener('click', () => {
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

  window.configAPI.connect({
    playerName,
    roomId,
    signalingURL,
    sourceId: currentSourceId,
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
