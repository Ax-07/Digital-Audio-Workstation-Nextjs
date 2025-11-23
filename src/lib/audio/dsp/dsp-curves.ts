/**
 * Module DSP générique pour drums & synths
 * Regroupe helpers math et courbes réutilisables.
 * PERF: toutes les fonctions sont pures et n'allouent qu'un seul buffer résultat.
 */

/** Clamp une valeur entre [lo, hi] */
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Aligne un instant (secondes) sur un échantillon précis */
export const alignToSample = (t: number, sampleRate: number) => Math.round(t * sampleRate) / sampleRate

/** Sécurise un "when" pour éviter planification passée (margin par défaut 30 ms) */
export const safeWhen = (ctx: BaseAudioContext, when: number, margin = 0.03) =>
  when > ctx.currentTime + margin ? when : ctx.currentTime + margin

/** Velocity (0..1) vers gain musical (courbe douce) */
export const velToGain = (vel01: number) => Math.pow(clamp(vel01, 0, 1), 0.6) * 0.9

/** Courbe de distorsion tanh-like. amount ~0..3 recommandé */
export function makeDistortionCurve(amount: number, samples = 44100): Float32Array {
  const k = Math.max(0, amount) * 2.5
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; ++i) {
    const x = (i / (samples - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x)
  }
  return curve
}

/**
 * Variante de shaper utilisée par certains drums (snare/hat) — formule différente
 * Cette version reproduit la courbe originale dérivée d'un shaper polynomial/degénéré.
 */
export function makeAsymmetricDistortionCurve(amount: number, samples = 44100): Float32Array {
  const k = Math.max(0, amount - 1) * 50
  const curve: Float32Array = new Float32Array(samples)
  const deg = Math.PI / 180
  for (let i = 0; i < samples; ++i) {
    const x = (i * 2) / samples - 1
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x))
  }
  return curve
}

/**
 * Courbe exponentielle de sweep de fréquence.
 * f(t) = f0 * (f1/f0)^(r^k) avec r in [0,1].
 * kShape influe sur la vitesse du sweep (0-> rapide début / 1 -> linéaire)
 */
export function makeExpoSweepCurve(
  f0: number,
  f1: number,
  kShape: number,
  samples = 256
): Float32Array {
  const curve = new Float32Array(samples)
  const ratio = f1 / f0
  const k = clamp(kShape, 0.0001, 1)
  for (let i = 0; i < samples; i++) {
    const r = i / (samples - 1)
    const shaped = Math.pow(r, k)
    curve[i] = f0 * Math.pow(ratio, shaped)
  }
  return curve
}

/** Type générique du trigger audio réutilisable pour offline render */
export type GenericTriggerFn<P> = (
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  params: P
) => void
