// Hook: useDrawScheduler
// Batches multiple draw invalidations into a single rAF callback.
import { useCallback, useEffect, useRef } from "react";
import { PerfMonitor } from "@/devtools/perf/perf-monitor";
import { getGlobalRaf } from "@/core/audio-engine/core/global-raf";

export function useDrawScheduler(drawFnRef: React.RefObject<(() => void) | null>) {
  // Flag indiquant qu'un draw est demandé pour le prochain frame global
  const pendingRef = useRef(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const invalidate = useCallback(() => {
    pendingRef.current = true; // sera consommé au prochain tick global
  }, []);

  useEffect(() => {
    const raf = getGlobalRaf();
    unsubRef.current = raf.subscribe(() => {
      if (!pendingRef.current) return;
      pendingRef.current = false;
      const pm = PerfMonitor();
      const t0 = pm.isEnabled() ? performance.now() : 0;
      drawFnRef.current?.();
      if (pm.isEnabled()) pm.recordDuration("pianoroll.draw", performance.now() - t0);
    });
    return () => {
      if (unsubRef.current) unsubRef.current();
      unsubRef.current = null;
    };
  }, [drawFnRef]);

  return invalidate;
}