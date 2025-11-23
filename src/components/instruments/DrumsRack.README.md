# DrumsRack - Documentation

## 📋 Vue d'ensemble

Le **DrumsRack** est un instrument de type drum machine intégré dans votre DAW. Il utilise le système de **Sampler** existant pour déclencher des samples audio pré-chargés via une interface de pads cliquables.

## 🎯 Caractéristiques

### ✅ Fonctionnalités implémentées

- **8 pads de batterie** configurables
- **Préchargement automatique** des samples au chargement
- **Mapping MIDI** standard (notes 35-42)
- **Feedback visuel** lors du trigger (animation de 200ms)
- **Intégration complète** avec le système audio existant
- **Gestion de l'état** (loading, ready)
- **Routing audio** via MidiTrack

### 🎨 Design

- **Interface cohérente** avec SimpleSynthPanel et DualSynthPanel
- **Couleurs des pads** personnalisables
- **Animations** fluides et réactives
- **Dark theme** par défaut

## 🔧 Architecture technique

### Structure des composants

```
DrumsRack
├── PadButton (memo)
│   ├── État local (isActive)
│   ├── Animation de trigger
│   └── Affichage nom + note MIDI
└── DrumsRackComponent
    ├── Initialisation du Sampler
    ├── Préchargement des samples
    ├── Gestion de la MidiTrack
    └── Grid de pads
```

### Flux de données

1. **Initialisation** (useEffect)
   ```
   AudioEngine.init()
   → Sampler.new(zones)
   → Sampler.preload()
   → MidiTrack.setInstrument("sampler", { sampler })
   ```

2. **Trigger** (onClick)
   ```
   PadButton.onClick
   → handleTrigger(pitch)
   → AudioEngine.resume()
   → MidiTrack.noteOn(pitch, 0.8, false)
   → Sampler.trigger(pitch, velocity, destination)
   ```

### Types

```typescript
type DrumPad = {
  id: string;           // Identifiant unique
  name: string;         // Nom affiché
  pitch: number;        // Note MIDI (35-127)
  url: string;          // Chemin du sample
  color?: string;       // Classe Tailwind pour la couleur
};
```

## 📦 Configuration des pads

### Pads par défaut

| ID | Nom | Note MIDI | Sample | Couleur |
|----|-----|-----------|--------|---------|
| kick | Kick | 36 | `/sound/Kick-01.wav` | Rouge |
| snare | Snare | 38 | `/sound/Lev-Snare-001.wav` | Bleu |
| shaker | Shaker | 42 | `/sound/Lev-Shaker-001.wav` | Vert |
| kick2 | Kick 2 | 35 | `/sound/PT_Kick_G_01.wav` | Orange |
| kick3 | Kick 3 | 37 | `/sound/PT_Kick_F_03.wav` | Violet |
| kick4 | Kick 4 | 39 | `/sound/PT_Kick_G#_01.wav` | Rose |
| kick5 | Kick 5 | 40 | `/sound/PT_Kick_F#_01.wav` | Jaune |
| kick6 | Kick 6 | 41 | `/sound/PT_Kick_G_02.wav` | Indigo |

### Personnalisation

Pour ajouter/modifier des pads, éditez le tableau `DEFAULT_PADS` :

```typescript
const DEFAULT_PADS: DrumPad[] = [
  { 
    id: "custom-pad", 
    name: "Mon Pad", 
    pitch: 50, 
    url: "/sound/mon-sample.wav", 
    color: "bg-cyan-600" 
  },
  // ...
];
```

## 🎹 Utilisation

### Dans l'interface

1. Sélectionnez une piste MIDI
2. Allez dans l'onglet **Device**
3. Sélectionnez **"Drums Rack (Sampler)"** dans le menu déroulant
4. Attendez le chargement des samples (indicateur "Loading samples...")
5. Cliquez sur les pads pour déclencher les sons

### Depuis le piano roll

