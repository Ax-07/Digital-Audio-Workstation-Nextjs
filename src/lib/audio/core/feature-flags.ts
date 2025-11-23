// src/lib/audio/core/feature-flags.ts
// Centralisation des feature flags audio pour bascule / rollback.

// Flag global: active le routing piste v2 (TrackNodeChain pour toutes sources).
// Peut être échangé contre lecture d'une préférence utilisateur ou param URL.
export const USE_TRACK_CHANNEL_V2: boolean = true;

// Ensemble des pistes explicitement activées (si global OFF on peut activer granularité)
const perTrackEnable = new Set<string>();
// Ensemble des pistes explicitement désactivées (pour rollback ciblé si global ON)
const perTrackDisable = new Set<string>();

// Helper runtime pour bascule conditionnelle.
export function isTrackChannelV2Enabled(): boolean {
  return USE_TRACK_CHANNEL_V2;
}

/** Active le routing v2 pour une piste spécifique (même si global flag = false). */
export function enableTrackChannelV2For(trackId: string): void {
  perTrackDisable.delete(trackId); // priorité à enable
  perTrackEnable.add(trackId);
}

/** Désactive le routing v2 pour une piste (même si global flag = true). */
export function disableTrackChannelV2For(trackId: string): void {
  perTrackEnable.delete(trackId);
  perTrackDisable.add(trackId);
}

/** Retourne l'état effectif pour une piste donnée. */
export function isTrackChannelV2EnabledFor(trackId: string): boolean {
  if (perTrackDisable.has(trackId)) return false;
  if (perTrackEnable.has(trackId)) return true;
  return USE_TRACK_CHANNEL_V2;
}

/** Réinitialise toutes les surcharges (utilisé en rollback global). */
export function resetTrackChannelV2Overrides(): void {
  perTrackEnable.clear();
  perTrackDisable.clear();
}

/** Active en batch le routing v2 pour une liste de pistes. */
export function enableTrackChannelV2ForMany(trackIds: readonly string[]): void {
  for (const id of trackIds) {
    perTrackDisable.delete(id);
    perTrackEnable.add(id);
  }
}

/** Désactive en batch le routing v2 pour une liste de pistes. */
export function disableTrackChannelV2ForMany(trackIds: readonly string[]): void {
  for (const id of trackIds) {
    perTrackEnable.delete(id);
    perTrackDisable.add(id);
  }
}

/** Retourne l'état effectif sous forme de chaîne pour inspection/metrics. */
export function getTrackChannelV2Effective(trackId: string): 'v2' | 'legacy' {
  return isTrackChannelV2EnabledFor(trackId) ? 'v2' : 'legacy';
}

/** Résumé séparé des pistes v2 vs legacy (fournir liste pour limiter itération). */
export function summarizeTrackChannelV2(ids: Iterable<string>): { v2: string[]; legacy: string[] } {
  const v2: string[] = []; const legacy: string[] = [];
  for (const id of ids) (isTrackChannelV2EnabledFor(id) ? v2 : legacy).push(id);
  return { v2, legacy };
}
