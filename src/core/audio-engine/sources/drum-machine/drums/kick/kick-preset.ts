
// -----------------------------------------------------------------------------
// Baseline / classiques
// -----------------------------------------------------------------------------

import { KickParams } from "../../types"

export const KICK_DEFAULT: KickParams = {
  waveform: "sine",
  pitchStartHz: 150,
  pitchEndHz: 45,
  sweepMs: 120,
  sweepCurve: 0.25,
  level: 0.9,
  decayMs: 250,
  drive: 1.0,
  clickLevel: 0.2,
  clickMs: 6,
  hpDC: 0.995,

  distMode: "off",
  distAmount: 0,
  distMix: 1,
  distTone: 0.5,

  hpCutFreqHz: 28,
  shelfFreqHz: 2500,
  shelfGainDb: 0,
  shelfBypass: true,

  clipThreshold: 0.9,
  clipBypass: true,

  postFilterType: "none",
  postFilterFreqHz: 0,
  postFilterQ: 0.707,

  noiseLevel: 0,
  noiseDecayMs: 60,
  noiseHpHz: 2000,
}

export const KICK_909: KickParams = {
  level: 0.9,
  pitchStartHz: 95,
  pitchEndHz: 45,
  sweepMs: 30,
  sweepCurve: 0.5,
  decayMs: 180,
  drive: 1.2,
  clickLevel: 0.45,
  clickMs: 8,
  hpDC: 0.996,

  distMode: "soft",
  distAmount: 0.8,
  distMix: 0.8,
  distTone: 0.55,

  hpCutFreqHz: 28,
  shelfFreqHz: 3500,
  shelfGainDb: 1.5,
  shelfBypass: false,

  clipThreshold: 0.95,
  clipBypass: false,

  postFilterType: "none",
  postFilterFreqHz: 0,
  postFilterQ: 0.707,

  noiseLevel: 0,
}

export const KICK_808: Partial<KickParams> = {
  level: 0.85,
  pitchStartHz: 55,
  pitchEndHz: 38,
  sweepMs: 80,
  sweepCurve: 0.3,
  decayMs: 520,
  drive: 1.05,
  clickLevel: 0.18,
  clickMs: 5,
  hpDC: 0.995,

  distMode: "soft",
  distAmount: 0.4,
  distMix: 0.7,
  distTone: 0.45,

  hpCutFreqHz: 26,
  shelfFreqHz: 3000,
  shelfGainDb: 0.5,
  shelfBypass: false,

  clipThreshold: 0.98,
  clipBypass: true,

  postFilterType: "none",
  postFilterFreqHz: 0,
  postFilterQ: 0.707,

  noiseLevel: 0,
}

// -----------------------------------------------------------------------------
// Tribe / rave / industrial “classiques”
// -----------------------------------------------------------------------------

export const KICK_TRIBE_HARDFLOOR: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 160,
  pitchEndHz: 55,
  sweepMs: 22,
  sweepCurve: 0.45,
  decayMs: 180,
  drive: 2.2,
  clickLevel: 0.6,
  clickMs: 7,
  hpDC: 0.996,

  distMode: "hard",
  distAmount: 2.5,
  distMix: 0.9,
  distTone: 0.6,

  hpCutFreqHz: 30,
  shelfFreqHz: 4000,
  shelfGainDb: 2.0,
  shelfBypass: false,

  clipThreshold: 0.85,
  clipBypass: false,

  postFilterType: "hp",
  postFilterFreqHz: 90,
  postFilterQ: 0.7,

  noiseLevel: 0.12,
  noiseDecayMs: 90,
  noiseHpHz: 2500,
}

