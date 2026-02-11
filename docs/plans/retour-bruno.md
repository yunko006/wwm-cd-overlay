# Plan : 3 corrections — retour tests Bruno

## Contexte
Tests avec Bruno ont révélé 3 problèmes :
1. **Double écran** : la calibration s'ouvre en 0,0 et étale la capture sur les 2 écrans → impossible de sélectionner la bonne zone.
2. **Déco manquante** : fermer la config sans cliquer "Déconnecter" laisse le peer connecté en permanence dans la room WebRTC.
3. **Saisie répétitive** : pas de sauvegarde des champs texte (playerName, roomId, signalingURL) → tout doit être retapé à chaque démarrage.

---

## Problème 1 — Sélecteur d'écran multi-moniteur

### Cause
- `desktopCapturer.getSources()` retourne tous les écrans mais `config.js` prend `sources[0]` sans laisser le choix.
- La fenêtre calibration est créée avec `x:0, y:0` + la taille du display primaire → elle recouvre seulement l'écran 1.

### Solution

**A) Config window — dropdown de sélection d'écran**
- Ajouter un `<select id="sourceSelect">` avant le bouton "Sélectionner zone" dans `config.html` (toujours visible, même avec un seul écran).
- Peupler le select via `configAPI.getSources()` au chargement (nom de la source affiché).
- Pré-sélectionner la source correspondant à `calibration.sourceId` depuis le store si une calibration existe.
- **Pas de `lastSourceId` séparé dans le store** : le `sourceId` est uniquement lié à la calibration. Changer le dropdown sans recalibrer invalide la calibration courante → effacer l'affichage de la zone et désactiver le bouton Connect jusqu'à nouvelle calibration.

**B) Fenêtre calibration — positionnée sur le bon écran**
- Lors de `OPEN_CALIBRATION_WINDOW`, récupérer le display correspondant à la source choisie via `screen.getAllDisplays()`.
- Matcher display et source : comparer `String(display.id)` avec `source.display_id` (attention : `display_id` est une string, `display.id` est un number — la conversion est obligatoire).
- Créer la fenêtre calibration aux coordonnées `{x, y, width, height}` du display ciblé au lieu de `{x:0, y:0, ...primaryDisplay}`.
- Note : les bounds de `screen.getAllDisplays()` sont en pixels logiques (DPI-scaled). Electron les gère correctement pour le positionnement de fenêtre, pas de conversion manuelle nécessaire.

**Fichiers modifiés :**
- `renderer/config/config.html` — ajouter `<select id="sourceSelect">`
- `renderer/config/config.js` — peupler le select, pré-sélectionner sur `calibration.sourceId`, invalider la calibration si la sélection change avant une nouvelle calibration
- `main/ipc-handlers.js` — utiliser les bounds du display correspondant (`String(display.id) === source.display_id`) pour créer la fenêtre calibration
- `main/store.js` — pas de modification (pas de `lastSourceId`)

---

## Problème 2 — Déconnexion automatique à la fermeture de la config

### Cause
`configWin.on('closed', ...)` dans `main.js` ne fait que `configWin = null`. Aucun message IPC DISCONNECT n'est envoyé à l'overlay → le peer reste dans la room jusqu'au timeout heartbeat (30s).

### Solution
Ajouter dans `ipc-handlers.js` une fonction `setupConfigCloseHandler(configWin)` qui pose un listener `'close'` (avant fermeture, `webContents` encore accessible) sur la fenêtre config et envoie `IPC.DISCONNECT` à l'overlay.

Appeler cette fonction depuis `main.js` après la création de la fenêtre config.

Note comportementale : quand la config est rouverte après fermeture, l'overlay est déjà déconnecté → les boutons Connect/Disconnect à leur état initial (Connect enabled) sont corrects. Pas de désynchronisation UI.

Note sur la robustesse : si l'overlay est fermé au même moment (`overlayWin = null`), le handler fait déjà `if (overlayWin)` → pas de crash, échec silencieux acceptable.

**Fichiers modifiés :**
- `main/ipc-handlers.js` — ajouter `setupConfigCloseHandler(configWin)` + l'exporter
- `main/main.js` — importer et appeler `setupConfigCloseHandler(configWin)`

---

## Problème 3 — Sauvegarde automatique des champs texte

### Cause
`playerName`, `roomId` et `signalingURL` sont dans le schema du store avec des valeurs par défaut, mais ne sont jamais écrits dans le store depuis `config.js`.

Note : `signalingURL` a la valeur par défaut `'wss://votre-serveur.railway.app'` dans le store. Au premier démarrage, `loadFields` retournera cette valeur → le champ sera pré-rempli avec cette URL par défaut. C'est le comportement voulu (guide l'utilisateur).

### Solution
- Nouveaux canaux IPC : `config:save-fields` (invoke) et `config:load-fields` (invoke).
- Sauvegarde déclenchée au `blur` de chaque champ + au clic "Rejoindre".
- Chargement dans `init()` au démarrage de la config.

**Fichiers modifiés :**
- `shared/ipc-channels.js` — ajouter `CONFIG_SAVE_FIELDS` et `CONFIG_LOAD_FIELDS`
- `preload/preload-config.js` — exposer `saveFields(fields)` et `loadFields()`
- `main/ipc-handlers.js` — handlers pour les 2 nouveaux canaux
- `renderer/config/config.js` — listeners `blur` sur les 3 champs + chargement dans `init()`
- `main/store.js` — schema déjà correct, pas de modification

---

## Ordre d'implémentation

1. **P3** — sauvegarde champs (le plus simple, grande valeur UX)
2. **P2** — déco auto fermeture (quelques lignes, impact stabilité)
3. **P1** — multi-écran (le plus complexe, UI + logique display)

## Vérification

- **P3** : Remplir les champs → relancer l'app → champs préremplis.
- **P2** : Se connecter → fermer la config → l'overlay se vide et le peer quitte la room.
- **P1** :
  - Setup double écran → dropdown liste les 2 écrans → sélectionner écran 2 → fenêtre calibration s'ouvre sur l'écran 2 uniquement.
  - Changer le dropdown sans recalibrer → zone effacée + Connect désactivé.
  - Relancer l'app avec une calibration existante → dropdown pré-sélectionné sur le bon écran.
