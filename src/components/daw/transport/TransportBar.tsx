"use client";

import { memo, useEffect, useRef } from "react";
import { getGlobalRaf } from "@/lib/audio/core/global-raf";
import { TransportScheduler } from "@/lib/audio/core/transport-scheduler";
import { AudioEngine } from "@/lib/audio/core/audio-engine";
import { useTransportStore } from "@/lib/stores/transport.store";

// TransportBar: lightweight textual display of bar:beat:tick
// Updates throttled to <=10Hz via internal time gating; uses global rAF.

const UPDATE_INTERVAL_MS = 100; // 10 Hz

const TransportBarComponent = () => {
  const lastUpdateRef = useRef<number>(0);
  const textRef = useRef<HTMLSpanElement>(null);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const cpuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isPlaying) return;
    const scheduler = TransportScheduler.ensure();
    const unsubRaf = getGlobalRaf().subscribe((t) => {
      // Throttle updates
      if (t - lastUpdateRef.current < UPDATE_INTERVAL_MS) return;
      lastUpdateRef.current = t;
  const pos = scheduler.getPosition();
      if (textRef.current) {
        textRef.current.textContent = `${pos.bar}:${pos.beat}:${pos.tick}`;
      }
      if (cpuRef.current) {
        // Simple metric: active AudioNodes count approximation (not exact API) + sampleRate
        const ctx = AudioEngine.ensure().context;
        if (ctx) {
          cpuRef.current.textContent = `${ctx.sampleRate / 1000}kHz`;
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
      <span className="text-[11px] font-mono text-neutral-500" ref={cpuRef} aria-label="Audio metrics">--</span>
    </div>
  );
};

export const TransportBar = memo(TransportBarComponent);