export const KICK_FRENCHCORE_SLAM: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 220,
  pitchEndHz: 60,
  sweepMs: 18,
  sweepCurve: 0.3,
  decayMs: 150,
  drive: 3.0,
  clickLevel: 0.65,
  clickMs: 8,
  hpDC: 0.997,

  distMode: "fold",
  distAmount: 4.0,
  distMix: 1.0,
  distTone: 0.7,

  hpCutFreqHz: 32,
  shelfFreqHz: 5000,
  shelfGainDb: 3.0,
  shelfBypass: false,

  clipThreshold: 0.8,
  clipBypass: false,

  postFilterType: "bp",
  postFilterFreqHz: 420,
  postFilterQ: 2.5,

  noiseLevel: 0.2,
  noiseDecayMs: 120,
  noiseHpHz: 3000,
}

export const KICK_INDUSTRIAL_THUMP: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 120,
  pitchEndHz: 40,
  sweepMs: 35,
  sweepCurve: 0.25,
  decayMs: 260,
  drive: 2.5,
  clickLevel: 0.45,
  clickMs: 10,
  hpDC: 0.995,

  distMode: "hard",
  distAmount: 3.0,
  distMix: 0.85,
  distTone: 0.55,

  hpCutFreqHz: 30,
  shelfFreqHz: 3500,
  shelfGainDb: 1.5,
  shelfBypass: false,

  clipThreshold: 0.82,
  clipBypass: false,

  postFilterType: "lp",
  postFilterFreqHz: 4500,
  postFilterQ: 0.9,

  noiseLevel: 0.15,
  noiseDecayMs: 160,
  noiseHpHz: 2000,
}

export const KICK_RAVECORE: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 180,
  pitchEndHz: 48,
  sweepMs: 20,
  sweepCurve: 0.35,
  decayMs: 190,
  drive: 1.8,
  clickLevel: 0.7,
  clickMs: 6,
  hpDC: 0.996,

  distMode: "soft",
  distAmount: 2.2,
  distMix: 0.9,
  distTone: 0.65,

  hpCutFreqHz: 30,
  shelfFreqHz: 4500,
  shelfGainDb: 2.5,
  shelfBypass: false,

  clipThreshold: 0.86,
  clipBypass: false,

  postFilterType: "bp",
  postFilterFreqHz: 520,
  postFilterQ: 1.8,

  noiseLevel: 0.1,
  noiseDecayMs: 100,
  noiseHpHz: 2800,
}

// -----------------------------------------------------------------------------
// Gabber / Frenchcore variés
// -----------------------------------------------------------------------------

export const KICK_GABBER_RAW_01: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 240,
  pitchEndHz: 65,
  sweepMs: 15,
  sweepCurve: 0.25,
  decayMs: 140,
  drive: 2.5,
  clickLevel: 0.55,
  clickMs: 7,

  distMode: "fold",
  distAmount: 4.5,
  distMix: 1,
  distTone: 0.65,

  hpCutFreqHz: 32,
  shelfFreqHz: 5200,
  shelfGainDb: 3.5,

  clipThreshold: 0.75,
  clipBypass: false,

  postFilterType: "bp",
  postFilterFreqHz: 400,
  postFilterQ: 2.3,

  noiseLevel: 0.12,
  noiseDecayMs: 110,
  noiseHpHz: 3200,
}

export const KICK_GABBER_RAW_02: Partial<KickParams> = {
  level: 0.92,
  pitchStartHz: 200,
  pitchEndHz: 70,
  sweepMs: 12,
  sweepCurve: 0.22,
  decayMs: 120,
  drive: 3.2,
  clickLevel: 0.7,
  clickMs: 6,

  distMode: "bit",
  distAmount: 3.5,
  distMix: 1,
  distTone: 0.55,

  hpCutFreqHz: 36,
  shelfFreqHz: 6000,
  shelfGainDb: 4.0,

  clipThreshold: 0.78,

  postFilterType: "hp",
  postFilterFreqHz: 110,
  postFilterQ: 0.8,

  noiseLevel: 0.25,
  noiseDecayMs: 90,
  noiseHpHz: 4500,
}

