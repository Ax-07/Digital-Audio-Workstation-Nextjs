import { AudioEffect, clamp } from "../base"

export type ReverbParams = {
  duration: number // seconds, 0.2..10
  decay: number // 0.5..6
  wet: number // 0..1 (dry = 1-wet)
}

function makeImpulseResponse(ctx: AudioContext, duration = 2.0, decay = 2.0) {
  const rate = ctx.sampleRate
  const length = Math.floor(rate * duration)
  const impulse = ctx.createBuffer(2, length, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return impulse
}

export class ReverbEffect implements AudioEffect<ReverbParams> {
  readonly kind = "reverb" as const
  readonly input: GainNode
  readonly output: GainNode

  private convolver: ConvolverNode
  private wetGain: GainNode
  private dryGain: GainNode
  private ctx: AudioContext

  private _duration: number
  private _decay: number

  constructor(ctx: AudioContext, params?: Partial<ReverbParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.convolver = ctx.createConvolver()
    this.convolver.normalize = false
    this.wetGain = ctx.createGain()
    this.dryGain = ctx.createGain()

    // Routing: input -> dry -> output
    //          input -> convolver -> wet -> output
    this.input.connect(this.dryGain).connect(this.output)
    this.input.connect(this.convolver).connect(this.wetGain).connect(this.output)

    const p: ReverbParams = {
      duration: clamp(params?.duration ?? 2.0, 0.2, 10),
      decay: clamp(params?.decay ?? 2.0, 0.5, 6),
      wet: clamp(params?.wet ?? 0.2, 0, 1),
    }
    this._duration = p.duration
    this._decay = p.decay
    this.apply(p)
  }

  private apply(p: ReverbParams) {
    if (!this.convolver.buffer || p.duration !== this._duration || p.decay !== this._decay) {
      this.convolver.buffer = makeImpulseResponse(this.ctx, p.duration, p.decay)
      this._duration = p.duration
      this._decay = p.decay
    }
    this.wetGain.gain.value = p.wet
    this.dryGain.gain.value = 1 - p.wet
  }

  update(params: Partial<ReverbParams>): void {
    const p: ReverbParams = {
      duration: clamp(params.duration ?? this._duration, 0.2, 10),
      decay: clamp(params.decay ?? this._decay, 0.5, 6),
      wet: clamp(params.wet ?? this.wetGain.gain.value, 0, 1),
    }
    this.apply(p)
  }

  getParams(): ReverbParams {
    return {
      duration: this._duration,
      decay: this._decay,
      wet: this.wetGain.gain.value,
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.convolver.disconnect() } catch {}
    try { this.wetGain.disconnect() } catch {}
    try { this.dryGain.disconnect() } catch {}
  }

  dispose(): void {
    this.disconnect()
  }
}
