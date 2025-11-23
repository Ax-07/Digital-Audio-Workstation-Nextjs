// Unités : TOUT en millisecondes, sauf fréquences en Hz, Q sans unité.
// Tous les champs optionnels → on normalise via defaults.

export type KickStyle =
  | "clean"
  | "analog"
  | "techno"
  | "gabber"
  | "frenchcore"
  | "hardstyle"
  | "uptempo"
  | "industrial"
  | "tribe";

export type KickDistMode = "off" | "soft" | "hard" | "fold" | "bit";

export type KickPostFilterType = "none" | "lp" | "hp" | "bp" | "notch";

export type KickNoiseColor = "white" | "pink" | "band";

export type KickParams = {
  // ---------------------------------------------------------------------------
  // CORE OSC (body principal du kick)
  // ---------------------------------------------------------------------------
  waveform?: OscillatorType;     // ex: "sine" pour 808/909

  // Pitch sweep principal (body)
  pitchStartHz: number;          // ex: 150
  pitchEndHz: number;            // ex: 45
  sweepMs?: number;              // durée du sweep pitch
  sweepCurve?: number;           // 0..1 (0 = expo raide, 0.5 = linéaire)

  // Amplitude principale
  level?: number;                // 0..1 (gain global du kick)
  decayMs?: number;              // 60..800 (durée du body)
  ampAttackMs?: number;          // attaque (0..20 ms)
  ampHoldMs?: number;            // éventuel hold pour gated-style
  ampCurve?: number;             // 0..1 (shape de decay: expo, lin, etc.)

  // Saturation "soft" globale (avant la grosse disto)
  drive?: number;                // 0..3 (pré-disto douce / warmth)

  // Transient sinus (click simple)
  clickLevel?: number;           // 0..1
  clickMs?: number;              // 0..20

  // HP & DC global
  hpDC?: number;                 // 0.99..0.9999 (IIR DC blocker)
  hpCutFreqHz?: number;          // ex: 25..80 Hz (HP post global)

  // Pré-déclenchement pour l’engine
  preDelayMs?: number;           // ex: 0..40 ms

  // ---------------------------------------------------------------------------
  // DISTO / SHAPING MULTI-ÉTAGE
  // ---------------------------------------------------------------------------

  // Étape A : pré-drive / pre-shaping (avant body gain éventuellement)
  preDrive?: number;             // 0..3 (petit drive avant le reste)
  preTone?: number;              // 0..1 (macro sombre ↔ brillant)

  // Étape B : distorsion principale
  distMode?: KickDistMode;       // "off" | "soft" | "hard" | "fold" | "bit"
  distAmount?: number;           // 0..5 (quantité principale)
  distMix?: number;              // 0..1 (0 dry, 1 full wet)
  distTone?: number;             // 0..1 (tone macro sur la branche wet)

  distEnvEnabled?: boolean      // active la modulation
  distEnvAttackMs?: number      // 0-10ms
  distEnvHoldMs?: number        // 0-30ms
  distEnvDecayMs?: number       // 0-200ms
  distEnvAmount?: number        // 0..1 = combien la disto varie


  // Étape C : clipper / limiter
  clipThreshold?: number;        // 0.6..1.0
  clipSoftness?: number;         // 0..1 (0 = hard clip, 1 = soft knee)
  clipBypass?: boolean;          // true = pas de clip

  // ---------------------------------------------------------------------------
  // EQ / SHELF / POST-FILTER
  // ---------------------------------------------------------------------------
  shelfFreqHz?: number;          // fréquence high-shelf (ex: 2500..8000)
  shelfGainDb?: number;          // -12..+12 dB
  shelfBypass?: boolean;         // bypass du shelf

  postFilterType?: KickPostFilterType;
  postFilterFreqHz?: number;     // cutoff ou centre, selon le type
  postFilterQ?: number;          // 0.1..20 (Q / résonance)

  // ---------------------------------------------------------------------------
  // SUB LAYER (sous-basse interne)
  // ---------------------------------------------------------------------------
  subEnabled?: boolean;          // si false/undefined => pas de sub layer
  subLevel?: number;             // 0..1
  subWaveform?: OscillatorType;  // souvent "sine" ou "triangle"
  subFreqHz?: number;            // 20..80 si subFollowPitch=false
  subFollowPitch?: boolean;      // true = suit pitchEndHz (ou une note)
  subAttackMs?: number;          // 0..50 ms (rampe d’arrivée)
  subDecayMs?: number;           // 50..800 ms
  subDrive?: number;             // 0..3 (petit drive dédié au sub)

  // ---------------------------------------------------------------------------
  // TAIL LAYER (body tonal secondaire, style hardstyle/frenchcore)
  // ---------------------------------------------------------------------------
  tailEnabled?: boolean;         // active/désactive ce layer
  tailLevel?: number;            // 0..1
  tailWaveform?: OscillatorType; // osc du tail
  tailStartHz?: number;          // début du sweep
  tailEndHz?: number;            // fin du sweep
  tailSweepMs?: number;          // durée de sweep pitch
  tailSweepCurve?: number;       // 0..1 shape
  tailDecayMs?: number;          // decay amplitude du tail

  // ---------------------------------------------------------------------------
  // TOK LAYER (attaque très courte, tok hardstyle/gabber)
  // ---------------------------------------------------------------------------
  tokEnabled?: boolean;
  tokLevel?: number;             // 0..1
  tokWaveform?: OscillatorType;  // souvent "square"/"sawtooth"
  tokHz?: number;                // 200..1000 Hz
  tokSweepMs?: number;           // 0..15 ms (pitch drop très court)
  tokDecayMs?: number;           // 5..80 ms
  tokDrive?: number;             // 0..5 (drive sur le tok)

  // ---------------------------------------------------------------------------
  // NOISE / TRANSIENT NOISY (plus avancé que click sinus)
  // ---------------------------------------------------------------------------
  noiseEnabled?: boolean;
  noiseLevel?: number;           // 0..1
  noiseColor?: KickNoiseColor;   // "white" | "pink" | "band"

  noiseDecayMs?: number;         // 5..200 ms
  noiseHpHz?: number;            // high-pass sur le bruit (500..8000)
  noiseBpHz?: number;            // centre du band-pass si "band"
  noiseBpQ?: number;             // 0.5..10

  // ---------------------------------------------------------------------------
  // MODS & VELOCITY (facultatif, pour expressivité)
  // ---------------------------------------------------------------------------
  velToAmp?: number;             // 0..1 (sensibilité de level à la vélocité)
  velToTone?: number;            // 0..1 (impact sur distTone / shelf/ etc.)
  velToDist?: number;            // 0..1 (impact sur distAmount)

  // Gain de compensation final optionnel (1.0 = no change)
  // Permet d'augmenter ou réduire le niveau de sortie du preset sans toucher
  // la chaîne FX interne. Ex: 1.2 pour +1.5 dB environ.
  makeupGain?: number

  // ---------------------------------------------------------------------------
  // MACROS / STYLE (pour presets & UI)
  // ---------------------------------------------------------------------------
  style?: KickStyle;             // "gabber", "frenchcore", etc. (meta info)

  // ---------------------------------------------------------------------------
  // Compatibilité legacy (en secondes)
  // ---------------------------------------------------------------------------
  pitchDecaySec?: number;        // version en secondes de sweep/decay pitch
  ampAttackSec?: number;         // version en secondes de l’attaque
  ampPeak?: number;              // ancien pic d’amp éventuel
  ampDecaySec?: number;          // version en secondes du decay
};

