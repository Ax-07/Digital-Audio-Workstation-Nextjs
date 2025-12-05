// src/lib/stores/project.store.ts

// Remarque :
// 8. project.store.ts — 🔴 celui qui dépasse le plus
// C’est clairement le “god store” actuel.
// Ce qu’il fait déjà et qui est logique :
// Contient le JSON complet du projet ✅
// Gère undo/redo ✅
// Gère toutes les opérations d’édition (tracks, scenes, clips, loops, notes…) ✅
// Mais il fait aussi :
// Orchestration audio
// Appelle reconcileProject à chaque setProject, updateTrack, addTrack, removeTrack, updateReturn, etc.
// Synchronise le BPM avec TransportScheduler (sch.setBpm(proj.bpm)).
// Synchronisation d’autres stores
// Met à jour useMixerStore à partir de proj.tracks dans setProject, updateTrack, addTrack, removeTrack.
// Contrôle de lecture
// launchScene :
// Utilise TransportScheduler pour getNextLaunchTime et launchClips.
// Appelle getSessionPlayer() et sp.scheduleStopTrack.
// Va chercher l’état UI via useUiStore si besoin.
// launchClip :
// Utilise TransportScheduler.
// Importe dynamiquement useUiStore pour récupérer launchQuantize.
// Accède à clip.launchQuantization.
// Persistance dans IndexedDB
// Appelle saveProject un peu partout.
// Résultat :
// ProjectStore connaît la structure du projet,
// les règles de lecture/quantize,
// le moteur audio,
// le scheduler,
// l’UI du mixer,
// et la persistance.
// C’est lui qui dépasse le plus sa responsabilité.
// Comment le découper (sans tout casser d’un coup)
// Même si tu ne refactores pas tout maintenant, une cible plus “propre” pourrait être :
// ProjectStore :
// Ne gérer que :
// project + _history/_future
// toutes les mutations pures sur le JSON (tracks/scenes/clips/notes/loop, etc.).
// Pas de reconcileProject, pas de scheduler, pas d’audio, pas de mixer UI.
// projectRuntime / audioGraph.store.ts ou service :
// Exposer des fonctions comme :
// applyProjectToAudioGraph(proj)
// syncMixerUiWithProject(proj)
// Appelées depuis une couche “controller” ou des effets (React, listeners, etc.)
// sessionPlayerController :
// Regrouper launchScene / launchClip dans un module dédié qui connaît :
// TransportScheduler
// SessionPlayer
// éventuellement UiStore pour la quantize.
// Persistance
// Utiliser scheduleSave à l’extérieur du store (ou via un middleware/subscribe dans ton bootstrap zustand/React), plutôt que dans chaque action.

import { create } from "zustand/react";
import { useInstrumentStore } from "@/features/daw/state/instrument.store"; // PERF: utilisé pour notes par défaut drum-machine
import { useMixerStore } from "@/features/daw/state/mixer.store";
import { saveProject } from "./persistence.store";
import { launchScene as launchSceneController, launchClip as launchClipController } from "@/features/daw/application/controllers/session.controller";
import { createMidiClipReducer, setClipLaunchQuantizationReducer, setClipStartOffsetReducer, updateClipLoopReducer, updateMidiClipLengthReducer, updateMidiClipNotesReducer } from "./midi-clip.reducer";
import { ClipDecl, MidiNote, ProjectDecl, SceneDecl, SessionViewDecl, TrackDecl } from "@/core/audio-engine/types";
import { AudioEngine } from "@/core/audio-engine/core/audio-engine";
import { TransportScheduler } from "@/core/audio-engine/core/transport-scheduler";
import { reconcileProject } from "@/core/audio-engine/core/virtual-graph";
import { getSessionPlayer } from "@/core/audio-engine/core/session-player";
import { useUiStore } from "@/features/daw/state/ui.store";


/**
 * État de base du projet.
 * - project : description complète du projet audio (pistes, session, BPM, etc.)
 * - _history : pile d’historique pour UNDO (états passés)
 * - _future : pile pour REDO (états futurs après un undo)
 */
type ProjectState = {
  project: ProjectDecl;
  _history: ProjectDecl[]; // pile d'annulation (undo)
  _future: ProjectDecl[];  // pile de rétablissement (redo)
};

