const { desktopCapturer } = require('electron')

async function getSources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 300, height: 200 }
  })
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnailDataURL: s.thumbnail.toDataURL()
  }))
}

module.exports = { getSources }