export const KICK_GABBER_TONE_01: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 300,
  pitchEndHz: 48,
  sweepMs: 20,
  sweepCurve: 0.28,
  decayMs: 180,
  drive: 2.2,
  clickLevel: 0.4,
  clickMs: 8,

  distMode: "soft",
  distAmount: 2.0,
  distMix: 0.9,
  distTone: 0.7,

  hpCutFreqHz: 30,
  shelfFreqHz: 4500,
  shelfGainDb: 3,

  clipThreshold: 0.82,

  postFilterType: "bp",
  postFilterFreqHz: 520,
  postFilterQ: 3.0,

  noiseLevel: 0.08,
  noiseDecayMs: 100,
  noiseHpHz: 2500,
}

export const KICK_GABBER_TONE_02: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 280,
  pitchEndHz: 50,
  sweepMs: 22,
  sweepCurve: 0.3,
  decayMs: 160,
  drive: 1.8,
  clickLevel: 0.35,
  clickMs: 6,

  distMode: "soft",
  distAmount: 1.8,
  distMix: 0.85,
  distTone: 0.75,

  hpCutFreqHz: 34,
  shelfFreqHz: 4200,
  shelfGainDb: 1.5,

  clipThreshold: 0.84,

  postFilterType: "bp",
  postFilterFreqHz: 480,
  postFilterQ: 2.4,

  noiseLevel: 0.05,
  noiseDecayMs: 120,
  noiseHpHz: 3000,
}

export const KICK_GABBER_TERROR: Partial<KickParams> = {
  level: 1,
  pitchStartHz: 260,
  pitchEndHz: 40,
  sweepMs: 18,
  sweepCurve: 0.25,
  decayMs: 190,
  drive: 3.5,
  clickLevel: 0.75,
  clickMs: 9,

  distMode: "fold",
  distAmount: 5,
  distMix: 1,
  distTone: 0.6,

  hpCutFreqHz: 38,
  shelfFreqHz: 6500,
  shelfGainDb: 4,

  clipThreshold: 0.7,

  postFilterType: "none",

  noiseLevel: 0.3,
  noiseDecayMs: 150,
  noiseHpHz: 5000,
}

export const KICK_GABBER_BLACK_METAL: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 160,
  pitchEndHz: 50,
  sweepMs: 28,
  sweepCurve: 0.22,
  decayMs: 200,
  drive: 2.2,
  clickLevel: 0.5,
  clickMs: 12,

  distMode: "hard",
  distAmount: 4,
  distMix: 1,
  distTone: 0.3,

  hpCutFreqHz: 35,
  shelfFreqHz: 2500,
  shelfGainDb: -1,

  clipThreshold: 0.8,

  postFilterType: "lp",
  postFilterFreqHz: 3800,
  postFilterQ: 0.7,

  noiseLevel: 0.18,
  noiseDecayMs: 140,
  noiseHpHz: 1500,
}

// -----------------------------------------------------------------------------
// Hardstyle / Rawstyle / Gated
// -----------------------------------------------------------------------------

export const KICK_RAWSTYLE_01: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 300,
  pitchEndHz: 80,
  sweepMs: 10,
  sweepCurve: 0.25,
  decayMs: 140,
  drive: 2.5,
  clickLevel: 0.7,
  clickMs: 5,

  distMode: "hard",
  distAmount: 3,
  distMix: 1,
  distTone: 0.75,

  hpCutFreqHz: 40,
  shelfFreqHz: 4500,
  shelfGainDb: 2,

  clipThreshold: 0.8,

  postFilterType: "bp",
  postFilterFreqHz: 850,
  postFilterQ: 2.2,
}

export const KICK_RAWSTYLE_02: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 250,
  pitchEndHz: 65,
  sweepMs: 15,
  sweepCurve: 0.3,
  decayMs: 160,
  drive: 3.2,

  clickLevel: 0.6,
  clickMs: 6,

  distMode: "fold",
  distAmount: 4,
  distMix: 1,
  distTone: 0.8,

  hpCutFreqHz: 42,
  shelfFreqHz: 4800,
  shelfGainDb: 3,

  clipThreshold: 0.78,

  postFilterType: "bp",
  postFilterFreqHz: 700,
  postFilterQ: 3.5,
}

