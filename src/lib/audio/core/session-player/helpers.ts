// src/lib/audio/core/session-player/helpers.ts

/**
 * Génère une clé unique pour identifier un clip dans le pool.
 * Format: "trackId@clipId"
 */
export function makePoolKey(trackId: string, clipId: string): string {
  return `${trackId}@${clipId}`;
}

/**
 * Génère un identifiant stable pour une note MIDI.
 * Conforme au format MidiNote.id.
 */
export function makeMidiNoteId(
  clipId: string,
  pitch: number,
  time: number,
  duration: number,
  velocity: number | undefined
): string {
  const v = velocity ?? 0.8;
  return `${clipId}:${pitch}:${time.toFixed(4)}:${duration.toFixed(4)}:${v.toFixed(2)}`;
}

/**
 * Calcule le délai en millisecondes entre maintenant et un moment futur.
 */
export function calculateDelayMs(currentTime: number, targetTime: number): number {
  return Math.max(0, (targetTime - currentTime) * 1000);
}

/**
 * Anti-rebond pour les lancements de clips trop rapprochés.
 * @returns true si on doit ignorer le lancement
 */
export function shouldDebounce(
  lastTime: number | undefined,
  currentTime: number,
  thresholdSec: number = 0.05
): boolean {
  if (lastTime === undefined) return false;
  return currentTime - lastTime < thresholdSec;
}
