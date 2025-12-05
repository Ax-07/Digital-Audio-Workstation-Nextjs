import { TomParams } from "../../types"

// Tom aigu (rack high)
export const TOM_HIGH: TomParams = {
  style: "high",
  level: 0.85,
  bodyFreqHz: 260,
  pitchStartHz: 340,
  pitchEndHz: 220,
  sweepMs: 30,
  sweepCurve: 0.35,
  noiseMix: 0.22,
  noiseDecayMs: 90,
  noiseHpHz: 600,
  drive: 1.0,
  ampAttackMs: 2,
  ampDecayMs: 220,
  hpFreqHz: 60,
}

// Tom medium
export const TOM_MID: TomParams = {
  style: "mid",
  level: 0.9,
  bodyFreqHz: 200,
  pitchStartHz: 280,
  pitchEndHz: 180,
  sweepMs: 32,
  sweepCurve: 0.35,
  noiseMix: 0.24,
  noiseDecayMs: 130,
  noiseHpHz: 500,
  drive: 1.05,
  ampAttackMs: 2,
  ampDecayMs: 260,
  hpFreqHz: 55,
}

// Tom grave (rack low)
export const TOM_LOW: TomParams = {
  style: "low",
  level: 0.9,
  bodyFreqHz: 150,
  pitchStartHz: 230,
  pitchEndHz: 140,
  sweepMs: 36,
  sweepCurve: 0.4,
  noiseMix: 0.26,
  noiseDecayMs: 160,
  noiseHpHz: 450,
  drive: 1.1,
  ampAttackMs: 3,
  ampDecayMs: 320,
  hpFreqHz: 50,
}

// Floor tom (plus long, un peu plus sale → rock / metal friendly)
export const TOM_FLOOR: TomParams = {
  style: "floor",
  level: 0.95,
  bodyFreqHz: 110,
  pitchStartHz: 190,
  pitchEndHz: 90,
  sweepMs: 40,
  sweepCurve: 0.45,
  noiseMix: 0.3,
  noiseDecayMs: 220,
  noiseHpHz: 380,
  drive: 1.2,
  ampAttackMs: 4,
  ampDecayMs: 420,
  hpFreqHz: 45,
}