Les notes MIDI 35-42 déclenchent automatiquement les pads correspondants lors de la lecture d'un clip MIDI.

### Via contrôleur MIDI externe

Activez l'option **"MIDI Live Input"** et jouez les notes 35-42 sur votre contrôleur.

## ⚡ Performance

### Optimisations implémentées

- ✅ **Préchargement une seule fois** : les AudioBuffer sont décodés au montage
- ✅ **Pas d'allocations au trigger** : réutilisation des buffers existants
- ✅ **Memo sur PadButton** : évite les re-renders inutiles
- ✅ **useMemo sur zones** : les zones ne sont recalculées que si DEFAULT_PADS change
- ✅ **useCallback sur handleTrigger** : fonction stable pour les enfants
- ✅ **Cleanup des timers** : clearTimeout dans le useEffect de PadButton

### Points d'attention

- ⚠️ Le **préchargement bloque** pendant le décodage des samples (asynchrone mais bloquant pour l'UI "Loading...")
- ⚠️ Les **samples volumineux** peuvent augmenter le temps de chargement initial
- ✅ Pas d'impact sur les performances audio temps réel (trigger instantané après preload)

## 🐛 Debugging

### Logs utiles

```typescript
// Dans l'effet d'initialisation
console.log("Sampler créé avec zones:", zones);
console.log("Samples préchargés:", samplerRef.current);
console.log("MidiTrack configurée:", midiTrackRef.current);
```

### Problèmes courants

1. **Samples ne se chargent pas** :
   - Vérifier que les fichiers existent dans `/public/sound/`
   - Vérifier la console pour les erreurs de fetch
   - Vérifier que les URLs sont correctes

2. **Pas de son au clic** :
   - Vérifier que `isReady === true`
   - Vérifier que l'AudioContext est resumed (interaction utilisateur requise)
   - Vérifier le routing de la piste dans le mixer

3. **Latence au trigger** :
   - Normal si le preload n'est pas terminé
   - Vérifier que les samples ne sont pas trop volumineux

## 🔮 Améliorations futures

### Priorité haute
- [ ] **Éditeur de pads** : permettre de changer les samples depuis l'UI
- [ ] **Vélocité variable** : zones de vélocité multiples par pad
- [ ] **Choke groups** : muter un pad quand un autre est joué (hi-hat open/close)

### Priorité moyenne
- [ ] **Presets** : sauvegarder/charger des kits complets
- [ ] **Volume par pad** : contrôle individuel du gain
- [ ] **Pan par pad** : spatialisation stéréo
- [ ] **Tune par pad** : pitch shift +/- semitons

### Priorité basse
- [ ] **FX par pad** : chaîne d'effets dédiée
- [ ] **Multi-samples** : round-robin automatique
- [ ] **Drag & drop** : charger des samples par glisser-déposer
- [ ] **Visual feedback** : waveform ou spectre sur chaque pad

## 🧪 Tests suggérés

### Tests manuels
1. ✅ Charger le DrumsRack → vérifier le preload
2. ✅ Cliquer sur chaque pad → vérifier le son
3. ✅ Changer de piste → vérifier l'isolation
4. ✅ Créer un clip MIDI → vérifier le playback
5. ✅ Contrôleur MIDI → vérifier le live input

### Tests unitaires (à implémenter)
```typescript
describe("DrumsRack", () => {
  it("should preload all samples on mount");
  it("should trigger correct pitch on pad click");
  it("should cleanup on unmount");
  it("should handle missing samples gracefully");
});
```

## 📚 Références

- **Sampler** : `src/lib/audio/sources/sampler.ts`
- **MidiTrack** : `src/lib/audio/sources/midi-track.ts`
- **AudioEngine** : `src/lib/audio/core/audio-engine.ts`
- **SimpleSynthPanel** : `src/components/instruments/SimpleSynthPanel.tsx` (référence UI)

---

**Créé le** : 21 novembre 2025  
**Version** : 1.0.0  
**Statut** : ✅ Production-ready
