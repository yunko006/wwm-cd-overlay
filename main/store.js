const Store = require('electron-store')

const store = new Store({
  schema: {
    calibration: {
      type: ['object', 'null'],
      default: null,
      properties: {
        x:        { type: 'number' },
        y:        { type: 'number' },
        width:    { type: 'number' },
        height:   { type: 'number' },
        sourceId: { type: 'string' }
      }
    },
    playerName:   { type: 'string', default: '' },
    roomId:       { type: 'string', default: '' },
    signalingURL: { type: 'string', default: 'wss://votre-serveur.railway.app' }
  }
})

module.exports = store
