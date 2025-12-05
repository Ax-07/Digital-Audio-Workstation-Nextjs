# Piano Roll — Misc Hooks & Viewport Management

Ce document décrit les hooks utilitaires et les systèmes d’état avancés utilisés dans le Piano Roll.
Ces modules sont transversaux : ils ne gèrent ni l’audio, ni le rendu direct, mais fournissent les fondations logiques nécessaires à une interface réactive, performante et synchronisée.

Comme d’habitude, chaque module est présenté avec :

* Rôle et fonction
* ✔️ Ce qui est en place
* 🔧 Ce qui reste à implémenter
* 🚀 Améliorations potentielles

---

# 📁 Liste des fichiers

* `useControllableState.ts`
* `useDevicePixelRatio.ts`
* `useLoopState.ts`
* `usePianoRollViewport.ts`

---

# 🔄 1. `useControllableState.ts`

Equivalent amélioré d’un `useState` permettant :

* D’avoir un état interne contrôlé
* Ou d’être contrôlé depuis l’extérieur (pattern React « controlled/uncontrolled »)

### ✔️ En place

* Hook générique et réutilisable
* Détection automatique si la valeur vient de l’extérieur
* Callbacks cohérents (`onChange`)

### 🔧 À implémenter

* Support d’un mode synchronisé sur un store externe (Zustand, Jotai…)
* Ajout d’un mécanisme de comparaison custom pour éviter les re-renders

### 🚀 Améliorations potentielles

* Version asynchrone (state → promise)
* Intégration avec transitions React 18 (`startTransition`)

---

# 🖥️ 2. `useDevicePixelRatio.ts`

Permet d'obtenir et d'écouter les changements du **ratio pixel** de l'écran (DPI), essentiel pour un rendu canvas net.

### ✔️ En place

* Lecture du `window.devicePixelRatio`
* Mise à jour en temps réel (événements `resize`)
* Intégration simple avec le rendu

### 🔧 À implémenter

* Observation des changements DPI dans les environnements multi-écrans
* Fallbacks pour environnements non-browser

### 🚀 Améliorations potentielles

* Calibration automatique du canvas en fonction du DPI
* Support HiDPI maximal (2x, 3x, 4x) avec smart downscaling

---

# 🔁 3. `useLoopState.ts`

Gère l’état de la **boucle de lecture** du Piano Roll :

* Activation/désactivation du loop
* Définition des points de loop
* Synchronisation avec la timeline globale

### ✔️ En place

* Hook centralisé pour le loop
* États simples et intuitifs (`enabled`, `start`, `end`)

### 🔧 À implémenter

* Hooks pour gérer la sélection d’une région et en faire un loop
* Compatibilité avec le transport externe (DAW / moteur audio)

### 🚀 Améliorations potentielles

* Loop snapping (auto-alignement sur la grille)
* Gestion des loops multiples (playlist-style)

---

# 🪟 4. `usePianoRollViewport.ts`

Gère la partie **viewport** du Piano Roll : scroll, zoom, dimensions visibles.
C’est l’un des hooks les plus importants car il influence tout le rendu.

### ✔️ En place

* Gestion du scroll horizontal / vertical
* Gestion du zoom horizontal
* Recalcul des limites visibles

### 🔧 À implémenter

* Zoom vertical (hauteur des notes et du clavier)
* Scroll inertiel / gestuelle fluide
* Support du pinch-to-zoom (trackpad / mobile)

### 🚀 Améliorations potentielles

* Auto-centering sur la sélection
* Mini-map + preview du viewport
* Optimisation des calculs avec memoisation ou worker

---

# 🧱 Synthèse générale

## ✔️ Fonctionnel

* Hooks solides, bien découpés, faciles à combiner
* Gestion du DPI → un rendu propre sur tous les écrans
* Loop state simple mais efficace
* Viewport déjà stable pour le zoom horizontal

## 🔧 À implémenter

* Zoom vertical et gestuelle avancée
* Loop region complète
* Support multi-DPI et multi-écrans

## 🚀 Améliorations possibles

* Mini-map du viewport
* Transitions animées (scroll/zoom smooth)
* Système complet de navigation gestuelle

---

Si tu veux, je peux aussi :

* 💡 Fusionner tous les READMEs en une documentation complète
* 🧩 Structurer une architecture finale du Piano Roll
* 📘 Générer un site de documentation automatiquement
