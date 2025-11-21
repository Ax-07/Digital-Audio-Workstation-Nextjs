import { useEffect } from "react";
import { PerfMonitor } from "@/lib/perf/perf-monitor";
import { getGlobalRaf } from "@/lib/audio/core/global-raf";

/**
 * useOverlayTicker
 * - Lance une boucle rAF pour redessiner uniquement l'overlay (playhead, offsets)
 * - S'active quand `active` est vrai
 * - Cadence optionnelle via fps (par défaut 60)
 */
export function useOverlayTicker(active: boolean, drawOverlay: () => void, fps: number = 60) {
  useEffect(() => {
    if (!active) return;
    const raf = getGlobalRaf();
    const pm = PerfMonitor();
    let prev = performance.now();
    const interval = 1000 / Math.max(1, fps);
    let acc = 0;
    const unsub = raf.subscribe((t) => {
      const dt = t - prev;
      prev = t;
      if (pm.isEnabled()) {
        pm.recordDuration("pianoroll.overlay.tick", dt);
        if (dt > interval * 1.5) pm.recordDuration("pianoroll.overlay.long", dt);
      }
      acc += dt;
      if (acc >= interval) {
        acc %= interval;
        const t0 = pm.isEnabled() ? performance.now() : 0;
        drawOverlay();
        if (pm.isEnabled()) pm.recordDuration("pianoroll.overlay.tick.draw", performance.now() - t0);
      }
    });
    return () => {
      unsub();
    };
  }, [active, drawOverlay, fps]);
}
