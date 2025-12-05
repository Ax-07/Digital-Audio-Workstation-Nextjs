import { AudioEffect, clamp } from "../base"

export type DelayParams = {
  time: number // seconds, 0..2
  feedback: number // 0..0.95
  wet: number // 0..1 (dry = 1-wet)
}

export class DelayEffect implements AudioEffect<DelayParams> {
  readonly kind = "delay" as const
  readonly input: GainNode
  readonly output: GainNode

  private delay: DelayNode
  private feedback: GainNode
  private wetGain: GainNode
  private dryGain: GainNode

  private ctx: AudioContext

  constructor(ctx: AudioContext, params?: Partial<DelayParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.delay = ctx.createDelay(2.0)
    this.feedback = ctx.createGain()
    this.wetGain = ctx.createGain()
    this.dryGain = ctx.createGain()

    // Routing: input -> dry -> output
    //          input -> delay -> wet -> output
    this.input.connect(this.dryGain).connect(this.output)
    this.input.connect(this.delay).connect(this.wetGain).connect(this.output)
    // Feedback loop
    this.delay.connect(this.feedback).connect(this.delay)

    // Defaults
    const p: DelayParams = {
      time: clamp(params?.time ?? 0.3, 0, 2.0),
      feedback: clamp(params?.feedback ?? 0.35, 0, 0.95),
      wet: clamp(params?.wet ?? 0.25, 0, 1),
    }
    this.apply(p)
  }

  private apply(p: DelayParams) {
    this.delay.delayTime.value = p.time
    this.feedback.gain.value = p.feedback
    this.wetGain.gain.value = p.wet
    this.dryGain.gain.value = 1 - p.wet
  }

  update(params: Partial<DelayParams>): void {
    const p: DelayParams = {
      time: clamp(params.time ?? this.delay.delayTime.value, 0, 2.0),
      feedback: clamp(params.feedback ?? this.feedback.gain.value, 0, 0.95),
      wet: clamp(params.wet ?? this.wetGain.gain.value, 0, 1),
    }
    this.apply(p)
  }

  getParams(): DelayParams {
    return {
      time: this.delay.delayTime.value,
      feedback: this.feedback.gain.value,
      wet: this.wetGain.gain.value,
    }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch { /* noop */ }
    try { this.delay.disconnect() } catch { /* noop */ }
    try { this.feedback.disconnect() } catch { /* noop */ }
    try { this.wetGain.disconnect() } catch { /* noop */ }
    try { this.dryGain.disconnect() } catch { /* noop */ }
  }

  dispose(): void {
    this.disconnect()
  }
}
