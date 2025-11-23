import { AudioEffect, clamp } from "@/lib/audio/fx/base"

export type StereoWidenerParams = {
  width: number // 0..2 (1 = unchanged)
}

export class StereoWidenerEffect implements AudioEffect<StereoWidenerParams> {
  readonly kind = "stereo-widener" as const
  readonly input: GainNode
  readonly output: GainNode

  private splitter: ChannelSplitterNode
  private merger: ChannelMergerNode

  private l: GainNode
  private r: GainNode
  private mL: GainNode
  private mR: GainNode
  private sL: GainNode
  private sR: GainNode
  private outL: GainNode
  private outR: GainNode

  private ctx: AudioContext
  private _width = 1

  constructor(ctx: AudioContext, params?: Partial<StereoWidenerParams>) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.splitter = ctx.createChannelSplitter(2)
    this.merger = ctx.createChannelMerger(2)

    // gains
    this.l = ctx.createGain()
    this.r = ctx.createGain()
    this.mL = ctx.createGain() // for Mid computation
    this.mR = ctx.createGain()
    this.sL = ctx.createGain() // for Side computation
    this.sR = ctx.createGain()
    this.outL = ctx.createGain()
    this.outR = ctx.createGain()

    // input -> splitter
    this.input.connect(this.splitter)

    // Split to L and R
    this.splitter.connect(this.l, 0)
    this.splitter.connect(this.r, 1)

    // Compute Mid (M = (L+R)/2) to both outputs
    this.l.connect(this.mL)
    this.r.connect(this.mR)
    this.mL.gain.value = 0.5
    this.mR.gain.value = 0.5
    // Sum M into both output channels
    this.mL.connect(this.outL)
    this.mR.connect(this.outL)
    this.mL.connect(this.outR)
    this.mR.connect(this.outR)

    // Compute Side (S = (L-R)/2)
    this.l.connect(this.sL)
    this.r.connect(this.sR)
    this.sL.gain.value = 0.5
    this.sR.gain.value = -0.5

    // width applied to Side, then add to outputs with +/-
    // L' = M + width*S ; R' = M - width*S
    this.sL.connect(this.outL)
    this.sR.connect(this.outL)
    this.sL.connect(this.outR)
    this.sR.connect(this.outR)

    // Merge final outputs
    this.outL.connect(this.merger, 0, 0)
    this.outR.connect(this.merger, 0, 1)
    this.merger.connect(this.output)

    const p: StereoWidenerParams = {
      width: clamp(params?.width ?? 1, 0, 2),
    }
    this.apply(p)
  }

  private apply(p: StereoWidenerParams) {
    this._width = clamp(p.width, 0, 2)
    // Apply width by scaling side contributions
    this.sL.gain.value = 0.5 * this._width
    this.sR.gain.value = -0.5 * this._width
  }

  update(params: Partial<StereoWidenerParams>): void {
    const p: StereoWidenerParams = {
      width: clamp(params.width ?? this._width, 0, 2),
    }
    this.apply(p)
  }

  getParams(): StereoWidenerParams {
    return { width: this._width }
  }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.splitter.disconnect() } catch {}
    try { this.l.disconnect() } catch {}
    try { this.r.disconnect() } catch {}
    try { this.mL.disconnect() } catch {}
    try { this.mR.disconnect() } catch {}
    try { this.sL.disconnect() } catch {}
    try { this.sR.disconnect() } catch {}
    try { this.outL.disconnect() } catch {}
    try { this.outR.disconnect() } catch {}
    try { this.merger.disconnect() } catch {}
  }

  dispose(): void {
    this.disconnect()
  }
}
