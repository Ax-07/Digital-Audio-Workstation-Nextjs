import { AudioEffect, clamp } from "../base"

export type LimiterParams = {
  threshold: number // dB -24..0 (closer to 0 = softer)
  ratio: number // 10..20
  attack: number // s 0.0005..0.01
  release: number // s 0.01..0.2
  preGain: number // dB -12..12
}

export class LimiterEffect implements AudioEffect<LimiterParams> {
  readonly kind = "limiter" as const
  readonly input: GainNode
  readonly output: GainNode

  private pre: GainNode
  private comp: DynamicsCompressorNode
  private ctx: AudioContext

  constructor(ctx: AudioContext, params?: Partial<LimiterParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.pre = ctx.createGain()
    this.comp = ctx.createDynamicsCompressor()

    // routing: input -> pre -> comp -> output
    this.input.connect(this.pre).connect(this.comp).connect(this.output)

    const p: LimiterParams = {
      threshold: clamp(params?.threshold ?? -1, -24, 0),
      ratio: clamp(params?.ratio ?? 20, 10, 20),
      attack: clamp(params?.attack ?? 0.003, 0.0005, 0.01),
      release: clamp(params?.release ?? 0.05, 0.01, 0.2),
      preGain: clamp(params?.preGain ?? 0, -12, 12),
    }
    this.apply(p)
  }

  private apply(p: LimiterParams) {
    this.comp.threshold.value = p.threshold
    this.comp.ratio.value = p.ratio
    this.comp.attack.value = p.attack
    this.comp.release.value = p.release
    this.pre.gain.value = Math.pow(10, p.preGain / 20)
  }

  update(params: Partial<LimiterParams>): void {
    const p: LimiterParams = {
      threshold: clamp(params.threshold ?? this.comp.threshold.value, -24, 0),
      ratio: clamp(params.ratio ?? this.comp.ratio.value, 10, 20),
      attack: clamp(params.attack ?? this.comp.attack.value, 0.0005, 0.01),
      release: clamp(params.release ?? this.comp.release.value, 0.01, 0.2),
      preGain: clamp(params.preGain ?? (20 * Math.log10(this.pre.gain.value)), -12, 12),
    }
    this.apply(p)
  }

  getParams(): LimiterParams {
    return {
      threshold: this.comp.threshold.value,
      ratio: this.comp.ratio.value,
      attack: this.comp.attack.value,
      release: this.comp.release.value,
      preGain: 20 * Math.log10(this.pre.gain.value),
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.pre.disconnect() } catch {}
    try { this.comp.disconnect() } catch {}
  }

  dispose(): void {
    this.disconnect()
  }
}
