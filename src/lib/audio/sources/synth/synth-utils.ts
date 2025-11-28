// src/lib/audio/sources/synth/synth-utils.ts

/**
 * Utilitaires communs pour les synthés polyphoniques.
 * Contient les fonctions réutilisables pour la gestion des voix,
 * les conversions MIDI, et l'application d'enveloppes.
 */

import { AudioEngine } from "@/lib/audio/core/audio-engine";
import type { GenericEnvelope } from "@/lib/audio/envelopes/generic-envelope";
import { getEnvelopeTotalSec } from "@/lib/audio/envelopes/generic-envelope";

/* -------------------------------------------------------------------------- */
/*  Conversion MIDI                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Noms des notes MIDI (C à B).
 */
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Conversion pitch MIDI → fréquence Hz.
 * Référence : 69 = A4 = 440 Hz.
 * Formule : f = 440 * 2^((pitch - 69) / 12)
 */
export function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

/** 
 * Conversion fréquence Hz → pitch MIDI.
 * Référence : 69 = A4 = 440 Hz.
 */
export function freqToMidi(freqHz: number): number {
  return Math.round(69 + 12 * Math.log2(freqHz / 440));
}

export function midiToName(note: number): string {
  const n = Math.round(note);
  const name = NOTE_NAMES[(n + 1200) % 12];
  const octave = Math.floor(n / 12) - 1;
  return `${name}${octave}`;
}

/* -------------------------------------------------------------------------- */
/*  Utilitaires mathématiques                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Clamp une valeur entre min et max.
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/* -------------------------------------------------------------------------- */
/*  Gestion du contexte audio                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Récupère le AudioContext global via AudioEngine.
 * Retourne null si le moteur audio n'est pas encore initialisé.
 */
export function ensureAudioContext(): AudioContext | null {
  const e = AudioEngine.ensure();
  return e.context ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Voice Management - Types de base                                          */
/* -------------------------------------------------------------------------- */

/**
 * Interface de base pour une voix polyphonique.
 * Peut être étendue selon les besoins spécifiques du synthé.
 */
export interface BaseVoice {
  active: boolean;
  pitch: number;
  gain: GainNode;
  startedAt: number;
  isPreview?: boolean;
};

/* -------------------------------------------------------------------------- */
/*  Voice Allocation & Stealing                                               */
/* -------------------------------------------------------------------------- */

/**
 * Trouve une voix inactive dans un pool.
 * Retourne l'index de la voix ou -1 si aucune n'est disponible.
 */
export function findInactiveVoice<T extends BaseVoice>(voices: T[]): number {
  for (let i = 0; i < voices.length; i++) {
    if (!voices[i].active) return i;
  }
  return -1;
}

/**
 * Trouve la voix active la plus ancienne (pour voice stealing).
 * Retourne l'index ou -1 si toutes les voix sont inactives.
 */
export function findOldestVoice<T extends BaseVoice>(voices: T[]): number {
  let oldestIndex = -1;
  let oldestTime = Number.MAX_VALUE;
  
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (!v.active) {
      return i; // Une voix inactive est toujours préférable
    }
    if (v.startedAt < oldestTime) {
      oldestTime = v.startedAt;
      oldestIndex = i;
    }
  }
  
  return oldestIndex;
}

/* -------------------------------------------------------------------------- */
/*  Voice Cleanup                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Applique un release court sur le gain d'une voix et la désactive.
 * Utilisé pour le voice stealing et les arrêts forcés.
 * 
 * @param gain - GainNode de la voix
 * @param now - ctx.currentTime actuel
 * @param tau - constante de temps pour le release (défaut: 0.02)
 */
export function applyVoiceRelease(
  gain: GainNode,
  now: number,
  tau = 0.02
): void {
  try {
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, tau);
  } catch {
    // Ignore si le node est déjà détaché
  }
}

/**
 * Stoppe un oscillateur avec un délai de sécurité.
 * 
 * @param osc - OscillatorNode à stopper
 * @param stopTime - temps d'arrêt (ctx.currentTime + délai)
 */
export function stopOscillator(
  osc: OscillatorNode | null,
  stopTime: number
): void {
  if (!osc) return;
  try {
    osc.stop(stopTime);
  } catch {
    // Ignore si l'osc est déjà stoppé
  }
}

