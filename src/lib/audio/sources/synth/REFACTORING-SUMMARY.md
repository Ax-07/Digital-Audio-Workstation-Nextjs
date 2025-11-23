# 🎛️ Refactorisation des Synthés — Extraction du Code Commun

## 📋 Résumé

Extraction réussie du code commun des synthés (`SimpleSynth` et `DualOscSynth`) dans un fichier d'utilitaires réutilisables `synth-utils.ts`.

---

## ✅ Fichiers Modifiés

### 1. **synth-utils.ts** (NOUVEAU)
Fichier d'utilitaires communs contenant toutes les fonctions réutilisables.

#### 🔧 Fonctions Extraites

##### Conversion MIDI
- `midiToFreq(pitch: number): number`
  - Conversion pitch MIDI → fréquence Hz
  - Formule : `440 * 2^((pitch - 69) / 12)`

##### Utilitaires Mathématiques
- `clamp(v: number, min: number, max: number): number`
  - Limite une valeur entre min et max

##### Gestion du Contexte Audio
- `ensureAudioContext(): AudioContext | null`
  - Récupère le AudioContext global via AudioEngine
  - Retourne null si non initialisé

##### Types de Base
- `BaseVoice` (interface)
  - Interface de base pour une voix polyphonique
  - Propriétés : `active`, `pitch`, `gain`, `startedAt`, `isPreview`

##### Voice Management
- `findInactiveVoice<T extends BaseVoice>(voices: T[]): number`
  - Trouve une voix inactive dans le pool
  - Retourne l'index ou -1

- `findOldestVoice<T extends BaseVoice>(voices: T[]): number`
  - Trouve la voix active la plus ancienne (pour voice stealing)
  - Retourne l'index ou -1

- `findVoiceByPitch<T extends BaseVoice>(voices: T[], pitch: number): number`
  - Trouve une voix active correspondant à un pitch
  - Retourne l'index ou -1

##### Voice Cleanup
- `applyVoiceRelease(gain: GainNode, now: number, tau?: number): void`
  - Applique un release exponentiel sur le gain d'une voix
  - Par défaut : tau = 0.02

- `stopOscillator(osc: OscillatorNode | null, stopTime: number): void`
  - Stoppe un oscillateur avec gestion d'erreur silencieuse

- `resetVoiceGain(gain: GainNode, resetTime: number): void`
  - Réinitialise le gain d'une voix après un release
  - Permet la réutilisation propre

##### Voice Connection
- `reconnectVoiceGain(gain: GainNode, destination: AudioNode): void`
  - Reconnecte un GainNode vers une nouvelle destination
  - Déconnecte proprement l'ancienne connexion

##### Envelope Application
- `initAudioParam(param: AudioParam, now: number, initialValue: number): void`
  - Configure l'état initial d'un AudioParam
  - Annule les automations précédentes

- `applyLinearEnvelope(param: AudioParam, envelope: GenericEnvelope, now: number, baseValue: number, depth: number): void`
  - Applique une enveloppe linéaire à un AudioParam
  - Utilisé pour detune, mix, etc.

- `scheduleVoiceCleanup(callback: VoiceCleanupCallback, delayMs: number): void`
  - Programme un nettoyage de voix après un délai
  - Utilise setTimeout si disponible

##### Mix Crossfade (pour DualOscSynth)
- `calculateCrossfadeGains(mix: number): [number, number]`
  - Calcule les gains A/B pour un crossfade trigonométrique
  - Loi : gainA = cos(mix * π/2), gainB = sin(mix * π/2)

- `applyMixEnvelope(mixGainA: GainNode, mixGainB: GainNode, envelope: GenericEnvelope, now: number, baseMix: number, depth: number): void`
  - Applique une enveloppe de mix crossfade A/B dans le temps

##### Propagation Live
- `propagateDetune(osc: OscillatorNode | null, detuneCents: number): void`
  - Applique le détune sur un oscillateur actif (RT-safe)

- `propagateGain(gain: GainNode | null, value: number): void`
  - Applique un gain statique (RT-safe)

---

### 2. **simple-synth.ts** (REFACTORISÉ)

#### Modifications Appliquées

