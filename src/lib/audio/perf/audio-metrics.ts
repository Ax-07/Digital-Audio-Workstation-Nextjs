// src/lib/audio/perf/audio-metrics.ts
// Instrumentation légère (sans overhead React) pour monitoring audio.
// Utilise simples compteurs mutables et fournit une API de lecture snapshot.

export type AudioPerfSnapshot = {
  synth: {
    activeVoices: number;
    voiceSteals: number;
  };
  drums: {
    kick: number;
    snare: number;
    hh: number;
  };
  routing: {
    v2Tracks: number;
    legacyTracks: number;
  };
  updatedAt: number;
};

const metrics: AudioPerfSnapshot = {
  synth: { activeVoices: 0, voiceSteals: 0 },
  drums: { kick: 0, snare: 0, hh: 0 },
  routing: { v2Tracks: 0, legacyTracks: 0 },
  updatedAt: Date.now(),
};

function touch() {
  metrics.updatedAt = Date.now();
}

export function perfIncrementVoiceSteal() {
  metrics.synth.voiceSteals++;
  touch();
}

export function perfSetActiveVoices(count: number) {
  metrics.synth.activeVoices = count;
  touch();
}

export function perfIncrementDrumTrigger(instrument: "kick" | "snare" | "hh") {
  metrics.drums[instrument]++;
  touch();
}

export function perfGetSnapshot(): AudioPerfSnapshot {
  // Retourne une copie pour éviter mutation externe accidentelle.
  return {
    synth: { ...metrics.synth },
    drums: { ...metrics.drums },
    routing: { ...metrics.routing },
    updatedAt: metrics.updatedAt,
  };
}

// --- Routing v2 instrumentation -------------------------------------------------
import { summarizeTrackChannelV2 } from "@/lib/audio/core/feature-flags";
import { MixerCore } from "@/lib/audio/core/mixer";

/** Met à jour compteurs routing (à appeler périodiquement dans dev panel). */
export function perfUpdateRoutingStatus(): void {
  const mix = MixerCore.ensure();
  const ids = mix.listTrackIds();
  const summary = summarizeTrackChannelV2(ids);
  metrics.routing.v2Tracks = summary.v2.length;
  metrics.routing.legacyTracks = summary.legacy.length;
  touch();
}
