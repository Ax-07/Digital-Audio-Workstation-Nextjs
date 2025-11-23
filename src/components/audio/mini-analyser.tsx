"use client";
import React, { useEffect, useRef, useState, memo } from "react";
import { drumMachine } from "@/lib/audio/drum-machine/drum-machine";
import { Button } from "../ui/button";
// Harmonisation: utilise le global RAF plutôt que raf-scheduler local
import { getGlobalRaf } from "@/lib/audio/core/global-raf";

type SpecStyle = "line" | "bars";

type Props = {
  trackId: string;
  className?: string;
  height?: number;
  fps?: number;
  // FFT / lissage
  fftSize?: 256 | 512 | 1024 | 2048 | 4096 | 8192;
  smoothing?: number; // 0..1 (analyser smoothing)
  avg?: boolean; // EMA sur la courbe
  avgAmount?: number; // 0..1 (0=lent, 1=aucun) ex 0.6
  // Échelle
  minDb?: number; // ex -90
  maxDb?: number; // ex -10
  ignoreBelowHz?: number; // NEW: bins < f seront “mutés” à minDb (ex: 30)
  showCutoffOverlay?: boolean; // NEW: ombre à gauche de cette freq
  tiltDbPerOct?: number; // ex -4.5 (Ableton Tilt)
  showPeak?: boolean;
  specStyle?: SpecStyle;
  theme?: {
    bg?: string;
    grid?: string;
    text?: string;
    line?: string;
    fill?: string;
    bar?: string;
    peak?: string;
    cursor?: string;
  };
};

