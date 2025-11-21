# 🎹 Piano Roll – Guide d'Utilisation (API Complète & Perf)

Ce guide reflète l'implémentation actuelle du composant `PianoRoll` (voir `PianoRoll.tsx`). Il corrige les divergences de l'ancien guide (création par double‑click, gestion des loops, clip length, position offset, callbacks draft vs commit).

---

## 📖 Import & Exemple Minimal

```tsx
import { PianoRoll } from "@/components/daw/controls/clip-editor/pianoroll/PianoRoll";

<PianoRoll
  notes={clip.notes}
  lengthBeats={clip.lengthBeats}
  loop={clip.loop}
  position={clip.offsetBeats} // offset du clip si utilisé
  playheadBeat={transport.positionBeats - clip.offsetBeats}
  active={transport.isPlaying}
  followPlayhead={true}
  onChange={(finalNotes) => updateClip(clip.id, { notes: finalNotes })}
  onDraftChange={(draftNotes) => setLivePreview(draftNotes)}
  onLoopChange={(loop) => updateClip(clip.id, { loop })}
  onLengthChange={(len) => updateClip(clip.id, { lengthBeats: len })}
  onPositionChange={(pos) => updateClip(clip.id, { offsetBeats: pos })}
/>;
```

---

## 🎛️ Props (Source: `types.ts`)

| Prop | Type | Rôle |
|------|------|------|
| `notes` | `ReadonlyArray<MidiNote>` | Source de vérité des notes (pitch/time/duration/velocity). |
| `lengthBeats?` | `number` (def: 4) | Longueur du clip (ligne de fin + handle). |
| `onChange?` | `(notes: MidiNote[]) => void` | Emission finale (commit) après `pointerUp` ou double‑click. |
| `onDraftChange?` | `(notes: MidiNote[]) => void` | Emission throttlée (80 ms) pendant drag / resize pour preview temps réel. |
| `loop?` | `<code>{ start: number; end: number } \| null</code>` | Définition de la boucle (barre supérieure tier 3). |
| `onLoopChange?` | `(loop: { start: number; end: number } \| null) => void` | Callback (throttlé) lors du drag des handles/move. |
| `position?` | `number` | Offset de lecture / début du clip (barre tier 2). |
| `onPositionChange?` | `(beat: number) => void` | Déplacement du marqueur rouge (drag). |
| `playheadBeat?` | `number` | Beat courant transport (ligne overlay). |
| `onLengthChange?` | `(beats: number) => void` | Resize global du clip via handle vert (tier 1). |
| `followPlayhead?` | `boolean` (def: true) | Auto-scroll pour garder le playhead visible. |
| `active?` | `boolean` (def: false) | Transport en lecture (active overlay rAF). |
| `grid?` | `GridValue` (def: 16) | Résolution (1/grid) pour création & durée min. |
| `onGridChange?` | `(g: GridValue) => void` | Contrôle externe (non utilisé en interne sans passer prop). |
| `snap?` | `boolean` (def: true) | Snap temps sur drag / resize / création. Shift = bypass. |
| `onSnapChange?` | `(b: boolean) => void` | Contrôle externe éventuel. |
| `pxPerBeat?` | `number` | Zoom horizontal contrôlé (16–192). |
| `onPxPerBeatChange?` | `(n: number) => void` | Retour wheel-zoom parent. |
| `onSeek?` | `(beat: number) => void` | Prévu (actuellement non utilisé). |

### Notes sur le Mode Contrôlé / Non Contrôlé

`pxPerBeat`, `grid`, `snap` utilisent un hook `useControllableState`. Si la prop n'est pas fournie → état interne. Si fournie → le setter émet uniquement via callback sans muter l'interne.

---

## 🔁 Barre Supérieure (TopBar Tiers)

Découpée en 3 tiers (hauteur standard `topBarHeight = 36` → chaque ~12px) :

