// WebSocket signaling protocol message types

// Client → Server
const CLIENT_MSG = {
  JOIN:   'join',    // { type, roomId, peerId, playerName }
  LEAVE:  'leave',   // { type }
  OFFER:  'offer',   // { type, to: peerId, sdp }
  ANSWER: 'answer',  // { type, to: peerId, sdp }
  ICE:    'ice',     // { type, to: peerId, candidate }
}

// Server → Client
const SERVER_MSG = {
  JOINED:      'joined',       // { type, roomId, peers: [{peerId, playerName}] }
  PEER_JOINED: 'peer-joined',  // { type, peerId, playerName }
  PEER_LEFT:   'peer-left',    // { type, peerId }
  OFFER:       'offer',        // { type, from: peerId, sdp }
  ANSWER:      'answer',       // { type, from: peerId, sdp }
  ICE:         'ice',          // { type, from: peerId, candidate }
  ERROR:       'error',        // { type, code, message }
}

// Error codes
const ERROR_CODES = {
  ROOM_FULL:         'ROOM_FULL',
  INVALID_PEER_ID:   'INVALID_PEER_ID',
  UNKNOWN_PEER:      'UNKNOWN_PEER',
  MALFORMED_MESSAGE: 'MALFORMED_MESSAGE',
}

module.exports = { CLIENT_MSG, SERVER_MSG, ERROR_CODES }
