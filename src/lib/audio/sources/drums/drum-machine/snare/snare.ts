import type { SnareParams } from "@/lib/audio/sources/drums/drum-machine/types"
import { makeAsymmetricDistortionCurve } from "@/lib/audio/dsp/dsp-curves"
import { renderSourceOffline } from "@/lib/audio/offline/render-source"

export function triggerSnare(
  ctx: BaseAudioContext,
  output: AudioNode,
  velocity: number,
  when: number,
  p: SnareParams
) {
  // Params normalisés
  const v = Math.max(0, Math.min(1, velocity / 127))
  const level = (p.level ?? 0.9) * v
  const attackMs = p.ampAttackMs ?? (p.ampAttackSec ? p.ampAttackSec * 1000 : 3)
  const decayMs = p.ampDecayMs ?? (p.ampDecaySec ? p.ampDecaySec * 1000 : 180)
  const totalDur = p.noiseDurSec ?? Math.max(decayMs / 1000, 0.15)
  const noisePortion = p.noiseMix ?? 0.8
  const bodyFreq = p.bodyFreqHz ?? 200
  const drive = p.drive ?? 1

  // Noisy branch
  const noiseSize = Math.floor(ctx.sampleRate * totalDur)
  const noiseBuffer = ctx.createBuffer(1, noiseSize, ctx.sampleRate)
  const noiseData = noiseBuffer.getChannelData(0)
  for (let i = 0; i < noiseSize; i++) noiseData[i] = Math.random() * 2 - 1
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.setValueAtTime(p.bpFreqHz ?? 1800, when); bp.Q.value = p.bpQ ?? 0.8
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.setValueAtTime(p.hpFreqHz ?? 700, when)
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0, when)
  noiseGain.gain.linearRampToValueAtTime(level * noisePortion, when + attackMs / 1000)
  noiseGain.gain.exponentialRampToValueAtTime(0.0007, when + decayMs / 1000)

  // Body branch (tonal ping)
  const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.setValueAtTime(bodyFreq, when)
  const bodyGain = ctx.createGain()
  const bodyPortion = 1 - noisePortion
  bodyGain.gain.setValueAtTime(0, when)
  bodyGain.gain.linearRampToValueAtTime(level * bodyPortion, when + attackMs / 1000)
  bodyGain.gain.exponentialRampToValueAtTime(0.0007, when + (decayMs * 0.8) / 1000)

  // Somme -> drive? -> sortie
  const sum = ctx.createGain()
  noise.connect(bp).connect(hp).connect(noiseGain).connect(sum)
  osc.connect(bodyGain).connect(sum)

  let last: AudioNode = sum
  if (drive > 1) {
    const shaper = ctx.createWaveShaper();
    const srcCurve = makeAsymmetricDistortionCurve(drive);
    const curve = new Float32Array(srcCurve.length);
    curve.set(srcCurve as unknown as ArrayLike<number>);
    shaper.curve = curve;
    sum.connect(shaper)
    last = shaper
  }
  last.connect(output)

  // Lancer/stopper
  noise.start(when); noise.stop(when + totalDur)
  osc.start(when); osc.stop(when + Math.max(totalDur, decayMs / 1000))
}

/** Rendu visuel (offline) pour l'éditeur — renvoie le canal mono */
export function renderSnareArray(
  params: SnareParams,
  opts: { sampleRate: number; durationMs: number; velocity?: number }
) {
  return renderSourceOffline<SnareParams>(triggerSnare, params, {
    sampleRate: opts.sampleRate,
    durationMs: opts.durationMs,
    velocity: opts.velocity ?? 120,
    startOffsetMs: 20,
    channels: 1,
  }).then((ch) => ch[0])
}
