# Plan : Layout tiles configurable (direction + maxRows/maxCols) + bouton hide overlay

## Context
Actuellement les tiles de l'overlay sont en flexbox `flex-wrap: wrap` sans logique de contrôle. Quand on sera 6 joueurs, l'affichage est imprévisible selon la taille de l'overlay. L'utilisateur veut pouvoir choisir :
- **Direction** : horizontal (tiles en lignes) ou vertical (tiles en colonnes)
- **maxRows** : nombre max de lignes (mode horizontal uniquement)
- **maxCols** : nombre max de colonnes (mode vertical uniquement)
- **threshold** : à partir de combien de tiles totales (self inclus) le multi-row/col s'active
- **Bouton hide/show** dans la config : rester connecté mais cacher l'overlay
- **Resize automatique** de la fenêtre overlay quand le layout change

## Comportement attendu

### Mode horizontal
- Toutes les tiles sur 1 ligne jusqu'à `threshold` tiles
- À partir de `threshold+1` tiles → on passe à `maxRows` lignes
- Ex: threshold=4, maxRows=2, 6 tiles → grille 2×3 (2 lignes de 3)
- La fenêtre se redimensionne automatiquement pour coller au contenu

### Mode vertical
- Toutes les tiles sur 1 colonne jusqu'à `threshold` tiles
- À partir de `threshold+1` tiles → on passe à `maxCols` colonnes
- Ex: threshold=4, maxCols=2, 6 tiles → grille 3×2 (3 lignes, 2 colonnes)
- La fenêtre se redimensionne automatiquement pour coller au contenu

### Threshold
- Compte le nombre total de tiles affichées, self inclus
- threshold=4 → bascule en multi quand il y a 5 tiles (soi + 4 peers)

## Fichiers à modifier

1. **`main/store.js`** — Ajouter les nouveaux champs dans le schéma `overlayAppearance`
2. **`shared/ipc-channels.js`** — Ajouter `OVERLAY_SET_VISIBILITY`
3. **`main/ipc-handlers.js`** — Handler pour show/hide overlay via `overlayWin.hide()` / `overlayWin.show()`
4. **`preload/preload-config.js`** — Exposer `setOverlayVisibility`
5. **`renderer/config/config.html`** — Ajouter les contrôles layout + bouton Hide/Show overlay
6. **`renderer/config/config.js`** — Charger/envoyer les nouveaux champs + gérer le bouton toggle
7. **`renderer/overlay/overlay.css`** — Adapter le layout `#tiles`
8. **`renderer/overlay/overlay.js`** — Appliquer le layout dynamique + recalcul à chaque ajout/suppression de tile

## Implémentation détaillée

### 1. `main/store.js`
Étendre `overlayAppearance` :
```js
overlayAppearance: {
  type: 'object',
  default: { tileSize: 120, nameSize: 10, direction: 'horizontal', maxRows: 2, maxCols: 2, threshold: 4 },
  properties: {
    tileSize:   { type: 'number' },
    nameSize:   { type: 'number' },
    direction:  { type: 'string' },   // 'horizontal' | 'vertical'
    maxRows:    { type: 'number' },   // 1..4 — actif en mode horizontal
    maxCols:    { type: 'number' },   // 1..4 — actif en mode vertical
    threshold:  { type: 'number' }    // 1..8
  }
}
```

### 2. `renderer/config/config.html`
Dans la section Appearance, après les sliders existants, ajouter :

```html
<!-- Direction -->
<label>Direction</label>
<div class="radio-group">
  <label><input type="radio" name="direction" value="horizontal"> Horizontal</label>
  <label><input type="radio" name="direction" value="vertical"> Vertical</label>
</div>

<!-- Threshold -->
<label>Activer multi-ligne après <span id="thresholdVal">4</span> tiles</label>
<input type="range" id="threshold" min="1" max="8" step="1" value="4">

<!-- Max rows (horizontal only) -->
<label id="maxRowsLabel">Nombre de lignes max : <span id="maxRowsVal">2</span></label>
<input type="range" id="maxRows" min="1" max="4" step="1" value="2">

<!-- Max cols (vertical only) -->
<label id="maxColsLabel">Nombre de colonnes max : <span id="maxColsVal">2</span></label>
<input type="range" id="maxCols" min="1" max="4" step="1" value="2">
```

