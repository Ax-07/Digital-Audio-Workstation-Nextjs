# 🎹 Piano Roll — Documentation Complète

Cette documentation fusionne **tous les READMEs précédents**, organise l’ensemble en **chapitres structurés**, et inclut un **diagramme global d’architecture** couvrant :

* Les interactions
* Les hooks
* Le système de rendu
* Le viewport
* Le MIDI
* Le composant principal `PianoRoll` fileciteturn0file0

---

## 📘 Sommaire

1. **Introduction générale**
2. **Architecture globale (diagramme)**
3. **Interactions & User Input**
4. **Système de coordonnées & Grid**
5. **Moteur de rendu (Canvas)**
6. **Hooks utilitaires & State avancé**
7. **MIDI : lecture, preview, émission**
8. **Viewport & Navigation**
9. **Audio & Transport**
10. **Composant principal : `PianoRoll.tsx`**
11. **Roadmap & Améliorations suggérées**

---

## 1. ⭐ Introduction Générale

Le Piano Roll est construit comme un **éditeur musical modulaire**, inspiré des DAWs professionnels.
Il repose sur :

* Un système de dessin haute performance via Canvas
* Des hooks spécialisés pour chaque fonctionnalité
* Un gestionnaire d’interactions complet
* Un moteur MIDI intégré
* Un viewport intelligent (scroll, zoom, auto-follow)

Toutes les briques ont été pensées pour être **indépendantes**, **testables**, et **optimisables**.

---

## 2. 🧩 Architecture Globale (Diagramme)

