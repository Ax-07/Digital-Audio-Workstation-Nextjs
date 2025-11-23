// src/lib/audio/effects/factory.ts
import type { EffectKind } from "./types";
import type { AudioEffect } from "./base";

// Crée une instance d'effet pour un kind donné (lazy via dynamic import)
export async function createEffect(ctx: AudioContext, kind: EffectKind): Promise<AudioEffect | null> {
  const {
    DelayEffect,
    ReverbEffect,
    Eq3Effect,
    CompressorEffect,
    TremoloEffect,
    LimiterEffect,
    DistortionEffect,
    AutoFilterEffect,
    ChorusEffect,
    StereoWidenerEffect,
    AnalyserTapEffect,
  } = await import("@/lib/audio/fx");

  const map: Record<EffectKind, new (ctx: AudioContext) => AudioEffect> = {
    "delay": DelayEffect,
    "reverb": ReverbEffect,
    "eq3": Eq3Effect,
    "compressor": CompressorEffect,
    "tremolo": TremoloEffect,
    "limiter": LimiterEffect,
    "distortion": DistortionEffect,
    "auto-filter": AutoFilterEffect,
    "chorus": ChorusEffect,
    "stereo-widener": StereoWidenerEffect,
    "analyser-tap": AnalyserTapEffect,
  };

  const Ctor = map[kind];
  return Ctor ? new Ctor(ctx) as AudioEffect : null;
}
