# SessionPlayer - Architecture Refactorisée

## 📋 Vue d'ensemble

Le SessionPlayer a été refactorisé pour améliorer la maintenabilité, la lisibilité et les performances. L'architecture modulaire sépare clairement les responsabilités en plusieurs composants spécialisés.

## 🏗️ Structure

```txt
session-player/
├── types.ts                    # Types TypeScript partagés
├── helpers.ts                  # Fonctions utilitaires
├── audio-clip-manager.ts       # Gestion des clips audio
├── midi-clip-manager.ts        # Gestion des clips MIDI et boucles
├── ui-sync-manager.ts          # Synchronisation UI/Audio
└── index.ts                    # Exports publics
```

## 🧩 Modules

### 1. **types.ts**

Définit tous les types TypeScript utilisés dans le SessionPlayer :

- `ActiveClip` : Représente un clip actif (audio ou MIDI)
- `MidiLoopInfo` : État d'une boucle MIDI
- `AudioClipOptions` : Options de lecture audio
- `InstrumentConfig` : Configuration d'instrument

### 2. **helpers.ts**

Fonctions utilitaires réutilisables :

- `makePoolKey()` : Génère une clé unique pour le pool de samples
- `makeMidiNoteId()` : Génère un ID stable pour une note MIDI
- `calculateDelayMs()` : Calcule le délai en ms entre deux moments
- `shouldDebounce()` : Anti-rebond pour éviter les doubles lancements

### 3. **AudioClipManager**

Responsable de la gestion des clips audio :

- Pool de `SampleSource` (cache des buffers audio)
- Lancement et arrêt des clips audio
- Gestion des boucles audio
- Préchargement des samples

**API Principale :**

```typescript
ensureSample(trackId, clipId, sampleUrl): Promise<SampleSource>
startAudioClip(trackId, clipId, sampleUrl, when, options): Promise<void>
stopAudioClip(trackId): void
scheduleStopAudioClip(trackId, whenSec): void
preloadSamples(clips): Promise<Array<result>>
```

### 4. **MidiClipManager**

Responsable de la gestion des clips MIDI :

- Instances `MidiTrack` par piste
- Lancement et arrêt des clips MIDI (one-shot et loop)
- Scheduling cyclique des boucles MIDI
- Configuration des instruments (synth, dual-synth)
- Rafraîchissement live des boucles

**API Principale :**

```typescript
getMidiTrack(trackId, config?): MidiTrack
configureInstrument(trackId, config): void
startMidiClipOneShot(trackId, clipId, notes, when, bpm, lengthBeats?): void
startMidiClipLoop(trackId, clipId, notes, when, bpm, loopStart, loopEnd, startOffset?): void
refreshMidiLoop(trackId, clipId, notes, loopStart, loopEnd): Promise<void>
stopMidiClip(trackId): void
```

### 5. **UISyncManager**

Responsable de la synchronisation UI/Audio :

- Marque les clips comme "scheduled" ou "playing"
- Programme les mises à jour UI au bon moment (aligned avec l'audio)
- Gère les transitions d'état des clips côté interface

**API Principale :**

```typescript
setScheduled(trackId, sceneIndex, when): Promise<void>
setPlayingAt(trackId, sceneIndex, when, currentTime): Promise<void>
clearPlayingAt(trackId, when, currentTime): Promise<void>
clearPlaying(trackId): Promise<void>
clearAllPlaying(): Promise<void>
getLaunchMode(): Promise<string | undefined>
getPlayingCells(): Promise<Record<string, number | null>>
```

### 6. **SessionPlayer (orchestrateur)**

Coordonne tous les managers :

- S'abonne aux événements du `TransportScheduler`
- Délègue le travail aux managers appropriés
- Gère les watchers de changements d'état (loop, instruments)
- API publique pour l'application

**API Publique :**

```typescript
start(): void
stop(): void
applyMidiDraft(trackId, sceneIndex, draft): Promise<void>
refreshActiveMidiLoop(trackId, sceneIndex): Promise<void>
prime(): Promise<void>
stopAll(): void
stopTrack(trackId): void
scheduleStopTrack(trackId, whenSec): void
getActiveTrackIds(): string[]
```

## ✨ Avantages de la refactorisation

### 1. **Séparation des responsabilités**

Chaque module a un rôle clair et délimité :

- Audio = AudioClipManager
- MIDI = MidiClipManager  
- UI = UISyncManager
- Orchestration = SessionPlayer

### 2. **Testabilité**

Chaque manager peut être testé indépendamment avec des mocks.

### 3. **Maintenabilité**

- Code plus court et focalisé dans chaque fichier (~150-400 lignes vs 1468)
- Pas de scroll infini pour trouver une fonction
- Modifications isolées sans risque de casser autre chose

### 4. **Réutilisabilité**

Les managers peuvent être utilisés dans d'autres contextes si besoin.

### 5. **Performances**

- Moins de code chargé si un module n'est pas utilisé
- Meilleure optimisation du tree-shaking
- Cache et pooling centralisés

### 6. **Type Safety**

- Types explicites dans `types.ts`
- Pas de `any` sauvages
- Meilleure autocomplétion dans l'IDE

## 🔄 Migration

### Ancien code

```typescript
import { getSessionPlayer } from "@/lib/audio/core/session-player";
const player = getSessionPlayer();
player.start();
```

### Nouveau code  

```typescript
import { getSessionPlayer } from "@/lib/audio/core/session-player-refactored";
const player = getSessionPlayer();
player.start();
```

**L'API publique reste identique !** Seule l'architecture interne change.

## 🚀 Prochaines étapes

1. **Tests unitaires** pour chaque manager
2. **Documentation JSDoc** complète
3. **Métriques de performance** (benchmarks)
4. **Migration progressive** de l'ancien code
5. **Suppression de l'ancien fichier** une fois migration terminée

## 📊 Comparaison

| Métrique | Avant | Après |
|----------|-------|-------|
| Lignes par fichier | 1468 | ~150-400 |
| Nombre de fichiers | 1 | 6 |
| Responsabilités par classe | ~10 | 1-2 |
| Testabilité | Faible | Élevée |
| Lisibilité | Moyenne | Élevée |

## 🎯 Bonnes pratiques

### Dans AudioClipManager

- Toujours réutiliser les SampleSource du pool
- Ne jamais recharger un buffer déjà en cache
- Utiliser `stopAt()` pour les arrêts précis

### Dans MidiClipManager

- Réutiliser les MidiTrack entre lancements
- Throttle les refreshes de loop (10ms min)
- Toujours normaliser les notes avec `makeMidiNoteId()`

### Dans UISyncManager

- Toujours utiliser `setTimeout` pour aligner UI et audio
- Ne jamais bloquer avec des appels synchrones
- Gérer les erreurs de store silencieusement

### Dans SessionPlayer

- Toujours vérifier l'existence de l'AudioContext
- Appliquer le debounce sur les lancements
- Nettoyer les subscriptions dans `stop()`

## 🐛 Debugging

Pour activer les logs détaillés :

```typescript
const DEBUG_LOOP_JITTER = true; // dans midi-clip-manager.ts
```

Cela affichera :

- Réinitialisations de boucles
- Injections de notes
- Scheduling des cycles

## 📚 Ressources

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Architecture Instructions](.github/instructions/architecture.instructions.md)
- [Audio Instructions](.github/instructions/audio.instructions.md)
- [Performance Instructions](.github/instructions/performance.instructions.md)
