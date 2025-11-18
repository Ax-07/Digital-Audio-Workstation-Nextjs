// src/lib/stores/transport.store.ts

// Remarque: 
// transport.store.ts — 🟠 un store + un orchestrateur
// Là on commence à dépasser le simple “store” :
// Gère l’état du transport (bpm, isPlaying, bar/beat/tick…) ✅
// Mais aussi :
// Initialise / reprend / suspend AudioEngine
// Crée des pistes dans MixerCore
// Réconcilie le projet (reconcileProject indirectement via play)
// Lance TransportScheduler
// Démarre et prime SessionPlayer
// Synchronise le BPM dans ProjectStore
// Donc ce store :
// contient à la fois l’état et la logique d’orchestration runtime (moteur audio, scheduler, mixer, session).
// 👉 Si tu veux respecter le SRP :
// Garde ici uniquement l’état + intent haut niveau (play/stop, bpm…)
// Déplace la logique lourde (AudioEngine.ensure, MixerCore.ensureTrack, SessionPlayer.start/prime, reconcileProject, etc.) dans :
// un module transport-controller.ts, ou
// des hooks (genre useTransportController()), ou
// un service côté audio.
// Aujourd’hui, useTransportStore est plus un “facade audio runtime” qu’un simple store.

import { create } from "zustand/react";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import { MixerCore } from "@/lib/audio/core/mixer";
import { useProjectStore } from "@/lib/stores/project.store";
import { getSessionPlayer } from "@/lib/audio/core/session-player-refactored";

/**
 * État du transport global :
 * - bpm          : tempo actuel
 * - isPlaying    : lecture en cours ou non
 * - positionSec  : placeholder pour la position (sera remplacé par bar/beat/tick)
 * - bar / beat / tick : position musicale courante remontée par le TransportScheduler
 */
type TransportState = {
  bpm: number;
  isPlaying: boolean;
  positionSec: number; // placeholder tant qu’on n’expose pas directement bar/beat/tick côté scheduler
  bar: number;
  beat: number;
  tick: number;
};

/**
 * Actions disponibles sur le transport :
 * - setBpm            : change le tempo (et synchronise scheduler + projet)
 * - play / stop       : contrôle de la lecture globale
 */
type TransportActions = {
  setBpm: (bpm: number) => void;
  play: () => Promise<void>;
  stop: () => Promise<void>;
};

export type TransportStore = TransportState & TransportActions;

// Subscription globale pour la position du TransportScheduler (éviter de l’empiler à chaque play)
let _transportSub: (() => void) | null = null;

// Micro-debounce pour l'application du BPM côté scheduler/projet
let _lastBpmApplyTs = 0;
let _lastAppliedBpm = 120;

/**
 * Store Zustand du transport
 * --------------------------
 * Coordonne :
 * - AudioEngine (init / resume / suspend)
 * - MixerCore (création des chaînes de pistes)
 * - TransportScheduler (ticks / BPM / position)
 * - SessionPlayer (lecture des clips)
 * - ProjectStore (synchronisation du BPM dans le JSON)
 */
export const useTransportStore = create<TransportStore>((set, get) => ({
  bpm: 120,
  isPlaying: false,
  positionSec: 0,
  bar: 1,
  beat: 1,
  tick: 0,

  /**
   * setBpm(bpm)
   * -----------
   * Met à jour le tempo :
   * - clamp la valeur pour éviter les extrêmes absurdes
   * - met à jour le state UI
   * - pousse le BPM dans le TransportScheduler
   * - synchronise le champ bpm dans le Project JSON
   */
  setBpm: (bpm) => {
    const clamped = Math.max(40, Math.min(300, bpm || 0));
    set({ bpm: clamped });
    // Appliquer au plus à ~30 Hz, ou si variation significative (>= 0.01 BPM)
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const elapsed = now - _lastBpmApplyTs;
    const significant = Math.abs(clamped - _lastAppliedBpm) >= 0.01;
    if (elapsed >= 33 || significant || _lastBpmApplyTs === 0) {
      // Mettre à jour le scheduler si déjà initialisé
      const sch = TransportScheduler.ensure();
      sch.setBpm(clamped);

      // Pousser le BPM dans le projet pour qu’il soit persistant
      try {
        const st = useProjectStore.getState();
        const proj = st.project;
        st.setProject({ ...proj, bpm: clamped });
      } catch {
        // En SSR ou si le store projet n’est pas prêt, on ignore
      }

      _lastBpmApplyTs = now;
      _lastAppliedBpm = clamped;
    }
  },

  /**
   * play()
   * ------
   * Lance la lecture :
   * - initialise / reprend l’AudioEngine
   * - s’assure que les chaînes de mix sont créées
   * - réconcilie le projet courant avec le graphe audio
   * - initialise + lance le TransportScheduler
   * - s’abonne aux updates de position (bar/beat/tick) pour le store UI
   * - démarre le SessionPlayer et précharge les clips audio
   */
  play: async () => {
    if (get().isPlaying) return;

    const engine = AudioEngine.ensure();
    await engine.init();
    await engine.resume();

    // S’assurer qu’au moins une piste existe dans le Mixer (MVP : track1)
    const mixer = MixerCore.ensure();
    mixer.ensureTrack("track1");

    // Récupérer le projet courant
    const proj = useProjectStore.getState().project;

    // Réconcilier le projet JSON avec le graphe audio (création de pistes, FX, sends, etc.)
    try {
      const { reconcileProject } = await import("@/lib/audio/core/virtual-graph");
      reconcileProject(proj);
    } catch {
      // Si le module n’est pas dispo (build SSR, etc.), on fail-silent
    }

    // Initialiser et lancer le scheduler
    const sch = TransportScheduler.ensure();
    if (engine.context) {
      await sch.init(engine.context);
      sch.setBpm(proj.bpm ?? get().bpm);
      sch.reset();
      sch.start();

      // Nettoyer un éventuel abonnement précédent
      if (_transportSub) {
        try {
          _transportSub();
        } catch {}
        _transportSub = null;
      }

      // S’abonner à la position du transport :
      // on limite les updates pour ne pas spammer React (une update tous les 2 ticks)
      _transportSub = sch.subscribe((p) => {
        if (p.tick % 2 === 0) {
          set({ bar: p.bar, beat: p.beat, tick: p.tick });
        }
      });
    }

    set({ isPlaying: true });

    // Démarrer le SessionPlayer et précharger les samples
    try {
      const sp = getSessionPlayer();
      sp.start();
      await sp.prime();
    } catch {
      // Pas bloquant si le SessionPlayer n’est pas prêt
    }
    // positionSec reste un placeholder pour l’instant : bar/beat/tick vient direct du scheduler.
  },

  /**
   * stop()
   * ------
   * Arrête la lecture :
   * - stoppe le TransportScheduler
   * - stoppe tous les clips via SessionPlayer
   * - suspend l’AudioEngine
   */
  stop: async () => {
    const engine = AudioEngine.ensure();

    // Arrêt du scheduler avant de suspendre le moteur audio
    TransportScheduler.ensure().stop();

    // Désabonnement de la position si on en avait un
    if (_transportSub) {
      try {
        _transportSub();
      } catch {}
      _transportSub = null;
    }

    // Stop complet des clips/session
    try {
      getSessionPlayer().stopAll();
    } catch {}

    await engine.suspend();
    set({ isPlaying: false });
  },
}));