export const KICK_HARDSTYLE_CLEAN: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 260,
  pitchEndHz: 75,
  sweepMs: 12,
  sweepCurve: 0.28,
  decayMs: 150,
  drive: 1.6,

  clickLevel: 0.55,
  clickMs: 6,

  distMode: "soft",
  distAmount: 1.7,
  distMix: 0.85,
  distTone: 0.7,

  hpCutFreqHz: 35,
  shelfFreqHz: 4200,
  shelfGainDb: 1.5,

  clipThreshold: 0.86,

  postFilterType: "bp",
  postFilterFreqHz: 780,
  postFilterQ: 1.8,
}

// Gated kicks (hardstyle “gated”)

// gate = decay un peu plus long + tonalité medium marquée

export const KICK_HARDSTYLE_GATE_01: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 280,
  pitchEndHz: 85,
  sweepMs: 14,
  sweepCurve: 0.3,
  decayMs: 210,
  drive: 2.0,

  clickLevel: 0.6,
  clickMs: 6,

  distMode: "soft",
  distAmount: 2.5,
  distMix: 0.95,
  distTone: 0.7,

  hpCutFreqHz: 38,

  postFilterType: "bp",
  postFilterFreqHz: 900,
  postFilterQ: 2.4,
}

export const KICK_HARDSTYLE_GATE_02: Partial<KickParams> = {
  level: 0.92,
  pitchStartHz: 310,
  pitchEndHz: 90,
  sweepMs: 12,
  sweepCurve: 0.26,
  decayMs: 230,
  drive: 2.2,

  clickLevel: 0.7,
  clickMs: 5,

  distMode: "hard",
  distAmount: 3.2,
  distMix: 0.9,
  distTone: 0.75,

  hpCutFreqHz: 40,

  postFilterType: "bp",
  postFilterFreqHz: 950,
  postFilterQ: 2.6,
}

export const KICK_HARDSTYLE_GATE_DARK: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 260,
  pitchEndHz: 75,
  sweepMs: 16,
  sweepCurve: 0.22,
  decayMs: 240,
  drive: 2.4,

  clickLevel: 0.55,
  clickMs: 7,

  distMode: "hard",
  distAmount: 3.0,
  distMix: 0.85,
  distTone: 0.5,

  hpCutFreqHz: 36,

  postFilterType: "lp",
  postFilterFreqHz: 5500,
  postFilterQ: 0.9,
}

export const KICK_HARDSTYLE_GATE_BRIGHT: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 320,
  pitchEndHz: 95,
  sweepMs: 10,
  sweepCurve: 0.3,
  decayMs: 220,
  drive: 2.0,

  clickLevel: 0.7,
  clickMs: 5,

  distMode: "soft",
  distAmount: 2.3,
  distMix: 1,
  distTone: 0.9,

  hpCutFreqHz: 40,

  postFilterType: "bp",
  postFilterFreqHz: 1000,
  postFilterQ: 2.2,
}

// -----------------------------------------------------------------------------
// Uptempo / extra dirty
// -----------------------------------------------------------------------------

export const KICK_UPTEMPO_01: Partial<KickParams> = {
  level: 1,
  pitchStartHz: 230,
  pitchEndHz: 55,
  sweepMs: 10,
  sweepCurve: 0.2,
  decayMs: 130,
  drive: 3,

  clickLevel: 0.75,
  clickMs: 8,

  distMode: "fold",
  distAmount: 5,
  distMix: 1,
  distTone: 0.65,

  hpCutFreqHz: 40,

  postFilterType: "bp",
  postFilterFreqHz: 300,
  postFilterQ: 2.8,

  noiseLevel: 0.3,
  noiseDecayMs: 120,
  noiseHpHz: 4000,
}

export const KICK_UPTEMPO_02: Partial<KickParams> = {
  level: 0.98,
  pitchStartHz: 260,
  pitchEndHz: 80,
  sweepMs: 8,
  sweepCurve: 0.1,
  decayMs: 110,
  drive: 3.5,

  clickLevel: 0.9,
  clickMs: 5,

  distMode: "bit",
  distAmount: 4.2,
  distMix: 1,
  distTone: 0.5,

  hpCutFreqHz: 42,

  postFilterType: "hp",
  postFilterFreqHz: 140,
  postFilterQ: 1.4,

  noiseLevel: 0.25,
  noiseDecayMs: 90,
  noiseHpHz: 6000,
}