/**
 * Réinitialise le gain d'une voix après un release.
 * Permet la réutilisation propre de la voix.
 * 
 * @param gain - GainNode à réinitialiser
 * @param resetTime - temps de réinitialisation
 */
export function resetVoiceGain(gain: GainNode, resetTime: number): void {
  try {
    gain.gain.setValueAtTime(0, resetTime);
  } catch {
    // Ignore si le node est déjà détaché
  }
}

/* -------------------------------------------------------------------------- */
/*  Voice Connection Management                                               */
/* -------------------------------------------------------------------------- */

/**
 * Reconnecte un GainNode vers une nouvelle destination.
 * Déconnecte d'abord proprement l'ancienne connexion.
 */
export function reconnectVoiceGain(
  gain: GainNode,
  destination: AudioNode
): void {
  try {
    gain.disconnect();
  } catch {
    // Ignore si déjà déconnecté
  }
  gain.connect(destination);
}

/* -------------------------------------------------------------------------- */
/*  Envelope Application Helpers                                              */
/* -------------------------------------------------------------------------- */

/**
 * Configure l'état initial d'un AudioParam avant l'application d'une enveloppe.
 * 
 * @param param - AudioParam à configurer (gain, detune, etc.)
 * @param now - ctx.currentTime actuel
 * @param initialValue - valeur de départ
 */
export function initAudioParam(
  param: AudioParam,
  now: number,
  initialValue: number
): void {
  try {
    param.cancelScheduledValues(now);
  } catch {
    // Ignore si le param est invalide
  }
  param.setValueAtTime(initialValue, now);
}

/**
 * Applique une enveloppe linéaire simple à un AudioParam.
 * Utilisé pour les enveloppes de detune, mix, etc.
 * 
 * @param param - AudioParam cible
 * @param envelope - enveloppe normalisée
 * @param now - ctx.currentTime actuel
 * @param baseValue - valeur de base (offset)
 * @param depth - profondeur de modulation
 */
export function applyLinearEnvelope(
  param: AudioParam,
  envelope: GenericEnvelope,
  now: number,
  baseValue: number,
  depth: number
): void {
  const totalSec = getEnvelopeTotalSec(envelope);
  const pts = envelope.points.length
    ? envelope.points
    : [
        { t: 0, value: 0 },
        { t: 1, value: 0 },
      ];

  const v0 = baseValue + depth * pts[0]!.value;
  initAudioParam(param, now, v0);

  for (let i = 0; i < pts.length - 1; i++) {
    const aPt = pts[i]!;
    const bPt = pts[i + 1]!;
    const tA = now + Math.max(0, aPt.t) * totalSec;
    const tB = now + Math.max(0, bPt.t) * totalSec;
    const valA = baseValue + depth * aPt.value;
    const valB = baseValue + depth * bPt.value;
    const endT = Math.max(tA + 1e-4, tB);
    
    param.setValueAtTime(valA, tA);
    param.linearRampToValueAtTime(valB, endT);
  }
}

/**
 * Applique une enveloppe de detune sur un oscillateur.
 * Gère à la fois le cas d'une EnvelopeMod dédiée et le fallback sur ampEnv.
 * 
 * @param osc - OscillatorNode cible (peut être null)
 * @param envelope - enveloppe à appliquer
 * @param now - ctx.currentTime actuel
 * @param baseDetuneCents - détune de base en cents
 * @param depthCents - profondeur de modulation en cents
 */
export function applyDetuneEnvelope(
  osc: OscillatorNode | null | undefined,
  envelope: GenericEnvelope,
  now: number,
  baseDetuneCents: number,
  depthCents: number
): void {
  if (!osc) return;
  applyLinearEnvelope(osc.detune, envelope, now, baseDetuneCents, depthCents);
}

/**
 * Trouve une voix active correspondant à un pitch donné.
 * Retourne l'index ou -1 si non trouvée.
 */
export function findVoiceByPitch<T extends BaseVoice>(
  voices: T[],
  pitch: number
): number {
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (v.active && v.pitch === pitch) return i;
  }
  return -1;
}

/* -------------------------------------------------------------------------- */
/*  Note Off Helper                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Type pour un callback de nettoyage de voix après noteOff.
 */
export type VoiceCleanupCallback = () => void;

