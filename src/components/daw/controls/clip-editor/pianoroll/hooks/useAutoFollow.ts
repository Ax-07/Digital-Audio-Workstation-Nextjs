// src/components/daw/controls/clip-editor/pianoroll/hooks/useAutoFollow.ts

import { useEffect, useRef } from "react";

export function useAutoFollow(
  active: boolean,
  followPlayhead: boolean,
  getPlayheadBeat: (() => number | null) | undefined,
  timeToX: (beat: number) => number,
  keyWidth: number,
  totalPxX: number,
  scrollX: number,
  setScrollX: (value: number | ((prev: number) => number)) => void,
  draw: () => void,
  wrapRef: React.RefObject<HTMLDivElement | null>
) {
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || !followPlayhead || !getPlayheadBeat) {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const loop = () => {
      const playheadBeat = getPlayheadBeat();
      if (typeof playheadBeat === "number") {
        const wrap = wrapRef.current;
        if (wrap) {
          const px = timeToX(playheadBeat) - keyWidth;
          const margin = 24;
          const viewW = wrap.clientWidth;

          if (viewW > 0) {
            if (px > viewW - margin) {
              const target = Math.min(
                totalPxX - viewW,
                scrollX + (px - (viewW - margin)),
              );
              if (!Number.isNaN(target) && Number.isFinite(target)) {
                setScrollX(Math.max(0, target));
              }
            } else if (px < margin) {
              const target = Math.max(0, scrollX + (px - margin));
              if (!Number.isNaN(target) && Number.isFinite(target)) {
                setScrollX(Math.max(0, target));
              }
            }
          }
        }
        draw();
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [
    active,
    followPlayhead,
    getPlayheadBeat,
    timeToX,
    keyWidth,
    totalPxX,
    scrollX,
    setScrollX,
    draw,
    wrapRef,
  ]);
}