/**
 * Ensemble des actions disponibles sur le store de projet.
 * Toutes les fonctions modifient l’état global et, selon les cas :
 * - mettent à jour le graphe audio (reconcileProject)
 * - synchronisent le mixer UI
 * - persévèrent le projet (IndexedDB)
 */
type ProjectActions = {
  setProject: (proj: ProjectDecl) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;

  // Gestion des pistes
  updateTrack: (id: string, patch: Partial<ProjectDecl["tracks"][number]>) => void;
  addTrack: (name?: string) => void;
  updateReturn: (target: "A" | "B", patch: Partial<TrackDecl>) => void;
  removeTrack: (id: string) => void;

  // Gestion Session / Scenes / Clips
  setScenesCount: (count: number) => void;
  setClipAt: (trackId: string, sceneIndex: number, clip: ClipDecl | null) => void;
  launchScene: (sceneIndex: number) => void;
  launchClip: (trackId: string, sceneIndex: number) => void;

  // Clips audio / MIDI
  createAudioClip: (trackId: string, sceneIndex: number, sampleUrl: string, name?: string) => void;
  createMidiClip: (
    trackId: string,
    sceneIndex: number,
    notes: ReadonlyArray<MidiNote>,
    name?: string
  ) => void;

  updateMidiClipNotes: (
    trackId: string,
    sceneIndex: number,
    notes: ReadonlyArray<MidiNote>
  ) => void;

  updateMidiClipLength: (trackId: string, sceneIndex: number, lengthBeats: number) => void;
  updateClipLoop: (trackId: string, sceneIndex: number, loop: { start: number; end: number } | null) => void;
  setMidiClipLoop: (trackId: string, sceneIndex: number, loop: { start: number; end: number } | null) => void;
  renameClip: (trackId: string, sceneIndex: number, name: string) => void;

  // Scènes
  renameScene: (sceneIndex: number, name: string) => void;
  setSceneColor: (sceneIndex: number, color: string) => void;
  duplicateScene: (sceneIndex: number) => void;

  // Extensions clip (présentes dans l’implémentation du store) :
  // Offset de départ interne du clip (ex: démarrer lecture au beat X à l’intérieur d’une loop)
  setClipStartOffset: (trackId: string, sceneIndex: number, startOffset: number) => void;
  // Quantification de lancement spécifique au clip (prend le pas sur quantize globale UI)
  setClipLaunchQuantization: (
    trackId: string,
    sceneIndex: number,
    q: "1n" | "1/2" | "1/4" | "1/8" | "bar" | "none"
  ) => void;
};

export type ProjectStore = ProjectState & ProjectActions;

/**
 * État initial du projet :
 * - 1 piste audio
 * - 8 scènes vides pour cette piste
 */
const initial: ProjectDecl = {
  bpm: 120,
  tracks: [
    { id: "track1", type: "AudioTrack", name: "Track 1", gainDb: -6, pan: 0 },
  ],
  session: {
    scenes: Array.from({ length: 8 }).map((_, i) => ({ index: i, clips: { track1: null } } satisfies SceneDecl)),
  } satisfies SessionViewDecl,
};

/**
 * Store zustand principal pour la gestion du projet.
 * - Gère l’édition du JSON de projet
 * - Synchronise le graphe audio (reconcileProject)
 * - Synchronise le mixer UI
 * - Gère undo/redo et persistance
 */
