// lib/audio/envelopes/generic-envelope.ts
import { TransportScheduler } from "@/lib/audio/core/transport-scheduler";

/** Type de courbe entre 2 points de l’enveloppe. */
export type EnvelopeCurve = "linear" | "exp" | "log";

/** Un point clé de l’enveloppe. */
export type EnvelopePoint = {
  /** Temps normalisé 0..1 sur la durée totale. */
  t: number;
  /** Valeur 0..1 (amplitude, cutoff, etc.). */
  value: number;
  /** Courbe pour le segment *après* ce point. */
  curve?: EnvelopeCurve;
};

export type EnvelopeTimebase = "ms" | "beats";

/** Enveloppe générique multi-points. */
export type GenericEnvelope = {
  /** Durée totale en millisecondes. */
  totalMs: number;
  /** Base de temps: millisecondes (par défaut) ou beats synchronisés au BPM. */
  timebase?: EnvelopeTimebase;
  /** Durée totale en beats quand `timebase` = "beats". */
  totalBeats?: number;
  /** Grille rythmique (divisions par beat) quand en mode beats. */
  grid?: 1 | 2 | 4 | 8 | 16 | 32;
  /** Activer l'accrochage horizontal à la grille lors de l'édition. */
  snap?: boolean;
  /** Points ordonnés par t (0..1, min deux points). */
  points: EnvelopePoint[];
};

/**
 * Normalize + clamp :
 * - assure t ∈ [0,1], value ∈ [0,1]
 * - trie par t
 * - force un point à t=0 et un à t=1 (si manquants)
 */
export function normalizeEnvelope(env: GenericEnvelope): GenericEnvelope {
  let pts = env.points
    .map((p) => ({
      t: clamp(p.t, 0, 1),
      value: clamp(p.value, 0, 1),
      curve: p.curve ?? "linear",
    }))
    .sort((a, b) => a.t - b.t);

  if (pts.length === 0) {
    pts = [
      { t: 0, value: 0, curve: "linear" },
      { t: 1, value: 0, curve: "linear" },
    ];
  }

  if (pts[0].t > 0) {
    pts.unshift({ t: 0, value: pts[0].value, curve: pts[0].curve });
  }
  if (pts[pts.length - 1].t < 1) {
    const last = pts[pts.length - 1];
    pts.push({ t: 1, value: last.value, curve: last.curve });
  }
  const timebase: EnvelopeTimebase = env.timebase ?? "ms";
  const totalMs = Math.max(1, env.totalMs);
  const totalBeats = Math.max(1 / 32, env.totalBeats ?? 1);
  const grid = (env.grid ?? 4) as 1 | 2 | 4 | 8 | 16 | 32;
  const snap = !!env.snap;

  return { totalMs, timebase, totalBeats, grid, snap, points: pts };
}

/** Évalue l’enveloppe à un temps normalisé t ∈ [0,1]. */
export function evalEnvelope(env: GenericEnvelope, tNorm: number): number {
  const e = normalizeEnvelope(env);
  const t = clamp(tNorm, 0, 1);
  const pts = e.points;

  // avant le premier / après le dernier
  if (t <= pts[0].t) return pts[0].value;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].value;

  // trouve le segment [i, i+1]
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (t >= a.t && t <= b.t) {
      const segLen = Math.max(1e-6, b.t - a.t);
      let u = (t - a.t) / segLen; // 0..1 dans le segment

      // applique la courbe
      const curve = a.curve ?? "linear";
      if (curve === "exp") {
        // exponentiel “ease-in”
        u = u * u;
      } else if (curve === "log") {
        // pseudo-log “ease-out”
        u = 1 - (1 - u) * (1 - u);
      }

      return a.value + (b.value - a.value) * u;
    }
  }
  return pts[pts.length - 1].value;
}

/** Utilitaire clamp simple. */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Convertit la durée totale d'une enveloppe en secondes en fonction de la base de temps.
 * - ms: totalMs / 1000
 * - beats: totalBeats * (60 / bpm)
 */
export function getEnvelopeTotalSec(env: GenericEnvelope, bpm?: number): number {
  const e = normalizeEnvelope(env);
  if (e.timebase === "beats") {
    const effectiveBpm = bpm ?? TransportScheduler.ensure().getBpm();
    const b = Math.max(1e-6, e.totalBeats ?? 1);
    const tempo = Math.max(1, effectiveBpm ?? 120);
    return (b * 60) / tempo;
  }
  return Math.max(0.001, e.totalMs / 1000);
}
