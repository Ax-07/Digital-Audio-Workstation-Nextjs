// Pro Ableton-like Analyser Engine (stéréo + MS + freeze + hold + smoothing)
// ──────────────────────────────────────────────────────────────────────────────

export type StereoMode = "mono" | "LR" | "MS"

export type AbletonAnalyserProOptions = {
  fftSize: 256 | 512 | 1024 | 2048 | 4096 | 8192
  smoothing: number
  minDb: number
  maxDb: number
  tiltDbPerOct: number
  avg: boolean
  avgAmount: number           // 0..1
  peakFallDbPerSec: number    // dB/s
  ignoreBelowHz: number
  stereoMode: StereoMode
  calibrationDb: number        // offset visuel (ex: -18 dBFS ref)
  freeze: boolean
}

export type AbletonAnalyserProFrame = {
  nyquist: number
  bins: number
  // time-domain 8-bit (0..255) par canal
  timeL?: Uint8Array
  timeR?: Uint8Array
  // freq-domain dB (après min/max → tilt → avg → calibration)
  avgDbL?: Float32Array
  avgDbR?: Float32Array
  peakDbL?: Float32Array
  peakDbR?: Float32Array
  // MS (si demandé)
  avgDbM?: Float32Array
  avgDbS?: Float32Array
  peakDbM?: Float32Array
  peakDbS?: Float32Array
}

const clamp = (x:number, a:number, b:number)=>Math.min(b, Math.max(a, x))

export class AbletonAnalyserEnginePro {
  // Graph: in → split → anL/anR
  private ctx: BaseAudioContext
  private anL: AnalyserNode
  private anR: AnalyserNode
  private splitter: ChannelSplitterNode
  private input: AudioNode

  private opts: AbletonAnalyserProOptions

  private timeL: Uint8Array
  private timeR: Uint8Array
  private byteL: Uint8Array
  private byteR: Uint8Array

  private dbL: Float32Array
  private dbR: Float32Array
  private avgL: Float32Array
  private avgR: Float32Array
  private peakL: Float32Array
  private peakR: Float32Array

  // MS buffers (calculés à la volée)
  private avgM: Float32Array
  private avgS: Float32Array
  private peakM: Float32Array
  private peakS: Float32Array

  private lastPeakTs = performance.now()

  constructor(nodeToTap: AudioNode, opts?: Partial<AbletonAnalyserProOptions>) {
    const ctx = nodeToTap.context as BaseAudioContext
    this.ctx = ctx
    this.input = nodeToTap

    const def: AbletonAnalyserProOptions = {
      fftSize: 4096,
      smoothing: 0.6,
      minDb: -90,
      maxDb: -10,
      tiltDbPerOct: -4.5,
      avg: true,
      avgAmount: 0.6,
      peakFallDbPerSec: 16,
      ignoreBelowHz: 30,
      stereoMode: "mono",
      calibrationDb: 0,
      freeze: false,
    }
    this.opts = { ...def, ...opts }

    this.splitter = ctx.createChannelSplitter(2)
    this.anL = ctx.createAnalyser()
    this.anR = ctx.createAnalyser()

    // tap sans perturber le flux : node → splitter → anL/anR (pas de reconnection de la chaîne dry)
    try { this.input.connect(this.splitter) } catch {}
    try { this.splitter.connect(this.anL, 0) } catch {}
    try { this.splitter.connect(this.anR, 1) } catch {}

    this.applyAnalyserConfig()

    // buffers
    this.timeL = new Uint8Array(this.anL.fftSize)
    this.timeR = new Uint8Array(this.anR.fftSize)
    this.byteL = new Uint8Array(this.anL.frequencyBinCount)
    this.byteR = new Uint8Array(this.anR.frequencyBinCount)

    const N = this.anL.frequencyBinCount
    this.dbL   = new Float32Array(N)
    this.dbR   = new Float32Array(N)
    this.avgL  = new Float32Array(N)
    this.avgR  = new Float32Array(N)
    this.peakL = new Float32Array(N).fill(this.opts.minDb)
    this.peakR = new Float32Array(N).fill(this.opts.minDb)

    this.avgM  = new Float32Array(N)
    this.avgS  = new Float32Array(N)
    this.peakM = new Float32Array(N).fill(this.opts.minDb)
    this.peakS = new Float32Array(N).fill(this.opts.minDb)
  }

  dispose() {
    try { this.input.disconnect(this.splitter) } catch {}
    try { this.splitter.disconnect() } catch {}
  }

  getOptions(): AbletonAnalyserProOptions { return { ...this.opts } }

  updateOptions(patch: Partial<AbletonAnalyserProOptions>) {
    this.opts = { ...this.opts, ...patch }
    this.applyAnalyserConfig()
    // si fftSize change, réaloue
    const N = this.anL.frequencyBinCount
    if (N !== this.avgL.length) {
      this.timeL = new Uint8Array(this.anL.fftSize)
      this.timeR = new Uint8Array(this.anR.fftSize)
      this.byteL = new Uint8Array(N)
      this.byteR = new Uint8Array(N)
      this.dbL   = new Float32Array(N)
      this.dbR   = new Float32Array(N)
      this.avgL  = new Float32Array(N)
      this.avgR  = new Float32Array(N)
      this.peakL = new Float32Array(N).fill(this.opts.minDb)
      this.peakR = new Float32Array(N).fill(this.opts.minDb)
      this.avgM  = new Float32Array(N)
      this.avgS  = new Float32Array(N)
      this.peakM = new Float32Array(N).fill(this.opts.minDb)
      this.peakS = new Float32Array(N).fill(this.opts.minDb)
    }
  }

