// src/lib/audio/effects/spectrum-analyser/mini-analyser-ableton-pro-view.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { AbletonAnalyserEnginePro, type StereoMode } from "./ableton-analyser-engine";
import { ChevronDown, Snowflake, RefreshCw, Waves, ActivityIcon } from "lucide-react";
import { subscribe } from "@/lib/utils/raf-scheduler";
import { setupCanvas2D } from "@/lib/utils/canvas";

/* ───────────────────────── Utils rendu & DSP visuel ───────────────────────── */

function catmullRom(points: { x: number; y: number }[], alpha = 0.5, samplesPerSeg = 8) {
  if (points.length < 2) return points;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const t0 = 0;
    const t1 = Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), alpha) + t0;
    const t2 = Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), alpha) + t1;
    const t3 = Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), alpha) + t2;
    for (let t = t1; t <= t2; t += (t2 - t1) / samplesPerSeg) {
      const A1x = ((t1 - t) / (t1 - t0)) * p0.x + ((t - t0) / (t1 - t0)) * p1.x;
      const A1y = ((t1 - t) / (t1 - t0)) * p0.y + ((t - t0) / (t1 - t0)) * p1.y;
      const A2x = ((t2 - t) / (t2 - t1)) * p1.x + ((t - t1) / (t2 - t1)) * p2.x;
      const A2y = ((t2 - t) / (t2 - t1)) * p1.y + ((t - t1) / (t2 - t1)) * p2.y;
      const A3x = ((t3 - t) / (t3 - t2)) * p2.x + ((t - t2) / (t3 - t2)) * p3.x;
      const A3y = ((t3 - t) / (t3 - t2)) * p2.y + ((t - t2) / (t3 - t2)) * p3.y;
      const B1x = ((t2 - t) / (t2 - t0)) * A1x + ((t - t0) / (t2 - t0)) * A2x;
      const B1y = ((t2 - t) / (t2 - t0)) * A1y + ((t - t0) / (t2 - t0)) * A2y;
      const B2x = ((t3 - t) / (t3 - t1)) * A2x + ((t - t1) / (t3 - t1)) * A3x;
      const B2y = ((t3 - t) / (t3 - t1)) * A2y + ((t - t1) / (t3 - t1)) * A3y;
      const Cx = ((t2 - t) / (t2 - t1)) * B1x + ((t - t1) / (t2 - t1)) * B2x;
      const Cy = ((t2 - t) / (t2 - t1)) * B1y + ((t - t1) / (t2 - t1)) * B2y;
      out.push({ x: Cx, y: Cy });
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function postSmooth(points: { x: number; y: number }[], radiusPx: number) {
  if (radiusPx <= 0) return points;
  const out = new Array(points.length);
  const win = Math.max(1, Math.round(radiusPx));
  for (let i = 0; i < points.length; i++) {
    let sum = 0, wsum = 0;
    for (let k = -win; k <= win; k++) {
      const j = Math.max(0, Math.min(points.length - 1, i + k));
      const w = Math.exp(-0.5 * (k / (win * 0.75)) ** 2);
      sum += points[j].y * w;
      wsum += w;
    }
    out[i] = { x: points[i].x, y: sum / Math.max(1e-9, wsum) };
  }
  return out;
}

/** Couleur avec alpha fiable (#RRGGBB, rgb, hsl…) */
function withAlpha(css: string, alpha: number) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = css;
  const s = String(ctx.fillStyle);
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return css;
  const [, r, g, b] = m;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/** DC-block 1er ordre (visuel) */
function dcBlockInPlace(buf: Float32Array, sr: number, hpHz = 20) {
  const rc = 1 / (2 * Math.PI * hpHz);
  const a = rc / (rc + 1 / sr);
  let prevX = buf[0] || 0;
  let prevY = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = a * (prevY + x - prevX);
    buf[i] = y;
    prevX = x; prevY = y;
  }
}

/** courbe contraste/gain wave */
function shapeAmp(v: number, gamma = 0.75, gain = 1.15) {
  const s = Math.sign(v);
  const a = Math.pow(Math.abs(v), gamma) * gain;
  return Math.max(-1, Math.min(1, s * a));
}

