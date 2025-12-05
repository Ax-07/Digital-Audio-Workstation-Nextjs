// src/lib/stores/instrument.store.ts

import { InstrumentKind } from "@/core/audio-engine/types";
import { create } from "zustand/react";

/**
 * État d’association piste → instrument.
 * `byTrack` est un mapping `trackId → InstrumentKind`.
 */
export type InstrumentState = {
  byTrack: Readonly<Record<string, InstrumentKind>>;
};

/**
 * Actions disponibles :
 * - getKind(trackId) : renvoie l’instrument de la piste, ou un défaut
 * - setKind(trackId, kind) : assigne un instrument à une piste
 *
 * Ce store ne modifie pas le ProjectStore
 * (les instruments sont un choix purement UI/audio-runtime).
 */
export type InstrumentActions = {
  getKind: (trackId: string) => InstrumentKind;
  setKind: (trackId: string, kind: InstrumentKind) => void;
};

/** Store complet : état + actions */
export type InstrumentStore = InstrumentState & InstrumentActions;

/**
 * Store Zustand pour la gestion des instruments.
 *
 * - `byTrack` contient un dictionnaire clé/valeur :
 *    trackId → instrument sélectionné.
 *
 * - `getKind(trackId)` renvoie l’instrument de la piste.
 *   Si aucun instrument n’est défini, on retourne "simple-synth"
 *   (instrument par défaut).
 *
 * - `setKind(trackId, kind)` met à jour le type d’instrument pour une piste.
 *
 * Ce store est volontairement indépendant du ProjectStore
 * afin que le choix de l’instrument n’affecte pas la sauvegarde du projet.
 */
export const useInstrumentStore = create<InstrumentStore>((set, get) => ({
  /** Mapping piste → instrument */
  byTrack: {},

  /**
   * Retourne le type d’instrument d’une piste.
   * Si la piste ne possède pas encore d’instrument enregistré,
   * on utilise "simple-synth" comme valeur par défaut.
   */
  getKind: (trackId) => get().byTrack[trackId] ?? "simple-synth",

  /**
   * Définit le type d’instrument pour une piste.
   * - crée l’entrée si elle n’existe pas
   * - remplace la valeur sinon
   */
  setKind: (trackId, kind) =>
    set((s) => ({
      byTrack: { ...s.byTrack, [trackId]: kind },
    })),
}));
