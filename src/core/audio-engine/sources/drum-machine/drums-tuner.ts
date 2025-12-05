import { drumMachine } from "./drum-machine";
import { buildRockTuning } from "./tuning-presets";

export function tuneTomsToRoot(trackId: string, rootNote: number) {
  const patch = buildRockTuning(rootNote);
  drumMachine.setTrackPreset(trackId, patch);
}

// // Exemple : accorder les toms sur D2 (Ré)
// tuneTomsToRoot(trackId, 50);
