import { HatParams } from "../../types";

export const CHINA_DEFAULT: HatParams = {
  // plus fort et plus long qu’un HH
  level: 0.95,
  toneMix: 0.7,
  noiseLevel: 0.9,
  partialsDetune: 10,
  drive: 1.6,

  // plus trash / long
  noiseDurSec: 0.45,
  ampAttackMs: 3,
  ampDecayMs: 700,
  hpFreqHz: 5000,
};
