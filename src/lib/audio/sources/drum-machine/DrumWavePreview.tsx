"use client"
import { useEffect, useRef, useState } from "react"

/**
 * DrumWavePreview — aperçu générique time-domain (offline)
 * - Tu fournis un render(params, { sampleRate, durationMs }) => Float32Array (mono)
 * - Affiche la waveform + grille + marqueurs facultatifs + enveloppe facultative
 * - Bouton Play pour écouter le buffer synthétisé (sans dépendre du moteur temps-réel)
 */

export type RenderOpts = {
  sampleRate: number
  durationMs: number
}

export type Marker = {
  /** Position en millisecondes dans la preview */
  atMs: number
  /** Libellé affiché près de la ligne */
  label?: string
  /** Couleur de la ligne (défaut: theme.markers) */
  color?: string
}

export type EnvelopeOverlay = {
  /** Retourne l’amplitude (0..1) à t (en secondes) — pour dessiner l'enveloppe */
  ampAtTime: (tSec: number) => number
  /** Couleur de l’enveloppe */
  color?: string
  /** Ligne en pointillés ? */
  dashed?: boolean
}

export type DrumWavePreviewProps<P> = {
  /** Tes paramètres arbitraires pour l’instrument */
  params: P
  /** Fonction de rendu offline → Float32Array mono, longueur = durationMs * sampleRate */
  // Peut retourner soit un Float32Array synchrone, soit une Promise<Float32Array>
  render: (params: P, opts: RenderOpts) => Float32Array | Promise<Float32Array>
  className?: string
  /** Taille de l’aperçu */
  height?: number
  widthPx?: number           // si non fourni → prend la largeur CSS du conteneur
  /** Audio offline */
  sampleRate?: number
  durationMs?: number
  /** UI */
  title?: string
  allowPlay?: boolean
  /** Marqueurs verticaux (ex: fin de sweep) */
  markers?: Marker[]
  /** Enveloppe optionnelle (dessinée sur la waveform) */
  envelope?: EnvelopeOverlay
  /** Thème */
  theme?: {
    bg?: string
    wave?: string
    env?: string
    grid?: string
    text?: string
    markers?: string
  }
}

// Singleton AudioContext pour éviter de créer plusieurs contextes (latence + ressources)
let _previewAudioCtx: AudioContext | null = null;

