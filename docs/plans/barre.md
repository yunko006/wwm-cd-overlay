# Plan : Barre de déplacement + Sliders de taille (overlay)

## Contexte

L'overlay affiche les tiles (vidéos WebRTC des joueurs) dans une fenêtre transparente toujours au premier plan. Actuellement :
- La position se configure uniquement via des champs numériques X/Y dans la fenêtre config
- La taille des tiles (`--tile-size: 120px`) et la taille des noms (`--name-size: 10px`) sont des valeurs fixes dans le CSS

L'objectif est de permettre aux utilisateurs de :
1. **Déplacer l'overlay directement** en le glissant avec une barre visible
2. **Ajuster la taille des tiles et des noms** via des sliders dans la fenêtre config

---

## Approche retenue

### 1. Barre de déplacement dans l'overlay (drag bar)

Ajouter une fine barre en haut de la fenêtre overlay qui :
- Est visible (semi-transparente, discrète)
- Capture les événements souris pour permettre le drag (`-webkit-app-region: drag`)
- Désactive temporairement le `setIgnoreMouseEvents` pendant le survol de la barre
- Repositionne la fenêtre via `window.overlayAPI.setOverlayBounds()`
- Sauvegarde la nouvelle position (IPC existant `OVERLAY_SET_BOUNDS` gère déjà la persistance)

**Mécanisme :** Le preload overlay expose déjà `setOverlayBounds`. On utilise l'IPC existant pour sauvegarder la position après le drag. Pour le drag lui-même, on utilise `mousedown` + `mousemove` sur `document` + `ipcRenderer.invoke` pour déplacer la fenêtre.

> Note : `-webkit-app-region: drag` ne fonctionne pas sur les fenêtres avec `setIgnoreMouseEvents`. Il faut donc utiliser une approche manuelle : désactiver le click-through pendant le hover de la barre, écouter `mousedown`/`mousemove`/`mouseup`, et appeler `setOverlayBounds` en continu.

**Nouveau canal IPC nécessaire :** `overlay:set-ignore-mouse` pour activer/désactiver le click-through depuis le renderer overlay.

### 2. Sliders dans la fenêtre config

Ajouter une nouvelle section "Apparence" dans `config.html` avec :
- Slider **Taille des tiles** (range 60–200px, défaut 120)
- Slider **Taille des noms** (range 8–24px, défaut 10)
- Affichage de la valeur en temps réel

Les changements sont envoyés à l'overlay via un nouveau canal IPC `OVERLAY_SET_APPEARANCE`, et persistés dans electron-store.

---

## Fichiers à modifier

| Fichier | Changements |
|---|---|
| `shared/ipc-channels.js` | +3 canaux : `OVERLAY_SET_APPEARANCE`, `OVERLAY_GET_APPEARANCE`, `OVERLAY_SET_IGNORE_MOUSE` |
| `main/store.js` | Ajouter `overlayAppearance` au schéma (tileSize, nameSize) |
| `main/ipc-handlers.js` | Handler `OVERLAY_SET_APPEARANCE` (store + forward vers overlay), Handler `OVERLAY_SET_IGNORE_MOUSE` |
| `preload/preload-config.js` | Exposer `setOverlayAppearance`, `getOverlayAppearance` |
| `preload/preload-overlay.js` | Exposer `onAppearanceChange`, `getOverlayAppearance`, `setIgnoreMouse` |
| `renderer/config/config.html` | Nouvelle section sliders |
| `renderer/config/config.js` | Init sliders depuis store, listeners → IPC |
| `renderer/config/config.css` | Style sliders |
| `renderer/overlay/overlay.html` | Ajouter `<div id="drag-bar">` |
| `renderer/overlay/overlay.js` | Logique drag + appliquer CSS vars à la réception |
| `renderer/overlay/overlay.css` | Style drag bar + transition sur CSS vars |

---

## Détail d'implémentation

### shared/ipc-channels.js
```js
OVERLAY_SET_APPEARANCE:   'overlay:set-appearance',
OVERLAY_GET_APPEARANCE:   'overlay:get-appearance',
OVERLAY_SET_IGNORE_MOUSE: 'overlay:set-ignore-mouse',
```

### main/store.js — schéma
```js
overlayAppearance: {
  type: 'object',
  default: { tileSize: 120, nameSize: 10 },
  properties: {
    tileSize: { type: 'number' },
    nameSize: { type: 'number' }
  }
}
```

### main/ipc-handlers.js — nouveaux handlers
```js
ipcMain.handle(IPC.OVERLAY_SET_APPEARANCE, (_, appearance) => {
  store.set('overlayAppearance', appearance)
  const overlayWin = getOverlayWin()
  if (overlayWin) overlayWin.webContents.send(IPC.OVERLAY_SET_APPEARANCE, appearance)
})

// handle/invoke (pas on/send) car on a besoin de la valeur de retour
ipcMain.handle(IPC.OVERLAY_GET_APPEARANCE, () => store.get('overlayAppearance'))

// on/send (pas handle/invoke) car pas de valeur de retour — appel fire-and-forget
ipcMain.on(IPC.OVERLAY_SET_IGNORE_MOUSE, (_, ignore) => {
  const overlayWin = getOverlayWin()
  if (overlayWin) overlayWin.setIgnoreMouseEvents(ignore, { forward: true })
})
```