  setFreeze(on:boolean) { this.opts.freeze = on }
  resetPeaks() {
    this.peakL.fill(this.opts.minDb)
    this.peakR.fill(this.opts.minDb)
    this.peakM.fill(this.opts.minDb)
    this.peakS.fill(this.opts.minDb)
  }

  getNyquist() { return (this.ctx.sampleRate ?? 48000) / 2 }
  getBins() { return this.anL.frequencyBinCount }

  private applyAnalyserConfig() {
    const { fftSize, smoothing, minDb, maxDb } = this.opts
    ;[this.anL, this.anR].forEach(a => {
      try { a.fftSize = fftSize } catch {}
      try { a.smoothingTimeConstant = smoothing } catch {}
      try { a.minDecibels = minDb; a.maxDecibels = maxDb } catch {}
    })
  }

  private bytesToDbInPlace(byte: Uint8Array, out: Float32Array, minDb: number, maxDb: number) {
    const span = (maxDb - minDb)
    for (let i=0;i<byte.length;i++) {
      out[i] = minDb + (byte[i] / 255) * span
    }
  }

  private applyTiltAvgHold(db: Float32Array, avg: Float32Array, peak: Float32Array) {
    const { minDb, tiltDbPerOct, avg:doAvg, avgAmount, peakFallDbPerSec, calibrationDb } = this.opts
    const ny = this.getNyquist()

    // tilt
    if (tiltDbPerOct !== 0) {
      for (let i=1;i<db.length;i++) {
        const f = (i/(db.length-1)) * ny
        const oct = Math.max(0, Math.log2(Math.max(20, f) / 20))
        db[i] += tiltDbPerOct * oct
      }
    }

    // calibration offset (ex: -18)
    if (calibrationDb !== 0) {
      for (let i=0;i<db.length;i++) db[i] += calibrationDb
    }

    // average
    if (doAvg) {
      const a = clamp(avgAmount, 0, 0.99)
      for (let i=0;i<db.length;i++) {
        const prev = avg[i] || db[i]
        avg[i] = (1 - a) * db[i] + a * prev
      }
    } else {
      avg.set(db)
    }

    // peak-hold (freeze aware)
    if (!this.opts.freeze) {
      const now = performance.now()
      const dt = Math.max(0, (now - this.lastPeakTs)/1000)
      this.lastPeakTs = now
      const fall = peakFallDbPerSec * dt
      for (let i=0;i<peak.length;i++) {
        const v = avg[i]
        peak[i] = Math.max(minDb, Math.max(peak[i] - fall, v))
      }
    }
  }

  /** Renvoie un frame prêt à tracer (mono/LR ou MS selon options). */
  updateFrame(): AbletonAnalyserProFrame {
    const { freeze, minDb, maxDb, stereoMode } = this.opts
    const nyquist = this.getNyquist()
    const bins = this.getBins()

    // time
    if (!freeze) {
      this.anL.getByteTimeDomainData(this.timeL as Uint8Array<ArrayBuffer>)
      this.anR.getByteTimeDomainData(this.timeR as Uint8Array<ArrayBuffer>)
      this.anL.getByteFrequencyData(this.byteL as Uint8Array<ArrayBuffer>)
      this.anR.getByteFrequencyData(this.byteR as Uint8Array<ArrayBuffer>)
      this.bytesToDbInPlace(this.byteL, this.dbL, minDb, maxDb)
      this.bytesToDbInPlace(this.byteR, this.dbR, minDb, maxDb)
    }

    // process (tilt/avg/hold/calib)
    this.applyTiltAvgHold(this.dbL, this.avgL, this.peakL)
    this.applyTiltAvgHold(this.dbR, this.avgR, this.peakR)

    // MS (calcul à la demande depuis L/R)
    if (stereoMode === "MS") {
      for (let i=0;i<bins;i++) {
        const M = 0.5*(this.avgL[i] + this.avgR[i])
        const S = this.avgL[i] - this.avgR[i]
        this.avgM[i] = M
        this.avgS[i] = S
        const Mp = 0.5*(this.peakL[i] + this.peakR[i])
        const Sp = this.peakL[i] - this.peakR[i]
        this.peakM[i] = Mp
        this.peakS[i] = Sp
      }
    }

    const frame: AbletonAnalyserProFrame = {
      nyquist,
      bins,
      timeL: this.timeL,
      timeR: this.timeR,
    }

    if (stereoMode === "mono") {
      // moyenne visuelle L/R
      const avgMono = new Float32Array(bins)
      const peakMono = new Float32Array(bins)
      for (let i=0;i<bins;i++) {
        avgMono[i]  = 0.5*(this.avgL[i]  + this.avgR[i])
        peakMono[i] = 0.5*(this.peakL[i] + this.peakR[i])
      }
      frame.avgDbL  = avgMono
      frame.peakDbL = peakMono
    } else if (stereoMode === "LR") {
      frame.avgDbL  = this.avgL
      frame.avgDbR  = this.avgR
      frame.peakDbL = this.peakL
      frame.peakDbR = this.peakR
    } else { // MS
      frame.avgDbM  = this.avgM
      frame.avgDbS  = this.avgS
      frame.peakDbM = this.peakM
      frame.peakDbS = this.peakS
    }

    return frame
  }

    /** Sample rate courant du contexte audio */
  getSampleRate(): number {
    return this.ctx.sampleRate ?? 48000
  }
}
