"use client"
import * as React from "react"
import { subscribe } from "@/shared/utils/raf-scheduler"
import { setupCanvas2D } from "@/shared/utils/canvas"

type SpecStyle = "line" | "bars"
type LayoutMode = "spectrum" | "wave+spec" | "wave"

export type MiniAnalyserAbletonProps = {
  /** Soit tu donnes un analyser existant… */
  analyser?: AnalyserNode | null
  /** …soit on crée l'analyser et on le "tap" depuis ce node (fan-out parallèle, non destructif) */
  attachTo?: AudioNode | null

  className?: string
  height?: number               // hauteur totale du composant (wave+spec → partagé)
  mode?: LayoutMode             // "spectrum" (défaut), "wave+spec", "wave"

  // Analyser config
  fftSize?: 256 | 512 | 1024 | 2048 | 4096 | 8192
  smoothing?: number            // 0..1
  minDb?: number                // ex -90
  maxDb?: number                // ex -10

  // Spectrum rendu
  specStyle?: SpecStyle         // "line" ou "bars"
  avg?: boolean                 // average “slow”
  avgAmount?: number            // 0..1 (force de l'average visuel)
  peakHoldMs?: number           // durée de hold
  tiltDbPerOct?: number         // compensation dB/oct (ex: -4.5)
  ignoreBelowHz?: number        // coupe visuelle des bins sous X Hz
  showCutoffOverlay?: boolean

  // Waveform rendu
  showRms?: boolean

  // FPS cap
  fps?: number

  // Thème
  theme?: {
    bg?: string
    grid?: string
    text?: string
    wave?: string
    rms?: string
    specBar?: string
    specPeak?: string
    specLine?: string
  }

  /** Callback quand l'analyser interne est prêt (utile pour récupérer une référence) */
  onReady?: (analyser: AnalyserNode) => void
}

/** Interpolation Catmull-Rom → lissage ligne spectrum */
function catmullRom(points: {x:number,y:number}[], alpha = 0.5, samplesPerSeg = 8) {
  if (points.length < 2) return points
  const res: {x:number,y:number}[] = []
  for (let i=0; i<points.length-1; i++) {
    const p0 = points[Math.max(0, i-1)]
    const p1 = points[i]
    const p2 = points[i+1]
    const p3 = points[Math.min(points.length-1, i+2)]
    const t0 = 0
    const t1 = Math.pow(Math.hypot(p1.x-p0.x, p1.y-p0.y), alpha) + t0
    const t2 = Math.pow(Math.hypot(p2.x-p1.x, p2.y-p1.y), alpha) + t1
    const t3 = Math.pow(Math.hypot(p3.x-p2.x, p3.y-p2.y), alpha) + t2
    for (let t=t1; t<=t2; t+=(t2-t1)/samplesPerSeg) {
      const A1x = (t1-t)/(t1-t0)*p0.x + (t-t0)/(t1-t0)*p1.x
      const A1y = (t1-t)/(t1-t0)*p0.y + (t-t0)/(t1-t0)*p1.y
      const A2x = (t2-t)/(t2-t1)*p1.x + (t-t1)/(t2-t1)*p2.x
      const A2y = (t2-t)/(t2-t1)*p1.y + (t-t1)/(t2-t1)*p2.y
      const A3x = (t3-t)/(t3-t2)*p2.x + (t-t2)/(t3-t2)*p3.x
      const A3y = (t3-t)/(t3-t2)*p2.y + (t-t2)/(t3-t2)*p3.y

      const B1x = (t2-t)/(t2-t0)*A1x + (t-t0)/(t2-t0)*A2x
      const B1y = (t2-t)/(t2-t0)*A1y + (t-t0)/(t2-t0)*A2y
      const B2x = (t3-t)/(t3-t1)*A2x + (t-t1)/(t3-t1)*A3x
      const B2y = (t3-t)/(t3-t1)*A2y + (t-t1)/(t3-t1)*A3y

      const Cx = (t2-t)/(t2-t1)*B1x + (t-t1)/(t2-t1)*B2x
      const Cy = (t2-t)/(t2-t1)*B1y + (t-t1)/(t2-t1)*B2y
      res.push({x: Cx, y: Cy})
    }
  }
  res.push(points[points.length-1])
  return res
}

