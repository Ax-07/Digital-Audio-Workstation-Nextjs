// src/lib/stores/mixer.store.ts

// Remarque :
// mixer.store.ts — 🟠 état UI + persistance projet + moteur audio
// Ici aussi tu as un mélange de responsabilités :
// UI du mixer (tracks, gain, pan, mute, solo, sends) ✅
// Contrôle direct du moteur audio : MixerCore.ensure(), setGainDb, setPan, setMute, setSolo, setSendAmount ⚙️
// Et persistance dans ProjectStore pour les sends (setTrackSendA/B → useProjectStore.getState().updateTrack(...)) 💾
// Donc ce store :
// est à la fois store UI,
// facade sur MixerCore,
// et proxy d’écriture sur le JSON de projet.
// Ce n’est pas forcément faux (c’est ton “mixer layer”), mais si tu cherches une séparation plus claire :
// Le lien avec MixerCore pourrait être dans un service audio,
// Et la persistance dans le projet (updateTrack) pourrait être gérée par :
// des actions dans ProjectStore déclenchées ailleurs, ou
// une couche “commandes” qui utilise à la fois useMixerStore et useProjectStore.
// En plus, tu as ici une dépendance croisée :
// project.store.ts importe useMixerStore
// mixer.store.ts importe useProjectStore
// Ça marche, mais c’est fragile (risques de cycles/ordre d’init).

import { create } from "zustand/react";
import { useProjectStore } from "@/features/daw/state/project.store";
import { MixerCore } from "@/core/audio-engine/core/mixer/mixer";

/**
 * Représentation d’une piste côté UI (mixer).
 * Cette structure est volontairement “flat” et découplée du JSON de projet.
 */
export type UiTrack = {
  id: string;
  name: string;
  gainDb: number; // -60..+6
  pan: number;   // -1..1
  mute: boolean;
  solo: boolean;
  sendA?: number; // 0..1 (envoi vers Return A)
  sendB?: number; // 0..1 (envoi vers Return B)
};

/**
 * État interne du mixer.
 * - tracks : liste de pistes affichées dans le mixer UI
 */
type MixerState = {
  tracks: UiTrack[];
};

/**
 * Actions disponibles sur le mixer :
 * - ajout de piste UI
 * - mise à jour gain / pan / mute / solo
 * - envois vers les retours A/B
 *
 * Chaque action :
 * 1) met à jour l’état UI (zustand)
 * 2) synchronise MixerCore (moteur audio temps réel)
 * 3) pour les sends : persiste aussi dans le ProjectStore
 */
type MixerActions = {
  addTrack: (name?: string) => void;
  setTrackGainDb: (id: string, db: number) => void;
  setTrackPan: (id: string, pan: number) => void;
  setTrackMute: (id: string, muted: boolean) => void;
  toggleTrackMute: (id: string) => void;
  setTrackSolo: (id: string, solo: boolean) => void;
  toggleTrackSolo: (id: string) => void;
  setTrackSendA: (id: string, amount: number) => void;
  setTrackSendB: (id: string, amount: number) => void;
};

export type MixerStore = MixerState & MixerActions;

/**
 * Compteur simple pour générer des id de pistes UI
 * (note : les ids “réels” côté projet peuvent suivre une autre logique).
 */
let nextId = 1;

/**
 * Store zustand pour le mixer :
 * - gère uniquement l’état UI des pistes (faders, mutes, sends, etc.)
 * - délègue l’audio à MixerCore
 * - persiste les sends dans le JSON de projet via useProjectStore
 */
