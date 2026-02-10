# Plan d'implémentation — Team Cooldown Live Overlay

> Application Electron (Windows) pour partager les icônes de cooldown en temps réel entre joueurs de *Where Winds Meet*.

---

## Décisions de conception

| Paramètre | Choix |
|---|---|
| Cible OS | Windows uniquement |
| UI renderer | Vanilla HTML/CSS/JS |
| Serveur signaling | Hébergé par le dev (Railway / Render) |
| Sécurité Electron | `contextIsolation: true`, preload scripts, pas de `nodeIntegration` |
| Topologie WebRTC | Full mesh (P2P direct entre joueurs) |
| Codec vidéo | VP9, 120×120px, 15 fps, ~80 kbps/stream |
| Joueurs max | 6 par salle |

---

## Architecture révisée

L'idée originale prévoit une seule fenêtre. L'implémentation correcte en nécessite **trois** :

```
┌─────────────────────────── PROCESSUS PRINCIPAL (Node.js) ───────────────────────────┐
│  main.js          ipc-handlers.js      desktop-capturer.js      store.js            │
│  - Crée les 3     - Bridge IPC         - Appelle Electron        - electron-store    │
│    fenêtres         (tous canaux)        desktopCapturer API       (persistance)     │
│  - globalShortcut - Forward main ↔     - Retourne sourceId                          │
│    Alt+O toggle     overlay              au renderer                                │
└───────────────────────────────────────────────────────────────────────────────────┘
       │ contextBridge IPC                    │ contextBridge IPC
       ▼                                      ▼
┌──────────────────────┐          ┌──────────────────────────────────────────┐
│  FENÊTRE CONFIG      │          │  FENÊTRE OVERLAY                         │
│  (cadre normal,      │          │  (transparent, always-on-top,            │
│   interactive)       │  ──────► │   click-through par défaut)              │
│                      │ settings │                                          │
│  - Nom joueur        │          │  - Tiles 120×120 des autres joueurs      │
│  - Room ID           │          │  - WebRTC manager complet ici            │
│  - Bouton calibration│          │  - Alt+O : bascule mode interactif       │
│  - Bouton connexion  │          │  - Canvas crop + captureStream           │
└──────────────────────┘          └──────────────────────────────────────────┘
       │
       │ (temporaire, lancée à la demande)
       ▼
┌──────────────────────┐
│  FENÊTRE CALIBRATION │
│  (plein écran,       │
│   transparent,       │
│   click-through OFF) │
│                      │
│  - Fond = live screen│
│  - Dessin rectangle  │
│  - Retourne {x,y,w,h}│
│  - Se ferme auto     │
└──────────────────────┘

FLUX MÉDIA (jamais via serveur, toujours P2P) :
Canvas joueur A → captureStream(15fps) → RTCPeerConnection → WebRTC → Joueurs B, C, D...

SERVEUR DE SIGNALING (Railway/Render) :
Rôle uniquement : faire se "trouver" les pairs pour établir WebRTC
Ne transporte AUCUNE donnée vidéo
```

**Pourquoi la logique WebRTC est dans l'overlay et non la config ?**
Les objets `MediaStream` ne sont pas sérialisables et ne peuvent pas transiter via IPC entre deux processus renderer. En plaçant tout dans l'overlay, on évite ce problème : la config envoie juste les paramètres (sourceId, zone, roomId), l'overlay fait tout le reste.

---

## Structure de fichiers