/** buckets min/max (sticks Ableton-like) */
function minMaxBuckets(src: Float32Array, buckets: number) {
  const n = Math.max(1, buckets);
  const step = src.length / n;
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let lo = 1e9, hi = -1e9;
    const start = Math.floor(i * step);
    const end = Math.min(src.length, Math.floor((i + 1) * step));
    for (let j = start; j < end; j++) {
      const v = src[j];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[i] = lo === 1e9 ? 0 : lo;
    max[i] = hi === -1e9 ? 0 : hi;
  }
  return { min, max };
}

/** RMS glissante (fenêtre L) */
function slidingRms(src: Float32Array, win: number): Float32Array {
  if (win <= 1) return new Float32Array(src.length).fill(0);
  const out = new Float32Array(src.length);
  let acc = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    acc += x * x;
    if (i >= win) acc -= src[i - win] * src[i - win];
    const n = i < win ? (i + 1) : win;
    out[i] = Math.sqrt(acc / n);
  }
  return out;
}

/* ───────────────────────── Types props ───────────────────────── */

type SpecStyle = "line" | "bars";
type LayoutMode = "spectrum" | "wave+spec" | "wave";
type WaveStyle = "minmax" | "line";

export type MiniAnalyserAbletonProViewProps = {
  engine?: AbletonAnalyserEnginePro | null;
  attachTo?: AudioNode | null;
  className?: string;

  height?: number;
  waveRatio?: number;
  mode?: LayoutMode;
  specStyle?: SpecStyle;

  fftSize?: 256 | 512 | 1024 | 2048 | 4096 | 8192;
  smoothing?: number;
  minDb?: number;
  maxDb?: number;
  tiltDbPerOct?: number;
  calibrationDb?: number;
  stereoMode?: StereoMode;

  showRms?: boolean;
  showPeakLine?: boolean;
  showInfoText?: boolean;
  fps?: number;
  ignoreBelowHz?: number;
  showCutoffOverlay?: boolean;
  fillUnderLine?: boolean;

  octaveSmoothing?: number;
  lineOversample?: number;
  postSmoothPx?: number;

  spectrumGamma?: number;
  lineWidthPx?: number;
  lineGlow?: number;
  fillAlpha?: number;
  barsPeakWidth?: number;

  minHz?: number;
  maxHz?: number;

  waveStyle?: WaveStyle;
  waveGamma?: number;
  waveGain?: number;
  waveDcBlockHz?: number;
  waveRmsMs?: number;
  waveFill?: boolean;

  fontScale?: number;
  strokeScale?: number;
  gridStepPx?: number;
  paddingPx?: number;

  theme?: {
    bg?: string;
    grid?: string;
    text?: string;
    subtle?: string;
    wave?: string;
    rms?: string;
    specBar?: string;
    specPeak?: string;
    specLineL?: string;
    specLineR?: string;
    specLineMono?: string;
    specLineM?: string;
    specLineS?: string;
    fillMono?: string;
    fillL?: string;
    fillR?: string;
    fillM?: string;
    fillS?: string;
  };
};

/* ───────────────────────── Composant principal ───────────────────────── */

