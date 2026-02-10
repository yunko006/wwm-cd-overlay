// ---- WebRTCManager ----

class WebRTCManager {
  constructor(signalingURL, peerId, playerName, onRemoteStream, onPeerLeft) {
    this.signalingURL = signalingURL
    this.peerId = peerId
    this.playerName = playerName
    this.onRemoteStream = onRemoteStream
    this.onPeerLeft = onPeerLeft
    this.peers = new Map()
    this.peerNames = new Map()
    this.localStream = null
    this.ws = null
  }

  connect(roomId) {
    this.roomId = roomId
    this.ws = new WebSocket(this.signalingURL)
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'join',
        roomId: this.roomId,
        peerId: this.peerId,
        playerName: this.playerName
      }))
    }
    this.ws.onmessage = e => this.handleSignal(JSON.parse(e.data))
    this.ws.onclose = () => console.log('[WS] Disconnected')
    this.ws.onerror = err => console.error('[WS] Error', err)
  }

  disconnect() {
    if (this.ws) {
      this.ws.send(JSON.stringify({ type: 'leave' }))
      this.ws.close()
      this.ws = null
    }
    this.peers.forEach((pc, id) => { pc.close(); this.peers.delete(id) })
  }

  setLocalStream(canvasStream) {
    this.localStream = canvasStream
  }

  async handleSignal(msg) {
    switch (msg.type) {
      case 'joined':
        for (const peer of msg.peers) {
          await this.createOffer(peer.peerId, peer.playerName)
        }
        break
      case 'peer-joined':
        // New peer arrives — they'll send us an offer, we wait
        if (msg.playerName) this.peerNames.set(msg.peerId, msg.playerName)
        break
      case 'peer-left':
        this.removePeer(msg.peerId)
        this.onPeerLeft(msg.peerId)
        break
      case 'offer':
        if (msg.playerName) this.peerNames.set(msg.from, msg.playerName)
        await this.handleOffer(msg.from, msg.sdp)
        break
      case 'answer':
        await this.peers.get(msg.from)?.setRemoteDescription(msg.sdp)
        break
      case 'ice':
        await this.peers.get(msg.from)?.addIceCandidate(msg.candidate)
        break
      case 'error':
        console.error('[Signaling error]', msg.code, msg.message)
        break
    }
  }

  async createPeerConnection(remotePeerId) {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    })

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream))
    }

    pc.onicecandidate = e => {
      if (e.candidate && this.ws) {
        this.ws.send(JSON.stringify({ type: 'ice', to: remotePeerId, candidate: e.candidate }))
      }
    }

    pc.ontrack = e => this.onRemoteStream(remotePeerId, this.peerNames.get(remotePeerId) || remotePeerId, e.streams[0])
    this.peers.set(remotePeerId, pc)
    return pc
  }

  async createOffer(remotePeerId, remotePlayerName) {
    if (remotePlayerName) this.peerNames.set(remotePeerId, remotePlayerName)
    const pc = await this.createPeerConnection(remotePeerId)
    const offer = await pc.createOffer()
    offer.sdp = preferVP9(offer.sdp)
    await pc.setLocalDescription(offer)
    this.ws.send(JSON.stringify({ type: 'offer', to: remotePeerId, sdp: pc.localDescription }))
  }

  async handleOffer(fromPeerId, sdp) {
    const pc = await this.createPeerConnection(fromPeerId)
    await pc.setRemoteDescription(sdp)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    this.ws.send(JSON.stringify({ type: 'answer', to: fromPeerId, sdp: pc.localDescription }))
  }

  removePeer(peerId) {
    this.peers.get(peerId)?.close()
    this.peers.delete(peerId)
  }
}

// ---- VP9 preference ----

function preferVP9(sdp) {
  const lines = sdp.split('\r\n')
  const vp9Line = lines.find(l => l.includes('VP9/90000'))
  if (!vp9Line) return sdp
  const pt = vp9Line.match(/a=rtpmap:(\d+)/)?.[1]
  if (!pt) return sdp
  return sdp.replace(/m=video (.*) ([0-9 ]+)/, (_, rest, pts) => {
    const sorted = [pt, ...pts.split(' ').filter(p => p !== pt)].join(' ')
    return `m=video ${rest} ${sorted}`
  })
}

// ---- Canvas crop ----

let captureVideo = null
let captureCanvas = null
let captureCtx = null
let captureInterval = null

async function startCapture(sourceId, zone) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 20,
        cursor: 'never'
      }
    }
  })

  captureVideo = document.createElement('video')
  captureVideo.srcObject = stream
  captureVideo.play()

  captureCanvas = document.createElement('canvas')
  captureCanvas.width = 120
  captureCanvas.height = 120
  captureCtx = captureCanvas.getContext('2d')

  await new Promise(resolve => captureVideo.addEventListener('loadedmetadata', resolve, { once: true }))

  const scaleX = captureVideo.videoWidth  / screen.width
  const scaleY = captureVideo.videoHeight / screen.height
  const TARGET_FPS = 15

  function drawFrame() {
    captureCtx.drawImage(
      captureVideo,
      zone.x * scaleX,
      zone.y * scaleY,
      zone.width  * scaleX,
      zone.height * scaleY,
      0, 0, 120, 120
    )
  }

  captureInterval = setInterval(drawFrame, 1000 / TARGET_FPS)
  return captureCanvas.captureStream(15)
}

