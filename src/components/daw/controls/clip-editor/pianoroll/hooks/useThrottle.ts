// src/components/daw/controls/clip-editor/pianoroll/hooks/useThrottle.ts

import { useCallback, useEffect, useRef } from "react";

// Overloads to support value-less callbacks
export function useThrottle(callback: () => void, delay: number, active: boolean): () => void;
export function useThrottle<T>(
  callback: (value: T) => void,
  delay: number,
  active: boolean
): (value: T) => void;

export function useThrottle<T>(
  callback: ((value: T) => void) | (() => void),
  delay: number,
  active: boolean
) {
  const throttleRef = useRef<number | null>(null);
  const pendingRef = useRef<boolean>(false);
  const lastValueRef = useRef<T | undefined>(undefined);

  const throttled = useCallback(
    (value?: unknown) => {
      if (!active) return;

      lastValueRef.current = value as T | undefined;

      if (throttleRef.current != null) {
        pendingRef.current = true;
        return;
      }

      if (callback.length === 0) {
        (callback as () => void)();
      } else {
        (callback as (v: T) => void)(lastValueRef.current as T);
      }
      pendingRef.current = false;

      throttleRef.current = window.setTimeout(() => {
        throttleRef.current = null;
        if (pendingRef.current) {
          pendingRef.current = false;
          if (callback.length === 0) {
            (callback as () => void)();
          } else {
            (callback as (v: T) => void)(lastValueRef.current as T);
          }
        }
      }, delay);
    },
    [callback, delay, active]
  );

  useEffect(() => {
    return () => {
      if (throttleRef.current != null) {
        window.clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, []);

  return throttled as unknown as ((value: T) => void) & (() => void);
}
