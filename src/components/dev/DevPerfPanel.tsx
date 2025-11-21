"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PerfMonitor } from "@/lib/perf/perf-monitor";

// Lightweight dev-only panel. Render only if NEXT_PUBLIC_PERF_MONITOR=1.
// Displays top average durations and transport jitter.
export function DevPerfPanel() {
  const pm = PerfMonitor();
  const [snap, setSnap] = useState(pm.getSnapshot());
  const [mounted, setMounted] = useState(false);

  // Ensure we don't render anything during hydration; mount then portal to body
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pm.isEnabled()) return;
    let alive = true;
    const interval = setInterval(() => {
      if (!alive) return;
      setSnap(pm.getSnapshot());
    }, 1000);
    return () => { alive = false; clearInterval(interval); };
  }, [pm]);

  if (!mounted || !pm.isEnabled()) return null;

  const node = (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-2 right-2 z-50 w-100 rounded border border-neutral-700 bg-neutral-900/90 p-3 text-[11px] font-mono text-neutral-300 shadow-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="uppercase tracking-widest text-neutral-400">Perf</span>
        <span className="text-neutral-500">jitter: {snap.transportJitterAvg.toFixed(2)}ms</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {snap.samples.slice(0, 12).map((s) => (
          <div key={s.key} className="flex justify-between py-0.5">
            <span className="truncate pr-2 text-neutral-400">{s.key}</span>
            <span className="text-neutral-200">{s.avgMs.toFixed(2)}ms</span>
            <span className="text-neutral-500">×{s.count}</span>
            <span className="text-neutral-500">max {s.maxMs.toFixed(1)}</span>
          </div>
        ))}
        {snap.samples.length === 0 && <div className="text-neutral-600">No samples yet…</div>}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
