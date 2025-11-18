# Guide de Migration - SessionPlayer Refactorisé

## 🎯 Objectif

Ce guide vous aide à migrer du fichier monolithique `session-player.ts` vers l'architecture modulaire refactorisée.

## 📋 Étapes de migration

### Étape 1 : Validation (Tests)

Avant toute migration, testez la nouvelle version :

```typescript
// Test basique - remplacez temporairement l'import
// Ancien
// import { getSessionPlayer } from "@/lib/audio/core/session-player";

// Nouveau (pour test)
import { getSessionPlayer } from "@/lib/audio/core/session-player-refactored";

const player = getSessionPlayer();
player.start();

// Testez les fonctions critiques :
// - Lancement clips audio
// - Lancement clips MIDI
// - Boucles MIDI
// - Arrêt/Stop
// - prime() / préchargement
```

### Étape 2 : Remplacement progressif

1. **Identifier tous les imports de session-player**

```bash
# Rechercher dans tout le projet
grep -r "session-player" src/
```

2. **Remplacer fichier par fichier**

Exemple dans `project-sync.ts` :

```typescript
// Avant
import { getSessionPlayer } from "@/lib/audio/core/session-player";

// Après
import { getSessionPlayer } from "@/lib/audio/core/session-player-refactored";
```

3. **Tester chaque fichier modifié**

### Étape 3 : Renommage final

Une fois tous les imports migrés et testés :

```bash
# Sauvegarder l'ancien
mv src/lib/audio/core/session-player.ts src/lib/audio/core/session-player.OLD.ts

# Renommer le nouveau
mv src/lib/audio/core/session-player-refactored.ts src/lib/audio/core/session-player.ts
```

### Étape 4 : Nettoyage

Après validation complète (1-2 semaines) :

```bash
# Supprimer l'ancien fichier
rm src/lib/audio/core/session-player.OLD.ts
```

## 🔍 Points de vigilance

### 1. Imports directs de classes internes

❌ **Avant** (si vous aviez ça, c'était mal) :
```typescript
import { SessionPlayer } from "@/lib/audio/core/session-player";
const player = new SessionPlayer(); // ❌ Ne pas faire
```

✅ **Toujours utiliser** :
```typescript
import { getSessionPlayer } from "@/lib/audio/core/session-player";
const player = getSessionPlayer(); // ✅ Singleton
```

### 2. Accès aux propriétés internes

Si du code accédait à des propriétés privées (il ne devrait pas) :

❌ **Avant** :
```typescript
player._pool // ❌ Accès interdit
player._midiTracks // ❌ Accès interdit
```

✅ **Après** : Utiliser l'API publique uniquement

### 3. Timing et synchronisation

La nouvelle architecture respecte mieux le timing :

- Les clips audio démarrent exactement à `when`
- L'UI se synchronise précisément avec `AudioContext.currentTime`
- Les boucles MIDI sont plus stables

**Résultat** : Potentiellement meilleur timing, mais vérifier que ça ne casse pas les attentes existantes.

## 🧪 Tests recommandés

### Test 1 : Clip audio simple

```typescript
// Lancer un clip audio
const player = getSessionPlayer();
player.start();

// Vérifier :
// - Le son démarre au bon moment
// - Pas de crackling
// - L'UI se met à jour
```

### Test 2 : Boucle MIDI

```typescript
// Lancer une boucle MIDI
// Vérifier :
// - La boucle se répète correctement
// - Pas de notes manquantes ou doublées
// - CPU usage stable
```

### Test 3 : Édition live

```typescript
// Modifier des notes pendant qu'une boucle joue
player.applyMidiDraft(trackId, sceneIndex, newNotes);

// Vérifier :
// - Les nouvelles notes sont injectées
// - Pas de glitch audio
// - Synchronisation maintenue
```

### Test 4 : Préchargement

```typescript
await player.prime();

// Vérifier :
// - Tous les samples sont chargés
// - Progression UI correcte
// - Pas d'erreurs de fetch
```

### Test 5 : Stop/cleanup

```typescript
player.stopAll();
player.stop();

// Vérifier :
// - Tous les sons s'arrêtent
// - Pas de fuites mémoire
// - L'UI se remet à zéro
```

## 📊 Checklist de validation

- [ ] Tous les imports migrés
- [ ] Clips audio jouent correctement
- [ ] Clips MIDI jouent correctement
- [ ] Boucles MIDI fonctionnent
- [ ] Édition live fonctionne
- [ ] Préchargement fonctionne
- [ ] Stop/cleanup fonctionnent
- [ ] Pas de régression de performance
- [ ] Pas de fuites mémoire
- [ ] L'UI se synchronise correctement
- [ ] Les instruments fonctionnent
- [ ] Les paramètres live updates fonctionnent
- [ ] Mode legato fonctionne
- [ ] Quantization fonctionne

## 🐛 Problèmes connus et solutions

### Problème : Les boucles MIDI ne se répètent pas

**Solution** : Vérifier que `clip.loop === true` et `loopStart < loopEnd`

### Problème : L'UI ne se met pas à jour

**Solution** : Vérifier que `useUiStore` est bien importé et disponible

### Problème : Performance dégradée

**Solution** : 
- Activer les logs de debug
- Profiler avec Chrome DevTools
- Vérifier que le throttling (10ms) est actif

### Problème : Clips audio ne jouent pas

**Solution** :
- Vérifier que `AudioEngine` est initialisé
- Vérifier que les samples sont bien chargés
- Vérifier le `AudioContext` state (suspended/running)

## 📞 Support

En cas de problème :

1. Activer les logs de debug dans `midi-clip-manager.ts` :
   ```typescript
   const DEBUG_LOOP_JITTER = true;
   ```

2. Ouvrir la console et rechercher les erreurs

3. Rollback si nécessaire :
   ```bash
   git checkout session-player.ts
   ```

## ✨ Avantages de la migration

Une fois migrée, vous bénéficierez de :

- ✅ Code plus maintenable
- ✅ Tests unitaires possibles
- ✅ Meilleure séparation des responsabilités
- ✅ Performance optimisée
- ✅ Type safety améliorée
- ✅ Debug plus facile

## 📚 Documentation

- [README.md](./session-player/README.md) - Documentation complète
- [CHANGELOG.md](./session-player/CHANGELOG.md) - Historique des changements
- [Architecture Instructions](../.github/instructions/architecture.instructions.md)

---

*Bon courage pour la migration ! 🚀*
