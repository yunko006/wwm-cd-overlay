// rooms: Map<roomId, Map<peerId, { ws, playerName }>>

class RoomManager {
  constructor() {
    this.rooms = new Map()
  }

  join(roomId, peerId, playerName, ws) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map())
    }
    const room = this.rooms.get(roomId)

    if (room.size >= 6) return { error: 'ROOM_FULL' }
    if (room.has(peerId)) return { error: 'INVALID_PEER_ID' }

    const existingPeers = [...room.entries()].map(([id, p]) => ({
      peerId: id,
      playerName: p.playerName
    }))

    room.set(peerId, { ws, playerName })

    // Notify existing peers
    room.forEach((peer, id) => {
      if (id !== peerId && peer.ws.readyState === 1) {
        peer.ws.send(JSON.stringify({ type: 'peer-joined', peerId, playerName }))
      }
    })

    return { peers: existingPeers }
  }

  route(fromPeerId, msg) {
    for (const room of this.rooms.values()) {
      if (!room.has(fromPeerId)) continue
      const target = room.get(msg.to)
      if (!target) return { error: 'UNKNOWN_PEER' }
      const sender = room.get(fromPeerId)
      target.ws.send(JSON.stringify({ ...msg, from: fromPeerId, playerName: sender?.playerName, to: undefined }))
      return {}
    }
    return { error: 'UNKNOWN_PEER' }
  }

  leave(peerId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (!room.has(peerId)) continue
      room.delete(peerId)
      room.forEach(peer => {
        if (peer.ws.readyState === 1) {
          peer.ws.send(JSON.stringify({ type: 'peer-left', peerId }))
        }
      })
      if (room.size === 0) this.rooms.delete(roomId)
      break
    }
  }

  // Find which room a peer belongs to (for disconnect cleanup)
  getPeerRoom(peerId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.has(peerId)) return roomId
    }
    return null
  }
}

module.exports = RoomManager
