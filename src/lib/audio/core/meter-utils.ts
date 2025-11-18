// Utilitaires partagés pour l’affichage des vumètres (échelles dBFS, logique de peak hold)
// On garde ici uniquement des calculs purs, sans effets de bord, afin d’éviter
// les réallocations / allocations dans les boucles de rendu UI.

/**
 * Graduation standard pour les pistes (en dBFS).
 * Utilisé pour dessiner les repères sur le vumètre de tranche.
 */
export const DBFS_TRACK_TICKS: readonly number[] = [-48, -36, -24, -12, 0];

/**
 * Graduation plus fine pour le master (en dBFS).
 * Utilisé pour le vumètre master/stéréo.
 */
export const DBFS_MASTER_TICKS: readonly number[] = [-54,-48,-42,-36,-30,-24,-18,-12,-6, 0];

/**
 * Conversion dB → linéaire.
 * dbToLin(0) = 1
 * dbToLin(-6) ≈ 0.5
 */
export function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Conversion linéaire → dBFS.
 * linToDb(1)  = 0 dB
 * linToDb(0.5) ≈ -6 dB
 * lin <= 0 → -Infinity (mute total)
 */
export function linToDb(lin: number): number {
  if (lin <= 0) return -Infinity;
  return 20 * Math.log10(lin);
}

/**
 * Choix de couleur en fonction du RMS (linéaire 0..1).
 * - < 0.7 : vert
 * - 0.7..0.9 : orange (amber)
 * - >= 0.9 : rouge (zone de danger/saturation)
 */
export function rmsColor(rmsLin: number): string {
  if (rmsLin >= 0.9) return "#ef4444"; // rouge
  if (rmsLin >= 0.7) return "#f59e0b"; // orange
  return "#22c55e"; // vert
}

/**
 * Structure de state pour le peak hold :
 * - peakHold : valeur de crête mémorisée (linéaire 0..1)
 * - lastUpdate : timestamp (ms) du dernier update
 *
 * Cette structure est mutée par updatePeakHold pour éviter les allocations.
 */
export interface PeakHoldState {
  peakHold: number;   // crête mémorisée (lin 0..1)
  lastUpdate: number; // timestamp en millisecondes
}

/**
 * Initialise un état de peak hold à zéro.
 */
export function initPeakHold(): PeakHoldState {
  return { peakHold: 0, lastUpdate: 0 };
}

/**
 * Met à jour le peak hold.
 *
 * Règle :
 * - Si la crête actuelle (currentPeak) > peakHold → remplacement immédiat.
 * - Sinon, on laisse le peakHold décroître de manière exponentielle dans le temps.
 *
 * @param state        État mutable du peak hold (PeakHoldState)
 * @param currentPeak  Crête actuelle (linéaire 0..1)
 * @param now          Timestamp actuel en ms (ex: performance.now() ou Date.now())
 * @param decayRateLin Facteur de rétention par seconde :
 *                     ex. 0.6 → après 1s, il reste 60% de la valeur initiale.
 *
 * @returns Nouvelle valeur de peakHold (linéaire 0..1)
 */
export function updatePeakHold(
  state: PeakHoldState,
  currentPeak: number,
  now: number,
  decayRateLin = 0.6,
): number {
  // Nouveau peak plus fort : on remplace immédiatement
  if (currentPeak >= state.peakHold) {
    state.peakHold = currentPeak;
    state.lastUpdate = now;
    return state.peakHold;
  }

  const elapsed = (now - state.lastUpdate) / 1000;
  if (elapsed <= 0) return state.peakHold;

  // Décroissance exponentielle : hold *= decayRateLin ^ elapsed
  const retained = Math.pow(decayRateLin, elapsed);
  state.peakHold *= retained;
  state.lastUpdate = now;

  // Sécurité : si la crête actuelle est redevenue plus forte que le hold, on remonte
  if (currentPeak > state.peakHold) state.peakHold = currentPeak;

  return state.peakHold;
}
