import type { AudioEffect } from "@/lib/audio/fx/base"

export type Eq3Params = {
  lowGain: number // dB -18..18
  midGain: number // dB -18..18
  highGain: number // dB -18..18
  lowFreq: number // Hz 20..1000
  midFreq: number // Hz 100..6000
  midQ: number // 0.4..4
  highFreq: number // Hz 1000..20000
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

export class Eq3Effect implements AudioEffect<Partial<Eq3Params>> {
  readonly kind = "eq3" as const
  readonly input: BiquadFilterNode // entrée pratique = low
  readonly output: BiquadFilterNode // sortie pratique = high

  private low: BiquadFilterNode
  private mid: BiquadFilterNode
  private high: BiquadFilterNode

  private _lowFreq = 200
  private _midFreq = 1000
  private _midQ = 0.9
  private _highFreq = 8000
  private _lowGain = 0
  private _midGain = 0
  private _highGain = 0

  constructor(ctx: AudioContext, params?: Partial<Eq3Params>) {
    const low = ctx.createBiquadFilter()
    low.type = "lowshelf"
    const mid = ctx.createBiquadFilter()
    mid.type = "peaking"
    const high = ctx.createBiquadFilter()
    high.type = "highshelf"

    // routing
    low.connect(mid)
    mid.connect(high)

    this.low = low
    this.mid = mid
    this.high = high
    this.input = low
    this.output = high

    this.apply({
      lowFreq: params?.lowFreq ?? 200,
      midFreq: params?.midFreq ?? 1000,
      midQ: params?.midQ ?? 0.9,
      highFreq: params?.highFreq ?? 8000,
      lowGain: params?.lowGain ?? 0,
      midGain: params?.midGain ?? 0,
      highGain: params?.highGain ?? 0,
    })
  }

  private apply(p: Eq3Params) {
    this._lowFreq = clamp(p.lowFreq, 20, 1000)
    this._midFreq = clamp(p.midFreq, 100, 6000)
    this._midQ = clamp(p.midQ, 0.4, 4)
    this._highFreq = clamp(p.highFreq, 1000, 20000)
    this._lowGain = clamp(p.lowGain, -18, 18)
    this._midGain = clamp(p.midGain, -18, 18)
    this._highGain = clamp(p.highGain, -18, 18)

    this.low.frequency.value = this._lowFreq
    this.mid.frequency.value = this._midFreq
    this.mid.Q.value = this._midQ
    this.high.frequency.value = this._highFreq

    this.low.gain.value = this._lowGain
    this.mid.gain.value = this._midGain
    this.high.gain.value = this._highGain
  }

  update(params: Partial<Eq3Params>): void {
    const p: Eq3Params = {
      lowFreq: params.lowFreq ?? this._lowFreq,
      midFreq: params.midFreq ?? this._midFreq,
      midQ: params.midQ ?? this._midQ,
      highFreq: params.highFreq ?? this._highFreq,
      lowGain: params.lowGain ?? this._lowGain,
      midGain: params.midGain ?? this._midGain,
      highGain: params.highGain ?? this._highGain,
    }
    this.apply(p)
  }

  getParams(): Partial<Eq3Params> {
    return {
      lowFreq: this._lowFreq,
      midFreq: this._midFreq,
      midQ: this._midQ,
      highFreq: this._highFreq,
      lowGain: this._lowGain,
      midGain: this._midGain,
      highGain: this._highGain,
    }
  }

  disconnect(): void {
    try { this.low.disconnect() } catch {}
    try { this.mid.disconnect() } catch {}
    try { this.high.disconnect() } catch {}
  }

  dispose(): void {
    this.disconnect()
  }
}
