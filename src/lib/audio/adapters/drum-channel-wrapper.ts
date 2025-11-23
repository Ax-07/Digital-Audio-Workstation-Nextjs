// src/lib/audio/adapters/drum-channel-wrapper.ts
// Pont de migration progressif pour DrumMachine → TrackAudioChannel.
// Fournit une API unifiée pour l'UI quelle que soit la version (legacy vs routing v2).
// PERF: aucune allocation dans les méthodes, seulement dans createAdapter.

import { MixerCore } from "@/lib/audio/core/mixer";
import { drumMachine } from "@/lib/audio/sources/drums/drum-machine/drum-machine";
import { isTrackChannelV2EnabledFor } from "@/lib/audio/core/feature-flags";
import type { FxDecl } from "@/lib/audio/types";

// Représentation minimale des effets legacy DrumMachine (AudioEffect) pour transition.
// On ne tente PAS de conversion complète → FxDecl (types non homogènes). Placeholder.
export type LegacyDrumEffect = {
  input: AudioNode;
  output: AudioNode;
  update?: (params: Record<string, unknown>) => void;
  disconnect?: () => void;
  dispose?: () => void;
  bypass?: boolean;
  kind?: string; // hint facultatif
};

export interface DrumChannelAdapter {
  readonly trackId: string;
  setVolumeDb(db: number): void;
  setPan(pan: number): void;
  setMute(muted: boolean): void;
  setSendA(amount: number): void;
  setSendB(amount: number): void;
  addEffectLegacy(effect: LegacyDrumEffect): void; // legacy uniquement; ignoré en v2
  removeEffectLegacy(index: number): void; // legacy uniquement; ignoré en v2
  clearEffectsLegacy(): void; // legacy uniquement; ignoré en v2
  listEffectsLegacy(): LegacyDrumEffect[]; // legacy uniquement; ignoré en v2
  addFxDeclV2(fx: FxDecl): void; // v2: ajoute déclaration et reconstruit chaîne
  removeFxDeclV2(index: number): void; // v2: supprime déclaration
  moveFxDeclV2(from: number, to: number): void; // v2: réordonne
  setFxBypassV2(index: number, bypass: boolean): void; // v2: modifie bypass si supporté
  setFxChainV2(fx: readonly FxDecl[]): void; // v2 uniquement; ignoré en legacy
  readMeter(): { rms: number; peak: number };
  getAnalyser(): AnalyserNode | null;
  getStereoAnalysers(opts?: { fftSize?: number; smoothing?: number }): { left: AnalyserNode; right: AnalyserNode } | null;
  isV2(): boolean;
}

// Cache des adaptateurs pour éviter ré-instanciation.
const cache = new Map<string, DrumChannelAdapter>();

export function getDrumChannelAdapter(trackId: string): DrumChannelAdapter {
  const existing = cache.get(trackId);
  if (existing) return existing;
  const adapter = createAdapter(trackId);
  cache.set(trackId, adapter);
  return adapter;
}

