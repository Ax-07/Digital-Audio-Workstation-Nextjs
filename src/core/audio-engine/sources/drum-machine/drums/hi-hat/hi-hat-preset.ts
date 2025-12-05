import { HatParams } from "../../types";

export const HIHAT_DEFAULT: HatParams = {
  noiseDurSec: 0.08,
  hpFreqHz: 8000,
  ampAttackSec: 0.002,
  ampPeak: 0.4,
  ampDecaySec: 0.06,
};

// Variante “bright” pour le closed
export const HIHAT_BRIGHT: Partial<HatParams> = {
  hpFreqHz: 9000,
  ampPeak: 0.5,
  ampDecaySec: 0.08,
};

// ✅ Open hi-hat par défaut (plus long)
export const HIHAT_OPEN_DEFAULT: HatParams = {
  noiseDurSec: 0.35,   // durée de bruit plus longue
  hpFreqHz: 7000,      // un poil moins coupé en haut
  ampAttackSec: 0.002,
  ampPeak: 0.6,
  ampDecaySec: 0.35,   // decay bien plus long
};

// ✅ Variante plus “metal”
export const HIHAT_OPEN_METAL: Partial<HatParams> = {
  hpFreqHz: 7500,
  ampPeak: 0.7,
  ampDecaySec: 0.45,
  toneMix: 0.4,
  drive: 1.2,
};