```
wwm-cd-overlay/
├── package.json
├── .gitignore
├── electron-builder.config.js
│
├── main/
│   ├── main.js                  # Crée fenêtres, globalShortcut, cycle de vie
│   ├── ipc-handlers.js          # Tous les canaux IPC
│   ├── desktop-capturer.js      # Wrapper desktopCapturer (main process only)
│   └── store.js                 # electron-store avec schema
│
├── preload/
│   ├── preload-config.js        # contextBridge pour fenêtre config
│   ├── preload-overlay.js       # contextBridge pour fenêtre overlay
│   └── preload-calibration.js   # contextBridge pour fenêtre calibration
│
├── renderer/
│   ├── config/
│   │   ├── config.html
│   │   ├── config.js
│   │   └── config.css
│   ├── overlay/
│   │   ├── overlay.html
│   │   ├── overlay.js           # WebRTC manager + canvas crop + tiles UI
│   │   └── overlay.css
│   └── calibration/
│       ├── calibration.html
│       ├── calibration.js       # Dessin rectangle, getUserMedia background
│       └── calibration.css
│
├── shared/
│   ├── ipc-channels.js          # Constantes des noms de canaux IPC
│   └── protocol.js              # Types de messages WebSocket
│
└── signaling-server/            # Projet Node.js séparé
    ├── package.json
    ├── server.js
    ├── room-manager.js
    └── .env.example
```

---

## ✅ Phase 0 — Bootstrap (FAIT)

**`package.json` (racine) :**
```json
{
  "name": "wwm-cd-overlay",
  "version": "1.0.0",
  "main": "main/main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win",
    "build:dir": "electron-builder --win --dir"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0"
  },
  "dependencies": {
    "electron-store": "^8.2.0"
  }
}
```

> **Note :** `electron-store` reste sur **v8** (dernière version CommonJS). v9+ est ESM-only, incompatible avec `require()`.

**`.gitignore` :**
```
node_modules/
dist/
.env
*.log
```

---

## ✅ Phase 1 — Architecture trois fenêtres (FAIT)

**`main/main.js` (implémentation réelle) :**
```javascript
const { app, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')
require('./ipc-handlers')

// Force le fallback GDI — évite les erreurs DXGI 0x887A0026 avec les jeux fullscreen
app.commandLine.appendSwitch('disable-features', 'DesktopCaptureMacV2,DirectXCapturer')

let configWin, overlayWin

function createConfigWindow() {
  configWin = new BrowserWindow({
    width: 400, height: 500,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-config.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  configWin.loadFile('renderer/config/config.html')
}

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: 650, height: 160,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  })
  overlayWin.loadFile('renderer/overlay/overlay.html')
  overlayWin.setIgnoreMouseEvents(true, { forward: true })
}

app.whenReady().then(() => {
  createConfigWindow()
  createOverlayWindow()

  globalShortcut.register('Alt+O', () => {
    const isIgnoring = overlayWin.isIgnoreMouseEvents()
    overlayWin.setIgnoreMouseEvents(!isIgnoring, { forward: true })
    overlayWin.webContents.send('overlay:toggle-click-through', !isIgnoring)
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
```

**`shared/ipc-channels.js` (implémentation réelle) :**
```javascript
module.exports = {
  GET_SOURCES:             'capture:get-sources',
  SAVE_CALIBRATION:        'calibration:save',
  LOAD_CALIBRATION:        'calibration:load',
  OPEN_CALIBRATION_WINDOW: 'calibration:open-window',
  CALIBRATION_INIT:        'calibration:init',
  CALIBRATION_SUBMIT:      'calibration:submit',
  CALIBRATION_DONE:        'calibration:done',
  CONNECT:                 'overlay:connect',
  DISCONNECT:              'overlay:disconnect',
  TOGGLE_CLICK_THROUGH:    'overlay:toggle-click-through',
}
```

> **Note :** `CALIBRATION_SCREENSHOT` et `CALIBRATION_READY` supprimés (inutilisés).

---

## ✅ Phase 2 — Serveur de signaling (FAIT)

**Protocole complet (JSON) :**

```
CLIENT → SERVEUR :
  { type: 'join',   roomId, peerId, playerName }
  { type: 'leave' }
  { type: 'offer',  to: peerId, sdp }
  { type: 'answer', to: peerId, sdp }
  { type: 'ice',    to: peerId, candidate }

SERVEUR → CLIENT :
  { type: 'joined',      roomId, peers: [{peerId, playerName}] }
  { type: 'peer-joined', peerId, playerName }
  { type: 'peer-left',   peerId }
  { type: 'offer',       from: peerId, sdp }
  { type: 'answer',      from: peerId, sdp }
  { type: 'ice',         from: peerId, candidate }
  { type: 'error',       code, message }

CODES D'ERREUR :
  ROOM_FULL         (max 6 pairs)
  INVALID_PEER_ID   (doublon dans la salle)
  UNKNOWN_PEER      (routing vers pair inexistant)
  MALFORMED_MESSAGE
```