export const useMixerStore = create<MixerStore>((set, get) => ({
  // État initial minimal : une piste par défaut
  tracks: [{ id: "track1", name: "Track 1", gainDb: -6, pan: 0, mute: false, solo: false, sendA: 0, sendB: 0 }],

  /**
   * addTrack(name?)
   * ----------------
   * Source unique de création de piste : délègue entièrement au ProjectStore,
   * qui met à jour le JSON du projet, reconcilie le graphe audio et synchronise
   * ensuite le mixer UI. Évite toute divergence track UI ↔ project JSON.
   */
  addTrack: (name) => {
    // Utiliser l’action centrale du ProjectStore
    try {
      const ps = useProjectStore.getState();
      ps.addTrack(name);
    } catch {
      // Fallback (dev/hot-reload) : création locale minimale si le ProjectStore est indisponible.
      const id = `track${++nextId}`;
      const t: UiTrack = { id, name: name ?? `Track ${nextId}`, gainDb: -6, pan: 0, mute: false, solo: false, sendA: 0, sendB: 0 };
      set({ tracks: [...get().tracks, t] });
      const mixer = MixerCore.ensure();
      mixer.ensureTrack(id);
      mixer.setGainDb(id, t.gainDb);
      mixer.setPan(id, t.pan);
    }
  },

  /**
   * Définit le gain d’une piste en dB.
   * - Met à jour l’UI
   * - Applique immédiatement sur MixerCore
   */
  setTrackGainDb: (id, db) => {
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, gainDb: db } : x)) });
    const mixer = MixerCore.ensure();
    mixer.ensureTrack(id);
    mixer.setGainDb(id, db);
  },

  /**
   * Définit le pan d’une piste (-1..1).
   * On clamp la valeur pour éviter des dépassements.
   */
  setTrackPan: (id, pan) => {
    const p = Math.max(-1, Math.min(1, pan));
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, pan: p } : x)) });
    const mixer = MixerCore.ensure();
    mixer.ensureTrack(id);
    mixer.setPan(id, p);
  },

  /**
   * Définit l’état de mute d’une piste (muted = true/false).
   */
  setTrackMute: (id, muted) => {
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, mute: muted } : x)) });
    const mixer = MixerCore.ensure();
    mixer.ensureTrack(id);
    mixer.setMute(id, muted);
  },

  /**
   * Bascule l’état de mute d’une piste.
   */
  toggleTrackMute: (id) => {
    const cur = get().tracks.find((t) => t.id === id)?.mute ?? false;
    const muted = !cur;
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, mute: muted } : x)) });
    const mixer = MixerCore.ensure();
    mixer.ensureTrack(id);
    mixer.setMute(id, muted);
  },

  /**
   * Définit l’état de solo d’une piste.
   * Le routage “solo logique” (muter les autres, etc.) est géré dans MixerCore.
   */
  setTrackSolo: (id, solo) => {
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, solo } : x)) });
    const mixer = MixerCore.ensure();
    mixer.ensureTrack(id);
    mixer.setSolo(id, solo);
  },

  /**
   * Bascule l’état de solo d’une piste.
   */
  toggleTrackSolo: (id) => {
    const cur = get().tracks.find((t) => t.id === id)?.solo ?? false;
    const solo = !cur;
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, solo } : x)) });
    const mixer = MixerCore.ensure();
    mixer.ensureTrack(id);
    mixer.setSolo(id, solo);
  },

  /**
   * Définit la valeur d’envoi vers le retour A (0..1).
   * - Met à jour l’UI
   * - Envoie la valeur à MixerCore
   * - Persiste la valeur dans le ProjectStore (sends A)
   */
  setTrackSendA: (id, amount) => {
    const a = Math.max(0, Math.min(1, amount));
    // Mise à jour UI
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, sendA: a } : x)) });

    // Mise à jour moteur audio
    const mixer = MixerCore.ensure();
    mixer.setSendAmount(id, "A", a);

    // Persistance dans le JSON de projet (sends[])
    try {
      const proj = useProjectStore.getState().project;
      const track = proj.tracks.find((t) => t.id === id);
      const existing = Array.isArray(track?.sends) ? [...(track!.sends!)] : [];
      const idx = existing.findIndex(({ target }) => target === "A");
      if (idx >= 0) existing[idx] = { ...existing[idx], amount: a };
      else existing.push({ target: "A", amount: a });
      useProjectStore.getState().updateTrack(id, { sends: existing });
    } catch {
      /* en cas d’erreur (store non dispo, etc.) on ignore silencieusement */
    }
  },

  /**
   * Définit la valeur d’envoi vers le retour B (0..1).
   * Même logique que setTrackSendA mais pour le bus B.
   */
  setTrackSendB: (id, amount) => {
    const a = Math.max(0, Math.min(1, amount));
    // Mise à jour UI
    set({ tracks: get().tracks.map((x) => (x.id === id ? { ...x, sendB: a } : x)) });

    // Mise à jour moteur audio
    const mixer = MixerCore.ensure();
    mixer.setSendAmount(id, "B", a);

    // Persistance dans le JSON de projet (sends[])
    try {
      const proj = useProjectStore.getState().project;
      const track = proj.tracks.find((t) => t.id === id);
      const existing = Array.isArray(track?.sends) ? [...(track!.sends!)] : [];
      const idx = existing.findIndex(({ target }) => target === "B");
      if (idx >= 0) existing[idx] = { ...existing[idx], amount: a };
      else existing.push({ target: "B", amount: a });
      useProjectStore.getState().updateTrack(id, { sends: existing });
    } catch {
      /* no-op en cas de problème de synchro avec le ProjectStore */
    }
  },
}));
