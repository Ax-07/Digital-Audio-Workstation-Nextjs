import { AudioEffect, clamp } from "../base"

export type DistortionParams = {
  drive: number // 0..1
  tone: number // Hz 500..20000 (lowpass)
  wet: number // 0..1
}

function makeCurve(amount: number) {
  // amount 0..1 -> shape tanh-like
  const k = amount * 100 + 1
  const n = 1024
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x)
  }
  return curve
}

export class DistortionEffect implements AudioEffect<DistortionParams> {
  readonly kind = "distortion" as const
  readonly input: GainNode
  readonly output: GainNode

  private pre: GainNode
  private shaper: WaveShaperNode
  private tone: BiquadFilterNode
  private wetGain: GainNode
  private dryGain: GainNode
  private ctx: AudioContext

  private _drive = 0.5

  constructor(ctx: AudioContext, params?: Partial<DistortionParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.pre = ctx.createGain()
    this.shaper = ctx.createWaveShaper()
    this.tone = ctx.createBiquadFilter()
    this.tone.type = "lowpass"
    this.wetGain = ctx.createGain()
    this.dryGain = ctx.createGain()

    // routing: input -> pre -> shaper -> tone -> wet -> output
    //                   \------------------------------ dry -> output
    this.input.connect(this.pre).connect(this.shaper).connect(this.tone).connect(this.wetGain).connect(this.output)
    this.input.connect(this.dryGain).connect(this.output)

    const p: DistortionParams = {
      drive: clamp(params?.drive ?? 0.5, 0, 1),
      tone: clamp(params?.tone ?? 8000, 500, 20000),
      wet: clamp(params?.wet ?? 0.5, 0, 1),
    }
    this.apply(p)
  }

  private apply(p: DistortionParams) {
    this._drive = clamp(p.drive, 0, 1)
    this.shaper.curve = makeCurve(this._drive)
    this.pre.gain.value = 1 + this._drive * 19 // up to ~+25.5 dB pre-gain
    this.tone.frequency.value = p.tone
    this.wetGain.gain.value = p.wet
    this.dryGain.gain.value = 1 - p.wet
  }

  update(params: Partial<DistortionParams>): void {
    const p: DistortionParams = {
      drive: clamp(params.drive ?? this._drive, 0, 1),
      tone: clamp(params.tone ?? this.tone.frequency.value, 500, 20000),
      wet: clamp(params.wet ?? this.wetGain.gain.value, 0, 1),
    }
    this.apply(p)
  }

  getParams(): DistortionParams {
    return {
      drive: this._drive,
      tone: this.tone.frequency.value,
      wet: this.wetGain.gain.value,
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.pre.disconnect() } catch {}
    try { this.shaper.disconnect() } catch {}
    try { this.tone.disconnect() } catch {}
    try { this.wetGain.disconnect() } catch {}
    try { this.dryGain.disconnect() } catch {}
  }

  dispose(): void {
    this.disconnect()
  }
}