### renderer/overlay/overlay.html — drag bar
```html
<div id="drag-bar"></div>
<div id="tiles"></div>
```

### renderer/overlay/overlay.css — drag bar
```css
#drag-bar {
  height: 14px;
  width: 100%;
  background: rgba(255,255,255,0.08);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
}
#drag-bar::after {
  content: '';
  width: 40px;
  height: 3px;
  background: rgba(255,255,255,0.35);
  border-radius: 2px;
}
#drag-bar:active { cursor: grabbing; }
```

### renderer/overlay/overlay.js — logique drag
```js
const dragBar = document.getElementById('drag-bar')

dragBar.addEventListener('mouseenter', () => window.overlayAPI.setIgnoreMouse(false))
dragBar.addEventListener('mouseleave', () => { if (!dragging) window.overlayAPI.setIgnoreMouse(true) })

let dragging = false, startX, startY, winStartX, winStartY

// Utiliser Pointer Events + setPointerCapture pour maintenir le suivi
// même si la souris sort de la fenêtre overlay pendant le drag.
// Avec mousedown/mousemove classiques, les événements sont perdus dès que
// le curseur quitte la fenêtre → drag figé, mouseup jamais reçu.
dragBar.addEventListener('pointerdown', async e => {
  dragging = true
  dragBar.setPointerCapture(e.pointerId)  // capture tous les pointer events même hors fenêtre
  startX = e.screenX; startY = e.screenY
  const bounds = await window.overlayAPI.getOverlayBounds()
  winStartX = bounds.x; winStartY = bounds.y
  e.preventDefault()
})

dragBar.addEventListener('pointermove', e => {
  if (!dragging) return
  window.overlayAPI.setOverlayBounds({
    x: winStartX + (e.screenX - startX),
    y: winStartY + (e.screenY - startY)
  })
})

dragBar.addEventListener('pointerup', () => {
  if (dragging) { dragging = false; window.overlayAPI.setIgnoreMouse(true) }
})

// Appliquer appearance
window.overlayAPI.onAppearanceChange(({ tileSize, nameSize }) => {
  document.documentElement.style.setProperty('--tile-size', tileSize + 'px')
  document.documentElement.style.setProperty('--name-size', nameSize + 'px')
})
```

### renderer/config/config.html — section sliders
```html
<section>
  <label>Apparence des tiles</label>
  <div class="slider-row">
    <label>Taille des tiles <span id="tileSizeVal">120</span>px</label>
    <input id="tileSize" type="range" min="60" max="200" step="4" value="120">
  </div>
  <div class="slider-row">
    <label>Taille des noms <span id="nameSizeVal">10</span>px</label>
    <input id="nameSize" type="range" min="8" max="24" step="1" value="10">
  </div>
</section>
```

### renderer/config/config.js — init + listeners
```js
// Init
const appearance = await window.configAPI.getOverlayAppearance()
tileSizeInput.value = appearance.tileSize
nameSizeInput.value = appearance.nameSize
tileSizeVal.textContent = appearance.tileSize
nameSizeVal.textContent = appearance.nameSize

// Listeners (envoi live + persistance)
tileSizeInput.addEventListener('input', () => {
  tileSizeVal.textContent = tileSizeInput.value
  window.configAPI.setOverlayAppearance({ tileSize: +tileSizeInput.value, nameSize: +nameSizeInput.value })
})
nameSizeInput.addEventListener('input', () => {
  nameSizeVal.textContent = nameSizeInput.value
  window.configAPI.setOverlayAppearance({ tileSize: +tileSizeInput.value, nameSize: +nameSizeInput.value })
})
```

---

## Initialisation au démarrage de l'overlay

Dans `overlay.js`, au chargement, récupérer les valeurs persistées et les appliquer aux CSS vars :
```js
window.overlayAPI.getOverlayAppearance().then(({ tileSize, nameSize }) => {
  document.documentElement.style.setProperty('--tile-size', tileSize + 'px')
  document.documentElement.style.setProperty('--name-size', nameSize + 'px')
})
```

---

## Vérification / Test

1. Lancer l'app (`npm start`)
2. **Drag bar** : survoler la barre → curseur "grab" → maintenir clic + déplacer (y compris hors de la fenêtre) → l'overlay suit le curseur → relâcher → cliquer en dehors de la barre passe au travers (click-through OK)
3. **Sliders** : ouvrir config → bouger le slider "Taille des tiles" → les tiles dans l'overlay changent de taille en temps réel → fermer et relancer l'app → valeurs restaurées
4. Vérifier que la position sauvegardée persiste après redémarrage