export function MiniAnalyserAbletonProView({
  engine: engineProp,
  attachTo,
  className,

  height = 320,
  waveRatio = 0.5,
  mode = "spectrum",
  specStyle = "line",

  fftSize = 8192,
  smoothing = 0.065,
  minDb = -90,
  maxDb = 0,
  tiltDbPerOct = -3.0,
  calibrationDb = -18,
  stereoMode: stereoModeProp = "mono",

  showRms = true,
  showPeakLine = true,
  showInfoText = true,
  fps = 60,
  ignoreBelowHz = 28,
  showCutoffOverlay = true,
  fillUnderLine = true,

  octaveSmoothing = 0.05,
  lineOversample = 1.25,
  postSmoothPx = 1.2,

  spectrumGamma = 0.75,
  lineWidthPx = 2,
  lineGlow = 8,
  fillAlpha = 0.12,
  barsPeakWidth = 2,

  minHz = 20,
  maxHz,

  // waveStyle actuellement non exploité (placeholder pour future évolution). Ignoré pour éviter lint error.
  waveStyle: _unusedWaveStyle = "minmax",
  waveGamma = 0.75,
  waveGain = 1.15,
  waveDcBlockHz = 20,
  waveRmsMs = 12,
  waveFill = true,

  fontScale,
  strokeScale,
  gridStepPx,
  paddingPx,

  theme = {
    bg: "rgba(10,10,10,0.9)",
    grid: "rgba(255,255,255,0.08)",
    text: "#cfcfcf",
    subtle: "rgba(255,255,255,0.06)",
    wave: "#22c55e",
    rms: "#f59e0b",
    specBar: "#86b7ff",
    specPeak: "#d1e3ff",
    specLineL: "#34d399",
    specLineR: "#60a5fa",
    specLineMono: "#60a5fa",
    specLineM: "#22c55e",
    specLineS: "#f472b6",
    fillMono: "rgba(96,165,250,0.12)",
    fillL: "rgba(52,211,153,0.10)",
    fillR: "rgba(96,165,250,0.10)",
    fillM: "rgba(34,197,94,0.10)",
    fillS: "rgba(244,114,182,0.10)",
  },
}: MiniAnalyserAbletonProViewProps) {
  // Marquer explicitement comme utilisé pour satisfaire le linter sans coût perf
  void _unusedWaveStyle;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const waveRef = React.useRef<HTMLCanvasElement | null>(null);
  const specRef = React.useRef<HTMLCanvasElement | null>(null);

  const [engine, setEngine] = React.useState<AbletonAnalyserEnginePro | null>(engineProp ?? null);
  const [stereoMode, setStereoMode] = React.useState<StereoMode>(stereoModeProp);
  const [freeze, setFreeze] = React.useState(false);
  const [uiScale, setUiScale] = React.useState(1);
  const [effectiveFps, setEffectiveFps] = React.useState(fps);

  // caches légers
  const specGlassCache = React.useRef<{ w: number; h: number; grad: CanvasGradient } | null>(null);
  const waveGlassCache = React.useRef<{ w: number; h: number; grad: CanvasGradient } | null>(null);
  const floatTmpRef = React.useRef<Float32Array | null>(null);
  const rmsTmpRef = React.useRef<Float32Array | null>(null);

  React.useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      const s = w >= 1100 ? 1.15 : w >= 820 ? 1.0 : w >= 620 ? 0.95 : w >= 460 ? 0.9 : 0.85;
      setUiScale(s);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Baisser la cadence quand le composant n'est pas visible à l'écran
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const io = new IntersectionObserver((entries) => {
      const vis = entries[0].isIntersecting;
      // 60/param fps quand visible, 20 fps hors écran (réduit CPU)
      setEffectiveFps(vis ? fps : Math.min(20, Math.max(10, Math.floor(fps / 3))));
    }, { root: null, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [fps]);

  // engine interne si attachTo
  React.useEffect(() => {
    if (engineProp) {
      setEngine(engineProp);
      return;
    }
    if (!attachTo) {
      setEngine(null);
      return;
    }
    const eng = new AbletonAnalyserEnginePro(attachTo, {
      fftSize,
      smoothing,
      minDb,
      maxDb,
      tiltDbPerOct,
      calibrationDb,
      ignoreBelowHz,
      stereoMode,
    });
    setEngine(eng);
    return () => eng.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineProp, attachTo]);

  // options dynamiques (live)
  React.useEffect(() => { engine?.updateOptions({ fftSize }); }, [engine, fftSize]);
  React.useEffect(() => { engine?.updateOptions({ smoothing }); }, [engine, smoothing]);
  React.useEffect(() => { engine?.updateOptions({ minDb, maxDb }); }, [engine, minDb, maxDb]);
  React.useEffect(() => { engine?.updateOptions({ tiltDbPerOct }); }, [engine, tiltDbPerOct]);
  React.useEffect(() => { engine?.updateOptions({ calibrationDb }); }, [engine, calibrationDb]);
  React.useEffect(() => { engine?.updateOptions({ stereoMode }); }, [engine, stereoMode]);
  React.useEffect(() => { engine?.updateOptions({ freeze }); }, [engine, freeze]);
  React.useEffect(() => { engine?.updateOptions({ ignoreBelowHz }); }, [engine, ignoreBelowHz]);

  // rendu
  React.useEffect(() => {
    if (!engine || !specRef.current) return;
    let stopped = false, lastTs = 0;
    const interval = 1000 / Math.max(1, effectiveFps);

    const waveCanvas = waveRef.current;
    const specCanvas = specRef.current;
  const waveCtx = waveCanvas ? setupCanvas2D(waveCanvas) : null;
  const specCtx = setupCanvas2D(specCanvas);

    // setup handled by shared util setupCanvas2D

    // Initial setup + resize observer
    if (waveCanvas) setupCanvas2D(waveCanvas);
    setupCanvas2D(specCanvas);
    const ro = new ResizeObserver(() => {
      if (waveCanvas) setupCanvas2D(waveCanvas);
      setupCanvas2D(specCanvas);
    });
    if (waveCanvas) ro.observe(waveCanvas);
    ro.observe(specCanvas);

    const paintGlass = (
      ctx: CanvasRenderingContext2D,
      w: number, h: number,
      cacheRef: React.MutableRefObject<{ w: number; h: number; grad: CanvasGradient } | null>
    ) => {
      ctx.fillStyle = theme.bg!;
      ctx.fillRect(0, 0, w, h);
      let cache = cacheRef.current;
      if (!cache || cache.w !== w || cache.h !== h) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "rgba(255,255,255,0.03)");
        g.addColorStop(0.6, "rgba(0,0,0,0.00)");
        g.addColorStop(1, "rgba(0,0,0,0.15)");
        cache = { w, h, grad: g };
        cacheRef.current = cache;
      }
      ctx.fillStyle = cache.grad;
      ctx.fillRect(0, 0, w, h);
    };

    const paintDotGrid = (ctx: CanvasRenderingContext2D, w: number, h: number, step: number) => {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = theme.grid!;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) ctx.fillRect(x, y, 1, 1);
      }
      ctx.restore();
    };

    const render = () => {
      if (stopped) return;
      const ts = performance.now();
      if (ts - lastTs < interval) return;
      lastTs = ts;

      const fs = fontScale ?? uiScale;
      const ss = strokeScale ?? uiScale;
      const pad = paddingPx ?? Math.round(8 * fs);

  // canvas size handled by ResizeObserver and initial setup

      // tailles internes (avec padding)
      const sW = specCanvas.clientWidth, sH = specCanvas.clientHeight;
      const sIx = pad, sIy = pad, sIw = sW - pad * 2, sIh = sH - pad * 2;

      const wW = waveCanvas?.clientWidth ?? 0, wH = waveCanvas?.clientHeight ?? 0;
      const wIx = pad, wIy = pad, wIw = Math.max(0, wW - pad * 2), wIh = Math.max(0, wH - pad * 2);

      // BG + grid
      if (waveCtx && (mode === "wave" || mode === "wave+spec")) {
        paintGlass(waveCtx, wW, wH, waveGlassCache);
        paintDotGrid(waveCtx, wW, wH, gridStepPx ?? Math.max(14, Math.floor(wW / 30)));
      }
      paintGlass(specCtx, sW, sH, specGlassCache);
      paintDotGrid(specCtx, sW, sH, gridStepPx ?? Math.max(14, Math.floor(sW / 30)));

      // frame
      const frame = engine.updateFrame();
      const nyquist = frame.nyquist;
      const bins = frame.bins;

      const minDbOpt = engine.getOptions().minDb;
      const maxDbOpt = engine.getOptions().maxDb;

      // mapping dB → pixels (respect padding) + knee visuel
      const yForDb = (db: number) => {
        const t0 = (db - minDbOpt) / (maxDbOpt - minDbOpt);
        const t = Math.max(0, Math.min(1, t0));
        const knee = 0.25; // compresse le bas
        const tk = t < 0.6 ? t + knee * (0.6 - t) * t : t;
        const g = Math.pow(tk, spectrumGamma); // contraste
        return sIy + (1 - g) * sIh;
      };

      const fMin = Math.max(20, minHz);
      const fMax = Math.min(nyquist, maxHz ?? nyquist);

      const xForFreq = (f: number) => {
        const r = (Math.log(f) - Math.log(fMin)) / (Math.log(fMax) - Math.log(fMin));
        return sIx + Math.max(0, Math.min(sIw, r * sIw));
      };
      const freqForX = (x: number) => {
        const r = (x - sIx) / Math.max(1, sIw);
        return Math.exp(Math.log(fMin) + r * (Math.log(fMax) - Math.log(fMin)));
      };
      const binForFreq = (f: number) => Math.max(0, Math.min(bins - 1, (f / nyquist) * (bins - 1)));

      // Grille dB
      specCtx.strokeStyle = theme.grid!;
      specCtx.lineWidth = Math.max(1, 1 * ss);
      [minDbOpt, -60, -30, -18, -12, -6, -3, 0]
        .filter((d) => d > minDbOpt && d < maxDbOpt)
        .forEach((d) => {
          const y = yForDb(d);
          specCtx.beginPath();
          specCtx.moveTo(sIx, y);
          specCtx.lineTo(sIx + sIw, y);
          specCtx.stroke();
        });

      // Repères de fréquence
      specCtx.fillStyle = theme.text!;
      specCtx.font = `${Math.round(11 * fs)}px ui-sans-serif, system-ui, -apple-system`;
      [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
        .filter((f) => f > fMin && f < fMax - 100)
        .forEach((f) => {
          const x = xForFreq(f);
          specCtx.strokeStyle = theme.grid!;
          specCtx.beginPath();
          specCtx.moveTo(x, sIy);
          specCtx.lineTo(x, sIy + sIh);
          specCtx.stroke();
          specCtx.fillText(f >= 1000 ? `${(f / 1000).toFixed(0)}k` : `${f}`, x + 4, sIy + Math.round(12 * fs));
        });

      // Cutoff overlay
      if (showCutoffOverlay && ignoreBelowHz > fMin) {
        const cutX = xForFreq(ignoreBelowHz);
        const g = specCtx.createLinearGradient(sIx, 0, cutX, 0);
        g.addColorStop(0, theme.subtle ?? "rgba(255,255,255,0.06)");
        g.addColorStop(1, "rgba(255,255,255,0.00)");
        specCtx.fillStyle = g;
        specCtx.fillRect(sIx, sIy, cutX - sIx, sIh);
        specCtx.strokeStyle = theme.grid!;
        specCtx.beginPath();
        specCtx.moveTo(cutX, sIy);
        specCtx.lineTo(cutX, sIy + sIh);
        specCtx.stroke();
        specCtx.fillStyle = theme.text!;
        specCtx.fillText(`${Math.round(ignoreBelowHz)} Hz`, cutX + 4, sIy + Math.round(12 * fs));
      }

      // Waveform
      if (waveCtx && (mode === "wave" || mode === "wave+spec") && wIw > 0 && wIh > 0) {
        const t8 = frame.timeL!;
        // cache/resize tmp
        if (!floatTmpRef.current || floatTmpRef.current.length !== t8.length) {
          floatTmpRef.current = new Float32Array(t8.length);
        }
        const tmp = floatTmpRef.current!;
        for (let i = 0; i < t8.length; i++) tmp[i] = (t8[i] - 128) / 128;

        if (waveDcBlockHz > 0) dcBlockInPlace(tmp, engine.getSampleRate(), waveDcBlockHz);
        for (let i = 0; i < tmp.length; i++) tmp[i] = shapeAmp(tmp[i], waveGamma, waveGain);

        const buckets = Math.max(1, Math.floor(wIw));
        const { min, max } = minMaxBuckets(tmp, buckets);

        // Fill doux
        if (waveFill) {
          const grad = waveCtx.createLinearGradient(0, wIy, 0, wIy + wIh);
          grad.addColorStop(0, withAlpha(theme.wave!, 0.00));
          grad.addColorStop(0.5, withAlpha(theme.wave!, 0.10));
          grad.addColorStop(1, withAlpha(theme.wave!, 0.00));
          waveCtx.fillStyle = grad;
          for (let x = 0; x < buckets; x++) {
            const vMin = min[x], vMax = max[x];
            const yLo = wIy + (1 - (vMin * 0.9 + 1) / 2) * wIh;
            const yHi = wIy + (1 - (vMax * 0.9 + 1) / 2) * wIh;
            const xPix = wIx + x;
            waveCtx.fillRect(xPix, Math.min(yLo, yHi), 1, Math.abs(yHi - yLo) || 1);
          }
        }

        // Bâtons min/max + glow
        waveCtx.save();
        waveCtx.strokeStyle = theme.wave!;
        waveCtx.lineWidth = Math.max(lineWidthPx * ss, 1.2);
        waveCtx.shadowColor = withAlpha(theme.wave!, 0.9);
        waveCtx.shadowBlur = Math.round(lineGlow * ss);

        waveCtx.beginPath();
        for (let x = 0; x < buckets; x++) {
          const vMin = min[x], vMax = max[x];
          const yLo = wIy + (1 - (vMin * 0.9 + 1) / 2) * wIh;
          const yHi = wIy + (1 - (vMax * 0.9 + 1) / 2) * wIh;
          const xPix = Math.round(wIx + x) + 0.5;
          waveCtx.moveTo(xPix, yLo);
          waveCtx.lineTo(xPix, yHi);
        }
        waveCtx.stroke();
        waveCtx.restore();

        // RMS overlay
        if (showRms && waveRmsMs > 0) {
          const win = Math.max(2, Math.round(engine.getSampleRate() * (waveRmsMs / 1000)));
          if (!rmsTmpRef.current || rmsTmpRef.current.length !== tmp.length) {
            rmsTmpRef.current = new Float32Array(tmp.length);
          }
          const rms = slidingRms(tmp, win); // (si vital, on peut réutiliser rmsTmpRef)
          waveCtx.strokeStyle = theme.rms!;
          waveCtx.setLineDash([4, 3]);
          waveCtx.lineWidth = Math.max(1 * ss, 1);
          waveCtx.beginPath();
          const step = rms.length / Math.max(1, wIw);
          for (let x = 0; x < wIw; x++) {
            const v = rms[Math.floor(x * step)];
            const y = wIy + (1 - (v * 0.9)) * wIh;
            if (x === 0) waveCtx.moveTo(wIx + x, y); else waveCtx.lineTo(wIx + x, y);
          }
          waveCtx.stroke();
          waveCtx.setLineDash([]);
        }

        // midline
        waveCtx.strokeStyle = theme.grid!;
        waveCtx.lineWidth = Math.max(1 * ss, 1);
        const midY = wIy + wIh / 2;
        waveCtx.beginPath();
        waveCtx.moveTo(wIx, midY);
        waveCtx.lineTo(wIx + wIw, midY);
        waveCtx.stroke();
      }

      // Spectrum
      const drawOneCurve = (
        avgSrc: Float32Array,
        peakSrc: Float32Array | undefined,
        lineColor: string,
        fillColor?: string
      ) => {
        const samples = Math.max(140, Math.floor(sIw * (lineOversample || 1)));
        const pts: { x: number; y: number }[] = new Array(samples);
        const oct = Math.max(0.04, Math.min(0.10, octaveSmoothing * (fftSize >= 8192 ? 1.3 : 1)));

        for (let i = 0; i < samples; i++) {
          const x = sIx + (i / (samples - 1)) * sIw;
          const f = freqForX(x);
          if (f < ignoreBelowHz) {
            pts[i] = { x, y: yForDb(minDbOpt) };
            continue;
          }
          // lissage log local (fenêtre proportionnelle à la fraction d’octave)
          const fLo = Math.max(20, f / Math.pow(2, oct));
          const fHi = Math.min(nyquist * 0.999, f * Math.pow(2, oct));
          const N = 9, mid = (N - 1) / 2;
          let acc = 0, wsum = 0;
          for (let k = 0; k < N; k++) {
            const r = k / (N - 1);
            const ff = fLo * Math.pow(fHi / fLo, r);
            const bj = Math.max(0, Math.min(bins - 1, (ff / nyquist) * (bins - 1)));
            const i0 = Math.floor(bj), i1 = Math.min(bins - 1, i0 + 1);
            const t = bj - i0;
            const v = avgSrc[i0] * (1 - t) + avgSrc[i1] * t;
            const z = (k - mid) / mid, sigma = 0.6;
            const ww = Math.exp(-0.5 * (z / sigma) ** 2);
            acc += v * ww; wsum += ww;
          }
          const db = acc / Math.max(1e-9, wsum);
          pts[i] = { x, y: yForDb(db) };
        }

        let smooth = catmullRom(pts, 0.5, 6);
        if (postSmoothPx && postSmoothPx > 0) smooth = postSmooth(smooth, postSmoothPx * ss);

        // fill
        if (fillUnderLine && fillColor) {
          const grad = specCtx.createLinearGradient(0, sIy, 0, sIy + sIh);
          grad.addColorStop(0, withAlpha(fillColor, fillAlpha));
          grad.addColorStop(1, withAlpha(fillColor, 0.0));
          specCtx.fillStyle = grad;
          specCtx.beginPath();
          specCtx.moveTo(sIx, sIy + sIh);
          for (let i = 0; i < smooth.length; i++) {
            const p = smooth[i];
            if (i === 0) specCtx.lineTo(p.x, p.y); else specCtx.lineTo(p.x, p.y);
          }
          specCtx.lineTo(sIx + sIw, sIy + sIh);
          specCtx.closePath();
          specCtx.fill();
        }

        // line + glow
        specCtx.save();
        specCtx.shadowColor = withAlpha(lineColor, 0.9);
        specCtx.shadowBlur = Math.round(lineGlow * ss);
        specCtx.strokeStyle = lineColor;
        specCtx.lineWidth = Math.max(lineWidthPx * ss, 1.5);
        specCtx.beginPath();
        for (let i = 0; i < smooth.length; i++) {
          const p = smooth[i];
          if (i === 0) specCtx.moveTo(p.x, p.y); else specCtx.lineTo(p.x, p.y);
        }
        specCtx.stroke();
        specCtx.restore();

        // peaks
        if (showPeakLine && peakSrc) {
          specCtx.fillStyle = theme.specPeak!;
          const beadW = Math.max(2, Math.round(barsPeakWidth * ss));
          for (let i = 0; i < 24; i++) {
            const x = sIx + (i / 23) * sIw;
            const f = freqForX(x);
            const bj = Math.max(0, Math.min(bins - 1, (f / nyquist) * (bins - 1)));
            const pkDb = Math.max(minDbOpt + 2, peakSrc[Math.round(bj)]); // remonte légèrement au-dessus du floor
            const yp = yForDb(pkDb);
            specCtx.fillRect(x - (beadW >> 1), yp - (beadW >> 1), beadW, beadW);
          }
        }
      };

      if (specStyle === "bars") {
        const barCount = Math.min(sIw, 160);
        const barW = Math.max(1, Math.floor(sIw / barCount));
        const m = engine.getOptions().stereoMode;
        if (m === "mono") {
          for (let bx = 0; bx < barCount; bx++) {
            const x0 = sIx + bx * barW;
            const xMid = x0 + barW * 0.5;
            const fMid = Math.max(ignoreBelowHz, freqForX(xMid));
            const bi = binForFreq(fMid);
            const db = frame.avgDbL![Math.round(bi)];
            const pk = frame.peakDbL![Math.round(bi)];
            const y = yForDb(db);
            const yp = yForDb(pk);
            specCtx.fillStyle = theme.specBar!;
            specCtx.fillRect(x0, y, barW - 1, sIy + sIh - y);
            specCtx.fillStyle = theme.specPeak!;
            specCtx.fillRect(x0, yp - 1, barW - 1, 2);
          }
        } else if (m === "LR") {
          for (let bx = 0; bx < barCount; bx++) {
            const x0 = sIx + bx * barW;
            const fMid = Math.max(ignoreBelowHz, freqForX(x0 + barW * 0.5));
            const bi = binForFreq(fMid);
            const yL = yForDb(frame.avgDbL![Math.round(bi)]);
            const yR = yForDb(frame.avgDbR![Math.round(bi)]);
            specCtx.fillStyle = theme.fillL!;
            specCtx.fillRect(x0, Math.min(yL, yR), barW - 1, sIy + sIh - Math.min(yL, yR));
            specCtx.fillStyle = theme.fillR!;
            specCtx.fillRect(x0, Math.min(yL, yR), barW - 1, Math.abs(yR - yL));
          }
        } else {
          for (let bx = 0; bx < barCount; bx++) {
            const x0 = sIx + bx * barW;
            const fMid = Math.max(ignoreBelowHz, freqForX(x0 + barW * 0.5));
            const bi = binForFreq(fMid);
            const yM = yForDb(frame.avgDbM![Math.round(bi)]);
            const yS = yForDb(frame.avgDbS![Math.round(bi)]);
            specCtx.fillStyle = theme.fillM!;
            specCtx.fillRect(x0, yM, barW - 1, sIy + sIh - yM);
            specCtx.fillStyle = theme.fillS!;
            specCtx.fillRect(x0, yS, barW - 1, 2);
          }
        }
      } else {
        const m = engine.getOptions().stereoMode;
        if (m === "mono") {
          drawOneCurve(frame.avgDbL!, frame.peakDbL!, theme.specLineMono!, theme.fillMono!);
        } else if (m === "LR") {
          drawOneCurve(frame.avgDbL!, frame.peakDbL!, theme.specLineL!, theme.fillL!);
          drawOneCurve(frame.avgDbR!, frame.peakDbR!, theme.specLineR!, theme.fillR!);
        } else {
          drawOneCurve(frame.avgDbM!, frame.peakDbM!, theme.specLineM!, theme.fillM!);
          drawOneCurve(frame.avgDbS!, frame.peakDbS!, theme.specLineS!, theme.fillS!);
        }
      }

      // footer meta
      if (showInfoText) {
        specCtx.fillStyle = theme.text!;
        specCtx.font = `${Math.round(12 * fs)}px ui-sans-serif, system-ui, -apple-system`;
        const opt = engine.getOptions();
        const meta = `${opt.stereoMode.toUpperCase()}  •  FFT ${opt.fftSize}  •  Smooth ${opt.smoothing.toFixed(
          2
        )}  •  Tilt ${opt.tiltDbPerOct} dB/oct  •  Cal ${opt.calibrationDb} dB`;
        specCtx.fillText(meta, sIx, sIy + sIh - Math.round(6 * fs));
      }

    };
    const unsubscribe = subscribe(render, effectiveFps);
    return () => { stopped = true; unsubscribe(); ro.disconnect(); };
  }, [
    engine, mode, specStyle, showRms, showPeakLine, showInfoText, effectiveFps, ignoreBelowHz, showCutoffOverlay,
    fillUnderLine, octaveSmoothing, lineOversample, postSmoothPx, minHz, maxHz, theme, stereoMode, freeze,
    fontScale, strokeScale, gridStepPx, paddingPx, uiScale, waveRatio, waveDcBlockHz, waveFill,
    waveRmsMs, waveGamma, waveGain, spectrumGamma, lineWidthPx, lineGlow, fillAlpha, barsPeakWidth, fftSize
  ]);

  // hauteurs split
  const rowH =
    mode === "wave+spec"
      ? [Math.max(72, Math.round(height * waveRatio - 3)), Math.max(90, Math.round(height * (1 - waveRatio) - 3))]
      : [height];

  /* ─────────────── UI / Toolbar ─────────────── */

  const StereoLegend = () => {
    const sm = engine?.getOptions().stereoMode ?? stereoMode;
    const chip = (color: string, label: string) => (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border"
        style={{ borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)" }}
      >
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
    );
    if (sm === "mono") return <div className="flex gap-2">{chip(theme.specLineMono!, "Mono")}</div>;
    if (sm === "LR")
      return (
        <div className="flex gap-2">
          {chip(theme.specLineL!, "L")}
          {chip(theme.specLineR!, "R")}
        </div>
      );
    return (
      <div className="flex gap-2">
        {chip(theme.specLineM!, "Mid")}
        {chip(theme.specLineS!, "Side")}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className={
        "rounded-2xl border border-neutral-800/70 bg-neutral-900/40 backdrop-blur " +
        "shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] p-3 space-y-2 " +
        (className ?? "")
      }
    >
      {/* TOP BAR */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="bg-neutral-800/70 text-neutral-200">
            <ActivityIcon className="h-3.5 w-3.5 mr-1" /> Spectrum
          </Badge>
          <StereoLegend />
        </div>
        <div className="flex items-center gap-2">
          <Toggle
            pressed={freeze}
            onPressedChange={(v) => setFreeze(!!v)}
            className="border bg-neutral-900/60 data-[state=on]:bg-neutral-800"
          >
            <Snowflake className="h-4 w-4 mr-1" /> Freeze
          </Toggle>
          <Button size="sm" variant="outline" className="h-8" onClick={() => engine?.resetPeaks()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8">
                <Waves className="h-4 w-4 mr-1" />
                {stereoMode.toUpperCase()} <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-32">
              {["mono", "LR", "MS"].map((m) => (
                <DropdownMenuItem key={m} onClick={() => setStereoMode(m as StereoMode)} className="text-xs">
                  {m.toUpperCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* CANVASES */}
      <div className={mode === "wave+spec" ? "grid grid-rows-2 gap-2" : ""} style={{ height }}>
        {(mode === "wave" || mode === "wave+spec") && (
          <canvas
            ref={waveRef}
            className="w-full h-full rounded-lg border border-neutral-800/60 bg-neutral-950/50"
            style={{ height: mode === "wave+spec" ? rowH[0] : rowH[0] }}
          />
        )}
        {(mode === "spectrum" || mode === "wave+spec") && (
          <canvas
            ref={specRef}
            className="w-full h-full rounded-lg border border-neutral-800/60 bg-neutral-950/50"
            style={{ height: mode === "wave+spec" ? rowH[1] : rowH[0] }}
          />
        )}
      </div>
    </div>
  );
}

export default React.memo(MiniAnalyserAbletonProView);
