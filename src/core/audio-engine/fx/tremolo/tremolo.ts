import { AudioEffect, clamp } from "../base"

export type TremoloParams = {
  rate: number // Hz 0.1..20
  depth: number // 0..1
}

export class TremoloEffect implements AudioEffect<TremoloParams> {
  readonly kind = "tremolo" as const
  readonly input: GainNode
  readonly output: GainNode

  private gain: GainNode
  private lfo: OscillatorNode
  private lfoGain: GainNode
  private offset: ConstantSourceNode
  private ctx: AudioContext

  constructor(ctx: AudioContext, params?: Partial<TremoloParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.gain = ctx.createGain()
    this.lfo = ctx.createOscillator()
    this.lfo.type = "sine"
    this.lfoGain = ctx.createGain()
    this.offset = ctx.createConstantSource()

    // routing: input -> gain -> output
    this.input.connect(this.gain).connect(this.output)
    // LFO path: lfo -> lfoGain -> gain.gain
    this.lfo.connect(this.lfoGain).connect(this.gain.gain)
    // Offset ensures base gain ~ 1 - depth/2
    this.offset.connect(this.gain.gain)

    const p: TremoloParams = {
      rate: clamp(params?.rate ?? 5, 0.1, 20),
      depth: clamp(params?.depth ?? 0.5, 0, 1),
    }
    this.apply(p)

    // start modulation
    try { this.lfo.start() } catch {}
    try { this.offset.start() } catch {}
  }

  private apply(p: TremoloParams) {
    // depth -> set offset and lfoGain mapping:
    // gain(t) = 1 - depth/2 + sin(wt) * depth/2
    const depth = clamp(p.depth, 0, 1)
    const base = 1 - depth / 2
    const amp = depth / 2
    this.offset.offset.value = base
    this.lfoGain.gain.value = amp
    this.lfo.frequency.value = clamp(p.rate, 0.1, 20)
  }

  update(params: Partial<TremoloParams>): void {
    const depth = clamp(params.depth ?? (this.lfoGain.gain.value * 2), 0, 1)
    const rate = clamp(params.rate ?? this.lfo.frequency.value, 0.1, 20)
    this.apply({ depth, rate })
  }

  getParams(): TremoloParams {
    return {
      rate: this.lfo.frequency.value,
      depth: this.lfoGain.gain.value * 2, // inverse du mapping amp = depth/2
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.gain.disconnect() } catch {}
    try { this.lfo.disconnect() } catch {}
    try { this.lfoGain.disconnect() } catch {}
    try { this.offset.disconnect() } catch {}
  }

  dispose(): void {
    try { this.lfo.stop() } catch {}
    try { this.offset.stop() } catch {}
    this.disconnect()
  }
}
