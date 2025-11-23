// Type partagé pour tous les racks d'effets
// Ajouté pour éliminer les unions dupliquées dans fx-rack, master-fx-rack et return-fx-rack.

export type EffectKind =
  | "delay"
  | "reverb"
  | "eq3"
  | "compressor"
  | "tremolo"
  | "limiter"
  | "distortion"
  | "auto-filter"
  | "chorus"
  | "stereo-widener"
  | "analyser-tap"

// Alias sémantiques (facultatifs) si on veut distinguer logiquement sans recréer des unions différentes
// Remarque: les alias Track/Return/Master ont été supprimés car redondants.

// Generic discriminated shape possible pour future validation stricte des params
// (non utilisé pour le moment, fourni comme base d'évolution)
export interface EffectParamsMap {
  delay: { time: number; feedback: number; wet: number };
  reverb: { duration: number; decay: number; wet: number };
  eq3: { lowGain: number; midGain: number; highGain: number; lowFreq: number; midFreq: number; midQ: number; highFreq: number };
  compressor: { threshold: number; ratio: number; attack: number; release: number; knee: number; makeup: number };
  tremolo: { rate: number; depth: number };
  limiter: { ceiling: number; release: number; preGain: number };
  distortion: { drive: number; tone: number; wet: number };
  "auto-filter": { rate: number; depth: number; minFreq: number; maxFreq: number };
  chorus: { rate: number; depth: number; delay: number; mix: number };
  "stereo-widener": { width: number };
  "analyser-tap": Partial<import("./spectrum-analyser/analyser-tap").AnalyserTapParams>;
  analyser: Partial<import("./spectrum-analyser/ableton-analyser-engine").AbletonAnalyserOptions>;
}

export type AnyEffectParams = EffectParamsMap[EffectKind];
