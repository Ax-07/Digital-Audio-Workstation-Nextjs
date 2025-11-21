// Hook: useDrawScheduler
// Batches multiple draw invalidations into a single rAF callback.
import { useCallback, useEffect, useRef } from "react";
import { PerfMonitor } from "@/lib/perf/perf-monitor";

export function useDrawScheduler(drawFnRef: React.RefObject<(() => void) | null>) {
  const rafRef = useRef<number | null>(null);

  const invalidate = useCallback(() => {
    if (rafRef.current != null) return; // Already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const pm = PerfMonitor();
      const t0 = pm.isEnabled() ? performance.now() : 0;
      drawFnRef.current?.();
      if (pm.isEnabled()) pm.recordDuration("pianoroll.draw", performance.now() - t0);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return invalidate;
}