function stopCapture() {
  if (captureInterval) {
    clearInterval(captureInterval)
    captureInterval = null
  }
  if (captureVideo) {
    captureVideo.srcObject?.getTracks().forEach(t => t.stop())
    captureVideo = null
  }
}

// ---- Tiles UI ----

const tilesContainer = document.getElementById('tiles')

function addVideoTile(peerId, playerName, stream) {
  const tile = document.createElement('div')
  tile.className = 'tile'
  tile.dataset.peerId = peerId

  const label = document.createElement('span')
  label.textContent = playerName

  const video = document.createElement('video')
  video.srcObject = stream
  video.autoplay = true
  video.muted = true

  tile.appendChild(label)
  tile.appendChild(video)
  tilesContainer.appendChild(tile)
}

function removeVideoTile(peerId) {
  document.querySelector(`[data-peer-id="${peerId}"]`)?.remove()
}

// ---- Main logic ----

let rtcManager = null

function generatePeerId() {
  return Math.random().toString(36).slice(2, 10)
}

window.overlayAPI.onConnect(async settings => {
  const { playerName, roomId, signalingURL, sourceId, calibration: settingsCalib } = settings

  const calibration = settingsCalib || await window.overlayAPI.loadCalibration()
  if (!calibration) {
    console.warn('[Overlay] No calibration zone — stream will be empty')
  }

  let localStream = null
  if (calibration) {
    localStream = await startCapture(sourceId || calibration.sourceId, calibration)
  }

  const peerId = generatePeerId()

  rtcManager = new WebRTCManager(
    signalingURL,
    peerId,
    playerName,
    (remotePeerId, playerName, stream) => addVideoTile(remotePeerId, playerName, stream),
    (remotePeerId) => removeVideoTile(remotePeerId)
  )

  if (localStream) {
    rtcManager.setLocalStream(localStream)
    addVideoTile('__self__', playerName, localStream)
  }

  rtcManager.connect(roomId)
})

window.overlayAPI.onDisconnect(() => {
  if (rtcManager) {
    rtcManager.disconnect()
    rtcManager = null
  }
  stopCapture()
  removeVideoTile('__self__')
  tilesContainer.innerHTML = ''
})

window.overlayAPI.onToggleClickThrough(isClickThrough => {
  document.body.classList.toggle('interactive', !isClickThrough)
})

// ---- Tile size + hide ----

const tileSizeSlider = document.getElementById('tile-size-slider')
const nameSizeSlider = document.getElementById('name-size-slider')
const btnHideTiles   = document.getElementById('btn-hide-tiles')

function applyTileSize(size) {
  document.documentElement.style.setProperty('--tile-size', size + 'px')
  tileSizeSlider.value = size
}

function applyNameSize(size) {
  document.documentElement.style.setProperty('--name-size', size + 'px')
  nameSizeSlider.value = size
}

// Restore persisted values
const savedTileSize = parseInt(localStorage.getItem('tileSize') ?? '120', 10)
const savedNameSize = parseInt(localStorage.getItem('nameSize') ?? '10', 10)
const savedHidden   = localStorage.getItem('tilesHidden') === 'true'
applyTileSize(savedTileSize)
applyNameSize(savedNameSize)
if (savedHidden) {
  document.body.classList.add('tiles-hidden')
  btnHideTiles.textContent = '🚫'
}

tileSizeSlider.addEventListener('input', () => {
  const size = parseInt(tileSizeSlider.value, 10)
  applyTileSize(size)
  localStorage.setItem('tileSize', size)
})

nameSizeSlider.addEventListener('input', () => {
  const size = parseInt(nameSizeSlider.value, 10)
  applyNameSize(size)
  localStorage.setItem('nameSize', size)
})

btnHideTiles.addEventListener('click', () => {
  const hidden = document.body.classList.toggle('tiles-hidden')
  btnHideTiles.textContent = hidden ? '🚫' : '👁'
  localStorage.setItem('tilesHidden', hidden)
})

// ---- Auto-height: resize window to fit wrapped tiles ----

const ro = new ResizeObserver(() => {
  const dragBarH = document.getElementById('drag-bar').offsetHeight
  const tilesH   = tilesContainer.scrollHeight
  const total    = dragBarH + tilesH
  if (total > 0) window.overlayAPI.setOverlayBounds({ height: total })
})
ro.observe(tilesContainer)

// ---- Resize handle ----

const resizeHandle = document.getElementById('resize-handle')
let resizeStartX = null
let resizeStartWidth = null

resizeHandle.addEventListener('mousedown', async e => {
  e.preventDefault()
  const bounds = await window.overlayAPI.getOverlayBounds()
  resizeStartX = e.screenX
  resizeStartWidth = bounds?.width ?? window.outerWidth

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp)
})

function onResizeMove(e) {
  if (resizeStartX === null) return
  const delta = e.screenX - resizeStartX
  const newWidth = Math.max(200, resizeStartWidth + delta)
  window.overlayAPI.setOverlayBounds({ width: newWidth })
}

function onResizeUp() {
  resizeStartX = null
  resizeStartWidth = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
}
