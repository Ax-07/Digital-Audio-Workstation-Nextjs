# Piano Roll Rendering & Hooks — README

Ce document couvre les **hooks avancés** utilisés par le Piano Roll pour gérer le rendu, le timing, la grille, la conversion des coordonnées et l'émission MIDI.
Comme précédemment, chaque section contient :

* Description du hook / module
* ✔️ Ce qui est en place
* 🔧 Ce qui reste à implémenter
* 🚀 Améliorations potentielles

---

# 📁 Liste des fichiers

* `useAutoFollow.ts`
* `useCanvasSetup.ts`
* `useCoordinates.ts`
* `useDrawScheduler.ts`
* `useMidiEmitters.ts`
* `useOverlayTicker.ts`
* `usePianoRollDraw.ts`
* `useSnapGrid.ts`
* `useThrottle.ts`

---

## 🎯 1. `useAutoFollow.ts`

Gère le suivi automatique du curseur de lecture.
Le piano roll suit automatiquement la position de lecture / du transport.

### ✔️ En place

* Hook réactif à la position de lecture
* Système de scroll automatique fluide

### 🔧 À mettre en place

* Détection des limites (ne pas dépasser la zone éditable)
* Ajustement dynamique selon le zoom

### 🚀 Améliorations potentielles

* Mode "centering" (le curseur reste au centre)
* Désactivation automatique si l’utilisateur scrolle manuellement

---

## 🖼️ 2. `useCanvasSetup.ts`

Initialise et configure le canvas principal du Piano Roll.

### ✔️ En place

* Création du contexte 2D
* Setup du pixel ratio (HiDPI support)
* Resize automatique du canvas

### 🔧 À mettre en place

* Support WebGL (si besoin futur)
* Gestion des canvas multiples (notes, overlays…)

### 🚀 Améliorations potentielles

* Mise en cache des layers
* Rendu différé pour performance (double buffering)

---

## 📐 3. `useCoordinates.ts`

Convertit les coordonnées UI → coordonnées musicales, complément de `coords.ts`.

### ✔️ En place

* Conversion pixel → temps
* Conversion pixel → pitch
* Gestion du snap via la grille

### 🔧 À mettre en place

* Prise en compte du zoom vertical
* Conversion inversée plus détaillée (temps → pixel optimisé)

### 🚀 Améliorations potentielles

* Caching des conversions pour réduire CPU
* Support des grilles irrégulières (swing)

---

## 🕒 4. `useDrawScheduler.ts`

Planifie le rendu du Piano Roll via `requestAnimationFrame`.

### ✔️ En place

* Boucle de rendu optimisée
* Stratégie pour découpler draw et interactions

### 🔧 À mettre en place

* Réduction automatique du framerate quand inactif
* Synchronisation au tempo

### 🚀 Améliorations potentielles

* Passage du scheduler côté Web Worker
* Support du "frame skipping" intelligent

---

## 🎹 5. `useMidiEmitters.ts`

Hook pour l’émission des événements MIDI.

### ✔️ En place

* Envoi noteOn / noteOff
* Support pour les prévisions sonores (preview)

### 🔧 À mettre en place

* Gestion du channel MIDI
* Velocity dynamique
* CC et pitchbend

### 🚀 Améliorations potentielles

* API interne de routing MIDI
* Compatibilité WebMIDI avancée avec device auto-detect

---

## 📊 6. `useOverlayTicker.ts`

Contrôle l’affichage et la mise à jour des overlays :

* Ligne du curseur
* Guides visuels

### ✔️ En place

* Animation fluide de la tête de lecture
* Abstraction propre pour overlays

### 🔧 À mettre en place

* Multi‑overlays configurables
* Suivi des sélections en overlay

### 🚀 Améliorations potentielles

* Système complet d’HUD (sélecteurs, loupe…)
* Mode "performance" avec rafraîchissement dynamique

---

## 🖌️ 7. `usePianoRollDraw.ts`

Le hook de rendu principal du Piano Roll.

### ✔️ En place

* Dessin des notes
* Dessin de la grille
* Couleurs cohérentes par pitch
* Gestion du scroll + zoom

### 🔧 À mettre en place

* Layers séparés (grille / notes / overlays)
* Affichage velocity (barres verticales)
* Alignement pixel-perfect

### 🚀 Améliorations potentielles

* Antialiasing adapté aux lignes horizontales
* Rendu WebGL pour projets avec >10k notes

---

## 🧲 8. `useSnapGrid.ts`

Gère la quantification / snapping.

### ✔️ En place

* Snap au pas défini (1/4, 1/8, 1/16…)
* Alignement automatique lors du drag

### 🔧 À mettre en place

* Snap intelligent sur notes existantes
* Snap flottant (triplets, swing)

### 🚀 Améliorations potentielles

* Quantization adaptative selon BPM
* Système d’aimantation (magnetic snapping)

---

## ⚡ 9. `useThrottle.ts`

Hook générique pour limiter la fréquence d’exécution d’une fonction.

### ✔️ En place

* Throttle simple et efficace
* Utilisé pour éviter de saturer le CPU pendant drag / scroll

### 🔧 À mettre en place

* Mode debounce intégré
* Cancelation API

### 🚀 Améliorations potentielles

* Scheduler interne basé sur idle callbacks
* Version Web Worker pour découpler du main thread

---

# 🧱 Synthèse générale

## ✔️ Déjà opérationnel

* Rendu canvas performant avec scheduler dédié
* Gestion complète des overlays et du curseur
* Grid snapping fiable
* Conversion coordonnée robuste
* Intégration MIDI fonctionnelle
* Hooks bien compartimentés

## 🔧 À implémenter

* Velocity, zoom vertical, layers multiples
* MIDI avancé (channels, CC, aftertouch)
* Optimisations du scheduler
* Snap intelligent

## 🚀 Améliorations possibles

* WebGL rendering
* Worker‑based rendering & scheduling
* Overlays intelligents & HUD dynamique
* Systèmes avancés d’auto‑follow
* Quantification musicale poussée

---

Si tu veux, je peux maintenant :

* Générer un **README global** regroupant les trois documents
* Produire un **diagramme d’architecture complet** (rendu, interactions, données)
* Créer un **site de documentation** basé sur ces fichiers.
