import { AudioEffect, clamp } from "@/lib/audio/fx/base"

export type CompressorParams = {
  threshold: number // dB -60..0
  ratio: number // 1..20
  attack: number // s 0.001..0.2
  release: number // s 0.01..1
  knee: number // dB 0..40
  makeup: number // dB -12..12
}

export class CompressorEffect implements AudioEffect<CompressorParams> {
  readonly kind = "compressor" as const
  readonly input: GainNode
  readonly output: GainNode

  private comp: DynamicsCompressorNode
  private makeupGain: GainNode
  private ctx: AudioContext

  constructor(ctx: AudioContext, params?: Partial<CompressorParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.comp = ctx.createDynamicsCompressor()
    this.makeupGain = ctx.createGain()

    // routing: input -> compressor -> makeup -> output
    this.input.connect(this.comp).connect(this.makeupGain).connect(this.output)

    const p: CompressorParams = {
      threshold: clamp(params?.threshold ?? -24, -60, 0),
      ratio: clamp(params?.ratio ?? 4, 1, 20),
      attack: clamp(params?.attack ?? 0.01, 0.001, 0.2),
      release: clamp(params?.release ?? 0.1, 0.01, 1),
      knee: clamp(params?.knee ?? 30, 0, 40),
      makeup: clamp(params?.makeup ?? 0, -12, 12),
    }
    this.apply(p)
  }

  private apply(p: CompressorParams) {
    this.comp.threshold.value = p.threshold
    this.comp.ratio.value = p.ratio
    this.comp.attack.value = p.attack
    this.comp.release.value = p.release
    this.comp.knee.value = p.knee
    // makeup gain (dB -> linear)
    this.makeupGain.gain.value = Math.pow(10, p.makeup / 20)
  }

  update(params: Partial<CompressorParams>): void {
    const p: CompressorParams = {
      threshold: clamp(params.threshold ?? this.comp.threshold.value, -60, 0),
      ratio: clamp(params.ratio ?? this.comp.ratio.value, 1, 20),
      attack: clamp(params.attack ?? this.comp.attack.value, 0.001, 0.2),
      release: clamp(params.release ?? this.comp.release.value, 0.01, 1),
      knee: clamp(params.knee ?? this.comp.knee.value, 0, 40),
      makeup: clamp(params.makeup ?? (20 * Math.log10(this.makeupGain.gain.value)), -12, 12),
    }
    this.apply(p)
  }

  getParams(): CompressorParams {
    return {
      threshold: this.comp.threshold.value,
      ratio: this.comp.ratio.value,
      attack: this.comp.attack.value,
      release: this.comp.release.value,
      knee: this.comp.knee.value,
      makeup: this.makeupGain.gain.value,
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.comp.disconnect() } catch {}
    try { this.makeupGain.disconnect() } catch {}
  }

  dispose(): void {
    this.disconnect()
  }
}