##### Imports
```typescript
// AVANT :
import { AudioEngine, dbToGain } from "@/lib/audio/core/audio-engine";
function midiToFreq(pitch: number) { ... }

// APRÈS :
import { dbToGain } from "@/lib/audio/core/audio-engine";
import {
  midiToFreq,
  clamp,
  ensureAudioContext,
  findInactiveVoice,
  findOldestVoice,
  applyVoiceRelease,
  stopOscillator,
  resetVoiceGain,
  reconnectVoiceGain,
  findVoiceByPitch,
  scheduleVoiceCleanup,
  propagateDetune,
  type BaseVoice,
} from "./synth-utils";
```

##### Type Voice
```typescript
// AVANT :
type Voice = {
  active: boolean;
  pitch: number;
  osc: OscillatorNode | null;
  gain: GainNode;
  startedAt: number;
  isPreview?: boolean;
};

// APRÈS :
type Voice = BaseVoice & {
  osc: OscillatorNode | null;
};
```

##### configure()
- ✅ Remplacé `Math.max/min` par `clamp()`
- ✅ Remplacé le try/catch de propagation par `propagateDetune()`

##### ensureContext()
- ✅ Remplacé `AudioEngine.ensure()` par `ensureAudioContext()`

##### allocateVoice()
- ✅ Remplacé la boucle de recherche inactive par `findInactiveVoice()`
- ✅ Remplacé la logique de voice stealing par `findOldestVoice()`
- ✅ Remplacé le release manuel par `applyVoiceRelease()` + `stopOscillator()`

##### reinitVoice()
- ✅ Remplacé disconnect/connect par `reconnectVoiceGain()`

##### noteOff()
- ✅ Remplacé la boucle de recherche par `findVoiceByPitch()`
- ✅ Remplacé le release manuel par `applyVoiceRelease()` + `stopOscillator()`
- ✅ Remplacé setTimeout conditionnel par `scheduleVoiceCleanup()`

##### stopAllVoices()
- ✅ Remplacé le release manuel par `applyVoiceRelease()`
- ✅ Remplacé les stop manuels par `stopOscillator()`
- ✅ Remplacé le reset manuel par `resetVoiceGain()`

---

### 3. **dual-osc-synth.ts** (REFACTORISÉ)

#### Modifications Appliquées

##### Imports
```typescript
// AVANT :
import { AudioEngine, dbToGain } from "@/lib/audio/core/audio-engine";
function midiToFreq(pitch: number) { ... }

// APRÈS :
import { dbToGain } from "@/lib/audio/core/audio-engine";
import {
  midiToFreq,
  clamp,
  ensureAudioContext,
  findInactiveVoice,
  findOldestVoice,
  applyVoiceRelease,
  stopOscillator,
  resetVoiceGain,
  reconnectVoiceGain,
  propagateDetune,
  propagateGain,
  calculateCrossfadeGains,
} from "./synth-utils";
```

##### Suppression des Méthodes Locales
- ❌ Supprimé `private clamp()` → utilise `clamp()` globale
- ❌ Supprimé `function midiToFreq()` → utilise import

##### killVoice()
- ✅ Remplacé try/catch par `applyVoiceRelease()` + `stopOscillator()`

##### configure()
- ✅ Remplacé `this.clamp()` par `clamp()`
- ✅ Remplacé le calcul de crossfade manuel par `calculateCrossfadeGains()`
- ✅ Remplacé la propagation live manuelle par `propagateDetune()` + `propagateGain()`

##### ensureContext()
- ✅ Remplacé `AudioEngine.ensure()` par `ensureAudioContext()`

##### allocateVoice()
- ✅ Remplacé la boucle inactive par `findInactiveVoice()`
- ✅ Remplacé la logique de voice stealing par `findOldestVoice()`

##### reinitVoice()
- ✅ Remplacé disconnect/connect par `reconnectVoiceGain()`

##### stopAllVoices()
- ✅ Remplacé le release manuel par `applyVoiceRelease()`
- ✅ Remplacé les stop manuels par `stopOscillator()`
- ✅ Remplacé le reset manuel par `resetVoiceGain()`

---

## 📊 Statistiques

### Code Réduit
- **simple-synth.ts** : ~40 lignes en moins
- **dual-osc-synth.ts** : ~45 lignes en moins
- **Total code dupliqué éliminé** : ~85 lignes

