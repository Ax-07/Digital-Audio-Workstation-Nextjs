# Piano Roll — Rendering System Documentation

Ce document décrit en détail les fichiers liés **au rendu graphique du Piano Roll** : dessin de la grille, des notes, du clavier, de la barre supérieure, des overlays, ainsi que la gestion du contexte de rendu.

Chaque section inclut :

* Rôle du module
* ✔️ Fonctionnalités déjà en place
* 🔧 À implémenter
* 🚀 Améliorations potentielles

---

# 📁 Liste des fichiers

* `drawBase.ts`
* `drawGrid.ts`
* `drawKeyboard.ts`
* `drawNotes.ts`
* `drawTopBar.ts`
* `drawOverlay.ts`
* `renderContext.ts`

---

# 🧱 1. `drawBase.ts`

Fonctions de base pour dessiner dans le canvas :

* Remplissage de rectangles
* Gestion des couleurs
* Lignes simples
* API unifiée utilisée par tous les autres modules de rendu

### ✔️ En place

* Wrapper propre autour du `CanvasRenderingContext2D`
* Abstraction des couleurs, styles et tailles
* Rend le reste du système plus lisible

### 🔧 À implémenter

* Mode haute performance (caching des opérations)
* Helpers pour le rendu pixel-perfect

### 🚀 Améliorations potentielles

* Passer en mode "batch drawing" pour réduire les appels au canvas
* Version WebGL pour dessins massifs

---

# 🎼 2. `drawGrid.ts`

Responsable du dessin de :

* La grille principale
* Les subdivisions temporelles
* Les lignes correspondant aux notes MIDI

### ✔️ En place

* Grille propre et lisible
* Différenciation des mesures / beats

### 🔧 À implémenter

* Grille dynamique liée au zoom
* Grille secondaire (ex : mesures en bold, subdivisions légères)

### 🚀 Améliorations potentielles

* Grilles musicales avancées (swing, triplets, dotted)
* Mise en évidence dynamique de la cellule active

---

# 🎹 3. `drawKeyboard.ts`

Dessine le piano vertical :

* Touche blanches / noires
* Highlight de la note jouée ou prévisualisée

### ✔️ En place

* Dessin correct et stable des touches
* Ratio correct touches blanches / noires

### 🔧 À implémenter

* Highlight dynamique selon la sélection
* Animations sur press (visuel type DAW pro)

### 🚀 Améliorations potentielles

* Indices de nom de note (C3, D#4…)
* Mode compacte ou étendue selon zoom vertical

---

# 🎵 4. `drawNotes.ts`

Gère le rendu visuel des notes MIDI :

* Position + longueur
* Couleur selon pitch
* Gestion des bordures (resize handles)

### ✔️ En place

* Rendu lisible et cohérent
* Couleurs différenciées par pitch
* Gestion du scroll / zoom horizontal

### 🔧 À implémenter

* Layers séparés pour performance
* Gestion des notes sélectionnées (highlight)

### 🚀 Améliorations potentielles

* Affichage de la velocity en transparence
* Effet glossy ou ombrage léger pour mieux distinguer les notes superposées
* Rendu WebGL pour gros projets (> 10k notes)

---

# 🧭 5. `drawTopBar.ts`

Dessine la barre supérieure du Piano Roll :

* Timeline
* Numéros de mesures
* Curseur de lecture (si non géré par overlay)

### ✔️ En place

* Rendu clair des mesures
* Distinction visuelle mesure / beat

### 🔧 À implémenter

* Gestion des time signatures différentes (3/4, 7/8…)
* Ajout de marqueurs (loop start / end, labels)

### 🚀 Améliorations potentielles

* Timeline scrollable indépendante
* Zoom visualisé directement dans la top bar

---

# ✨ 6. `drawOverlay.ts`

Dessine les overlays interactifs :

* Curseur de lecture
* Zones de sélection
* Ghost notes

### ✔️ En place

* Overlay fluide et séparé du rendu principal
* Intégration avec `useOverlayTicker`

### 🔧 À implémenter

* Sélections multiples (lasso)
* Highlight de la cellule active
* Ghost notes transparentes pendant drag

### 🚀 Améliorations potentielles

* Mini-map du projet dans un overlay
* Visualisation des automations

---

# 🧰 7. `renderContext.ts`

Centralise :

* Le contexte du canvas
* Les paramètres de rendu (zoom, scroll, DPI)
* Les couleurs / thème

### ✔️ En place

* Architecture propre et centralisée
* Re-rendu cohérent basé sur un contexte unique

### 🔧 À implémenter

* Support multi-thème dynamique (light/dark)
* Mise à jour automatique du DPI selon l'écran

### 🚀 Améliorations potentielles

* Pipeline type "render graph" avec étapes clairement définies
* Injection facile de renderers custom

---

# 🧱 Synthèse

## ✔️ Déjà fonctionnel

* Rendu complet du Piano Roll (grid, notes, clavier, overlay, top bar)
* Architecture modulaire et propre
* Système de rendu performant et lisible

## 🔧 À implémenter

* Layering pour booster les performances
* Velocity, ghost notes, highlights de sélection
* Time signatures variées + grilles musicales
* Zoom vertical dans le clavier & les notes

## 🚀 Améliorations possibles

* Passage à WebGL pour les gros projets
* Worker + OffscreenCanvas
* Système d'overlay intelligent / mini-map
* Thèmes dynamiques & DPI adaptatif

---

Je peux maintenant :

* 📘 Fusionner tous les READMEs en un seul document complet
* 🧱 Te générer un schéma d’architecture complet (interactions + rendering + data)
* 🎨 Te générer une charte graphique pour uniformiser le rendu
* ⚙️ Produire un site de documentation complet (Markdown → Docusaurus / VitePress)
