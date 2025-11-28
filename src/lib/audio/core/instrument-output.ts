// src/lib/audio/core/instrument-output.ts
// Interface commune pour la sortie d'un instrument vers le mixeur.
// Objectif: offrir un point d'adaptation sans refactorer immédiatement DrumMachine.

import { isTrackChannelV2Enabled, isTrackChannelV2EnabledFor } from "@/lib/audio/core/feature-flags";
import { MixerCore } from "./mixer/mixer";

/**
 * InstrumentOutput
 * ----------------
 * Interface commune de sortie audio d'un instrument (synthé, drum machine, sampler...)
 * vers le système de pistes (TrackNodeChain) du mixeur.
 *
 * Objectifs:
 *  - Abstraction minimale pour rattacher/détacher l'instrument à une piste.
 *  - Accès aux analyseurs (mono ou stéréo) exposés par la piste pour la métrologie UI.
 *  - Instrumentation (compteur de voix actives) optionnelle selon type d'instrument.
 *  - Méthode de libération (dispose) pour nettoyage à chaud lors de rechargement projet.
 *
 * Toutes les méthodes avancées sont optionnelles (narrow interface) afin de permettre
 * une migration progressive sans casser les implémentations existantes.
 */
export interface InstrumentOutput {
  /** Connecte l'instrument à une piste du mixeur (créée si nécessaire). */
  connectToTrack(trackId: string): void;
  /** Déconnecte l'instrument de la piste (laissera la piste créée). */
  disconnect(): void;
  /** Identifiant de piste si connecté. */
  readonly trackId: string | null;
  /** Analyser mono principal (ex: RMS / peak). */
  getAnalyserNode?(): AnalyserNode | null;
  /** Analyseurs stéréo (splitter + deux analysers) pour spectre L/R. */
  getStereoAnalysers?(opts?: { channelCount?: number; fftSize?: number }): { left: AnalyserNode; right: AnalyserNode } | null;
  /** Nombre de voix actives (synth poly) ou déclenchements actifs (drums). */
  getActiveVoiceCount?(): number;
  /** Libération des ressources (déconnexion nodes internes, annulation timers). */
  dispose?(): void;
}

/**
 * Helper de validation (feature flag futur) pour savoir si le routing v2 est actif.
 * Pour l'instant retourne toujours true afin de permettre expérimentation.
 */
export function isTrackRoutingV2Enabled(): boolean {
  return isTrackChannelV2Enabled();
}

/** Version granulaire par piste. */
export function isTrackRoutingV2EnabledFor(trackId: string): boolean {
  return isTrackChannelV2EnabledFor(trackId);
}

/**
 * Récupère l'AudioNode d'entrée de piste (gain d'entrée) pour connexion directe.
 */
export function getTrackInputNode(trackId: string): AudioNode | null {
  const mix = MixerCore.ensure();
  mix.ensureTrack(trackId);
  return mix.getTrackInput(trackId);
}

/**
 * Helpers pour récupérer les analyseurs d'une piste (mono ou stéréo) sans exposer MixerCore.
 */
export function getTrackAnalyser(trackId: string): AnalyserNode | null {
  const mix = MixerCore.ensure();
  const chain = mix.getTrackChain(trackId);
  return chain ? chain.getAnalyserNode() : null;
}

export function getTrackStereoAnalysers(
  trackId: string,
  opts?: { channelCount?: number; fftSize?: number },
): { left: AnalyserNode; right: AnalyserNode } | null {
  const mix = MixerCore.ensure();
  const chain = mix.getTrackChain(trackId);
  if (!chain) return null;
  const stereo = chain.getStereoAnalysers(opts);
  return stereo || null;
}