### Code Ajouté
- **synth-utils.ts** : ~420 lignes (fortement documentées et typées)

### Ratio
- **Code réutilisable** : 1 fonction → 2+ utilisations
- **Complexité réduite** : boucles manuelles → fonctions déclaratives
- **Maintenance** : 1 seul endroit à modifier pour les 2 synthés

---

## 🎯 Bénéfices

### 1. **Réduction de la Duplication**
- Plus de code dupliqué entre `SimpleSynth` et `DualOscSynth`
- Maintenance simplifiée : 1 fix = 2 synthés corrigés

### 2. **Lisibilité Améliorée**
```typescript
// AVANT :
for (let i = 0; i < this.voices.length; i++) {
  const v = this.voices[i];
  if (!v.active) return this.reinitVoice(v, destination);
}

// APRÈS :
const inactiveIdx = findInactiveVoice(this.voices);
if (inactiveIdx >= 0) {
  return this.reinitVoice(this.voices[inactiveIdx], destination);
}
```

### 3. **Sécurité Runtime**
- Toutes les fonctions audio gèrent silencieusement les erreurs
- Pas de crash si un node est déjà stoppé ou invalide
- Code RT-safe (Real-Time audio thread)

### 4. **Type Safety**
- Interface `BaseVoice` pour la cohérence
- Génériques TypeScript (`<T extends BaseVoice>`)
- Pas de `any` ou assertions dangereuses

### 5. **Extensibilité**
- Nouveaux synthés peuvent réutiliser ces utilitaires
- Ajout de fonctions sans toucher aux synthés existants
- Pattern réutilisable pour d'autres moteurs audio

---

## 🔮 Utilisation Future

### Pour Créer un Nouveau Synthé

```typescript
import {
  midiToFreq,
  ensureAudioContext,
  findInactiveVoice,
  findOldestVoice,
  applyVoiceRelease,
  stopOscillator,
  type BaseVoice,
} from "./synth-utils";

type MyVoice = BaseVoice & {
  // Ajoutez vos nodes spécifiques
  filter: BiquadFilterNode;
  lfo: OscillatorNode;
};

class MySynth {
  private voices: MyVoice[] = [];

  private allocateVoice(dest: AudioNode) {
    const ctx = ensureAudioContext();
    if (!ctx) return null;

    // Réutilisation immédiate des fonctions
    const idx = findInactiveVoice(this.voices);
    if (idx >= 0) return this.voices[idx];

    // ... création de voix
  }
}
```

---

## ✅ Validation

### Tests de Compilation
- ✅ `simple-synth.ts` : 0 erreurs
- ✅ `dual-osc-synth.ts` : 0 erreurs
- ✅ `synth-utils.ts` : 0 erreurs

### Tests Fonctionnels Nécessaires
- [ ] Vérifier que `SimpleSynth.noteOn/Off()` fonctionne identiquement
- [ ] Vérifier que `DualOscSynth.noteOn/Off()` fonctionne identiquement
- [ ] Tester le voice stealing sous charge (>16 notes)
- [ ] Tester la propagation live des paramètres (detune, mix)
- [ ] Vérifier l'absence de clics/pops lors des noteOff
- [ ] Tester la preview keyboard avec stopAllVoices()

---

## 🧩 Prochaines Étapes Possibles

1. **Extraire l'application des enveloppes dans noteOn()**
   - Actuellement, chaque synthé duplique la logique d'enveloppes
   - Pourrait être factorisé dans `synth-utils.ts`

2. **Créer une classe de base `PolySynth`**
   - Héritage : `SimpleSynth extends PolySynth`
   - Méthodes abstraites : `createOscillators()`, `connectVoice()`

3. **Ajouter des helpers pour les LFO/Modulation**
   - `applyLFO(param, rate, depth)`
   - `createModulationSource(type, target)`

4. **Performance Profiling**
   - Mesurer l'impact de l'extraction sur les perfs CPU
   - Comparer avant/après en production

---

## 📚 Documentation Générée

Toutes les fonctions sont documentées avec JSDoc incluant :
- Description fonctionnelle
- Paramètres typés
- Valeurs de retour
- Exemples d'utilisation (pour certaines)
- Notes RT-safety pour l'audio thread

---

**✨ Refactorisation terminée avec succès !**
