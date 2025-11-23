// src/lib/audio/effects/spectrum-analyser/analyser-tap.ts
import type { AudioEffect } from "@/lib/audio/effects/base";

export type AnalyserTapParams = {
  fftSize: 256 | 512 | 1024 | 2048 | 4096 | 8192;
  smoothing: number;   // 0..1
  minDb: number;       // ex -90
  maxDb: number;       // ex -10
};

export class AnalyserTapEffect implements AudioEffect<AnalyserTapParams> {
  readonly kind = "analyser-tap" as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private ctx: AudioContext;
  private tap: GainNode;
  private analyser: AnalyserNode;

  private _params: AnalyserTapParams;

  constructor(ctx: AudioContext, params?: Partial<AnalyserTapParams>) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.tap = ctx.createGain();
    this.analyser = ctx.createAnalyser();

    // routing: input -> output (dry pass), et en parallèle -> tap -> analyser (fan-out)
    this.input.connect(this.output);
    this.input.connect(this.tap);
    this.tap.connect(this.analyser);

    this._params = {
      fftSize: params?.fftSize ?? 4096,
      smoothing: params?.smoothing ?? 0.6,
      minDb: params?.minDb ?? -90,
      maxDb: params?.maxDb ?? -10,
    };
    this.apply(this._params);
  }

  private apply(p: AnalyserTapParams) {
    try { this.analyser.fftSize = p.fftSize } catch {}
    try { this.analyser.smoothingTimeConstant = p.smoothing } catch {}
    try { this.analyser.minDecibels = p.minDb; this.analyser.maxDecibels = p.maxDb } catch {}
  }

  update(params: Partial<AnalyserTapParams>): void {
    this._params = { ...this._params, ...params };
    this.apply(this._params);
  }

  getParams(): AnalyserTapParams { return { ...this._params }; }

  /** À utiliser par le contrôleur/visu pour lire les données */
  getAnalyser(): AnalyserNode { return this.analyser; }

  disconnect(): void {
    try { this.input.disconnect() } catch {}
    try { this.output.disconnect() } catch {}
    try { this.tap.disconnect() } catch {}
    try { this.analyser.disconnect() } catch {}
  }

  dispose(): void { this.disconnect(); }
}