Les sliders `maxRows` et `maxCols` sont affichés/cachés selon la direction sélectionnée.

### 3. `renderer/config/config.js`
- Charger `direction`, `threshold`, `maxRows`, `maxCols` depuis `getOverlayAppearance()` au démarrage
- Sur chaque `input`/`change` event des nouveaux contrôles → appeler `setOverlayAppearance()` avec tous les champs
- Afficher/cacher les sliders maxRows / maxCols selon la direction :
```js
function updateLayoutControls(direction) {
  maxRowsLabel.style.display = direction === 'horizontal' ? '' : 'none'
  maxRowsInput.style.display = direction === 'horizontal' ? '' : 'none'
  maxColsLabel.style.display = direction === 'vertical' ? '' : 'none'
  maxColsInput.style.display = direction === 'vertical' ? '' : 'none'
}
```

### 4. `renderer/overlay/overlay.css`
Le `#tiles` garde son `display: flex` et `flex-wrap: wrap`. `flex-direction`, `height` (pour le mode vertical) et `max-height` seront appliqués dynamiquement par JS.

### 5. `renderer/overlay/overlay.js`

#### État global
```js
let currentAppearance = { direction: 'horizontal', maxRows: 2, maxCols: 2, threshold: 4, tileSize: 120, nameSize: 10 }
```
Valeur par défaut pour éviter les crashes si `applyLayout` est appelée avant que `getOverlayAppearance` ait résolu.

#### Fonction `applyLayout`
```js
const GAP = 8
const DRAG_BAR_H = 14
const PADDING = 8  // padding du #tiles (8px de chaque côté → 16px total)

function applyLayout(appearance, tileCount) {
  const { direction, maxRows, maxCols, threshold, tileSize, nameSize } = appearance
  const labelH = Math.ceil(nameSize * 1.4) + 2  // line-height ≈ 1.4 + gap tile interne (2px)
  const tileH = tileSize + labelH
  const tileW = tileSize

  if (direction === 'horizontal') {
    tilesContainer.style.flexDirection = 'row'
    tilesContainer.style.height = 'auto'

    const effectiveRows = (tileCount > threshold && maxRows > 1) ? maxRows : 1
    const effectiveCols = Math.ceil(tileCount / effectiveRows)

    if (effectiveRows > 1) {
      tilesContainer.style.maxHeight = (effectiveRows * tileH + (effectiveRows - 1) * GAP + PADDING * 2) + 'px'
    } else {
      tilesContainer.style.maxHeight = 'none'
    }
    tilesContainer.style.maxWidth = 'none'

    const winW = effectiveCols * tileW + (effectiveCols - 1) * GAP + PADDING * 2
    const winH = effectiveRows * tileH + (effectiveRows - 1) * GAP + PADDING * 2 + DRAG_BAR_H
    window.overlayAPI.setOverlayBounds({ width: winW, height: winH })

  } else {
    // vertical — flex-wrap: wrap en colonne nécessite une height fixe
    tilesContainer.style.flexDirection = 'column'
    tilesContainer.style.maxWidth = 'none'
    tilesContainer.style.maxHeight = 'none'

    const effectiveCols = (tileCount > threshold && maxCols > 1) ? maxCols : 1
    const effectiveRows = Math.ceil(tileCount / effectiveCols)

    // height fixe indispensable pour que flex-wrap: wrap fonctionne en colonne
    tilesContainer.style.height = (effectiveRows * tileH + (effectiveRows - 1) * GAP + PADDING * 2) + 'px'

    const winW = effectiveCols * tileW + (effectiveCols - 1) * GAP + PADDING * 2
    const winH = effectiveRows * tileH + (effectiveRows - 1) * GAP + PADDING * 2 + DRAG_BAR_H
    window.overlayAPI.setOverlayBounds({ width: winW, height: winH })
  }
}
```