**`signaling-server/room-manager.js` (implémenté) :**
```javascript
// rooms: Map<roomId, Map<peerId, { ws, playerName }>>
class RoomManager {
  constructor() { this.rooms = new Map() }

  join(roomId, peerId, playerName, ws) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Map())
    const room = this.rooms.get(roomId)
    if (room.size >= 6) return { error: 'ROOM_FULL' }
    if (room.has(peerId)) return { error: 'INVALID_PEER_ID' }

    const existingPeers = [...room.entries()].map(([id, p]) => ({
      peerId: id, playerName: p.playerName
    }))
    room.set(peerId, { ws, playerName })

    room.forEach((peer, id) => {
      if (id !== peerId && peer.ws.readyState === 1)
        peer.ws.send(JSON.stringify({ type: 'peer-joined', peerId, playerName }))
    })
    return { peers: existingPeers }
  }

  route(fromPeerId, msg) { ... }
  leave(peerId) { ... }
}
module.exports = RoomManager
```

**Heartbeat (implémenté dans `server.js`) :**
```javascript
const HEARTBEAT_INTERVAL = 30000
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate()
    ws.isAlive = false
    ws.ping()
  })
}, HEARTBEAT_INTERVAL)
```

**Déploiement Railway :**
- Connecter le repo GitHub
- Root directory : `signaling-server/`
- Start command : `node server.js`
- Variable d'environnement : `PORT` (Railway l'injecte automatiquement)
- URL exposée : `wss://votre-app.railway.app`

---

## ✅ Phase 3 — Bridge desktopCapturer IPC (FAIT)

**`main/desktop-capturer.js` (implémenté) :**
```javascript
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
```

**`preload/preload-overlay.js` (implémenté) :**
```javascript
const { contextBridge, ipcRenderer } = require('electron')
const IPC = require('../shared/ipc-channels')

contextBridge.exposeInMainWorld('overlayAPI', {
  getSources:           ()   => ipcRenderer.invoke(IPC.GET_SOURCES),
  loadCalibration:      ()   => ipcRenderer.invoke(IPC.LOAD_CALIBRATION),
  onConnect:            (cb) => ipcRenderer.on(IPC.CONNECT, (_, s) => cb(s)),
  onDisconnect:         (cb) => ipcRenderer.on(IPC.DISCONNECT, () => cb()),
  onToggleClickThrough: (cb) => ipcRenderer.on(IPC.TOGGLE_CLICK_THROUGH, (_, v) => cb(v)),
})
```

---

## ✅ Phase 4 — Fenêtre de calibration (FAIT)

> **Changement vs plan initial :** `createCalibrationWindow` est dans `main/ipc-handlers.js` (handler `OPEN_CALIBRATION_WINDOW`), pas dans `main.js`.

**Création de la fenêtre (dans `main/ipc-handlers.js`) :**
```javascript
ipcMain.handle(IPC.OPEN_CALIBRATION_WINDOW, async (_, sourceId) => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const calibWin = new BrowserWindow({
    width, height,
    x: 0, y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload-calibration.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  calibWin.setContentProtection(true)          // Exclut la fenêtre de la capture → évite boucle infinie
  calibWin.setAlwaysOnTop(true, 'screen-saver') // Reste au-dessus même quand un jeu fullscreen est lancé
  calibWin.on('blur', () => calibWin.focus())   // Maintient le focus
  calibWin.loadFile('renderer/calibration/calibration.html')
  calibWin.webContents.once('did-finish-load', () => {
    calibWin.webContents.send(IPC.CALIBRATION_INIT, sourceId)
  })
})
```