export type SnareParams = {
  // Timbre
  bodyFreqHz?: number;           // résonance "tonale" (ex 180..230)
  noiseMix?: number;             // 0..1 (0=tonal, 1=bruit)
  drive?: number;                // 0..3
  level?: number;                // 0..1
  // Durées / filtres
  decayMs?: number;              // 100..300
  bpFreqHz?: number;             // si tu utilises un BP sur le bruit
  bpQ?: number;                  // 0.5..10
  hpFreqHz?: number;             // coupe-bas bruit (ex 200..400)
  // Enveloppe amplitude (ms)
  ampAttackMs?: number;
  ampDecayMs?: number;
  ampSustain?: number;           // 0..1 (souvent 0)
  ampReleaseMs?: number;
  // Compat héritée (sec)
  noiseDurSec?: number;
  ampAttackSec?: number;
  ampPeak?: number;
  ampDecaySec?: number;
};

export type HatParams = {
  // Timbre
  toneMix?: number;              // 0..1 (partials métalliques vs bruit)
  noiseLevel?: number;           // 0..1
  partialsDetune?: number;       // cents (-20..+20)
  drive?: number;                // 0..3
  level?: number;                // 0..1
  // Durées / filtres
  decayMs?: number;              // 40..120 (closed)
  hpFreqHz?: number;             // coupe-bas élevé (ex 5k..8k selon modèle)
  // Enveloppe amplitude (ms)
  ampAttackMs?: number;
  ampDecayMs?: number;
  ampSustain?: number;           // 0..1
  ampReleaseMs?: number;
  // Compat héritée (sec)
  noiseDurSec?: number;
  ampAttackSec?: number;
  ampPeak?: number;
  ampDecaySec?: number;
};

// Preset complet des trois instruments
export type DrumPreset = {
  kick: KickParams;
  snare: SnareParams;
  hh: HatParams;
};

// Utilitaire de type partiel profond (pour les patches de preset)
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
