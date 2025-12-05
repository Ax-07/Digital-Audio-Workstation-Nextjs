import { AudioEffect, clamp } from "../base"

export type ChorusParams = {
  rate: number // Hz 0.1..5
  depth: number // ms 1..20
  mix: number // 0..1
  delay: number // ms base delay 5..30
}

export class ChorusEffect implements AudioEffect<ChorusParams> {
  readonly kind = "chorus" as const
  readonly input: GainNode
  readonly output: GainNode

  private dryGain: GainNode
  private wetGain: GainNode
  private delay1: DelayNode
  private delay2: DelayNode
  private lfo1: OscillatorNode
  private lfo2: OscillatorNode
  private lfoGain1: GainNode
  private lfoGain2: GainNode
  private ctx: AudioContext

  private _rate = 0.8
  private _depthMs = 8
  private _delayMs = 20

  constructor(ctx: AudioContext, params?: Partial<ChorusParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.dryGain = ctx.createGain()
    this.wetGain = ctx.createGain()

    this.delay1 = ctx.createDelay(0.05)
    this.delay2 = ctx.createDelay(0.05)

    this.lfo1 = ctx.createOscillator()
    this.lfo2 = ctx.createOscillator()
    this.lfo1.type = 'sine'
    this.lfo2.type = 'sine'
    this.lfoGain1 = ctx.createGain()
    this.lfoGain2 = ctx.createGain()

    // routing: dry
    this.input.connect(this.dryGain).connect(this.output)
    // wet paths
    this.input.connect(this.delay1).connect(this.wetGain).connect(this.output)
    this.input.connect(this.delay2).connect(this.wetGain)

    // modulate delay times (seconds). Depth in ms converted to seconds /2 amplitude
    this.lfo1.connect(this.lfoGain1).connect(this.delay1.delayTime)
    this.lfo2.connect(this.lfoGain2).connect(this.delay2.delayTime)

    const p: ChorusParams = {
      rate: clamp(params?.rate ?? 0.8, 0.1, 5),
      depth: clamp(params?.depth ?? 8, 1, 20),
      mix: clamp(params?.mix ?? 0.5, 0, 1),
      delay: clamp(params?.delay ?? 20, 5, 30),
    }
    this.apply(p)

    try { this.lfo1.start() } catch {}
    try { this.lfo2.start() } catch {}
  }

  private apply(p: ChorusParams) {
    this._rate = p.rate
    this._depthMs = p.depth
    this._delayMs = p.delay

    const base = this._delayMs / 1000
    const amp = (this._depthMs / 1000) / 2
    this.delay1.delayTime.value = base
    this.delay2.delayTime.value = base

    this.lfo1.frequency.value = this._rate
    this.lfo2.frequency.value = this._rate * 1.1 // slight offset
    this.lfoGain1.gain.value = amp
    this.lfoGain2.gain.value = -amp // invert phase for stereo feel

    this.wetGain.gain.value = p.mix
    this.dryGain.gain.value = 1 - p.mix
  }

  update(params: Partial<ChorusParams>): void {
    const p: ChorusParams = {
      rate: clamp(params.rate ?? this._rate, 0.1, 5),
      depth: clamp(params.depth ?? this._depthMs, 1, 20),
      mix: clamp(params.mix ?? this.wetGain.gain.value, 0, 1),
      delay: clamp(params.delay ?? this._delayMs, 5, 30),
    }
    this.apply(p)
  }

  getParams(): ChorusParams {
    return {
      rate: this._rate,
      depth: this._depthMs,
      delay: this._delayMs,
      mix: this.wetGain.gain.value,
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.dryGain.disconnect() } catch {}
    try { this.wetGain.disconnect() } catch {}
    try { this.delay1.disconnect() } catch {}
    try { this.delay2.disconnect() } catch {}
    try { this.lfo1.disconnect() } catch {}
    try { this.lfo2.disconnect() } catch {}
    try { this.lfoGain1.disconnect() } catch {}
    try { this.lfoGain2.disconnect() } catch {}
  }

  dispose(): void {
    try { this.lfo1.stop() } catch {}
    try { this.lfo2.stop() } catch {}
    this.disconnect()
  }
}
