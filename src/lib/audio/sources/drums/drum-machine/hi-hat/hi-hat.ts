import type { HatParams } from "@/lib/audio/sources/drums/drum-machine/types"
import { makeAsymmetricDistortionCurve } from "@/lib/audio/dsp/dsp-curves"
import { renderSourceOffline } from "@/lib/audio/offline/render-source"

export function triggerHat(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: HatParams
) {
  // Params avancés
  const v = Math.max(0, Math.min(1, velocity / 127))
  const level = (p.level ?? 0.7) * v
  const attackMs = p.ampAttackMs ?? (p.ampAttackSec ? p.ampAttackSec * 1000 : 2)
  const decayMs = p.ampDecayMs ?? (p.ampDecaySec ? p.ampDecaySec * 1000 : 60)
  const dur = p.noiseDurSec ?? Math.max(decayMs / 1000, 0.05)
  const toneMix = p.toneMix ?? 0.3 // proportion de partiels métalliques
  const noiseLevel = p.noiseLevel ?? 1.0
  const detuneCents = p.partialsDetune ?? 0
  const drive = p.drive ?? 1

  // Bruit
  const noiseSize = Math.floor(ctx.sampleRate * dur)
  const noiseBuffer = ctx.createBuffer(1, noiseSize, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < noiseSize; i++) data[i] = Math.random() * 2 - 1
  const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer
  const hpNoise = ctx.createBiquadFilter(); hpNoise.type = "highpass"; hpNoise.frequency.setValueAtTime(p.hpFreqHz ?? 8000, when)
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0, when)
  noiseGain.gain.linearRampToValueAtTime(level * (1 - toneMix) * noiseLevel, when + attackMs / 1000)
  noiseGain.gain.exponentialRampToValueAtTime(0.0005, when + decayMs / 1000)

  // Partiels métalliques (3-4 oscillateurs haut perchés)
  const metalOut = ctx.createGain()
  metalOut.gain.setValueAtTime(0, when)
  metalOut.gain.linearRampToValueAtTime(level * toneMix, when + attackMs / 1000)
  metalOut.gain.exponentialRampToValueAtTime(0.0005, when + decayMs / 1000)

  const baseFreqs = [3000, 5200, 7200, 9100]
  const detuneRatio = Math.pow(2, detuneCents / 1200)
  for (const f of baseFreqs) {
    const osc = ctx.createOscillator(); osc.type = "square"; osc.frequency.setValueAtTime(f * detuneRatio, when)
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(f, when); bp.Q.value = 10
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25, when)
    osc.connect(bp).connect(g).connect(metalOut)
    osc.start(when); osc.stop(when + Math.max(dur, decayMs / 1000))
  }

  // Somme -> drive? -> sortie
  const sum = ctx.createGain()
  noise.connect(hpNoise).connect(noiseGain).connect(sum)
  metalOut.connect(sum)

  let last: AudioNode = sum
  if (drive > 1) {
    const shaper = ctx.createWaveShaper();
    const srcCurve = makeAsymmetricDistortionCurve(drive);
    const curve = new Float32Array(srcCurve.length);
    curve.set(srcCurve as unknown as ArrayLike<number>);
    shaper.curve = curve;
    sum.connect(shaper); last = shaper
  }
  last.connect(output)

  noise.start(when); noise.stop(when + dur)
}

export async function renderHatArray(
  params: HatParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
) {
  const ch = await renderSourceOffline<HatParams>(triggerHat, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  })
  return ch[0]
}
