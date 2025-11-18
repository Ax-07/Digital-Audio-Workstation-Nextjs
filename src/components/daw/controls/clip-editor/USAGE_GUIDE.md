# 🎹 Piano Roll – Guide d'Utilisation

## 📖 Import et Utilisation Basique

```tsx
import { PianoRoll } from "@/components/daw/controls/clip-editor/PianoRoll";

// Dans votre composant
<PianoRoll
  notes={midiNotes}
  onChange={(updatedNotes) => {
    // Sauvegarde des modifications
    updateClipNotes(updatedNotes);
  }}
  lengthBeats={16}
  loop={{ start: 0, end: 4 }}
  playheadBeat={currentBeat}
  active={isPlaying}
  followPlayhead={true}
/>
```

---

## 🎛️ Props

### Obligatoires
- `notes: ReadonlyArray<MidiNote>` – Notes MIDI à afficher

### Optionnelles
- `onChange?: (notes: MidiNote[]) => void` – Callback lors de modifications
- `lengthBeats?: number` – Longueur du clip (défaut: 4)
- `loop?: { start: number; end: number } | null` – Zone de boucle
- `onLoopChange?: (loop) => void` – Callback changement boucle
- `playheadBeat?: number` – Position actuelle du transport
- `followPlayhead?: boolean` – Auto-scroll sur le playhead (défaut: true)
- `active?: boolean` – Le clip est en lecture (défaut: false)

---

## ⌨️ Raccourcis Clavier

| Touche | Action |
|--------|--------|
| **Delete / Backspace** | Supprimer note(s) sélectionnée(s) |
| **Molette** | Scroll vertical (pitch) |
| **Shift + Molette** | Scroll horizontal (temps) |
| **Ctrl/Cmd + Molette** | Zoom horizontal |
| **Alt + Molette** | Zoom vertical |
| **Shift (drag)** | Désactiver snap temporairement |

---

## 🖱️ Interactions Souris

### Création de Note
1. Cliquer dans la zone vide (à droite du clavier)
2. La note est créée avec durée par défaut (1/grid)
3. Drag immédiat pour ajuster la durée

### Déplacement de Note
1. Cliquer sur une note
2. Drag pour déplacer (temps + pitch)
3. Snap automatique à la grille

### Redimensionnement de Note
1. Cliquer sur le bord droit d'une note
2. Drag horizontal pour ajuster la durée
3. Durée minimale = 1/grid

### Sélection Multiple (Marquee)
1. Cliquer dans la zone vide
2. Drag pour créer un rectangle
3. Toutes les notes touchées sont sélectionnées

### Preview Audio
- Cliquer sur le clavier piano (gauche)
- La note est jouée instantanément
- Relâcher pour arrêter

### Loop Handles
- Handles jaunes en haut de la grille
- Drag pour ajuster start/end

---

## 🎨 Visual Feedback

### Couleurs des Notes
- **Orange** `#FBBF24` : Note normale
- **Jaune clair** `#FFD02F` : Note sélectionnée
- **Jaune moyen** `#FACC15` : Note survolée
- **Bleu translucide** : Ghost note (preview)

### Curseurs
- **Crosshair** : Zone vide (création)
- **Pointer** : Sur une note (déplacement)
- **EW-resize** : Bord droit d'une note (redimensionnement)
- **Default** : Clavier piano

### Guides de Drag
- Lignes pointillées jaunes : temps (vertical) + pitch (horizontal)
- Labels : position beat + pitch number

---

## 🔧 Configuration Interne

Ces paramètres sont gérés automatiquement mais peuvent être exposés :

```tsx
// État UI interne (non exposé dans props)
const [pxPerBeat, setPxPerBeat] = useState(64);
const [pxPerSemitone, setPxPerSemitone] = useState(14);
const [grid, setGrid] = useState<4 | 8 | 16 | 32>(16);
const [snap, setSnap] = useState(true);
const [snapEdges, setSnapEdges] = useState(true);
```

Pour exposer ces contrôles, créer un `<PianoRollToolbar>` séparé.

---

## 📊 Performance

### Optimisations Actives
- ✅ Viewport culling (seules notes visibles dessinées)
- ✅ Buffer réutilisé (pas d'allocation par frame)
- ✅ Double canvas (base + overlay)
- ✅ devicePixelRatio géré

### Monitoring
```tsx
// Accès aux métriques (dans le composant)
perfRef.current.lastDrawMs  // Dernier temps de rendu (ms)
perfRef.current.visible      // Notes dessinées
perfRef.current.total        // Notes totales
perfRef.current.avgMs        // Moyenne lissée (EMA)
```

---

## 🧩 Extensions Possibles

### Ajouter un Toolbar
```tsx
<div className="flex flex-col h-full">
  <PianoRollToolbar
    grid={grid}
    setGrid={setGrid}
    snap={snap}
    setSnap={setSnap}
    pxPerBeat={pxPerBeat}
    setPxPerBeat={setPxPerBeat}
  />
  <PianoRoll {...props} />
</div>
```

### Ajouter Velocity Lane
```tsx
<div className="flex flex-col h-full">
  <PianoRoll {...props} />
  <VelocityLane
    notes={notes}
    selected={selectedIndices}
    onChange={(idx, vel) => updateVelocity(idx, vel)}
  />
</div>
```

---

## 🐛 Debugging

### Canvas ne s'affiche pas
- Vérifier que le conteneur parent a une hauteur définie
- Vérifier `notes` non vide
- Ouvrir DevTools > Canvas debugging

### Performance faible
- Réduire `pxPerBeat` (moins de détails)
- Vérifier `culledBufferRef` utilisé
- Monitorer `perfRef.current.avgMs`

### Notes ne se créent pas
- Vérifier `onChange` défini
- Vérifier que le clic est dans la zone valide (xCss >= keyWidth)

---

## 📚 Références

### Fichiers Liés
- `constants.ts` : Constantes globales
- `coords.ts` : Conversion coordonnées
- `hit.ts` : Détection de hit
- `utils.ts` : Helpers snap/clamp
- `draw/` : Fonctions de rendu modulaires

### Types Principaux
```tsx
type MidiNote = {
  id: string;
  pitch: number;     // 0-127
  time: number;      // en beats
  duration: number;  // en beats
  velocity: number;  // 0-1
};

type DraftNote = MidiNote & { __id: number };
```

---

## ✨ Bonnes Pratiques

1. **Toujours fournir `lengthBeats`** : évite les calculs incorrects
2. **Mémoriser `notes`** : éviter re-render inutiles
3. **Throttle `onChange`** : éviter trop d'updates
4. **Désactiver followPlayhead** : si l'utilisateur scroll manuellement
5. **Utiliser `memo`** : si le PianoRoll est dans un contexte complexe

---

## 🎯 Exemples d'Intégration

### Intégration dans ClipEditor
```tsx
const ClipEditor = ({ clipId }) => {
  const clip = useProjectStore((s) => s.clips[clipId]);
  const updateClip = useProjectStore((s) => s.updateClip);
  
  return (
    <div className="h-full">
      <PianoRoll
        notes={clip.notes}
        onChange={(notes) => updateClip(clipId, { notes })}
        lengthBeats={clip.lengthBeats}
        loop={clip.loop}
        playheadBeat={transport.currentBeat - clip.startBeat}
        active={clip.isPlaying}
      />
    </div>
  );
};
```

### Intégration avec Transport
```tsx
const transport = useTransportStore();

<PianoRoll
  playheadBeat={transport.positionBeats}
  active={transport.isPlaying}
  followPlayhead={transport.isPlaying}
/>
```

---

Bonne utilisation ! 🎹🎶