export const KICK_UPTEMPO_DARK: Partial<KickParams> = {
  level: 1,
  pitchStartHz: 180,
  pitchEndHz: 40,
  sweepMs: 25,
  sweepCurve: 0.3,
  decayMs: 180,
  drive: 2.8,

  clickLevel: 0.5,
  clickMs: 10,

  distMode: "hard",
  distAmount: 4,
  distMix: 0.9,
  distTone: 0.35,

  hpCutFreqHz: 36,

  postFilterType: "lp",
  postFilterFreqHz: 4200,
  postFilterQ: 0.9,

  noiseLevel: 0.2,
  noiseDecayMs: 150,
  noiseHpHz: 2500,
}

// -----------------------------------------------------------------------------
// Tok / Tail séparés (utile pour layer dans la drum-machine)
// -----------------------------------------------------------------------------

// TOK = attaque très courte, pitch haut, decay court
// TAIL = body plus long, plus grave, souvent moins de click

export const KICK_TOK_HARD_01: Partial<KickParams> = {
  level: 0.8,
  pitchStartHz: 400,
  pitchEndHz: 140,
  sweepMs: 6,
  sweepCurve: 0.2,
  decayMs: 60,
  drive: 1.8,
  clickLevel: 0.9,
  clickMs: 4,

  distMode: "soft",
  distAmount: 2.5,
  distMix: 1,
  distTone: 0.8,

  hpCutFreqHz: 80,
}

export const KICK_TAIL_HARD_01: Partial<KickParams> = {
  level: 0.95,
  pitchStartHz: 120,
  pitchEndHz: 45,
  sweepMs: 25,
  sweepCurve: 0.3,
  decayMs: 220,
  drive: 2.0,
  clickLevel: 0.1,
  clickMs: 4,

  distMode: "hard",
  distAmount: 2.5,
  distMix: 0.9,
  distTone: 0.6,

  hpCutFreqHz: 32,
  postFilterType: "bp",
  postFilterFreqHz: 500,
  postFilterQ: 2.0,
}

export const KICK_TOK_GABBER_01: Partial<KickParams> = {
  level: 0.85,
  pitchStartHz: 500,
  pitchEndHz: 180,
  sweepMs: 5,
  sweepCurve: 0.15,
  decayMs: 50,
  drive: 2.5,
  clickLevel: 1,
  clickMs: 4,

  distMode: "fold",
  distAmount: 4,
  distMix: 1,
  distTone: 0.7,

  hpCutFreqHz: 120,
}

export const KICK_TAIL_GABBER_01: Partial<KickParams> = {
  level: 1,
  pitchStartHz: 200,
  pitchEndHz: 55,
  sweepMs: 18,
  sweepCurve: 0.25,
  decayMs: 190,
  drive: 3,

  clickLevel: 0.2,
  clickMs: 6,

  distMode: "fold",
  distAmount: 4.5,
  distMix: 1,
  distTone: 0.6,

  hpCutFreqHz: 36,
  postFilterType: "bp",
  postFilterFreqHz: 420,
  postFilterQ: 2.3,
}

export const KICK_TOK_TECHNO_01: Partial<KickParams> = {
  level: 0.8,
  pitchStartHz: 320,
  pitchEndHz: 130,
  sweepMs: 8,
  sweepCurve: 0.3,
  decayMs: 70,
  drive: 1.6,
  clickLevel: 0.7,
  clickMs: 5,

  distMode: "soft",
  distAmount: 1.8,
  distMix: 0.9,
  distTone: 0.6,

  hpCutFreqHz: 70,
}