**`renderer/calibration/calibration.js` (implémenté) :**
```javascript
window.calibrationAPI.onInit(async (sourceId) => {
  // Stream vidéo live de l'écran en fond
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } }
  })
  document.getElementById('bg-video').srcObject = stream

  // Dessin du rectangle de sélection
  canvas.addEventListener('mousedown', e => { startX = e.clientX; startY = e.clientY; isDragging = true })
  canvas.addEventListener('mousemove', e => { /* dessine overlay sombre + bordure verte */ })
  canvas.addEventListener('mouseup', e => {
    const zone = { x, y, width, height, sourceId }
    window.calibrationAPI.submitZone(zone)  // → main → store → configWin CALIBRATION_DONE
  })
})
```

**Flux IPC complet :**
```
config.js          → main: OPEN_CALIBRATION_WINDOW(sourceId)
main               → crée calibWin, envoie CALIBRATION_INIT(sourceId)
calibration.js     → dessine, mouseup → main: CALIBRATION_SUBMIT(zone)
main               → store.set('calibration', zone), ferme calibWin
main               → configWin: CALIBRATION_DONE(zone)
config.js          → affiche "Zone sélectionnée : 120×100 px à (850, 940)"
```

---

## ✅ Phase 5 — Canvas crop + capture stream (FAIT)

**`startCapture(sourceId, zone)` dans `renderer/overlay/overlay.js` (implémenté) :**
```javascript
async function startCapture(sourceId, zone) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxFrameRate: 20 } }
  })

  const video = document.createElement('video')
  video.srcObject = stream
  await video.play()

  const canvas = document.createElement('canvas')
  canvas.width = 120; canvas.height = 120
  const ctx = canvas.getContext('2d')

  video.addEventListener('loadedmetadata', () => {
    const scaleX = video.videoWidth  / screen.width
    const scaleY = video.videoHeight / screen.height
    captureInterval = setInterval(() => {
      ctx.drawImage(video,
        zone.x * scaleX, zone.y * scaleY,
        zone.width * scaleX, zone.height * scaleY,
        0, 0, 120, 120
      )
    }, 1000 / 15)  // 15 fps via setInterval (pas requestAnimationFrame)
  })

  localStream = canvas.captureStream(15)
  return localStream
}
```

> **Point DPI :** `screen.width` = pixels logiques CSS, `video.videoWidth` = pixels physiques. Les facteurs `scaleX/scaleY` corrigent le scaling Windows (ex: 150% sur 4K).

---

## ✅ Phase 6 — WebRTC Full Mesh (FAIT)

**`WebRTCManager` dans `renderer/overlay/overlay.js` (implémenté) :**
```javascript
class WebRTCManager {
  constructor(signalingURL, peerId, playerName, onRemoteStream, onPeerLeft) {
    this.ws = null; this.peerId = peerId; this.playerName = playerName
    this.onRemoteStream = onRemoteStream; this.onPeerLeft = onPeerLeft
    this.peers = new Map()   // peerId → RTCPeerConnection
    this.localStream = null
  }

  connect(roomId) {
    this.ws = new WebSocket(this.signalingURL)
    this.ws.onopen = () => this.ws.send(JSON.stringify({ type: 'join', roomId, peerId: this.peerId, playerName: this.playerName }))
    this.ws.onmessage = e => this.handleSignal(JSON.parse(e.data))
  }

  setLocalStream(canvasStream) { this.localStream = canvasStream }

  async handleSignal(msg) {
    switch (msg.type) {
      case 'joined':     for (const peer of msg.peers) await this.createOffer(peer.peerId); break
      case 'peer-left':  this.removePeer(msg.peerId); this.onPeerLeft(msg.peerId); break
      case 'offer':      await this.handleOffer(msg.from, msg.sdp); break
      case 'answer':     await this.peers.get(msg.from)?.setRemoteDescription(msg.sdp); break
      case 'ice':        await this.peers.get(msg.from)?.addIceCandidate(msg.candidate); break
    }
  }

  async createPeerConnection(remotePeerId) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    if (this.localStream)
      this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream))
    pc.onicecandidate = e => {
      if (e.candidate)
        this.ws.send(JSON.stringify({ type: 'ice', to: remotePeerId, candidate: e.candidate }))
    }
    pc.ontrack = e => this.onRemoteStream(remotePeerId, e.streams[0])
    this.peers.set(remotePeerId, pc)
    return pc
  }

  disconnect() {
    this.peers.forEach(pc => pc.close())
    this.peers.clear()
    this.ws?.close()
  }
}
```