export const useProjectStore = create<ProjectStore>((set, get) => {

  function pushHistoryAndSave(next: ProjectDecl) {
    const { project: current, _history } = get();

    set({
      project: next,
      _history: [..._history, current].slice(-50),
      _future: [],
    });

    if (typeof window !== "undefined") saveProject(next).catch(() => { });
  }

  return {
    project: initial,
    _history: [],
    _future: [],

    /**
     * Remplace complètement le projet courant.
     * - pousse l'ancien projet dans l'historique (pour undo)
     * - reconcilie le graphe audio
     * - synchronise le BPM avec le scheduler
     * - synchronise le mixer UI
     * - persiste le projet
     */
    setProject: (proj) => {
      const { project: prev, _history } = get();
      // On garde au maximum 50 états dans l’historique
      const nextHist = [..._history, prev].slice(-50);
      set({ project: proj, _history: nextHist, _future: [] });

      // Met à jour le graphe audio virtuel (création / màj des noeuds, connexions…)
      reconcileProject(proj);

      // Synchroniser le BPM avec le scheduler de transport
      const eng = AudioEngine.ensure();
      const sch = TransportScheduler.ensure();
      if (eng.context) sch.setBpm(proj.bpm ?? 120);

      // Garder l’UI du mixer alignée avec le JSON du projet
      const ui = useMixerStore.getState();
      const mapped = proj.tracks.map((t) => ({
        id: t.id,
        name: t.name ?? t.id,
        gainDb: t.gainDb ?? -6,
        pan: t.pan ?? 0,
        mute: false,
        solo: false,
        sendA: t.sends?.find(({ target }) => target === "A")?.amount ?? 0,
        sendB: t.sends?.find(({ target }) => target === "B")?.amount ?? 0,
      }));

      // Remplacer les pistes UI uniquement si divergence pour limiter les re-renders
      const diverged =
        ui.tracks.length !== mapped.length ||
        ui.tracks.some(
          (x, i) =>
            x.id !== mapped[i]?.id ||
            x.name !== mapped[i]?.name ||
            x.gainDb !== mapped[i]?.gainDb ||
            x.pan !== mapped[i]?.pan
        );

      if (diverged) useMixerStore.setState({ tracks: mapped });

      // Persistance asynchrone (IndexedDB dans le navigateur)
      if (typeof window !== "undefined") saveProject(proj).catch(() => { });
    },

    /**
     * Annule la dernière modification de projet.
     * Déplace l’état courant dans _future (pour un éventuel redo).
     */
    undo: () => {
      const { _history, project, _future } = get();
      if (_history.length === 0) return;
      const prev = _history[_history.length - 1];
      const remaining = _history.slice(0, -1);
      set({ project: prev, _history: remaining, _future: [project, ..._future].slice(0, 50) });
      reconcileProject(prev);
    },

    /**
     * Rétablit (redo) un état annulé précédemment.
     */
    redo: () => {
      const { _future, project, _history } = get();
      if (_future.length === 0) return;
      const nextProj = _future[0];
      const remaining = _future.slice(1);
      set({ project: nextProj, _future: remaining, _history: [..._history, project].slice(-50) });
      reconcileProject(nextProj);
    },

    /** Efface complètement l’historique undo/redo. */
    clearHistory: () => set({ _history: [], _future: [] }),

    /**
     * Met à jour une piste identifiée par son id.
     * - Met à jour le JSON de projet
     * - Met à jour le graphe audio
     * - Répercute les changements dans l’UI du mixer
     * - Persiste le projet
     */
    updateTrack: (id, patch) => {
      const current = get().project;
      const tracks = current.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      const next = { ...current, tracks } as ProjectDecl;
      const { _history } = get();
      set({ project: next, _history: [..._history, current].slice(-50), _future: [] });

      reconcileProject(next);

      // Refléter le changement dans l’UI du mixer
      const ui = useMixerStore.getState();
      useMixerStore.setState({
        tracks: ui.tracks.map((x) =>
          x.id === id
            ? {
              id: x.id,
              name: patch.name !== undefined ? patch.name : x.name,
              gainDb: patch.gainDb !== undefined ? patch.gainDb : x.gainDb,
              pan: patch.pan !== undefined ? patch.pan : x.pan,
              mute: x.mute,
              solo: x.solo,
              // Met à jour les sends si fournis dans le patch, sinon conserve la valeur actuelle
              sendA: Array.isArray(patch.sends)
                ? patch.sends.find((s) => s.target === "A")?.amount ?? (x.sendA ?? 0)
                : x.sendA,
              sendB: Array.isArray(patch.sends)
                ? patch.sends.find((s) => s.target === "B")?.amount ?? (x.sendB ?? 0)
                : x.sendB,
            }
            : x
        ),
      });

      if (typeof window !== "undefined") saveProject(next).catch(() => { });
    },

    /**
     * Ajoute une nouvelle piste audio.
     * - Génère un id simple basé sur le nombre de pistes existantes
     * - Étend la session en ajoutant une cellule de clip pour chaque scène (null par défaut)
     * - Met à jour le graphe audio et le mixer UI
     */
    addTrack: (name) => {
      const current = get().project;
      // Génération d’id simple basée sur le nombre de pistes ; unique tant que la session dure.
      const nextIndex = current.tracks.length + 1;
      const id = `track${nextIndex}`;
      const t = { id, type: "AudioTrack" as const, name: name ?? `Track ${nextIndex}`, gainDb: -6, pan: 0 };

      // Étend les scènes de session avec la nouvelle piste (clips initialisés à null)
      const nextSession: SessionViewDecl | undefined = current.session
        ? {
          scenes: current.session.scenes.map((s) => ({
            ...s,
            clips: { ...s.clips, [id]: null },
          })),
        }
        : undefined;

      const next = { ...current, tracks: [...current.tracks, t], session: nextSession } as ProjectDecl;
      const { _history } = get();
      set({ project: next, _history: [..._history, current].slice(-50), _future: [] });

      // Reconciliation du graphe audio (création des noeuds de piste, etc.)
      reconcileProject(next);

      // Garder le mixer UI synchronisé avec le JSON de projet
      const ui = useMixerStore.getState();
      if (!ui.tracks.some((x) => x.id === id)) {
        useMixerStore.setState({
          tracks: [
            ...ui.tracks,
            { id, name: t.name, gainDb: t.gainDb, pan: t.pan, mute: false, solo: false, sendA: 0, sendB: 0 },
          ],
        });
      }

      if (typeof window !== "undefined") saveProject(next).catch(() => { });
    },

    /**
     * Supprime une piste ainsi que ses clips associés dans toutes les scènes.
     * - Nettoie la session (clips de cette piste)
     * - Met à jour le graphe audio et l’UI du mixer
     */
    removeTrack: (id) => {
      const current = get().project;
      const tracks = current.tracks.filter((t) => t.id !== id);

      const nextSession: SessionViewDecl | undefined = current.session
        ? {
          scenes: current.session.scenes.map((s) => {
            // On filtre les clips pour retirer les entrées de la piste supprimée
            const filtered = Object.fromEntries(
              Object.entries(s.clips).filter(([k]) => k !== id)
            ) as Record<string, ClipDecl | null>;
            return { ...s, clips: filtered };
          }),
        }
        : undefined;

      const next = { ...current, tracks, session: nextSession } as ProjectDecl;
      const { _history } = get();
      set({ project: next, _history: [..._history, current].slice(-50), _future: [] });

      reconcileProject(next);

      // Refléter la suppression dans le mixer UI
      const ui = useMixerStore.getState();
      useMixerStore.setState({ tracks: ui.tracks.filter((x) => x.id !== id) });

      if (typeof window !== "undefined") saveProject(next).catch(() => { });
    },

    /**
     * Crée ou met à jour une piste de retour (A ou B).
     * - Si la piste existe, on la patch
     * - Sinon, on la crée avec un nom par défaut.
     */
    updateReturn: (target, patch) => {
      const current = get().project;
      const existing: TrackDecl[] = Array.isArray(current.returns) ? ([...current.returns] as TrackDecl[]) : [];
      const idx = existing.findIndex(
        (r) => r.id === target || (r.name ?? "").toUpperCase() === target
      );

      if (idx >= 0)
        existing[idx] = { ...existing[idx], id: target, name: existing[idx].name ?? `Return ${target}`, ...patch };
      else existing.push({ id: target, name: `Return ${target}`, type: "AudioTrack", ...patch });

      const next = { ...current, returns: existing } as ProjectDecl;

      reconcileProject(next);
      pushHistoryAndSave(next);
    },

    // ---- Session / Scenes ----

    /**
     * Fixe le nombre de scènes dans la session.
     * - Tronque ou étend la liste des scènes
     * - Copie les clips existants quand possible
     * - Clamps : [1, 64]
     */
    setScenesCount: (count) => {
      const current = get().project;
      const clamped = Math.max(1, Math.min(64, count | 0));
      const trackIds = current.tracks.map((t) => t.id);
      const existing = current.session?.scenes ?? [];

      const scenes: SceneDecl[] = Array.from({ length: clamped }).map((_, idx) => {
        const prev = existing[idx];
        const prevClips = prev?.clips ?? {};
        const clips: Record<string, ClipDecl | null> = {};
        for (const id of trackIds) clips[id] = (prevClips[id] ?? null) as ClipDecl | null;
        return { index: idx, name: prev?.name, color: prev?.color, clips };
      });

      const next: ProjectDecl = { ...current, session: { scenes } };
      pushHistoryAndSave(next);
    },

    /**
     * Assigne un clip (ou null) à une cellule (trackId, sceneIndex).
     */
    setClipAt: (trackId, sceneIndex, clip) => {
      const current = get().project;
      const scenes = (current.session?.scenes ?? []).map((s) =>
        s.index === sceneIndex ? { ...s, clips: { ...s.clips, [trackId]: clip } } : s
      );
      const next: ProjectDecl = { ...current, session: { scenes } };
      pushHistoryAndSave(next);
    },

    /**
     * Lance tous les clips non nuls d’une scène.
     * Délègue maintenant au contrôleur de session.
     */
    launchScene: (sceneIndex) => {
      // On délègue la logique au controller, sans recréer de complexité ici.
      void launchSceneController(sceneIndex);
    },

    /**
     * Lance un clip unique (trackId, sceneIndex).
     * - Utilise la quantification du clip s’il en a une, sinon la globale.
     */
    launchClip: (trackId, sceneIndex) => {
      // Pas besoin d’async ici, on délègue simplement.
      void launchClipController(trackId, sceneIndex);
    },

    /**
     * Crée un clip audio dans une cellule donnée.
     * - Génère un id basé sur piste / scène + random
     * - Assigne sampleUrl et nom optionnel
     */
    createAudioClip: (trackId, sceneIndex, sampleUrl, name) => {
      const current = get().project;
      const id = `clip_${trackId}_${sceneIndex}_${Math.random().toString(36).slice(2, 7)}`;
      const clip: ClipDecl = { id, type: "audio", name, sampleUrl };

      const scenes = (current.session?.scenes ?? []).map((s) =>
        s.index === sceneIndex ? { ...s, clips: { ...s.clips, [trackId]: clip } } : s
      );
      const next: ProjectDecl = { ...current, session: { scenes } };
      pushHistoryAndSave(next);
    },

    /**
     * Crée un clip MIDI avec une liste de notes.
     * - lengthBeats initial à 4 temps (1 mesure en 4/4)
     */
    createMidiClip: (trackId, sceneIndex, notes, name) => {
      // PERF: Injection de notes par défaut pour une piste drum-machine afin d'offrir un retour immédiat.
      let finalNotes = notes;
      if (!finalNotes || finalNotes.length === 0) {
        try {
          const kind = useInstrumentStore.getState().getKind(trackId);
          if (kind === "drum-machine") {
            // const makeId = () => `n_${Math.random().toString(36).slice(2, 9)}`;
            finalNotes = [];
            console.log("Injecting default drum-machine notes:", finalNotes);
          }
        } catch { /* ignore instrument store access erreurs */ }
      }
      const current = get().project;
      const next = createMidiClipReducer(current, trackId, sceneIndex, finalNotes, name);
      pushHistoryAndSave(next);
    },

    /**
     * Met à jour les notes d’un clip MIDI.
     */
    updateMidiClipNotes: (trackId, sceneIndex, notes) => {
      const current = get().project;
      const next = updateMidiClipNotesReducer(current, trackId, sceneIndex, notes);
      pushHistoryAndSave(next);

      // Si le clip (trackId, sceneIndex) est en train de jouer, rafraîchir en live la boucle MIDI
        const playing = useUiStore.getState().playingCells;
        const isThisPlaying = !!playing[`${trackId}:${sceneIndex}`];
        if (isThisPlaying) {
            getSessionPlayer().refreshActiveMidiLoop(trackId, sceneIndex)
        }
    },


    /**
     * Active/désactive la boucle d’un clip (audio ou MIDI).
     * - loop = null : désactive la boucle et retire les propriétés de loop
     * - loop = {start, end} : met à jour loopStart / loopEnd / loop = true
     */
    updateClipLoop: (trackId, sceneIndex, loop) => {
      const current = get().project;
      const next = updateClipLoopReducer(current, trackId, sceneIndex, loop);
      pushHistoryAndSave(next);

      // Si le clip est en lecture, rafraîchir immédiatement la boucle MIDI active (notes / normalisation)
      const playing = useUiStore.getState().playingCells;
      const isThisPlaying = !!playing[`${trackId}:${sceneIndex}`];
      if (isThisPlaying) {

        getSessionPlayer().refreshActiveMidiLoop(trackId, sceneIndex);

      }
    },

    /**
     * Alias pour respecter la spec de l’API (naming différent, même implémentation).
     */
    setMidiClipLoop: (trackId, sceneIndex, loop) => {
      get().updateClipLoop(trackId, sceneIndex, loop);
    },

    /**
     * Définit un offset de départ (en temps, ex: beats ou secondes selon interprétation)
     * pour un clip (utile pour les samples déclenchés au milieu du fichier).
     */
    setClipStartOffset: (trackId: string, sceneIndex: number, startOffset: number) => {
      const current = get().project;
      const next = setClipStartOffsetReducer(current, trackId, sceneIndex, startOffset);
      pushHistoryAndSave(next);
    },

    /**
     * Définit la quantification de lancement propre à un clip.
     * - q : division rythmique (1n, 1/2, 1/4, 1/8, bar, none)
     */
    setClipLaunchQuantization: (trackId: string, sceneIndex: number, q: "1n" | "1/2" | "1/4" | "1/8" | "bar" | "none") => {
      const current = get().project;
      const next = setClipLaunchQuantizationReducer(current, trackId, sceneIndex, q);
      pushHistoryAndSave(next);
    },

    /**
     * Met à jour la longueur (en temps / beats) d’un clip MIDI.
     * - clamp minimum : 1 beat
     */
    updateMidiClipLength: (trackId, sceneIndex, len) => {
      const current = get().project;
      const next = updateMidiClipLengthReducer(current, trackId, sceneIndex, len);
      pushHistoryAndSave(next);
    },

    /**
     * Renomme un clip dans une cellule (trackId, sceneIndex).
     */
    renameClip: (trackId, sceneIndex, name) => {
      const current = get().project;
      const scenes = (current.session?.scenes ?? []).map((s) => {
        if (s.index !== sceneIndex) return s;
        const clip = s.clips[trackId];
        if (!clip) return s;
        const updated: ClipDecl = { ...clip, name };
        return { ...s, clips: { ...s.clips, [trackId]: updated } };
      });

      const next: ProjectDecl = { ...current, session: { scenes } };
      pushHistoryAndSave(next);
    },

    /**
     * Renomme une scène (nom affiché dans la vue Session).
     */
    renameScene: (sceneIndex, name) => {
      const current = get().project;
      const scenes = (current.session?.scenes ?? []).map((s) =>
        s.index === sceneIndex ? { ...s, name } : s
      );
      const next: ProjectDecl = { ...current, session: { scenes } };
      set({ project: next });

      if (typeof window !== "undefined") saveProject(next).catch(() => { });
    },

    /**
     * Définit la couleur d’une scène (par ex. pour colorer les colonnes).
     */
    setSceneColor: (sceneIndex, color) => {
      const current = get().project;
      const scenes = (current.session?.scenes ?? []).map((s) =>
        s.index === sceneIndex ? { ...s, color } : s
      );
      const next: ProjectDecl = { ...current, session: { scenes } };
      set({ project: next });

      if (typeof window !== "undefined") saveProject(next).catch(() => { });
    },

    /**
     * Duplique une scène (copie superficielle des clips).
     * - Insère la copie juste après la scène source
     * - Réindexe toutes les scènes pour que index = position dans le tableau
     */
    duplicateScene: (sceneIndex) => {
      const current = get().project;
      const scenes = current.session?.scenes ?? [];
      const src = scenes[sceneIndex];
      if (!src) return;

      const copy = { ...src, index: src.index + 1, clips: { ...src.clips } };
      const nextScenes = scenes
        .slice(0, sceneIndex + 1)
        .concat(copy, scenes.slice(sceneIndex + 1))
        .map((s, i) => ({ ...s, index: i }));

      const next: ProjectDecl = { ...current, session: { scenes: nextScenes } };
      set({ project: next });

      if (typeof window !== "undefined") saveProject(next).catch(() => { });
    },
  }
});