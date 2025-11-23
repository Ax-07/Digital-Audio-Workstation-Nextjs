// src/lib/audio/effects/registry.ts
import type { EffectKind } from "./types";

// Liste complète des effets disponibles
export const ALL_EFFECT_KINDS: EffectKind[] = [
  "delay","reverb","eq3","compressor","tremolo","limiter","distortion","auto-filter","chorus","stereo-widener", "analyser-tap"
];

// Libellés d'affichage
export const EFFECT_KIND_LABEL: Record<EffectKind,string> = {
  "delay":"Delay",
  "reverb":"Reverb",
  "eq3":"EQ3",
  "compressor":"Comp",
  "tremolo":"Tremolo",
  "limiter":"Limiter",
  "distortion":"Dist",
  "auto-filter":"AutoFilt",
  "chorus":"Chorus",
  "stereo-widener":"Width",
  "analyser-tap":"Analyser Tap",
};

// Jeux autorisés par rack (actuellement identiques, prêts pour différenciation ultérieure)
export const TRACK_EFFECT_KINDS = ALL_EFFECT_KINDS;
export const MASTER_EFFECT_KINDS = ALL_EFFECT_KINDS;
export const RETURN_EFFECT_KINDS = ALL_EFFECT_KINDS; // Peut être restreint plus tard (ex: time/modulation/wet)
