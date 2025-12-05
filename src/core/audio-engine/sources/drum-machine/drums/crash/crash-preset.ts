import { HatParams } from "../../types";

export const CRASH1_DEFAULT: HatParams = {
  // Niveaux / mix
  level: 0.9,
  toneMix: 0.6,          // plus de partiels métalliques que le HH
  noiseLevel: 0.9,

  // Timbre
  partialsDetune: 3,     // léger detune
  drive: 1.4,

  // Durée plus longue qu’un HH
  noiseDurSec: 0.5,
  ampAttackMs: 3,
  ampDecayMs: 900,

  // Filtre un peu moins haut que HH, plus "large"
  hpFreqHz: 6000,
};

export const CRASH2_DEFAULT: HatParams = {
  level: 0.95,
  toneMix: 0.65,
  noiseLevel: 0.9,
  partialsDetune: 6,
  drive: 1.5,

  noiseDurSec: 0.55,
  ampAttackMs: 3,
  ampDecayMs: 1100,
  hpFreqHz: 5800,
};

export const RIDE_DEFAULT: HatParams = {
  level: 1,
  toneMix: 0.8,
  noiseLevel: 0.4,
  partialsDetune: 1,
  drive: 1.3,

  noiseDurSec: 0.15,
  ampAttackMs: 2,
  ampDecayMs: 1800,
  hpFreqHz: 4000,
};

export const RIDEBELL_DEFAULT: HatParams = {
  level: 1,
  toneMix: 1,
  noiseLevel: 0.2,
  partialsDetune: 0,
  drive: 1.4,

  noiseDurSec: 0.05,
  ampAttackMs: 1,
  ampDecayMs: 900,
  hpFreqHz: 3000,
};

export const SPLASH_DEFAULT: HatParams = {
  level: 0.9,
  toneMix: 0.55,
  noiseLevel: 0.8,
  partialsDetune: 5,
  drive: 1.3,

  noiseDurSec: 0.18,
  ampAttackMs: 2,
  ampDecayMs: 400,
  hpFreqHz: 7000,
};