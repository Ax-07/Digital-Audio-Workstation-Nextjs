# Piano Roll Core Modules — README

Ce document décrit les fichiers "cœur" utilisés par le Piano Roll : constantes, conversions MIDI, indexation des notes, calculs de coordonnées et utilitaires.
Comme pour le premier README, tu retrouves :

* Ce que fait chaque fichier
* Ce qui est déjà en place
* Ce qui reste à implémenter
* Les améliorations potentielles

---

## 📁 Aperçu des fichiers

Les modules fournis constituent l'infrastructure logique du Piano Roll, sur laquelle reposent les handlers d'interaction.

### 1. `constants.ts`

Contient les constantes clés du système :

* Hauteur des touches
* Taille des cellules
* Durée par division
* Marges et offsets
* Plage MIDI prise en charge

#### ✔️ En place

* Définition cohérente des valeurs de base
* Unification des tailles pour l'ensemble du rendu
* Possibilité d’être importé partout pour obtenir les valeurs globales

#### 🔧 À mettre en place

* Centraliser davantage de constantes (zoom, scroll, couleurs)
* Constantes spécifiques aux fonctionnalités avancées (sélections, velocity…)

#### 🚀 Améliorations potentielles

* Support multi-thèmes (light/dark)
* Constantes dynamiques selon le DPI / scaling

---

### 2. `coords.ts`

Gère la conversion entre :

* Position en pixels ⇄ Pas temporel
* Position verticale ⇄ Numéro de note MIDI
* Détection des cellules
* Calcul de la position exacte (snap ou non)

#### ✔️ En place

* Fonctions propres pour traduire les coordonnées
* Bonne séparation métier/interface (pixel ↔ musical)

#### 🔧 À mettre en place

* Gestion du zoom horizontal et vertical
* Calculs plus robustes pour les scroll importants

#### 🚀 Améliorations potentielles

* Prise en compte des grilles irrégulières (swing, trioles…)
* Algorithmes optimisés pour limiter les arrondis successifs

---

### 3. `midiConversion.ts`

Responsable de :

* Convertir les notes internes du Piano Roll en événements MIDI
* Convertir des événements MIDI entrants en notes pour l’éditeur
* Appliquer un mapping stable entre temps musical et ticks

#### ✔️ En place

* Conversion basique de note → MIDI
* Conversion MIDI → notes
* Gestion de la durée, hauteur et start

#### 🔧 À mettre en place

* Gestion des CC (velocity, modwheel, pitchbend)
* Export complet au format `.mid`
* Import multi‐pistes

#### 🚀 Améliorations potentielles

* Optimisation pour gros fichiers MIDI
* Support du tempo variable et des time signatures personnalisées
* Préservation des événements avancés (program changes, aftertouch)

---

### 4. `notesIndex.ts`

Gère l’indexation des notes dans le Piano Roll :

* Recherche rapide par pitch
* Gestion des notes triées
* Méthodes d’accès optimisées

#### ✔️ En place

* Index propre permettant des recherches plus rapides
* Structure adaptée pour hitTest / glisser‐déposer

#### 🔧 À mettre en place

* Index bidirectionnel (pitch + time)
* Support des sélections multiples dans l’index

#### 🚀 Améliorations potentielles

* Structures avancées (segment trees, interval trees)
* Mécanisme d'undo/redo intégré à l’index

---

### 5. `utils.ts`

Contient :

* Helpers génériques
* Fonctions de clamp, snap, interpolation
* Petites fonctions de maths ou de traitement

#### ✔️ En place

* Utilitaires réutilisables et indépendants du reste

#### 🔧 À mettre en place

* Déplacer dans ce fichier les helpers dispersés dans d’autres modules
* Ajouter des utilitaires spécialisés pour le MIDI et la logique musicale

#### 🚀 Améliorations potentielles

* Library interne de fonctions de patterns, scales ou modes harmoniques
* Fonctions de debug (mesure du temps d’exécution, logs stylisés)

---

## 🧱 Synthèse (ce qui est en place)

* Infrastructure logique cohérente
* Modules indépendants et réutilisables
* Conversions essentielles (pixel, temps, notes MIDI)
* Constantes centrales unifiées
* Indexation des notes fonctionnelle

---

## 🏗️ Synthèse (ce qui reste à implémenter)

* Zoom, scroll avancé, multi‐sélection
* Import/export MIDI complet
* Indexation temporelle avancée
* Support velocity et automation
* Optimisations pour grands projets

---

## 🚀 Améliorations globales potentielles

### Performance

* Index temporel avancé (quad-tree, interval tree)
* Cache des conversions coord → temps
* Découpage en worker pour MIDI

### UX / UI

* Double grille (primaire + secondaire)
* Highlight dynamique des touches MIDI
* Timeline réglable

### Musicalité avancée

* Système d’échelles et tonality locking
* Smart quantization
* Auto-harmonisation basique

---

Si tu veux, je peux aussi regrouper **les deux README en une documentation unique** ou même créer un **site de documentation (style Docusaurus / VitePress)**.
