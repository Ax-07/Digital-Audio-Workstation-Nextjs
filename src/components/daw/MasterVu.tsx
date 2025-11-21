"use client";

import { memo, useEffect, useRef, useMemo } from "react";
import { useMasterBus } from "@/lib/audio/core/master-bus";
import { getGlobalRaf } from "@/lib/audio/core/global-raf";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import {
  DBFS_MASTER_TICKS,
  dbToLin,
  linToDb,
  rmsColor,
  initPeakHold,
  updatePeakHold,
} from "@/lib/audio/core/meter-utils";
import { PerfMonitor } from "@/lib/perf/perf-monitor";

type Props = {
  width?: number;
  height?: number;
  compact?: boolean; // hide textual readout & ticks
};

const MasterVuComponent = ({ width = 160, height = 24, compact = false }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const monitor = useMasterBus();
  const peakHold = useRef(initPeakHold());
  const ticks = useMemo(() => DBFS_MASTER_TICKS, []);
  const lufsLabel = useRef<{ last: string; at: number }>({ last: "", at: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true } as const);
    if (!ctx) return;

    // No gradient; color derived from RMS using rmsColor
    // Throttle draw to ~30Hz (avoid full 60Hz render load)
    const interval = 1000 / 30;
    let last = 0;
    const pm = PerfMonitor();
    const unsub = getGlobalRaf().subscribe((t) => {
      if (t - last < interval) return;
      last = t;
      // Lazy init analyser as soon as engine is ready
      const engine = AudioEngine.ensure();
      if (engine.initialized) monitor.init();
      // Read master levels if analyser exists
      const t0 = pm.isEnabled() ? performance.now() : 0;
      const level = monitor.read();
      if (pm.isEnabled()) pm.recordDuration("master.read", performance.now() - t0);
      const linRms = Math.min(1, level.rms);
      const linPeak = Math.min(1, level.peak);
      const now = performance.now();
      const linPeakHold = updatePeakHold(peakHold.current, linPeak, now);
      const dbRms = linToDb(linRms);
      const dbPeak = linToDb(linPeakHold);

      // K-weighted LUFS (coarse) computed ≤10 Hz
      const nowMs = performance.now();
      if (nowMs - lufsLabel.current.at > 100) {
        const lufs = monitor.readKWeightedLufs();
        lufsLabel.current.last = `${Number.isFinite(lufs) ? lufs.toFixed(1) : "-inf"} LUFS`;
        lufsLabel.current.at = nowMs;
      }

      // Draw bar
      const d0 = pm.isEnabled() ? performance.now() : 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barColor = rmsColor(linRms);
      ctx.fillStyle = barColor;
      ctx.fillRect(0, 0, Math.floor(canvas.width * linRms), canvas.height);
      // Peak hold line
      ctx.strokeStyle = "#ffffff";
      const peakX = Math.floor(canvas.width * linPeakHold) + 0.5;
      ctx.beginPath();
      ctx.moveTo(peakX, 0);
      ctx.lineTo(peakX, canvas.height);
      ctx.stroke();

      if (!compact) {
        // dB scale overlay (ticks)
        ctx.font = "10px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        for (const db of ticks) {
          const lin = dbToLin(db);
          const x = Math.floor(canvas.width * lin) + 0.5;
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
          if (db % 12 === 0) {
            ctx.fillText(`${db}`, x, 2);
          }
        }
      }

      if (!compact) {
        // Text readout (RMS / PeakHold dBFS)
        const label = `${dbRms === -Infinity ? "-inf" : dbRms.toFixed(1)} / ${
          dbPeak === -Infinity ? "-inf" : dbPeak.toFixed(1)
        } dBFS  •  ${lufsLabel.current.last}`;
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, canvas.width - 4, canvas.height - 2);
      }

      // Border
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
      if (pm.isEnabled()) pm.recordDuration("master.draw", performance.now() - d0);
    });

    return () => {
      unsub();
    };
  }, [monitor, compact, ticks]);

  return (
    <div className="flex items-center gap-2">
      <canvas ref={canvasRef} width={width} height={height} className="rounded bg-zinc-800" />
    </div>
  );
};

export const MasterVu = memo(MasterVuComponent);