1. Tier 1 : Clip Length (ligne verte + handle de fin) → drag = resize clip.
2. Tier 2 : Position Start (ligne rouge) → drag = modification offset `position`.
3. Tier 3 : Loop (bande grisée + lignes jaunes + handles start/end + drag central pour déplacer l'ensemble).

Le survol d'un handle force le curseur `ew-resize`. Drag central de loop → `loopMove`.

---

## 🖱️ Interactions Réelles (Corrigé)

| Action | Geste | Mode interne | Snap |
|--------|-------|--------------|------|
| Sélection simple | Single click sur note | `dragMode = null` puis selection | N/A |
| Sélection rectangle | Click vide (zone > clavier) + drag | `rectangleSelection` | N/A |
| Déplacement note(s) | Drag sur note sélectionnée | `move` | Snap sauf Shift |
| Redimensionnement | Drag sur bord droit (6px) | `resize` | Snap sauf Shift |
| Création note | Double‑click zone vide | Commit immédiat | Snap grid |
| Suppression note | Double‑click sur note | Commit (filtre) | N/A |
| Loop start/end | Drag handle jaune | `loopStart` / `loopEnd` | Snap sauf Shift |
| Loop move | Drag à l’intérieur de la zone loop (tier 3) | `loopMove` | Snap sauf Shift |
| Offset clip | Drag sur marqueur rouge (tier 2) | `setPlayhead` | Snap sauf Shift |
| Resize clip | Drag handle clip end (tier 1) | `resizeClip` | Snap sauf Shift |
| Preview clavier | Click / drag vertical sur clavier | Glide pitches | N/A |
| Ghost preview | Hover vide (zone notes) | `ghost` (dessin translucide) | Snap temps |

`Shift` pendant un drag désactive uniquement le snap sur les deltas temps (time/duration), pas sur pitch.

---

## ⌨️ Raccourcis Clavier

| Touche | Effet |
|--------|-------|
| Delete / Backspace | Supprime notes sélectionnées (commit) |
| Wheel | Scroll vertical |
| Shift + Wheel | Scroll horizontal |
| Ctrl/Cmd + Wheel | Zoom horizontal (16–192 px/beat) |
| Alt + Wheel | Zoom vertical (6–24 px/semitone) |
| Shift (pendant drag) | Désactive snap temps |

---

## 🎨 Feedback Visuel

| Élément | Couleur / Style |
|---------|-----------------|
| Note normale | `#FBBF24` (orange) |
| Note sélectionnée | `#FFD02F` (jaune clair + bordure) |
| Note hover | `#FACC15` |
| Ghost note | Bleu translucide `#7aa2ff` alpha 0.35 |
| Loop zone | Bande `rgba(255,255,255,0.04)` + lignes jaunes |
| Clip end | Ligne verticale verte |
| Position start | Ligne verticale rouge |
| Playhead overlay | Ligne 1px rouge (overlay canvas) |
| Drag guides | Pointillés jaunes + labels time/pitch monospace |

Curseurs : `crosshair` (vide), `pointer` (note ou zone loop), `ew-resize` (bord note / handles), `default` (clavier).

---

## 🧠 Draft vs Commit (onDraftChange / onChange)

Pendant `move` / `resize` / loop drags :

- Émission brouillon (`onDraftChange`) throttlée à 80 ms (`useThrottle`).
- Au `pointerUp` → commit final via `onChange`.

Avantage : pré-écoute fluide sans spammer le store global.

---

## ⚙️ Performance & Architecture

Optimisations en place :

- Viewport culling (buffer `culledBufferRef`) → dessine seulement notes visibles.
- Double canvas : base (statique) + overlay (playhead & guides, cadencé). Overlay limité à ~30 Hz lors de drags haute fréquence.
- rAF batching (`useDrawScheduler`) pour coalescer invalidations multiples.
- Throttle user emission & loop drag (80 ms) pour limiter pression sur React/Zustand.
- Aucune allocation dans boucle de dessin sauf recomposition du buffer cull (réutilisation tableau mutation contrôlée). Notes copiées seulement sur pointerStart.
- `devicePixelRatio` suivi via hook léger, redimensionne canvas via `ResizeObserver`.
- Curseur mis à jour via accès direct DOM + throttle 16 ms (pas de re-render React pour un simple style).

Bonnes pratiques additionnelles :

1. Fournir `memo` au wrapper parent si notes ne changent pas souvent.
2. Éviter de recréer les arrays `notes` inutiles (utiliser références stables du store).
3. Limiter la taille du clip (très grand nombre de notes) ou segmenter par viewport si > 5000 notes.
4. Désactiver `followPlayhead` si l'utilisateur manipule le zoom (améliore orientation UX).

---

## 🔍 Différences vs Ancienne Version du Guide

| Ancien Guide | État Réel |
|--------------|-----------|
| Création note = simple click | Création = double‑click vide |
| Suppression = Delete | Suppression rapide = double‑click sur la note ou Delete sélection |
| Loop = handles simples | Loop + move complet + throttle |
| Pas de notion `position` | Position offset (ligne rouge) prise en charge |
| Pas de resize clip | Handle fin clip (ligne verte) |
| Pas de draft callback | `onDraftChange` disponible (throttlé) |
| Pas de ghost / drag guide détaillé | Ghost + guides temps/pitch monospace |

---

## 🔧 Contrôles Avancés / Toolbar Exemple

```tsx
function PianoRollWithToolbar({ clip }) {
  const [grid, setGrid] = useState<GridValue>(16);
  const [snap, setSnap] = useState(true);
  const [pxPerBeat, setPxPerBeat] = useState(64);

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        grid={grid}
        onGridChange={setGrid}
        snap={snap}
        onSnapChange={setSnap}
        pxPerBeat={pxPerBeat}
        onPxPerBeatChange={setPxPerBeat}
      />
      <PianoRoll
        notes={clip.notes}
        lengthBeats={clip.lengthBeats}
        loop={clip.loop}
        position={clip.offsetBeats}
        playheadBeat={transport.positionBeats - clip.offsetBeats}
        active={transport.isPlaying}
        grid={grid}
        snap={snap}
        pxPerBeat={pxPerBeat}
        onPxPerBeatChange={setPxPerBeat}
        onChange={(n) => updateClip(clip.id, { notes: n })}
        onDraftChange={(n) => setLivePreview(n)}
        onLoopChange={(l) => updateClip(clip.id, { loop: l })}
        onLengthChange={(len) => updateClip(clip.id, { lengthBeats: len })}
        onPositionChange={(pos) => updateClip(clip.id, { offsetBeats: pos })}
      />
    </div>
  );
}
```

---

## 🐛 Debug / Checklist Rapide

| Problème | Vérifications |
|----------|---------------|
| Canvas vide | Conteneur a une hauteur; `notes.length` >= 0; pas d'erreur console. |
| Lag drag notes | Parent ne recrée pas `notes` à chaque frame; pas de heavy selector Zustand. |
| Playhead ne suit pas | `followPlayhead` vrai & `active`; transport fournit `playheadBeat`. |
| Loop ne met pas à jour store | `onLoopChange` fourni; attendre ≤80ms (throttle). |
| Resize clip ignore snap | Vérifier touche Shift (désactive). |

---

## 📚 Références Code

| Fichier | Rôle |
|---------|------|
| `PianoRoll.tsx` | Composition générale + wiring hooks. |
| `types.ts` | Définition API publique. |
| `hooks/*` | Zoom, scroll, auto-follow, draw, throttle, loop state, preview. |
| `core/utils.ts` | Clamp overlap & resize safe. |
| `interactions/*` | Hit‑testing & gestuelle (pointer / double‑click). |
| `rendering/*` | Dessin base & overlay (culling, guides). |

---

## ✨ Bonnes Pratiques Synthèse

1. Fournir `onDraftChange` si besoin de pré‑écoute (synth live, quantization visuelle).
2. Regrouper mises à jour clip dans un seul store action (éviter cascades).
3. Ne jamais muter `notes` in-place → fournir nouveau tableau pour diff fiable.
4. Utiliser `crypto.randomUUID()` pour id stable si disponible.
5. Débrancher `followPlayhead` pendant édition prolongée pour éviter jumps.

---

Bonne utilisation ! 🎹🔥
