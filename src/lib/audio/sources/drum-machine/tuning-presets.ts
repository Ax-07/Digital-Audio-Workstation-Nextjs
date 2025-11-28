import { midiToFreq } from "../../synth/synth-utils";
import type { DrumPreset, DeepPartial } from "./types";

/**
 * Construit un patch de preset qui accorde les toms autour d'une note racine.
 * @param rootNote note MIDI (ex: 48 = C2, 50 = D2, etc.)
 */
export function buildRockTuning(rootNote: number): DeepPartial<DrumPreset> {
  const kickNote = rootNote - 24; // une octave en dessous de la tonique
  const floorNote = rootNote;        // tonique
  const lowNote   = rootNote + 3;    // tierce
  const midNote   = rootNote + 5;    // quinte
  const snareNote = rootNote + 7;     // sixte / septième selon la gamme
  const highNote  = rootNote + 7;    // sixte / septième selon la gamme

  const kickHz  = midiToFreq(kickNote);
  const floorHz = midiToFreq(floorNote);
  const lowHz   = midiToFreq(lowNote);
  const midHz   = midiToFreq(midNote);
  const highHz  = midiToFreq(highNote);

  return {
    kick: {
      pitchEndHz: kickHz,
    },
    snare: {
      bodyFreqHz: snareNote,
    },
    toms: {
      floor: {
        bodyFreqHz: floorHz,
        pitchEndHz: floorHz,
      },
      low: {
        bodyFreqHz: lowHz,
        pitchEndHz: lowHz,
      },
      mid: {
        bodyFreqHz: midHz,
        pitchEndHz: midHz,
      },
      high: {
        bodyFreqHz: highHz,
        pitchEndHz: highHz,
      },
    },
  };
}

/**
 * Accordage "METAL" réaliste :
 * - Kick un peu plus haute que rock (plus percutante)
 * - Toms plus resserrés et un peu plus aigus
 *   pour traverser le mix (guitares saturées, basse etc.)
 *
 * @param rootNote note MIDI (ex: 48 = C2, 50 = D2, etc.)
 */
export function buildMetalTuning(rootNote: number): DeepPartial<DrumPreset> {
  // Kick ~ une octave sous la tonique, mais un poil plus haute qu'en rock
  const kickNote = rootNote - 10; // au lieu de -12

  // Toms : intervalles plus "tight"
  const floorNote = rootNote;      // tonique
  const lowNote   = rootNote + 4;  // tierce majeure
  const midNote   = rootNote + 7;  // quinte
  const highNote  = rootNote + 10; // sixte (un peu plus haut, ça perce)

  const kickHz  = midiToFreq(kickNote);
  const floorHz = midiToFreq(floorNote);
  const lowHz   = midiToFreq(lowNote);
  const midHz   = midiToFreq(midNote);
  const highHz  = midiToFreq(highNote);

  return {
    // Kick plus "punchy" : fondamentale + un peu de sweep
    kick: {
      pitchEndHz: kickHz,
      pitchStartHz: kickHz * 1.5, // plus d'attaque / click
    },

    toms: {
      floor: {
        bodyFreqHz: floorHz,
        pitchEndHz: floorHz,
      },
      low: {
        bodyFreqHz: lowHz,
        pitchEndHz: lowHz,
      },
      mid: {
        bodyFreqHz: midHz,
        pitchEndHz: midHz,
      },
      high: {
        bodyFreqHz: highHz,
        pitchEndHz: highHz,
      },
    },

    // Snare + cymbales non modifiées pour rester réalistes
  };
}