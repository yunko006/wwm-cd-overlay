const canvas = document.getElementById('select-canvas')
const ctx = canvas.getContext('2d')

canvas.width  = screen.width
canvas.height = screen.height

let startX = 0, startY = 0
let isDragging = false
let sourceId = null

// ---- Init via IPC ----

window.calibrationAPI.onInit(async ({ sourceId: sid }) => {
  sourceId = sid
  const bgVideo = document.getElementById('bg-video')

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 10
      }
    }
  })
  bgVideo.srcObject = stream
})

// ---- Selection drawing ----

canvas.addEventListener('mousedown', e => {
  startX = e.clientX
  startY = e.clientY
  isDragging = true
  ctx.clearRect(0, 0, canvas.width, canvas.height)
})

canvas.addEventListener('mousemove', e => {
  if (!isDragging) return

  const x = Math.min(startX, e.clientX)
  const y = Math.min(startY, e.clientY)
  const w = Math.abs(e.clientX - startX)
  const h = Math.abs(e.clientY - startY)

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Overlay sombre hors sélection (4 rectangles autour de la zone)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.fillRect(0, 0, canvas.width, y)
  ctx.fillRect(0, y + h, canvas.width, canvas.height - y - h)
  ctx.fillRect(0, y, x, h)
  ctx.fillRect(x + w, y, canvas.width - x - w, h)

  // Bordure verte
  ctx.strokeStyle = '#00ff88'
  ctx.lineWidth = 2
  ctx.strokeRect(x, y, w, h)
})

canvas.addEventListener('mouseup', e => {
  if (!isDragging) return
  isDragging = false

  const zone = {
    x:        Math.min(startX, e.clientX),
    y:        Math.min(startY, e.clientY),
    width:    Math.abs(e.clientX - startX),
    height:   Math.abs(e.clientY - startY),
    sourceId: sourceId
  }

  if (zone.width < 4 || zone.height < 4) return

  window.calibrationAPI.submitZone(zone)
})