export function MiniAnalyser({
  trackId,
  className,
  height = 180,
  fps = 60,
  // Réduction défaut: 512 (piste) pour limiter coût FFT & mémoire
  fftSize = 512,
  smoothing = 0.6,
  avg = true,
  avgAmount = 0.6,
  minDb = -90,
  maxDb = -10,
  ignoreBelowHz = 30,
  showCutoffOverlay = true,
  tiltDbPerOct = -4.5,
  showPeak = true,
  specStyle = "line",
  theme = {
    bg: "#0b0b0b",
    grid: "#222",
    text: "#a3a3a3",
    line: "#5fb3ff",
    fill: "rgba(95,179,255,0.10)",
    bar: "#60a5fa",
    peak: "#93c5fd",
    cursor: "#ffffff",
  },
}: Props) {
  const specRef = useRef<HTMLCanvasElement | null>(null);
  const resizeObs = useRef<ResizeObserver | null>(null);
  const [ready, setReady] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [localShowPeak, setLocalShowPeak] = useState(showPeak);
  const [localAvg, setLocalAvg] = useState(avg);
  const [style, setStyle] = useState<SpecStyle>(specStyle);
  const hoverRef = useRef<{ x: number; y: number } | null>(null);
  const frozenRef = useRef<boolean>(false);
  const lastHoverUpdate = useRef(0);

  // helpers freq/notes
  const noteFromFreq = (f: number) => {
    const A4 = 440;
    const n = Math.round(12 * Math.log2(f / A4)); // semitone offset
    const names = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
    const idx = (n + 9) % 12; // A=0 -> C=3 etc.
    const midi = 69 + n;
    const oct = Math.floor(midi / 12) - 1;
    return `${names[idx]}${oct}`;
  };

  useEffect(() => {
    let stopped = false;
    let unsubscribe: (() => void) | null = null;
    let analyser: AnalyserNode | null = null;
    let audioCtx: AudioContext | null = null;
    let floatFreq: Float32Array | null = null;
    let peaks: Float32Array | null = null;
    let ema: Float32Array | null = null;

    const cleanupResize = () => {
      resizeObs.current?.disconnect();
      resizeObs.current = null;
    };

    const setupCanvas = (canvas: HTMLCanvasElement) => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    };

    const run = async () => {
      await drumMachine.ensure();
      analyser = drumMachine.getTrackAnalyser(trackId) ?? null;
      audioCtx = drumMachine.getAudioContext?.() ?? null;
      const specCanvas = specRef.current;
      if (!specCanvas || !analyser) return;

      try {
        // Clamp piste: 128..1024 (master géré ailleurs)
        analyser.fftSize = Math.min(1024, Math.max(128, fftSize));
      } catch {}
      try {
        analyser.smoothingTimeConstant = smoothing;
      } catch {}
      try {
        analyser.minDecibels = minDb;
        analyser.maxDecibels = maxDb;
      } catch {}

      setupCanvas(specCanvas);
      resizeObs.current = new ResizeObserver(() => {
        setupCanvas(specCanvas);
      });
      resizeObs.current.observe(specCanvas);

      floatFreq = new Float32Array(analyser.frequencyBinCount);
      peaks = new Float32Array(analyser.frequencyBinCount);
      peaks.fill(-Infinity);
      ema = new Float32Array(analyser.frequencyBinCount);
      ema.fill(-Infinity);
      setReady(true);

      // mapping helpers
      const nyquist = (audioCtx?.sampleRate ?? 48000) / 2;
      const freqForX = (x: number, w: number) => {
        const fMin = 20,
          fMax = nyquist;
        const r = x / Math.max(1, w);
        return fMin * Math.pow(fMax / fMin, r);
      };
      const xForFreq = (f: number, w: number) => {
        const fMin = 20,
          fMax = nyquist;
        const r = Math.log(f / fMin) / Math.log(fMax / fMin);
        return r * w;
      };

      const yForDb = (db: number, h: number) => {
        const clamped = Math.max(minDb, Math.min(maxDb, db));
        const r = (clamped - minDb) / (maxDb - minDb); // 0..1
        return h - r * h;
      };

      // courbe smooth (Catmull–Rom -> Bezier)
      function drawSmooth(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>) {
        if (pts.length < 2) return;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[Math.max(0, i - 1)],
            p1 = pts[i],
            p2 = pts[i + 1],
            p3 = pts[Math.min(pts.length - 1, i + 2)];
          const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
          const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
          const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
          const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
          if (i === 0) ctx.moveTo(p1[0], p1[1]);
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
        }
      }

      // helper: rounded rect path (caps arrondis pour barres)
      function drawRoundedRectPath(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number
      ) {
        r = Math.max(0, Math.min(r, Math.min(w / 2, h / 2)));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
      }

      // grille Ableton-like
      const freqTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter((f) => f < nyquist - 100);
      const dbTicks: number[] = [];
      for (let d = maxDb; d >= minDb; d -= 10) dbTicks.push(d);

      // état peak hold
      let lastPeakT = performance.now();
      const peakFallDbPerSec = 12;

      const interval = 1000 / Math.max(1, fps);
      let lastFrameTs = 0;

      const render = (ts: number) => {
        if (stopped) return;
        if (ts - lastFrameTs < interval) return; // FPS cap
        lastFrameTs = ts;

        // canvas / style
        const w = specCanvas.clientWidth,
          h = specCanvas.clientHeight;
        const ctx = specCanvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = theme.bg!;
        ctx.fillRect(0, 0, w, h);

        // grid freq verticales
        ctx.strokeStyle = theme.grid!;
        ctx.lineWidth = 1;
        freqTicks.forEach((f) => {
          const x = xForFreq(f, w);
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
          ctx.fillStyle = theme.text!;
          ctx.font = "10px ui-sans-serif, system-ui, -apple-system";
          ctx.fillText(f >= 1000 ? `${(f / 1000).toFixed(0)}k` : `${f}`, x + 3, 12);
        });
        // grid dB horizontales
        dbTicks.forEach((d) => {
          const y = yForDb(d, h);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.fillStyle = theme.text!;
          ctx.fillText(`${d} dB`, 4, Math.max(10, y - 2));
        });

        // overlay cutoff (before drawing bars/line)
        if (showCutoffOverlay && ignoreBelowHz > 20) {
          const cutX = xForFreq(ignoreBelowHz, w);
          const g = ctx.createLinearGradient(0, 0, cutX, 0);
          g.addColorStop(0, "rgba(255,255,255,0.06)");
          g.addColorStop(1, "rgba(255,255,255,0.00)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, cutX, h);
          ctx.strokeStyle = "#555";
          ctx.beginPath();
          ctx.moveTo(cutX, 0);
          ctx.lineTo(cutX, h);
          ctx.stroke();
          ctx.fillStyle = "#aaa";
          ctx.font = "10px ui-sans-serif, system-ui";
          ctx.fillText(`${Math.round(ignoreBelowHz)} Hz`, cutX + 4, 12);
        }

        // data
        if (!frozenRef.current && floatFreq) {
          // Lecture directe sans allocation (réduction GC). Cast explicite pour TS (DOM lib demande ArrayBuffer).
          analyser!.getFloatFrequencyData(floatFreq as unknown as Float32Array<ArrayBuffer>);
        }
        const now = performance.now();
        const dt = Math.max(0, (now - lastPeakT) / 1000);
        lastPeakT = now;
        const fall = peakFallDbPerSec * dt;

        // Pre-pass: tilt / avg / peaks for every bin (needed by both bars and line modes)
        const bins = floatFreq!.length;
        for (let i = 0; i < bins; i++) {
          const f = (i / (bins - 1)) * nyquist;
          // tilt compensation: add tilt*(octaves from 1k)
          const ref = 1000;
          const oct = Math.log2(Math.max(1e-6, f / ref));
          let db = floatFreq![i];
          if (Number.isFinite(oct)) db += tiltDbPerOct * oct; // tilt
          // avg (EMA sur dB)
          if (localAvg) {
            if (ema![i] === -Infinity) ema![i] = db;
            else ema![i] = (1 - avgAmount) * ema![i] + avgAmount * db;
            db = ema![i];
          }
          // NEW: mute bins below ignoreBelowHz for peaks calculation
          const valForPeak = f < ignoreBelowHz ? minDb : db;
          // peak hold
          if (localShowPeak) {
            peaks![i] = Math.max(peaks![i] - fall, valForPeak);
          }
          // store back possibly averaged value into ema (already done) - no need to store y here
        }

        const pts: Array<[number, number]> = [];

        if (style === "bars") {
          // barres log-groupées
          const groups = Math.min(w, 140);
          const barW = Math.max(1, Math.floor(w / groups));
          for (let g = 0; g < groups; g++) {
            const x0 = g * barW;
            const fMid = 20 * Math.pow(nyquist / 20, (x0 + barW * 0.5) / w);
            const bi = Math.max(0, Math.min(bins - 1, Math.round((fMid / nyquist) * (bins - 1))));
            let db = floatFreq![bi];
            const oct = Math.log2(Math.max(1e-6, ((bi / (bins - 1)) * nyquist) / 1000));
            db += tiltDbPerOct * oct;
            if (localAvg) {
              if (ema![bi] === -Infinity) ema![bi] = db;
              else ema![bi] = (1 - avgAmount) * ema![bi] + avgAmount * db;
              db = ema![bi];
            }
            // NEW: mute below cutoff
            if (fMid < ignoreBelowHz) db = minDb;
            const y = yForDb(db, h);
            // draw a rounded "pill" bar instead of a sharp rectangle
            const drawW = Math.max(1, barW - 1);
            const radius = Math.min(6, drawW / 2);
            ctx.fillStyle = theme.bar!;
            drawRoundedRectPath(ctx, x0, y, drawW, h - y, radius);
            ctx.fill();
            if (localShowPeak) {
              const ph = yForDb(peaks![bi], h);
              ctx.fillStyle = theme.peak!;
              // draw peak as a small rounded pill or circle centered on the bar top
              const px = x0 + drawW / 2;
              const pr = Math.max(1, Math.min(6, drawW / 2));
              ctx.beginPath();
              ctx.arc(px, ph, pr, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        } else {
          // ligne lissée + fill gradient
          const grad = ctx.createLinearGradient(0, 0, 0, h);
          grad.addColorStop(0, theme.fill!);
          grad.addColorStop(1, "rgba(0,0,0,0)");

          // build points on log axis
          const linePoints = Math.min(Math.max(64, Math.floor(w)), 300);
          for (let i = 0; i < linePoints; i++) {
            const f = 20 * Math.pow(nyquist / 20, i / (linePoints - 1));
            const bi = Math.max(0, Math.min(bins - 1, Math.round((f / nyquist) * (bins - 1))));
            let db = floatFreq![bi];
            const oct = Math.log2(Math.max(1e-6, f / 1000));
            if (Number.isFinite(oct)) db += tiltDbPerOct * oct;
            if (localAvg && Number.isFinite(ema![bi])) db = ema![bi];
            if (f < ignoreBelowHz) db = minDb;
            const x = xForFreq(f, w);
            const y = yForDb(db, h);
            pts.push([x, y]);
          }

          // fill
          ctx.beginPath();
          if (pts.length) {
            ctx.moveTo(pts[0][0], h);
            drawSmooth(ctx, pts);
            ctx.lineTo(pts.at(-1)![0], h);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
          }
          // line
          ctx.beginPath();
          drawSmooth(ctx, pts);
          ctx.lineWidth = 2;
          ctx.strokeStyle = theme.line!;
          ctx.stroke();

          // peak overlay (points discrets)
          if (localShowPeak) {
            ctx.fillStyle = theme.peak!;
            const marks = 24;
            for (let i = 0; i < marks; i++) {
              const x = (i / (marks - 1)) * w;
              const f = 20 * Math.pow(nyquist / 20, i / (marks - 1));
              const bi = Math.max(0, Math.min(bins - 1, Math.round((f / nyquist) * (bins - 1))));
              const y = yForDb(peaks![bi], h);
              ctx.fillRect(x, y - 1, 2, 2);
            }
          }
        }

        // cursor / tooltip
        const hoverLoc = hoverRef.current;
        if (hoverLoc) {
          const mx = hoverLoc.x;
          // crosshair
          ctx.strokeStyle = theme.cursor!;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(mx, 0);
          ctx.lineTo(mx, h);
          ctx.stroke();
          ctx.setLineDash([]);
          const f = freqForX(mx, w);
          const bi = Math.max(0, Math.min(bins - 1, Math.round((f / nyquist) * (bins - 1))));
          let db = floatFreq![bi];
          const oct = Math.log2(Math.max(1e-6, f / 1000));
          db += tiltDbPerOct * oct;
          if (localAvg && Number.isFinite(ema![bi])) db = ema![bi];
          // NEW: mute below cutoff
          if (f < ignoreBelowHz) db = minDb;
          const y = yForDb(db, h);
          // marker
          ctx.fillStyle = theme.cursor!;
          ctx.beginPath();
          ctx.arc(mx, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          // label
          const note = noteFromFreq(Math.max(20, f));
          const label = `${f < 1000 ? f.toFixed(1) + " Hz" : (f / 1000).toFixed(2) + " kHz"}  ${note}   ${db.toFixed(
            1
          )} dB`;
          const pad = 6;
          const tw = ctx.measureText(label).width + pad * 2;
          const th = 16;
          const bx = Math.min(w - tw - 4, mx + 8),
            by = Math.max(4, y - th - 8);
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(bx, by, tw, th);
          ctx.fillStyle = "#fff";
          ctx.font = "11px ui-sans-serif, system-ui, -apple-system";
          ctx.fillText(label, bx + pad, by + th - 4);
        }
      };

      const raf = getGlobalRaf();
      unsubscribe = raf.subscribe(render);
    };

    run();
    return () => {
      stopped = true;
      if (unsubscribe) unsubscribe();
      cleanupResize();
    };
  }, [
    trackId,
    fps,
    fftSize,
    smoothing,
    minDb,
    maxDb,
    tiltDbPerOct,
    avgAmount,
    localAvg,
    localShowPeak,
    style,
    showCutoffOverlay,
    ignoreBelowHz,
    theme.fill,
    theme.line,
    theme.bar,
    theme.bg,
    theme.cursor,
    theme.grid,
    theme.peak,
    theme.text,
  ]);

  return (
    <div className={"rounded border border-neutral-800 bg-neutral-950/80 p-2 select-none " + (className ?? "")}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-neutral-400">Spectrum {ready ? "" : "(init…)"}</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setFrozen((f) => !f)}>
            {frozen ? "Unfreeze" : "Freeze"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLocalAvg((a) => !a)}>
            Avg: {localAvg ? "On" : "Off"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLocalShowPeak((p) => !p)}>
            Peaks: {localShowPeak ? "On" : "Off"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStyle((s) => (s === "line" ? "bars" : "line"))}>
            {style === "line" ? "Bars" : "Line"}
          </Button>
        </div>
      </div>

      <div
        className="relative"
        style={{ height }}
        onMouseMove={(e) => {
          const now = performance.now();
          if (now - lastHoverUpdate.current < 16) return; // max 60 Hz
          lastHoverUpdate.current = now;
          const rect = (specRef.current as HTMLCanvasElement).getBoundingClientRect();
          hoverRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }}
        onMouseLeave={() => {
          hoverRef.current = null;
        }}
      >
        <canvas ref={specRef} className="w-full h-full rounded-sm" />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-neutral-400">
        <div>FFT: {fftSize}</div>
        <div>
          Range: {minDb}..{maxDb} dB
        </div>
        <div>Tilt: {tiltDbPerOct} dB/oct</div>
      </div>
    </div>
  );
}

// Mémo pour éviter rerenders inutiles quand parent change (spectre interne géré via rAF global)
export default memo(MiniAnalyser);
