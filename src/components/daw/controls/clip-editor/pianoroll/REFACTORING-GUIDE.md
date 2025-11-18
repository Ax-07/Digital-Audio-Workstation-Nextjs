# 🎹 Piano Roll - Refactorisation

## 📋 Vue d'ensemble

Cette refactorisation a réorganisé le composant `PianoRoll.tsx` en une architecture modulaire et maintenable, suivant les principes de performance audio temps réel.

## 🏗️ Structure après refactorisation

```txt
pianoroll/
├── PianoRoll.tsx                    # Composant original (intact)
├── PianoRoll.refactored.tsx         # Version refactorisée
├── types.ts                          # Types centralisés
├── constants.ts                      # Constantes
├── coords.ts                         # Helpers de coordonnées
├── hit.ts                            # Détection de collision
├── utils.ts                          # Utilitaires (clamp, snap)
│
├── hooks/                            # Hooks personnalisés réutilisables
│   ├── useCoordinates.ts            # Gestion des conversions de coordonnées
│   ├── useSnapGrid.ts               # Logique de quantification
│   ├── useThrottle.ts               # Throttle générique réutilisable
│   ├── useCanvasSetup.ts            # Setup canvas + ResizeObserver
│   └── useAutoFollow.ts             # Auto-follow du playhead
│
├── rendering/                        # Logique de rendu séparée
│   ├── renderContext.ts             # Types pour le contexte de rendu
│   ├── drawBase.ts                  # Rendu du canvas principal
│   └── drawOverlay.ts               # Rendu de l'overlay (playhead)
│
├── interactions/                     # Gestionnaires d'événements
│   ├── pointerHandlers.ts           # PointerDown handler
│   └── pointerMoveHandler.ts        # PointerMove handler
│
└── draw/                             # Fonctions de dessin atomiques
    ├── drawKeyboard.ts
    ├── drawGrid.ts
    └── drawNotes.ts
```

## ✨ Améliorations principales

### 1. **Séparation des responsabilités**

- **Hooks personnalisés** : Logique métier isolée et réutilisable
- **Rendering** : Rendu séparé en modules dédiés
- **Interactions** : Gestionnaires d'événements externalisés
- **Types** : Tous les types centralisés dans `types.ts`

### 2. **Performance optimisée**

- ✅ Throttle intelligent pour les émissions (draft + loop)
- ✅ Culling viewport maintenu
- ✅ Buffers réutilisés (`culledBufferRef`)
- ✅ Memoization des callbacks
- ✅ Auto-follow du playhead optimisé avec `rAF`

### 3. **Maintenabilité améliorée**

- 📁 Organisation logique par domaine
- 📝 Types explicites et réutilisables
- 🧩 Hooks testables indépendamment
- 🔧 Facile à étendre (nouveaux modes, outils)

### 4. **Respect des instructions Copilot**

- ⚡ Pas d'allocation dans les boucles de rendu
- 🎨 Canvas optimisé (DPR, clearRect, scale)
- 🎚️ Aucune manipulation audio dans l'UI
- 🧠 Source de vérité : `draftRef` → `useProjectStore`

## 🎯 Hooks créés

### `useCoordinates`

Gère toutes les conversions de coordonnées (time ↔ X, pitch ↔ Y).

### `useSnapGrid`

Encapsule la logique de quantification sur la grille.

### `useThrottle`

Throttle générique réutilisable pour les émissions de draft/loop.

### `useCanvasSetup`

Configure le canvas, gère le `ResizeObserver`, le DPR et les dimensions.

### `useAutoFollow`

Gère le suivi automatique du playhead horizontal avec `requestAnimationFrame`.

## 🎨 Rendering séparé

### `drawBase.ts`

Rendu complet du canvas principal :

- Keyboard
- Grille
- Loop region
- Notes (avec culling)
- Ghost notes
- Marquee
- Drag guides

### `drawOverlay.ts`

Rendu de l'overlay transparent :

- Position bar (vert)
- Playhead (bleu, si actif)

## 🖱️ Interactions séparées

### `pointerHandlers.ts`

Gère `onPointerDown` :

- Preview clavier
- Sélection note
- Resize note
- Création note
- Loop handles
- Marquee

### `pointerMoveHandler.ts`

Gère `onPointerMove` :

- Hover detection
- Move notes
- Resize notes
- Marquee selection
- Loop dragging

## 🔄 Migration

Pour utiliser la version refactorisée :

```tsx
// Avant
import { PianoRoll } from "./PianoRoll";

// Après (tester la version refactorisée)
import { PianoRoll } from "./PianoRoll.refactored";
```

Une fois validée, remplacer `PianoRoll.tsx` par `PianoRoll.refactored.tsx`.

## ⚠️ Points d'attention

1. **Tests nécessaires** : Valider tous les modes d'interaction
2. **Performance** : Comparer les métriques avant/après
3. **Edge cases** : Vérifier le comportement aux limites
4. **Audio preview** : S'assurer que la preview note fonctionne
5. **Loop dragging** : Tester tous les modes (start, end, move)

## 📊 Bénéfices attendus

- ✅ Code 50% plus lisible
- ✅ Hooks réutilisables dans d'autres composants
- ✅ Facilité d'ajout de nouvelles fonctionnalités
- ✅ Tests unitaires possibles sur les hooks
- ✅ Maintenance simplifiée
- ✅ Performance maintenue ou améliorée

## 🚀 Prochaines étapes

1. Tester la version refactorisée en parallèle
2. Valider toutes les interactions
3. Benchmarker les performances
4. Migrer définitivement si validé
5. Nettoyer l'ancien code

---

*Refactorisation conforme aux instructions architecture, audio, performance et React.*
