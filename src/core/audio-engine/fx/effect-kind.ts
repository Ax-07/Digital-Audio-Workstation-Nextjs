import type { EffectKind } from "./types";
import type { AudioEffect } from "./base";

// Avec la présence de eff.kind sur chaque instance, la résolution devient triviale.
export function effectKindOf(eff: AudioEffect): EffectKind { return eff.kind; }
export function effectKey(eff: AudioEffect, index: number) { return `${eff.kind}-${index}`; }
