// Hook: useDrawScheduler
// Batches multiple draw invalidations into a single rAF callback.
import { useCallback, useEffect, useRef } from "react";

export function useDrawScheduler(drawFnRef: React.RefObject<(() => void) | null>) {
  const rafRef = useRef<number | null>(null);

  const invalidate = useCallback(() => {
    if (rafRef.current != null) return; // Already scheduled
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawFnRef.current?.();
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