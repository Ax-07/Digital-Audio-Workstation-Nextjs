// src/lib/stores/dual-synth.store.ts

import { create } from "zustand/react";
import type { DualSynthParams, EnvelopeMod } from "@/lib/audio/sources/dual-osc-synth";
import { normalizeEnvelope } from "@/lib/audio/envelopes/generic-envelope";

export type DualSynthState = {
  byTrack: Readonly<Record<string, Required<DualSynthParams>>>;
};

export type DualSynthActions = {
  getParams: (trackId: string) => Required<DualSynthParams>;
  setParams: (trackId: string, params: Partial<DualSynthParams>) => void;
  resetParams: (trackId: string) => void;
};

export type DualSynthStore = DualSynthState & DualSynthActions;

const DEFAULT: Required<DualSynthParams> = {
  waveformA: "sawtooth",
  waveformB: "square",
  mix: 0.5,
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
          { t: 0.08, value: 1, curve: "exp" },
          { t: 0.9, value: 0.7, curve: "linear" },
          { t: 1, value: 0, curve: "log" },
        ],
      },
    },
  ],
  ampEnv: {
    totalMs: 500,
    points: [
      { t: 0, value: 0, curve: "linear" },
      { t: 0.08, value: 1, curve: "exp" },
      { t: 0.9, value: 0.7, curve: "linear" },
      { t: 1, value: 0, curve: "log" },
    ],
  },
};

export const useDualSynthStore = create<DualSynthStore>((set, get) => ({
  byTrack: {},
  getParams: (trackId) => get().byTrack[trackId] ?? DEFAULT,
  setParams: (trackId, params) =>
    set((state) => {
      const prev = state.byTrack[trackId] ?? DEFAULT;
      const next: Required<DualSynthParams> = {
        waveformA: params.waveformA ?? prev.waveformA,
        waveformB: params.waveformB ?? prev.waveformB,
        mix: params.mix ?? prev.mix,
        detuneCents: params.detuneCents ?? prev.detuneCents,
        maxVoices: params.maxVoices ?? prev.maxVoices,
        envTarget: params.envTarget ?? prev.envTarget,
        envDetuneDepth: params.envDetuneDepth ?? prev.envDetuneDepth,
        envs: params.envs
          ? params.envs.map((m, i): EnvelopeMod => ({
              id: m.id || `env-${i}`,
              // compat: "detune" => "detuneB"
              target: (m.target === "detune" ? "detuneB" : m.target) as EnvelopeMod["target"],
              enabled: m.enabled !== false,
              depthCents: m.depthCents ?? 0,
              depthMix: m.depthMix ?? 0,
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
  resetParams: (trackId) => set((s) => ({ byTrack: { ...s.byTrack, [trackId]: DEFAULT } })),
}));
