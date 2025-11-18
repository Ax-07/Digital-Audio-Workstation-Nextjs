// lib/audio/envelopes/apply-generic-envelope.ts

import type { GenericEnvelope } from "./generic-envelope";
import { normalizeEnvelope, clamp, getEnvelopeTotalSec } from "./generic-envelope";

/**
 * Applique une enveloppe générique sur un GainNode.gain
 * à partir de startTime (en secondes).
 *
 * - `baseGain` : niveau de base (par ex. peak * envelopeValue)
 */
export function applyEnvelopeToGain(
  gainParam: AudioParam,
  env: GenericEnvelope,
  startTime: number,
  baseGain: number,
): void {
  const e = normalizeEnvelope(env);
  const totalSec = getEnvelopeTotalSec(e);
  const pts = e.points;

  if (!pts.length) return;

  const now0 = startTime;

  // valeur initiale
  const v0 = baseGain * pts[0].value;
  gainParam.cancelScheduledValues(now0);
  gainParam.setValueAtTime(v0, now0);

  // segments entre points
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];

    const tA = now0 + a.t * totalSec;
    const tB = now0 + b.t * totalSec;

    const vA = baseGain * a.value;
    const vB = baseGain * b.value;

    // s’assure que le temps est croissant
    const endT = Math.max(tA + 1e-4, tB);

    if (a.curve === "exp") {
      // Exponentiel: nécessite des valeurs strictement > 0
      const safeVA = clamp(vA, 1e-5, 1e3);
      const safeVB = clamp(vB, 1e-5, 1e3);
      gainParam.setValueAtTime(safeVA, tA);
      gainParam.exponentialRampToValueAtTime(safeVB, endT);
    } else if (a.curve === "log") {
      // Approximation "log" (ease-out) via 2 rampes linéaires
      // Point intermédiaire à u≈0.7 avec interpolation ease-out: 1-(1-u)^2
      const midU = 0.7;
      const midT = tA + (endT - tA) * midU;
      const eased = 1 - (1 - midU) * (1 - midU);
      const midV = vA + (vB - vA) * eased;
      gainParam.setValueAtTime(vA, tA);
      gainParam.linearRampToValueAtTime(midV, midT);
      gainParam.linearRampToValueAtTime(vB, endT);
    } else {
      // linéaire
      gainParam.setValueAtTime(vA, tA);
      gainParam.linearRampToValueAtTime(vB, endT);
    }
  }
}