**Point clé (mode vertical)** : `flex-wrap: wrap` avec `flex-direction: column` ne wrappe que si le conteneur a une `height` définie. Sans ça, tout reste sur 1 colonne. La solution : fixer `tilesContainer.style.height` à la hauteur exacte d'une colonne.

#### Intégration dans les handlers existants
```js
window.overlayAPI.onAppearanceChange((appearance) => {
  document.documentElement.style.setProperty('--tile-size', appearance.tileSize + 'px')
  document.documentElement.style.setProperty('--name-size', appearance.nameSize + 'px')
  currentAppearance = appearance
  applyLayout(appearance, tilesContainer.children.length)
})

window.overlayAPI.getOverlayAppearance().then((appearance) => {
  document.documentElement.style.setProperty('--tile-size', appearance.tileSize + 'px')
  document.documentElement.style.setProperty('--name-size', appearance.nameSize + 'px')
  currentAppearance = appearance
  applyLayout(appearance, tilesContainer.children.length)
})
```

#### Dans `addVideoTile` et `removeVideoTile`
Appeler `applyLayout` **après** l'ajout/suppression dans le DOM :
```js
function addVideoTile(peerId, playerName, stream) {
  // ... création tile ...
  tilesContainer.appendChild(tile)
  applyLayout(currentAppearance, tilesContainer.children.length)  // count correct car tile déjà ajoutée
}

function removeVideoTile(peerId) {
  document.querySelector(`[data-peer-id="${peerId}"]`)?.remove()
  applyLayout(currentAppearance, tilesContainer.children.length)  // count correct car tile déjà retirée
}
```

### 6. Bouton hide/show overlay

**`shared/ipc-channels.js`** : ajouter `OVERLAY_SET_VISIBILITY: 'overlay:set-visibility'`

**`main/ipc-handlers.js`** : ajouter un handler `ipcMain.handle(IPC.OVERLAY_SET_VISIBILITY, (_, visible) => { ... })`
- `visible === true` → `overlayWin.show()`
- `visible === false` → `overlayWin.hide()`

**`preload/preload-config.js`** : exposer `setOverlayVisibility: (v) => ipcRenderer.invoke(IPC.OVERLAY_SET_VISIBILITY, v)`

**`renderer/config/config.html`** : bouton toggle dans la section overlay/connect, label dynamique "Cacher l'overlay" / "Afficher l'overlay"

**`renderer/config/config.js`** :

État initial = `true` (overlay toujours visible au démarrage). Si l'utilisateur ferme et rouvre la fenêtre config sans redémarrer, l'état repart à `true` — comportement acceptable car `overlayWin` est recréée à chaque démarrage dans l'état visible.

```js
let overlayVisible = true
btnToggleOverlay.addEventListener('click', () => {
  overlayVisible = !overlayVisible
  window.configAPI.setOverlayVisibility(overlayVisible)
  btnToggleOverlay.textContent = overlayVisible ? "Cacher l'overlay" : "Afficher l'overlay"
})
```

Note : `overlayWin.hide()` / `overlayWin.show()` ne déconnecte pas WebRTC, la session reste active.

## Vérification
1. `npm start` → ouvrir config → section Appearance → vérifier les 4 nouveaux contrôles (direction, threshold, maxRows, maxCols)
2. Vérifier que maxRows est caché quand direction=vertical et maxCols caché quand direction=horizontal
3. Changer direction → vérifier orientation des tiles dans l'overlay
4. Ajouter tiles jusqu'à dépasser le threshold → vérifier passage en multi-row/col
5. Vérifier que la fenêtre overlay se redimensionne automatiquement à chaque ajout de tile
6. Vérifier persistance des valeurs après redémarrage (electron-store)
7. Cliquer "Cacher l'overlay" → overlay disparaît mais la connexion WebRTC reste active
8. Cliquer "Afficher l'overlay" → overlay réapparaît avec les tiles intactes
