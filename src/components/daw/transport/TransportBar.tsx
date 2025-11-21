"use client";

import { memo, useEffect, useRef } from "react";
import { getGlobalRaf } from "@/lib/audio/core/global-raf";
import { TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { useTransportStore } from "@/lib/stores/transport.store";
import { PerfMonitor } from "@/lib/perf/perf-monitor";

// TransportBar: lightweight textual display of bar:beat:tick
// Updates throttled to <=10Hz via internal time gating; uses global rAF.

const UPDATE_INTERVAL_MS = 100; // 10 Hz

const TransportBarComponent = () => {
  const lastUpdateRef = useRef<number>(0);
  const textRef = useRef<HTMLSpanElement>(null);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const cpuRef = useRef<HTMLSpanElement>(null);
  const lastTextRef = useRef<string>("1:1:0");
  const lastCpuRef = useRef<string>("--");
  const lastCpuAtRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying) return;
    const scheduler = TransportScheduler.ensure();
    const pm = PerfMonitor();
    const unsubRaf = getGlobalRaf().subscribe((t) => {
      // Throttle updates to 10Hz for text; CPU label to 2Hz
      if (t - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
      const tickDt = t - lastUpdateRef.current;
      lastUpdateRef.current = t;
      if (pm.isEnabled()) pm.recordDuration("transportbar.tick", tickDt);

      const pos = scheduler.getPosition();
      const txt = `${pos.bar}:${pos.beat}:${pos.tick}`;
      if (textRef.current && txt !== lastTextRef.current) {
        const t0 = pm.isEnabled() ? performance.now() : 0;
        textRef.current.textContent = txt;
        if (pm.isEnabled()) pm.recordDuration("transportbar.update", performance.now() - t0);
        lastTextRef.current = txt;
      }

      if (cpuRef.current && t - lastCpuAtRef.current >= 500) {
        lastCpuAtRef.current = t;
        const ctx = AudioEngine.ensure().context;
        if (ctx) {
          const cpuTxt = `${ctx.sampleRate / 1000}kHz`;
          if (cpuTxt !== lastCpuRef.current) {
            cpuRef.current.textContent = cpuTxt;
            lastCpuRef.current = cpuTxt;
          }
        }
      }
    });
    return () => {
      unsubRaf();
    };
  }, [isPlaying]);

  return (
    <div className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="font-mono tabular-nums" ref={textRef} aria-label="Transport position">
        1:1:0
      </span>
      <span className="text-[11px] font-mono text-neutral-500" ref={cpuRef} aria-label="Audio metrics">
        --
      </span>
    </div>
  );
};

export const TransportBar = memo(TransportBarComponent);
