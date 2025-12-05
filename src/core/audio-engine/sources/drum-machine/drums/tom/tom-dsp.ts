import { makeAsymmetricDistortionCurve } from "@/core/audio-engine/dsp/dsp-curves"
import { renderSourceOffline } from "@/core/audio-engine/offline/render-source"
import { TomParams } from "../../types"

export function triggerTom(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: TomParams
) {
  // Normalisation des params
  const v = Math.max(0, Math.min(1, velocity / 127))
  const level = (p.level ?? 0.9) * v

  const baseFreq = p.bodyFreqHz ?? p.pitchEndHz ?? 140
  const pitchStartHz = p.pitchStartHz ?? baseFreq * 1.4
  const pitchEndHz = p.pitchEndHz ?? baseFreq
  const sweepMs = p.sweepMs ?? 40
  const sweepCurve = p.sweepCurve ?? 0.4

  const noiseMix = p.noiseMix ?? 0.25
  const noiseDecayMs = p.noiseDecayMs ?? 120
  const noiseHpHz = p.noiseHpHz ?? 400

  const drive = p.drive ?? 1.0

  const ampAttackMs = p.ampAttackMs ?? (p.ampAttackSec ? p.ampAttackSec * 1000 : 2)
  const ampDecayMs = p.ampDecayMs ?? (p.ampDecaySec ? p.ampDecaySec * 1000 : 320)

  const hpFreqHz = p.hpFreqHz ?? 40

  // ----- Body tonal -----
  const osc = ctx.createOscillator()
  osc.type = "sine"
  osc.frequency.setValueAtTime(Math.max(1, pitchStartHz), when)

  if (pitchStartHz > 0 && pitchEndHz > 0 && sweepMs > 0) {
    const tEnd = when + sweepMs / 1000
    const curve = Math.max(0, Math.min(1, sweepCurve))

    // On ne complique pas trop: expo ramp (comme un mini kick)
    if (curve <= 0.001) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, pitchEndHz), tEnd)
    } else if (curve >= 0.999) {
      osc.frequency.linearRampToValueAtTime(Math.max(1, pitchEndHz), tEnd)
    } else {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, pitchEndHz), tEnd)
    }
  }

  const bodyGain = ctx.createGain()
  const bodyLevel = level * (1 - noiseMix)
  bodyGain.gain.setValueAtTime(0, when)
  bodyGain.gain.linearRampToValueAtTime(bodyLevel, when + ampAttackMs / 1000)
  bodyGain.gain.exponentialRampToValueAtTime(0.0005, when + ampDecayMs / 1000)

  // ----- Noise d’attaque -----
  const noiseDurSec = Math.max(noiseDecayMs / 1000, ampDecayMs / 1000 * 0.5)
  const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDurSec), ctx.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)
  // FIX: Seed déterministe
  let seed = 555555555
  for (let i = 0; i < noiseData.length; i++) {
    seed = (1664525 * seed + 1013904223) % 4294967296
    noiseData[i] = (seed / 4294967296) * 2 - 1
  }

  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer

  const hpNoise = ctx.createBiquadFilter()
  hpNoise.type = "highpass"
  hpNoise.frequency.setValueAtTime(noiseHpHz, when)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0, when)
  noiseGain.gain.linearRampToValueAtTime(level * noiseMix, when + ampAttackMs / 1000)
  noiseGain.gain.exponentialRampToValueAtTime(0.0005, when + noiseDecayMs / 1000)

  // ----- Somme + drive + HP out -----
  const sum = ctx.createGain()
  osc.connect(bodyGain).connect(sum)
  noise.connect(hpNoise).connect(noiseGain).connect(sum)

  let last: AudioNode = sum
  if (drive > 1) {
    const shaper = ctx.createWaveShaper()
    const srcCurve = makeAsymmetricDistortionCurve(drive)
    const curve = new Float32Array(srcCurve.length)
    curve.set(srcCurve as unknown as ArrayLike<number>)
    shaper.curve = curve
    sum.connect(shaper)
    last = shaper
  }

  const hpOut = ctx.createBiquadFilter()
  hpOut.type = "highpass"
  hpOut.frequency.setValueAtTime(hpFreqHz, when)
  last.connect(hpOut).connect(output)

  // Lancement / stop
  const totalSec = Math.max(ampDecayMs, noiseDecayMs) / 1000 + 0.2
  osc.start(when)
  osc.stop(when + totalSec)
  noise.start(when)
  noise.stop(when + totalSec)
}

/** Rendu offline pour l’aperçu / éditeur */
export async function renderTomArray(
  params: TomParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
) {
  const ch = await renderSourceOffline<TomParams>(triggerTom, params, {
        sampleRate: opts.sampleRate,
        durationMs: opts.durationMs,
        velocity: opts.velocity ?? 120,
        startOffsetMs: 20,
        channels: 1,
    })
    return ch[0]
}