```text
┌────────────────────────────── PianoRoll (TSX) ──────────────────────────────┐
│                                                                              │
│  Canvas / Overlay            Interactions                 Rendering          │
│  ────────────────            ───────────────             ───────────         │
│  useCanvasSetup              usePianoRollHandlers        usePianoRollDraw    │
│  useDevicePixelRatio         hit.ts (hitTest)            drawGrid            │
│                               pointerHandlers            drawNotes           │
│                               pointerMoveHandler         drawKeyboard        │
│                               pointerUpHandler           drawOverlay         │
│                               doubleClickHandler         drawTopBar          │
│                                                                              │
│  State / Logic              Coordinates & Grid          MIDI / Audio         │
│  ───────────────            ─────────────────           ─────────────         │
│  usePianoRollViewport       useCoordinates              useMidiEmitters      │
│  useLoopState               useSnapGrid                 useAudioEngine (*)   │
│  useControllableState                                                       │
│  useThrottle                 Scheduler / Timebase        Playback / Preview   │
│                              useDrawScheduler            OverlayTicker       │
│                              useAutoFollow                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 🖱️ Interactions & User Input

Les interactions sont réparties en modules spécialisés :

* **pointerHandlers.ts** — analyse l’action initiale
* **pointerMoveHandler.ts** — déplacement & resize des notes
* **pointerUpHandler.ts** — finalisation
* **doubleClickHandler.ts** — création / suppression des notes
* **hit.ts** — hit-testing précis (note, bord, vide)
* **keyboardPreview.ts** — preview audio
* **usePianoRollHandlers.ts** — API réactive pour React

### Fonctionnalités déjà en place

✔ Drag & drop des notes
✔ Resize
✔ Création par double-clic
✔ Suppression par double-clic
✔ Hit testing avancé
✔ Snap to grid

### À implémenter

⬜ Sélection multiple
⬜ Copie / collage
⬜ Split de note
⬜ Undo / redo

---

## 4. 📐 Système de Coordonnées & Grid

* **coords.ts** : conversions pixel → temps & pixel → pitch
* **useCoordinates** : hook react pour exposer ces conversions
* **useSnapGrid** : snap intelligent selon la grille

### En place

✔ Conversion bidirectionnelle
✔ Snap grid simple
✔ Scroll & zoom horizontal

### À améliorer

⬜ Zoom vertical
⬜ Grilles irrégulières (swing, triplets)
⬜ Magnétisme sur notes existantes

---

## 5. 🎨 Moteur de Rendu (Canvas)

Fichiers principaux :

* **drawBase.ts** (helpers bas-niveau)
* **drawGrid.ts**
* **drawKeyboard.ts**
* **drawNotes.ts**
* **drawOverlay.ts**
* **drawTopBar.ts**
* **renderContext.ts** (contexte global)

### Points clés

✔ Rendu performant en Canvas
✔ Overlays séparés
✔ Scheduler (RAF) via `useDrawScheduler`
✔ Pixel ratio dynamique via `useDevicePixelRatio`

### Améliorations possibles

⬜ WebGL / OffscreenCanvas
⬜ Layers multiples pour 10k+ notes
⬜ Mini-map intégrée

---

## 6. 🛠 Hooks Utilitaires & State

Fichiers :

* **useControllableState** (controlled/uncontrolled pattern)
* **useDevicePixelRatio**
* **useViewport**
* **useThrottle**
* **useLoopState**

### En place

✔ États robustes
✔ DPI dynamique
✔ Loop simple mais fonctionnelle

### À améliorer

⬜ Loop editor complet
⬜ Pinch-to-zoom & scroll inertiel

---

## 7. 🎵 MIDI : Lecture, Preview, Émission

Fichiers :

* **useMidiEmitters**
* **midiConversion.ts**
* **audio-engine** (via import)

### Déjà disponible

✔ Preview noteOn / noteOff
✔ Conversion MIDI ↔ notes internes

### À ajouter

⬜ CC (modwheel, aftertouch…)
⬜ Export `.mid` complet
⬜ Multi-pistes

---

## 8. 🪟 Viewport & Navigation

Fichier : **usePianoRollViewport**

### Fonctionnalités

✔ Scroll horizontal / vertical
✔ Zoom horizontal
✔ Auto-center initial
✔ Auto-follow du playhead via **useAutoFollow**

### À améliorer

⬜ Zoom vertical
⬜ Navigation inertielle (DAW-like)
⬜ Mini-map globale

---

## 9. 🎧 Audio & Transport

Le Piano Roll s’intègre avec :

* **useAudioEngine** : moteur audio externe
* **useTransportScheduler** : timebase & scheduling

Fonction clé : `getClipPlayheadBeat` fileciteturn0file0

---

## 10. 🧩 Composant Principal — `PianoRoll.tsx`

Le fichier central orchestre **tout le système** :

* Setup canvas
* Setup interactions
* Setup rendu
* Setup MIDI
* Setup viewport
* Emission des événements (`onChange`, `onDraftChange`, `onPositionChange`, etc.)

### Rôles internes

| Domaine      | Modules utilisés              |
| ------------ | ----------------------------- |
| Canvas       | useCanvasSetup, renderContext |
| Rendu        | usePianoRollDraw, drawXXX     |
| Interactions | usePianoRollHandlers          |
| Audio        | useMidiEmitters, audioEngine  |
| Transport    | useTransportScheduler         |
| Viewport     | usePianoRollViewport          |
| Logic        | useSnapGrid, useCoordinates   |

Ce composant agit comme un **chef d’orchestre** où toutes les briques indépendantes coopèrent.

---

## 11. 🚀 Roadmap & Améliorations Globales

### Court terme

* Sélection multiple
* Copie / collage
* Loop region visuelle

### Moyen terme

* Velocity editing
* Mini-map
* Layers de rendu optimisés

### Long terme

* WebGL renderer
* Quantification intelligente
* Auto-harmonisation

---

## 📦 Conclusion

Vous disposez ici d’une documentation complète couvrant :

* L’architecture modulaire du Piano Roll
* Le rendu Canvas avancé
* Le système d’interaction complet
* Le MIDI, l’audio, et la coordination temporelle
* Le comportement du composant principal `PianoRoll`

Je peux également vous produire :
✨ Une version PDF
✨ Une documentation style VitePress ou Docusaurus
✨ Des diagrammes séparés (Interactions, Rendering, MIDI, Viewport)

Souhaites‑tu l’un de ces formats ?
