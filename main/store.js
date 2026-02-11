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
    signalingURL: { type: 'string', default: 'wss://votre-serveur.railway.app' },
    overlayAppearance: {
      type: 'object',
      default: { tileSize: 120, nameSize: 10, direction: 'horizontal', maxRows: 2, maxCols: 2, threshold: 4 },
      properties: {
        tileSize:  { type: 'number' },
        nameSize:  { type: 'number' },
        direction: { type: 'string' },
        maxRows:   { type: 'number' },
        maxCols:   { type: 'number' },
        threshold: { type: 'number' }
      }
    }
  }
})

module.exports = store
