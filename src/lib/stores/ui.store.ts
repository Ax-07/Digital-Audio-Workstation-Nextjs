// src/lib/stores/ui.store.ts

import { create } from "zustand/react";

/**
 * UiState
 * -------
 * État global UI (Zustand) pour la vue type "clip launcher" / "session".
 *
 * Contient :
 * - sélection de piste / clip
 * - mode de vue (session / arrangement)
 * - onglet bas (clip / device / mixer)
 * - état des cellules en file d’attente, en lecture, ou planifiées
 * - options de lancement (quantization, mode legato/retrigger)
 * - état de pré-chargement (preload) des samples
 */
export type UiState = {
  selectedTrackId: string | null;
  viewMode: "session" | "arrangement";
  bottomTab: "clip" | "device" | "mixer";

  // Sélection de clip dans l’éditeur (grille Session)
  selectedClip: { trackId: string; sceneIndex: number } | null;

  // État de queue transitoire pour les cellules Session :
  // clé = `${trackId}:${sceneIndex}` → true si la cellule est en file d’attente de lancement
  queuedCells: Readonly<Record<string, boolean>>;

  // État de lecture (playing) pour les cellules Session :
  // clé = `${trackId}:${sceneIndex}` → true si la cellule est en cours de lecture
  playingCells: Readonly<Record<string, boolean>>;

  // Lancements planifiés dans le futur (en secondes AudioContext.currentTime) par cellule
  // clé = `${trackId}:${sceneIndex}` → timestamp de start prévu
  scheduledCells: Readonly<Record<string, number>>;

  // Si true : on vide la queue après un lancement (comportement type "fire & clear")
  clearQueueOnLaunch: boolean;

  // Si true : lancer automatiquement le transport quand on lance une scène/clip (si à l’arrêt)
  autoStartOnLaunch: boolean;

  // État de préchargement (samples, project, etc.)
  preload: {
    active: boolean;
    total: number;
    loaded: number;
    errors: number;
  };

  // Quantification globale de lancement (fallback / valeur par défaut)
  launchQuantize:
    | "none"
    | "bar"
    | "beat"
    | "1/2"
    | "1/4"
    | "1/8"
    | "1/16"
    | "1n";

  // Mode de lancement :
  // - 'retrigger' : le clip repart du début à chaque launch
  // - 'legato'    : le clip suit la phase de lecture (boucles MIDI)
  launchMode: "retrigger" | "legato";
};

/**
 * UiActions
 * ---------
 * Ensemble des actions/modificateurs sur l’UiState.
 * Toutes les mutations UI (sélection, queue, play, preload…) passent par ici.
 */
export type UiActions = {
  setSelectedTrack: (id: string | null) => void;
  setViewMode: (mode: UiState["viewMode"]) => void;
  setBottomTab: (tab: UiState["bottomTab"]) => void;

  // Clip editor
  openClipEditor: (trackId: string, sceneIndex: number) => void;
  closeClipEditor: () => void;

  // Queue / Session
  toggleQueueCell: (trackId: string, sceneIndex: number) => void;
  clearQueue: () => void;
  clearSceneQueue: (sceneIndex: number) => void;

  // Lecture / planification
  setTrackPlaying: (trackId: string, sceneIndex: number | null) => void;
  setTrackScheduled: (
    trackId: string,
    sceneIndex: number | null,
    whenCtxSec: number
  ) => void;
  clearPlaying: () => void;
  clearScheduled: () => void;

  // Préférences de lancement
  setClearQueueOnLaunch: (v: boolean) => void;
  setAutoStartOnLaunch: (v: boolean) => void;

  // Preload (progression)
  setPreloadBegin: (total: number) => void;
  setPreloadIncrement: (ok: boolean) => void;
  setPreloadDone: () => void;

  // Paramètres globaux de lancement
  setLaunchQuantize: (q: UiState["launchQuantize"]) => void;
  setLaunchMode: (m: UiState["launchMode"]) => void;
};

export type UiStore = UiState & UiActions;

/**
 * Store UI principal (Zustand).
 * Centralise :
 * - la navigation (viewMode, bottomTab)
 * - la sélection (piste, clip)
 * - l’état des cellules (queued / playing / scheduled)
 * - les options de lancement (quantize, mode)
 * - l’état de préchargement (preload)
 */
