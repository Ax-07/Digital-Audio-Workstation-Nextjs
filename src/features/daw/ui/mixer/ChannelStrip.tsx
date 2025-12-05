"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useMixerStore } from "@/features/daw/state/mixer.store";
import { useProjectStore } from "@/features/daw/state/project.store";
import { useUiStore } from "@/features/daw/state/ui.store";
import { PerfMonitor } from "@/devtools/perf/perf-monitor";
import { getGlobalRaf } from "@/core/audio-engine/core/global-raf";
import { DBFS_TRACK_TICKS, dbToLin, initPeakHold, rmsColor, updatePeakHold } from "@/core/audio-engine/core/meter-utils";
import { MixerCore } from "@/core/audio-engine/core/mixer/mixer";
import { Slider } from "@/shared/ui/slider";

type Props = {
  id: string;
};

const ChannelStripComponent = ({ id }: Props) => {
  // Subscribe only to the specific track to avoid re-render on unrelated track updates
  const track = useMixerStore((s) => s.tracks.find((t) => t.id === id));
  const setGain = useMixerStore((s) => s.setTrackGainDb);
  const setPan = useMixerStore((s) => s.setTrackPan);
  const toggleMute = useMixerStore((s) => s.toggleTrackMute);
  const toggleSolo = useMixerStore((s) => s.toggleTrackSolo);
  const setSendA = useMixerStore((s) => s.setTrackSendA);
  const setSendB = useMixerStore((s) => s.setTrackSendB);
  const removeTrack = useProjectStore((s) => s.removeTrack);

  // Compact controls (no direct number inputs)
  const onMute = useCallback(() => toggleMute(id), [id, toggleMute]);
  const onSolo = useCallback(() => toggleSolo(id), [id, toggleSolo]);

  // Per-track VU (30 Hz) canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const raf = getGlobalRaf();
  const peakHold = useRef(initPeakHold());
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    // Fixed size to avoid resizing in loop
    canvas.width = 10;
    canvas.height = 60;
    // Use shared dB ticks
    const ticks = DBFS_TRACK_TICKS;
    let last = 0;
    const interval = 1000 / 30; // 30 Hz
    const pm = PerfMonitor();
    const unsub = raf.subscribe((t) => {
      if (t - last < interval) return;
      last = t;
      const t0 = pm.isEnabled() ? performance.now() : 0;
      const { peak, rms } = MixerCore.ensure().readTrackMeter(id);
      if (pm.isEnabled()) pm.recordDuration("track.read", performance.now() - t0);
      const peakHoldLin = updatePeakHold(peakHold.current, Math.min(1, Math.max(0, peak)), t);
      const h = canvas.height;
      const w = canvas.width;
      // Clear
      const d0 = pm.isEnabled() ? performance.now() : 0;
      ctx.clearRect(0, 0, w, h);
      const rmsLin = Math.min(1, Math.max(0, rms));
      const rmsPx = Math.floor(rmsLin * h);
      const peakPx = Math.floor(peakHoldLin * h);
      // RMS bar
      ctx.fillStyle = rmsColor(rmsLin);
      ctx.fillRect(0, h - rmsPx, w, rmsPx);
      // Peak line (horizontal)
      ctx.strokeStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(0, h - peakPx + 0.5);
      ctx.lineTo(w, h - peakPx + 0.5);
      ctx.stroke();
      // dB ticks as horizontal grid lines
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      for (const db of ticks) {
        const y = h - Math.floor(dbToLin(db) * h) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Border
      ctx.strokeStyle = "#444";
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
      if (pm.isEnabled()) pm.recordDuration("track.draw", performance.now() - d0);
    });
    return () => unsub();
  }, [id, raf]);

  const select = useUiStore((s) => s.setSelectedTrack);
  const selectedId = useUiStore((s) => s.selectedTrackId);

  if (!track) return null;
  return (
    <div
      className={`flex w-[92px] min-w-[92px] cursor-default flex-col gap-2 rounded-sm border border-neutral-700 bg-neutral-800 p-2 ${selectedId === id ? "border-[#FFD02F]" : ""}`}
      onClick={() => select(id)}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="truncate text-[10px] uppercase tracking-widest text-neutral-300" title={track.name}>{track.name}</div>
        <button
          onClick={() => removeTrack(id)}
          className="rounded px-1 py-0.5 text-[10px] text-rose-400 hover:bg-rose-500/10"
          title="Remove track"
          aria-label="Remove track"
        >
          ✕
        </button>
      </div>

      {/* Mute / Solo / Meter */}
      <div className="flex items-center gap-1">
        <button
          onClick={onMute}
          className={`size-6 rounded-sm px-1 text-[10px] ${track.mute ? "bg-[#FFD02F] text-black" : "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"}`}
          aria-pressed={track.mute}
          aria-label="Mute"
        >
          M
        </button>
        <button
          onClick={onSolo}
          className={`size-6 rounded-sm px-1 text-[10px] ${track.solo ? "bg-[#FFD02F] text-black" : "bg-neutral-700 text-neutral-200 hover:bg-neutral-600"}`}
          aria-pressed={track.solo}
          aria-label="Solo"
        >
          S
        </button>
        <canvas ref={canvasRef} className="ml-auto h-[60px] w-2.5 rounded-sm bg-neutral-900" />
      </div>

      {/* Sliders */}
      <div className="mt-1 flex items-end justify-between gap-1">
        <div className="flex flex-col items-center">
          <Slider orientation="vertical" min={-60} max={6} step={1} value={[track.gainDb]} onValueChange={([v]) => setGain(id, v)}/>
          <div className="mt-1 text-[9px] text-neutral-400">GAIN</div>
        </div>
        <div className="flex flex-col items-center">
          <Slider orientation="vertical" min={0} max={1} step={0.01} value={[track.sendA ?? 0]} onValueChange={([v]) => setSendA(id, v)} />
          <div className="mt-1 text-[9px] text-neutral-400">A</div>
        </div>
        <div className="flex flex-col items-center">
          <Slider orientation="vertical" min={0} max={1} step={0.01} value={[track.sendB ?? 0]} onValueChange={([v]) => setSendB(id, v)} />
          <div className="mt-1 text-[9px] text-neutral-400">B</div>
        </div>
      </div>

      {/* Pan */}
      <div className="mt-1">
        <Slider min={-1} max={1} step={0.01} value={[track.pan]} onValueChange={([v]) => setPan(id, v)} />
        <div className="mt-0.5 text-center text-[9px] text-neutral-400">PAN</div>
      </div>
    </div>
  );
};

export const ChannelStrip = memo(ChannelStripComponent);
