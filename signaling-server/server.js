const { WebSocketServer } = require('ws')
const RoomManager = require('./room-manager')

const PORT = process.env.PORT || 3000
const HEARTBEAT_INTERVAL = 30000

const wss = new WebSocketServer({ port: PORT })
const rooms = new RoomManager()

// Track peerId per ws connection
const peerMap = new Map() // ws → peerId

wss.on('connection', ws => {
  ws.isAlive = true
  ws.on('pong', () => { ws.isAlive = true })

  ws.on('message', data => {
    let msg
    try {
      msg = JSON.parse(data)
    } catch {
      ws.send(JSON.stringify({ type: 'error', code: 'MALFORMED_MESSAGE', message: 'Invalid JSON' }))
      return
    }

    switch (msg.type) {
      case 'join': {
        const { roomId, peerId, playerName } = msg
        if (!roomId || !peerId || !playerName) {
          ws.send(JSON.stringify({ type: 'error', code: 'MALFORMED_MESSAGE', message: 'Missing fields' }))
          return
        }

        const result = rooms.join(roomId, peerId, playerName, ws)
        if (result.error) {
          ws.send(JSON.stringify({ type: 'error', code: result.error, message: result.error }))
          return
        }

        peerMap.set(ws, peerId)
        ws.send(JSON.stringify({ type: 'joined', roomId, peers: result.peers }))
        break
      }

      case 'leave': {
        const peerId = peerMap.get(ws)
        if (peerId) {
          rooms.leave(peerId)
          peerMap.delete(ws)
        }
        break
      }

      case 'offer':
      case 'answer':
      case 'ice': {
        const fromPeerId = peerMap.get(ws)
        if (!fromPeerId) {
          ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_PEER', message: 'Not joined' }))
          return
        }
        if (!msg.to) {
          ws.send(JSON.stringify({ type: 'error', code: 'MALFORMED_MESSAGE', message: 'Missing "to" field' }))
          return
        }
        const result = rooms.route(fromPeerId, msg)
        if (result.error) {
          ws.send(JSON.stringify({ type: 'error', code: result.error, message: result.error }))
        }
        break
      }

      default:
        ws.send(JSON.stringify({ type: 'error', code: 'MALFORMED_MESSAGE', message: `Unknown type: ${msg.type}` }))
    }
  })

  ws.on('close', () => {
    const peerId = peerMap.get(ws)
    if (peerId) {
      rooms.leave(peerId)
      peerMap.delete(ws)
    }
  })

  ws.on('error', err => {
    console.error('[WS] Client error:', err.message)
  })
})

// Heartbeat to handle Railway/Render idle disconnections
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      const peerId = peerMap.get(ws)
      if (peerId) {
        rooms.leave(peerId)
        peerMap.delete(ws)
      }
      return ws.terminate()
    }
    ws.isAlive = false
    ws.ping()
  })
}, HEARTBEAT_INTERVAL)

wss.on('close', () => {
  clearInterval(heartbeat)
})

console.log(`[Signaling] Server listening on port ${PORT}`)