export function DrumWavePreview<P>({
  params,
  render,
  className,
  height = 140,
  widthPx,
  sampleRate = 48000,
  durationMs = 400,
  title = "Drum Preview",
  allowPlay = true,
  markers = [],
  envelope,
  theme = {
    bg: "#0a0a0a",
    wave: "#60a5fa",
    env: "#22c55e",
    grid: "#2a2a2a",
    text: "#a3a3a3",
    markers: "#f59e0b",
  },
}: DrumWavePreviewProps<P>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // On ne stocke plus localement le contexte si singleton déjà créé
  const [ctx, setCtx] = useState<AudioContext | null>(null)
  const [buffer, setBuffer] = useState<Float32Array | null>(null)
  const [stats, setStats] = useState<{ peak: number; rms: number } | null>(null)
  // Buffer canal réutilisable pour éviter allocation à chaque Play
  const channelBufRef = useRef<Float32Array | null>(null)

  useEffect(() => {
    let mounted = true
    const compute = async () => {
      try {
        const res = await Promise.resolve(render(params, { sampleRate, durationMs }))
        if (mounted) {
          setBuffer(res)
          // compute simple stats for diagnostics
          try {
            let peak = 0
            let sumSq = 0
            for (let i = 0; i < res.length; i++) {
              const v = Math.abs(res[i])
              if (v > peak) peak = v
              sumSq += res[i] * res[i]
            }
            const rms = res.length > 0 ? Math.sqrt(sumSq / res.length) : 0
            setStats({ peak, rms })
          } catch {
            // ignore
            setStats(null)
          }
        }
      } catch (e) {
        console.error("DrumWavePreview render() error:", e)
        if (mounted) setBuffer(null)
      }
    }
    compute()
    return () => {
      mounted = false
    }
  }, [params, render, sampleRate, durationMs])

  // dessin
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !buffer) return

    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const cssW = widthPx ?? canvas.clientWidth
    const cssH = height
    canvas.width = Math.max(1, Math.floor(cssW * dpr))
    canvas.height = Math.max(1, Math.floor(cssH * dpr))
    const g = canvas.getContext("2d")!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)

    // fond
    g.fillStyle = theme.bg!
    g.fillRect(0, 0, cssW, cssH)

    // grille: midline + temps (chaque 50 ms)
    g.strokeStyle = theme.grid!
    g.lineWidth = 1
    // midline
    g.beginPath()
    g.moveTo(0, cssH / 2)
    g.lineTo(cssW, cssH / 2)
    g.stroke()
    // verticales temps
    const stepMs = 50
    for (let ms = stepMs; ms < durationMs; ms += stepMs) {
      const x = (ms / durationMs) * cssW
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, cssH)
      g.stroke()
    }

    // waveform
    g.strokeStyle = theme.wave!
    g.lineWidth = 1.5
    g.lineJoin = "round"
    g.lineCap = "round"
    g.beginPath()
    const amp = cssH * 0.45
    const step = buffer.length / cssW
    for (let x = 0; x < cssW; x++) {
      const i = Math.min(buffer.length - 1, Math.floor(x * step))
      const y = cssH / 2 - buffer[i] * amp
      if (x === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()

    // enveloppe overlay (si fournie)
    if (envelope) {
      g.strokeStyle = envelope.color ?? theme.env!
      if (envelope.dashed) g.setLineDash([4, 3])
      g.beginPath()
      const N = Math.max(32, Math.floor(cssW / 3))
      for (let k = 0; k <= N; k++) {
        const r = k / N
        const tSec = (r * durationMs) / 1000
        const env = Math.max(0, Math.min(1, envelope.ampAtTime(tSec)))
        const x = r * cssW
        const y = cssH / 2 - env * amp
        if (k === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      if (envelope.dashed) g.setLineDash([])
    }

    // markers
    if (markers?.length) {
      g.font = "10px ui-sans-serif, system-ui, -apple-system"
      for (const m of markers) {
        const x = Math.max(0, Math.min(cssW, (m.atMs / durationMs) * cssW))
        g.strokeStyle = m.color ?? theme.markers!
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, cssH)
        g.stroke()
        if (m.label) {
          g.fillStyle = theme.text!
          g.fillText(m.label, x + 4, 12)
        }
      }
    }
  }, [buffer, height, widthPx, durationMs, markers, envelope, theme])

  const onPlay = async () => {
    if (!buffer) return
    // Réutilise le contexte singleton (ou celui passé via state si déjà existant)
    const ac = _previewAudioCtx ?? (_previewAudioCtx = ctx ?? new AudioContext({ sampleRate }))
    if (!ctx) setCtx(ac)
    if (ac.state === "suspended") await ac.resume()
    // Créer directement un AudioBuffer et copier les données
    const abuf = ac.createBuffer(1, buffer.length, sampleRate)
    const channelData = abuf.getChannelData(0)
    channelData.set(buffer)
    const src = ac.createBufferSource()
    src.buffer = abuf
    const gain = ac.createGain()
    gain.gain.value = 0.9
    src.connect(gain).connect(ac.destination)
    // Démarrage léger décalé pour éviter cliques (0.02s)
    src.start(ac.currentTime + 0.02)
  }

  return (
    <div className={"rounded border border-neutral-800 bg-neutral-950/70 p-2 " + (className ?? "")}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-neutral-400">{title}</div>
        {allowPlay && (
          <button
            onClick={onPlay}
            className="px-2 py-1 text-xs rounded border border-neutral-700 hover:bg-neutral-800"
          >
            Play
          </button>
        )}
      </div>
      <div style={{ height }} className="w-full">
        <canvas ref={canvasRef} className="w-full h-full rounded-sm" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-neutral-400">
          <div>SR: {sampleRate} Hz</div>
          <div>Durée: {durationMs} ms</div>
          <div>Samples: {buffer?.length ?? 0}</div>
        </div>
        {stats && (
          <div className="mt-1 text-[11px] text-neutral-400">
            <div>Peak: {stats.peak.toFixed(6)} ({(20 * Math.log10(Math.max(1e-9, stats.peak))).toFixed(1)} dBFS)</div>
            <div>RMS: {stats.rms.toFixed(6)} ({(20 * Math.log10(Math.max(1e-9, stats.rms))).toFixed(1)} dBFS)</div>
          </div>
        )}
    </div>
  )
}