/**
 * Programme un nettoyage de voix après un délai (pour noteOff).
 * Utilise setTimeout si disponible, sinon exécute immédiatement.
 * 
 * @param callback - fonction de nettoyage
 * @param delayMs - délai en millisecondes
 */
export function scheduleVoiceCleanup(
  callback: VoiceCleanupCallback,
  delayMs: number
): void {
  if (typeof window !== "undefined") {
    window.setTimeout(callback, Math.round(delayMs));
  } else {
    callback();
  }
}

/* -------------------------------------------------------------------------- */
/*  Mix Crossfade Utilities (pour dual-osc)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Calcule les gains A/B pour un crossfade trigonométrique.
 * Loi: gainA = cos(mix * π/2), gainB = sin(mix * π/2)
 * 
 * @param mix - position du crossfade (0..1)
 * @returns [gainA, gainB]
 */
export function calculateCrossfadeGains(mix: number): [number, number] {
  const normalizedMix = clamp(mix, 0, 1);
  const gainA = Math.cos(normalizedMix * Math.PI * 0.5);
  const gainB = Math.sin(normalizedMix * Math.PI * 0.5);
  return [gainA, gainB];
}

/**
 * Applique une enveloppe de mix crossfade A/B.
 * 
 * @param mixGainA - GainNode pour oscillateur A
 * @param mixGainB - GainNode pour oscillateur B
 * @param envelope - enveloppe normalisée
 * @param now - ctx.currentTime actuel
 * @param baseMix - position de base du crossfade (0..1)
 * @param depth - profondeur de modulation (-1..1)
 */
export function applyMixEnvelope(
  mixGainA: GainNode,
  mixGainB: GainNode,
  envelope: GenericEnvelope,
  now: number,
  baseMix: number,
  depth: number
): void {
  const totalSec = getEnvelopeTotalSec(envelope);
  const pts = envelope.points.length
    ? envelope.points
    : [
        { t: 0, value: 0 },
        { t: 1, value: 0 },
      ];

  const clampedDepth = clamp(depth, -1, 1);
  const mix0 = clamp(baseMix + clampedDepth * pts[0]!.value, 0, 1);
  const [ga0, gb0] = calculateCrossfadeGains(mix0);

  try {
    mixGainA.gain.cancelScheduledValues(now);
    mixGainB.gain.cancelScheduledValues(now);
  } catch {
    // Ignore si les nodes sont invalides
  }

  mixGainA.gain.setValueAtTime(ga0, now);
  mixGainB.gain.setValueAtTime(gb0, now);

  for (let i = 0; i < pts.length - 1; i++) {
    const aPt = pts[i]!;
    const bPt = pts[i + 1]!;
    const tA = now + Math.max(0, aPt.t) * totalSec;
    const tB = now + Math.max(0, bPt.t) * totalSec;

    const mixA = clamp(baseMix + clampedDepth * aPt.value, 0, 1);
    const mixB = clamp(baseMix + clampedDepth * bPt.value, 0, 1);
    const [gaA, gbA] = calculateCrossfadeGains(mixA);
    const [gaB, gbB] = calculateCrossfadeGains(mixB);

    const endT = Math.max(tA + 1e-4, tB);

    mixGainA.gain.setValueAtTime(gaA, tA);
    mixGainA.gain.linearRampToValueAtTime(gaB, endT);
    mixGainB.gain.setValueAtTime(gbA, tA);
    mixGainB.gain.linearRampToValueAtTime(gbB, endT);
  }
}

/* -------------------------------------------------------------------------- */
/*  Propagation live des paramètres                                           */
/* -------------------------------------------------------------------------- */

/**
 * Applique le détune de façon sécurisée sur un oscillateur actif.
 * Ignore silencieusement les erreurs (osc déjà stoppé, etc.).
 */
export function propagateDetune(
  osc: OscillatorNode | null | undefined,
  detuneCents: number
): void {
  if (!osc) return;
  try {
    osc.detune.value = detuneCents;
  } catch {
    // Ignore si l'osc est invalide ou stoppé
  }
}

/**
 * Applique un gain statique de façon sécurisée.
 */
export function propagateGain(
  gain: GainNode | null | undefined,
  value: number
): void {
  if (!gain) return;
  try {
    gain.gain.value = value;
  } catch {
    // Ignore si le node est invalide
  }
}