---

## ✅ Phase 7 — UI de l'overlay (FAIT)

**Tiles dans `renderer/overlay/overlay.js` (implémenté) :**
```javascript
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
  video.width = 120; video.height = 120

  tile.appendChild(label)
  tile.appendChild(video)
  document.getElementById('tiles').appendChild(tile)
}

function removeVideoTile(peerId) {
  document.querySelector(`[data-peer-id="${peerId}"]`)?.remove()
}
```

**`renderer/overlay/overlay.css` (implémenté) :**
```css
body { margin: 0; background: transparent; overflow: hidden; }
#tiles { display: flex; gap: 8px; padding: 8px; }
.tile { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.tile span { color: white; font-size: 10px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile video { border-radius: 8px; }
body.interactive { outline: 2px solid rgba(0, 255, 136, 0.6); }
```

> **Changement vs plan initial :** `-webkit-app-region: drag` non implémenté (pas de drag de l'overlay pour l'instant).

---

## ✅ Phase 8 — VP9 + Optimisation (FAIT)

**`preferVP9(sdp)` dans `renderer/overlay/overlay.js` (implémenté) :**
```javascript
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
```

> **Note :** Limite de bitrate (`sender.setParameters`) non encore implémentée. VP9 seul est prioritarisé dans le SDP.

**Cibles réseau :**
| Joueurs | Upload/joueur | Bandwidth total |
|---|---|---|
| 2 | ~80 kbps | ~160 kbps |
| 4 | ~240 kbps | ~960 kbps |
| 6 | ~400 kbps | ~2 Mbps |

---

## ✅ Phase 9 — Persistance (FAIT PARTIELLEMENT)

**`main/store.js` (implémenté) :**
```javascript
const Store = require('electron-store')

const store = new Store({
  schema: {
    calibration: {
      type: ['object', 'null'], default: null,
      properties: {
        x: { type: 'number' }, y: { type: 'number' },
        width: { type: 'number' }, height: { type: 'number' },
        sourceId: { type: 'string' }
      }
    },
    playerName:   { type: 'string', default: '' },
    roomId:       { type: 'string', default: '' },
    signalingURL: { type: 'string', default: 'wss://votre-serveur.railway.app' }
  }
})
module.exports = store
```

> **À FAIRE :** La zone de calibration est bien sauvegardée/rechargée. En revanche, `config.js` ne charge pas encore `playerName`, `roomId` et `signalingURL` au démarrage (champs non pré-remplis). L'IPC handlers n'expose pas encore `loadSettings` / `saveSettings`.

---

## ❌ Phase 10 — Packaging Windows (À FAIRE)

**`electron-builder.config.js` (fichier présent, contenu à vérifier) :**
```javascript
module.exports = {
  appId: 'com.wwm.cd-overlay',
  productName: 'WWM CD Overlay',
  directories: { output: 'dist' },
  files: [
    'main/**/*', 'preload/**/*', 'renderer/**/*',
    'shared/**/*', 'node_modules/**/*', 'package.json'
  ],
  win: {
    target: ['nsis'],
    icon: 'assets/icon.ico'  // 256×256 .ico — à créer
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false
  }
}
```

> **À FAIRE :** Créer `assets/icon.ico`, valider `npm run build` sur une machine propre.

---

## Ordre d'implémentation (dépendances)