export default function MiniAnalyserAbleton({
  analyser: analyserProp,
  attachTo = null,
  className,
  height = 120,
  mode = "spectrum",
  fftSize = 4096,
  smoothing = 0.6,
  minDb = -90,
  maxDb = -10,
  specStyle = "line",
  avg = true,
  avgAmount = 0.6,
  peakHoldMs = 500,
  tiltDbPerOct = -4.5,
  ignoreBelowHz = 30,
  showCutoffOverlay = true,
  showRms = true,
  fps = 60,
  theme = {
    bg:"#0a0a0a",
    grid:"#262626",
    text:"#a3a3a3",
    wave:"#22c55e",
    rms:"#f59e0b",
    specBar:"#60a5fa",
    specPeak:"#93c5fd",
    specLine:"#60a5fa",
  },
  onReady,
}: MiniAnalyserAbletonProps) {
  const waveRef = React.useRef<HTMLCanvasElement | null>(null)
  const specRef = React.useRef<HTMLCanvasElement | null>(null)
  const resizeObs = React.useRef<ResizeObserver | null>(null)
  const [ready, setReady] = React.useState(false)
  const [internal, setInternal] = React.useState<AnalyserNode | null>(null)

  const an = analyserProp ?? internal

  React.useEffect(() => {
    // Crée un analyser si on nous donne un node à “taper”
    if (!attachTo || analyserProp) return
    const ctx = (attachTo.context as AudioContext) || (attachTo.context as OfflineAudioContext)
    const a = ctx.createAnalyser()
    a.fftSize = fftSize
    a.smoothingTimeConstant = smoothing
    a.minDecibels = minDb
    a.maxDecibels = maxDb
    try {
      attachTo.connect(a) // fan-out, ne perturbe pas le routing existant
    } catch { /* no-op */ }
    setInternal(a)
    onReady?.(a)
    return () => {
      try { attachTo.disconnect(a) } catch {}
      setInternal(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachTo])

  React.useEffect(() => {
    if (!an) return
    try { an.fftSize = fftSize } catch {}
    try { an.smoothingTimeConstant = smoothing } catch {}
    try { an.minDecibels = minDb; an.maxDecibels = maxDb } catch {}
  }, [an, fftSize, smoothing, minDb, maxDb])

  React.useEffect(() => {
    if (!an || !specRef.current) return
    let stopped = false
    let lastTs = 0
    const interval = 1000 / Math.max(1, fps)

    const waveCanvas = waveRef.current
    const specCanvas = specRef.current
    const waveCtx = waveCanvas ? setupCanvas2D(waveCanvas) : null
    const specCtx = setupCanvas2D(specCanvas)

    const setup = (canvas: HTMLCanvasElement) => {
      return setupCanvas2D(canvas)
    }

    const nyquist = (an.context.sampleRate ?? 48000) / 2
    const timeData = new Uint8Array(an.fftSize)
    const freqData = new Uint8Array(an.frequencyBinCount)
    const floatFreq = new Float32Array(an.frequencyBinCount)
    const avgFreq = new Float32Array(an.frequencyBinCount)
    const peaks = new Float32Array(an.frequencyBinCount)

    let lastPeak = performance.now()
    const peakFallPerSec = 16 // dB/s approx (visuel)

    const xForFreq = (f:number, w:number) => {
      const fMin = 20, fMax = nyquist
      const r = Math.log(f / fMin) / Math.log(fMax / fMin)
      return Math.max(0, Math.min(w, r * w))
    }
    const freqForX = (x:number, w:number) => {
      const fMin = 20, fMax = nyquist
      const r = x / Math.max(1, w)
      return fMin * Math.pow(fMax / fMin, r)
    }
    const binForFreq = (f:number) =>
      Math.max(0, Math.min(an.frequencyBinCount - 1, Math.round((f / nyquist) * (an.frequencyBinCount - 1))))

    const yForDb = (db:number, h:number) => {
      const t = (db - minDb) / (maxDb - minDb)
      return h - Math.max(0, Math.min(h, t * h))
    }

  // Resize handler (observer created below)
    resizeObs.current = new ResizeObserver(() => {
      if (waveCanvas) setup(waveCanvas)
      setup(specCanvas)
    })
    if (waveCanvas) resizeObs.current.observe(waveCanvas)
    resizeObs.current.observe(specCanvas)

    // initial setup
    if (waveCanvas) setup(waveCanvas)
    setup(specCanvas)

    setReady(true)

  const render = () => {
      if (stopped) return
      const ts = performance.now()
      if (ts - lastTs < interval) return
      lastTs = ts

      const sW = specCanvas.clientWidth
      const sH = specCanvas.clientHeight
      const wW = waveCanvas?.clientWidth ?? 0
      const wH = waveCanvas?.clientHeight ?? 0

      // ---- BACKGROUNDS
      if (waveCtx && (mode === "wave" || mode === "wave+spec")) {
        waveCtx.fillStyle = theme.bg!
        waveCtx.fillRect(0, 0, wW, wH)
      }
      specCtx.fillStyle = theme.bg!
      specCtx.fillRect(0, 0, sW, sH)

      // ---- WAVEFORM
      if (waveCtx && (mode === "wave" || mode === "wave+spec")) {
        an.getByteTimeDomainData(timeData)
        // midline
        waveCtx.strokeStyle = theme.grid!
        waveCtx.lineWidth = 1
        waveCtx.beginPath()
        waveCtx.moveTo(0, wH/2); waveCtx.lineTo(wW, wH/2); waveCtx.stroke()

        // waveform
        waveCtx.strokeStyle = theme.wave!
        waveCtx.lineWidth = 1
        waveCtx.beginPath()
        const step = timeData.length / Math.max(1, wW)
        let sum = 0
        for (let x=0; x<wW; x++) {
          const v = (timeData[Math.floor(x * step)] - 128) / 128 // -1..+1
          sum += v*v
          const y = (1 - (v * 0.9 + 1) / 2) * wH
          if (x === 0) waveCtx.moveTo(x, y)
          else waveCtx.lineTo(x, y)
        }
        waveCtx.stroke()

        if (showRms) {
          const rms = Math.sqrt(sum / timeData.length)
          const yR = (1 - (rms * 0.9)) * wH
          waveCtx.strokeStyle = theme.rms!
          waveCtx.setLineDash([4,3])
          waveCtx.beginPath(); waveCtx.moveTo(0, yR); waveCtx.lineTo(wW, yR); waveCtx.stroke()
          waveCtx.setLineDash([])
        }
      }

      // ---- SPECTRUM
      an.getByteFrequencyData(freqData)

      // convert to dB in our min/max range for processing/tilt/avg
      for (let i=0;i<freqData.length;i++) {
        const mag = freqData[i] / 255 // 0..1
        // map to dB within analyser's range
        const db = minDb + mag * (maxDb - minDb)
        floatFreq[i] = db
      }

      // tilt compensation (dB/oct)
      if (tiltDbPerOct !== 0) {
        for (let i=1;i<floatFreq.length;i++) {
          const f = (i / (floatFreq.length-1)) * nyquist
          const oct = Math.max(0, Math.log2(Math.max(20, f) / 20))
          floatFreq[i] += tiltDbPerOct * oct
        }
      }

      // average (slow)
      if (avg) {
        const a = Math.max(0, Math.min(0.99, avgAmount))
        for (let i=0;i<floatFreq.length;i++) {
          avgFreq[i] = (1-a)*floatFreq[i] + a*(avgFreq[i] || floatFreq[i])
        }
      } else {
        avgFreq.set(floatFreq)
      }

      // peak hold (in dB)
      const now = performance.now()
      const dt = Math.max(0, (now - lastPeak)/1000)
      lastPeak = now
      const fall = peakFallPerSec * dt
      for (let i=0;i<peaks.length;i++) {
        peaks[i] = Math.max(minDb, Math.max(peaks[i] - fall, avgFreq[i]))
      }

      // grid dB
      const spec = specCtx
      spec.strokeStyle = theme.grid!
      spec.lineWidth = 1
      const dbLines = [minDb, -60, -30, -12, -6, -3, 0].filter(d => d>minDb && d<maxDb)
      for (const d of dbLines) {
        const y = yForDb(d, sH)
        spec.beginPath(); spec.moveTo(0, y); spec.lineTo(sW, y); spec.stroke()
      }

      // cutoff overlay
      if (showCutoffOverlay && ignoreBelowHz > 20) {
        const cutX = xForFreq(ignoreBelowHz, sW)
        const g = spec.createLinearGradient(0,0, cutX,0)
        g.addColorStop(0, "rgba(255,255,255,0.06)")
        g.addColorStop(1, "rgba(255,255,255,0.00)")
        spec.fillStyle = g
        spec.fillRect(0,0, cutX, sH)
        // repère
        spec.strokeStyle = theme.grid!
        spec.beginPath(); spec.moveTo(cutX, 0); spec.lineTo(cutX, sH); spec.stroke()
        spec.fillStyle = theme.text!
        spec.font = "10px ui-sans-serif, system-ui, -apple-system"
        spec.fillText(`${Math.round(ignoreBelowHz)} Hz`, cutX+4, 10)
      }

      // frequency marks
      spec.fillStyle = theme.text!
      spec.font = "10px ui-sans-serif, system-ui, -apple-system"
      ;[100, 200, 500, 1000, 2000, 5000, 10000].filter(f => f < nyquist-100).forEach(f => {
        const x = xForFreq(f, sW)
        spec.strokeStyle = theme.grid!
        spec.beginPath(); spec.moveTo(x, 0); spec.lineTo(x, sH); spec.stroke()
        spec.fillText(f >= 1000 ? `${(f/1000).toFixed(0)}k` : `${f}`, x+3, 10)
      })

      // data → rendu
      if (specStyle === "bars") {
        const barCount = Math.min(sW, 160)
        const barW = Math.max(1, Math.floor(sW / barCount))
        for (let bx=0; bx<barCount; bx++) {
          const x0 = bx * barW
          const fMid = freqForX(x0 + barW*0.5, sW)
          const bi = binForFreq(fMid)
          // “mute” sous ignoreBelowHz
          const db = (fMid < ignoreBelowHz) ? minDb : avgFreq[bi]
          const pk = (fMid < ignoreBelowHz) ? minDb : peaks[bi]
          const y = yForDb(db, sH)
          const yp = yForDb(pk, sH)
          spec.fillStyle = theme.specBar!
          spec.fillRect(x0, y, barW-1, sH - y)
          spec.fillStyle = theme.specPeak!
          spec.fillRect(x0, yp-1, barW-1, 2)
        }
      } else {
        // line (lissée)
        const pts: {x:number,y:number}[] = []
        const samples = 240
        for (let i=0;i<samples;i++) {
          const x = (i/(samples-1))*sW
          const f = freqForX(x, sW)
          const bi = binForFreq(f)
          const db = (f < ignoreBelowHz) ? minDb : avgFreq[bi]
          const y = yForDb(db, sH)
          pts.push({x, y})
        }
        const smooth = catmullRom(pts, 0.5, 6)
        spec.strokeStyle = theme.specLine!
        spec.lineWidth = 1.5
        spec.beginPath()
        for (let i=0;i<smooth.length;i++) {
          const p = smooth[i]
          if (i===0) spec.moveTo(p.x, p.y)
          else spec.lineTo(p.x, p.y)
        }
        spec.stroke()
        // peak beads
        spec.fillStyle = theme.specPeak!
        for (let i=0;i<24;i++) {
          const x = (i/23)*sW
          const f = freqForX(x, sW)
          const bi = binForFreq(f)
          const pk = (f < ignoreBelowHz) ? minDb : peaks[bi]
          const yp = yForDb(pk, sH)
          spec.fillRect(x, yp-1, 2, 2)
        }
      }

    }

    const unsubscribe = subscribe(render, fps)
    return () => {
      stopped = true
      unsubscribe()
      if (resizeObs.current) { resizeObs.current.disconnect(); resizeObs.current = null }
    }
  }, [
    an, mode, fftSize, smoothing, minDb, maxDb, specStyle,
    avg, avgAmount, peakHoldMs, tiltDbPerOct, ignoreBelowHz,
    showCutoffOverlay, showRms, fps, theme
  ])

  const rowH = mode === "wave+spec" ? Math.max(48, Math.round(height/2 - 2)) : height

  return (
    <div className={"rounded border border-neutral-800 bg-neutral-950/70 p-2 " + (className ?? "")}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-neutral-400">Analyser {ready ? "" : "(init…)"}</div>
      </div>
      <div className={mode==="wave+spec" ? "grid grid-rows-2 gap-1" : ""} style={{ height }}>
        {(mode==="wave" || mode==="wave+spec") && (
          <canvas ref={waveRef} className="w-full h-full rounded-sm" style={{ height: rowH }} />
        )}
        {(mode==="spectrum" || mode==="wave+spec") && (
          <canvas ref={specRef} className="w-full h-full rounded-sm" style={{ height: rowH }} />
        )}
      </div>
    </div>
  )
}
