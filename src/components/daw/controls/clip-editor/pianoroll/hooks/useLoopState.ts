// Hook: useLoopState
// Manages local loop state with a ref plus throttled emission to parent.
// Ensures stable object identity and avoids undefined propagation.
import { useState, useRef, useEffect, useCallback } from "react";
import { useThrottle } from "./useThrottle";

export function useLoopState(
  initial: { start: number; end: number } | null | undefined,
  onLoopChange: ((loop: { start: number; end: number } | null) => void) | undefined,
  active: boolean,
  throttleMs: number = 80
) {
  const [loopState, setLoopState] = useState<{ start: number; end: number } | null>(initial ?? null);
  const loopStateRef = useRef<{ start: number; end: number } | null>(initial ?? null);

  const emitLoopChangeThrottled = useThrottle(() => {
    if (!onLoopChange) return;
    onLoopChange(loopStateRef.current ? { ...loopStateRef.current } : null);
  }, throttleMs, active);

  // External initial updates
  useEffect(() => {
    loopStateRef.current = initial ?? null;
    setLoopState(initial ?? null);
    emitLoopChangeThrottled();
  }, [initial, emitLoopChangeThrottled]);

  const updateLoop = useCallback((next: { start: number; end: number } | null) => {
    loopStateRef.current = next;
    setLoopState(next);
  }, []);

  return {
    loopState,
    setLoopState: updateLoop,
    loopStateRef,
    emitLoopChangeThrottled,
  } as const;
}