export const useUiStore = create<UiStore>((set) => ({
  // Piste sélectionnée dans la UI (null = aucune)
  selectedTrackId: null,

  // Mode de vue par défaut : Session (grille de clips)
  viewMode: "session",

  // Onglet inférieur par défaut : device (FX / instruments)
  bottomTab: "device",

  // Aucun clip sélectionné au départ
  selectedClip: null,

  // Aucun état de queue / playing / scheduled au démarrage
  queuedCells: {},
  playingCells: {},
  scheduledCells: {},

  clearQueueOnLaunch: true,
  autoStartOnLaunch: true,

  // État de préload initial : inactif
  preload: { active: false, total: 0, loaded: 0, errors: 0 },

  // Quantization globale de lancement par défaut : bar
  launchQuantize: "bar",

  // Mode de lancement par défaut : retrigger
  launchMode: "retrigger",

  // --- Actions basiques de sélection / navigation ---

  setSelectedTrack: (id) => set({ selectedTrackId: id }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setBottomTab: (tab) => set({ bottomTab: tab }),

  openClipEditor: (trackId, sceneIndex) =>
    set({ selectedClip: { trackId, sceneIndex }, bottomTab: "clip" }),

  closeClipEditor: () => set({ selectedClip: null }),

  // --- File d’attente (queue) des cellules ---

  toggleQueueCell: (trackId, sceneIndex) =>
    set((s) => {
      const key = `${trackId}:${sceneIndex}`;
      const prev = !!s.queuedCells[key];
      return { queuedCells: { ...s.queuedCells, [key]: !prev } };
    }),

  clearQueue: () => set({ queuedCells: {} }),

  // Efface la queue uniquement pour une scène donnée (une ligne de la grille)
  clearSceneQueue: (sceneIndex) =>
    set((s) => {
      const next: Record<string, boolean> = {};
      const suffix = `:${sceneIndex}`;
      for (const [k, v] of Object.entries(s.queuedCells)) {
        if (!k.endsWith(suffix)) next[k] = v;
      }
      return { queuedCells: next };
    }),

  // --- Lecture / Playing state ---

  /**
   * Met à jour l’état "playing" pour une piste :
   * - efface toute cellule en cours de lecture pour cette piste
   * - si sceneIndex != null → marque trackId:sceneIndex comme playing
   */
  setTrackPlaying: (trackId, sceneIndex) =>
    set((s) => {
      const next: Record<string, boolean> = {};

      // On efface les anciennes cellules "playing" pour cette piste,
      // mais on conserve les autres pistes.
      for (const [k, v] of Object.entries(s.playingCells)) {
        if (!k.startsWith(`${trackId}:`)) next[k] = v;
      }

      if (sceneIndex != null) {
        next[`${trackId}:${sceneIndex}`] = true;
      }

      return { playingCells: next };
    }),

  /**
   * Enregistre un lancement planifié pour une piste :
   * - efface les entrées programmées précédentes de cette piste
   * - assigne trackId:sceneIndex → whenCtxSec
   */
  setTrackScheduled: (trackId, sceneIndex, whenCtxSec) =>
    set((s) => {
      const next: Record<string, number> = { ...s.scheduledCells };

      // Supprimer les entrées précédentes pour cette piste,
      // sauf éventuellement la nouvelle cellule ciblée.
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${trackId}:`) && k !== `${trackId}:${sceneIndex}`) {
          delete next[k];
        }
      }

      if (sceneIndex != null) next[`${trackId}:${sceneIndex}`] = whenCtxSec;

      return { scheduledCells: next };
    }),

  clearPlaying: () => set({ playingCells: {} }),
  clearScheduled: () => set({ scheduledCells: {} }),

  // --- Options de comportement ---

  setClearQueueOnLaunch: (v) => set({ clearQueueOnLaunch: v }),
  setAutoStartOnLaunch: (v) => set({ autoStartOnLaunch: v }),

  // --- Gestion du préchargement (preload) ---

  /**
   * Début du préload :
   * - active = true
   * - total = nombre d’éléments à charger
   * - loaded / errors remis à 0
   */
  setPreloadBegin: (total) =>
    set({ preload: { active: true, total, loaded: 0, errors: 0 } }),

  /**
   * Incrément de progression :
   * - ok = true   → loaded++
   * - ok = false  → errors++
   */
  setPreloadIncrement: (ok) =>
    set((s) => ({
      preload: {
        active: true,
        total: s.preload.total,
        loaded: s.preload.loaded + (ok ? 1 : 0),
        errors: s.preload.errors + (ok ? 0 : 1),
      },
    })),

  /**
   * Fin du préload :
   * - on conserve les compteurs total/loaded/errors
   * - on passe juste active à false
   */
  setPreloadDone: () =>
    set((s) => ({ preload: { ...s.preload, active: false } })),

  // --- Paramètres globaux de lancement ---

  setLaunchQuantize: (q) => set({ launchQuantize: q }),
  setLaunchMode: (m) => set({ launchMode: m }),
}));