function createAdapter(trackId: string): DrumChannelAdapter {
  const mix = MixerCore.ensure();
  // S'assurer piste existe (création paresseuse si audio engine ready).
  mix.ensureTrack(trackId);
  // Map interne déclarations FX v2 pour opérations incrémentales.
  let fxDecls: FxDecl[] = [];
  return {
    trackId,
    setVolumeDb(db: number) {
      if (isTrackChannelV2EnabledFor(trackId)) { mix.setGainDb(trackId, db); return; }
      drumMachine.setChannelSettings(trackId, { volumeDb: db });
    },
    setPan(pan: number) {
      if (isTrackChannelV2EnabledFor(trackId)) { mix.setPan(trackId, pan); return; }
      drumMachine.setChannelSettings(trackId, { pan });
    },
    setMute(muted: boolean) {
      if (isTrackChannelV2EnabledFor(trackId)) { mix.setMute(trackId, muted); return; }
      drumMachine.setChannelSettings(trackId, { mute: muted });
    },
    setSendA(amount: number) {
      if (isTrackChannelV2EnabledFor(trackId)) { mix.setSendAmount(trackId, "A", amount); return; }
      drumMachine.setChannelSettings(trackId, { sendA: amount });
    },
    setSendB(amount: number) {
      if (isTrackChannelV2EnabledFor(trackId)) { mix.setSendAmount(trackId, "B", amount); return; }
      drumMachine.setChannelSettings(trackId, { sendB: amount });
    },
    addEffectLegacy(effect: LegacyDrumEffect) {
      if (isTrackChannelV2EnabledFor(trackId)) {
        // Ignoré: FX gérés via setFxChainV2.
        if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] addEffectLegacy ignoré en mode v2.');
        return;
      }
      drumMachine.addEffect(trackId, effect as unknown as any);
    },
    removeEffectLegacy(index: number) {
      if (isTrackChannelV2EnabledFor(trackId)) { if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] removeEffectLegacy ignoré en mode v2.'); return; }
      drumMachine.removeEffect(trackId, index);
    },
    clearEffectsLegacy() {
      if (isTrackChannelV2EnabledFor(trackId)) { if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] clearEffectsLegacy ignoré en mode v2.'); return; }
      drumMachine.clearEffects(trackId);
    },
    listEffectsLegacy(): LegacyDrumEffect[] {
      if (isTrackChannelV2EnabledFor(trackId)) return [];
      return drumMachine.getTrackEffects(trackId) as unknown as LegacyDrumEffect[];
    },
    addFxDeclV2(fx: FxDecl) {
      if (!isTrackChannelV2EnabledFor(trackId)) { if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] addFxDeclV2 ignoré: piste legacy.'); return; }
      fxDecls.push(fx);
      mix.setTrackFx(trackId, fxDecls);
    },
    removeFxDeclV2(index: number) {
      if (!isTrackChannelV2EnabledFor(trackId)) { if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] removeFxDeclV2 ignoré: piste legacy.'); return; }
      if (index < 0 || index >= fxDecls.length) return;
      fxDecls.splice(index, 1);
      mix.setTrackFx(trackId, fxDecls);
    },
    moveFxDeclV2(from: number, to: number) {
      if (!isTrackChannelV2EnabledFor(trackId)) { if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] moveFxDeclV2 ignoré: piste legacy.'); return; }
      const len = fxDecls.length;
      if (from < 0 || from >= len || to < 0 || to >= len || from === to) return;
      const [item] = fxDecls.splice(from, 1);
      fxDecls.splice(to, 0, item);
      mix.setTrackFx(trackId, fxDecls);
    },
    setFxBypassV2(index: number, bypass: boolean) {
      if (!isTrackChannelV2EnabledFor(trackId)) { if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] setFxBypassV2 ignoré: piste legacy.'); return; }
      const fx = fxDecls[index];
      if (!fx) return;
      // Convention: params.bypass si présent.
      const params = { ...(fx.params as Record<string, unknown>), bypass };
      fxDecls[index] = { ...fx, params };
      mix.setTrackFx(trackId, fxDecls);
    },
    setFxChainV2(fx: readonly FxDecl[]) {
      if (!isTrackChannelV2EnabledFor(trackId)) {
        if (process.env.NODE_ENV !== 'production') console.warn('[DrumChannelAdapter] setFxChainV2 ignoré: piste legacy.');
        return;
      }
      fxDecls = [...fx]; // remplace snapshot interne
      mix.setTrackFx(trackId, fxDecls);
    },
    readMeter() {
      return mix.readTrackMeter(trackId);
    },
    getAnalyser() {
      if (!isTrackChannelV2EnabledFor(trackId)) return drumMachine.getTrackAnalyser(trackId);
      const chain = mix.getTrackChain(trackId); return chain ? chain.getAnalyserNode() : null;
    },
    getStereoAnalysers(opts) {
      if (!isTrackChannelV2EnabledFor(trackId)) return drumMachine.getTrackStereoAnalysers(trackId, opts);
      const chain = mix.getTrackChain(trackId); return chain ? chain.getStereoAnalysers(opts) : null;
    },
    isV2() { return isTrackChannelV2EnabledFor(trackId); },
  };
}

export function releaseDrumChannelAdapter(trackId: string): void {
  cache.delete(trackId);
}