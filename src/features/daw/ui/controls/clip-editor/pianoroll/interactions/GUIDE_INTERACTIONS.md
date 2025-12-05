# Piano Roll Interaction Guide

Ce document décrit les interactions actuelles du **Piano Roll**, la structure logique du système de gestion des événements, ainsi que les fonctionnalités en place, à implémenter et les améliorations potentielles.

---

## 🎹 Présentation générale

Le Piano Roll repose sur un ensemble de "handlers" modulaires permettant de gérer :

* Les actions utilisateur (pointerdown, pointermove, pointerup, double‐click)
* Le hit‐testing (détection de ce que l’utilisateur essaye d’attraper)
* Le drag & drop (déplacement, redimensionnement des notes)
* L’ajout / suppression via double‐click
* L’aperçu clavier et le déclenchement audio

Les fichiers fournis structurent de manière claire la logique autour de plusieurs contextes :

* `pointerHandlers.ts` → gestion centralisée du pointer down
* `pointerMoveHandler.ts` → gestion continue lors d’un drag
* `pointerUpHandler.ts` → fin d’interaction
* `doubleClickHandler.ts` → toggling / création / suppression de notes
* `hit.ts` → logique de détection d’objet frappé (note, bord de note, vide)
* `keyboardPreview.ts` → triggering du son pendant interactions
* `usePianoRollHandlers.ts` → hook React de raccordement général

---

## 🧩 Architecture des Handlers

### 1. `hit.ts` — Hit Testing

Permet d’identifier ce que l’utilisateur vise :

* Note complète
* Bord gauche / bord droit (pour resize)
* Zone vide

Expose notamment :

* `hitTest(x, y, ...)`
* `getHitAt(grid, position, notes)`

### 2. `pointerHandlers.ts` — Pointer Down

Responsable de :

* Déterminer l’action (drag, resize, creation)
* Initialiser un contexte d’interaction (`PointerDownHandlerCtx`)
* Définir le `dragMode`

### 3. `pointerMoveHandler.ts` — Pointer Move

Responsable du drag :

* Déplacement de note
* Redimensionnement gauche/droite
* Ajustement au grid

Utilise un `PointerMoveHandlerCtx` créé au pointerdown.

### 4. `pointerUpHandler.ts` — Pointer Up

Responsable de :

* Finaliser les modifications
* Nettoyer les états
* Appliquer définitivement les changements

### 5. `doubleClickHandler.ts` — Double-Click

Permet :

* Création rapide d’une note si vide
* Suppression si double‐click sur note
* Alternative possible : Split d’une note (si future implémentation)

### 6. `keyboardPreview.ts`

* Joue un son lorsqu’une note est cliquée ou preview pendant drag
* Interface entre Piano Roll et AudioEngine

### 7. `usePianoRollHandlers.ts`

Expose au composant parent :

* `onPointerDown`
* `onPointerMove`
* `onPointerUp`
* `onDoubleClick`

C’est l’API principale côté React.

---

## ✅ Fonctionnalités en place

### Interaction

* Sélection / Drag de notes
* Redimensionnement gauche/droite
* Ajout de note par double‐click
* Suppression de note par double‐click
* Snap to grid pendant drag

### Système technique

* Hit testing précis (note, bord, vide)
* Contexte persistant pour pointerDown → move → up
* Hooks React ergonomiques (`usePianoRollHandlers`)
* Pré‐écoute sonore pendant interactions
* Gestion de plusieurs drag modes : move, resize‐left, resize‐right, create

---

## 🏗️ Fonctionnalités à implémenter

### Interactions avancées

* **Sélection multiple** (lasso, shift‐click)
* **Copier / Coller de notes**
* **Déplacement vertical en drag** (changer la hauteur dans la Rolls si non déjà présent)
* **Split de note** via double‐click au milieu
* **Undo / Redo** intégré

### UI / UX

* Indicateur visuel du mode actif (resize, move, create)
* Highlight des notes sélectionnées
* Ghost note pendant création

### Technique

* Gestion du scroll automatique pendant drag
* Optimisation du hit testing pour très grands clips
* Compatibilité tactile / mobile

---

## 🚀 Améliorations potentielles

### Performance & Engine

* Pooling des objets pour éviter les allocations pendant le drag
* Spatial hashing pour accélérer le hitTest
* Mode de rendu Canvas plus léger

### Interaction

* Magnétisme intelligent : snap aux notes existantes
* Alt‐drag pour copier une note au lieu de créer
* Double‐drag pour dupliquer rapidement

### Musicalité

* Preview harmonique (jouer note + octaves)
* Arpégiateur en temps réel pendant drag (fun feature)

### Édition

* Velocity editing intégré dans le pianoroll
* Automation lanes couplées

---

## 📦 Conclusion

Ce Piano Roll est déjà construit sur une architecture solide et flexible.
Les handlers sont modulaires, le hit testing est propre, et l’usage du hook unifie harmonieusement les interactions.
Les prochaines étapes consistent principalement à enrichir les interactions utilisateur, améliorer la performance, et élargir les possibilités d’édition musicale.

Si tu veux, je peux aussi :

* Générer un diagramme d’architecture
* Écrire une documentation API détaillée fichier par fichier
* Proposer une roadmap technique complète
