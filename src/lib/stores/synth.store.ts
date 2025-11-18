// src/lib/stores/synth.store.ts

import { create } from "zustand/react";
import type { SimpleSynthParams } from "@/lib/audio/sources/simple-synth";
import { normalizeEnvelope } from "@/lib/audio/envelopes/generic-envelope";

/**
 * SynthState
 * ----------
 * Stocke les paramètres de synthèse (SimpleSynth) par piste.
 *
 * Structure :
 * - byTrack : dictionnaire immuable { [trackId]: paramètres du synthé }
 *
 * Note : chaque piste peut posséder son propre ensemble de paramètres,
 * sinon on retombe sur les valeurs DEFAULT.
 */
export type SynthState = {
  byTrack: Readonly<Record<string, Required<SimpleSynthParams>>>;
};

/**
 * SynthActions
 * ------------
 * - getParams : récupère les paramètres pour une piste (retourne DEFAULT si absent)
 * - setParams : met à jour partiellement les paramètres d’une piste
 * - resetParams : réinitialise aux valeurs DEFAULT
 */
export type SynthActions = {
  getParams: (trackId: string) => Required<SimpleSynthParams>;
  setParams: (trackId: string, params: Partial<SimpleSynthParams>) => void;
  resetParams: (trackId: string) => void;
};

export type SynthStore = SynthState & SynthActions;

/**
 * Valeurs par défaut du synthé :
 * Enveloppes génériques uniquement, sawtooth, pas de detune, polyphonie 16 voix.
 */
const DEFAULT: Required<SimpleSynthParams> = {
  waveform: "sawtooth",
  detuneCents: 0,
  maxVoices: 16,
  envTarget: "amp",
  envDetuneDepth: 0,
  envs: [
    {
      id: "env-amp-1",
      target: "amp",
      enabled: true,
      name: "Amp",
      group: "Amp",
      macro: "",
      depthCents: 0,
      envelope: {
        totalMs: 500,
        points: [
          { t: 0, value: 0, curve: "linear" },
          { t: 0.1, value: 1, curve: "linear" },
          { t: 0.9, value: 1, curve: "linear" },
          { t: 1, value: 0, curve: "linear" },
        ],
      },
    },
  ],
  ampEnv: {
    totalMs: 500,
    points: [
      { t: 0, value: 0, curve: "linear" },
      { t: 0.1, value: 1, curve: "linear" },
      { t: 0.9, value: 1, curve: "linear" },
      { t: 1, value: 0, curve: "linear" },
    ],
  }
};

/**
 * Store Zustand du SimpleSynth
 * ----------------------------
 * Contient les paramètres par piste.
 *
 * Conception :
 * - pas d’effet secondaire, uniquement état UI
 * - les nodes audio sont configurés ailleurs (SessionPlayer / MidiTrack)
 * - ici on gère uniquement des valeurs "pures" de synthèse
 */
export const useSynthStore = create<SynthStore>((set, get) => ({
  // Pas de paramètres spécifiques au départ → fallback sur DEFAULT
  byTrack: {},

  /**
   * getParams(trackId)
   * Renvoie les paramètres de la piste, ou DEFAULT si la piste n’a pas encore de configuration.
   */
  getParams: (trackId) => {
    const s = get().byTrack[trackId];
    return s ? s : DEFAULT;
  },

  /**
   * setParams(trackId, params)
   * Mise à jour *partielle* des paramètres d’une piste :
   * - on fusionne les valeurs existantes avec les nouvelles
   * - les champs non fournis restent inchangés
   */
  setParams: (trackId, params) =>
    set((state) => {
      const prev = state.byTrack[trackId] ?? DEFAULT;
      const next: Required<SimpleSynthParams> = {
        waveform: params.waveform ?? prev.waveform,
        detuneCents: params.detuneCents ?? prev.detuneCents,
        maxVoices: params.maxVoices ?? prev.maxVoices,
        envTarget: params.envTarget ?? prev.envTarget,
        envDetuneDepth: params.envDetuneDepth ?? prev.envDetuneDepth,
        envs: params.envs
          ? params.envs.map((m, i) => ({
              id: m.id || `env-${i}`,
              target: m.target,
              enabled: m.enabled !== false,
              depthCents: m.depthCents ?? 0,
              name: m.name ?? `Env ${i + 1}`,
              group: m.group,
              macro: m.macro,
              envelope: normalizeEnvelope(m.envelope),
            }))
          : prev.envs,
        ampEnv: params.ampEnv ? normalizeEnvelope(params.ampEnv) : prev.ampEnv,
      };
      return { byTrack: { ...state.byTrack, [trackId]: next } };
    }),

  /**
   * resetParams(trackId)
   * Réinitialise une piste aux valeurs par défaut.
   */
  resetParams: (trackId) =>
    set((state) => {
      const next = { ...state.byTrack } as Record<
        string,
        Required<SimpleSynthParams>
      >;
      next[trackId] = DEFAULT;
      return { byTrack: next };
    }),
}));
