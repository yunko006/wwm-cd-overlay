# 🎮 Team Cooldown Live Overlay

### Partage en temps réel des icônes de cooldown entre joueurs (Where Winds Meet)

---

## 🧠 Objectif du projet

Créer une application desktop qui permet à des joueurs en équipe de :

- Sélectionner **une icône de skill** sur leur écran
- Partager **uniquement cette zone vidéo**
- Afficher en overlay in-game les icônes des autres joueurs

⚠️ L’application :

- ❌ ne lit pas la mémoire du jeu
- ❌ ne modifie pas le jeu
- ❌ ne calcule pas les cooldowns
- ✅ montre le **visuel réel du HUD**

C’est un **relay vidéo ultra ciblé**.

---

# 🏗️ Architecture Générale

Chaque joueur :
[Capture icône] → [Mini flux vidéo] → [WebRTC] → [Autres joueurs]

Tous les flux sont affichés dans un overlay Electron.

---

# 🧰 Stack Technique

| Brique          | Technologie         |
| --------------- | ------------------- |
| Overlay Desktop | Electron            |
| Capture écran   | getDisplayMedia     |
| Crop vidéo      | Canvas              |
| Streaming       | WebRTC              |
| Signalisation   | Node.js + WebSocket |
| UI              | HTML / CSS          |
| Build           | Electron Builder    |

---

# 🚧 PHASE 1 — Setup Electron

```bash
mkdir team-cd-overlay
cd team-cd-overlay
npm init -y
npm install electron ws

Structure :

/main.js
/index.html
/renderer.js
/signaling-server/server.js

🖥️ PHASE 2 — Création Overlay Transparent
main.js

const { app, BrowserWindow, globalShortcut } = require('electron')

let win

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 500,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    webPreferences: { backgroundThrottling: false }
  })

  win.loadFile('index.html')
  win.setIgnoreMouseEvents(true)

  globalShortcut.register('Alt+O', () => {
    const ignore = win.isIgnoreMouseEvents()
    win.setIgnoreMouseEvents(!ignore)
  })
})

🌐 PHASE 3 — Serveur de Signalisation WebRTC

mkdir signaling-server
cd signaling-server
npm init -y
npm install ws

server.js

const WebSocket = require('ws')
const wss = new WebSocket.Server({ port: 8080 })

wss.on('connection', ws => {
  ws.on('message', msg => {
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    })
  })
})

🎥 PHASE 4 — Capture de l’icône
renderer.js

const video = document.createElement('video')
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')

async function startCapture() {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
  video.srcObject = stream
  await video.play()

  setInterval(() => {
    ctx.drawImage(video, skillX, skillY, skillW, skillH, 0, 0, 120, 120)
  }, 50)
}

📡 PHASE 5 — WebRTC Streaming

const pc = new RTCPeerConnection()
const stream = canvas.captureStream(20)

stream.getTracks().forEach(track => pc.addTrack(track, stream))

Envoyer via WebSocket :

    offer

    answer

    ICE candidates

🖥️ PHASE 6 — Réception Flux

<div id="team"></div>

function addRemoteStream(stream, playerName) {
  const video = document.createElement('video')
  video.srcObject = stream
  video.autoplay = true
  video.width = 120
  video.height = 120

  const container = document.createElement('div')
  container.innerText = playerName
  container.appendChild(video)

  document.getElementById('team').appendChild(container)
}

🎨 PHASE 7 — UI Overlay

Style recommandé :

body {
  background: rgba(0,0,0,0.4);
  color: white;
  font-family: sans-serif;
}
video {
  border-radius: 12px;
  margin: 4px;
}

⚙️ PHASE 8 — Calibration Zone

Ajouter bouton “Select Skill Zone” :

    Afficher overlay de sélection

    L’utilisateur déplace un rectangle

    Sauvegarder :

skillX, skillY, skillW, skillH

⚡ PHASE 9 — Optimisation
Paramètre	Valeur
Résolution	120×120
FPS	15–20
Codec	VP9
Joueurs max	5–6
🔒 PHASE 10 — Sécurité

✔ Pas d’injection
✔ Pas de lecture mémoire
✔ Juste capture écran autorisée
✔ Comparable à Discord streaming
🚀 MVP Final

Tu dois obtenir :

    Overlay visible en jeu

    Chaque joueur partage 1 icône

    Streaming fluide

    UI stable
```
