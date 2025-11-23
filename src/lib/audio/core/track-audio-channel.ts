// src/lib/audio/core/track-audio-channel.ts
// Abstraction déclarative légère au-dessus de MixerCore + TrackNodeChain.
// Objectif: fournir une API stable pour l'UI sans exposer directement MixerCore.
// PERF: Toutes les méthodes évitent les allocations; pas de création de nouveaux objets de retour.

import { MixerCore } from "@/lib/audio/core/mixer";
import type { InstrumentOutput } from "@/lib/audio/core/instrument-output";
import type { FxDecl } from "@/lib/audio/types";

export interface TrackAudioChannel {
  readonly id: string;
  /** Attache une sortie d'instrument: connecte l'instrument à la piste. */
  attachInstrument(output: InstrumentOutput): void;
  /** Détache l'instrument (la piste reste). */
  detachInstrument(output: InstrumentOutput): void;
  /** Gain en dB (propagé en linéaire). */
  setGainDb(db: number): void;
  /** Panoramique -1..1. */
  setPan(pan: number): void;
  /** Mute logique. */
  setMute(muted: boolean): void;
  /** Solo logique. */
  setSolo(solo: boolean): void;
  /** Send A ou B (0..1). */
  setSendAmount(send: "A" | "B", amount: number): void;
  /** Liste complète des FX (remplacement). */
  setFxChain(fx: readonly FxDecl[]): void;
  /** Métrique niveau (rms, peak) pour la piste. */
  readMeter(): { rms: number; peak: number };
  /** Analyser mono interne. */
  getAnalyserNode(): AnalyserNode | null;
  /** Analyseurs stéréo passifs. */
  getStereoAnalysers(opts?: { fftSize?: number; smoothing?: number }): { left: AnalyserNode; right: AnalyserNode } | null;
  /** Nettoyage piste (supprime la piste du mixeur). */
  dispose(): void;
}

class TrackAudioChannelImpl implements TrackAudioChannel {
  readonly id: string;
  private mix: MixerCore;
  constructor(id: string) {
    this.id = id;
    this.mix = MixerCore.ensure();
    this.mix.ensureTrack(id);
  }
  attachInstrument(output: InstrumentOutput): void {
    output.connectToTrack(this.id);
  }
  detachInstrument(output: InstrumentOutput): void {
    // On délègue à l'instrument; la piste reste disponible.
    output.disconnect?.();
  }
  setGainDb(db: number): void { this.mix.setGainDb(this.id, db); }
  setPan(pan: number): void { this.mix.setPan(this.id, pan); }
  setMute(muted: boolean): void { this.mix.setMute(this.id, muted); }
  setSolo(solo: boolean): void { this.mix.setSolo(this.id, solo); }
  setSendAmount(send: "A" | "B", amount: number): void { this.mix.setSendAmount(this.id, send, amount); }
  setFxChain(fx: readonly FxDecl[]): void { this.mix.setTrackFx(this.id, fx); }
  readMeter(): { rms: number; peak: number } { return this.mix.readTrackMeter(this.id); }
  getAnalyserNode(): AnalyserNode | null {
    const chain = this.mix.getTrackChain(this.id); return chain ? chain.getAnalyserNode() : null;
  }
  getStereoAnalysers(opts?: { fftSize?: number; smoothing?: number }): { left: AnalyserNode; right: AnalyserNode } | null {
    const chain = this.mix.getTrackChain(this.id); return chain ? chain.getStereoAnalysers(opts) : null;
  }
  dispose(): void { this.mix.removeTrack(this.id); }
}

const cache = new Map<string, TrackAudioChannelImpl>();

/**
 * Récupère (ou crée) un TrackAudioChannel pour une piste.
 * Single point de vérité pour l'UI.
 */
export function getTrackAudioChannel(id: string): TrackAudioChannel {
  let inst = cache.get(id);
  if (!inst) { inst = new TrackAudioChannelImpl(id); cache.set(id, inst); }
  return inst;
}

/**
 * Libère l'adaptateur (sans disposer la piste). Utile si UI démonte seulement.
 */
export function releaseTrackAudioChannel(id: string): void {
  cache.delete(id);
}