export const KICK_TAIL_TECHNO_01: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 110,
  pitchEndHz: 42,
  sweepMs: 35,
  sweepCurve: 0.35,
  decayMs: 260,
  drive: 2.0,
  clickLevel: 0.15,
  clickMs: 5,

  distMode: "hard",
  distAmount: 2.0,
  distMix: 0.85,
  distTone: 0.5,

  hpCutFreqHz: 28,
  postFilterType: "lp",
  postFilterFreqHz: 3800,
  postFilterQ: 0.8,
}

// -----------------------------------------------------------------------------
// Pack 12 kicks “calibrés” (variété de styles, paramétrés pour ton moteur)
// -----------------------------------------------------------------------------

export const KICK_PACK01_SUB_808: Partial<KickParams> = {
  ...KICK_808,
  level: 0.9,
  hpCutFreqHz: 26,
}

export const KICK_PACK02_PUNCH_909: Partial<KickParams> = {
  ...KICK_909,
  shelfGainDb: 2,
  clipThreshold: 0.9,
}

export const KICK_PACK03_TECHNO_DRY: Partial<KickParams> = {
  level: 0.85,
  pitchStartHz: 140,
  pitchEndHz: 42,
  sweepMs: 28,
  sweepCurve: 0.35,
  decayMs: 210,
  drive: 1.8,
  clickLevel: 0.35,
  clickMs: 7,

  distMode: "soft",
  distAmount: 1.5,
  distMix: 0.8,
  distTone: 0.55,

  hpCutFreqHz: 30,
}

export const KICK_PACK04_TECHNO_WARM: Partial<KickParams> = {
  ...KICK_PACK03_TECHNO_DRY,
  drive: 2.1,
  distMode: "soft",
  distAmount: 2.0,
  shelfFreqHz: 3800,
  shelfGainDb: 1.5,
}

export const KICK_PACK05_RUMBLE_SUB: Partial<KickParams> = {
  level: 0.85,
  pitchStartHz: 90,
  pitchEndHz: 35,
  sweepMs: 60,
  sweepCurve: 0.3,
  decayMs: 520,
  drive: 2.0,

  distMode: "soft",
  distAmount: 1.8,
  distMix: 0.9,
  distTone: 0.4,

  hpCutFreqHz: 25,
  postFilterType: "lp",
  postFilterFreqHz: 3200,
  postFilterQ: 0.7,
}

export const KICK_PACK06_GABBER_LITE: Partial<KickParams> = {
  level: 0.9,
  pitchStartHz: 220,
  pitchEndHz: 60,
  sweepMs: 18,
  sweepCurve: 0.3,
  decayMs: 160,
  drive: 2.4,

  distMode: "hard",
  distAmount: 3.0,
  distMix: 0.9,
  distTone: 0.65,

  hpCutFreqHz: 34,
  postFilterType: "bp",
  postFilterFreqHz: 380,
  postFilterQ: 2.0,
}

export const KICK_PACK07_UPTEMPO_MID: Partial<KickParams> = {
  ...KICK_UPTEMPO_01,
  distAmount: 4,
  postFilterFreqHz: 350,
}

export const KICK_PACK08_INDUSTRIAL_CRUSH: Partial<KickParams> = {
  ...KICK_INDUSTRIAL_THUMP,
  distMode: "fold",
  distAmount: 4.2,
  distMix: 0.95,
  noiseLevel: 0.22,
}

export const KICK_PACK09_TRIBE_GROOVE: Partial<KickParams> = {
  ...KICK_TRIBE_HARDFLOOR,
  decayMs: 210,
  shelfGainDb: 2.5,
}

export const KICK_PACK10_HARDSTYLE_TOK: Partial<KickParams> = {
  ...KICK_TOK_HARD_01,
  level: 0.9,
}

export const KICK_PACK11_HARDSTYLE_TAIL: Partial<KickParams> = {
  ...KICK_TAIL_HARD_01,
  drive: 2.3,
}

export const KICK_PACK12_RAVECLUB: Partial<KickParams> = {
  ...KICK_RAVECORE,
  distAmount: 2.6,
  distMix: 0.95,
  noiseLevel: 0.12,
}
