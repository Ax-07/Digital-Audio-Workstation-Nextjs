"use client";

import { memo, useEffect, useRef, useCallback } from "react";
import { useProjectStore } from "@/features/daw/state/project.store";
import { MixerCore } from "@/core/audio-engine/core/mixer/mixer";
import { DBFS_TRACK_TICKS, dbToLin, initPeakHold, linToDb, rmsColor, updatePeakHold } from "@/core/audio-engine/core/meter-utils";
import { getGlobalRaf } from "@/core/audio-engine/core/global-raf";

type Props = {
  target: "A" | "B";
  compact?: boolean;
};

const ReturnStripComponent = ({ target, compact = false }: Props) => {
  const mixer = MixerCore.ensure();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakHold = useRef(initPeakHold());
  const raf = getGlobalRaf();
  const returns = useProjectStore((s) => s.project.returns);
  const updateReturn = useProjectStore((s) => s.updateReturn);
  const current = returns?.find((r) => r.id === target || (r.name ?? "").toUpperCase() === target);
  const gainDb = current?.gainDb ?? -6;
  const pan = current?.pan ?? 0;
  const fxObj = (current?.fx && !Array.isArray(current.fx) ? current.fx : undefined) as
    | { reverb?: boolean; delay?: boolean; delayTime?: number; reverbDecay?: number; reverbDuration?: number }
    | undefined;
  const reverbOn = !!fxObj?.reverb;
  const delayOn = !!fxObj?.delay;
  const delayTime = fxObj?.delayTime ?? 0.25;
  const reverbDecay = fxObj?.reverbDecay ?? 0.5;
  const reverbDuration = fxObj?.reverbDuration ?? 1.2;
  // Ensure default return entry exists
  useEffect(() => {
    if (!current) updateReturn(target, { gainDb: -6, pan: 0 });
  }, [current, target, updateReturn]);

  // Controls callbacks
  const onGain: React.ChangeEventHandler<HTMLInputElement> = useCallback((e) => {
    const v = Number(e.target.value);
    updateReturn(target, { gainDb: v });
  }, [target, updateReturn]);
  const onPan: React.ChangeEventHandler<HTMLInputElement> = useCallback((e) => {
    const v = Number(e.target.value);
    updateReturn(target, { pan: v });
  }, [target, updateReturn]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    canvas.width = 10;
    canvas.height = 60;
    const ticks = DBFS_TRACK_TICKS; // reuse track ticks
    let last = 0;
    const interval = 1000 / 30;
  let lastLabel = "";
  let lastLabelAt = 0;
  const unsub = raf.subscribe((t) => {
      if (t - last < interval) return;
      last = t;
      const { peak, rms } = mixer.readReturnMeter(target);
      const peakHoldLin = updatePeakHold(peakHold.current, Math.min(1, Math.max(0, peak)), t);
      const rmsLin = Math.min(1, Math.max(0, rms));
      const h = canvas.height;
      const w = canvas.width;
      ctx.clearRect(0, 0, w, h);
      const rmsPx = Math.floor(rmsLin * h);
      const peakPx = Math.floor(peakHoldLin * h);
      ctx.fillStyle = rmsColor(rmsLin);
      ctx.fillRect(0, h - rmsPx, w, rmsPx);
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0, h - peakPx + 0.5);
      ctx.lineTo(w, h - peakPx + 0.5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      for (const db of ticks) {
        const y = h - Math.floor(dbToLin(db) * h) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Numeric dBFS readout, throttled to ≤10 Hz when not compact
      if (!compact) {
        if (t - lastLabelAt > 100) {
          const dbRms = linToDb(rmsLin);
          const dbPeak = linToDb(peakHoldLin);
          lastLabel = `${dbRms === -Infinity ? "-inf" : dbRms.toFixed(1)} / ${dbPeak === -Infinity ? "-inf" : dbPeak.toFixed(1)} dB`;
          lastLabelAt = t;
        }
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(lastLabel, 2, h - 2);
      }
      ctx.strokeStyle = "#444";
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    });
    return () => unsub();
  }, [mixer, raf, target, compact]);

  return (
    <div className="flex w-32 flex-col gap-2 rounded-sm border border-neutral-700 bg-neutral-800 p-2 text-[11px] text-neutral-300">
      <div className="flex items-center justify-between">
        <span className="uppercase tracking-widest text-neutral-400">Return {target}</span>
        <canvas ref={canvasRef} className={`h-[60px] ${compact ? "w-2.5" : "w-8"} rounded-sm bg-neutral-900`} />
      </div>
      <div className="flex items-center gap-2">
        <span className="opacity-70">FX</span>
        <button
          onClick={() => updateReturn(target, { fx: { ...fxObj, reverb: !reverbOn } })}
          className={`${reverbOn ? "bg-[#FFD02F] text-black" : "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"} rounded-sm px-2 py-0.5`}
        >
          Reverb
        </button>
        <button
          onClick={() => updateReturn(target, { fx: { ...fxObj, delay: !delayOn } })}
          className={`${delayOn ? "bg-[#FFD02F] text-black" : "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"} rounded-sm px-2 py-0.5`}
        >
          Delay
        </button>
        <button
          onClick={() => updateReturn(target, { fx: { ...fxObj, reverb: false, delay: false } })}
          className="rounded-sm bg-neutral-700 px-2 py-0.5 text-neutral-200 hover:bg-neutral-600"
        >
          Bypass
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2">
          <span className="opacity-70">Delay Time</span>
          <input
            type="number"
            value={delayTime}
            min={0}
            max={1.0}
            step={0.01}
            onChange={(e) => updateReturn(target, { fx: { ...fxObj, delayTime: Number(e.target.value) } })}
            className="w-20 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-neutral-100"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="opacity-70">Reverb Decay</span>
          <input
            type="number"
            value={reverbDecay}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(e) => updateReturn(target, { fx: { ...fxObj, reverbDecay: Number(e.target.value) } })}
            className="w-20 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-neutral-100"
          />
        </label>
        <label className="flex items-center justify-between gap-2">
          <span className="opacity-70">Reverb Len</span>
          <input
            type="number"
            value={reverbDuration}
            min={0.1}
            max={5}
            step={0.1}
            onChange={(e) => updateReturn(target, { fx: { ...fxObj, reverbDuration: Number(e.target.value) } })}
            className="w-20 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-neutral-100"
          />
        </label>
      </div>
      <label className="flex items-center justify-between">
        <span>Gain dB</span>
        <input
          type="number"
          value={gainDb}
          min={-60}
          max={6}
          step={1}
          onChange={onGain}
          className="w-16 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-neutral-100"
        />
      </label>
      <label className="flex items-center justify-between">
        <span>Pan</span>
        <input
          type="number"
          value={pan}
          min={-1}
          max={1}
          step={0.1}
          onChange={onPan}
          className="w-16 rounded-sm border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-right text-neutral-100"
        />
      </label>
    </div>
  );
};

export const ReturnStrip = memo(ReturnStripComponent);