```
✅ Jour 1    : Phase 0 (Bootstrap) → Phase 1 (Trois fenêtres)
✅ Jours 2–3 : Phase 2 (Serveur signaling)
✅ Jours 3–4 : Phase 3 (desktopCapturer IPC)
✅ Jours 4–5 : Phase 4 (Calibration window)
✅ Jours 5–6 : Phase 5 (Canvas crop + capture)
✅ Jours 6–8 : Phase 6 (WebRTC Full Mesh)
✅ Jours 8–9 : Phase 7 (UI overlay + tiles)
✅ Jours 9–10: Phase 8 (VP9 + optimisation partielle)
⚠️ Jour 10  : Phase 9 (Persistance — calibration OK, settings UI manquants)
❌ Jours 10–11: Phase 10 (Packaging — config présente, icon manquante)
```

---

## Stratégie de test par phase

| Phase | Test | Statut |
|---|---|---|
| 0 | `npm start` ouvre fenêtre | ✅ |
| 1 | Alt+O bascule bordure, clic au travers | ✅ |
| 2 | `wscat` — 2 terminaux joignent même salle | ✅ |
| 3 | DevTools overlay : `window.overlayAPI.getSources()` retourne sources | ✅ |
| 4 | Boucle calibration complète — zone affichée dans config | ✅ |
| 5 | Preview 120×120 live dans overlay correspond à la zone | ✅ |
| 6 | 2 machines, même room ID — tiles mutuelles visibles | ✅ |
| 7 | Overlay par-dessus une app fullscreen, click-through confirmé | ✅ |
| 8 | VP9 prioritarisé dans SDP | ✅ |
| 9 | Redémarrer l'app : zone calibration pré-remplie ✅, autres champs ❌ | ⚠️ |
| 10 | Installation propre sur VM sans Node.js | ❌ |

---

## Décisions techniques importantes

### 1. `contextIsolation: true` partout
Ne jamais utiliser `nodeIntegration: true`. Les scripts preload avec `contextBridge.exposeInMainWorld()` exposent uniquement les fonctions nécessaires.

### 2. `desktopCapturer` dans le main process uniquement
Depuis Electron v21, `desktopCapturer` est retiré du renderer. Le sourceId retourné par le main process est passé à `getUserMedia` avec le constraint `chromeMediaSourceId`.

### 3. WebRTC dans l'overlay, pas dans la config
Les `MediaStream` ne sont pas sérialisables via IPC. La config envoie uniquement les paramètres (sourceId, zone, roomId), l'overlay gère tout le reste.

### 4. Full mesh plutôt que SFU
À 120×120 @ 15fps VP9, le full mesh est suffisant pour 6 joueurs.

### 5. `setIgnoreMouseEvents(true, { forward: true })`
`forward: true` transmet quand même les événements souris au renderer en mode click-through.

### 6. GDI fallback obligatoire
`app.commandLine.appendSwitch('disable-features', 'DesktopCaptureMacV2,DirectXCapturer')` dans `main.js` évite les erreurs DXGI `0x887A0026` avec les jeux fullscreen en DirectX.

### 7. `setContentProtection(true)` sur la fenêtre calibration
Exclut la fenêtre calibration de la capture d'écran → évite la boucle infinie (la fenêtre transparente qui se capture elle-même).

### 8. `setAlwaysOnTop(true, 'screen-saver')` + `on('blur', focus)`
Garde la fenêtre calibration focusée même quand un jeu fullscreen est lancé après l'ouverture.

### 9. Installer NSIS `perMachine: false`
Installation dans `%LOCALAPPDATA%\Programs\` sans droits admin.

---

## Ce qui reste à faire

1. **Persistance settings** — Charger/sauvegarder `playerName`, `roomId`, `signalingURL` dans `config.js` au démarrage/connexion
2. **Limite de bitrate WebRTC** — `sender.setParameters({ encodings: [{ maxBitrate: 80000 }] })` après connexion
3. **Icon app** — Créer `assets/icon.ico` (256×256)
4. **Packaging** — Valider `npm run build` et tester l'installeur sur VM propre
5. **Gestion d'erreurs UI** — Afficher ROOM_FULL, échec connexion, etc. dans la config
