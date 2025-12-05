import { AudioEffect, clamp } from "../base"

export type AutoFilterParams = {
  rate: number // Hz 0.1..20
  depth: number // 0..1 (mod depth between min/max)
  minFreq: number // Hz 20..1000
  maxFreq: number // Hz 500..20000
  type: BiquadFilterType // 'lowpass' | 'highpass' | 'bandpass' | etc.
}

export class AutoFilterEffect implements AudioEffect<AutoFilterParams> {
  readonly kind = "auto-filter" as const
  readonly input: GainNode
  readonly output: GainNode

  private filter: BiquadFilterNode
  private lfo: OscillatorNode
  private lfoGain: GainNode
  private offset: ConstantSourceNode
  private ctx: AudioContext

  private _min = 200
  private _max = 8000

  constructor(ctx: AudioContext, params?: Partial<AutoFilterParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.filter = ctx.createBiquadFilter()
    this.filter.type = params?.type ?? 'lowpass'

    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfoGain = ctx.createGain()
    this.offset = ctx.createConstantSource()

    // routing: input -> filter -> output
    this.input.connect(this.filter).connect(this.output)
    // modulation: (offset + lfo*gain) -> filter.frequency
    this.offset.connect(this.filter.frequency)
    this.lfo.connect(this.lfoGain).connect(this.filter.frequency)

    const p: AutoFilterParams = {
      rate: clamp(params?.rate ?? 1, 0.1, 20),
      depth: clamp(params?.depth ?? 0.8, 0, 1),
      minFreq: clamp(params?.minFreq ?? 200, 20, 1000),
      maxFreq: clamp(params?.maxFreq ?? 8000, 500, 20000),
      type: params?.type ?? 'lowpass',
    }
    this.apply(p)

    try { this.lfo.start() } catch {}
    try { this.offset.start() } catch {}
  }

  private apply(p: AutoFilterParams) {
    this._min = clamp(p.minFreq, 20, 1000)
    this._max = clamp(p.maxFreq, 500, 20000)
    if (this._max < this._min) [this._min, this._max] = [this._max, this._min]

    const span = this._max - this._min
    const depthHz = span * clamp(p.depth, 0, 1)
    const base = this._min + depthHz / 2
    const amp = depthHz / 2

    this.filter.type = p.type
    this.offset.offset.value = base
    this.lfoGain.gain.value = amp
    this.lfo.frequency.value = clamp(p.rate, 0.1, 20)
  }

  update(params: Partial<AutoFilterParams>): void {
    const p: AutoFilterParams = {
      rate: clamp(params.rate ?? this.lfo.frequency.value, 0.1, 20),
      depth: clamp(params.depth ?? (this.lfoGain.gain.value * 2 / (this._max - this._min)), 0, 1),
      minFreq: clamp(params.minFreq ?? this._min, 20, 1000),
      maxFreq: clamp(params.maxFreq ?? this._max, 500, 20000),
      type: params.type ?? this.filter.type,
    }
    this.apply(p)
  }

  getParams(): AutoFilterParams {
    return {
      rate: this.lfo.frequency.value,
      // reconstruire depth: amp = lfoGain.gain.value, span = _max - _min => depth = (2*amp)/span
      depth: (2 * this.lfoGain.gain.value) / (this._max - this._min),
      minFreq: this._min,
      maxFreq: this._max,
      type: this.filter.type,
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.filter.disconnect() } catch {}
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
