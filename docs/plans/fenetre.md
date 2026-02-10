# Plan — Calibration avec flux vidéo live (Option B)

## Contexte

Actuellement, la fenêtre de calibration affiche un **screenshot statique** de l'écran
(capturé une seule fois par `desktopCapturer.getSources` avec `thumbnailSize`).
Ce workflow pose deux problèmes :
- L'utilisateur doit masquer/démasquer les fenêtres Electron, ce qui peut désynchroniser l'affichage.
- Le screenshot peut ne pas refléter fidèlement ce que le joueur voit dans le jeu
  (notamment si le jeu est en fullscreen exclusif et n'est plus en focus au moment du capture).

L'objectif est de remplacer ce screenshot statique par un **flux vidéo live** via
`navigator.mediaDevices.getUserMedia` + `chromeMediaSourceId`, exactement comme le
fait déjà l'overlay pour la capture de jeu. L'utilisateur verra l'écran en temps réel
pendant qu'il dessine sa zone.

---

## Fichiers à modifier

| Fichier | Changement |
|---|---|
| `main/ipc-handlers.js` | Supprimer la capture screenshot + l'envoi de `screenshotDataURL` |
| `renderer/calibration/calibration.html` | Ajouter un `<video>` en background |
| `renderer/calibration/calibration.css` | Positionner la `<video>` derrière le canvas |
| `renderer/calibration/calibration.js` | Remplacer le chargement d'image par un flux live |

Le preload `preload/preload-calibration.js` et `shared/ipc-channels.js` ne changent pas.

---

## Étapes détaillées

### 1. `main/ipc-handlers.js` — Handler `OPEN_CALIBRATION_WINDOW`

Supprimer tout le bloc de capture screenshot :
```javascript
// SUPPRIMER ces lignes
const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: ... })
const source = sources.find(s => s.id === sourceId) || sources[0]
const screenshotDataURL = source.thumbnail.toDataURL()
```

Supprimer aussi le masquage/démasquage des fenêtres (devenu inutile) :
```javascript
// SUPPRIMER
if (configWin) configWin.hide()
if (overlayWin) overlayWin.hide()
await new Promise(resolve => setTimeout(resolve, 150))
if (configWin) configWin.show()
if (overlayWin) overlayWin.show()
```

Modifier l'envoi IPC pour n'envoyer que le `sourceId` :
```javascript
// AVANT
calibWin.webContents.send(IPC.CALIBRATION_INIT, { sourceId, screenshotDataURL })

// APRÈS
calibWin.webContents.send(IPC.CALIBRATION_INIT, { sourceId })
```

Le `{ width, height }` de `screen.getPrimaryDisplay().bounds` reste utilisé pour la
taille de la fenêtre de calibration.

### 2. `renderer/calibration/calibration.html` — Ajouter `<video>`

Ajouter un élément `<video>` **avant** le canvas pour qu'il serve de fond :
```html
<body>
  <video id="bg-video" autoplay muted playsinline></video>
  <canvas id="select-canvas"></canvas>
  <div id="hint">Cliquez et faites glisser pour sélectionner votre icône de cooldown</div>
  <script src="calibration.js"></script>
</body>
```

Le `Content-Security-Policy` a déjà `media-src *`, rien à changer.

### 3. `renderer/calibration/calibration.css` — Positionner la vidéo

Ajouter les règles pour la vidéo de fond (derrière le canvas, couvre tout l'écran) :
```css
#bg-video {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  z-index: 0;
}
```

Ajouter `z-index: 1` sur `#select-canvas` et `z-index: 2` sur `#hint`.

### 4. `renderer/calibration/calibration.js` — Flux live au lieu de screenshot

**Remplacer le bloc `onInit`** pour démarrer un flux vidéo :
```javascript
window.calibrationAPI.onInit(async ({ sourceId: sid }) => {
  sourceId = sid
  const bgVideo = document.getElementById('bg-video')

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 10   // 10 fps suffisant pour la calibration
      }
    }
  })
  bgVideo.srcObject = stream
})
```

**Adapter le canvas** : supprimer toutes les références à `bgImage`. Le fond est
maintenant la `<video>` HTML, le canvas est transparent entre les coups de souris.
Le canvas ne dessine plus l'image de fond, seulement l'overlay sombre + le rectangle vert :

```javascript
// mousemove — version simplifiée sans bgImage
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
```

Supprimer `let bgImage = null` et toutes ses utilisations.

Ajouter `ctx.clearRect` dans `mousedown` :
```javascript
canvas.addEventListener('mousedown', e => {
  startX = e.clientX
  startY = e.clientY
  isDragging = true
  ctx.clearRect(0, 0, canvas.width, canvas.height)
})
```

---

## Résultat attendu

1. L'utilisateur clique "Sélectionner zone" dans la config
2. La fenêtre de calibration s'ouvre immédiatement (plus de délai 150ms)
3. La vidéo live du bureau/jeu s'affiche en fond (le jeu est visible en direct)
4. L'utilisateur dessine un rectangle par-dessus ses icônes de cooldown
5. La zone est soumise, la fenêtre se ferme, les coordonnées sont sauvegardées

---

## Vérification

- Lancer l'app avec `npm start` (ou `electron .`)
- Ouvrir une source quelconque (navigateur, jeu) en arrière-plan
- Cliquer "Sélectionner zone" → la fenêtre doit afficher le flux live
- Tracer un rectangle → la zone doit être correctement sauvegardée (visible dans config)
- Relancer l'app → la calibration doit être persistée (electron-store)
